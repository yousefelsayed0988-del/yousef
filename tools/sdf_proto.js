/* Prototype + test rig for the SDF / surface-nets mesher, run in plain node
   so it can be iterated in seconds rather than through the browser.
   node tools/sdf_proto.js                                                  */

/* ======================================================================
   SIGNED DISTANCE FIELD
   Every form is a distance function. Unioning two of them with a smooth
   minimum makes them grow into each other instead of intersecting, which
   is the whole point: a deltoid stops being a ball sitting on an arm and
   becomes a shoulder.
   ====================================================================== */

// polynomial smooth minimum - k is how far the blend reaches, in metres
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

/* an ellipsoid, bound-corrected so the field stays close to a true distance */
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
  if (k0 === 0) return -Math.min(rx, ry, rz);
  const k1 = Math.sqrt((x / (rx * rx)) * (x / (rx * rx)) + (y / (ry * ry)) * (y / (ry * ry)) + (z / (rz * rz)) * (z / (rz * rz)));
  return k0 * (k0 - 1.0) / k1;
}

/* a tapered capsule between two points - the workhorse for limbs and tubes */
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1.0 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = (rr < 0 ? -1 : 1) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/* ======================================================================
   SURFACE NETS
   One vertex per cell that straddles the surface, placed at the average of
   the zero crossings on that cell's edges, then a quad across every grid
   edge that flips sign. No 256-entry tables, no cracks, and it gives the
   soft continuous surface an organic body wants.
   ====================================================================== */

const CUBE = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

function surfaceNets(field, min, max, res, opts) {
  opts = opts || {};
  const nx = res[0], ny = res[1], nz = res[2];
  const dx = (max[0] - min[0]) / nx, dy = (max[1] - min[1]) / ny, dz = (max[2] - min[2]) / nz;

  // sample the field on the grid corners
  const gw = nx + 1, gh = ny + 1, gd = nz + 1;
  const g = new Float32Array(gw * gh * gd);
  let i = 0;
  for (let k = 0; k < gd; k++) {
    const z = min[2] + k * dz;
    for (let j = 0; j < gh; j++) {
      const y = min[1] + j * dy;
      for (let ii = 0; ii < gw; ii++) {
        g[i++] = field(min[0] + ii * dx, y, z);
      }
    }
  }
  const at = (a, b, c) => g[(c * gh + b) * gw + a];

  // one vertex per straddling cell
  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let ii = 0; ii < nx; ii++) {
    let neg = 0;
    const v = [];
    for (let c = 0; c < 8; c++) {
      const d = at(ii + CUBE[c][0], j + CUBE[c][1], k + CUBE[c][2]);
      v.push(d);
      if (d < 0) neg++;
    }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const da = v[a], db = v[b];
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db);
      sx += CUBE[a][0] + (CUBE[b][0] - CUBE[a][0]) * t;
      sy += CUBE[a][1] + (CUBE[b][1] - CUBE[a][1]) * t;
      sz += CUBE[a][2] + (CUBE[b][2] - CUBE[a][2]) * t;
      n++;
    }
    cellIndex[(k * ny + j) * nx + ii] = pos.length / 3;
    pos.push(min[0] + (ii + sx / n) * dx, min[1] + (j + sy / n) * dy, min[2] + (k + sz / n) * dz);
  }

  // a quad across every grid edge that flips sign
  const idx = [];
  const cell = (a, b, c) => (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz)
    ? -1 : cellIndex[(c * ny + b) * nx + a];
  /* Wound to match the rest of the engine. Every primitive in the game -
     loft, blob, cyl - comes out with a NEGATIVE signed volume, and the
     renderer is built around that, so a mesher that produced the textbook
     positive winding would hand back a body turned inside out. */
  const quad = (q0, q1, q2, q3, flip) => {
    if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) return;
    if (flip) { idx.push(q0, q2, q1, q0, q3, q2); }
    else { idx.push(q0, q1, q2, q0, q2, q3); }
  };
  for (let k = 0; k < gd; k++) for (let j = 0; j < gh; j++) for (let ii = 0; ii < gw; ii++) {
    const d0 = at(ii, j, k);
    if (ii < nx) {
      const d1 = at(ii + 1, j, k);
      if ((d0 < 0) !== (d1 < 0))
        quad(cell(ii, j - 1, k - 1), cell(ii, j, k - 1), cell(ii, j, k), cell(ii, j - 1, k), d0 < 0);
    }
    if (j < ny) {
      const d1 = at(ii, j + 1, k);
      if ((d0 < 0) !== (d1 < 0))
        quad(cell(ii - 1, j, k - 1), cell(ii, j, k - 1), cell(ii, j, k), cell(ii - 1, j, k), d0 >= 0);
    }
    if (k < nz) {
      const d1 = at(ii, j, k + 1);
      if ((d0 < 0) !== (d1 < 0))
        quad(cell(ii - 1, j - 1, k), cell(ii, j - 1, k), cell(ii, j, k), cell(ii - 1, j, k), d0 < 0);
    }
  }

  // normals straight off the field gradient - smoother than anything you
  // can average out of the triangles
  const h = Math.min(dx, dy, dz) * 0.55;
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = field(x + h, y, z) - field(x - h, y, z);
    let gy = field(x, y + h, z) - field(x, y - h, z);
    let gz = field(x, y, z + h) - field(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  return { pos: new Float32Array(pos), nrm, idx };
}

/* ---------------------------------------------------------------- tests */
if (require.main === module) {
  const t0 = Date.now();

  // 1. a lone sphere: area and radius should come out right
  let f = (x, y, z) => sdEllipsoid(x, y, z, 0, 0, 0, 0.5, 0.5, 0.5);
  let m = surfaceNets(f, [-0.7, -0.7, -0.7], [0.7, 0.7, 0.7], [48, 48, 48]);
  let rmin = 9, rmax = 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    const r = Math.hypot(m.pos[i], m.pos[i + 1], m.pos[i + 2]);
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
  }
  console.log('sphere: verts=' + (m.pos.length / 3) + ' tris=' + (m.idx.length / 3) +
    ' radius ' + rmin.toFixed(4) + '..' + rmax.toFixed(4) + ' (want 0.5)');

  // 2. watertight? every edge must be shared by exactly two triangles
  const edgeCount = new Map();
  for (let i = 0; i < m.idx.length; i += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const p = m.idx[i + a], q = m.idx[i + b];
      const key = p < q ? p + ':' + q : q + ':' + p;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  let bad = 0;
  for (const c of edgeCount.values()) if (c !== 2) bad++;
  console.log('sphere: non-manifold edges = ' + bad + ' (want 0)');

  // 3. consistent winding? signed volume should be positive and match 4/3 pi r^3
  const signedVol = (mm) => {
    let V = 0;
    for (let i = 0; i < mm.idx.length; i += 3) {
      const a = mm.idx[i] * 3, b = mm.idx[i + 1] * 3, c = mm.idx[i + 2] * 3;
      const ax = mm.pos[a], ay = mm.pos[a + 1], az = mm.pos[a + 2];
      const bx = mm.pos[b], by = mm.pos[b + 1], bz = mm.pos[b + 2];
      const cx = mm.pos[c], cy = mm.pos[c + 1], cz = mm.pos[c + 2];
      V += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return V;
  };
  console.log('sphere: signed volume = ' + signedVol(m).toFixed(5) +
    ' (want about -' + (4 / 3 * Math.PI * 0.125).toFixed(5) + ' to match the engine)');

  // 4. the actual point of the exercise: two spheres that BLEND
  const hard = (x, y, z) => Math.min(
    sdEllipsoid(x, y, z, -0.22, 0, 0, 0.3, 0.3, 0.3),
    sdEllipsoid(x, y, z, 0.22, 0, 0, 0.3, 0.3, 0.3));
  const soft = (x, y, z) => smin(
    sdEllipsoid(x, y, z, -0.22, 0, 0, 0.3, 0.3, 0.3),
    sdEllipsoid(x, y, z, 0.22, 0, 0, 0.3, 0.3, 0.3), 0.30);
  // measure the waist: the surface radius in the y-z plane at x = 0
  const waist = (fn) => {
    let r = 0;
    for (let s = 0; s < 400; s++) { if (fn(0, s * 0.002, 0) < 0) r = s * 0.002; }
    return r;
  };
  console.log('two spheres, hard union waist = ' + waist(hard).toFixed(3) +
    '  smooth union waist = ' + waist(soft).toFixed(3) + ' (bigger = filleted, no crease)');

  // 5. a limb: does the round cone taper?
  const limb = (x, y, z) => sdRoundCone(x, y, z, 0, 0.4, 0, 0, -0.4, 0, 0.12, 0.06);
  const width = (yy) => { let r = 0; for (let s = 0; s < 400; s++) { if (limb(s * 0.001, yy, 0) < 0) r = s * 0.001; } return r; };
  console.log('round cone: r at top = ' + width(0.38).toFixed(3) + ' at bottom = ' + width(-0.38).toFixed(3) +
    ' (want ~0.12 and ~0.06)');

  // 6. cost at the resolution the body will actually use
  const t1 = Date.now();
  let calls = 0;
  const body = (x, y, z) => {
    calls++;
    let d = 1e9;
    for (let s = 0; s < 40; s++) d = smin(d, sdEllipsoid(x, y, z, (s % 5) * 0.05 - 0.1, (s % 7) * 0.06, 0, 0.14, 0.11, 0.10), 0.04);
    return d;
  };
  const big = surfaceNets(body, [-0.5, -0.2, -0.4], [0.5, 0.7, 0.4], [80, 90, 64]);
  console.log('40-primitive field at 80x90x64: ' + (Date.now() - t1) + ' ms, ' +
    (big.pos.length / 3) + ' verts, ' + (big.idx.length / 3) + ' tris, ' + calls + ' field evals');
  console.log('total ' + (Date.now() - t0) + ' ms');
}

module.exports = { smin, sdEllipsoid, sdRoundCone, surfaceNets };
