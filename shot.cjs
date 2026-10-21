// Headless screenshot helper (Playwright + SwiftShader WebGL), used for visual QA only.
//   NODE_PATH=<global node_modules> node tools/shot.cjs <outDir> <width> <height> <p1,p2,...> [extraQuery]
// Starts the static server in-process, opens the page with ?p=<progress>&still=1 for each
// progress value and writes <outDir>/p_<value>.png
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [outDir, W, H, plist, extra = ''] = process.argv.slice(2);
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
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (m.type() !== 'debug') logs.push(`[${m.type()}] ${t}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => logs.push('[requestfailed] ' + r.url()));
  for (const p of plist.split(',')) {
    const url = `http://localhost:${port}/index.html?p=${p}&still=1${extra ? '&' + extra : ''}`;
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
    } catch (e) {
      logs.push('[timeout] __ready not set for p=' + p);
    }
    await page.waitForTimeout(400);
    const file = path.join(outDir, `p_${p}.png`);
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
  if (logs.length) console.log(logs.slice(0, 40).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
