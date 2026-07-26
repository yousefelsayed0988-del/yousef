// Light engine.
//
// Sky light and block light are separate 4-bit channels combined at shading
// time. Propagation is a breadth-first flood fill run from a bounded work queue:
// `update(budget)` processes at most `budget` node expansions per frame, so a
// pathological edit (draining an ocean, blowing up a cave roof) degrades into a
// visible light "wave" instead of a frame hitch or an infinite loop.

import { WORLD } from '../core/config.js';
import { BLOCKS, AIR } from '../core/blocks.js';

const { MIN_Y, MAX_Y, SECTIONS } = WORLD;

/** Growable FIFO of (x, y, z, level) quads backed by an Int32Array. */
class NodeQueue {
  constructor(cap = 4096) {
    this.a = new Int32Array(cap * 4);
    this.head = 0; this.tail = 0; this.cap = cap;
  }
  get size() { return this.tail - this.head; }
  clear() { this.head = this.tail = 0; }
  push(x, y, z, l) {
    if (this.tail * 4 + 4 > this.a.length) this._compact();
    const o = this.tail * 4;
    this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; this.a[o + 3] = l;
    this.tail++;
  }
  _compact() {
    const live = this.tail - this.head;
    if (this.head > 0 && live * 2 < this.cap) {
      this.a.copyWithin(0, this.head * 4, this.tail * 4);
      this.tail = live; this.head = 0;
      return;
    }
    const cap = this.cap * 2;
    const a = new Int32Array(cap * 4);
    a.set(this.a.subarray(this.head * 4, this.tail * 4));
    this.a = a; this.cap = cap; this.tail = live; this.head = 0;
  }
}

const DIRS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

export class LightEngine {
  constructor(world) {
    this.world = world;
    this.blockAdd = new NodeQueue();
    this.blockRemove = new NodeQueue();
    this.skyAdd = new NodeQueue(16384);
    this.skyRemove = new NodeQueue();
    this.opacity = new Uint8Array(BLOCKS.length);
    this.emit = new Uint8Array(BLOCKS.length);
    for (const b of BLOCKS) { this.opacity[b.id] = b.opacity; this.emit[b.id] = b.emit; }
    this.pending = 0;
  }

  get backlog() {
    return this.blockAdd.size + this.blockRemove.size + this.skyAdd.size + this.skyRemove.size;
  }

  // ------------------------------------------------------------ public API
  /** Seed sky light for a freshly generated chunk. */
  initChunkSky(chunk) {
    const w = this.world;
    let maxSurface = MIN_Y - 1;
    for (let i = 0; i < 256; i++) if (chunk.surface[i] > maxSurface) maxSurface = chunk.surface[i];

    for (let sy = SECTIONS - 1; sy >= 0; sy--) {
      const base = MIN_Y + sy * 16;
      const s = chunk.ensureSection(sy);
      if (base > maxSurface) { s.fillSky(15); continue; }
      s.materialiseLight();
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const top = chunk.surface[z * 16 + x];
          for (let ly = 0; ly < 16; ly++) {
            const y = base + ly;
            s.sky[(ly << 8) | (z << 4) | x] = y > top ? 15 : 0;
          }
        }
      }
    }

    const ox = chunk.cx << 4, oz = chunk.cz << 4;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const top = chunk.surface[z * 16 + x];
        this.skyAdd.push(ox + x, Math.min(MAX_Y - 1, top + 1), oz + z, 15);
      }
    }

    // A neighbour that was lit before this chunk existed stopped its flood fill
    // at the shared border (an absent chunk reads as fully lit, so propagation
    // saw no gradient to cross). Re-seed from the neighbour's border columns so
    // light flows into the new chunk. Bounded to the band around the surface --
    // that is where sky light actually varies.
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = w.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!n || !n.lit) continue;
      const nox = n.cx << 4, noz = n.cz << 4;
      for (let i = 0; i < 16; i++) {
        const bx = dx === -1 ? nox + 15 : dx === 1 ? nox : nox + i;
        const bz = dz === -1 ? noz + 15 : dz === 1 ? noz : noz + i;
        const top = n.surface[(bz - noz) * 16 + (bx - nox)];
        const hi = Math.min(MAX_Y - 1, top + 2);
        const lo = Math.max(MIN_Y, top - 40);
        for (let y = hi; y >= lo; y--) {
          const l = w.getSkyLight(bx, y, bz);
          if (l > 0) this.skyAdd.push(bx, y, bz, l);
        }
      }
    }
    chunk.lit = true;
  }

  /** Called after a block changes at (x,y,z) from `oldId` to `newId`. */
  onBlockChanged(x, y, z, oldId, newId) {
    const w = this.world;
    const oldOp = this.opacity[oldId], newOp = this.opacity[newId];
    const oldEmit = this.emit[oldId], newEmit = this.emit[newId];

    // --- block light
    if (oldEmit > 0) {
      const cur = w.getBlockLight(x, y, z);
      w.setBlockLight(x, y, z, 0);
      this.blockRemove.push(x, y, z, cur);
    }
    if (newEmit > 0) {
      w.setBlockLight(x, y, z, newEmit);
      this.blockAdd.push(x, y, z, newEmit);
    }
    if (newOp >= 15 && oldOp < 15) {
      const cur = w.getBlockLight(x, y, z);
      if (cur > 0) { w.setBlockLight(x, y, z, 0); this.blockRemove.push(x, y, z, cur); }
      const sky = w.getSkyLight(x, y, z);
      if (sky > 0) { w.setSkyLight(x, y, z, 0); this.skyRemove.push(x, y, z, sky); }
    } else if (newOp < 15) {
      // opened up: pull light in from every neighbour
      for (const [dx, dy, dz] of DIRS) {
        const bl = w.getBlockLight(x + dx, y + dy, z + dz);
        if (bl > 1) this.blockAdd.push(x + dx, y + dy, z + dz, bl);
        const sl = w.getSkyLight(x + dx, y + dy, z + dz);
        if (sl > 0) this.skyAdd.push(x + dx, y + dy, z + dz, sl);
      }
      if (newEmit > 0) { w.setBlockLight(x, y, z, newEmit); this.blockAdd.push(x, y, z, newEmit); }
    }

    // --- sky column: a change in opacity shifts the whole column below it
    if ((oldOp >= 15) !== (newOp >= 15)) {
      this.recomputeColumnSky(x, z, y);
    }
  }

  /** Recompute a single column's direct sky exposure from `fromY` downward. */
  recomputeColumnSky(x, z, fromY) {
    const w = this.world;
    const chunk = w.getChunk(x >> 4, z >> 4);
    if (!chunk) return;
    const lx = x & 15, lz = z & 15;
    const prevTop = chunk.surface[lz * 16 + lx];
    chunk.recomputeHeight(lx, lz, this.opacity);
    const newTop = chunk.surface[lz * 16 + lx];
    if (newTop === prevTop) return;

    if (newTop < prevTop) {
      // sky opened up: everything from newTop+1..prevTop now sees the sky
      for (let y = newTop + 1; y <= prevTop && y < MAX_Y; y++) {
        if (this.opacity[w.getBlock(x, y, z)] >= 15) continue;
        w.setSkyLight(x, y, z, 15);
        this.skyAdd.push(x, y, z, 15);
      }
    } else {
      // sky was blocked: strip direct light below the new top
      for (let y = prevTop + 1; y <= newTop && y < MAX_Y; y++) {
        const cur = w.getSkyLight(x, y, z);
        if (cur > 0) { w.setSkyLight(x, y, z, 0); this.skyRemove.push(x, y, z, cur); }
      }
      for (let y = newTop - 1; y >= MIN_Y; y--) {
        const cur = w.getSkyLight(x, y, z);
        if (cur === 0) break;
        w.setSkyLight(x, y, z, 0);
        this.skyRemove.push(x, y, z, cur);
      }
    }
  }

  /** Process at most `budget` node expansions. Returns the number consumed. */
  update(budget) {
    let used = 0;
    used += this.processRemove(this.blockRemove, this.blockAdd, false, budget - used);
    used += this.processAdd(this.blockAdd, false, budget - used);
    used += this.processRemove(this.skyRemove, this.skyAdd, true, budget - used);
    used += this.processAdd(this.skyAdd, true, budget - used);
    return used;
  }

  processAdd(q, isSky, budget) {
    const w = this.world;
    let used = 0;
    while (q.size > 0 && used < budget) {
      const o = q.head * 4;
      const x = q.a[o], y = q.a[o + 1], z = q.a[o + 2];
      q.head++;
      used++;
      const level = isSky ? w.getSkyLight(x, y, z) : w.getBlockLight(x, y, z);
      if (level <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < MIN_Y || ny >= MAX_Y) continue;
        const nid = w.getBlock(nx, ny, nz);
        const op = this.opacity[nid];
        if (op >= 15) continue;
        // sky light falls straight down without attenuation while it is full
        let next = (isSky && dy === -1 && level === 15) ? 15 : level - 1;
        next -= op;
        if (next <= 0) continue;
        const cur = isSky ? w.getSkyLight(nx, ny, nz) : w.getBlockLight(nx, ny, nz);
        if (cur >= next) continue;
        if (isSky) w.setSkyLight(nx, ny, nz, next); else w.setBlockLight(nx, ny, nz, next);
        w.markLightDirty(nx, ny, nz);
        q.push(nx, ny, nz, next);
      }
    }
    if (q.size === 0) q.clear();
    return used;
  }

  processRemove(q, addQ, isSky, budget) {
    const w = this.world;
    let used = 0;
    while (q.size > 0 && used < budget) {
      const o = q.head * 4;
      const x = q.a[o], y = q.a[o + 1], z = q.a[o + 2], level = q.a[o + 3];
      q.head++;
      used++;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < MIN_Y || ny >= MAX_Y) continue;
        const cur = isSky ? w.getSkyLight(nx, ny, nz) : w.getBlockLight(nx, ny, nz);
        if (cur === 0) continue;
        const straightDown = isSky && dy === -1 && level === 15;
        if (cur < level || straightDown) {
          if (isSky) w.setSkyLight(nx, ny, nz, 0); else w.setBlockLight(nx, ny, nz, 0);
          w.markLightDirty(nx, ny, nz);
          q.push(nx, ny, nz, cur === 0 ? level : cur);
        } else {
          // this neighbour is lit by something else -- re-propagate from it
          addQ.push(nx, ny, nz, cur);
        }
      }
    }
    if (q.size === 0) q.clear();
    return used;
  }
}
