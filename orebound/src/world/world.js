// The world: chunk lifecycle, worker pools, block access, and the meshing
// pipeline.
//
// Loading is nearest-first out of a priority queue. Generation happens on one
// worker pool and meshing on a second, so a slow generation burst never stalls
// remeshing of blocks the player just placed. Nothing about either pool blocks
// the render thread.

import { WORLD, CONFIG, workerCount, TPS } from '../core/config.js';
import { Chunk, Section, chunkKey, localIndex } from './chunk.js';
import { BLOCKS, AIR, WATER, LAVA, blockId, isSolidCube } from '../core/blocks.js';
import { BIOMES } from './biomes.js';
import { LightEngine } from './lighting.js';
import { WorldGen } from './worldgen.js';
import { Random } from '../core/rng.js';

const { MIN_Y, MAX_Y, SECTIONS, SEA_LEVEL } = WORLD;
const PAD = 18;
const PADVOL = PAD * PAD * PAD;
const pidx = (x, y, z) => ((y + 1) * PAD + (z + 1)) * PAD + (x + 1);
const tpidx = (x, z) => (z + 1) * PAD + (x + 1);

export class World {
  constructor(seed, opts = {}) {
    this.seed = seed | 0;
    this.chunks = new Map();
    this.gen = new WorldGen(this.seed);
    this.light = new LightEngine(this);
    this.rng = new Random(this.seed ^ 0x1234);

    this.time = 0;                 // total ticks elapsed
    this.weather = { type: 'clear', ticks: 12000, intensity: 0, target: 0 };

    this.entities = [];
    this.pendingFluid = new Map();   // packed block key -> tick due
    this.fluidQueue = [];
    this.scheduledTicks = new Map(); // packed key -> { tick, fn }

    this.dirtySections = new Set();
    this.meshInFlight = new Map();
    this.genInFlight = new Set();
    this.requestQueue = [];
    this.scratchPool = [];
    this.stats = { generated: 0, meshed: 0, genMs: 0, meshMs: 0, queued: 0 };

    this._lastChunk = null;
    this._lastKey = -1;

    this.onChunkReady = opts.onChunkReady || null;   // save system hook
    this.onChunkUnload = opts.onChunkUnload || null;
    this.renderer = opts.renderer || null;

    this._initWorkers();
  }

  // ------------------------------------------------------------- worker pools
  _initWorkers() {
    const genN = workerCount('gen');
    const meshN = workerCount('mesh');
    this.genWorkers = [];
    this.meshWorkers = [];
    this.genBusy = [];
    this.meshBusy = [];

    for (let i = 0; i < genN; i++) {
      const w = new Worker(new URL('../workers/genworker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onGenMessage(i, e.data);
      w.postMessage({ type: 'init', seed: this.seed });
      this.genWorkers.push(w);
      this.genBusy.push(false);
    }
    for (let i = 0; i < meshN; i++) {
      const w = new Worker(new URL('../workers/meshworker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onMeshMessage(i, e.data);
      this.meshWorkers.push(w);
      this.meshBusy.push(false);
    }
  }

  setMeshTables(tables) {
    this.meshTables = tables;
    for (const w of this.meshWorkers) w.postMessage({ type: 'init', tables });
  }

  dispose() {
    for (const w of this.genWorkers) w.terminate();
    for (const w of this.meshWorkers) w.terminate();
  }

  // ----------------------------------------------------------- chunk access
  getChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (key === this._lastKey) return this._lastChunk;
    const c = this.chunks.get(key);
    if (c) { this._lastKey = key; this._lastChunk = c; }
    return c || null;
  }

  chunkAt(x, z) { return this.getChunk(x >> 4, z >> 4); }

  isLoaded(cx, cz) {
    const c = this.chunks.get(chunkKey(cx, cz));
    return !!(c && c.generated);
  }

  getBlock(x, y, z) {
    if (y < MIN_Y || y >= MAX_Y) return AIR;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return AIR;
    const s = c.sections[(y - MIN_Y) >> 4];
    if (!s) return AIR;
    return s.get(((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
  }

  getState(x, y, z) {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    const s = c.sections[(y - MIN_Y) >> 4];
    if (!s) return 0;
    return s.getState(((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
  }

  getDef(x, y, z) { return BLOCKS[this.getBlock(x, y, z)]; }

  getSkyLight(x, y, z) {
    if (y >= MAX_Y) return 15;
    if (y < MIN_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 15;
    const s = c.sections[(y - MIN_Y) >> 4];
    if (!s) return 15;
    return s.getSky(((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
  }

  getBlockLight(x, y, z) {
    if (y < MIN_Y || y >= MAX_Y) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    const s = c.sections[(y - MIN_Y) >> 4];
    if (!s) return 0;
    return s.getLight(((y & 15) << 8) | ((z & 15) << 4) | (x & 15));
  }

  setSkyLight(x, y, z, v) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    c.setSky(x & 15, y, z & 15, v);
  }
  setBlockLight(x, y, z, v) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    c.setLight(x & 15, y, z & 15, v);
  }

  /** Combined light level 0..15 used for mob spawning and the debug overlay. */
  lightLevel(x, y, z) {
    const sky = Math.round(this.getSkyLight(x, y, z) * this.skyLightFactor());
    return Math.max(sky, this.getBlockLight(x, y, z));
  }

  /**
   * Sun elevation, -1 (midnight) .. 1 (noon). The day fraction is anchored so
   * 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight -- a new world
   * therefore starts at first light, not in the dark.
   */
  sunElevation() { return Math.sin(this.dayFraction() * Math.PI * 2); }

  /** How much of full sky light reaches the ground right now (0..1). */
  skyLightFactor() {
    // A narrow band around the horizon keeps dawn and dusk short and dramatic
    // instead of spreading twilight over a third of the day.
    const e = this.sunElevation();
    const bright = smoothstep01(-0.12, 0.20, e);
    let level = 0.20 + bright * 0.80;
    if (this.weather.intensity > 0) level *= 1 - 0.30 * this.weather.intensity;
    return Math.max(0.18, Math.min(1, level));
  }

  dayFraction() { return (this.time % CONFIG.dayLengthTicks) / CONFIG.dayLengthTicks; }
  isNight() { return this.sunElevation() < -0.04; }
  isRaining() { return this.weather.type !== 'clear' && this.weather.intensity > 0.1; }
  isThundering() { return this.weather.type === 'thunder' && this.weather.intensity > 0.4; }

  biomeAt(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.generated) return BIOMES[this.gen.biomeAt(x, z)];
    return BIOMES[c.biome[(z & 15) * 16 + (x & 15)]];
  }

  heightAt(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.generated) return this.gen.heightAt(x, z);
    return c.heightmap[(z & 15) * 16 + (x & 15)];
  }

  /** Topmost non-air block y in a column, scanning down from the build cap. */
  topSolid(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return this.gen.heightAt(x, z);
    return c.heightmap[(z & 15) * 16 + (x & 15)];
  }

  // -------------------------------------------------------------- mutation
  /**
   * Set a block and run all the consequences: light, remesh, neighbour
   * updates, fluid scheduling, save diff.
   */
  setBlock(x, y, z, id, state = 0, opts = {}) {
    if (y < MIN_Y || y >= MAX_Y) return false;
    if (Math.abs(x) > WORLD.BORDER || Math.abs(z) > WORLD.BORDER) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    const old = c.getBlock(lx, y, lz);
    const oldState = c.getState(lx, y, lz);
    if (old === id && oldState === state) return false;

    c.setBlock(lx, y, lz, id, state);
    if (opts.record !== false) c.recordDiff(lx, y, lz, id, state);
    if (BLOCKS[old].entity && !BLOCKS[id].entity) c.setBlockEntity(lx, y, lz, null);

    c.recomputeHeight(lx, lz, this.light.opacity);
    this.markDirty(x, y, z);
    this.light.onBlockChanged(x, y, z, old, id);

    if (opts.updates !== false) {
      this.notifyNeighbours(x, y, z);
      this.scheduleFluidAround(x, y, z);
    }
    return true;
  }

  setState(x, y, z, state, opts = {}) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    if (c.getState(lx, y, lz) === state) return false;
    const id = c.getBlock(lx, y, lz);
    c.setBlock(lx, y, lz, id, state);
    if (opts.record !== false) c.recordDiff(lx, y, lz, id, state);
    this.markDirty(x, y, z);
    return true;
  }

  getBlockEntity(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.getBlockEntity(x & 15, y, z & 15) : null;
  }
  setBlockEntity(x, y, z, data) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c) c.setBlockEntity(x & 15, y, z & 15, data);
  }

  /** Mark the section containing (x,y,z) -- and any touching one -- for remesh. */
  markDirty(x, y, z) {
    const cx = x >> 4, cz = z >> 4;
    const sy = (y - MIN_Y) >> 4;
    this._dirty(cx, cz, sy);
    const lx = x & 15, lz = z & 15, ly = (y - MIN_Y) & 15;
    if (lx === 0) this._dirty(cx - 1, cz, sy);
    if (lx === 15) this._dirty(cx + 1, cz, sy);
    if (lz === 0) this._dirty(cx, cz - 1, sy);
    if (lz === 15) this._dirty(cx, cz + 1, sy);
    if (ly === 0) this._dirty(cx, cz, sy - 1);
    if (ly === 15) this._dirty(cx, cz, sy + 1);
    // diagonals matter for ambient occlusion at section corners
    if (lx === 0 && lz === 0) this._dirty(cx - 1, cz - 1, sy);
    if (lx === 15 && lz === 0) this._dirty(cx + 1, cz - 1, sy);
    if (lx === 0 && lz === 15) this._dirty(cx - 1, cz + 1, sy);
    if (lx === 15 && lz === 15) this._dirty(cx + 1, cz + 1, sy);
  }

  markLightDirty(x, y, z) { this.markDirty(x, y, z); }

  _dirty(cx, cz, sy) {
    if (sy < 0 || sy >= SECTIONS) return;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.generated) return;
    const s = c.sections[sy];
    if (s) s.dirty = true;
    this.dirtySections.add(chunkKey(cx, cz) * 32 + sy);
  }

  // ----------------------------------------------------- neighbour updates
  notifyNeighbours(x, y, z) {
    const list = this._updateList || (this._updateList = []);
    list.push(x, y, z);
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 2, 0]]) {
      list.push(x + dx, y + dy, z + dz);
    }
  }

  /** Apply queued neighbour reactions: gravity, unsupported plants, doors. */
  processUpdates(limit = 4096) {
    const list = this._updateList;
    if (!list || list.length === 0) return;
    let n = 0;
    while (list.length > 0 && n < limit) {
      const z = list.pop(), y = list.pop(), x = list.pop();
      n++;
      this.updateBlock(x, y, z);
    }
  }

  updateBlock(x, y, z) {
    const id = this.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (!def || id === AIR) return;

    if (def.gravity) {
      const below = this.getBlock(x, y - 1, z);
      const bd = BLOCKS[below];
      if (below === AIR || bd.liquid || bd.replaceable) {
        this.spawnFallingBlock(x, y, z, id, this.getState(x, y, z));
        return;
      }
    }

    if (def.supportNeeded) {
      if (!this.supportOK(x, y, z, def, this.getState(x, y, z))) {
        this.breakNaturally(x, y, z, null);
        return;
      }
    }

    if (def.render === 'door') {
      // a half without its partner falls apart
      const upper = (this.getState(x, y, z) & 1) !== 0;
      const other = this.getBlock(x, upper ? y - 1 : y + 1, z);
      if (other !== id) this.setBlock(x, y, z, AIR);
    }
    if (def.name === 'bed') {
      const s = this.getState(x, y, z);
      const head = (s & 1) !== 0;
      const facing = (s >> 1) & 3;
      const d = DIR_VEC[facing];
      const ox = head ? x - d[0] : x + d[0];
      const oz = head ? z - d[2] : z + d[2];
      if (this.getBlock(ox, y, oz) !== id) this.setBlock(x, y, z, AIR);
    }
  }

  supportOK(x, y, z, def, state) {
    const belowId = this.getBlock(x, y - 1, z);
    const below = BLOCKS[belowId];
    switch (def.supportNeeded) {
      case 'ground':
        if (def.name.endsWith('_sapling') || def.render === 'cross' || def.render === 'tall_cross') {
          if ((state & 1) && def.render === 'tall_cross') return this.getBlock(x, y - 1, z) === def.id;
          return belowId === blockId('grass_block') || belowId === blockId('dirt') ||
            belowId === blockId('coarse_dirt') || belowId === blockId('podzol') ||
            belowId === blockId('farmland') || belowId === blockId('mycelium') ||
            (def.name === 'dead_bush' && (belowId === blockId('sand') || belowId === blockId('red_sand')));
        }
        return isSolidCube(belowId);
      case 'farmland': return belowId === blockId('farmland');
      case 'sand': return belowId === blockId('sand') || belowId === blockId('red_sand') || belowId === def.id;
      case 'cane': {
        if (belowId === def.id) return true;
        if (belowId !== blockId('grass_block') && belowId !== blockId('dirt') &&
          belowId !== blockId('sand') && belowId !== blockId('red_sand') && belowId !== blockId('podzol')) return false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.getBlock(x + dx, y - 1, z + dz);
          if (n === WATER || BLOCKS[n].name === 'farmland') return true;
        }
        return false;
      }
      case 'torch': {
        const s = state & 7;
        if (s === 0) return isSolidCube(belowId) || BLOCKS[belowId].render === 'fence';
        const d = TORCH_DIR[s];
        return isSolidCube(this.getBlock(x + d[0], y, z + d[2]));
      }
      case 'wall': {
        const d = DIR_VEC[state & 3];
        return isSolidCube(this.getBlock(x - d[0], y, z - d[2]));
      }
      default: return true;
    }
  }

  // --------------------------------------------------------- chunk loading
  update(px, pz, dt) {
    this._requestChunks(px, pz);
    this._pumpGen();
    this._pumpMesh(px, pz);
    this._unloadFar(px, pz);
    this.light.update(CONFIG.lightOpsPerFrame);
    this.processUpdates(2048);
  }

  _requestChunks(px, pz) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const r = CONFIG.renderDistance;
    if (this._lastReqCX === pcx && this._lastReqCZ === pcz && this.requestQueue.length > 0) return;
    this._lastReqCX = pcx; this._lastReqCZ = pcz;

    const q = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r + r) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (Math.abs(cx << 4) > WORLD.BORDER || Math.abs(cz << 4) > WORLD.BORDER) continue;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key) || this.genInFlight.has(key)) continue;
        q.push({ cx, cz, key, d2 });
      }
    }
    q.sort((a, b) => a.d2 - b.d2);
    this.requestQueue = q;
    this.stats.queued = q.length;
  }

  _pumpGen() {
    for (let i = 0; i < this.genWorkers.length; i++) {
      if (this.genBusy[i]) continue;
      const job = this.requestQueue.shift();
      if (!job) break;
      if (this.chunks.has(job.key)) { i--; continue; }
      this.genBusy[i] = true;
      this.genInFlight.add(job.key);
      this.genWorkers[i].postMessage({ type: 'gen', cx: job.cx, cz: job.cz, key: job.key });
    }
  }

  _onGenMessage(i, msg) {
    if (msg.type === 'ready') return;
    this.genBusy[i] = false;
    if (msg.type === 'error') {
      console.error('[gen worker]', msg.error);
      this.genInFlight.delete(msg.key);
      return;
    }
    this.genInFlight.delete(msg.key);
    if (this.chunks.has(msg.key)) return;
    this._installChunk(msg);
    this._pumpGen();
  }

  _installChunk(msg) {
    const c = new Chunk(msg.cx, msg.cz);
    for (const s of msg.sections) {
      const sec = new Section(s.sy, s.fill !== undefined ? s.fill : AIR);
      if (s.blocks) {
        sec.blocks = s.blocks;
        sec.states = s.states;
        let nonAir = 0;
        for (let k = 0; k < 4096; k++) if (s.blocks[k] !== AIR) nonAir++;
        sec.nonAir = nonAir;
      }
      c.sections[s.sy] = sec;
    }
    c.heightmap.set(msg.heightmap);
    c.biome.set(msg.biomeMap);
    for (let i = 0; i < 256; i++) c.surface[i] = msg.heightmap[i];
    // heightmap from the generator is the top solid block; recompute the
    // light-blocking surface, which differs where leaves or water sit on top
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.recomputeHeight(x, z, this.light.opacity);

    for (const be of msg.blockEntities) {
      c.setBlockEntity(be.x & 15, be.y, be.z & 15, be);
    }
    c.generated = true;
    c.dirtySave = false;
    this._computeTints(c);
    this.chunks.set(c.key, c);
    this._lastKey = -1;

    if (this.onChunkReady) this.onChunkReady(c);

    this.light.initChunkSky(c);
    for (let sy = 0; sy < SECTIONS; sy++) {
      const s = c.sections[sy];
      if (s && !s.empty) this.dirtySections.add(c.key * 32 + sy);
    }
    // neighbours need remeshing so their border faces cull correctly
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n) continue;
      for (let sy = 0; sy < SECTIONS; sy++) {
        const s = n.sections[sy];
        if (s && !s.empty) this.dirtySections.add(n.key * 32 + sy);
      }
    }
    this.stats.generated++;
    if (msg.ms) this.stats.genMs = this.stats.genMs * 0.9 + msg.ms * 0.1;
  }

  _computeTints(c) {
    c.grassTint = new Uint32Array(256);
    c.foliageTint = new Uint32Array(256);
    c.waterTint = new Uint32Array(256);
    const ox = c.cx << 4, oz = c.cz << 4;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0, n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bx = ox + x + dx * 4, bz = oz + z + dz * 4;
            let bid;
            if (bx >> 4 === c.cx && bz >> 4 === c.cz) bid = c.biome[(bz & 15) * 16 + (bx & 15)];
            else {
              const nc = this.getChunk(bx >> 4, bz >> 4);
              bid = nc && nc.generated ? nc.biome[(bz & 15) * 16 + (bx & 15)] : c.biome[z * 16 + x];
            }
            const b = BIOMES[bid];
            gr += (b.grassTint >> 16) & 255; gg += (b.grassTint >> 8) & 255; gb += b.grassTint & 255;
            fr += (b.foliageTint >> 16) & 255; fg += (b.foliageTint >> 8) & 255; fb += b.foliageTint & 255;
            wr += (b.waterTint >> 16) & 255; wg += (b.waterTint >> 8) & 255; wb += b.waterTint & 255;
            n++;
          }
        }
        const i = z * 16 + x;
        c.grassTint[i] = (((gr / n) | 0) << 16) | (((gg / n) | 0) << 8) | ((gb / n) | 0);
        c.foliageTint[i] = (((fr / n) | 0) << 16) | (((fg / n) | 0) << 8) | ((fb / n) | 0);
        c.waterTint[i] = (((wr / n) | 0) << 16) | (((wg / n) | 0) << 8) | ((wb / n) | 0);
      }
    }
  }

  // -------------------------------------------------------------- meshing
  _getScratch() {
    const s = this.scratchPool.pop();
    if (s) return s;
    return {
      blocks: new Uint16Array(PADVOL),
      states: new Uint8Array(PADVOL),
      sky: new Uint8Array(PADVOL),
      light: new Uint8Array(PADVOL),
      grassTint: new Uint32Array(PAD * PAD),
      foliageTint: new Uint32Array(PAD * PAD),
      waterTint: new Uint32Array(PAD * PAD),
    };
  }

  _buildSnapshot(c, sy) {
    const s = this._getScratch();
    const { blocks, states, sky, light } = s;
    const sec = c.sections[sy];
    const baseY = MIN_Y + sy * 16;

    // interior: straight from the section, no chunk lookups
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        const rowP = ((y + 1) * PAD + (z + 1)) * PAD + 1;
        const rowL = (y << 8) | (z << 4);
        for (let x = 0; x < 16; x++) {
          const p = rowP + x, li = rowL + x;
          if (sec) {
            blocks[p] = sec.get(li);
            states[p] = sec.getState(li);
            sky[p] = sec.getSky(li);
            light[p] = sec.getLight(li);
          } else { blocks[p] = AIR; states[p] = 0; sky[p] = 15; light[p] = 0; }
        }
      }
    }
    // shell: the 1-block border, which does need world lookups
    const ox = c.cx << 4, oz = c.cz << 4;
    for (let y = -1; y <= 16; y++) {
      for (let z = -1; z <= 16; z++) {
        for (let x = -1; x <= 16; x++) {
          if (x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16) continue;
          const p = pidx(x, y, z);
          const wx = ox + x, wy = baseY + y, wz = oz + z;
          blocks[p] = this.getBlock(wx, wy, wz);
          states[p] = this.getState(wx, wy, wz);
          sky[p] = this.getSkyLight(wx, wy, wz);
          light[p] = this.getBlockLight(wx, wy, wz);
        }
      }
    }
    // per-column biome tints (already blurred at chunk load)
    for (let z = -1; z <= 16; z++) {
      for (let x = -1; x <= 16; x++) {
        const t = tpidx(x, z);
        let src = c, ix = x, iz = z;
        if (x < 0 || x > 15 || z < 0 || z > 15) {
          const nc = this.getChunk((ox + x) >> 4, (oz + z) >> 4);
          if (nc && nc.grassTint) { src = nc; ix = (ox + x) & 15; iz = (oz + z) & 15; }
          else { ix = Math.min(15, Math.max(0, x)); iz = Math.min(15, Math.max(0, z)); }
        }
        const i = iz * 16 + ix;
        s.grassTint[t] = src.grassTint ? src.grassTint[i] : 0x79c05a;
        s.foliageTint[t] = src.foliageTint ? src.foliageTint[i] : 0x59ae30;
        s.waterTint[t] = src.waterTint ? src.waterTint[i] : 0x3f76e4;
      }
    }
    return s;
  }

  _pumpMesh(px, pz) {
    if (!this.meshTables || this.dirtySections.size === 0) return;
    const free = [];
    for (let i = 0; i < this.meshWorkers.length; i++) if (!this.meshBusy[i]) free.push(i);
    if (free.length === 0) return;

    // nearest-first: pull a bounded sample, sort it, dispatch the closest
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const candidates = [];
    let scanned = 0;
    for (const skey of this.dirtySections) {
      const sy = skey % 32;
      const ckey = (skey - sy) / 32;
      const c = this.chunks.get(ckey);
      if (!c || !c.generated) { this.dirtySections.delete(skey); continue; }
      const d = (c.cx - pcx) * (c.cx - pcx) + (c.cz - pcz) * (c.cz - pcz);
      candidates.push({ skey, c, sy, d });
      if (++scanned > 256) break;
    }
    candidates.sort((a, b) => a.d - b.d);

    for (const f of free) {
      const job = candidates.shift();
      if (!job) break;
      const { c, sy, skey } = job;
      this.dirtySections.delete(skey);
      const sec = c.sections[sy];
      if (!sec) continue;
      // an empty section still needs a mesh clear if it had one
      if (sec.empty && !sec.meshHandle) { sec.dirty = false; continue; }

      const snap = this._buildSnapshot(c, sy);
      sec.dirty = false;
      sec.meshPending = (sec.meshPending + 1) & 0xffff;
      this.meshBusy[f] = true;
      const payload = {
        type: 'mesh', key: c.key, sy, gen: sec.meshPending,
        blocks: snap.blocks, states: snap.states, sky: snap.sky, light: snap.light,
        grassTint: snap.grassTint, foliageTint: snap.foliageTint, waterTint: snap.waterTint,
        smooth: CONFIG.smoothLighting,
      };
      this.meshWorkers[f].postMessage(payload, [
        snap.blocks.buffer, snap.states.buffer, snap.sky.buffer, snap.light.buffer,
        snap.grassTint.buffer, snap.foliageTint.buffer, snap.waterTint.buffer,
      ]);
    }
  }

  _onMeshMessage(i, msg) {
    if (msg.type === 'ready') return;
    this.meshBusy[i] = false;
    if (msg.type === 'error') { console.error('[mesh worker]', msg.error); return; }
    if (msg.scratch) this.scratchPool.push(msg.scratch);

    const c = this.chunks.get(msg.key);
    if (!c) return;
    const sec = c.sections[msg.sy];
    if (!sec || sec.meshPending !== msg.gen) return;   // stale result

    const r = this.renderer;
    if (!r) return;
    if (sec.meshHandle) r.freeMesh(sec.meshHandle);
    const handle = { opaque: null, translucent: null };
    if (msg.opaque) handle.opaque = r.createMesh(msg.opaque);
    if (msg.translucent) handle.translucent = r.createMesh(msg.translucent);
    sec.meshHandle = (handle.opaque || handle.translucent) ? handle : null;
    this.stats.meshed++;
    if (msg.ms) this.stats.meshMs = this.stats.meshMs * 0.9 + msg.ms * 0.1;
    if (this._lastReqCX !== undefined) this._pumpMesh(this._lastReqCX * 16, this._lastReqCZ * 16);
  }

  _unloadFar(px, pz) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const limit = CONFIG.renderDistance + CONFIG.unloadPadding;
    const lim2 = limit * limit;
    if (this.chunks.size <= 16) return;
    let removed = 0;
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz <= lim2) continue;
      if (this.onChunkUnload) this.onChunkUnload(c);
      if (this.renderer) c.disposeGPU(this.renderer);
      this.chunks.delete(key);
      removed++;
      if (removed > 12) break;
    }
    if (removed) this._lastKey = -1;
  }

  /** Sections to draw this frame, split by pass and frustum-culled. */
  collectVisible(camPos) {
    const r = this.renderer;
    const opaque = [], translucent = [];
    const rd = CONFIG.renderDistance;
    const pcx = Math.floor(camPos[0]) >> 4, pcz = Math.floor(camPos[2]) >> 4;
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (rd + 1) * (rd + 1)) continue;
      const ox = c.cx << 4, oz = c.cz << 4;
      for (let sy = 0; sy < SECTIONS; sy++) {
        const s = c.sections[sy];
        if (!s || !s.meshHandle) continue;
        const oy = MIN_Y + sy * 16;
        if (!r.visible(ox, oy, oz)) continue;
        const cxm = ox + 8 - camPos[0], cym = oy + 8 - camPos[1], czm = oz + 8 - camPos[2];
        const dist = cxm * cxm + cym * cym + czm * czm;
        if (s.meshHandle.opaque) opaque.push({ mesh: s.meshHandle.opaque, ox, oy, oz, dist });
        if (s.meshHandle.translucent) translucent.push({ mesh: s.meshHandle.translucent, ox, oy, oz, dist });
      }
    }
    opaque.sort((a, b) => a.dist - b.dist);
    translucent.sort((a, b) => b.dist - a.dist);
    return { opaque, translucent };
  }

  // ------------------------------------------------------------- utilities
  spawnFallingBlock(x, y, z, id, state) {
    if (this.onFallingBlock) this.onFallingBlock(x, y, z, id, state);
  }
  breakNaturally(x, y, z, tool) {
    if (this.onBreakNaturally) this.onBreakNaturally(x, y, z, tool);
    else this.setBlock(x, y, z, AIR);
  }

  scheduleFluidAround(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      const id = this.getBlock(x + dx, y + dy, z + dz);
      if (BLOCKS[id].liquid) this.scheduleFluid(x + dx, y + dy, z + dz, BLOCKS[id].liquid === 'lava' ? 6 : 3);
    }
  }

  scheduleFluid(x, y, z, delay) {
    const key = packPos(x, y, z);
    const due = this.time + delay;
    const cur = this.pendingFluid.get(key);
    if (cur !== undefined && cur <= due) return;
    this.pendingFluid.set(key, due);
    this.fluidQueue.push({ key, x, y, z, due });
  }
}

function smoothstep01(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

export const DIR_VEC = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];  // N, E, S, W
export const TORCH_DIR = [[0, 0, 0], [0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];

/**
 * Key for the fluid/scheduled-tick maps. A numeric composite of three
 * world-border-sized coordinates would need 61 bits, past the 53 a double can
 * hold exactly, so this uses a string. These maps hold hundreds of entries at
 * most (only actively flowing fluid), so the hashing cost is irrelevant.
 */
export function packPos(x, y, z) {
  return x + ',' + y + ',' + z;
}
