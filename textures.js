import * as THREE from 'three';
import { SPEC } from './spec.js';
import { rng, TAU } from '../core/math.js';

// All textures of the watch are generated procedurally on <canvas> at start-up —
// no external image assets are needed.

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

function toTexture(canvas, { srgb = false, repeat = false, maxAniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

/** height canvas (grayscale) -> tangent-space normal map canvas */
function heightToNormal(src, strength = 2, wrap = true) {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mk(w, h);
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  const H = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = x < 0 ? 0 : x >= w ? w - 1 : x;
      y = y < 0 ? 0 : y >= h ? h - 1 : y;
    }
    return sd[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const nx = -dx;
      const ny = dy; // canvas y points down, v points up
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      od.data[i] = (nx / l * 0.5 + 0.5) * 255;
      od.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      od.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      od.data[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ brushed steel */
export function makeBrushed(size = 1024) {
  const r = rng(11);
  const h = mk(size, size);
  const g = h.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  // long horizontal micro-scratches
  for (let i = 0; i < 5200; i++) {
    const y = r() * size;
    const len = 80 + r() * 700;
    const x = r() * size;
    const v = r() > 0.5 ? 255 : 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.11})`;
    g.lineWidth = 0.6 + r() * 1.3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (r() - 0.5) * 2);
    g.stroke();
    if (x + len > size) {
      g.beginPath();
      g.moveTo(x - size, y);
      g.lineTo(x + len - size, y + (r() - 0.5) * 2);
      g.stroke();
    }
  }
  const normal = heightToNormal(h, 1.6);
  // roughness variation follows the same scratches (G channel is used by three.js)
  const rough = mk(size, size);
  const rg = rough.getContext('2d');
  rg.drawImage(h, 0, 0);
  rg.globalCompositeOperation = 'source-over';
  rg.fillStyle = 'rgba(128,128,128,0.35)';
  rg.fillRect(0, 0, size, size);
  return {
    normal: toTexture(normal, { repeat: true }),
    rough: toTexture(rough, { repeat: true }),
  };
}

/* ------------------------------------------------------------------ dial */
export function makeDial(fontFamily = 'Montserrat') {
  const S = 2048;
  const K = S / (2 * SPEC.dialR); // pixels per unit
  const c = mk(S, S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const px = (x) => cx + x * K;
  const py = (y) => cx - y * K;
  const r = rng(7);

  // base
  g.fillStyle = '#212429';
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  rg.addColorStop(0, 'rgba(255,255,255,0.20)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  rg.addColorStop(1, 'rgba(0,0,0,0.40)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);

  // sunburst (radial brushing)
  for (let i = 0; i < 2600; i++) {
    const a = (i / 2600) * TAU + r() * 0.002;
    const light = r() > 0.46;
    g.strokeStyle = light ? `rgba(255,255,255,${0.025 + r() * 0.085})` : `rgba(0,0,0,${0.05 + r() * 0.12})`;
    g.lineWidth = 0.7 + r() * 1.7;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 24, cx + Math.sin(a) * 24);
    g.lineTo(cx + Math.cos(a) * S * 0.74, cx + Math.sin(a) * S * 0.74);
    g.stroke();
  }
  // soft baked rays (the PBR anisotropy adds the live, view-dependent part)
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0.35, cx, cx);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      cg.addColorStop(t, i % 2 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.08)');
    }
    g.fillStyle = cg;
    g.fillRect(0, 0, S, S);
  }

  // minute track: fine radial ticks
  const tin = SPEC.trackIn;
  const tout = SPEC.trackOut;
  g.strokeStyle = 'rgba(214,218,224,0.55)';
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * TAU;
    const major = i % 4 === 0;
    const r0 = major ? tin - 0.012 : tin + 0.012;
    g.lineWidth = major ? 3.2 : 1.4;
    g.strokeStyle = major ? 'rgba(230,233,238,0.85)' : 'rgba(214,218,224,0.5)';
    g.beginPath();
    g.moveTo(px(Math.cos(a) * r0), py(Math.sin(a) * r0));
    g.lineTo(px(Math.cos(a) * tout), py(Math.sin(a) * tout));
    g.stroke();
  }
  g.strokeStyle = 'rgba(230,233,238,0.55)';
  g.lineWidth = 2;
  for (const rr of [tin - 0.012, tout]) {
    g.beginPath();
    g.arc(cx, cx, rr * K, 0, TAU);
    g.stroke();
  }

  // grooves around the windows
  g.strokeStyle = 'rgba(255,255,255,0.20)';
  g.lineWidth = 2;
  for (const w of [SPEC.moon, SPEC.heart]) {
    g.beginPath();
    g.arc(px(w.x), py(w.y), (w.r + 0.045) * K, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(px(w.x), py(w.y), (w.r + 0.058) * K, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.20)';
  }

  // printing
  const text = (str, x, y, size, weight, alpha, spacing) => {
    g.save();
    g.font = `${weight} ${size * K}px ${fontFamily}, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = `rgba(236,238,242,${alpha})`;
    if ('letterSpacing' in g) g.letterSpacing = `${spacing * K}px`;
    g.fillText(str, px(x), py(y));
    g.restore();
  };
  text('FS', 0, 0.628, 0.062, 500, 0.95, 0.012);
  text('AUTOMATIC', 0, -0.628, 0.026, 500, 0.8, 0.008);
  text('50R', -0.5, 0.02, 0.026, 500, 0.7, 0.006);

  const map = toTexture(c, { srgb: true });

  // anisotropy direction field: tangential to the radial brushing
  const AS = 1024;
  const ac = mk(AS, AS);
  const actx = ac.getContext('2d');
  const id = actx.createImageData(AS, AS);
  for (let y = 0; y < AS; y++) {
    for (let x = 0; x < AS; x++) {
      const dx = x - AS / 2 + 0.5;
      const dy = AS / 2 - y - 0.5;
      const phi = Math.atan2(dy, dx) + Math.PI / 2;
      const i = (y * AS + x) * 4;
      id.data[i] = (Math.cos(phi) * 0.5 + 0.5) * 255;
      id.data[i + 1] = (Math.sin(phi) * 0.5 + 0.5) * 255;
      id.data[i + 2] = 255;
      id.data[i + 3] = 255;
    }
  }
  actx.putImageData(id, 0, 0);
  const aniso = toTexture(ac);
  aniso.wrapS = aniso.wrapT = THREE.ClampToEdgeWrapping;
  return { map, aniso };
}

/* ------------------------------------------------------------------ movement textures */
export function makePerlage(size = 1024) {
  const r = rng(5);
  const h = mk(size, size);
  const g = h.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighten';
  const step = 20;
  for (let row = 0; row * step * 0.82 < size + step; row++) {
    for (let col = -1; col * step < size + step; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0) + (r() - 0.5) * 2;
      const y = row * step * 0.82 + (r() - 0.5) * 2;
      const rad = step * 0.62;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.6, '#9a9a9a');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
  }
  return toTexture(heightToNormal(h, 2.4), { repeat: true });
}

export function makeStripes(size = 512) {
  const h = mk(size, size);
  const g = h.getContext('2d');
  const id = g.createImageData(size, size);
  const stripes = 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = Math.sin((x / size) * stripes * TAU);
      const v = 0.5 + 0.5 * s;
      const i = (y * size + x) * 4;
      const c = v * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = c;
      id.data[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return toTexture(heightToNormal(h, 3.2), { repeat: true });
}

/** text running around a ring: u = angle, v = radial coordinate */
export function makeRingText(fontFamily = 'Montserrat', text = 'FS CALIBRE 146  ·  AUTOMATIC  ·  28 800 VPH  ·  26 JEWELS  ·  ') {
  const W = 4096;
  const H = 256;
  const c = mk(W, H);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#d9dbde');
  grad.addColorStop(1, '#f1f2f4');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(40,44,52,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 30);
  g.lineTo(W, 30);
  g.moveTo(0, H - 30);
  g.lineTo(W, H - 30);
  g.stroke();
  g.fillStyle = 'rgba(30,33,40,0.92)';
  g.font = `600 92px ${fontFamily}, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  if ('letterSpacing' in g) g.letterSpacing = '8px';
  const one = g.measureText(text).width;
  const reps = Math.max(1, Math.round(W / one));
  const scale = W / (one * reps);
  g.save();
  g.scale(scale, 1);
  for (let i = 0; i < reps; i++) g.fillText(text, i * one, H / 2 + 4);
  g.restore();
  return toTexture(c, { srgb: true });
}

/* ------------------------------------------------------------------ small dial parts */
export function makeMoonDisc(size = 512) {
  const c = mk(size, size);
  const g = c.getContext('2d');
  const r = rng(3);
  const R = size / 2;
  const grad = g.createRadialGradient(R, R, 0, R, R, R);
  grad.addColorStop(0, '#0c0f18');
  grad.addColorStop(1, '#05060a');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // faint stars
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.35})`;
    g.beginPath();
    g.arc(r() * size, r() * size, 0.7 + r() * 1.3, 0, TAU);
    g.fill();
  }
  // two crescent moons on opposite sides of the disc (top and bottom)
  for (const dir of [1, -1]) {
    const mx = R;
    const my = R - dir * R * 0.36;
    const rad = R * 0.3;
    const mg = g.createRadialGradient(mx - rad * 0.3, my - dir * rad * 0.3, rad * 0.1, mx, my, rad);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(1, '#e4e6ea');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(mx, my, rad, 0, TAU);
    g.fill();
    // bite out a crescent with a near-black disc that sits lower-right
    g.fillStyle = '#07090e';
    g.beginPath();
    g.arc(mx + rad * 0.34, my + dir * rad * 0.42, rad * 0.9, 0, TAU);
    g.fill();
    // soft rim light on the outer edge
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx, my, rad - 1, Math.PI * 0.62 * (dir > 0 ? 1 : -1) - Math.PI * 0.5 - 0.6, Math.PI * 0.62 * (dir > 0 ? 1 : -1) - Math.PI * 0.5 + 0.6);
    g.stroke();
  }
  return toTexture(c, { srgb: true });
}
export function makeDateCard(fontFamily = 'Montserrat', day = new Date().getDate()) {
  const W = 256;
  const H = 180;
  const c = mk(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f1';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#16181c';
  g.font = `500 128px ${fontFamily}, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(day), W / 2, H / 2 + 6);
  return toTexture(c, { srgb: true });
}

/** crisp engraved bezel pattern (tiny scallops) used as a normal map for the case ring */
export function makeBezelGroove(size = 1024) {
  const h = mk(size, 64);
  const g = h.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, 64);
  const n = 120;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * size;
    const gr = g.createLinearGradient(x, 0, x + size / n, 0);
    gr.addColorStop(0, '#9c9c9c');
    gr.addColorStop(0.5, '#4a4a4a');
    gr.addColorStop(1, '#9c9c9c');
    g.fillStyle = gr;
    g.fillRect(x, 0, size / n, 64);
  }
  return toTexture(heightToNormal(h, 1.1), { repeat: true });
}
