import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TAU } from '../core/math.js';
import { gearGeometry, spiralGeometry } from './gear.js';
import * as TX from './textures.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

function planarUV(geo, R) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, p.getY(i) / (2 * R) + 0.5);
  uv.needsUpdate = true;
}

/**
 * "Mechanical heart": the movement as a thick coin. Engraved rim, perlage plate, Geneva-striped bridge,
 * gold gear train with rubies, the moon-phase disc and a swinging balance.
 * Radius 1, axis +Z.
 */
export class Movement {
  constructor(mats) {
    this.root = new THREE.Group();
    this.root.name = 'movement';
    const g = this.root;
    const m = mats;

    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 160, 1, true), m.satin);
    wall.rotation.x = Math.PI / 2;
    g.add(wall);
    const back = new THREE.Mesh(new THREE.CircleGeometry(1, 96), m.satin);
    back.position.z = -0.1;
    back.rotation.y = Math.PI;
    g.add(back);

    // engraved rim
    const ringGeo = new THREE.RingGeometry(0.83, 1.0, 192, 1);
    {
      const uv = ringGeo.attributes.uv;
      const n = 192;
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= n; i++) uv.setXY(j * (n + 1) + i, 1 - i / n, j);
      uv.needsUpdate = true;
    }
    const ringTex = TX.makeRingText('Montserrat');
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({ map: ringTex, metalness: 0.8, roughness: 0.34, envMapIntensity: 1.1 })
    );
    ring.position.z = 0.1;
    g.add(ring);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.04, 128, 1, true), m.polished);
    step.rotation.x = Math.PI / 2;
    step.position.z = 0.08;
    g.add(step);

    // perlage plate
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.83, 128), m.perlage);
    plate.position.z = 0.06;
    g.add(plate);

    // Geneva-striped bridge (left half)
    const hs = new THREE.Shape();
    hs.absarc(0, 0, 0.8, Math.PI / 2, (3 * Math.PI) / 2, false);
    hs.closePath();
    const bridgeGeo = new THREE.ExtrudeGeometry(hs, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 1,
      curveSegments: 64,
    });
    const stripes = TX.makeStripes(512);
    stripes.repeat.set(2.4, 2.4);
    stripes.needsUpdate = true;
    const bridge = new THREE.Mesh(
      bridgeGeo,
      new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 1, roughness: 0.3, normalMap: stripes, normalScale: V2(1.5, 1.5), envMapIntensity: 1.1 })
    );
    bridge.position.z = 0.06;
    g.add(bridge);

    // gold gear train
    this.gears = [];
    const addGear = (x, y, o, z, spin) => {
      const gear = new THREE.Mesh(gearGeometry({ depth: 0.026, ...o }), m.gold);
      gear.position.set(x, y, z);
      g.add(gear);
      this.gears.push({ gear, spin });
      const jewel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.016, 20), m.ruby);
      jewel.rotation.x = Math.PI / 2;
      jewel.position.set(x, y, z + 0.02);
      g.add(jewel);
      const chaton = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 8, 28), m.gold);
      chaton.position.set(x, y, z + 0.018);
      g.add(chaton);
    };
    addGear(-0.04, -0.04, { teeth: 36, rOut: 0.37, rRoot: 0.335, hole: 0.05, spokes: 6, spokeR: 0.2, spokeW: 0.07 }, 0.12, -0.35);
    addGear(0.36, -0.2, { teeth: 24, rOut: 0.2, rRoot: 0.178, hole: 0.035, spokes: 4, spokeR: 0.105, spokeW: 0.045 }, 0.135, 0.52);
    addGear(-0.38, 0.34, { teeth: 18, rOut: 0.14, rRoot: 0.12, hole: 0.03, spokes: 0 }, 0.14, 0.86);
    addGear(0.2, 0.3, { teeth: 14, rOut: 0.085, rRoot: 0.07, hole: 0.02, spokes: 0 }, 0.15, -1.2);

    // curved bridge arms
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.034, 10, 56, Math.PI * 0.75), m.polished);
    arm.position.set(0, -0.05, 0.1);
    arm.rotation.z = Math.PI * 0.12;
    g.add(arm);

    // black moon-phase disc at the top
    const moonG = new THREE.Group();
    moonG.position.set(0.12, 0.56, 0.1);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.22, 64), m.moon);
    moon.position.z = 0.012;
    const moonRing = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.022, 14, 80), m.polished);
    moonRing.position.z = 0.016;
    moonG.add(moon, moonRing);
    g.add(moonG);
    this.moon = moon;

    // balance wheel
    const bal = new THREE.Group();
    bal.position.set(0.42, -0.5, 0.13);
    bal.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.017, 10, 64), m.gold));
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.014, 0.014), m.gold);
      sp.rotation.z = (i / 3) * Math.PI;
      bal.add(sp);
    }
    bal.add(new THREE.Mesh(spiralGeometry({ r0: 0.03, r1: 0.15, turns: 7, tube: 0.005 }), m.steelDark));
    g.add(bal);
    this.balance = bal;

    // screws around the plate
    const screwGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.014, 18);
    const slotGeo = new THREE.BoxGeometry(0.05, 0.007, 0.004);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      const s = new THREE.Mesh(screwGeo, m.steelDark);
      s.rotation.x = Math.PI / 2;
      s.position.set(Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0.07);
      const slot = new THREE.Mesh(slotGeo, m.black);
      slot.position.set(s.position.x, s.position.y, 0.079);
      slot.rotation.z = a * 2;
      g.add(s, slot);
    }
  }

  update(time) {
    for (const { gear, spin } of this.gears) gear.rotation.z = time * spin;
    this.balance.rotation.z = Math.sin(time * TAU * 1.3) * 1.7;
    this.moon.rotation.z = time * 0.05;
  }
}

/** Skeleton rotor: a disc with three round windows and an engraved rim */
export class Rotor {
  constructor(mats) {
    this.root = new THREE.Group();
    this.root.name = 'rotor';
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1, 0, TAU, false);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.55;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.27, 0, TAU, true);
      shape.holes.push(h);
    }
    const hub = new THREE.Path();
    hub.absarc(0, 0, 0.07, 0, TAU, true);
    shape.holes.push(hub);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.014,
      bevelSegments: 2,
      curveSegments: 96,
    });
    geo.translate(0, 0, -0.025);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xe2e5ea, metalness: 1, roughness: 0.16, envMapIntensity: 1.35 });
    this.root.add(new THREE.Mesh(geo, mat));

    // tick marks on the rim
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(25,28,34,0.85)';
    g.lineWidth = 3;
    for (let i = 0; i < 180; i++) {
      const x = (i / 180) * 2048;
      const long = i % 5 === 0;
      g.beginPath();
      g.moveTo(x, long ? 8 : 26);
      g.lineTo(x, 56);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ringGeo = new THREE.RingGeometry(0.88, 0.985, 180, 1);
    {
      const uv = ringGeo.attributes.uv;
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= 180; i++) uv.setXY(j * 181 + i, i / 180, j);
      uv.needsUpdate = true;
    }
    const ticks = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    ticks.position.z = 0.04;
    this.root.add(ticks);
  }
}
