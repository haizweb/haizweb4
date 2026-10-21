import * as THREE from 'three';

/**
 * Procedural "product photography" environment: a soft gradient dome with a few bright
 * soft-boxes. It is baked once into a PMREM cube-map, which gives the steel its long,
 * smooth studio reflections without shipping any HDRI file.
 */
export function createStudioEnvironment(renderer) {
  const scene = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 floorC = vec3(0.055, 0.058, 0.065);
          vec3 horizon = vec3(0.50, 0.52, 0.56);
          vec3 zenith = vec3(0.86, 0.88, 0.92);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.95, h));
          col = mix(col, floorC, smoothstep(0.0, -0.45, h));
          // very slight warm / cool split for life in the reflections
          col *= 1.0 + 0.10 * vDir.x;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  scene.add(dome);

  const box = (w, h, intensity, pos, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tint[0] * intensity, tint[1] * intensity, tint[2] * intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
    return m;
  };

  box(22, 12, 5.0, [0, 15, 5]); // key softbox above
  box(4, 24, 5.5, [-14, 1, 6], [1.0, 0.98, 0.95]); // left strip
  box(4, 24, 4.0, [14, 0, 4], [0.95, 0.98, 1.0]); // right strip
  box(30, 6, 3.0, [0, 6, -16]); // rim behind
  box(26, 18, 1.35, [0, 0, 18]); // broad front fill (flat faces facing the lens)
  box(8, 8, 9.0, [-8, 7, 10]); // hot spot for crisp highlights
  box(26, 3, 1.6, [0, -9, 8], [1.0, 0.97, 0.92]); // low warm bounce

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02, 0.1, 200);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return target.texture;
}
