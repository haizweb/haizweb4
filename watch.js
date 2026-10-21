import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPEC } from './spec.js';
import { TAU } from '../core/math.js';
import { numberGeometry } from './glyphshape.js';
import { gearGeometry, spiralGeometry } from './gear.js';
import * as TX from './textures.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

/** Revolve an (r, z) outline around the Z axis. The outline runs counter-clockwise (material on the left). */
function lathe(outline, seg = 160) {
  const g = new THREE.LatheGeometry(outline.map(([r, z]) => V2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** planar UVs for a disc of radius R centred on the origin */
function discUV(geo, R) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, p.getY(i) / (2 * R) + 0.5);
  uv.needsUpdate = true;
}

export function makeMaterials() {
  const brushed = TX.makeBrushed(1024);
  const caseN = brushed.normal.clone();
  const caseR = brushed.rough.clone();
  [caseN, caseR].forEach((t) => {
    t.repeat.set(5, 1);
    t.needsUpdate = true;
  });
  const dial = TX.makeDial('Montserrat');
  const perlage = TX.makePerlage(1024);
  perlage.repeat.set(3, 3);
  perlage.needsUpdate = true;

  const mat = {
    polished: new THREE.MeshStandardMaterial({ color: 0xeceff3, metalness: 1, roughness: 0.1, envMapIntensity: 1.3 }),
    satin: new THREE.MeshStandardMaterial({
      color: 0xdcdfe4,
      metalness: 1,
      roughness: 0.62,
      roughnessMap: brushed.rough,
      normalMap: brushed.normal,
      normalScale: V2(0.5, 0.5),
      envMapIntensity: 1.15,
    }),
    caseSide: new THREE.MeshStandardMaterial({
      color: 0xdcdfe4,
      metalness: 1,
      roughness: 0.55,
      roughnessMap: caseR,
      normalMap: caseN,
      normalScale: V2(0.45, 0.45),
      envMapIntensity: 1.2,
    }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe6b542, metalness: 1, roughness: 0.28, envMapIntensity: 1.2 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 1, roughness: 0.3, envMapIntensity: 1.0 }),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xb0102e, metalness: 0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lume: new THREE.MeshStandardMaterial({ color: 0xf3f5ea, roughness: 0.5, emissive: 0x7a8a66, emissiveIntensity: 0.22, metalness: 0.1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.85, metalness: 0 }),
    under: new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 1, roughness: 0.46, normalMap: brushed.normal, normalScale: V2(0.4, 0.4), envMapIntensity: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.13,
      envMapIntensity: 5.5,
      depthWrite: false,
    }),
    dial: new THREE.MeshPhysicalMaterial({
      map: dial.map,
      metalness: 0.85,
      roughness: 0.42,
      anisotropy: 0.65,
      anisotropyMap: dial.aniso,
      envMapIntensity: 0.95,
    }),
    moon: new THREE.MeshStandardMaterial({ map: TX.makeMoonDisc(512), roughness: 0.55, metalness: 0 }),
    date: new THREE.MeshStandardMaterial({ map: TX.makeDateCard('Montserrat'), roughness: 0.7, metalness: 0 }),
    perlage: new THREE.MeshStandardMaterial({
      color: 0xc9ccd2,
      metalness: 1,
      roughness: 0.38,
      normalMap: perlage,
      normalScale: V2(0.9, 0.9),
      envMapIntensity: 1.0,
    }),
    knurl: new THREE.MeshStandardMaterial({
      color: 0xdcdfe4,
      metalness: 1,
      roughness: 0.3,
      normalMap: TX.makeBezelGroove(1024),
      normalScale: V2(1.2, 1.2),
      envMapIntensity: 1.2,
    }),
  };
  return mat;
}

const clockNow = () => {
  const d = new Date();
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  return { h, m, s };
};

/**
 * The watch. Dial faces +Z, 12 o'clock is +Y. The model is split into independent parts
 * (body, dial, numerals, hands, bracelet) so the timeline can explode and re-assemble it.
 */
export class Watch {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'watch';
    this.mat = makeMaterials();
    this.fixedTime = null; // { h, m, s } for deterministic screenshots
    this.dialWindows = {};
    this.body = this._buildBody();
    this.dial = this._buildDial();
    this.numerals = this._buildNumerals();
    this.hands = this._buildHands();
    this.bracelet = this._buildBracelet();
    this.root.add(this.body, this.dial, this.numerals, this.hands, this.bracelet);
    this.update(0);
  }

  /* ------------------------------------------------------------------ case */
  _buildBody() {
    const m = this.mat;
    const g = new THREE.Group();
    g.name = 'body';

    const mid = new THREE.Mesh(
      lathe(
        [
          [0, -0.3],
          [0.7, -0.3],
          [0.84, -0.286],
          [0.93, -0.256],
          [0.976, -0.205],
          [0.996, -0.13],
          [1.0, -0.03],
          [1.0, 0.06],
          [0.992, 0.12],
          [0.968, 0.152],
          [0.9, 0.162],
          [0.8, 0.162],
          [0.8, -0.03],
        ],
        200
      ),
      m.caseSide
    );
    g.add(mid);

    // polished bezel with a sloped inner edge
    const bezel = new THREE.Mesh(
      lathe(
        [
          [0.8, 0.14],
          [0.975, 0.14],
          [0.97, 0.17],
          [0.948, 0.19],
          [0.86, 0.19],
          [0.83, 0.172],
          [0.8, 0.15],
          [0.8, 0.14],
        ],
        200
      ),
      m.polished
    );
    g.add(bezel);

    // black floor visible through the dial windows
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.8, 64), m.black);
    floor.position.z = -0.03;
    g.add(floor);

    // sapphire crystal: a shallow dome
    const R = 5;
    const th = Math.asin(0.81 / R);
    const dome = new THREE.SphereGeometry(R, 96, 12, 0, TAU, 0, th);
    dome.rotateX(Math.PI / 2);
    dome.translate(0, 0, SPEC.crystalZ - R * Math.cos(th));
    const crystal = new THREE.Mesh(dome, m.glass);
    crystal.name = 'crystal';
    crystal.renderOrder = 5;
    g.add(crystal);

    // integrated lugs at 12 and 6
    const lugGeo = new RoundedBoxGeometry(1.04, 0.62, 0.36, 4, 0.085);
    for (const s of [1, -1]) {
      const lug = new THREE.Mesh(lugGeo, m.caseSide);
      lug.position.set(0, s * 1.12, -0.13);
      lug.rotation.x = -s * 0.2;
      g.add(lug);
      // polished chamfer strip on top of the lug
      const chamfer = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.46, 0.04, 2, 0.015), m.polished);
      chamfer.position.set(0, s * 1.16, 0.045);
      chamfer.rotation.x = -s * 0.2;
      g.add(chamfer);
    }

    // crown at 3 o'clock
    const crown = new THREE.Group();
    crown.name = 'crown';
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 24), m.steelDark);
    stem.rotation.z = Math.PI / 2;
    stem.position.x = 1.0;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 64), m.knurl);
    knob.rotation.z = Math.PI / 2;
    knob.position.x = 1.14;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 48), m.polished);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = 1.255;
    crown.add(stem, knob, cap);
    crown.position.z = -0.04;
    g.add(crown);
    return g;
  }

  /* ------------------------------------------------------------------ dial */
  _buildDial() {
    const m = this.mat;
    const g = new THREE.Group();
    g.name = 'dial';
    const R = SPEC.dialR;

    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, 0, TAU, false);
    for (const w of [SPEC.moon, SPEC.heart]) {
      const hole = new THREE.Path();
      hole.absarc(w.x, w.y, w.r, 0, TAU, true);
      shape.holes.push(hole);
    }
    const d = SPEC.date;
    const dh = new THREE.Path();
    dh.moveTo(d.x - d.w / 2, d.y - d.h / 2);
    dh.lineTo(d.x + d.w / 2, d.y - d.h / 2);
    dh.lineTo(d.x + d.w / 2, d.y + d.h / 2);
    dh.lineTo(d.x - d.w / 2, d.y + d.h / 2);
    dh.closePath();
    shape.holes.push(dh);
    const plateGeo = new THREE.ShapeGeometry(shape, 128);
    discUV(plateGeo, R);
    const plate = new THREE.Mesh(plateGeo, m.dial);
    plate.name = 'plate';
    g.add(plate);

    // sloped flange between dial and bezel
    const flange = new THREE.Mesh(
      lathe(
        [
          [0.77, 0.004],
          [0.815, 0.004],
          [0.815, 0.06],
          [0.79, 0.046],
          [0.77, 0.02],
          [0.77, 0.004],
        ],
        200
      ),
      m.polished
    );
    g.add(flange);

    // applied rings around the windows
    for (const w of [SPEC.moon, SPEC.heart]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w.r + 0.012, 0.017, 14, 96), m.polished);
      ring.position.set(w.x, w.y, 0.008);
      g.add(ring);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(w.r - 0.002, 0.006, 8, 96), m.steelDark);
      inner.position.set(w.x, w.y, 0.0);
      g.add(inner);
    }

    // moon-phase disc
    const moon = new THREE.Group();
    moon.position.set(SPEC.moon.x, SPEC.moon.y, -0.03);
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(SPEC.moon.r + 0.025, 64), m.moon);
    moon.add(moonDisc);
    g.add(moon);
    this.dialWindows.moon = moon;

    // date window
    const card = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), m.date);
    card.position.set(d.x, d.y, -0.018);
    g.add(card);
    const fr = 0.014;
    const frames = [
      [d.w + fr * 2, fr, 0, d.h / 2 + fr / 2],
      [d.w + fr * 2, fr, 0, -d.h / 2 - fr / 2],
      [fr, d.h, -d.w / 2 - fr / 2, 0],
      [fr, d.h, d.w / 2 + fr / 2, 0],
    ];
    for (const [w, h, ox, oy] of frames) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.03, 2, 0.005), m.polished);
      b.position.set(d.x + ox, d.y + oy, 0.012);
      g.add(b);
    }

    g.add(this._buildHeart());
    return g;
  }

  /** the open "heart": a miniature balance and gear train behind the 6 o'clock window */
  _buildHeart() {
    const m = this.mat;
    const h = SPEC.heart;
    const g = new THREE.Group();
    g.name = 'heart';
    g.position.set(h.x, h.y, -0.02);

    const plate = new THREE.Mesh(new THREE.CircleGeometry(h.r + 0.03, 64), m.perlage);
    plate.position.z = -0.06;
    g.add(plate);

    const gear = new THREE.Mesh(
      gearGeometry({ teeth: 24, rOut: 0.125, rRoot: 0.108, hole: 0.018, spokes: 5, spokeR: 0.066, spokeW: 0.027, depth: 0.012 }),
      m.gold
    );
    gear.position.set(-0.075, 0.035, -0.035);
    g.add(gear);
    this.dialWindows.gear = gear;

    const gear2 = new THREE.Mesh(gearGeometry({ teeth: 14, rOut: 0.058, rRoot: 0.048, hole: 0.01, depth: 0.012 }), m.steelDark);
    gear2.position.set(0.1, 0.1, -0.04);
    g.add(gear2);
    this.dialWindows.gear2 = gear2;

    const balance = new THREE.Group();
    balance.position.set(0.045, -0.035, -0.012);
    balance.add(new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.0095, 10, 56), m.gold));
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.008), m.gold);
      sp.rotation.z = (i / 3) * Math.PI;
      balance.add(sp);
    }
    balance.add(new THREE.Mesh(spiralGeometry({ r0: 0.014, r1: 0.075, turns: 6, tube: 0.0032 }), m.steelDark));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), m.gold);
    hub.rotation.x = Math.PI / 2;
    balance.add(hub);
    g.add(balance);
    this.dialWindows.balance = balance;

    // bridge and rubies
    const bridge = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.045, 0.014, 2, 0.01), m.polished);
    bridge.position.set(0.0, 0.135, 0.0);
    bridge.rotation.z = 0.35;
    g.add(bridge);
    for (const [x, y] of [[-0.075, 0.035], [0.045, -0.035], [0.1, 0.1]]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 16), m.ruby);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, y, 0.004);
      g.add(r);
    }
    return g;
  }

  /* ------------------------------------------------------------------ numerals */
  _buildNumerals() {
    const g = new THREE.Group();
    g.name = 'numerals';
    this.numeralList = [];
    for (let hr = 1; hr <= 12; hr++) {
      if (hr === 3) continue; // date window
      const a = Math.PI / 2 - (hr / 12) * TAU;
      const x = Math.cos(a) * SPEC.numeralR;
      const y = Math.sin(a) * SPEC.numeralR;
      const mesh = new THREE.Mesh(
        numberGeometry(String(hr), { depth: 0.16, bevel: 0.018 }),
        this.mat.polished
      );
      mesh.scale.setScalar(SPEC.numeralH);
      const home = {
        position: new THREE.Vector3(x, y, 0.002),
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2),
        scale: SPEC.numeralH,
      };
      mesh.position.copy(home.position);
      mesh.quaternion.copy(home.quaternion);
      mesh.userData.home = home;
      mesh.userData.hour = hr;
      g.add(mesh);
      this.numeralList.push(mesh);
    }
    return g;
  }

  /* ------------------------------------------------------------------ hands */
  _buildHands() {
    const m = this.mat;
    const g = new THREE.Group();
    g.name = 'hands';
    const [zh, zm, zs] = SPEC.handZ;

    const baton = (len, tail, w) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, -tail);
      s.lineTo(w / 2, -tail);
      s.lineTo(w / 2, len - w * 1.7);
      s.lineTo(0, len);
      s.lineTo(-w / 2, len - w * 1.7);
      s.closePath();
      return s;
    };
    const ext = (shape, depth) =>
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 4 });
    const lumeInset = (len, tail, w) => {
      const s = new THREE.Shape();
      const iw = w * 0.38;
      s.moveTo(-iw / 2, tail * 0.2);
      s.lineTo(iw / 2, tail * 0.2);
      s.lineTo(iw / 2, len - w * 2.1);
      s.lineTo(-iw / 2, len - w * 2.1);
      s.closePath();
      return s;
    };

    const mk = (len, tail, w, z) => {
      const hand = new THREE.Group();
      const body = new THREE.Mesh(ext(baton(len, tail, w), 0.012), m.polished);
      body.position.z = z;
      const lume = new THREE.Mesh(ext(lumeInset(len, tail, w), 0.004), m.lume);
      lume.position.z = z + 0.014;
      hand.add(body, lume);
      return hand;
    };
    this.hourHand = mk(0.47, 0.07, 0.085, zh);
    this.minuteHand = mk(0.7, 0.09, 0.062, zm);

    const sec = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.76 + 0.17, 0.006), m.polished);
    rod.position.set(0, (0.76 - 0.17) / 2, zs + 0.003);
    const tailW = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24), m.polished);
    tailW.rotation.x = Math.PI / 2;
    tailW.position.set(0, -0.13, zs + 0.003);
    sec.add(rod, tailW);
    this.secondHand = sec;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.045, 40), m.polished);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = zs;
    const hubTop = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24), m.black);
    hubTop.rotation.x = Math.PI / 2;
    hubTop.position.z = zs + 0.026;
    g.add(this.hourHand, this.minuteHand, this.secondHand, hub, hubTop);
    return g;
  }

  /* ------------------------------------------------------------------ bracelet */
  _buildBracelet() {
    const m = this.mat;
    const g = new THREE.Group();
    g.name = 'bracelet';
    const { ay, az, firstY, firstZ } = SPEC.wrist;
    const N = SPEC.linksPerSide;
    const phi0 = Math.asin(firstY / ay);
    const zc = firstZ - az * Math.cos(phi0);

    // arc-length table of the wrist ellipse (from the first link to the clasp at the bottom)
    const K = 480;
    const phis = [];
    const S = [];
    let acc = 0;
    let prev = null;
    for (let k = 0; k <= K; k++) {
      const phi = phi0 + (Math.PI - phi0) * (k / K);
      const y = ay * Math.sin(phi);
      const z = zc + az * Math.cos(phi);
      if (prev) acc += Math.hypot(y - prev[0], z - prev[1]);
      prev = [y, z];
      phis.push(phi);
      S.push(acc);
    }
    const pitch = acc / (N - 0.5);
    const phiAt = (s) => {
      let lo = 0;
      let hi = K;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (S[mid] < s) lo = mid;
        else hi = mid;
      }
      const t = (s - S[lo]) / Math.max(1e-9, S[hi] - S[lo]);
      return phis[lo] + (phis[hi] - phis[lo]) * t;
    };

    const len = pitch - 0.018;
    const centerGeo = new RoundedBoxGeometry(0.46, len, 0.11, 3, 0.032);
    const sideGeo = new RoundedBoxGeometry(0.255, len, 0.1, 3, 0.032);
    const underGeo = new THREE.BoxGeometry(0.99, len * 0.96, 0.05);
    const sideX = 0.23 + 0.014 + 0.1275;

    const X = new THREE.Vector3(1, 0, 0);
    const loopR = ((2 * N + 1) * pitch) / TAU;
    const dA = TAU / (2 * N + 1);
    this.links = [];
    this.pitch = pitch;
    this.loopRadius = loopR;

    for (let i = 0; i < N; i++) {
      const phi = phiAt(i * pitch);
      const y = ay * Math.sin(phi);
      const z = zc + az * Math.cos(phi);
      const T = new THREE.Vector3(0, ay * Math.cos(phi), -az * Math.sin(phi)).normalize();

      for (const side of [1, -1]) {
        const link = new THREE.Group();
        const c = new THREE.Mesh(centerGeo, i % 2 ? m.polished : m.satin);
        const l = new THREE.Mesh(sideGeo, m.polished);
        l.position.x = -sideX;
        const r = new THREE.Mesh(sideGeo, m.polished);
        r.position.x = sideX;
        const u = new THREE.Mesh(underGeo, m.under);
        u.position.z = -0.05;
        link.add(u, c, l, r);

        // pose A: worn on the wrist
        const posA = new THREE.Vector3(0, side * y, z);
        let Ts = new THREE.Vector3(0, side * T.y, T.z);
        let Xs = X.clone();
        if (side < 0) Xs.negate();
        const Ns = new THREE.Vector3().crossVectors(Xs, Ts);
        const qA = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xs, Ts, Ns));

        // pose B: closed loop in the XY plane (the case slot is at the top)
        const alpha = Math.PI / 2 - side * (i + 1) * dA;
        const posB = new THREE.Vector3(Math.cos(alpha) * loopR, Math.sin(alpha) * loopR, 0);
        const Tb = new THREE.Vector3(-Math.sin(alpha), Math.cos(alpha), 0);
        const Nb = new THREE.Vector3(Math.cos(alpha), Math.sin(alpha), 0);
        const qB = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), Tb, Nb));

        link.position.copy(posA);
        link.quaternion.copy(qA);
        link.userData = { posA, qA, posB, qB };
        g.add(link);
        this.links.push(link);
      }
    }
    return g;
  }

  /** 0 = worn on the wrist, 1 = closed loop */
  setBraceletLoop(t) {
    if (t === this._loopT) return;
    this._loopT = t;
    for (const l of this.links) {
      const { posA, qA, posB, qB } = l.userData;
      l.position.lerpVectors(posA, posB, t);
      l.quaternion.slerpQuaternions(qA, qB, t);
    }
  }

  /* ------------------------------------------------------------------ animation */
  update(time) {
    const c = this.fixedTime || clockNow();
    this.hourHand.rotation.z = -(c.h / 12) * TAU;
    this.minuteHand.rotation.z = -(c.m / 60) * TAU;
    this.secondHand.rotation.z = -(c.s / 60) * TAU;
    const w = this.dialWindows;
    if (w.balance) {
      w.balance.rotation.z = Math.sin(time * TAU * 1.6) * 1.9;
      w.gear.rotation.z = -time * 0.5;
      w.gear2.rotation.z = time * 1.1;
      w.moon.rotation.z = time * 0.04;
    }
  }
}
