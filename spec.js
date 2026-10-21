// Shared dimensions of the watch. 1 unit = the case radius (≈ 21 mm), so the case is 2 units wide.
// The dial faces +Z, 12 o'clock is +Y, 3 o'clock is +X.

export const SPEC = {
  // case
  caseR: 1.0,
  caseTop: 0.162,
  caseBottom: -0.3,
  bezelIn: 0.8,
  bezelOut: 0.975,

  // dial stack (z levels)
  dialR: 0.775,
  dialZ: 0.0,
  crystalZ: 0.15,
  handZ: [0.042, 0.058, 0.074],

  // dial layout
  numeralR: 0.6,
  numeralH: 0.1,
  trackIn: 0.665,
  trackOut: 0.755,
  moon: { x: 0, y: 0.355, r: 0.19 },
  heart: { x: 0, y: -0.37, r: 0.19 },
  date: { x: 0.545, y: 0, w: 0.2, h: 0.135 },

  // bracelet
  braceW: 1.02,
  linksPerSide: 11,
  wrist: { ay: 1.7, az: 1.3, firstY: 1.36, firstZ: -0.18 },
};
