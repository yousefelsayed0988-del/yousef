// Fluid flow.
//
// Water spreads 7 blocks from a source, lava 3 (and slower). Level 0 is a
// source; 1..7 are flowing, decreasing outward. Bit 3 marks a falling column,
// which re-sources at full strength on the block below.
//
// Water/lava contact rules, as specified:
//   flowing water + lava SOURCE   -> obsidian
//   flowing water + flowing lava  -> cobblestone
//   lava (any) touched by water   -> stone (above) / cobblestone (side)

import { BLOCKS, blockId, AIR } from '../core/blocks.js';
import { packPos } from './world.js';

const WATER = blockId('water');
const LAVA = blockId('lava');
const OBSIDIAN = blockId('obsidian');
const COBBLESTONE = blockId('cobblestone');
const STONE = blockId('stone');

const WATER_RANGE = 7;
const LAVA_RANGE = 3;
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const level = s => s & 7;
const falling = s => (s & 8) !== 0;
const mk = (lvl, fall) => (lvl & 7) | (fall ? 8 : 0);

export class FluidSim {
  constructor(world) {
    this.world = world;
    this.budget = 512;
  }

  /** Run all fluid updates that are due this tick. */
  tick() {
    const w = this.world;
    if (w.fluidQueue.length === 0) return;
    const due = [];
    const keep = [];
    for (const e of w.fluidQueue) {
      const cur = w.pendingFluid.get(e.key);
      if (cur === undefined) continue;
      if (e.due > w.time) { keep.push(e); continue; }
      if (cur !== e.due) continue;      // superseded by an earlier reschedule
      w.pendingFluid.delete(e.key);
      due.push(e);
    }
    w.fluidQueue = keep;

    let n = 0;
    for (const e of due) {
      if (n++ > this.budget) { w.scheduleFluid(e.x, e.y, e.z, 2); continue; }
      this.updateFluid(e.x, e.y, e.z);
    }
  }

  updateFluid(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (id !== WATER && id !== LAVA) return;
    const isWater = id === WATER;
    const range = isWater ? WATER_RANGE : LAVA_RANGE;
    const delay = isWater ? 3 : 12;
    let state = w.getState(x, y, z);
    let lvl = level(state);

    if (this.checkContact(x, y, z, id)) return;

    // --- non-source blocks recompute their level from their neighbours
    if (lvl > 0) {
      const feedAbove = w.getBlock(x, y + 1, z) === id;
      let best = 8;
      for (const [dx, dz] of SIDES) {
        const nid = w.getBlock(x + dx, y, z + dz);
        if (nid !== id) continue;
        const nl = level(w.getState(x + dx, y, z + dz));
        if (nl < best) best = nl;
      }
      let want = feedAbove ? 1 : best + 1;
      if (feedAbove) want = 1;
      if (want > range || (!feedAbove && best >= range)) want = 8;

      if (want >= 8) {
        // no longer fed: dry up and let neighbours re-evaluate
        w.setBlock(x, y, z, AIR, 0, { record: false, updates: false });
        this.scheduleAround(x, y, z, delay);
        return;
      }
      if (want !== lvl || falling(state) !== feedAbove) {
        lvl = want;
        state = mk(lvl, feedAbove);
        w.setBlock(x, y, z, id, state, { record: false, updates: false });
      }
    }

    // --- spread downward first
    const belowId = w.getBlock(x, y - 1, z);
    const belowDef = BLOCKS[belowId];
    if (belowId === AIR || (belowDef.replaceable && !belowDef.liquid)) {
      this.place(x, y - 1, z, id, mk(1, true), delay);
      return;
    }
    if (belowId !== id && belowDef.liquid) {
      this.contactPair(x, y - 1, z, id, belowId);
      return;
    }
    if (belowId === id && !falling(w.getState(x, y - 1, z))) {
      // keep the column below topped up
      this.place(x, y - 1, z, id, mk(1, true), delay);
    }
    const flowsDown = belowId === id || belowId === AIR;
    if (flowsDown) return;

    // --- then sideways, if we still have range left
    const nextLevel = lvl + 1;
    if (nextLevel > range) return;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx, nz = z + dz;
      const nid = w.getBlock(nx, y, nz);
      const nd = BLOCKS[nid];
      if (nid === id) {
        const nl = level(w.getState(nx, y, nz));
        if (nl > nextLevel && !falling(w.getState(nx, y, nz))) this.place(nx, y, nz, id, mk(nextLevel, false), delay);
        continue;
      }
      if (nid !== AIR && !nd.replaceable) continue;
      if (nd.liquid && nid !== id) { this.contactPair(nx, y, nz, id, nid); continue; }
      if (nid !== AIR && nd.replaceable && !nd.liquid) {
        // wash away grass, flowers, torches
        if (this.world.onFluidWash) this.world.onFluidWash(nx, y, nz);
      }
      this.place(nx, y, nz, id, mk(nextLevel, false), delay);
    }
  }

  place(x, y, z, id, state, delay) {
    this.world.setBlock(x, y, z, id, state, { record: false, updates: false });
    this.world.scheduleFluid(x, y, z, delay);
    this.scheduleAround(x, y, z, delay);
    this.world.notifyNeighbours(x, y, z);
  }

  scheduleAround(x, y, z, delay) {
    const w = this.world;
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      const id = w.getBlock(x + dx, y + dy, z + dz);
      if (id === WATER || id === LAVA) w.scheduleFluid(x + dx, y + dy, z + dz, delay);
    }
  }

  /** Returns true when the block was converted to stone/obsidian/cobble. */
  checkContact(x, y, z, id) {
    const w = this.world;
    const other = id === WATER ? LAVA : WATER;
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      if (w.getBlock(x + dx, y + dy, z + dz) === other) {
        return this.contactPair(x, y, z, id, other, dx, dy, dz);
      }
    }
    return false;
  }

  /**
   * Resolve a water/lava meeting. `x,y,z` is the block being updated, `id` its
   * fluid; `otherId` is the fluid it touched.
   */
  contactPair(x, y, z, id, otherId, dx = 0, dy = 0, dz = 0) {
    const w = this.world;
    if (id === otherId) return false;
    // Identify which cell holds the lava -- that is the one that solidifies.
    let lx = x, ly = y, lz = z, waterFromAbove = false;
    if (id === WATER) { lx = x + dx; ly = y + dy; lz = z + dz; waterFromAbove = dy === -1; }
    else { waterFromAbove = dy === 1; }
    if (w.getBlock(lx, ly, lz) !== LAVA) return false;

    const lavaState = w.getState(lx, ly, lz);
    const lavaSource = level(lavaState) === 0;
    const waterX = id === WATER ? x : x + dx;
    const waterY = id === WATER ? y : y + dy;
    const waterZ = id === WATER ? z : z + dz;
    const waterSource = level(w.getState(waterX, waterY, waterZ)) === 0;

    let result;
    if (!waterSource && lavaSource) result = OBSIDIAN;        // flowing water + lava source
    else if (!waterSource && !lavaSource) result = COBBLESTONE; // both flowing
    else if (waterFromAbove) result = STONE;                   // water falling onto lava
    else result = lavaSource ? OBSIDIAN : COBBLESTONE;

    w.setBlock(lx, ly, lz, result, 0, { record: true });
    if (w.onFluidSolidify) w.onFluidSolidify(lx, ly, lz, result);
    this.scheduleAround(lx, ly, lz, 3);
    return true;
  }

  /**
   * Infinite water source rule: a flowing water block adjacent to two or more
   * water SOURCES becomes a source itself. That is what makes a 2x2 (or 1x3
   * with a middle cell) pool self-replenishing.
   */
  tryInfiniteSource(x, y, z) {
    const w = this.world;
    if (w.getBlock(x, y, z) !== WATER) return false;
    if (level(w.getState(x, y, z)) === 0) return false;
    let sources = 0;
    for (const [dx, dz] of SIDES) {
      if (w.getBlock(x + dx, y, z + dz) === WATER && level(w.getState(x + dx, y, z + dz)) === 0) sources++;
    }
    if (sources >= 2) {
      w.setBlock(x, y, z, WATER, 0, { record: false, updates: false });
      this.scheduleAround(x, y, z, 3);
      return true;
    }
    return false;
  }
}
