// Sub-chunk mesher. Runs inside a worker; pure function of its input snapshot.
//
// Input is an 18^3 padded snapshot of one 16^3 section (blocks, states, sky
// light, block light) plus an 18x18 column tint map. Output is two interleaved
// vertex buffers (opaque/alpha-tested, and translucent water) ready to upload.
//
// Vertex layout, 24 bytes:
//   0  vec3  position   (float32, section-local 0..16)
//   12 vec2  uv         (uint8 normalised)
//   14 uint  layer      (uint16, texture-array layer)
//   16 uvec4 light      (uint8: skyLight, blockLight, ao, normalIndex)
//   20 vec4  tint       (uint8 normalised RGB + flags)

import { buildModel, isCrossRender, st, R } from './models.js';

export const STRIDE = 24;
const PAD = 18;
const pidx = (x, y, z) => ((y + 1) * PAD + (z + 1)) * PAD + (x + 1);
const tidx = (x, z) => (z + 1) * PAD + (x + 1);

// face -> unit normal
const FN = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
// face -> the two tangent axes used for AO/light corner sampling
const FT = [
  [[0, 1, 0], [0, 0, 1]],   // -X
  [[0, 1, 0], [0, 0, 1]],   // +X
  [[1, 0, 0], [0, 0, 1]],   // -Y
  [[1, 0, 0], [0, 0, 1]],   // +Y
  [[1, 0, 0], [0, 1, 0]],   // -Z
  [[1, 0, 0], [0, 1, 0]],   // +Z
];
// corner order per face, as (t1sign, t2sign) matching the vertex order below
const FC = [
  [[1, 1], [1, -1], [-1, -1], [-1, 1]],
  [[1, -1], [1, 1], [-1, 1], [-1, -1]],
  [[-1, 1], [-1, -1], [1, -1], [1, 1]],
  [[1, -1], [1, 1], [-1, 1], [-1, -1]],
  [[-1, 1], [1, 1], [1, -1], [-1, -1]],
  [[1, 1], [-1, 1], [-1, -1], [1, -1]],
];

// unit-cube corner positions per face, in winding order
const FV = [
  [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]],
  [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
  [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]],
];

const SHADE = [0.72, 0.72, 0.55, 1.0, 0.86, 0.86];  // baked directional shading

class Builder {
  constructor() {
    this.cap = 1 << 16;
    this.buf = new ArrayBuffer(this.cap * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.u16 = new Uint16Array(this.buf);
    this.n = 0;
    this.idx = new Uint32Array(this.cap * 3 / 2 | 0);
    this.ni = 0;
  }
  reset() { this.n = 0; this.ni = 0; }
  grow(need) {
    if (this.n + need <= this.cap) return;
    let cap = this.cap;
    while (cap < this.n + need) cap *= 2;
    const buf = new ArrayBuffer(cap * STRIDE);
    new Uint8Array(buf).set(this.u8.subarray(0, this.n * STRIDE));
    this.cap = cap; this.buf = buf;
    this.f32 = new Float32Array(buf); this.u8 = new Uint8Array(buf); this.u16 = new Uint16Array(buf);
    const idx = new Uint32Array(cap * 3 / 2 | 0);
    idx.set(this.idx.subarray(0, this.ni));
    this.idx = idx;
  }
  vertex(x, y, z, u, v, layer, sky, blk, ao, norm, tr, tg, tb, flags) {
    const o = this.n * STRIDE;
    const fo = o >> 2;
    this.f32[fo] = x; this.f32[fo + 1] = y; this.f32[fo + 2] = z;
    this.u8[o + 12] = u; this.u8[o + 13] = v;
    this.u16[(o >> 1) + 7] = layer;
    this.u8[o + 16] = sky; this.u8[o + 17] = blk; this.u8[o + 18] = ao; this.u8[o + 19] = norm;
    this.u8[o + 20] = tr; this.u8[o + 21] = tg; this.u8[o + 22] = tb; this.u8[o + 23] = flags;
    this.n++;
  }
  quad(flip) {
    const b = this.n - 4;
    const i = this.idx;
    if (flip) {
      i[this.ni++] = b; i[this.ni++] = b + 1; i[this.ni++] = b + 2;
      i[this.ni++] = b; i[this.ni++] = b + 2; i[this.ni++] = b + 3;
    } else {
      i[this.ni++] = b; i[this.ni++] = b + 1; i[this.ni++] = b + 2;
      i[this.ni++] = b; i[this.ni++] = b + 2; i[this.ni++] = b + 3;
    }
  }
  take() {
    if (this.n === 0) return null;
    return {
      verts: this.buf.slice(0, this.n * STRIDE),
      idx: this.idx.slice(0, this.ni).buffer,
      count: this.ni,
      vertexCount: this.n,
    };
  }
}

const OPAQUE = new Builder();
const TRANS = new Builder();
const BOXES = new Array(16);

/**
 * @param {object} job snapshot + tables
 * @returns {object} { opaque, translucent }
 */
export function meshSection(job, T) {
  const { blocks, states, sky, light, grassTint, foliageTint, waterTint, smooth } = job;
  OPAQUE.reset(); TRANS.reset();

  const render = T.render, cube = T.cube, opacity = T.opacity, selfCull = T.selfCull;
  const faceLayer = T.faceLayer, special = T.special, tintKind = T.tint, pass = T.pass;

  // neighbour connection query used by fences/panes
  let curX = 0, curY = 0, curZ = 0, curId = 0;
  const nbConnect = (face) => {
    const d = FN[face];
    const nid = blocks[pidx(curX + d[0], curY + d[1], curZ + d[2])];
    if (nid === 0) return false;
    const r = render[nid];
    if (nid === curId) return true;
    if (r === R.fence || r === R.gate || r === R.pane) return true;
    return cube[nid] === 1 && opacity[nid] >= 15;
  };

  for (let y = 0; y < 16; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const p = pidx(x, y, z);
        const id = blocks[p];
        if (id === 0 || id === T.caveAirId) continue;
        const r = render[id];
        if (r === R.air) continue;
        const state = states[p];
        curX = x; curY = y; curZ = z; curId = id;

        const B = pass[id] === 2 ? TRANS : OPAQUE;

        if (r === R.liquid) {
          emitLiquid(B, T, job, x, y, z, id, state);
          continue;
        }
        if (isCrossRender(r)) {
          emitCross(B, T, job, x, y, z, id, state, r);
          continue;
        }

        const n = buildModel(r, state, BOXES, nbConnect);
        for (let bi = 0; bi < n; bi++) {
          emitBox(B, T, job, x, y, z, id, state, r, BOXES[bi], smooth);
        }
      }
    }
  }

  return { opaque: OPAQUE.take(), translucent: TRANS.take() };
}

/** Resolve which atlas layer a given face of a block uses. */
function layerFor(T, id, state, face, render) {
  const base = id * 6;
  switch (render) {
    case R.pillar: {
      const axis = st.axis(state);
      if (axis === 1) return T.faceLayer[base + (face === 0 || face === 1 ? 3 : 0)];
      if (axis === 2) return T.faceLayer[base + (face === 4 || face === 5 ? 3 : 0)];
      return T.faceLayer[base + face];
    }
    case R.facing: {
      const facing = st.facing(state);
      const frontFace = facing === 0 ? 4 : facing === 1 ? 1 : facing === 2 ? 5 : 0;
      if (face === frontFace) {
        const lit = st.lit(state);
        const l = lit ? T.special[id * 4 + 1] : 0;
        return l ? l : T.special[id * 4 + 0] || T.faceLayer[base + face];
      }
      return T.faceLayer[base + face];
    }
    case R.door:
      return st.doorUpper(state) ? (T.special[id * 4 + 0] || T.faceLayer[base + face]) : T.faceLayer[base + face];
    case R.farmland:
      if (face === 3 && st.moisture(state) > 0) return T.special[id * 4 + 2] || T.faceLayer[base + face];
      return T.faceLayer[base + face];
    default:
      return T.faceLayer[base + face];
  }
}

function sampleTint(T, job, id, x, z) {
  const kind = T.tint[id];
  if (kind === 0) return 0xffffff;
  const t = tidx(x, z);
  if (kind === 1) return job.grassTint[t];
  if (kind === 2) return job.foliageTint[t];
  return job.waterTint[t];
}

function emitBox(B, T, job, x, y, z, id, state, render, box, smooth) {
  const { blocks, sky, light } = job;
  const tint = sampleTint(T, job, id, x, z);
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const isFull = box.x0 === 0 && box.y0 === 0 && box.z0 === 0 && box.x1 === 1 && box.y1 === 1 && box.z1 === 1;

  for (let f = 0; f < 6; f++) {
    const slot = box.f[f];
    if (slot < 0) continue;
    // is this face flush with the block boundary? only then can it be culled
    let boundary = false;
    switch (f) {
      case 0: boundary = box.x0 === 0; break;
      case 1: boundary = box.x1 === 1; break;
      case 2: boundary = box.y0 === 0; break;
      case 3: boundary = box.y1 === 1; break;
      case 4: boundary = box.z0 === 0; break;
      case 5: boundary = box.z1 === 1; break;
    }
    const d = FN[f];
    const nx = x + d[0], ny = y + d[1], nz = z + d[2];
    const np = pidx(nx, ny, nz);
    const nid = blocks[np];
    if (boundary) {
      if (T.cube[nid] === 1 && T.opacity[nid] >= 15) continue;
      if (nid === id && T.selfCull[id] === 1) continue;
      if (isFull && T.render[nid] === R.liquid && T.pass[id] === 2) continue;
    }

    const layer = layerFor(T, id, state, slot, render);
    const nSky = sky[np], nBlk = light[np];
    const verts = FV[f];
    const corners = FC[f];
    const [t1, t2] = FT[f];

    for (let c = 0; c < 4; c++) {
      const cv = verts[c];
      const px = cv[0] ? box.x1 : box.x0;
      const py = cv[1] ? box.y1 : box.y0;
      const pz = cv[2] ? box.z1 : box.z0;

      let u, v;
      switch (f) {
        case 0: u = pz; v = 1 - py; break;
        case 1: u = 1 - pz; v = 1 - py; break;
        case 2: u = px; v = pz; break;
        case 3: u = px; v = pz; break;
        case 4: u = 1 - px; v = 1 - py; break;
        default: u = px; v = 1 - py; break;
      }

      let ao = 3, s = nSky, bl = nBlk;
      if (smooth && boundary) {
        const [s1, s2] = corners[c];
        const ax = nx + t1[0] * s1, ay = ny + t1[1] * s1, az = nz + t1[2] * s1;
        const bx = nx + t2[0] * s2, by = ny + t2[1] * s2, bz = nz + t2[2] * s2;
        const cx = nx + t1[0] * s1 + t2[0] * s2, cy = ny + t1[1] * s1 + t2[1] * s2, cz = nz + t1[2] * s1 + t2[2] * s2;
        const pa = pidx(ax, ay, az), pb = pidx(bx, by, bz), pc = pidx(cx, cy, cz);
        const oa = T.opacity[blocks[pa]] >= 15 && T.cube[blocks[pa]] === 1 ? 1 : 0;
        const ob = T.opacity[blocks[pb]] >= 15 && T.cube[blocks[pb]] === 1 ? 1 : 0;
        const oc = T.opacity[blocks[pc]] >= 15 && T.cube[blocks[pc]] === 1 ? 1 : 0;
        ao = (oa && ob) ? 0 : 3 - (oa + ob + oc);
        // average light over the four cells touching this corner
        let ss = nSky, bb = nBlk, cnt = 1;
        if (!oa) { ss += sky[pa]; bb += light[pa]; cnt++; }
        if (!ob) { ss += sky[pb]; bb += light[pb]; cnt++; }
        if (!oc && !(oa && ob)) { ss += sky[pc]; bb += light[pc]; cnt++; }
        s = (ss / cnt) | 0; bl = (bb / cnt) | 0;
      }

      B.grow(4);
      B.vertex(x + px, y + py, z + pz, (u * 255) | 0, (v * 255) | 0, layer,
        s, bl, ao, f, tr, tg, tb, 0);
    }
    B.quad(false);
  }
}

// Water/lava: a cube whose top surface drops with the fluid level.
function emitLiquid(B, T, job, x, y, z, id, state) {
  const { blocks, sky, light } = job;
  const level = st.level(state);
  const above = blocks[pidx(x, y + 1, z)];
  const sameAbove = T.render[above] === R.liquid && T.liquid[above] === T.liquid[id];
  const h = sameAbove ? 1 : (level === 0 ? 0.888 : Math.max(0.12, 0.888 - level * 0.11));
  const tint = sampleTint(T, job, id, x, z);
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const layerTop = T.faceLayer[id * 6 + 3];
  const layerSide = T.faceLayer[id * 6 + 0];

  for (let f = 0; f < 6; f++) {
    const d = FN[f];
    const nx = x + d[0], ny = y + d[1], nz = z + d[2];
    const np = pidx(nx, ny, nz);
    const nid = blocks[np];
    if (T.cube[nid] === 1 && T.opacity[nid] >= 15) continue;
    if (T.render[nid] === R.liquid && T.liquid[nid] === T.liquid[id]) {
      // only draw the top face when the fluid above is absent
      if (f !== 3) continue;
      if (sameAbove) continue;
    }
    if (f === 2 && T.render[nid] === R.liquid) continue;

    const layer = f === 3 || f === 2 ? layerTop : layerSide;
    const verts = FV[f];
    const nSky = sky[np], nBlk = light[np];
    B.grow(4);
    for (let c = 0; c < 4; c++) {
      const cv = verts[c];
      const px = cv[0], pz = cv[2];
      const py = cv[1] ? h : 0;
      let u, v;
      switch (f) {
        case 0: u = pz; v = 1 - py; break;
        case 1: u = 1 - pz; v = 1 - py; break;
        case 2: u = px; v = pz; break;
        case 3: u = px; v = pz; break;
        case 4: u = 1 - px; v = 1 - py; break;
        default: u = px; v = 1 - py; break;
      }
      B.vertex(x + px, y + py, z + pz, (u * 255) | 0, (v * 255) | 0, layer,
        nSky, nBlk, 3, f, tr, tg, tb, 0);
    }
    B.quad(false);
  }
}

// Plants: crossed quads, emitted double-sided so back-face culling can stay on.
function emitCross(B, T, job, x, y, z, id, state, render) {
  const { sky, light } = job;
  const p = pidx(x, y, z);
  const s = sky[p], bl = light[p];
  const tint = sampleTint(T, job, id, x, z);
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;

  let layer = T.faceLayer[id * 6 + 0];
  if (render === R.crop) layer = (T.special[id * 4 + 0] || layer) + st.age(state);

  const planes = render === R.crop
    ? [[0.25, 0, 0, 0.25, 1, 1], [0.75, 0, 0, 0.75, 1, 1], [0, 0, 0.25, 1, 1, 0.25], [0, 0, 0.75, 1, 1, 0.75]]
    : [[0.05, 0, 0.05, 0.95, 1, 0.95], [0.95, 0, 0.05, 0.05, 1, 0.95]];

  const h = render === R.crop ? 0.94 : 1.0;
  for (const pl of planes) {
    const [ax, , az, bx, , bz] = pl;
    for (let side = 0; side < 2; side++) {
      B.grow(4);
      const p0 = side === 0 ? [ax, az, bx, bz] : [bx, bz, ax, az];
      B.vertex(x + p0[0], y + h, z + p0[1], 0, 0, layer, s, bl, 3, 3, tr, tg, tb, 255);
      B.vertex(x + p0[2], y + h, z + p0[3], 255, 0, layer, s, bl, 3, 3, tr, tg, tb, 255);
      B.vertex(x + p0[2], y + 0, z + p0[3], 255, 255, layer, s, bl, 3, 3, tr, tg, tb, 255);
      B.vertex(x + p0[0], y + 0, z + p0[1], 0, 255, layer, s, bl, 3, 3, tr, tg, tb, 255);
      B.quad(false);
    }
  }
}
