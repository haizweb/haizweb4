/**
 * Maps the page layout (viewport fractions) to world units of the 3D scene.
 *
 * The camera never moves in z, so the plane z = 0 always shows `worldH` units over the viewport
 * height. "Stage coordinates" are -1..1 across the viewport (x to the right, y up).
 * `unit` is the world scale that makes the watch case ≈ 40 % of the viewport height
 * (limited by width on narrow screens), which is the size of the watch in the reference video.
 */
export class Stage {
  constructor(camera) {
    this.camera = camera;
    this.w = 1;
    this.h = 1;
    this.aspect = 1;
    this.worldH = 1;
    this.worldW = 1;
    this.unit = 1;
    this.portrait = false;
    this.resize(innerWidth, innerHeight);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.aspect = w / h;
    const cam = this.camera;
    cam.aspect = this.aspect;
    cam.updateProjectionMatrix();
    this.worldH = 2 * cam.position.z * Math.tan((cam.fov * Math.PI) / 360);
    this.worldW = this.worldH * this.aspect;
    // case diameter = 2 * unit  ->  0.40 of the viewport height, at most 0.62 of the width
    this.unit = Math.min(0.2 * this.worldH, 0.31 * this.worldW);
    this.portrait = this.aspect < 0.85;
  }

  x(sx) {
    return sx * this.worldW * 0.5;
  }

  y(sy) {
    return sy * this.worldH * 0.5;
  }

  /** world-space point on the z = 0 plane for stage coordinates */
  at(sx, sy, z = 0) {
    return [this.x(sx), this.y(sy), z];
  }
}
