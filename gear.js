import * as THREE from 'three';
import { TAU } from '../core/math.js';

/** Flat toothed wheel with optional round spoke windows, extruded around z = 0. */
export function gearGeometry({
  teeth = 20,
  rOut = 1,
  rRoot = 0.86,
  hole = 0.15,
  spokes = 0,
  spokeR = 0.55,
  spokeW = 0.2,
  depth = 0.1,
  bevel = 0.012,
} = {}) {
  const s = new THREE.Shape();
  const w = TAU / teeth;
  const P = (a, r) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  for (let i = 0; i < teeth; i++) {
    const a = i * w;
    const pts = [P(a, rRoot), P(a + 0.2 * w, rOut), P(a + 0.5 * w, rOut), P(a + 0.7 * w, rRoot)];
    pts.forEach((p, k) => (i === 0 && k === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  }
  s.closePath();
  if (hole > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, hole, 0, TAU, true);
    s.holes.push(h);
  }
  for (let k = 0; k < spokes; k++) {
    const a = ((k + 0.5) / spokes) * TAU;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * spokeR, Math.sin(a) * spokeR, spokeW, 0, TAU, true);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 1,
    curveSegments: 24,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** thin spiral wire (hairspring) in the XY plane */
export function spiralGeometry({ r0 = 0.02, r1 = 0.085, turns = 6, tube = 0.0035, seg = 140 } = {}) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = t * turns * TAU;
    const r = r0 + (r1 - r0) * t;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg * 2, tube, 5, false);
}
