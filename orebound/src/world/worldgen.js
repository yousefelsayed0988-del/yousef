// Deterministic world generation. Pure module: it runs identically on the main
// thread and inside a generation worker, and depends only on the seed.
//
// Pipeline per chunk column:
//   1. terrain    -- 2D climate + height fields, stone/deepslate/water/bedrock
//   2. surface    -- biome topsoil, sand/gravel beaches, ocean floors
//   3. caves      -- 3D spaghetti + cheese noise, ravines, deep lava
//   4. ores       -- per-ore blob passes with depth bands
//   5. features   -- trees, foliage, cane, cactus, snow (3x3 chunk neighbourhood
//                    so trees straddle chunk borders without ordering hazards)
//   6. structures -- dungeons, mineshafts, ruins, buried treasure + loot chests

import { WORLD } from '../core/config.js';
import { Noise, spline, clamp, smoothstep } from '../core/noise.js';
import { Random, chunkRandom, subSeed, hash2i, hash3i } from '../core/rng.js';
import { blockId, ORE_NAMES } from '../core/blocks.js';
import { BIOMES, landBiome, OCEAN, BEACH, SNOWY_BEACH, MOUNTAINS, STONY_PEAKS } from './biomes.js';
import { generateStructures } from './structures.js';

const { MIN_Y, MAX_Y, SEA_LEVEL, SECTIONS } = WORLD;
const COLUMN = MAX_Y - MIN_Y;      // 384
const FLAT = 256 * COLUMN;

const B = {
  air: blockId('air'),
  stone: blockId('stone'),
  deepslate: blockId('deepslate'),
  bedrock: blockId('bedrock'),
  water: blockId('water'),
  lava: blockId('lava'),
  dirt: blockId('dirt'),
  gravel: blockId('gravel'),
  sand: blockId('sand'),
  clay: blockId('clay'),
  snow_layer: blockId('snow_layer'),
  ice: blockId('ice'),
  sandstone: blockId('sandstone'),
  cactus: blockId('cactus'),
  sugar_cane: blockId('sugar_cane'),
  dead_bush: blockId('dead_bush'),
  short_grass: blockId('short_grass'),
  fern: blockId('fern'),
  tall_grass: blockId('tall_grass'),
  brown_mushroom: blockId('brown_mushroom'),
  red_mushroom: blockId('red_mushroom'),
  pumpkin: blockId('pumpkin'),
  melon: blockId('melon'),
  podzol: blockId('podzol'),
};
const FLOWER_IDS = ['dandelion', 'poppy', 'cornflower', 'allium', 'azure_bluet', 'oxeye_daisy', 'orange_tulip', 'pink_petals'].map(blockId);
const WOOD_IDS = {};
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) {
  WOOD_IDS[w] = { log: blockId(`${w}_log`), leaves: blockId(`${w}_leaves`) };
}
const ORE_IDS = {};
for (const o of ORE_NAMES) ORE_IDS[o] = { normal: blockId(`${o}_ore`), deep: blockId(`deepslate_${o}_ore`) };

// depth bands: [count per chunk, blob size, minY, maxY, deepOnly?]
const ORE_BANDS = {
  coal:     [20, 16,   5, 190],
  copper:   [14,  9, -16,  96],
  iron:     [11,  8, -32,  64],
  lapis:    [ 2,  6, -60,  40],
  gold:     [ 3,  7, -64,  32],
  redstone: [ 5,  7, -64,  16],
  diamond:  [ 1,  5, -64,  14],
  emerald:  [ 3,  3, -16, 200],   // mountain biomes only, filtered below
};

const HEIGHT_SPLINE = [
  [-1.00, 20], [-0.62, 34], [-0.36, 52], [-0.20, 60], [-0.08, 64],
  [0.06, 70], [0.28, 80], [0.52, 96], [0.78, 122], [1.00, 152],
];
const EROSION_SPLINE = [[-1, 1.45], [-0.4, 1.05], [0.1, 0.62], [0.5, 0.34], [1, 0.18]];

export class WorldGen {
  constructor(seed) {
    this.seed = seed | 0;
    const s = l => subSeed(this.seed, l);
    this.nCont = new Noise(s('continent'));
    this.nEros = new Noise(s('erosion'));
    this.nPeak = new Noise(s('peaks'));
    this.nDetail = new Noise(s('detail'));
    this.nTemp = new Noise(s('temperature'));
    this.nHumid = new Noise(s('humidity'));
    this.nWeird = new Noise(s('weird'));
    this.nCave1 = new Noise(s('cave1'));
    this.nCave2 = new Noise(s('cave2'));
    this.nCheese = new Noise(s('cheese'));
    this.nRavine = new Noise(s('ravine'));
    this.nSurface = new Noise(s('surface'));
    this._hCache = new Map();
    this._bCache = new Map();
  }

  // ------------------------------------------------------------- climate
  temperature(x, z) {
    const n = this.nTemp.fbm2(x * 0.0011, z * 0.0011, 3);
    return clamp(n * 0.62 + 0.5, 0, 1);
  }
  humidity(x, z) {
    const n = this.nHumid.fbm2(x * 0.0013 + 400, z * 0.0013 - 400, 3);
    return clamp(n * 0.62 + 0.5, 0, 1);
  }
  weirdness(x, z) {
    return clamp(this.nWeird.fbm2(x * 0.004, z * 0.004, 2) * 0.5 + 0.5, 0, 1);
  }

  /** Raw (pre-biome) terrain height. */
  rawHeight(x, z) {
    const cont = this.nCont.fbm2(x * 0.00072, z * 0.00072, 4);
    const base = spline(HEIGHT_SPLINE, cont);
    const ero = spline(EROSION_SPLINE, this.nEros.fbm2(x * 0.0016 + 1000, z * 0.0016, 3));
    const detail = this.nDetail.fbm2(x * 0.011, z * 0.011, 4);
    let h = base + detail * 11 * ero;
    // mountain relief only where the continent is already high
    const alpine = smoothstep(72, 104, base);
    if (alpine > 0) {
      const pv = this.nPeak.ridged2(x * 0.0032, z * 0.0032, 4);
      h += alpine * (pv * 74 - 20) * clamp(ero * 1.4, 0.3, 1.6);
    }
    return h;
  }

  /** Biome id at a column, derived from raw height + climate. */
  biomeAt(x, z) {
    const k = hash2i(x, z, 0x51ed) ;
    const cached = this._bCache.get(k);
    if (cached !== undefined && cached[0] === x && cached[1] === z) return cached[2];
    const h0 = this.rawHeight(x, z);
    const id = this._biomeFrom(x, z, h0);
    if (this._bCache.size > 8192) this._bCache.clear();
    this._bCache.set(k, [x, z, id]);
    return id;
  }

  _biomeFrom(x, z, h0) {
    const t = this.temperature(x, z);
    if (h0 < SEA_LEVEL - 5) return OCEAN;
    if (h0 <= SEA_LEVEL + 0.75) return t < 0.18 ? SNOWY_BEACH : BEACH;
    if (h0 > 126) return STONY_PEAKS;
    if (h0 > 100) return MOUNTAINS;
    return landBiome(t, this.humidity(x, z), this.weirdness(x, z));
  }

  /** Final terrain height (integer top solid block y) after biome shaping. */
  heightAt(x, z) {
    const k = x * 8388593 + z;
    const c = this._hCache.get(k);
    if (c !== undefined) return c;
    const h0 = this.rawHeight(x, z);
    const bid = this._biomeFrom(x, z, h0);
    const b = BIOMES[bid];
    let h = SEA_LEVEL + (h0 - SEA_LEVEL) * b.heightScale + b.heightOffset;
    h = Math.floor(h);
    if (this._hCache.size > 65536) this._hCache.clear();
    this._hCache.set(k, h);
    return h;
  }

  // --------------------------------------------------------------- caves
  isCave(x, y, z, surfaceY) {
    if (y >= surfaceY - 1) return false;
    if (y <= MIN_Y + 4) return false;
    // Spaghetti tunnels: the intersection of two thin noise shells. Tunnels
    // widen with depth so the deep world is more open than the shallows.
    const a = this.nCave1.noise3(x * 0.0163, y * 0.0290, z * 0.0163);
    const b = this.nCave2.noise3(x * 0.0163 + 31.7, y * 0.0290 - 12.3, z * 0.0163 + 8.1);
    const width = 0.115 + 0.05 * smoothstep(40, -50, y);
    if (Math.abs(a) < width && Math.abs(b) < width) return true;
    // A second, coarser tunnel set at a different scale stops the caves from
    // reading as one repeated motif and links the fine tunnels into a network.
    const a2 = this.nCave1.noise3(x * 0.0048 + 91.3, y * 0.0115, z * 0.0048 - 44.1);
    const b2 = this.nCave2.noise3(x * 0.0048 - 17.9, y * 0.0115 + 63.2, z * 0.0048 + 22.6);
    if (Math.abs(a2) < 0.095 && Math.abs(b2) < 0.095) return true;
    // Cheese caverns: large rooms, biased deep.
    if (y < 40) {
      const c = this.nCheese.fbm3(x * 0.0092, y * 0.0165, z * 0.0092, 3);
      if (c > 0.545 - 0.10 * smoothstep(30, -55, y)) return true;
    }
    return false;
  }

  ravineDepth(x, z) {
    const r = this.nRavine.ridged2(x * 0.0038 + 77, z * 0.0038 - 21, 3);
    if (r < 0.935) return 0;
    return (r - 0.935) / 0.065;   // 0..1 strength
  }

  // ------------------------------------------------------- chunk assembly
  generateChunk(cx, cz) {
    const ox = cx << 4, oz = cz << 4;
    const blocks = new Uint16Array(FLAT);
    const states = new Uint8Array(FLAT);
    const heightmap = new Int16Array(256);
    const biomeMap = new Uint8Array(256);
    const blockEntities = [];

    const idx = (lx, y, lz) => (y - MIN_Y) * 256 + (lz << 4) + lx;
    const put = (wx, wy, wz, id, state = 0) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < MIN_Y || wy >= MAX_Y) return;
      const i = idx(lx, wy, lz);
      blocks[i] = id; states[i] = state;
    };
    const putSoft = (wx, wy, wz, id, state = 0) => {   // only into air
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < MIN_Y || wy >= MAX_Y) return;
      const i = idx(lx, wy, lz);
      if (blocks[i] !== B.air) return;
      blocks[i] = id; states[i] = state;
    };
    const peek = (wx, wy, wz) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < MIN_Y || wy >= MAX_Y) return -1;
      return blocks[idx(lx, wy, lz)];
    };

    const bedrockRng = new Random(hash2i(cx, cz, subSeed(this.seed, 'bedrock')));

    // ---- 1/2/3: terrain, surface, caves, per column
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const h = this.heightAt(wx, wz);
        const bid = this.biomeAt(wx, wz);
        const b = BIOMES[bid];
        heightmap[lz * 16 + lx] = h;
        biomeMap[lz * 16 + lx] = bid;

        const surfNoise = this.nSurface.noise2(wx * 0.09, wz * 0.09);
        const depth = Math.max(1, (b.depth + Math.round(surfNoise * 1.5)) | 0);
        const underwater = h < SEA_LEVEL;
        const surfaceId = blockId(underwater ? b.underwater : b.surface);
        const subId = blockId(underwater ? b.underwater : b.subsurface);

        const ravine = this.ravineDepth(wx, wz);

        const colBase = idx(lx, MIN_Y, lz);
        for (let y = MIN_Y; y < MAX_Y; y++) {
          const i = colBase + (y - MIN_Y) * 256;
          let id = B.air;
          if (y === MIN_Y) id = B.bedrock;
          else if (y < MIN_Y + 5 && bedrockRng.float() < (MIN_Y + 5 - y) / 5) id = B.bedrock;
          else if (y <= h) {
            id = y < WORLD.DEEPSLATE_Y - (2 + ((hash2i(wx, wz, 7) % 5))) ? B.deepslate : B.stone;
            if (y === h) id = surfaceId;
            else if (y > h - depth) id = subId;
          } else if (y <= SEA_LEVEL) id = B.water;
          blocks[i] = id;
        }

        // carve caves top-down; open cave mouths are allowed, floors flooded
        // with lava below y=-50 as the spec requires.
        for (let y = MIN_Y + 1; y <= Math.max(h, SEA_LEVEL); y++) {
          const i = colBase + (y - MIN_Y) * 256;
          const cur = blocks[i];
          if (cur === B.bedrock || cur === B.air) continue;
          let carve = this.isCave(wx, y, wz, h);
          if (!carve && ravine > 0) {
            const top = h - 6, bottom = Math.max(MIN_Y + 6, h - 12 - Math.floor(ravine * 46));
            if (y < top && y > bottom) carve = true;
          }
          if (!carve) continue;
          if (y <= -50) blocks[i] = B.lava;
          else if (y <= SEA_LEVEL && h < SEA_LEVEL) blocks[i] = B.water;
          else blocks[i] = B.air;
        }

        // restore a surface layer where a cave clipped the very top of a column
        if (blocks[colBase + (h - MIN_Y) * 256] === B.air && h > SEA_LEVEL) {
          // leave the hole -- cave entrances are good, but stop dirt floating
        }
      }
    }

    // ---- 4: ores
    const oreRng = chunkRandom(this.seed, cx, cz, 'ores');
    for (const ore of ORE_NAMES) {
      const band = ORE_BANDS[ore];
      if (!band) continue;
      let [count, size, lo, hi] = band;
      if (ore === 'emerald') {
        const centreBiome = biomeMap[8 * 16 + 8];
        if (centreBiome !== MOUNTAINS && centreBiome !== STONY_PEAKS) continue;
      }
      const ids = ORE_IDS[ore];
      for (let n = 0; n < count; n++) {
        let x = ox + oreRng.int(16), z = oz + oreRng.int(16);
        let y = lo + oreRng.int(Math.max(1, hi - lo + 1));
        // triangular distribution so rare ores cluster at the deep end
        if (ore === 'diamond' || ore === 'redstone' || ore === 'gold') {
          y = Math.min(y, lo + oreRng.int(Math.max(1, hi - lo + 1)));
        }
        for (let k = 0; k < size; k++) {
          const cur = peek(x, y, z);
          if (cur === B.stone) put(x, y, z, ids.normal);
          else if (cur === B.deepslate) put(x, y, z, ids.deep);
          x += oreRng.int(3) - 1; y += oreRng.int(3) - 1; z += oreRng.int(3) - 1;
          if (y < MIN_Y + 1 || y >= MAX_Y) break;
        }
      }
    }

    // ---- 5: features from the 3x3 chunk neighbourhood
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this._features(cx + dx, cz + dz, put, putSoft, peek, ox, oz);
      }
    }

    // ---- 6: structures
    generateStructures(this, cx, cz, { put, putSoft, peek, blockEntities });

    // ---- surface dressing that must run last (snow/ice sit on top of features)
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const b = BIOMES[biomeMap[lz * 16 + lx]];
        if (!b.snow) continue;
        // find the topmost non-air block and cap it
        for (let y = Math.min(MAX_Y - 2, heightmap[lz * 16 + lx] + 8); y > SEA_LEVEL - 6; y--) {
          const i = idx(lx, y, lz);
          const id = blocks[i];
          if (id === B.air) continue;
          if (id === B.water) { blocks[i] = B.ice; break; }
          const above = idx(lx, y + 1, lz);
          if (blocks[above] === B.air) blocks[above] = B.snow_layer;
          break;
        }
      }
    }

    return this._pack(cx, cz, blocks, states, heightmap, biomeMap, blockEntities);
  }

  /** Vegetation for the chunk at (fcx,fcz), clipped into the chunk being built. */
  _features(fcx, fcz, put, putSoft, peek, ox, oz) {
    const fox = fcx << 4, foz = fcz << 4;
    const rng = chunkRandom(this.seed, fcx, fcz, 'features');
    const centreBiome = BIOMES[this.biomeAt(fox + 8, foz + 8)];

    // --- trees
    if (centreBiome.trees) {
      const density = centreBiome.trees.density;
      const attempts = density < 1 ? (rng.float() < density ? 1 : 0) : Math.round(density + rng.gauss() * 1.2);
      for (let i = 0; i < attempts; i++) {
        const tx = fox + rng.int(16), tz = foz + rng.int(16);
        const bid = this.biomeAt(tx, tz);
        const bb = BIOMES[bid];
        if (!bb.trees) continue;
        const ty = this.heightAt(tx, tz);
        if (ty < SEA_LEVEL || ty > 150) continue;
        this._tree(bb.trees.type, tx, ty + 1, tz, rng, put, putSoft, peek, ox, oz);
      }
    }

    // --- ground cover: only the chunk we are actually filling needs these
    if (fcx << 4 !== ox || fcz << 4 !== oz) return;
    for (let n = 0; n < 96; n++) {
      const x = fox + rng.int(16), z = foz + rng.int(16);
      const bid = this.biomeAt(x, z);
      const b = BIOMES[bid];
      const y = this.heightAt(x, z);
      if (y < SEA_LEVEL) continue;
      const ground = peek(x, y, z);
      const above = peek(x, y + 1, z);
      if (above !== B.air) continue;

      const r = rng.float();
      if (ground === blockId(b.surface) && r < b.grass) {
        const t = rng.float();
        if (t < 0.10 && b.name !== 'desert') {
          putSoft(x, y + 1, z, B.tall_grass, 0);
          putSoft(x, y + 2, z, B.tall_grass, 1);      // state bit 0 = upper half
        } else if (t < 0.28 && (b.name === 'taiga' || b.name === 'snowy_taiga' || b.name === 'jungle')) {
          putSoft(x, y + 1, z, B.fern);
        } else {
          putSoft(x, y + 1, z, B.short_grass);
        }
      } else if (r < b.grass + b.flowers) {
        putSoft(x, y + 1, z, FLOWER_IDS[rng.int(FLOWER_IDS.length)]);
      } else if (r < b.grass + b.flowers + b.deadBush) {
        putSoft(x, y + 1, z, B.dead_bush);
      } else if (r < b.grass + b.flowers + b.deadBush + b.mushrooms) {
        putSoft(x, y + 1, z, rng.chance(0.5) ? B.brown_mushroom : B.red_mushroom);
      } else if (r < b.grass + b.flowers + b.deadBush + b.mushrooms + b.pumpkins) {
        if (ground === blockId('grass_block')) putSoft(x, y + 1, z, B.pumpkin, rng.int(4));
      } else if (r < b.grass + b.flowers + b.deadBush + b.mushrooms + b.pumpkins + b.melons) {
        if (ground === blockId('grass_block')) putSoft(x, y + 1, z, B.melon);
      }

      // cactus needs sand and clear neighbours
      if (b.cactus > 0 && ground === B.sand && rng.float() < b.cactus) {
        const tall = 1 + rng.int(3);
        let clear = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nb = peek(x + dx, y + 1, z + dz);
          if (nb !== B.air && nb !== -1) { clear = false; break; }
        }
        if (clear) for (let k = 0; k < tall; k++) putSoft(x, y + 1 + k, z, B.cactus);
      }

      // sugar cane next to water
      if (b.sugarCane > 0 && rng.float() < b.sugarCane &&
          (ground === B.sand || ground === blockId('grass_block') || ground === B.dirt)) {
        let nearWater = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (peek(x + dx, y, z + dz) === B.water) { nearWater = true; break; }
        }
        if (nearWater) {
          const tall = 1 + rng.int(3);
          for (let k = 0; k < tall; k++) putSoft(x, y + 1 + k, z, B.sugar_cane, k === tall - 1 ? 0 : 0);
        }
      }
    }
  }

  // ---------------------------------------------------------------- trees
  _tree(type, x, y, z, rng, put, putSoft, peek, ox, oz) {
    // Only grow where the base is inside or adjacent to this chunk's footprint,
    // and never on top of water.
    const below = peek(x, y - 1, z);
    if (below !== -1 && below !== blockId('grass_block') && below !== B.dirt &&
        below !== B.podzol && below !== B.sand && below !== blockId('coarse_dirt')) return;

    switch (type) {
      case 'oak_birch': return this._tree(rng.chance(0.25) ? 'birch' : 'oak', x, y, z, rng, put, putSoft, peek, ox, oz);
      case 'oak': return this._roundTree('oak', x, y, z, 4 + rng.int(3), 2, rng, put, putSoft);
      case 'swamp_oak': return this._roundTree('oak', x, y, z, 5 + rng.int(2), 3, rng, put, putSoft);
      case 'birch': return this._roundTree('birch', x, y, z, 5 + rng.int(3), 2, rng, put, putSoft);
      case 'jungle': return this._jungleTree(x, y, z, rng, put, putSoft);
      case 'spruce': return this._spruceTree(x, y, z, rng, put, putSoft);
      case 'acacia': return this._acaciaTree(x, y, z, rng, put, putSoft);
      case 'dark_oak': return this._darkOakTree(x, y, z, rng, put, putSoft);
      case 'cherry': return this._cherryTree(x, y, z, rng, put, putSoft);
      default: return this._roundTree('oak', x, y, z, 5, 2, rng, put, putSoft);
    }
  }

  _leafDisc(leafId, cx, cy, cz, r, putSoft, rng, corner = true) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (d > r + 1) continue;
        if (!corner && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rng.chance(0.6)) continue;
        putSoft(cx + dx, cy, cz + dz, leafId);
      }
    }
  }

  _roundTree(wood, x, y, z, height, radius, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS[wood];
    const top = y + height - 1;
    this._leafDisc(leaves, x, top - 1, z, radius, putSoft, rng);
    this._leafDisc(leaves, x, top, z, radius, putSoft, rng);
    this._leafDisc(leaves, x, top + 1, z, radius - 1, putSoft, rng, false);
    this._leafDisc(leaves, x, top + 2, z, radius - 1, putSoft, rng, false);
    for (let i = 0; i < height; i++) put(x, y + i, z, log, 0);
  }

  _spruceTree(x, y, z, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS.spruce;
    const height = 7 + rng.int(5);
    const bare = 1 + rng.int(2);
    let r = 0;
    for (let i = height - 1; i >= bare; i--) {
      const step = (height - 1 - i) % 4;
      r = step === 0 ? 0 : (step === 1 ? 1 : (step === 2 ? 2 : 1));
      if (i === height - 1) r = 0;
      this._leafDisc(leaves, x, y + i, z, r, putSoft, rng, false);
    }
    putSoft(x, y + height, z, leaves);
    for (let i = 0; i < height; i++) put(x, y + i, z, log, 0);
  }

  _jungleTree(x, y, z, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS.jungle;
    const height = 8 + rng.int(8);
    for (let i = 0; i < height; i++) put(x, y + i, z, log, 0);
    const top = y + height - 1;
    this._leafDisc(leaves, x, top, z, 3, putSoft, rng);
    this._leafDisc(leaves, x, top + 1, z, 2, putSoft, rng, false);
    this._leafDisc(leaves, x, top + 2, z, 1, putSoft, rng, false);
    // a couple of side branches
    for (let n = 0; n < 2 + rng.int(2); n++) {
      const by = y + 4 + rng.int(Math.max(1, height - 6));
      const dir = rng.int(4);
      const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      const len = 2 + rng.int(2);
      for (let k = 1; k <= len; k++) put(x + dx * k, by, z + dz * k, log, dx !== 0 ? 1 : 2);
      this._leafDisc(leaves, x + dx * len, by, z + dz * len, 2, putSoft, rng, false);
      this._leafDisc(leaves, x + dx * len, by + 1, z + dz * len, 1, putSoft, rng, false);
    }
  }

  _acaciaTree(x, y, z, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS.acacia;
    const trunk = 4 + rng.int(3);
    for (let i = 0; i < trunk; i++) put(x, y + i, z, log, 0);
    const dir = rng.int(4);
    const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
    const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    let bx = x, bz = z, by = y + trunk;
    for (let k = 0; k < 3; k++) {
      bx += dx; bz += dz; by += 1;
      put(bx, by, bz, log, dx !== 0 ? 1 : 2);
    }
    this._leafDisc(leaves, bx, by + 1, bz, 3, putSoft, rng, false);
    this._leafDisc(leaves, bx, by + 2, bz, 2, putSoft, rng, false);
    // second, shorter canopy over the original trunk
    this._leafDisc(leaves, x, y + trunk + 1, z, 2, putSoft, rng, false);
  }

  _darkOakTree(x, y, z, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS.dark_oak;
    const height = 6 + rng.int(3);
    for (let i = 0; i < height; i++) {
      put(x, y + i, z, log, 0); put(x + 1, y + i, z, log, 0);
      put(x, y + i, z + 1, log, 0); put(x + 1, y + i, z + 1, log, 0);
    }
    const top = y + height;
    for (let dy = 0; dy < 2; dy++) {
      for (let dz = -2; dz <= 3; dz++) {
        for (let dx = -2; dx <= 3; dx++) {
          if (Math.abs(dx - 0.5) + Math.abs(dz - 0.5) > 4.2 + dy) continue;
          putSoft(x + dx, top + dy, z + dz, leaves);
        }
      }
    }
    this._leafDisc(leaves, x, top + 2, z, 1, putSoft, rng, false);
    this._leafDisc(leaves, x + 1, top + 2, z + 1, 1, putSoft, rng, false);
  }

  _cherryTree(x, y, z, rng, put, putSoft) {
    const { log, leaves } = WOOD_IDS.cherry;
    const trunk = 4 + rng.int(3);
    for (let i = 0; i < trunk; i++) put(x, y + i, z, log, 0);
    const blobs = 2 + rng.int(2);
    for (let n = 0; n < blobs; n++) {
      const dir = rng.int(4);
      const dx = (dir === 0 ? 2 : dir === 1 ? -2 : 0) + rng.int(2) - 1;
      const dz = (dir === 2 ? 2 : dir === 3 ? -2 : 0) + rng.int(2) - 1;
      const by = y + trunk + rng.int(2);
      for (let k = 1; k <= 2; k++) {
        put(x + Math.sign(dx) * k, by - 1, z + Math.sign(dz) * k, log, dx !== 0 ? 1 : 2);
      }
      this._leafDisc(leaves, x + dx, by, z + dz, 2, putSoft, rng, false);
      this._leafDisc(leaves, x + dx, by + 1, z + dz, 2, putSoft, rng, false);
      this._leafDisc(leaves, x + dx, by + 2, z + dz, 1, putSoft, rng, false);
    }
    this._leafDisc(leaves, x, y + trunk, z, 2, putSoft, rng, false);
    this._leafDisc(leaves, x, y + trunk + 1, z, 1, putSoft, rng, false);
  }

  // -------------------------------------------------------------- packing
  _pack(cx, cz, blocks, states, heightmap, biomeMap, blockEntities) {
    const sections = [];
    const transfer = [];
    for (let sy = 0; sy < SECTIONS; sy++) {
      const off = sy * 16 * 256;
      const sub = blocks.subarray(off, off + 4096);
      const first = sub[0];
      let uniform = true;
      for (let i = 1; i < 4096; i++) if (sub[i] !== first) { uniform = false; break; }
      const stateSub = states.subarray(off, off + 4096);
      if (uniform) {
        let statesZero = true;
        for (let i = 0; i < 4096; i++) if (stateSub[i] !== 0) { statesZero = false; break; }
        if (statesZero) { sections.push({ sy, fill: first }); continue; }
      }
      const bcopy = sub.slice();
      const scopy = stateSub.slice();
      sections.push({ sy, blocks: bcopy, states: scopy });
      transfer.push(bcopy.buffer, scopy.buffer);
    }
    transfer.push(heightmap.buffer, biomeMap.buffer);
    return { cx, cz, sections, heightmap, biomeMap, blockEntities, transfer };
  }

  /** Deterministic, land-based initial spawn near the origin. */
  findSpawn() {
    for (let r = 0; r < 96; r++) {
      for (let a = 0; a < Math.max(1, r * 6); a++) {
        const ang = (a / Math.max(1, r * 6)) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r * 8);
        const z = Math.round(Math.sin(ang) * r * 8);
        const h = this.heightAt(x, z);
        if (h <= SEA_LEVEL || h > 120) continue;
        const bid = this.biomeAt(x, z);
        if (bid === OCEAN) continue;
        return { x: x + 0.5, y: h + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: SEA_LEVEL + 2, z: 0.5 };
  }
}
