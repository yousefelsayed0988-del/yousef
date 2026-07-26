// Minimal column-major mat4 / vec3 helpers. No dependency, no allocation in
// the hot paths (every function writes into a caller-supplied output).

export function mat4() { return new Float32Array(16); }

export function identity(o) {
  o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
}

export function perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect; o[5] = f; o[11] = -1;
  o[10] = (far + near) / (near - far);
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function lookAt(o, eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  o[15] = 1;
  return o;
}

export function multiply(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}

export function invert(o, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(o);
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

export function translate(o, x, y, z) {
  identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
}

export function scaleMat(o, x, y, z) {
  identity(o); o[0] = x; o[5] = y; o[10] = z; return o;
}

export function rotateY(o, a) {
  identity(o);
  const c = Math.cos(a), s = Math.sin(a);
  o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
  return o;
}

export function rotateX(o, a) {
  identity(o);
  const c = Math.cos(a), s = Math.sin(a);
  o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
  return o;
}

/** Extract the 6 frustum planes (in world space) from a view-projection matrix. */
export function frustumPlanes(out, m) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],   // left
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],   // right
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],   // bottom
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],   // top
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],  // near
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],  // far
  ];
  for (let i = 0; i < 6; i++) {
    const [a, b, c, d] = rows[i];
    const l = Math.hypot(a, b, c) || 1;
    out[i * 4] = a / l; out[i * 4 + 1] = b / l; out[i * 4 + 2] = c / l; out[i * 4 + 3] = d / l;
  }
  return out;
}

/** AABB vs frustum. Returns false only when definitely outside. */
export function aabbInFrustum(planes, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4], b = planes[i * 4 + 1], c = planes[i * 4 + 2], d = planes[i * 4 + 3];
    const px = a >= 0 ? x1 : x0;
    const py = b >= 0 ? y1 : y0;
    const pz = c >= 0 ? z1 : z0;
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
