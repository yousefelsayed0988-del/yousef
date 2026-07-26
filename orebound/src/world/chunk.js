// Chunk storage.
//
// A chunk column is 16x384x16. Storing that densely for every loaded column
// costs ~500 KB each, which at render distance 12 (625 columns) is not
// affordable. Two things keep it in budget:
//
//   1. Columns are split into 24 sections of 16^3, and a section that is
//      entirely one block (deep stone, open sky) stores a single `fill` value
//      with no arrays at all. Arrays are materialised only on first divergent
//      write. In practice ~60% of sections in a normal column stay uniform.
//   2. Light arrays are allocated separately from block arrays, so a uniform
//      stone section that is being lit still costs nothing for blocks.
//
// Section-local indices are (y<<8)|(z<<4)|x.

import { WORLD } from '../core/config.js';
import { AIR } from '../core/blocks.js';

export const SECTION_VOL = 4096;
export const localIndex = (x, y, z) => (y << 8) | (z << 4) | x;

export class Section {
  constructor(sy, fill = AIR) {
    this.sy = sy;              // 0..23, section index within the column
    this.fill = fill;          // block id when `blocks` is null
    this.blocks = null;        // Uint16Array(4096)
    this.states = null;        // Uint8Array(4096)
    this.skyFill = 0;
    this.sky = null;           // Uint8Array(4096)
    this.lightFill = 0;
    this.light = null;         // Uint8Array(4096)
    this.nonAir = fill === AIR ? 0 : SECTION_VOL;
    this.dirty = true;         // needs remeshing
    this.meshHandle = null;    // renderer-owned GPU handle
    this.meshPending = 0;      // meshing job generation, for stale-result rejection
  }

  get uniform() { return this.blocks === null; }
  get empty() { return this.nonAir === 0; }

  materialise() {
    if (this.blocks) return;
    this.blocks = new Uint16Array(SECTION_VOL);
    this.states = new Uint8Array(SECTION_VOL);
    if (this.fill !== AIR) this.blocks.fill(this.fill);
  }

  materialiseLight() {
    if (this.sky) return;
    this.sky = new Uint8Array(SECTION_VOL);
    this.light = new Uint8Array(SECTION_VOL);
    if (this.skyFill) this.sky.fill(this.skyFill);
    if (this.lightFill) this.light.fill(this.lightFill);
  }

  get(i) { return this.blocks ? this.blocks[i] : this.fill; }
  getState(i) { return this.states ? this.states[i] : 0; }

  set(i, id, state = 0) {
    if (!this.blocks) {
      if (id === this.fill && state === 0) return false;
      this.materialise();
    }
    const prev = this.blocks[i];
    if (prev === id && this.states[i] === state) return false;
    if (prev === AIR && id !== AIR) this.nonAir++;
    else if (prev !== AIR && id === AIR) this.nonAir--;
    this.blocks[i] = id;
    this.states[i] = state;
    return true;
  }

  setState(i, state) {
    if (!this.states) {
      if (state === 0) return false;
      this.materialise();
    }
    if (this.states[i] === state) return false;
    this.states[i] = state;
    return true;
  }

  getSky(i) { return this.sky ? this.sky[i] : this.skyFill; }
  getLight(i) { return this.light ? this.light[i] : this.lightFill; }

  setSky(i, v) {
    if (!this.sky) { if (v === this.skyFill) return false; this.materialiseLight(); }
    if (this.sky[i] === v) return false;
    this.sky[i] = v; return true;
  }
  setLight(i, v) {
    if (!this.light) { if (v === this.lightFill) return false; this.materialiseLight(); }
    if (this.light[i] === v) return false;
    this.light[i] = v; return true;
  }

  fillSky(v) { this.sky = null; this.skyFill = v; }
  fillLight(v) { this.light = null; this.lightFill = v; }

  /** Try to collapse back to a uniform section (called after bulk edits). */
  compact() {
    if (!this.blocks) return;
    const first = this.blocks[0];
    if (this.states[0] !== 0) return;
    for (let i = 1; i < SECTION_VOL; i++) {
      if (this.blocks[i] !== first || this.states[i] !== 0) return;
    }
    this.fill = first;
    this.blocks = null;
    this.states = null;
    this.nonAir = first === AIR ? 0 : SECTION_VOL;
  }
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.sections = new Array(WORLD.SECTIONS).fill(null);
    this.heightmap = new Int16Array(256).fill(WORLD.MIN_Y - 1);  // top non-air world y
    this.surface = new Int16Array(256).fill(WORLD.MIN_Y - 1);    // top light-blocking y
    this.biome = new Uint8Array(256);
    this.blockEntities = new Map();   // localIndex-with-y -> entity data
    this.diff = new Map();            // packed index -> (id<<8)|state, saved to disk
    this.generated = false;
    this.populated = false;
    this.lit = false;
    this.decorated = false;
    this.lastAccess = 0;
    this.dirtySave = false;
    this.entities = [];               // entities whose chunk this is (for save)
  }

  section(sy) { return this.sections[sy]; }

  ensureSection(sy, fill = AIR) {
    let s = this.sections[sy];
    if (!s) s = this.sections[sy] = new Section(sy, fill);
    return s;
  }

  /** y is a world Y coordinate; x,z are 0..15. */
  getBlock(x, y, z) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return AIR;
    const sy = (y - WORLD.MIN_Y) >> 4;
    const s = this.sections[sy];
    if (!s) return AIR;
    return s.get(localIndex(x, y & 15, z));
  }

  getState(x, y, z) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return 0;
    const s = this.sections[(y - WORLD.MIN_Y) >> 4];
    return s ? s.getState(localIndex(x, y & 15, z)) : 0;
  }

  setBlock(x, y, z, id, state = 0) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return false;
    const sy = (y - WORLD.MIN_Y) >> 4;
    const s = this.ensureSection(sy);
    const changed = s.set(localIndex(x, y & 15, z), id, state);
    if (changed) s.dirty = true;
    return changed;
  }

  getSky(x, y, z) {
    if (y >= WORLD.MAX_Y) return 15;
    if (y < WORLD.MIN_Y) return 0;
    const s = this.sections[(y - WORLD.MIN_Y) >> 4];
    return s ? s.getSky(localIndex(x, y & 15, z)) : 15;
  }
  getLight(x, y, z) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return 0;
    const s = this.sections[(y - WORLD.MIN_Y) >> 4];
    return s ? s.getLight(localIndex(x, y & 15, z)) : 0;
  }
  setSky(x, y, z, v) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return false;
    const s = this.ensureSection((y - WORLD.MIN_Y) >> 4);
    return s.setSky(localIndex(x, y & 15, z), v);
  }
  setLight(x, y, z, v) {
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return false;
    const s = this.ensureSection((y - WORLD.MIN_Y) >> 4);
    return s.setLight(localIndex(x, y & 15, z), v);
  }

  markDirty(y) {
    const sy = (y - WORLD.MIN_Y) >> 4;
    const s = this.sections[sy];
    if (s) s.dirty = true;
  }

  /** Record a player edit so it can be replayed over generated terrain on load. */
  recordDiff(x, y, z, id, state) {
    const key = ((y - WORLD.MIN_Y) << 8) | (z << 4) | x;
    this.diff.set(key, (id << 8) | (state & 255));
    this.dirtySave = true;
  }

  blockEntityKey(x, y, z) { return ((y - WORLD.MIN_Y) << 8) | (z << 4) | x; }
  getBlockEntity(x, y, z) { return this.blockEntities.get(this.blockEntityKey(x, y, z)) || null; }
  setBlockEntity(x, y, z, data) {
    const k = this.blockEntityKey(x, y, z);
    if (data == null) this.blockEntities.delete(k); else this.blockEntities.set(k, data);
    this.dirtySave = true;
  }

  /** Recompute the top solid / light-blocking heights for a column. */
  recomputeHeight(x, z, opacityTable) {
    let top = WORLD.MIN_Y - 1, surf = WORLD.MIN_Y - 1;
    for (let sy = WORLD.SECTIONS - 1; sy >= 0; sy--) {
      const s = this.sections[sy];
      if (!s || s.empty) continue;
      const baseY = WORLD.MIN_Y + sy * 16;
      for (let y = 15; y >= 0; y--) {
        const id = s.get(localIndex(x, y, z));
        if (id === AIR) continue;
        const wy = baseY + y;
        if (top < wy) top = wy;
        if (surf < wy && opacityTable[id] >= 15) { surf = wy; }
        if (top >= 0 && surf >= WORLD.MIN_Y) break;
      }
      if (surf >= WORLD.MIN_Y) break;
    }
    this.heightmap[z * 16 + x] = top;
    this.surface[z * 16 + x] = surf;
  }

  disposeGPU(renderer) {
    for (const s of this.sections) {
      if (s && s.meshHandle) { renderer.freeMesh(s.meshHandle); s.meshHandle = null; }
    }
  }
}

export function chunkKey(cx, cz) {
  // Pack two 32-bit signed coords into one string-free numeric key.
  // World border is +/-30,000,000 blocks = +/-1,875,000 chunks, which fits in
  // 22 bits signed; 24 bits of headroom each keeps the key exact in a double.
  return (cx + 0x800000) * 0x1000000 + (cz + 0x800000);
}
export function keyToCX(key) { return Math.floor(key / 0x1000000) - 0x800000; }
export function keyToCZ(key) { return (key % 0x1000000) - 0x800000; }
