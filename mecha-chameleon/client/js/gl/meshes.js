// Unit primitives, generated once at boot. Every prop, every chameleon part and
// every tracer in the game is one of these four meshes scaled by an instance
// attribute - that is what keeps a 600-prop map down to four draw calls.

/** Unit cube, centred on the origin, extents -0.5..0.5. Flat normals. */
export function unitBox() {
  const p = [], n = [], idx = [];
  const faces = [
    { nrm: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { nrm: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { nrm: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { nrm: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { nrm: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { nrm: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  for (const f of faces) {
    const base = p.length / 3;
    for (const v of f.v) { p.push(...v); n.push(...f.nrm); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos: new Float32Array(p), nrm: new Float32Array(n), idx: new Uint16Array(idx) };
}

/** Unit cylinder: radius 0.5, height 1, axis +Y. */
export function unitCylinder(sides = 18) {
  const p = [], n = [], idx = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0) * 0.5, s0 = Math.sin(a0) * 0.5;
    const c1 = Math.cos(a1) * 0.5, s1 = Math.sin(a1) * 0.5;
    const base = p.length / 3;
    p.push(c0, -0.5, s0, c1, -0.5, s1, c1, 0.5, s1, c0, 0.5, s0);
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    n.push(...n0, ...n1, ...n1, ...n0);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (const [y, ny] of [[0.5, 1], [-0.5, -1]]) {
    const centre = p.length / 3;
    p.push(0, y, 0); n.push(0, ny, 0);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      p.push(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5);
      n.push(0, ny, 0);
    }
    for (let i = 0; i < sides; i++) {
      if (ny > 0) idx.push(centre, centre + 1 + i, centre + 2 + i);
      else idx.push(centre, centre + 2 + i, centre + 1 + i);
    }
  }
  return { pos: new Float32Array(p), nrm: new Float32Array(n), idx: new Uint16Array(idx) };
}

/** Unit sphere: radius 0.5, smooth normals. */
export function unitSphere(rings = 12, segs = 18) {
  const p = [], n = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      p.push(x * 0.5, y * 0.5, z * 0.5);
      n.push(x, y, z);
    }
  }
  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s, b = a + stride;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { pos: new Float32Array(p), nrm: new Float32Array(n), idx: new Uint16Array(idx) };
}

/** Unit wedge: a 1x1x1 box with the +Y/-Z edge collapsed, i.e. a ramp facing -Z. */
export function unitWedge() {
  const p = [], n = [], idx = [];
  const quad = (nrm, a, b, c, d) => {
    const base = p.length / 3;
    for (const v of [a, b, c, d]) { p.push(...v); n.push(...nrm); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const tri = (nrm, a, b, c) => {
    const base = p.length / 3;
    for (const v of [a, b, c]) { p.push(...v); n.push(...nrm); }
    idx.push(base, base + 1, base + 2);
  };
  // Bottom
  quad([0, -1, 0], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]);
  // Back (tall side, +Z)
  quad([0, 0, 1], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]);
  // Slope
  const sy = 1 / Math.sqrt(2);
  quad([0, sy, -sy], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]);
  // Sides
  tri([1, 0, 0], [0.5, -0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]);
  tri([-1, 0, 0], [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]);
  return { pos: new Float32Array(p), nrm: new Float32Array(n), idx: new Uint16Array(idx) };
}

export function buildPrimitives() {
  return [unitBox(), unitCylinder(), unitSphere(), unitWedge()];
}
