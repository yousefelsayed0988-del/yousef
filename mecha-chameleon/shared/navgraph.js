// A coarse navigation graph baked from a map's collision geometry.
//
// Steering alone is not enough: a bot told to go to a spot in the next room
// walks into the wall between them and sits there. This samples standable
// ground on a grid (several levels per cell, so balconies and platforms are
// their own nodes), links neighbours a player could actually walk between, and
// runs A* over the result. Built once per world and cached.

import { MOVE } from './constants.js';
import { raycast, capsuleOverlaps, groundHeightAt } from './collision.js';

const cache = new WeakMap();
// Fine enough to find a doorway, coarse enough that a big map stays a few
// thousand nodes.
const SPACING = 1.2;
const MAX_LEVELS = 4;

export function getNavGraph(world, mapDef) {
  let nav = cache.get(world);
  if (!nav) {
    nav = buildNavGraph(world, mapDef);
    cache.set(world, nav);
  }
  return nav;
}

/**
 * Is a surface at (x, y, z) somewhere a player could be?
 *
 * Three ways to qualify, because one test cannot cover all three cases:
 *   - a full-height capsule fits (open floor);
 *   - a crouched capsule fits (under a table, inside a locker);
 *   - a full-height capsule fits one step up, which is what standing on a
 *     staircase tread actually looks like - the tread above always intersects
 *     a capsule placed flush on the one below.
 */
function standable(world, x, y, z, radius, height) {
  if (!capsuleOverlaps(world, x, y + 0.06, z, radius, height)) return true;
  if (!capsuleOverlaps(world, x, y + 0.06, z, radius * 0.85, MOVE.height[1])) return true;
  if (!capsuleOverlaps(world, x, y + MOVE.stepHeight, z, radius * 0.9, height)) return true;
  return false;
}

export function buildNavGraph(world, mapDef, spacing = SPACING) {
  const b = mapDef.bounds;
  const cols = Math.max(2, Math.ceil((b.maxX - b.minX) / spacing));
  const rows = Math.max(2, Math.ceil((b.maxZ - b.minZ) / spacing));
  const radius = MOVE.radius * 1.05;
  const height = MOVE.height[0];
  const nodes = [];
  const cells = new Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = b.minX + (c + 0.5) * spacing;
      const z = b.minZ + (r + 0.5) * spacing;
      const levels = [];

      // Walk downward through the column collecting every surface we could
      // stand on, so an upper floor is not hidden by the one below it.
      let from = b.maxY;
      for (let i = 0; i < MAX_LEVELS && from > (b.floorY ?? 0) - 0.5; i++) {
        const hit = raycast(world, { x, y: from, z }, { x: 0, y: -1, z: 0 }, from - (b.floorY ?? 0) + 1, {});
        const y = hit.hit ? hit.point.y : (b.floorY ?? 0);
        if (!Number.isFinite(y)) break;
        // The outside of the roof is not a place anyone plays.
        const onTopOfShell = hit.hit && (hit.solid?.tag === 'ceiling' || hit.solid?.tag === 'bound');
        if (!onTopOfShell && standable(world, x, y, z, radius, height)) levels.push(y);
        if (!hit.hit) break;
        from = y - 0.35;
      }

      const list = [];
      for (const y of levels) {
        const idx = nodes.length;
        nodes.push({ idx, x, y, z, c, r, links: [] });
        list.push(idx);
      }
      cells[r * cols + c] = list;
    }
  }

  // Link neighbours a player could actually traverse.
  for (const node of nodes) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = node.r + dr, nc = node.c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        for (const otherIdx of cells[nr * cols + nc] || []) {
          const other = nodes[otherIdx];
          const dy = other.y - node.y;
          const run = Math.hypot(other.x - node.x, other.z - node.z);
          // A single step up is capped by the step height, but a staircase
          // climbs far more than that between two grid cells - so allow a
          // slope, and prove it is a slope by checking the ground halfway.
          const maxRise = Math.max(MOVE.stepHeight, run * 0.85);
          if (dy > maxRise || dy < -2.6) continue;
          if (dy > MOVE.stepHeight) {
            const midGround = groundHeightAt(world,
              (node.x + other.x) / 2, (node.z + other.z) / 2, Math.max(node.y, other.y) + 1.5);
            if (midGround < node.y - 0.3 || midGround > other.y + 0.3) continue;
          }
          // The gap between them has to be clear at the higher of the two, or
          // a bot will happily route through a railing.
          const midY = Math.max(node.y, other.y);
          const mx = (node.x + other.x) / 2, mz = (node.z + other.z) / 2;
          if (capsuleOverlaps(world, mx, midY + 0.08, mz, radius * 0.95, height * 0.92)) continue;
          const cost = Math.hypot(other.x - node.x, other.z - node.z) + Math.abs(dy) * 1.6;
          node.links.push({ to: otherIdx, cost });
        }
      }
    }
  }

  return { nodes, cells, cols, rows, spacing, bounds: b };
}

/** Nearest graph node to a world point, preferring matching height. */
export function nearestNode(nav, p) {
  const b = nav.bounds;
  const c0 = Math.floor((p.x - b.minX) / nav.spacing);
  const r0 = Math.floor((p.z - b.minZ) / nav.spacing);
  let best = -1, bestScore = Infinity;
  for (let ring = 0; ring <= 4 && best < 0; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= nav.rows || c >= nav.cols) continue;
        for (const idx of nav.cells[r * nav.cols + c] || []) {
          const n = nav.nodes[idx];
          const score = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 2.5;
          if (score < bestScore) { bestScore = score; best = idx; }
        }
      }
    }
    if (best >= 0) break;
  }
  return best;
}

/**
 * A* between two world points. Returns an array of waypoints (excluding the
 * start), or null when there is no route. Short paths are string-pulled so
 * bots cut corners instead of visiting every grid centre.
 */
export function findPath(nav, from, to, maxNodes = 4000) {
  const startIdx = nearestNode(nav, from);
  const goalIdx = nearestNode(nav, to);
  if (startIdx < 0 || goalIdx < 0) return null;
  if (startIdx === goalIdx) return [{ x: to.x, y: to.y, z: to.z }];

  const n = nav.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const goal = nav.nodes[goalIdx];
  const h = (node) => Math.hypot(node.x - goal.x, node.z - goal.z) + Math.abs(node.y - goal.y);

  gScore[startIdx] = 0;
  const open = [{ idx: startIdx, f: h(nav.nodes[startIdx]) }];
  let expanded = 0;
  // Best effort: a spot tucked inside a shelf has no node of its own, so when
  // the goal is unreachable we still route to the closest place we can stand
  // and let local steering cover the last metre.
  let nearestIdx = startIdx;
  let nearestH = h(nav.nodes[startIdx]);

  while (open.length && expanded < maxNodes) {
    // Small graphs; a linear extract-min costs less than heap bookkeeping.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { idx } = open.splice(bi, 1)[0];
    if (idx === goalIdx) break;
    if (closed[idx]) continue;
    closed[idx] = 1;
    expanded++;
    const hh = h(nav.nodes[idx]);
    if (hh < nearestH) { nearestH = hh; nearestIdx = idx; }

    for (const link of nav.nodes[idx].links) {
      const tentative = gScore[idx] + link.cost;
      if (tentative >= gScore[link.to]) continue;
      gScore[link.to] = tentative;
      cameFrom[link.to] = idx;
      open.push({ idx: link.to, f: tentative + h(nav.nodes[link.to]) });
    }
  }

  const endIdx = gScore[goalIdx] === Infinity ? nearestIdx : goalIdx;
  if (endIdx === startIdx) return [{ x: to.x, y: to.y, z: to.z }];

  const path = [];
  let cur = endIdx;
  let guard = n;
  while (cur !== -1 && guard-- > 0) {
    const node = nav.nodes[cur];
    path.push({ x: node.x, y: node.y, z: node.z });
    if (cur === startIdx) break;
    cur = cameFrom[cur];
  }
  path.reverse();
  path.shift(); // we are already standing on the first node
  path.push({ x: to.x, y: to.y, z: to.z });
  return path;
}

/** Can a capsule walk straight between two points? Used to smooth paths. */
export function walkable(world, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const steps = Math.ceil(dist / (MOVE.radius * 0.9));
  const radius = MOVE.radius * 1.02;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t, z = a.z + dz * t;
    const y = groundHeightAt(world, x, z, Math.max(a.y, b.y) + 1.2);
    if (Math.abs(y - (a.y + (b.y - a.y) * t)) > MOVE.stepHeight + 0.35) return false;
    if (capsuleOverlaps(world, x, y + 0.08, z, radius, MOVE.height[0] * 0.9)) return false;
  }
  return true;
}
