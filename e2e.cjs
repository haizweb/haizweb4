// End-to-end smoke test (Playwright + SwiftShader): scrolls through the real page, drags the watch in the
// finale and reports console errors. Usage: NODE_PATH=<global node_modules> node tools/e2e.cjs <outDir> [W H]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [outDir, W = '1280', H = '720'] = process.argv.slice(2);
const root = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, u.endsWith('/') ? u + 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404).end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => logs.push('[requestfailed] ' + r.url()));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await page.waitForTimeout(3500); // intro animation
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log('scrollable height', total, 'px =', (total / +H).toFixed(1), 'viewports');
  const shots = [0, 0.1, 0.3, 0.45, 0.7, 0.85, 1.0];
  for (const p of shots) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(p * total));
    await page.waitForTimeout(p === 0 ? 300 : 4500);
    const got = await page.evaluate(() => window.__dbg.scroll.value);
    await page.screenshot({ path: path.join(outDir, `e2e_${p}.png`) });
    console.log('p target', p, 'value', got.toFixed(3));
  }
  // finale: drag the watch
  await page.mouse.move(+W / 2, +H / 2);
  await page.waitForTimeout(800);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) { await page.mouse.move(+W / 2 + i * 22, +H / 2 + i * 3); await page.waitForTimeout(120); }
  const yaw = await page.evaluate(() => window.__dbg.input.yaw);
  await page.screenshot({ path: path.join(outDir, 'e2e_drag.png') });
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log('drag yaw', yaw.toFixed(2));
  // frame pacing (software GL, only a rough number)
  const ft = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 20) requestAnimationFrame(f); else res((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
  console.log('avg frame ms (software GL)', ft.toFixed(1));
  console.log(logs.length ? logs.slice(0, 30).join('\n') : 'no console errors / warnings');
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
