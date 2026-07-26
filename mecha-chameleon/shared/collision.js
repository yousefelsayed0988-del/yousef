// The one physics implementation. The browser runs it for prediction, the
// server runs it for authority, and the anti-cheat compares the two. Anything
// that touches the world - movement, bullets, line of sight, the blend meter -
// goes through here.
//
// Primitive types (matching the map kit's prop encoding):
//   0 box      s = [halfX, halfY, halfZ], rotated by `yaw` about Y
//   1 cylinder s = [radius, halfY, radius], axis is +Y
//   2 sphere   s = [r, r, r]
//   3 wedge    visual only unless `solid`, collides as its bounding box

import { clamp, EPS } from './math.js';

const CELL = 4;

export function createWorld(mapDef) {
  const solids = [];
  const props = mapDef.props || [];
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.solid) continue;
    const yaw = p.yaw || 0;
    const s = {
      idx: i,
      t: p.t | 0,
      x: p.p[0], y: p.p[1], z: p.p[2],
      hx: Math.abs(p.s[0]), hy: Math.abs(p.s[1]), hz: Math.abs(p.s[2]),
      yaw,
      cos: Math.cos(yaw), sin: Math.sin(yaw),
      tag: p.tag || '',
      color: p.c,
      climb: !!p.climb,
      opaque: p.opaque !== false,
    };
    // World-space bounds (conservative for rotated boxes).
    const ext = s.t === 0 || s.t === 3
      ? Math.abs(s.cos) * s.hx + Math.abs(s.sin) * s.hz
      : s.hx;
    const extZ = s.t === 0 || s.t === 3
      ? Math.abs(s.sin) * s.hx + Math.abs(s.cos) * s.hz
      : s.hz;
    s.minX = s.x - ext; s.maxX = s.x + ext;
    s.minZ = s.z - extZ; s.maxZ = s.z + extZ;
    s.minY = s.y - s.hy; s.maxY = s.y + s.hy;
    solids.push(s);
  }

  const b = mapDef.bounds || { minX: -50, maxX: 50, minZ: -50, maxZ: 50, maxY: 24 };
  const pad = CELL * 2;
  const minX = Math.min(b.minX, ...solids.map((s) => s.minX)) - pad;
  const minZ = Math.min(b.minZ, ...solids.map((s) => s.minZ)) - pad;
  const maxX = Math.max(b.maxX, ...solids.map((s) => s.maxX)) + pad;
  const maxZ = Math.max(b.maxZ, ...solids.map((s) => s.maxZ)) + pad;
  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL));
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = null;

  const world = {
    map: mapDef,
    solids,
    grid: { cell: CELL, minX, minZ, maxX, maxZ, cols, rows, cells },
    bounds: b,
    _stamp: new Int32Array(solids.length),
    _stampId: 0,
    _scratch: [],
  };

  for (const s of solids) {
    const c0 = cellX(world, s.minX), c1 = cellX(world, s.maxX);
    const r0 = cellZ(world, s.minZ), r1 = cellZ(world, s.maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c;
        if (!cells[k]) cells[k] = [];
        cells[k].push(s);
      }
    }
  }
  return world;
}

const cellX = (w, x) => clamp(Math.floor((x - w.grid.minX) / w.grid.cell), 0, w.grid.cols - 1);
const cellZ = (w, z) => clamp(Math.floor((z - w.grid.minZ) / w.grid.cell), 0, w.grid.rows - 1);

/** Collect unique solids whose bounds overlap the given AABB. */
export function gatherAABB(world, minX, minY, minZ, maxX, maxY, maxZ, out = []) {
  out.length = 0;
  const g = world.grid;
  const stamp = ++world._stampId;
  const c0 = cellX(world, minX), c1 = cellX(world, maxX);
  const r0 = cellZ(world, minZ), r1 = cellZ(world, maxZ);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const list = g.cells[r * g.cols + c];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (world._stamp[s.idx] === stamp) continue;
        world._stamp[s.idx] = stamp;
        if (s.maxX < minX || s.minX > maxX) continue;
        if (s.maxY < minY || s.minY > maxY) continue;
        if (s.maxZ < minZ || s.minZ > maxZ) continue;
        out.push(s);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Penetration of a vertical capsule (a cylinder with rounded XZ corners) with
// one solid. Returns the shortest XZ push, or null. Vertical separation is
// handled by the caller so that step-up and ground detection stay sane.
// ---------------------------------------------------------------------------
// Vertical slack before a solid counts as horizontally blocking. Without it,
// a player resting exactly on a floor slab drifts a hair below its top surface
// on some ticks and gets shoved sideways by the floor they are standing on.
const Y_EPS = 0.02;

function pushOutXZ(s, px, py, pz, radius, height, out) {
  const pMinY = py, pMaxY = py + height;
  if (pMaxY <= s.minY + Y_EPS || pMinY >= s.maxY - Y_EPS) return false;

  if (s.t === 1) { // cylinder
    let dx = px - s.x, dz = pz - s.z;
    let d = Math.hypot(dx, dz);
    const rr = s.hx + radius;
    if (d >= rr) return false;
    if (d < EPS) { dx = 1; dz = 0; d = EPS; }
    const push = rr - d;
    out.x = (dx / d) * push; out.z = (dz / d) * push;
    return true;
  }

  if (s.t === 2) { // sphere - treat as a circle at its own height band
    const dy = clamp(s.y, pMinY, pMaxY) - s.y;
    const rAt = Math.sqrt(Math.max(0, s.hy * s.hy - dy * dy));
    let dx = px - s.x, dz = pz - s.z;
    let d = Math.hypot(dx, dz);
    const rr = rAt + radius;
    if (d >= rr) return false;
    if (d < EPS) { dx = 1; dz = 0; d = EPS; }
    out.x = (dx / d) * (rr - d); out.z = (dz / d) * (rr - d);
    return true;
  }

  // Box / wedge: work in the solid's local frame.
  const rx = px - s.x, rz = pz - s.z;
  const lx = rx * s.cos + rz * s.sin;
  const lz = -rx * s.sin + rz * s.cos;
  const cx = clamp(lx, -s.hx, s.hx);
  const cz = clamp(lz, -s.hz, s.hz);
  let ox, oz;
  if (lx !== cx || lz !== cz) {
    const dx = lx - cx, dz = lz - cz;
    const d = Math.hypot(dx, dz);
    if (d >= radius) return false;
    const push = radius - d;
    if (d < EPS) { ox = radius; oz = 0; }
    else { ox = (dx / d) * push; oz = (dz / d) * push; }
  } else {
    // Centre is inside the rect: escape along the cheapest local axis.
    const pxPos = s.hx - lx + radius, pxNeg = lx + s.hx + radius;
    const pzPos = s.hz - lz + radius, pzNeg = lz + s.hz + radius;
    const m = Math.min(pxPos, pxNeg, pzPos, pzNeg);
    if (m === pxPos) { ox = pxPos; oz = 0; }
    else if (m === pxNeg) { ox = -pxNeg; oz = 0; }
    else if (m === pzPos) { ox = 0; oz = pzPos; }
    else { ox = 0; oz = -pzNeg; }
  }
  out.x = ox * s.cos - oz * s.sin;
  out.z = ox * s.sin + oz * s.cos;
  return true;
}

/** Does the capsule overlap anything solid at this position? */
export function capsuleOverlaps(world, px, py, pz, radius, height, skipTag) {
  const list = gatherAABB(world, px - radius, py, pz - radius, px + radius, py + height, pz + radius, world._scratch);
  const out = { x: 0, z: 0 };
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (skipTag && s.tag === skipTag) continue;
    if (pushOutXZ(s, px, py, pz, radius, height, out)) return true;
  }
  return false;
}

/** Highest solid surface directly under (x, z) below `fromY`. */
export function groundHeightAt(world, x, z, fromY, radius = 0.05) {
  const list = gatherAABB(world, x - radius, -1e4, z - radius, x + radius, fromY + 0.05, z + radius, []);
  let best = -Infinity;
  const out = { x: 0, z: 0 };
  for (const s of list) {
    if (s.maxY > fromY + 0.05) continue;
    // Reuse the XZ test on a thin band straddling the solid's top face. The
    // band has to clear Y_EPS on both sides or the test rejects itself.
    if (!pushOutXZ(s, x, s.maxY - 0.08, z, radius, 0.16, out)) continue;
    if (s.maxY > best) best = s.maxY;
  }
  return best === -Infinity ? (world.bounds.floorY ?? 0) : best;
}

/**
 * Integrate a capsule through the world.
 * Mutates `pos` and `vel`. Returns { onGround, blocked, stepped }.
 */
export function moveCapsule(world, pos, vel, dt, radius, height, opts = {}) {
  const stepHeight = opts.stepHeight ?? 0.45;
  const gravityDown = opts.gravity !== false;
  let onGround = false, blocked = false, stepped = false;

  const speed = Math.hypot(vel.x, vel.z);
  const vy = Math.abs(vel.y);
  const steps = Math.min(8, Math.max(1, Math.ceil(Math.max(speed * dt / (radius * 0.65), vy * dt / 0.35))));
  const sdt = dt / steps;
  const push = { x: 0, z: 0 };
  const list = [];

  for (let step = 0; step < steps; step++) {
    // -- horizontal -------------------------------------------------------
    const startY = pos.y;
    pos.x += vel.x * sdt;
    pos.z += vel.z * sdt;

    for (let iter = 0; iter < 4; iter++) {
      gatherAABB(world, pos.x - radius, pos.y, pos.z - radius,
        pos.x + radius, pos.y + height, pos.z + radius, list);
      let hit = false;
      // Try a step-up before shoving the player back out of a low ledge.
      if (list.length) {
        let ledge = -Infinity;
        for (const s of list) {
          if (!pushOutXZ(s, pos.x, pos.y, pos.z, radius, height, push)) continue;
          hit = true;
          if (s.maxY > pos.y + EPS && s.maxY <= pos.y + stepHeight && s.maxY > ledge) ledge = s.maxY;
        }
        if (!hit) break;
        if (ledge > -Infinity && onGroundish(world, pos, radius, startY)) {
          const lifted = ledge + 0.02;
          if (!capsuleOverlaps(world, pos.x, lifted, pos.z, radius, height)) {
            pos.y = lifted;
            stepped = true;
            onGround = true;
            continue;
          }
        }
        let ax = 0, az = 0, any = false;
        for (const s of list) {
          if (!pushOutXZ(s, pos.x, pos.y, pos.z, radius, height, push)) continue;
          any = true;
          // Take the largest push per axis rather than summing, so a corner
          // does not eject the player at double speed.
          if (Math.abs(push.x) > Math.abs(ax)) ax = push.x;
          if (Math.abs(push.z) > Math.abs(az)) az = push.z;
        }
        if (!any) break;
        pos.x += ax; pos.z += az;
        blocked = true;
        // Kill the velocity component that ran into the wall so the player
        // slides along it instead of jittering.
        if (ax !== 0 && Math.sign(ax) !== Math.sign(vel.x)) vel.x = 0;
        if (az !== 0 && Math.sign(az) !== Math.sign(vel.z)) vel.z = 0;
      } else break;
    }

    // -- vertical ---------------------------------------------------------
    if (gravityDown) {
      pos.y += vel.y * sdt;
      gatherAABB(world, pos.x - radius, pos.y, pos.z - radius,
        pos.x + radius, pos.y + height, pos.z + radius, list);
      let bestUp = 0, bestDown = 0;
      for (const s of list) {
        if (!pushOutXZ(s, pos.x, s.y, pos.z, radius, 0.001, push) &&
          !pushOutXZ(s, pos.x, pos.y, pos.z, radius, height, push)) continue;
        const up = s.maxY - pos.y;              // how far to lift onto the top
        const down = pos.y + height - s.minY;   // how far to drop below it
        if (up <= 0 || down <= 0) continue;
        if (up <= down) { if (up > bestUp) bestUp = up; }
        else if (down > bestDown) bestDown = down;
      }
      if (bestUp > 0) {
        pos.y += bestUp;
        if (vel.y < 0) vel.y = 0;
        onGround = true;
      } else if (bestDown > 0) {
        pos.y -= bestDown;
        if (vel.y > 0) vel.y = 0;
      }
    }

    // Floor plane and world bounds are a hard backstop.
    const floorY = world.bounds.floorY ?? 0;
    if (pos.y < floorY) { pos.y = floorY; if (vel.y < 0) vel.y = 0; onGround = true; }
    pos.x = clamp(pos.x, world.bounds.minX + radius, world.bounds.maxX - radius);
    pos.z = clamp(pos.z, world.bounds.minZ + radius, world.bounds.maxZ - radius);
    if (pos.y > world.bounds.maxY) { pos.y = world.bounds.maxY; if (vel.y > 0) vel.y = 0; }
  }

  if (!onGround) onGround = onGroundish(world, pos, radius, pos.y);
  return { onGround, blocked, stepped };
}

function onGroundish(world, pos, radius, y) {
  const floorY = world.bounds.floorY ?? 0;
  if (y <= floorY + 0.06) return true;
  const list = gatherAABB(world, pos.x - radius, y - 0.2, pos.z - radius,
    pos.x + radius, y + 0.05, pos.z + radius, []);
  const push = { x: 0, z: 0 };
  for (const s of list) {
    if (s.maxY > y + 0.04 || s.maxY < y - 0.18) continue;
    if (pushOutXZ(s, pos.x, s.maxY - 0.08, pos.z, radius, 0.16, push)) return true;
  }
  return false;
}

/** Lift a capsule out of any geometry it spawned inside. */
export function unstick(world, pos, radius, height, maxTries = 24) {
  if (!capsuleOverlaps(world, pos.x, pos.y, pos.z, radius, height)) return true;
  const golden = 2.399963;
  for (let i = 1; i <= maxTries; i++) {
    const r = 0.4 * Math.sqrt(i);
    const a = i * golden;
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    for (const dy of [0, 0.5, 1.2, -0.4]) {
      const y = pos.y + dy;
      if (!capsuleOverlaps(world, x, y, z, radius, height)) {
        pos.x = x; pos.y = y; pos.z = z;
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Raycasting
// ---------------------------------------------------------------------------

function rayBox(s, ox, oy, oz, dx, dy, dz, maxT) {
  // Into local space (yaw only).
  const rx = ox - s.x, rz = oz - s.z;
  const lox = rx * s.cos + rz * s.sin;
  const loz = -rx * s.sin + rz * s.cos;
  const loy = oy - s.y;
  const ldx = dx * s.cos + dz * s.sin;
  const ldz = -dx * s.sin + dz * s.cos;
  const ldy = dy;

  let tmin = 0, tmax = maxT;
  let nAxis = 0, nSign = 0;
  const o = [lox, loy, loz], d = [ldx, ldy, ldz], h = [s.hx, s.hy, s.hz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < -h[a] || o[a] > h[a]) return null;
      continue;
    }
    const inv = 1 / d[a];
    let t1 = (-h[a] - o[a]) * inv;
    let t2 = (h[a] - o[a]) * inv;
    let sgn = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sgn = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sgn; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || tmin > maxT) return null;
  const ln = [0, 0, 0];
  ln[nAxis] = nSign;
  return {
    t: tmin,
    nx: ln[0] * s.cos - ln[2] * s.sin,
    ny: ln[1],
    nz: ln[0] * s.sin + ln[2] * s.cos,
  };
}

function rayCylinder(s, ox, oy, oz, dx, dy, dz, maxT) {
  const px = ox - s.x, pz = oz - s.z;
  const a = dx * dx + dz * dz;
  let best = null;
  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const c = px * px + pz * pz - s.hx * s.hx;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0 || t > maxT) continue;
        const y = oy + dy * t;
        if (y < s.minY || y > s.maxY) continue;
        const hx = px + dx * t, hz = pz + dz * t;
        const inv = 1 / (s.hx || 1);
        if (!best || t < best.t) best = { t, nx: hx * inv, ny: 0, nz: hz * inv };
        break;
      }
    }
  }
  if (Math.abs(dy) > 1e-9) { // caps
    for (const [capY, ny] of [[s.maxY, 1], [s.minY, -1]]) {
      const t = (capY - oy) / dy;
      if (t < 0 || t > maxT) continue;
      const hx = px + dx * t, hz = pz + dz * t;
      if (hx * hx + hz * hz > s.hx * s.hx) continue;
      if (!best || t < best.t) best = { t, nx: 0, ny, nz: 0 };
    }
  }
  return best;
}

function raySphere(s, ox, oy, oz, dx, dy, dz, maxT) {
  const px = ox - s.x, py = oy - s.y, pz = oz - s.z;
  const b = 2 * (px * dx + py * dy + pz * dz);
  const c = px * px + py * py + pz * pz - s.hy * s.hy;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / 2, (-b + sq) / 2]) {
    if (t < 0 || t > maxT) continue;
    const inv = 1 / (s.hy || 1);
    return { t, nx: (px + dx * t) * inv, ny: (py + dy * t) * inv, nz: (pz + dz * t) * inv };
  }
  return null;
}

function raySolid(s, ox, oy, oz, dx, dy, dz, maxT) {
  if (s.t === 1) return rayCylinder(s, ox, oy, oz, dx, dy, dz, maxT);
  if (s.t === 2) return raySphere(s, ox, oy, oz, dx, dy, dz, maxT);
  return rayBox(s, ox, oy, oz, dx, dy, dz, maxT);
}

const NO_HIT = Object.freeze({ hit: false, t: Infinity });

/**
 * Cast a ray. `dir` must be normalised. Returns
 * { hit, t, point:{x,y,z}, normal:{x,y,z}, solid } or { hit:false }.
 * `opts.opaqueOnly` skips glass/decorative solids for line-of-sight tests.
 */
export function raycast(world, origin, dir, maxDist, opts = {}) {
  const g = world.grid;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dx = dir.x, dy = dir.y, dz = dir.z;
  const opaqueOnly = !!opts.opaqueOnly;
  const skip = opts.skip;

  // Clip the ray to the grid footprint so DDA always starts inside.
  let tEnter = 0, tExit = maxDist;
  for (const [o, d, lo, hi] of [[ox, dx, g.minX, g.maxX], [oz, dz, g.minZ, g.maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return NO_HIT;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tEnter) tEnter = t1;
    if (t2 < tExit) tExit = t2;
    if (tEnter > tExit) return NO_HIT;
  }

  let cx = cellX(world, ox + dx * (tEnter + 1e-4));
  let cz = cellZ(world, oz + dz * (tEnter + 1e-4));
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(g.cell / dx);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(g.cell / dz);
  const nextBoundX = g.minX + (cx + (stepX > 0 ? 1 : 0)) * g.cell;
  const nextBoundZ = g.minZ + (cz + (stepZ > 0 ? 1 : 0)) * g.cell;
  let tMaxX = stepX === 0 ? Infinity : (nextBoundX - ox) / dx;
  let tMaxZ = stepZ === 0 ? Infinity : (nextBoundZ - oz) / dz;

  const stamp = ++world._stampId;
  let best = null, bestSolid = null;
  let guard = g.cols + g.rows + 4;

  while (guard-- > 0) {
    const list = g.cells[cz * g.cols + cx];
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (world._stamp[s.idx] === stamp) continue;
        world._stamp[s.idx] = stamp;
        if (opaqueOnly && !s.opaque) continue;
        if (skip && skip(s)) continue;
        const h = raySolid(s, ox, oy, oz, dx, dy, dz, maxDist);
        if (h && (!best || h.t < best.t)) { best = h; bestSolid = s; }
      }
    }
    const tCell = Math.min(tMaxX, tMaxZ);
    if (best && best.t <= tCell) break;
    if (tCell > tExit || tCell > maxDist) break;
    if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; }
    else { cz += stepZ; tMaxZ += tDeltaZ; }
    if (cx < 0 || cz < 0 || cx >= g.cols || cz >= g.rows) break;
  }

  if (!best) return NO_HIT;
  return {
    hit: true,
    t: best.t,
    point: { x: ox + dx * best.t, y: oy + dy * best.t, z: oz + dz * best.t },
    normal: { x: best.nx, y: best.ny, z: best.nz },
    solid: bestSolid,
  };
}

/** True when nothing opaque sits between the two points. */
export function lineOfSight(world, a, b, opts = {}) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const hit = raycast(world, a, dir, dist - (opts.slack ?? 0.05), { opaqueOnly: true, skip: opts.skip });
  return !hit.hit;
}

/**
 * Colours of the surfaces around a point, weighted by proximity. Drives the
 * eyedropper, the blend meter, the bot painter and the end-of-round bonus.
 */
export function sampleSurroundings(world, pos, radius, limit = 24) {
  const props = world.map.props || [];
  const found = [];
  const g = world.grid;
  const c0 = cellX(world, pos.x - radius), c1 = cellX(world, pos.x + radius);
  const r0 = cellZ(world, pos.z - radius), r1 = cellZ(world, pos.z + radius);
  const seen = new Set();
  const r2 = radius * radius;

  // Solid props come from the grid...
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const list = g.cells[r * g.cols + c];
      if (!list) continue;
      for (const s of list) {
        if (seen.has(s.idx)) continue;
        seen.add(s.idx);
        const cxp = clamp(pos.x, s.minX, s.maxX);
        const cyp = clamp(pos.y + 0.6, s.minY, s.maxY);
        const czp = clamp(pos.z, s.minZ, s.maxZ);
        const d2 = (pos.x - cxp) ** 2 + (pos.y + 0.6 - cyp) ** 2 + (pos.z - czp) ** 2;
        if (d2 > r2) continue;
        const size = (s.hx * s.hy + s.hy * s.hz + s.hx * s.hz);
        found.push({
          color: s.color || [0.5, 0.5, 0.5],
          dist: Math.sqrt(d2),
          weight: (1 / (1 + d2)) * Math.min(3, 0.4 + size * 0.5),
          tag: s.tag,
        });
      }
    }
  }
  // ...and non-solid decoration is worth sampling too (rugs, posters, water).
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.solid) continue;
    const d2 = (pos.x - p.p[0]) ** 2 + (pos.y + 0.6 - p.p[1]) ** 2 + (pos.z - p.p[2]) ** 2;
    if (d2 > r2) continue;
    found.push({ color: p.c, dist: Math.sqrt(d2), weight: (1 / (1 + d2)) * 0.6, tag: p.tag || '' });
  }

  found.sort((a, b) => b.weight - a.weight);
  return found.slice(0, limit);
}
