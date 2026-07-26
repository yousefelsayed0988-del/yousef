// Block geometry.
//
// Everything that is not a full cube is described as a small list of boxes.
// The mesher emits box faces, culling only those that lie exactly on a block
// boundary against an opaque full-cube neighbour. That one mechanism covers
// slabs, stairs, fences, panes, doors, torches, beds, cacti, farmland and snow
// without special-casing each in the mesher.
//
// Face order everywhere: 0 = -X, 1 = +X, 2 = -Y, 3 = +Y, 4 = -Z, 5 = +Z.

import { RENDER_IDS } from '../core/blocks.js';

export const R = RENDER_IDS;

// Texture slot ids used by boxes; the mesher resolves slot -> atlas layer via
// the per-block face table.
export const SLOT = { WEST: 0, EAST: 1, DOWN: 2, UP: 3, NORTH: 4, SOUTH: 5 };
const ALL = [0, 1, 2, 3, 4, 5];

// state decoding helpers -----------------------------------------------------
export const st = {
  slabTop: s => (s & 1) !== 0,
  slabDouble: s => (s & 2) !== 0,
  stairFacing: s => s & 3,
  stairTop: s => (s & 4) !== 0,
  doorUpper: s => (s & 1) !== 0,
  doorOpen: s => (s & 2) !== 0,
  doorFacing: s => (s >> 2) & 3,
  doorHinge: s => (s >> 4) & 1,
  bedHead: s => (s & 1) !== 0,
  bedFacing: s => (s >> 1) & 3,
  bedOccupied: s => (s & 8) !== 0,
  torchAttach: s => s & 7,          // 0 floor, 1..4 = wall attached to N/E/S/W
  facing: s => s & 3,
  lit: s => (s & 4) !== 0,
  level: s => s & 7,
  falling: s => (s & 8) !== 0,
  layers: s => (s & 7) + 1,
  age: s => s & 7,
  axis: s => s & 3,                 // 0 Y, 1 X, 2 Z
  moisture: s => s & 7,
  gateOpen: s => (s & 4) !== 0,
  rotation: s => s & 3,
};

// A reusable box pool -- meshing is hot, so nothing here allocates per block.
class Box {
  constructor() {
    this.x0 = 0; this.y0 = 0; this.z0 = 0; this.x1 = 1; this.y1 = 1; this.z1 = 1;
    this.f = new Int8Array(6);
    this.tintFaces = 63;    // bitmask of faces that receive biome tint
    this.uvLock = 0;        // 1 = map UV from world position rather than box extent
  }
  set(x0, y0, z0, x1, y1, z1) {
    this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1; this.z1 = z1;
    return this;
  }
  faces(a, b, c, d, e, f) {
    const t = this.f;
    t[0] = a; t[1] = b; t[2] = c; t[3] = d; t[4] = e; t[5] = f;
    return this;
  }
  all(slot) { this.f.fill(slot); return this; }
  sided() { this.f[0] = SLOT.WEST; this.f[1] = SLOT.EAST; this.f[2] = SLOT.DOWN; this.f[3] = SLOT.UP; this.f[4] = SLOT.NORTH; this.f[5] = SLOT.SOUTH; return this; }
}

const POOL = [];
for (let i = 0; i < 16; i++) POOL.push(new Box());

const P = 1 / 16;

/**
 * Fill `out` (an array) with boxes for this block state. Returns the count.
 * `nb(face)` returns the neighbouring block id for connection logic;
 * `nbState(face)` returns its state.
 */
export function buildModel(render, state, out, nb) {
  let n = 0;
  const box = () => POOL[n++];

  switch (render) {
    case R.slab: {
      const b = box().sided();
      if (st.slabDouble(state)) b.set(0, 0, 0, 1, 1, 1);
      else if (st.slabTop(state)) b.set(0, 0.5, 0, 1, 1, 1);
      else b.set(0, 0, 0, 1, 0.5, 1);
      break;
    }
    case R.stairs: {
      const top = st.stairTop(state);
      const facing = st.stairFacing(state);
      const base = box().sided();
      if (top) base.set(0, 0.5, 0, 1, 1, 1); else base.set(0, 0, 0, 1, 0.5, 1);
      const step = box().sided();
      const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
      // facing = the side the step's tall part is against
      if (facing === 0) step.set(0, y0, 0, 1, y1, 0.5);        // north
      else if (facing === 1) step.set(0.5, y0, 0, 1, y1, 1);   // east
      else if (facing === 2) step.set(0, y0, 0.5, 1, y1, 1);   // south
      else step.set(0, y0, 0, 0.5, y1, 1);                     // west
      break;
    }
    case R.fence: {
      box().sided().set(6 * P, 0, 6 * P, 10 * P, 1, 10 * P);
      // arms: 4 = -Z(north), 5 = +Z(south), 0 = -X(west), 1 = +X(east)
      if (nb(4)) { box().sided().set(7 * P, 6 * P, 0, 9 * P, 9 * P, 6 * P); box().sided().set(7 * P, 12 * P, 0, 9 * P, 15 * P, 6 * P); }
      if (nb(5)) { box().sided().set(7 * P, 6 * P, 10 * P, 9 * P, 9 * P, 1); box().sided().set(7 * P, 12 * P, 10 * P, 9 * P, 15 * P, 1); }
      if (nb(0)) { box().sided().set(0, 6 * P, 7 * P, 6 * P, 9 * P, 9 * P); box().sided().set(0, 12 * P, 7 * P, 6 * P, 15 * P, 9 * P); }
      if (nb(1)) { box().sided().set(10 * P, 6 * P, 7 * P, 1, 9 * P, 9 * P); box().sided().set(10 * P, 12 * P, 7 * P, 1, 15 * P, 9 * P); }
      break;
    }
    case R.gate: {
      const facing = st.facing(state);
      const open = st.gateOpen(state);
      const alongX = facing === 1 || facing === 3;
      if (open) {
        // swing the two leaves to the sides
        if (alongX) {
          box().sided().set(7 * P, 5 * P, 0, 9 * P, 1, 2 * P);
          box().sided().set(7 * P, 5 * P, 14 * P, 9 * P, 1, 1);
        } else {
          box().sided().set(0, 5 * P, 7 * P, 2 * P, 1, 9 * P);
          box().sided().set(14 * P, 5 * P, 7 * P, 1, 1, 9 * P);
        }
      } else {
        if (alongX) {
          box().sided().set(7 * P, 5 * P, 0, 9 * P, 1, 2 * P);
          box().sided().set(7 * P, 5 * P, 14 * P, 9 * P, 1, 1);
          box().sided().set(7 * P, 6 * P, 2 * P, 9 * P, 9 * P, 14 * P);
          box().sided().set(7 * P, 12 * P, 2 * P, 9 * P, 15 * P, 14 * P);
        } else {
          box().sided().set(0, 5 * P, 7 * P, 2 * P, 1, 9 * P);
          box().sided().set(14 * P, 5 * P, 7 * P, 1, 1, 9 * P);
          box().sided().set(2 * P, 6 * P, 7 * P, 14 * P, 9 * P, 9 * P);
          box().sided().set(2 * P, 12 * P, 7 * P, 14 * P, 15 * P, 9 * P);
        }
      }
      break;
    }
    case R.pane: {
      const w = nb(0), e = nb(1), no = nb(4), so = nb(5);
      const any = w || e || no || so;
      if (!any) {
        box().sided().set(7 * P, 0, 7 * P, 9 * P, 1, 9 * P);
      } else {
        box().sided().set(7 * P, 0, 7 * P, 9 * P, 1, 9 * P);
        if (w) box().sided().set(0, 0, 7 * P, 7 * P, 1, 9 * P);
        if (e) box().sided().set(9 * P, 0, 7 * P, 1, 1, 9 * P);
        if (no) box().sided().set(7 * P, 0, 0, 9 * P, 1, 7 * P);
        if (so) box().sided().set(7 * P, 0, 9 * P, 9 * P, 1, 1);
      }
      break;
    }
    case R.door: {
      const facing = st.doorFacing(state);
      const open = st.doorOpen(state);
      const hinge = st.doorHinge(state);
      // closed: 3/16 slab on the `facing` side; open: rotated 90 degrees
      let dir = facing;
      if (open) dir = hinge ? (facing + 1) & 3 : (facing + 3) & 3;
      const b = box().sided();
      const t = 3 * P;
      if (dir === 0) b.set(0, 0, 0, 1, 1, t);
      else if (dir === 1) b.set(1 - t, 0, 0, 1, 1, 1);
      else if (dir === 2) b.set(0, 0, 1 - t, 1, 1, 1);
      else b.set(0, 0, 0, t, 1, 1);
      break;
    }
    case R.ladder: {
      const facing = st.facing(state);
      const t = 2 * P;
      const b = box().all(SLOT.NORTH);
      if (facing === 0) b.set(0, 0, 1 - t, 1, 1, 1);
      else if (facing === 1) b.set(0, 0, 0, t, 1, 1);
      else if (facing === 2) b.set(0, 0, 0, 1, 1, t);
      else b.set(1 - t, 0, 0, 1, 1, 1);
      break;
    }
    case R.torch: {
      const attach = st.torchAttach(state);
      const b = box().all(SLOT.NORTH);
      if (attach === 0) b.set(7 * P, 0, 7 * P, 9 * P, 10 * P, 9 * P);
      else if (attach === 1) b.set(7 * P, 3 * P, 0, 9 * P, 13 * P, 4 * P);       // on north wall
      else if (attach === 2) b.set(12 * P, 3 * P, 7 * P, 1, 13 * P, 9 * P);      // east
      else if (attach === 3) b.set(7 * P, 3 * P, 12 * P, 9 * P, 13 * P, 1);      // south
      else b.set(0, 3 * P, 7 * P, 4 * P, 13 * P, 9 * P);                          // west
      break;
    }
    case R.chest: {
      box().sided().set(P, 0, P, 15 * P, 14 * P, 15 * P);
      break;
    }
    case R.bed: {
      const b = box().sided().set(0, 3 * P, 0, 1, 9 * P, 1);
      b.f[2] = SLOT.DOWN;
      break;
    }
    case R.cactus: {
      // side faces inset, top/bottom full: gives the classic pinched silhouette
      const side = box().sided().set(P, 0, P, 15 * P, 1, 15 * P);
      side.f[2] = -1; side.f[3] = -1;
      const cap = box().sided().set(0, 0, 0, 1, 1, 1);
      cap.f[0] = -1; cap.f[1] = -1; cap.f[4] = -1; cap.f[5] = -1;
      break;
    }
    case R.farmland: {
      box().sided().set(0, 0, 0, 1, 15 * P, 1);
      break;
    }
    case R.layer: {
      const h = st.layers(state) * 2 * P;
      box().sided().set(0, 0, 0, 1, h, 1);
      break;
    }
    case R.sign: {
      box().sided().set(0, 4 * P, 7 * P, 1, 12 * P, 9 * P);
      break;
    }
    default: {
      box().sided().set(0, 0, 0, 1, 1, 1);
      break;
    }
  }
  for (let i = 0; i < n; i++) out[i] = POOL[i];
  return n;
}

/** Blocks whose geometry is two crossed quads rather than boxes. */
export function isCrossRender(render) {
  return render === R.cross || render === R.tall_cross || render === R.crop || render === R.fire;
}

/** Collision boxes -- coarser than render geometry on purpose. */
export function collisionBoxes(render, state, out) {
  switch (render) {
    case R.slab:
      if (st.slabDouble(state)) out.push([0, 0, 0, 1, 1, 1]);
      else if (st.slabTop(state)) out.push([0, 0.5, 0, 1, 1, 1]);
      else out.push([0, 0, 0, 1, 0.5, 1]);
      return out;
    case R.stairs: {
      const top = st.stairTop(state), facing = st.stairFacing(state);
      out.push(top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]);
      const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
      if (facing === 0) out.push([0, y0, 0, 1, y1, 0.5]);
      else if (facing === 1) out.push([0.5, y0, 0, 1, y1, 1]);
      else if (facing === 2) out.push([0, y0, 0.5, 1, y1, 1]);
      else out.push([0, y0, 0, 0.5, y1, 1]);
      return out;
    }
    case R.fence:
    case R.gate:
      // fences are 1.5 blocks tall for collision so players cannot hop them
      out.push([0, 0, 0, 1, 1.5, 1]);
      return out;
    case R.pane: out.push([7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16]); return out;
    case R.door: {
      const facing = st.doorFacing(state);
      const open = st.doorOpen(state);
      const hinge = st.doorHinge(state);
      let dir = facing;
      if (open) dir = hinge ? (facing + 1) & 3 : (facing + 3) & 3;
      const t = 3 / 16;
      if (dir === 0) out.push([0, 0, 0, 1, 1, t]);
      else if (dir === 1) out.push([1 - t, 0, 0, 1, 1, 1]);
      else if (dir === 2) out.push([0, 0, 1 - t, 1, 1, 1]);
      else out.push([0, 0, 0, t, 1, 1]);
      return out;
    }
    case R.chest: out.push([1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]); return out;
    case R.bed: out.push([0, 0, 0, 1, 9 / 16, 1]); return out;
    case R.cactus: out.push([1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]); return out;
    case R.farmland: out.push([0, 0, 0, 1, 15 / 16, 1]); return out;
    case R.layer: {
      const h = ((state & 7) + 1) * 2 / 16;
      if (h > 2 / 16) out.push([0, 0, 0, 1, h, 1]);
      return out;
    }
    case R.sign: return out;
    default: out.push([0, 0, 0, 1, 1, 1]); return out;
  }
}
