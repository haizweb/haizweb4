import * as THREE from 'three';
import { clamp, lerp, smootherstep, ease, Track, TAU, rng } from './core/math.js';

/**
 * The whole scroll story lives here. Everything is a pure function of the scroll progress `p`
 * (0..1) plus a little continuous time for the idle motion, so any frame can be reproduced
 * (?p=0.42) and scrubbing backwards is exactly the reverse of scrolling forwards.
 *
 *   0.00 – 0.06  hero, hold
 *   0.06 – 0.26  the watch tumbles, the dark steel background wipes in
 *   0.20 – 0.40  statement 1 (dark), the watch dissolves into a swirl of particles
 *   0.33 – 0.58  "Mechanical heart": fibre ropes, the movement and the rotor float by
 *   0.56 – 0.78  light again: dial, numerals, case and bracelet fly in and re-assemble
 *   0.77 – 0.90  statement 2 (light), the watch swings to the right
 *   0.87 – 1.00  final "FS 50" with the glass sector, drag to rotate
 */

const W = (p, a, b) => smootherstep(a, b, p);
const sinpi = (u) => Math.sin(Math.PI * clamp(u));

/* ------------------------------------------------------------------ key poses */

// [stageX, stageY, scale, rotX, rotY, rotZ] for the assembled watch after the explosion
const watchLate = new Track(
  [
    [0.78, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]],
    [0.835, [0.5, -0.05, 0.82, 0.14, -0.7, 0.05]],
    [0.87, [0.62, -0.1, 1.0, 0.2, -0.92, 0.07]],
    [0.93, [0.02, -0.08, 1.06, 0.22, 0.3, 0.0]],
    [1.0, [0.0, -0.08, 1.06, 0.1, 0.0, 0.0]],
  ],
  'inOutCubic'
);

const watchLatePortrait = new Track(
  [
    [0.78, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]],
    [0.835, [0.1, -0.42, 0.86, 0.14, -0.5, 0.05]],
    [0.87, [0.12, -0.46, 0.92, 0.2, -0.62, 0.07]],
    [0.93, [0.0, -0.16, 1.0, 0.2, 0.25, 0.0]],
    [1.0, [0.0, -0.12, 1.0, 0.1, 0.0, 0.0]],
  ],
  'inOutCubic'
);

// exploded parts: [stageX, stageY, z (case radii), rotX, rotY, rotZ, scale]
const A = [0, 0, 0, 0, 0, 0, 1];
const exDial = new Track(
  [
    [0.575, [-1.55, 0.25, 0, 0.3, 1.45, 0.4, 1.0]],
    [0.64, [-0.74, 0.12, 0.3, 0.2, 1.2, 0.25, 1.0]],
    [0.7, [-0.46, 0.04, 0.6, 0.45, 0.6, -0.15, 1.05]],
    [0.745, [-0.1, 0.0, 0.2, 0.15, 0.2, 0.0, 1.0]],
    [0.78, A],
  ],
  'inOutCubic'
);
const exBody = new Track(
  [
    [0.585, [1.55, 0.6, 0, 0.9, -1.3, 0.6, 1.0]],
    [0.65, [0.46, 0.3, 0.6, 0.55, -0.9, 0.35, 1.0]],
    [0.71, [0.25, 0.05, 0.3, 0.3, -0.35, 0.1, 1.0]],
    [0.765, [0.02, 0.0, 0.05, 0.05, -0.05, 0.0, 1.0]],
    [0.78, A],
  ],
  'inOutCubic'
);
const exBracelet = new Track(
  [
    [0.6, [1.75, -0.35, 0, 0.3, 0.9, 0.0, 1.0]],
    [0.67, [0.56, -0.3, 0.5, 0.35, 0.65, 0.5, 1.0]],
    [0.73, [0.06, 0.0, 0.0, 0.15, 0.3, 0.2, 1.0]],
    [0.78, A],
  ],
  'inOutCubic'
);

// the movement coin and the rotor of the "heart" scene
const moveTrack = new Track(
  [
    [0.33, [1.6, -0.12, 0, -0.5, -0.6, 0.35, 1.2]],
    [0.42, [0.54, -0.06, 0.4, -0.62, -0.42, 0.28, 1.25]],
    [0.5, [0.47, -0.02, 0.8, -0.7, -0.3, 0.15, 1.28]],
    [0.57, [0.5, 0.0, 1.0, -0.78, -0.2, 0.05, 1.3]],
    [0.62, [0.88, -0.12, 0.2, -0.3, -1.0, 0.3, 1.1]],
    [0.665, [1.7, -0.2, 0, -0.2, -1.2, 0.3, 1.0]],
  ],
  'inOutCubic'
);
const rotorTrack = new Track(
  [
    [0.35, [0.58, 1.6, 0, -0.9, -0.3, 0.2, 0.62]],
    [0.41, [0.5, 0.66, 0.3, -0.95, -0.3, 0.2, 0.62]],
    [0.48, [0.4, 0.74, 0.3, -1.05, -0.2, 0.3, 0.6]],
    [0.55, [0.34, 1.6, 0.0, -1.2, -0.1, 0.3, 0.6]],
  ],
  'inOutCubic'
);

/* ------------------------------------------------------------------ helpers */

const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _e = new THREE.Euler();
const _z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _arr = new Array(7);

/** DOM rows that slide in from below / out to the top inside an overflow-hidden mask */
function slideRows(spans, p, inA, inB, outA, outB, stagger = 0.012) {
  spans.forEach((el, i) => {
    const o = i * stagger;
    const a = W(p, inA + o, inB + o);
    const b = W(p, outA + o, outB + o);
    const y = (1 - a) * 112 - b * 112;
    el.style.transform = y === 0 ? 'translate3d(0,0,0)' : `translate3d(0,${y.toFixed(2)}%,0)`;
  });
}

function setLayer(el, o, extra = '') {
  const v = clamp(o);
  el.style.opacity = v.toFixed(3);
  el.style.visibility = v > 0.001 ? 'visible' : 'hidden';
  if (extra !== null) el.style.transform = extra;
}

const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), -r * Math.sin(a)];
};

function sectorPath(a1, a2, r = 50) {
  const [x1, y1] = polar(r, a1);
  const [x2, y2] = polar(r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M0 0L${x1.toFixed(3)} ${y1.toFixed(3)}A${r} ${r} 0 ${large} 0 ${x2.toFixed(3)} ${y2.toFixed(3)}Z`;
}
function arcPath(a1, a2, r) {
  const [x1, y1] = polar(r, a1);
  const [x2, y2] = polar(r, a2);
  return `M${x1.toFixed(3)} ${y1.toFixed(3)}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 0 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}

/* ------------------------------------------------------------------ timeline */

export class Timeline {
  constructor({ stage, watch, movement, rotor, vortex, threads, camera }) {
    Object.assign(this, { stage, watch, movement, rotor, vortex, threads, camera });
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];
    this.root = document.documentElement;
    this.dom = {
      hero: $('[data-layer="hero"]'),
      heroLines: $$('.hero__line > span'),
      heroText: $('.hero__text'),
      st1: $('[data-layer="st1"]'),
      st1Rows: $$('[data-layer="st1"] .statement__row > span'),
      st1Label: $('[data-layer="st1"] .statement__label'),
      heart: $('[data-layer="heart"]'),
      heartLines: $$('.heart__title > span'),
      st2: $('[data-layer="st2"]'),
      st2Rows: $$('[data-layer="st2"] .statement__row > span'),
      st2Label: $('[data-layer="st2"] .statement__label'),
      final: $('[data-layer="final"]'),
      finalFS: $('.final__fs'),
      finalNum: $('.final__num'),
      finalModel: $('.final__model'),
      arc: $('.final__arc'),
      arcSvg: $('.final__arc svg'),
      sector: $('.final__sector'),
      stroke: $('.final__stroke'),
      st1Copy: $('[data-layer="st1-copy"]'),
      heartCopy: $('[data-layer="heart-copy"]'),
    };
    this.cache = { wipe: null, sector: -1 };

    // scattered numerals
    const r = rng(11);
    this.scatter = this.watch.numeralList.map((m, i) => ({
      mesh: m,
      sx: (r() - 0.5) * 1.5,
      sy: (r() - 0.5) * 1.2,
      z: (r() - 0.5) * 3.2,
      rx: (r() - 0.5) * 2.4,
      ry: (r() - 0.5) * 3.0,
      rz: (r() - 0.5) * 2.2,
      spin: [(r() - 0.5) * 3.0, (r() - 0.5) * 4.0, (r() - 0.5) * 2.0],
      k: 4.5 + r() * 6.5,
      delay: i * 0.0035,
    }));
    // keep the digits away from the exact middle so they read as a loose cloud
    this.scatter.forEach((s, i) => {
      const a = (i / this.scatter.length) * TAU + 0.4;
      const rad = 0.28 + 0.34 * r();
      s.sx = Math.cos(a) * rad * 1.05;
      s.sy = Math.sin(a) * rad * 0.8;
    });
  }

  /* world → part-local helper: the watch root is the identity-rotated, `unit`-scaled frame during the explosion */
  _placePart(obj, v, s) {
    const st = this.stage;
    const kx = st.portrait ? 0.42 : 1;
    obj.position.set(st.x(v[0] * kx) / s, st.y(v[1]) / s, v[2]);
    _e.set(v[3], v[4], v[5], 'XYZ');
    obj.quaternion.setFromEuler(_e);
    obj.scale.setScalar(v[6]);
  }

  _resetPart(obj) {
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.setScalar(1);
  }

  update(p, time, ctx) {
    const { stage, watch, dom } = this;
    const unit = stage.unit;
    const { intro = 1, px = 0, py = 0, dragYaw = 0, dragPitch = 0, dragAmt = 0 } = ctx || {};

    /* ------------------------------------------------ background wipe */
    const wipeIn = W(p, 0.1, 0.245);
    const wipeOut = W(p, 0.555, 0.625);
    const wipe = -46 + 146 * (wipeIn * (1 - wipeOut));
    const wipeStr = wipe.toFixed(2) + '%';
    if (this.cache.wipe !== wipeStr) {
      this.root.style.setProperty('--wipe', wipeStr);
      this.cache.wipe = wipeStr;
    }

    /* ------------------------------------------------ typography */
    // hero
    const heroO = 1 - W(p, 0.085, 0.15);
    setLayer(dom.hero, heroO, `translate3d(${(-px * 5).toFixed(2)}px,${(-py * 3 - p * 120).toFixed(2)}px,0)`);
    {
      const e = ease.outCubic;
      dom.heroLines.forEach((el, i) => {
        const a = e(clamp((intro - 0.12 * i - 0.05) / 0.62));
        const b = W(p, 0.045 + i * 0.012, 0.11 + i * 0.012);
        const y = (1 - a) * 112 - b * 112;
        el.style.transform = `translate3d(0,${y.toFixed(2)}%,0)`;
      });
      const ta = clamp((intro - 0.55) / 0.4) * (1 - W(p, 0.04, 0.09));
      dom.heroText.style.opacity = ta.toFixed(3);
      dom.heroText.style.transform = `translate3d(-50%,${((1 - ease.outCubic(clamp((intro - 0.55) / 0.4))) * 14).toFixed(2)}px,0)`;
    }

    // statement 1 (dark)
    const st1O = W(p, 0.19, 0.215) * (1 - W(p, 0.385, 0.42));
    setLayer(dom.st1, st1O, `translate3d(${(-px * 8).toFixed(2)}px,${(-py * 5 - (p - 0.3) * 160).toFixed(2)}px,0)`);
    slideRows(dom.st1Rows, p, 0.2, 0.275, 0.35, 0.41);
    dom.st1Label.style.opacity = (W(p, 0.2, 0.25) * (1 - W(p, 0.34, 0.38))).toFixed(3);
    setLayer(dom.st1Copy, W(p, 0.27, 0.31) * (1 - W(p, 0.34, 0.37)), `translate3d(0,${((1 - W(p, 0.27, 0.31)) * 14).toFixed(1)}px,0)`);

    // mechanical heart
    const heartO = W(p, 0.385, 0.41) * (1 - W(p, 0.545, 0.58));
    setLayer(dom.heart, heartO, `translate3d(${(-px * 10).toFixed(2)}px,${(-py * 6 - (p - 0.47) * 120).toFixed(2)}px,0)`);
    slideRows(dom.heartLines, p, 0.395, 0.45, 0.525, 0.575, 0.018);
    setLayer(dom.heartCopy, W(p, 0.455, 0.5) * (1 - W(p, 0.535, 0.565)), `translate3d(0,${((1 - W(p, 0.455, 0.5)) * 14).toFixed(1)}px,0)`);

    // statement 2 (light)
    const st2O = W(p, 0.765, 0.785) * (1 - W(p, 0.885, 0.915));
    setLayer(dom.st2, st2O, `translate3d(${(-px * 8).toFixed(2)}px,${(-py * 5 - (p - 0.82) * 150).toFixed(2)}px,0)`);
    slideRows(dom.st2Rows, p, 0.775, 0.835, 0.87, 0.915);
    dom.st2Label.style.opacity = (W(p, 0.78, 0.82) * (1 - W(p, 0.86, 0.9))).toFixed(3);

    // final
    const finO = W(p, 0.87, 0.9);
    setLayer(dom.final, finO, `translate3d(${(-px * 6).toFixed(2)}px,${(-py * 4).toFixed(2)}px,0)`);
    {
      const a = W(p, 0.875, 0.945);
      const b = W(p, 0.89, 0.955);
      dom.finalFS.style.opacity = a.toFixed(3);
      dom.finalFS.style.transform = `translate3d(${((1 - a) * -9).toFixed(2)}vw,${((1 - a) * 5).toFixed(2)}vh,0)`;
      dom.finalNum.style.opacity = b.toFixed(3);
      dom.finalNum.style.transform = `translate3d(${((1 - b) * 9).toFixed(2)}vw,${((1 - b) * 5).toFixed(2)}vh,0)`;
      const m = W(p, 0.94, 0.985);
      dom.finalModel.style.opacity = m.toFixed(3);
      dom.finalModel.style.transform = `translate3d(0,${((1 - m) * 3).toFixed(2)}vh,0)`;

      // glass sector grows out of the watch
      const sw = W(p, 0.905, 0.965);
      const key = Math.round(sw * 400) + dragAmt * 7;
      if (this.cache.sector !== key) {
        this.cache.sector = key;
        const half = 46 * sw;
        dom.sector.setAttribute('d', sw > 0.002 ? sectorPath(90 - half, 90 + half) : '');
        dom.stroke.setAttribute('d', sw > 0.002 ? arcPath(90 - half * 1.15 + 3, 90 + half * 0.1, 52.2) : '');
      }
      dom.arcSvg.style.transform = `rotate(${(dragAmt * 14).toFixed(2)}deg)`;
    }

    /* ------------------------------------------------ the watch itself */
    const root = watch.root;
    let visible = true;
    let pose; // [sx, sy, s, rx, ry, rz]
    const exploded = p >= 0.575 && p < 0.78;

    if (p < 0.26) {
      const u = W(p, 0.06, 0.26);
      const b = sinpi(u);
      pose = [
        lerp(0, -0.04, u) - 0.34 * Math.pow(b, 1.3),
        lerp(-0.5, 0.0, u) + 0.09 * b,
        lerp(0.97, 0.62, u) + 0.2 * b,
        lerp(0.12, 0.12, u) + 0.3 * b,
        lerp(-0.1, 7.38, u),
        -0.45 * u,
      ];
    } else if (p < 0.575) {
      const v = W(p, 0.26, 0.345);
      pose = [lerp(-0.04, 0, v), lerp(0, 0, v), 0.62 * (1 - ease.inCubic(v)), 0.12 - 0.12 * v, 7.38 + 0.9 * v, -0.45 + 0.1 * v];
      visible = v < 0.995;
    } else if (exploded) {
      pose = [0, 0, 1, 0, 0, 0];
    } else {
      pose = (stage.portrait ? watchLatePortrait : watchLate).at(p, _arr);
    }

    // intro: the hero watch drifts up and turns into place
    const iw = ease.outCubic(clamp(intro));
    const introAmt = p < 0.06 ? 1 - iw : (1 - iw) * (1 - W(p, 0.06, 0.1));
    if (introAmt > 0.0001) {
      pose = pose.slice();
      pose[1] -= 0.75 * introAmt;
      pose[2] *= 1 - 0.18 * introAmt;
      pose[4] -= 1.5 * introAmt;
      pose[3] += 0.25 * introAmt;
    }

    // pointer parallax and idle sway (hero + late scenes), drag in the final
    const calm = (1 - W(p, 0.05, 0.12)) + W(p, 0.78, 0.84);
    const sway = Math.sin(time * 0.6) * 0.025 * clamp(calm);
    const lateAmt = W(p, 0.78, 0.84);
    const s = unit * pose[2];
    root.visible = visible;
    root.position.set(stage.x(pose[0]), stage.y(pose[1]), 0);
    root.scale.setScalar(s);
    _e.set(
      pose[3] + sway + py * -0.08 * clamp(calm) + dragPitch,
      pose[4] + px * 0.14 * clamp(calm) + dragYaw + sway * 1.5,
      pose[5],
      'XYZ'
    );
    root.quaternion.setFromEuler(_e);

    // reset every part, then place the exploded ones
    const parts = [watch.body, watch.dial, watch.hands, watch.bracelet];
    if (exploded) {
      const base = unit;
      this._placePart(watch.dial, exDial.at(p, _arr), base);
      this._placePart(watch.hands, exDial.at(p, _arr), base);
      this._placePart(watch.body, exBody.at(p, _arr), base);
      this._placePart(watch.bracelet, exBracelet.at(p, _arr), base);
      watch.setBraceletLoop(1 - W(p, 0.715, 0.775));
      // numerals: scattered, big, spinning — then they fly home
      const wx = this.scatter;
      for (const sc of wx) {
        const home = sc.mesh.userData.home;
        const inn = ease.outCubic(clamp((p - (0.585 + sc.delay)) / 0.075));
        const out = W(p, 0.7 + sc.delay, 0.775);
        const sp = (p - 0.6) * 4.0;
        _e.set(sc.rx + sp * sc.spin[0], sc.ry + sp * sc.spin[1], sc.rz + sp * sc.spin[2], 'XYZ');
        _q.setFromEuler(_e);
        // scattered pose (root-local): grows out of the dial centre as it flies out
        _v.set((stage.x(sc.sx * (stage.portrait ? 0.5 : 1)) / unit) * inn, (stage.y(sc.sy) / unit) * inn, sc.z * inn);
        sc.mesh.position.copy(_v).lerp(home.position, out);
        sc.mesh.quaternion.copy(_q).slerp(home.quaternion, out);
        sc.mesh.scale.setScalar(lerp(home.scale * sc.k * inn, home.scale, out));
        sc.mesh.visible = inn > 0.004 || out > 0.001;
      }
    } else {
      for (const o of parts) this._resetPart(o);
      watch.setBraceletLoop(0);
      for (const sc of this.scatter) {
        const home = sc.mesh.userData.home;
        sc.mesh.position.copy(home.position);
        sc.mesh.quaternion.copy(home.quaternion);
        sc.mesh.scale.setScalar(home.scale);
        sc.mesh.visible = true;
      }
    }
    void lateAmt;

    /* ------------------------------------------------ movement + rotor */
    const mv = p > 0.325 && p < 0.67;
    this.movement.root.visible = mv;
    if (mv) {
      const v = moveTrack.at(p, _arr);
      const m = this.movement.root;
      const pt = stage.portrait;
      const sm = unit * v[6] * (pt ? 0.84 : 1);
      m.position.set(stage.x(v[0] * (pt ? 0.3 : 1)), stage.y(v[1] + (pt ? -0.16 : 0)), v[2]);
      _e.set(v[3] + py * -0.05, v[4] + px * 0.1 + Math.sin(time * 0.35) * 0.04, v[5], 'XYZ');
      m.quaternion.setFromEuler(_e);
      _qs.setFromAxisAngle(_z, time * 0.12 + p * 3);
      m.quaternion.multiply(_qs);
      m.scale.setScalar(sm);
    }
    const ro = p > 0.345 && p < 0.555;
    this.rotor.root.visible = ro;
    if (ro) {
      const v = rotorTrack.at(p, _arr);
      const m = this.rotor.root;
      const pt = stage.portrait;
      m.position.set(stage.x(v[0] * (pt ? 0.55 : 1)), stage.y(pt ? Math.min(v[1], 0.6) : v[1]), v[2]);
      _e.set(v[3], v[4] + px * 0.1, v[5], 'XYZ');
      m.quaternion.setFromEuler(_e);
      _qs.setFromAxisAngle(_z, -time * 0.5 - p * 8);
      m.quaternion.multiply(_qs);
      m.scale.setScalar(unit * v[6] * (pt ? 0.85 : 1));
    }

    /* ------------------------------------------------ particles + fibre ropes */
    const vp = W(p, 0.255, 0.335);
    const vo = 1 - W(p, 0.36, 0.43);
    const vu = this.vortex.material.uniforms;
    this.vortex.points.visible = vp > 0.001 && vo > 0.001;
    vu.uProg.value = vp;
    vu.uOpacity.value = vo;
    vu.uTime.value = time;
    vu.uCenter.value.set(stage.x(0.04), stage.y(-0.02), 0.6);

    const tu = this.threads.material.uniforms;
    const tr = W(p, 0.33, 0.47);
    const to = 1 - W(p, 0.6, 0.665);
    this.threads.mesh.visible = tr > 0.001 && to > 0.001;
    tu.uReveal.value = tr;
    tu.uOpacity.value = to;
    tu.uLight.value = W(p, 0.54, 0.605);
    tu.uTime.value = time;
    tu.uZoom.value = lerp(0.9, 1.12, W(p, 0.33, 0.6));
    tu.uCenter.value.set(stage.x(lerp(0.1, -0.12, W(p, 0.35, 0.6))), stage.y(0.02), 0);

    // gentle camera parallax between the DOM, the particles and the models
    const cam = this.camera;
    cam.position.x = px * 0.14;
    cam.position.y = py * 0.09;
    cam.lookAt(0, 0, 0);
  }
}
