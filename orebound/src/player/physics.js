// Voxel collision + raycasting.
//
// Movement is resolved one axis at a time (X, then Y, then Z) against the block
// grid rather than through a generic physics solver. Per-axis resolution is what
// stops the classic voxel bugs: catching on the seam between two flush blocks,
// and tunnelling through a wall at high speed (each axis step is clamped to the
// first contact along that axis, so no amount of velocity skips a block).

import { BLOCKS, AIR } from '../core/blocks.js';
import { collisionBoxes, buildModel, R } from '../render/models.js';
import { RENDER_IDS } from '../core/blocks.js';
import { WORLD } from '../core/config.js';

const EPS = 1e-4;
const scratchBoxes = [];

/** Collision boxes of one block, in world coordinates, appended to `out`. */
export function blockCollision(world, x, y, z, out) {
  const id = world.getBlock(x, y, z);
  if (id === AIR) return out;
  const def = BLOCKS[id];
  if (!def || !def.solid) return out;
  scratchBoxes.length = 0;
  collisionBoxes(RENDER_IDS[def.render] ?? 1, world.getState(x, y, z), scratchBoxes);
  for (const b of scratchBoxes) {
    out.push(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
  }
  return out;
}

/** Selection (targeting) boxes -- includes non-solid blocks like torches. */
export function selectionBoxes(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  const def = BLOCKS[id];
  if (!def || id === AIR || def.liquid) return null;
  const render = RENDER_IDS[def.render] ?? 1;
  if (render === RENDER_IDS.cross || render === RENDER_IDS.tall_cross) {
    return [[0.1, 0, 0.1, 0.9, 0.9, 0.9]];
  }
  if (render === RENDER_IDS.crop) return [[0.05, 0, 0.05, 0.95, 0.85, 0.95]];
  if (render === RENDER_IDS.torch) {
    const boxes = [];
    const n = buildModel(render, world.getState(x, y, z), scratchBoxes, () => false);
    for (let i = 0; i < n; i++) {
      const b = scratchBoxes[i];
      boxes.push([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1]);
    }
    return boxes;
  }
  const out = [];
  collisionBoxes(render, world.getState(x, y, z), out);
  return out.length ? out : [[0, 0, 0, 1, 1, 1]];
}

function overlaps(a0, a1, b0, b1) { return a1 > b0 + EPS && a0 < b1 - EPS; }

/**
 * Move an axis-aligned box through the world, one axis at a time.
 * @param {object} box mutable { x0,y0,z0,x1,y1,z1 }
 * @param {object} d   { x, y, z } desired delta
 * @returns {object} { x, y, z, onGround, hitX, hitY, hitZ }
 */
export function moveBox(world, box, d) {
  const res = { x: 0, y: 0, z: 0, onGround: false, hitX: false, hitY: false, hitZ: false };
  res.x = sweep(world, box, 0, d.x);
  box.x0 += res.x; box.x1 += res.x;
  res.hitX = Math.abs(res.x - d.x) > EPS;

  res.y = sweep(world, box, 1, d.y);
  box.y0 += res.y; box.y1 += res.y;
  res.hitY = Math.abs(res.y - d.y) > EPS;
  if (res.hitY && d.y < 0) res.onGround = true;

  res.z = sweep(world, box, 2, d.z);
  box.z0 += res.z; box.z1 += res.z;
  res.hitZ = Math.abs(res.z - d.z) > EPS;
  return res;
}

const boxBuf = [];

function sweep(world, box, axis, d) {
  if (d === 0) return 0;
  let lo0, lo1, hi0, hi1;
  const x0 = Math.floor(box.x0 + (axis === 0 ? Math.min(0, d) : 0) - EPS);
  const x1 = Math.floor(box.x1 + (axis === 0 ? Math.max(0, d) : 0) + EPS);
  const y0 = Math.floor(box.y0 + (axis === 1 ? Math.min(0, d) : 0) - EPS);
  const y1 = Math.floor(box.y1 + (axis === 1 ? Math.max(0, d) : 0) + EPS);
  const z0 = Math.floor(box.z0 + (axis === 2 ? Math.min(0, d) : 0) - EPS);
  const z1 = Math.floor(box.z1 + (axis === 2 ? Math.max(0, d) : 0) + EPS);

  let allowed = d;
  for (let y = y0; y <= y1; y++) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) continue;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        boxBuf.length = 0;
        blockCollision(world, x, y, z, boxBuf);
        for (let i = 0; i < boxBuf.length; i += 6) {
          const bx0 = boxBuf[i], by0 = boxBuf[i + 1], bz0 = boxBuf[i + 2];
          const bx1 = boxBuf[i + 3], by1 = boxBuf[i + 4], bz1 = boxBuf[i + 5];
          if (axis === 0) {
            if (!overlaps(box.y0, box.y1, by0, by1) || !overlaps(box.z0, box.z1, bz0, bz1)) continue;
            if (d > 0) { const gap = bx0 - box.x1; if (gap >= -EPS && gap < allowed) allowed = Math.max(0, gap - EPS); }
            else { const gap = bx1 - box.x0; if (gap <= EPS && gap > allowed) allowed = Math.min(0, gap + EPS); }
          } else if (axis === 1) {
            if (!overlaps(box.x0, box.x1, bx0, bx1) || !overlaps(box.z0, box.z1, bz0, bz1)) continue;
            if (d > 0) { const gap = by0 - box.y1; if (gap >= -EPS && gap < allowed) allowed = Math.max(0, gap - EPS); }
            else { const gap = by1 - box.y0; if (gap <= EPS && gap > allowed) allowed = Math.min(0, gap + EPS); }
          } else {
            if (!overlaps(box.x0, box.x1, bx0, bx1) || !overlaps(box.y0, box.y1, by0, by1)) continue;
            if (d > 0) { const gap = bz0 - box.z1; if (gap >= -EPS && gap < allowed) allowed = Math.max(0, gap - EPS); }
            else { const gap = bz1 - box.z0; if (gap <= EPS && gap > allowed) allowed = Math.min(0, gap + EPS); }
          }
        }
      }
    }
  }
  return allowed;
}

/** True when the box currently intersects any solid block. */
export function boxCollides(world, box) {
  const x0 = Math.floor(box.x0 + EPS), x1 = Math.floor(box.x1 - EPS);
  const y0 = Math.floor(box.y0 + EPS), y1 = Math.floor(box.y1 - EPS);
  const z0 = Math.floor(box.z0 + EPS), z1 = Math.floor(box.z1 - EPS);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        boxBuf.length = 0;
        blockCollision(world, x, y, z, boxBuf);
        for (let i = 0; i < boxBuf.length; i += 6) {
          if (overlaps(box.x0, box.x1, boxBuf[i], boxBuf[i + 3]) &&
            overlaps(box.y0, box.y1, boxBuf[i + 1], boxBuf[i + 4]) &&
            overlaps(box.z0, box.z1, boxBuf[i + 2], boxBuf[i + 5])) return true;
        }
      }
    }
  }
  return false;
}

/** Fraction of the box submerged in a given fluid ('water' | 'lava'). */
export function fluidOverlap(world, box, kind) {
  const x0 = Math.floor(box.x0), x1 = Math.floor(box.x1 - EPS);
  const y0 = Math.floor(box.y0), y1 = Math.floor(box.y1 - EPS);
  const z0 = Math.floor(box.z0), z1 = Math.floor(box.z1 - EPS);
  let hit = 0, total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        total++;
        const def = BLOCKS[world.getBlock(x, y, z)];
        if (def.liquid === kind) hit++;
      }
    }
  }
  return total ? hit / total : 0;
}

/**
 * Voxel raycast (Amanatides & Woo DDA) with per-block box refinement, so a
 * torch or a fence is only hit where it actually is.
 * @returns {object|null} { x, y, z, face, px, py, pz, dist }
 */
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX);
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY);
  let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ);
  let face = -1;
  let t = 0;

  for (let i = 0; i < 512; i++) {
    const boxes = selectionBoxes(world, x, y, z);
    if (boxes) {
      const hit = rayBoxes(ox - x, oy - y, oz - z, dx, dy, dz, boxes, maxDist);
      if (hit && hit.t <= maxDist) {
        return {
          x, y, z, face: hit.face, dist: hit.t,
          px: ox + dx * hit.t, py: oy + dy * hit.t, pz: oz + dz * hit.t,
        };
      }
    }
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 0 : 1; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 4 : 5; }
    } else {
      if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 2 : 3; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 4 : 5; }
    }
    if (t > maxDist) return null;
    if (y < WORLD.MIN_Y - 1 || y > WORLD.MAX_Y) return null;
  }
  return null;
}

/** Ray vs a set of local-space boxes; returns the nearest entry hit. */
function rayBoxes(ox, oy, oz, dx, dy, dz, boxes, maxDist) {
  let best = null;
  for (const b of boxes) {
    const r = raySlab(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
    if (r && r.t >= -1e-6 && r.t <= maxDist && (!best || r.t < best.t)) best = r;
  }
  return best;
}

function raySlab(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const check = (o, d, lo, hi, negFace, posFace) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    let f = negFace;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; f = posFace; }
    if (t1 > tmin) { tmin = t1; face = f; }
    if (t2 < tmax) tmax = t2;
    return tmax >= tmin;
  };
  if (!check(ox, dx, x0, x1, 0, 1)) return null;
  if (!check(oy, dy, y0, y1, 2, 3)) return null;
  if (!check(oz, dz, z0, z1, 4, 5)) return null;
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), face };
}

export function makeBox(x, y, z, width, height) {
  const h = width / 2;
  return { x0: x - h, y0: y, z0: z - h, x1: x + h, y1: y + height, z1: z + h };
}
export function setBoxAt(box, x, y, z, width, height) {
  const h = width / 2;
  box.x0 = x - h; box.y0 = y; box.z0 = z - h;
  box.x1 = x + h; box.y1 = y + height; box.z1 = z + h;
  return box;
}
