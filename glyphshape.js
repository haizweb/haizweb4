import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLYPHS } from './glyphs.js';

// Turns the digit outlines (SVG path data exported from Montserrat by tools/make-glyphs.py)
// into extruded 3D geometry. Dimensions are normalised so that the cap height is 1.

const CAP = 700;

function tokenize(d) {
  const out = [];
  const re = /([MLHVQZ])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let m;
  while ((m = re.exec(d))) out.push(m[1] ? m[1].toUpperCase() : parseFloat(m[2]));
  return out;
}

function contoursFromPath(d, steps = 9) {
  const t = tokenize(d);
  const contours = [];
  let i = 0;
  let cmd = '';
  let cur = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => t[i++];
  const push = (px, py) => cur.push(new THREE.Vector2(px, py));
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++];
    if (cmd === 'M') {
      x = sx = num();
      y = sy = num();
      cur = [];
      contours.push(cur);
      push(x, y);
      cmd = 'L';
    } else if (cmd === 'L') {
      x = num();
      y = num();
      push(x, y);
    } else if (cmd === 'H') {
      x = num();
      push(x, y);
    } else if (cmd === 'V') {
      y = num();
      push(x, y);
    } else if (cmd === 'Q') {
      const cx = num();
      const cy = num();
      const ex = num();
      const ey = num();
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const c = u * u;
        push(a * x + b * cx + c * ex, a * y + b * cy + c * ey);
      }
      x = ex;
      y = ey;
    } else if (cmd === 'Z') {
      x = sx;
      y = sy;
    } else {
      i++;
    }
  }
  return contours
    .map((c) => {
      if (c.length > 2 && c[0].distanceTo(c[c.length - 1]) < 1e-6) c.pop();
      return c;
    })
    .filter((c) => c.length >= 3);
}

const area = (pts) => {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

const inside = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

function shapesFromContours(contours, ox, scale) {
  const info = contours.map((c) => ({
    pts: c.map((p) => new THREE.Vector2((p.x + ox) * scale, p.y * scale)),
  }));
  info.forEach((c) => (c.area = area(c.pts)));
  const big = info.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const sign = Math.sign(big.area);
  const outers = info.filter((c) => Math.sign(c.area) === sign).map((c) => ({ shape: new THREE.Shape(c.pts), pts: c.pts }));
  info
    .filter((c) => Math.sign(c.area) !== sign)
    .forEach((h) => {
      const host = outers.find((o) => inside(h.pts[0], o.pts)) || outers[0];
      host.shape.holes.push(new THREE.Path(h.pts));
    });
  return outers.map((o) => o.shape);
}

const cache = new Map();

/**
 * Extruded text made of the digits 0-9 (cap height = 1, centred on x and on the cap height).
 * Front face at z = depth, back face at z = 0, bevel included.
 */
export function numberGeometry(str, { depth = 0.12, bevel = 0.014, tracking = 0.03 } = {}) {
  const key = `${str}|${depth}|${bevel}|${tracking}`;
  if (cache.has(key)) return cache.get(key);
  const scale = 1 / CAP;
  let pen = 0;
  const parts = [];
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    const shapes = shapesFromContours(contoursFromPath(g.d), pen * 1000, scale);
    for (const s of shapes) {
      const geo = new THREE.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 1,
        steps: 1,
      });
      geo.clearGroups();
      parts.push(geo);
    }
    pen += g.adv + tracking;
  }
  const total = pen - tracking;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.translate(-total / 2, -0.5, bevel);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  cache.set(key, merged);
  return merged;
}
