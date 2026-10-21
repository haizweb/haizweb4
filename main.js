import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { Scroll } from './core/scroll.js';
import { clamp, damp, ease, TAU } from './core/math.js';
import { createStudioEnvironment } from './gl/env.js';
import { Watch } from './gl/watch.js';
import { Movement, Rotor } from './gl/movement.js';
import { Vortex, Threads } from './gl/particles.js';
import { Timeline } from './timeline.js';

const q = new URLSearchParams(location.search);
const fixedP = q.has('p') ? clamp(parseFloat(q.get('p'))) : null;
const still = q.has('still');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

async function boot() {
  await Promise.all(['200', '300', '400', '500', '600'].map((w) => document.fonts.load(`${w} 48px Montserrat`)));
  await document.fonts.ready;

  /* ---------------------------------------------------------------- renderer + scene */
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  const stage = new Stage(camera);
  scene.environment = createStudioEnvironment(renderer);

  const watch = new Watch();
  if (still) watch.fixedTime = { h: 10, m: 9.6, s: 36 };
  const movement = new Movement(watch.mat);
  const rotor = new Rotor(watch.mat);
  const vortex = new Vortex();
  const threads = new Threads();
  threads.mesh.renderOrder = 2;
  vortex.points.renderOrder = 3;
  scene.add(watch.root, movement.root, rotor.root, threads.mesh, vortex.points);

  /* ---------------------------------------------------------------- scroll + input */
  const scroll = new Scroll({ damping: reduceMotion ? 12 : 5.2, fixed: fixedP });
  const input = {
    px: 0, py: 0, tx: 0, ty: 0,
    yaw: 0, pitch: 0, vyaw: 0, vpitch: 0,
    dragging: false, idle: 0,
    inside: false,
  };
  const timeline = new Timeline({ stage, watch, movement, rotor, vortex, threads, camera });

  const cursor = document.getElementById('cursor');
  const cur = { x: innerWidth / 2, y: innerHeight / 2, mx: innerWidth / 2, my: innerHeight / 2, o: 0, s: 0.5 };
  const inFinal = () => scroll.value > 0.93;

  addEventListener(
    'pointermove',
    (e) => {
      input.tx = (e.clientX / innerWidth) * 2 - 1;
      input.ty = -((e.clientY / innerHeight) * 2 - 1);
      cur.mx = e.clientX;
      cur.my = e.clientY;
      input.inside = true;
      if (input.dragging) {
        const dx = e.clientX - input.lx;
        const dy = e.clientY - input.ly;
        input.lx = e.clientX;
        input.ly = e.clientY;
        const dt = Math.max(0.008, (e.timeStamp - input.lt) / 1000);
        input.lt = e.timeStamp;
        input.yaw += dx * 0.0085;
        input.pitch = clamp(input.pitch + dy * 0.0045, -0.7, 0.7);
        input.vyaw = clamp((dx * 0.0085) / dt, -9, 9);
        input.vpitch = 0;
      }
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => (input.inside = false));
  canvas.addEventListener('pointerdown', (e) => {
    if (!inFinal()) return;
    input.dragging = true;
    input.lx = e.clientX;
    input.ly = e.clientY;
    input.lt = e.timeStamp;
    input.vyaw = 0;
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dragging');
  });
  const endDrag = () => {
    if (!input.dragging) return;
    input.dragging = false;
    input.idle = 0;
    document.body.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // keyboard: arrows / space move between the story beats
  const beats = [0, 0.26, 0.4, 0.58, 0.78, 0.9, 1];
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) {
      const n = beats.find((b) => b > scroll.target + 0.01);
      if (n !== undefined) {
        e.preventDefault();
        scroll.scrollToProgress(n);
      }
    } else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) {
      const n = [...beats].reverse().find((b) => b < scroll.target - 0.01);
      if (n !== undefined) {
        e.preventDefault();
        scroll.scrollToProgress(n);
      }
    }
  });

  /* ---------------------------------------------------------------- resize */
  const resize = () => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    stage.resize(innerWidth, innerHeight);
    vortex.setView(stage, renderer.domElement.height);
    threads.setView(stage, renderer.domElement.height);
  };
  resize();
  addEventListener('resize', resize);

  /* ---------------------------------------------------------------- frame */
  let time = 0;
  let intro = q.has('intro') ? parseFloat(q.get('intro')) : reduceMotion || still || fixedP !== null ? 1 : 0;
  let slow = 0;

  const ctx = { intro: 1, px: 0, py: 0, dragYaw: 0, dragPitch: 0, dragAmt: 0 };
  const frame = (dt) => {
    time += dt;
    if (intro < 1) intro = Math.min(1, intro + dt / 2.6);
    const p = scroll.update(dt);

    // pointer smoothing + drag inertia / spring-back
    input.px = damp(input.px, input.tx, 4, dt);
    input.py = damp(input.py, input.ty, 4, dt);
    if (!input.dragging) {
      input.idle += dt;
      input.yaw += input.vyaw * dt;
      input.vyaw *= Math.exp(-3.2 * dt);
      if (input.idle > 2.4) {
        input.yaw = ((((input.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
        input.yaw = damp(input.yaw, 0, 2.2, dt);
        input.pitch = damp(input.pitch, 0, 2.2, dt);
      }
    }
    const final = clamp((p - 0.9) / 0.08);
    ctx.intro = intro;
    ctx.px = input.px;
    ctx.py = input.py;
    ctx.dragYaw = input.yaw * final;
    ctx.dragPitch = input.pitch * final;
    ctx.dragAmt = clamp(input.yaw / Math.PI, -1, 1) * final;
    timeline.update(p, time, ctx);

    watch.update(time);
    movement.update(time);

    // custom DRAG cursor, only in the finale and only with a mouse
    if (finePointer) {
      const want = inFinal() && input.inside ? 1 : 0;
      cur.o = damp(cur.o, want, 12, dt);
      cur.s = damp(cur.s, want ? (input.dragging ? 0.82 : 1) : 0.5, 14, dt);
      cur.x = damp(cur.x, cur.mx, 18, dt);
      cur.y = damp(cur.y, cur.my, 18, dt);
      cursor.style.opacity = cur.o.toFixed(3);
      cursor.style.setProperty('--x', cur.x.toFixed(1) + 'px');
      cursor.style.setProperty('--y', cur.y.toFixed(1) + 'px');
      cursor.style.setProperty('--s', cur.s.toFixed(3));
      document.body.classList.toggle('is-drag', want === 1);
    }

    renderer.render(scene, camera);
  };

  if (still) {
    // deterministic single frame for screenshots
    timeline.update(scroll.value, 2.0, { intro });
    watch.update(1.0);
    movement.update(1.0);
    renderer.render(scene, camera);
    frame(0.0001);
    frame(0.0001);
  } else {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame(dt);
      // adaptive resolution: back off on slow GPUs
      if (dt > 0.03) slow += dt;
      else slow = Math.max(0, slow - dt * 0.5);
      if (slow > 1.4 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        slow = 0;
        resize();
      }
      requestAnimationFrame(loop);
    };
    frame(0.0001);
    requestAnimationFrame((t) => {
      last = t;
      loop(t);
    });
  }

  document.body.classList.remove('is-loading');
  window.__setProgress = (p) => scroll.set(p);
  window.__dbg = { renderer, scene, camera, stage, watch, movement, rotor, vortex, threads, timeline, scroll, input };
  window.__ready = true;
}

document.body.classList.add('is-loading');
boot().catch((e) => {
  console.error(e);
  window.__error = String(e && e.stack ? e.stack : e);
  document.body.classList.remove('is-loading');
  window.__ready = true;
});
