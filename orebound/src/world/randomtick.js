// Random ticks: the slow, ambient world simulation.
//
// Every tick a configurable number of random blocks per loaded section inside
// the SIMULATION distance get a chance to act. This drives crop growth, sapling
// -> tree, cane/cactus growth, grass and mycelium spread, leaf decay, farmland
// hydration and drying, fire spread, and snow/ice accumulation in weather.

import { WORLD, CONFIG } from '../core/config.js';
import { BLOCKS, blockId, AIR } from '../core/blocks.js';
import { Random } from '../core/rng.js';
import { BIOMES } from './biomes.js';

const { MIN_Y, SECTIONS } = WORLD;

const B = {
  air: AIR,
  grass_block: blockId('grass_block'),
  dirt: blockId('dirt'),
  coarse_dirt: blockId('coarse_dirt'),
  podzol: blockId('podzol'),
  mycelium: blockId('mycelium'),
  farmland: blockId('farmland'),
  water: blockId('water'),
  lava: blockId('lava'),
  fire: blockId('fire'),
  cactus: blockId('cactus'),
  sugar_cane: blockId('sugar_cane'),
  snow_layer: blockId('snow_layer'),
  ice: blockId('ice'),
  short_grass: blockId('short_grass'),
  melon: blockId('melon'),
  pumpkin: blockId('pumpkin'),
};

const CROP_IDS = new Set(['wheat', 'carrots', 'potatoes', 'melon_stem', 'pumpkin_stem'].map(blockId));
const SAPLING_IDS = new Map();
for (const b of BLOCKS) {
  if (b.name.endsWith('_sapling')) SAPLING_IDS.set(b.id, b.name.replace('_sapling', ''));
}
const LEAF_TO_LOG = new Map();
for (const b of BLOCKS) {
  if (b.leaves) LEAF_TO_LOG.set(b.id, blockId(b.name.replace('_leaves', '_log')));
}

export class RandomTicker {
  constructor(world) {
    this.world = world;
    this.rng = new Random(world.seed ^ 0x7f3a19);
  }

  tick(px, pz) {
    const w = this.world;
    const rng = this.rng;
    const sim = CONFIG.simulationDistance;
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const speed = CONFIG.randomTickSpeed;

    for (let dz = -sim; dz <= sim; dz++) {
      for (let dx = -sim; dx <= sim; dx++) {
        if (dx * dx + dz * dz > sim * sim) continue;
        const c = w.getChunk(pcx + dx, pcz + dz);
        if (!c || !c.generated) continue;
        const ox = c.cx << 4, oz = c.cz << 4;
        for (let sy = 0; sy < SECTIONS; sy++) {
          const s = c.sections[sy];
          if (!s || s.empty) continue;
          const baseY = MIN_Y + sy * 16;
          for (let k = 0; k < speed; k++) {
            const r = rng.next();
            const lx = r & 15, ly = (r >> 4) & 15, lz = (r >> 8) & 15;
            const id = s.get((ly << 8) | (lz << 4) | lx);
            if (id === AIR) continue;
            this.apply(ox + lx, baseY + ly, oz + lz, id, rng);
          }
        }
      }
    }
  }

  apply(x, y, z, id, rng) {
    const w = this.world;
    const def = BLOCKS[id];
    if (!def) return;

    if (CROP_IDS.has(id)) return this.growCrop(x, y, z, id, def, rng);
    if (SAPLING_IDS.has(id)) { if (rng.chance(0.06)) this.growSapling(x, y, z, id, rng); return; }
    if (def.leaves) return this.decayLeaves(x, y, z, id, rng);

    switch (id) {
      case B.grass_block: return this.spreadGrass(x, y, z, B.grass_block, rng);
      case B.mycelium: return this.spreadGrass(x, y, z, B.mycelium, rng);
      case B.dirt: return this.dirtToGrass(x, y, z, rng);
      case B.farmland: return this.updateFarmland(x, y, z, rng);
      case B.sugar_cane: return this.growVertical(x, y, z, id, 3, rng);
      case B.cactus: return this.growVertical(x, y, z, id, 3, rng);
      case B.fire: return this.tickFire(x, y, z, rng);
      case B.water: return this.freezeCheck(x, y, z, rng);
      case B.ice: return this.meltCheck(x, y, z, rng);
      default: return;
    }
  }

  // ------------------------------------------------------------------ crops
  growCrop(x, y, z, id, def, rng) {
    const w = this.world;
    const state = w.getState(x, y, z);
    const age = state & 7;
    if (age >= 7) {
      if (def.stemFruit) this.growStemFruit(x, y, z, def, rng);
      return;
    }
    const lightOK = w.lightLevel(x, y + 1, z) >= 9;
    if (!lightOK) return;
    const below = w.getBlock(x, y - 1, z);
    if (below !== B.farmland) return;
    const moist = (w.getState(x, y - 1, z) & 7) > 0;
    const chance = moist ? 0.35 : 0.14;
    if (rng.chance(chance)) w.setState(x, y, z, (state & ~7) | (age + 1));
  }

  growStemFruit(x, y, z, def, rng) {
    const w = this.world;
    if (!rng.chance(0.14)) return;
    const fruit = blockId(def.stemFruit);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    rng.shuffle(dirs);
    for (const [dx, dz] of dirs) {
      if (w.getBlock(x + dx, y, z + dz) === fruit) return;   // already fruited
    }
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (w.getBlock(nx, y, nz) !== AIR) continue;
      const ground = w.getBlock(nx, y - 1, nz);
      if (ground !== B.dirt && ground !== B.grass_block && ground !== B.farmland && ground !== B.coarse_dirt) continue;
      w.setBlock(nx, y, nz, fruit, 0);
      return;
    }
  }

  // --------------------------------------------------------------- saplings
  growSapling(x, y, z, id, rng) {
    const w = this.world;
    if (w.lightLevel(x, y, z) < 8) return;
    const wood = SAPLING_IDS.get(id);
    growTree(w, x, y, z, wood, rng);
  }

  // ----------------------------------------------------------------- leaves
  decayLeaves(x, y, z, id, rng) {
    const w = this.world;
    const state = w.getState(x, y, z);
    if (state & 0x80) return;      // player-placed leaves never decay
    const log = LEAF_TO_LOG.get(id);
    if (log === undefined) return;
    if (this.findLogNear(x, y, z, log, id)) return;
    w.breakNaturally(x, y, z, null);
  }

  /** Bounded search for a supporting trunk within 5 blocks (Chebyshev). */
  findLogNear(x, y, z, log, leafId) {
    const w = this.world;
    const R = 5;
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > R + 1) continue;
          if (w.getBlock(x + dx, y + dy, z + dz) === log) return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ grass
  spreadGrass(x, y, z, id, rng) {
    const w = this.world;
    if (w.lightLevel(x, y + 1, z) < 4) {
      // buried grass reverts to dirt
      const above = w.getBlock(x, y + 1, z);
      if (BLOCKS[above].opacity >= 15) w.setBlock(x, y, z, B.dirt);
      return;
    }
    for (let n = 0; n < 4; n++) {
      const nx = x + rng.int(3) - 1, ny = y + rng.int(3) - 1, nz = z + rng.int(3) - 1;
      if (w.getBlock(nx, ny, nz) !== B.dirt) continue;
      if (BLOCKS[w.getBlock(nx, ny + 1, nz)].opacity >= 15) continue;
      if (w.lightLevel(nx, ny + 1, nz) < 4) continue;
      w.setBlock(nx, ny, nz, id);
      return;
    }
  }

  dirtToGrass(x, y, z, rng) {
    const w = this.world;
    const above = w.getBlock(x, y + 1, z);
    if (BLOCKS[above].opacity >= 15) return;
    if (w.lightLevel(x, y + 1, z) < 9) return;
    for (let n = 0; n < 2; n++) {
      const nx = x + rng.int(3) - 1, ny = y + rng.int(3) - 1, nz = z + rng.int(3) - 1;
      if (w.getBlock(nx, ny, nz) === B.grass_block) { w.setBlock(x, y, z, B.grass_block); return; }
    }
  }

  // --------------------------------------------------------------- farmland
  updateFarmland(x, y, z, rng) {
    const w = this.world;
    const state = w.getState(x, y, z);
    const moisture = state & 7;
    let hydrated = w.isRaining() && w.getSkyLight(x, y + 1, z) > 0;
    if (!hydrated) {
      outer:
      for (let dy = 0; dy <= 1 && !hydrated; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (w.getBlock(x + dx, y + dy, z + dz) === B.water) { hydrated = true; break outer; }
          }
        }
      }
    }
    if (hydrated) {
      if (moisture < 7) w.setState(x, y, z, (state & ~7) | 7);
      return;
    }
    if (moisture > 0) { w.setState(x, y, z, (state & ~7) | (moisture - 1)); return; }
    // fully dry with nothing planted on top: revert to dirt
    const above = w.getBlock(x, y + 1, z);
    if (BLOCKS[above].supportNeeded === 'farmland') return;
    w.setBlock(x, y, z, B.dirt);
  }

  // ------------------------------------------------------- vertical growers
  growVertical(x, y, z, id, maxHeight, rng) {
    const w = this.world;
    let below = 0;
    while (below < maxHeight && w.getBlock(x, y - 1 - below, z) === id) below++;
    if (below + 1 >= maxHeight) return;
    if (w.getBlock(x, y + 1, z) !== AIR) return;
    const state = w.getState(x, y, z);
    const age = (state >> 3) & 15;
    if (age < 15) { w.setState(x, y, z, (state & 7) | ((age + 1) << 3)); return; }
    w.setState(x, y, z, state & 7);
    if (id === B.cactus) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = w.getBlock(x + dx, y + 1, z + dz);
        if (n !== AIR && !BLOCKS[n].replaceable) return;
      }
    }
    w.setBlock(x, y + 1, z, id, 0);
  }

  // ------------------------------------------------------------------- fire
  tickFire(x, y, z, rng) {
    const w = this.world;
    const state = w.getState(x, y, z);
    const age = state & 15;
    if (w.isRaining() && w.getSkyLight(x, y, z) > 0 && rng.chance(0.6)) {
      w.setBlock(x, y, z, AIR);
      return;
    }
    const below = w.getBlock(x, y - 1, z);
    const supported = BLOCKS[below].flammable > 0 || BLOCKS[below].opacity >= 15;
    if (!supported && !this.anyFlammableNeighbour(x, y, z)) { w.setBlock(x, y, z, AIR); return; }
    if (age < 15) w.setState(x, y, z, age + 1);
    else if (rng.chance(0.35)) { w.setBlock(x, y, z, AIR); return; }

    // spread
    for (let n = 0; n < 3; n++) {
      const nx = x + rng.int(3) - 1, ny = y + rng.int(3) - 1, nz = z + rng.int(3) - 1;
      if (nx === x && ny === y && nz === z) continue;
      const target = w.getBlock(nx, ny, nz);
      if (target !== AIR) {
        const f = BLOCKS[target].flammable;
        if (f > 0 && rng.chance(f / 300)) w.setBlock(nx, ny, nz, B.fire, 0);
        continue;
      }
      if (!this.anyFlammableNeighbour(nx, ny, nz)) continue;
      if (rng.chance(0.20)) w.setBlock(nx, ny, nz, B.fire, 0);
    }
  }

  anyFlammableNeighbour(x, y, z) {
    const w = this.world;
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      if (BLOCKS[w.getBlock(x + dx, y + dy, z + dz)].flammable > 0) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- weather
  freezeCheck(x, y, z, rng) {
    const w = this.world;
    const biome = w.biomeAt(x, z);
    if (!biome.snow) return;
    if (w.getSkyLight(x, y, z) < 10) return;
    if (w.getState(x, y, z) !== 0) return;      // only sources freeze
    if (w.getBlock(x, y + 1, z) !== AIR) return;
    if (rng.chance(0.25)) w.setBlock(x, y, z, B.ice);
  }

  meltCheck(x, y, z, rng) {
    const w = this.world;
    const biome = w.biomeAt(x, z);
    if (biome.snow) return;
    if (w.lightLevel(x, y + 1, z) < 12) return;
    if (rng.chance(0.2)) w.setBlock(x, y, z, B.water, 0);
  }

  /** Accumulate snow layers during snowfall (called from the weather tick). */
  snowfall(px, pz, rng) {
    const w = this.world;
    const sim = CONFIG.simulationDistance;
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    for (let n = 0; n < 6; n++) {
      const cx = pcx + rng.int(sim * 2 + 1) - sim;
      const cz = pcz + rng.int(sim * 2 + 1) - sim;
      const c = w.getChunk(cx, cz);
      if (!c) continue;
      const x = (cx << 4) + rng.int(16), z = (cz << 4) + rng.int(16);
      if (!w.biomeAt(x, z).snow) continue;
      const y = w.topSolid(x, z) + 1;
      if (w.getBlock(x, y, z) !== AIR) continue;
      const below = w.getBlock(x, y - 1, z);
      if (below === AIR || BLOCKS[below].liquid) continue;
      if (w.getSkyLight(x, y, z) < 10) continue;
      w.setBlock(x, y, z, B.snow_layer, 0);
    }
  }
}

/**
 * Grow a full tree at a sapling position. Reuses the world generator's tree
 * shapes so a farmed tree looks exactly like a wild one.
 */
export function growTree(world, x, y, z, wood, rng) {
  const gen = world.gen;
  // check headroom first so we never grow into a ceiling
  for (let k = 0; k < 6; k++) {
    const id = world.getBlock(x, y + k, z);
    if (k > 0 && id !== AIR && !BLOCKS[id].replaceable && !BLOCKS[id].leaves) return false;
  }
  const writes = [];
  const put = (wx, wy, wz, id, state = 0) => writes.push([wx, wy, wz, id, state, false]);
  const putSoft = (wx, wy, wz, id, state = 0) => writes.push([wx, wy, wz, id, state, true]);
  const peek = (wx, wy, wz) => world.getBlock(wx, wy, wz);

  const type = wood === 'oak' && world.biomeAt(x, z).name === 'swamp' ? 'swamp_oak' : wood;
  gen._tree(type, x, y, z, rng, put, putSoft, peek, x - 8, z - 8);
  if (writes.length === 0) return false;

  for (const [wx, wy, wz, id, state, soft] of writes) {
    const cur = world.getBlock(wx, wy, wz);
    if (soft && cur !== AIR && !BLOCKS[cur].replaceable) continue;
    if (!soft && cur !== AIR && !BLOCKS[cur].replaceable && !BLOCKS[cur].leaves &&
      !(SAPLING_IDS.has(cur))) continue;
    world.setBlock(wx, wy, wz, id, state);
  }
  return true;
}
