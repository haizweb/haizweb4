import * as THREE from 'three';
import { rng } from '../core/math.js';

/* ====================================================================== swirl of particles */

const vortexVS = /* glsl */ `
  uniform float uTime;
  uniform float uProg;
  uniform float uSize;
  uniform float uPx;
  uniform vec3 uCenter;
  uniform vec2 uSpan;
  attribute vec4 aSeed;
  attribute float aSize;
  varying float vA;
  varying float vTw;
  const float TAU = 6.2831853;
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  void main() {
    float u = aSeed.x;
    float j1 = aSeed.y - 0.5;
    float j2 = aSeed.z - 0.5;
    float r = aSeed.w;
    float grow = smoothstep(0.0, 1.0, uProg);
    vec3 p;
    float fade = 1.0;
    if (r < 0.64) {
      // a swirling ellipse seen in perspective, dense on one side
      float th = (u + uTime * (0.04 + 0.05 * fract(r * 13.0))) * TAU;
      float dens = 0.5 + 0.5 * sin(th + 0.9);
      float spread = 0.02 + 0.2 * pow(1.0 - dens, 2.2);
      vec2 e = vec2(cos(th) * uSpan.x, sin(th) * uSpan.y);
      e += vec2(j1, j2) * spread * uSpan.y * 2.4;
      e = rot(-0.2) * e;
      p = vec3(e, sin(th * 2.0 + u * 6.0) * 0.7 + j1 * 0.6);
      fade = 0.3 + 0.7 * dens;
    } else {
      // diagonal stream crossing the ring
      float s = fract(u + uTime * 0.055);
      vec2 a = vec2(-uSpan.x * 0.95, uSpan.y * 1.8);
      vec2 b = vec2(uSpan.x * 0.62, -uSpan.y * 1.6);
      float wob = 0.05 + 0.5 * pow(abs(sin(s * 9.0 + 1.0)), 1.6);
      vec2 e = mix(a, b, s) + vec2(j1, j2) * 0.1 * uSpan.y * wob * 2.0;
      p = vec3(e, 0.4 + j1);
      fade = smoothstep(0.0, 0.1, s) * smoothstep(1.0, 0.72, s);
    }
    p *= 0.5 + 0.5 * grow;
    p += uCenter;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * aSize * uPx / -mv.z);
    vA = fade * grow;
    vTw = 0.55 + 0.45 * sin(uTime * 3.2 + r * 90.0);
  }
`;

const vortexFS = /* glsl */ `
  uniform float uLight;
  uniform float uOpacity;
  varying float vA;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.04, d);
    vec3 col = mix(vec3(1.0), vec3(0.26, 0.28, 0.33), uLight);
    gl_FragColor = vec4(col, a * vA * vTw * uOpacity);
  }
`;

export class Vortex {
  constructor(count = 56000) {
    const geo = new THREE.BufferGeometry();
    const r = rng(21);
    const seed = new Float32Array(count * 4);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seed[i * 4] = r();
      seed[i * 4 + 1] = r();
      seed[i * 4 + 2] = r();
      seed[i * 4 + 3] = r();
      size[i] = (0.5 + r() * r() * 2.6) * (r() < 0.035 ? 2.2 : 1);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vortexVS,
      fragmentShader: vortexFS,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uSize: { value: 0.0145 },
        uPx: { value: 800 },
        uCenter: { value: new THREE.Vector3(0.2, -0.1, 0.6) },
        uSpan: { value: new THREE.Vector2(3.4, 0.95) },
        uLight: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  setView(stage, heightPx) {
    const u = this.material.uniforms;
    u.uPx.value = (heightPx * 0.5) / Math.tan((stage.camera.fov * Math.PI) / 360);
    u.uSpan.value.set(Math.min(stage.worldW * 0.3, stage.worldH * 0.95), stage.worldH * 0.165);
  }
}

/* ====================================================================== white fibre ropes */

// Five ropes made of hundreds of hair-fine strands. Every strand sits at a fixed spot of the rope's
// (twisting, flattened) cross-section, so the bundles read as flat ribbons that pinch and open up as
// they twist — exactly like fibre / silk ropes. Everything is evaluated analytically in the vertex
// shader, so the geometry is static and the animation costs nothing on the CPU.

const threadVS = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform float uWidth;
  uniform float uReveal;
  uniform float uZoom;
  uniform vec2 uHalf;
  uniform vec3 uCenter;
  attribute vec4 aInfo;
  varying float vA;
  varying float vShade;
  varying float vSide;
  const float TAU = 6.2831853;
  float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  vec3 h31(float n) { return vec3(h11(n), h11(n + 17.3), h11(n + 41.7)); }

  vec3 base(float u, float b) {
    float t = uTime;
    vec3 c;
    if (b < 0.5) {
      float th = TAU * (1.14 * u - 0.12) + 0.5;
      c = vec3(0.40 + 0.52 * cos(th) * (1.0 + 0.12 * sin(2.0 * th)), -0.04 + 0.66 * sin(th), 0.9 * sin(1.5 * th));
    } else if (b < 1.5) {
      c = vec3(-1.25 + 2.5 * u, 0.14 - 0.46 * sin(3.14159 * 1.25 * u + 0.5) + 0.1 * sin(5.0 * u + t * 0.3), 0.7 * sin(3.0 * u));
    } else if (b < 2.5) {
      c = vec3(-0.98 + 1.8 * u + 0.08 * sin(7.0 * u), -0.72 + 1.58 * pow(u, 1.35) - 0.12 * sin(4.0 * u), sin(2.5 * u));
    } else if (b < 3.5) {
      c = vec3(0.78 + 0.1 * sin(9.0 * u + t * 0.5) + 0.12 * cos(5.5 * u), 1.14 - 0.98 * u, 0.4 * sin(6.0 * u));
    } else {
      float th = TAU * u;
      c = vec3(-0.52 + 0.27 * sin(th), -0.5 + 0.2 * sin(2.0 * th), 0.5 * cos(th));
    }
    c.y += 0.025 * sin(u * 6.0 + t * 0.45 + b * 2.1);
    c.xy *= uHalf;
    c.z *= uHalf.y * 0.6;
    return c;
  }

  float ropeR(float u, float b) {
    float k = b < 0.5 ? 0.15 : b < 1.5 ? 0.14 : b < 2.5 ? 0.11 : b < 3.5 ? 0.05 : 0.06;
    return k * (uHalf.y / 3.0) * (0.22 + 0.78 * pow(sin(3.14159 * clamp(u, 0.0, 1.0)), 0.7));
  }

  vec3 strand(float u, float seed, float b) {
    vec3 c = base(u, b);
    vec3 T = normalize(base(u + 0.012, b) - base(u - 0.012, b));
    vec3 N0 = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
    vec3 B0 = cross(T, N0);
    float tw = TAU * (1.5 * u + h11(b * 3.1)) + uTime * 0.12;
    vec3 N = N0 * cos(tw) + B0 * sin(tw);
    vec3 B = -N0 * sin(tw) + B0 * cos(tw);
    float ph = TAU * h11(seed * 91.7);
    float rr = sqrt(h11(seed * 13.3 + 1.0));
    vec2 ab = rr * vec2(cos(ph), sin(ph));
    float R = ropeR(u, b);
    float stray = step(0.84, h11(seed * 57.1));
    float fray = 1.0 + stray * 4.2 * smoothstep(0.4, 1.0, u) * h11(seed * 3.7);
    vec3 off = (N * ab.x + B * ab.y * 0.34) * R * fray;
    float wv = sin(u * TAU * (3.0 + 5.0 * h11(seed * 5.0)) + seed * 50.0 + uTime * 0.4);
    off += N0 * wv * R * 0.1;
    return c + off;
  }

  void main() {
    float u = aInfo.x;
    float side = aInfo.y;
    float seed = aInfo.z;
    float b = aInfo.w;
    vec3 pa = strand(u, seed, b) * uZoom + uCenter;
    vec3 pb = strand(min(u + 0.008, 1.0), seed, b) * uZoom + uCenter;
    vec4 ca = projectionMatrix * viewMatrix * vec4(pa, 1.0);
    vec4 cb = projectionMatrix * viewMatrix * vec4(pb, 1.0);
    vec2 na = ca.xy / ca.w;
    vec2 nb = cb.xy / cb.w;
    vec2 d = nb - na;
    d.x *= uAspect;
    float len = length(d);
    d = len > 1e-7 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-d.y, d.x);
    float taper = smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.93, u);
    float w = uWidth * (0.55 + 0.9 * h11(seed * 5.0 + 2.0)) * (0.35 + 0.65 * taper);
    vec2 off = nrm * side * w;
    off.x /= uAspect;
    gl_Position = ca + vec4(off * ca.w, 0.0, 0.0);
    float head = uReveal * 1.35;
    float grow = 1.0 - smoothstep(head - 0.3, head, u + 0.2 * h11(seed * 7.7));
    float flow = 0.5 + 0.5 * sin(u * 22.0 - uTime * 1.1 + seed * 40.0) * (0.6 + 0.4 * sin(u * 61.0 + seed * 17.0));
    float s0 = 0.16 * h11(seed * 31.1);
    float s1 = 1.0 - 0.16 * h11(seed * 37.7);
    float ends = smoothstep(s0, s0 + 0.05, u) * smoothstep(s1, s1 - 0.05, u);
    vA = grow * taper * ends * (0.5 + 0.5 * flow) * (0.3 + 0.7 * h11(seed * 19.0));
    vShade = h11(seed * 9.0 + b);
    vSide = side;
  }
`;

const threadFS = /* glsl */ `
  uniform float uLight;
  uniform float uOpacity;
  varying float vA;
  varying float vShade;
  varying float vSide;
  void main() {
    float e = 1.0 - abs(vSide);
    float a = smoothstep(0.0, 0.7, e) * vA * uOpacity;
    vec3 bright = mix(vec3(0.985, 0.97, 0.935), vec3(0.8, 0.82, 0.87), vShade);
    vec3 dark = mix(vec3(0.46, 0.48, 0.53), vec3(0.2, 0.22, 0.26), vShade);
    gl_FragColor = vec4(mix(bright, dark, uLight), a);
  }
`;

export class Threads {
  constructor({ counts = [230, 230, 170, 80, 80], segs = 120 } = {}) {
    const strands = counts.reduce((a, b) => a + b, 0);
    const verts = strands * (segs + 1) * 2;
    const info = new Float32Array(verts * 4);
    const index = new Uint32Array(strands * segs * 6);
    const r = rng(5);
    let v = 0;
    let ii = 0;
    let s = 0;
    counts.forEach((n, b) => {
      for (let k = 0; k < n; k++, s++) {
        const seed = 0.05 + r() * 0.9;
        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          for (const side of [-1, 1]) {
            info[v * 4] = u;
            info[v * 4 + 1] = side;
            info[v * 4 + 2] = seed;
            info[v * 4 + 3] = b;
            v++;
          }
        }
        const base = s * (segs + 1) * 2;
        for (let j = 0; j < segs; j++) {
          const a = base + j * 2;
          index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
          ii += 6;
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: threadVS,
      fragmentShader: threadFS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1.7 },
        uWidth: { value: 0.003 },
        uReveal: { value: 0 },
        uZoom: { value: 1 },
        uHalf: { value: new THREE.Vector2(5.3, 3.0) },
        uCenter: { value: new THREE.Vector3(0, 0, 0) },
        uLight: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setView(stage, heightPx) {
    const u = this.material.uniforms;
    u.uAspect.value = stage.aspect;
    u.uWidth.value = 2.1 / heightPx;
    u.uHalf.value.set(stage.worldW * 0.5, stage.worldH * 0.5);
  }
}
