// Biome table. Biomes are selected from (temperature, humidity, elevation);
// each row owns its surface material, vegetation, tints and spawn weights.

export const BIOMES = [];
const BY_NAME = new Map();

function biome(name, props) {
  const b = Object.assign({
    id: BIOMES.length,
    name,
    display: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    surface: 'grass_block',
    subsurface: 'dirt',
    underwater: 'dirt',
    depth: 3,
    heightScale: 1.0,        // multiplies terrain relief
    heightOffset: 0,         // added to base terrain height
    trees: null,             // { type, density } density = expected trees per chunk
    grass: 0.2,              // ground cover probability weight
    flowers: 0.02,
    cactus: 0,
    sugarCane: 0.08,
    deadBush: 0,
    mushrooms: 0.004,
    pumpkins: 0.004,
    melons: 0,
    snow: false,
    rainBias: 0.5,
    grassTint: 0x79c05a,
    foliageTint: 0x59ae30,
    waterTint: 0x3f76e4,
    skyTint: 0x78a7ff,
    fogTint: 0xc0d8ff,
    mobs: { cow: 8, sheep: 12, pig: 10, chicken: 10 },
  }, props);
  BIOMES.push(b);
  BY_NAME.set(name, b);
  return b;
}

biome('ocean', {
  surface: 'gravel', subsurface: 'gravel', underwater: 'gravel', depth: 3,
  heightScale: 0.35, heightOffset: -26, trees: null, grass: 0, sugarCane: 0,
  grassTint: 0x8eb971, foliageTint: 0x71a74d, waterTint: 0x3f76e4,
  skyTint: 0x78a7ff, fogTint: 0xa8c8ff, mobs: {},
});
biome('beach', {
  surface: 'sand', subsurface: 'sand', underwater: 'sand', depth: 4,
  heightScale: 0.25, heightOffset: -1, trees: null, grass: 0.01, flowers: 0, sugarCane: 0.25,
  grassTint: 0x91bd59, foliageTint: 0x77ab2f, mobs: { pig: 4, chicken: 4 },
});
biome('snowy_beach', {
  surface: 'sand', subsurface: 'sand', underwater: 'sand', depth: 4, snow: true,
  heightScale: 0.25, heightOffset: -1, trees: null, grass: 0, flowers: 0, sugarCane: 0,
  grassTint: 0x80b497, foliageTint: 0x60a17b, waterTint: 0x3d57d6,
  skyTint: 0x8fb2ff, fogTint: 0xd8e6ff, mobs: {},
});
biome('plains', {
  surface: 'grass_block', trees: { type: 'oak', density: 0.12 }, grass: 0.45, flowers: 0.08,
  heightScale: 0.55, rainBias: 0.4,
  grassTint: 0x91bd59, foliageTint: 0x77ab2f,
  mobs: { cow: 10, sheep: 14, pig: 10, chicken: 10 },
});
biome('sunflower_plains', {
  surface: 'grass_block', trees: { type: 'oak', density: 0.08 }, grass: 0.55, flowers: 0.25,
  heightScale: 0.5, grassTint: 0x91bd59, foliageTint: 0x77ab2f,
  mobs: { cow: 10, sheep: 14, pig: 10, chicken: 10 },
});
biome('forest', {
  surface: 'grass_block', trees: { type: 'oak_birch', density: 5.5 }, grass: 0.35, flowers: 0.06,
  heightScale: 0.8, rainBias: 0.55,
  grassTint: 0x79c05a, foliageTint: 0x59ae30,
  mobs: { cow: 8, sheep: 10, pig: 8, chicken: 8 },
});
biome('birch_forest', {
  surface: 'grass_block', trees: { type: 'birch', density: 5.0 }, grass: 0.3, flowers: 0.05,
  heightScale: 0.8, grassTint: 0x88bb67, foliageTint: 0x6ba941,
  mobs: { cow: 8, sheep: 8, pig: 8, chicken: 8 },
});
biome('dark_forest', {
  surface: 'grass_block', trees: { type: 'dark_oak', density: 7.0 }, grass: 0.25, flowers: 0.03,
  mushrooms: 0.05, heightScale: 0.7,
  grassTint: 0x507a32, foliageTint: 0x3f6b1f, skyTint: 0x6e93d6, fogTint: 0x9db4d6,
  mobs: { cow: 6, sheep: 6, pig: 6, chicken: 6 },
});
biome('taiga', {
  surface: 'grass_block', subsurface: 'dirt', trees: { type: 'spruce', density: 5.0 },
  grass: 0.3, flowers: 0.02, mushrooms: 0.02, heightScale: 1.0, rainBias: 0.6,
  grassTint: 0x86b783, foliageTint: 0x68a464,
  mobs: { cow: 8, sheep: 8, pig: 6, chicken: 6 },
});
biome('snowy_taiga', {
  surface: 'grass_block', trees: { type: 'spruce', density: 4.0 }, snow: true,
  grass: 0.15, flowers: 0.0, heightScale: 1.0, rainBias: 0.8,
  grassTint: 0x80b497, foliageTint: 0x60a17b, waterTint: 0x3d57d6,
  skyTint: 0x8fb2ff, fogTint: 0xdbe7ff,
  mobs: { sheep: 6, chicken: 4 },
});
biome('snowy_tundra', {
  surface: 'grass_block', trees: null, snow: true, grass: 0.05, flowers: 0.0, sugarCane: 0,
  heightScale: 0.5, rainBias: 0.8,
  grassTint: 0x80b497, foliageTint: 0x60a17b, waterTint: 0x3d57d6,
  skyTint: 0x8fb2ff, fogTint: 0xe2edff,
  mobs: { sheep: 4 },
});
biome('desert', {
  surface: 'sand', subsurface: 'sand', underwater: 'sand', depth: 5, trees: null,
  grass: 0, flowers: 0, cactus: 0.12, deadBush: 0.06, sugarCane: 0.1, mushrooms: 0,
  heightScale: 0.5, rainBias: 0.0,
  grassTint: 0xbfb755, foliageTint: 0xaea42a, skyTint: 0x86b5ff, fogTint: 0xe8d9a8,
  mobs: { },
});
biome('savanna', {
  surface: 'grass_block', trees: { type: 'acacia', density: 1.0 }, grass: 0.5, flowers: 0.01,
  heightScale: 0.6, rainBias: 0.1,
  grassTint: 0xbfb755, foliageTint: 0xaea42a, skyTint: 0x86b5ff, fogTint: 0xdfe0b0,
  mobs: { cow: 10, sheep: 8, chicken: 6 },
});
biome('jungle', {
  surface: 'grass_block', trees: { type: 'jungle', density: 8.0 }, grass: 0.6, flowers: 0.04,
  melons: 0.06, mushrooms: 0.03, heightScale: 0.9, rainBias: 0.9,
  grassTint: 0x59c93c, foliageTint: 0x30bb0b, skyTint: 0x74a4ff, fogTint: 0xb6e0a8,
  mobs: { cow: 6, pig: 8, chicken: 12 },
});
biome('swamp', {
  surface: 'grass_block', subsurface: 'dirt', underwater: 'clay', trees: { type: 'swamp_oak', density: 1.2 },
  grass: 0.4, flowers: 0.01, mushrooms: 0.05, sugarCane: 0.2,
  heightScale: 0.25, heightOffset: -3, rainBias: 0.7,
  grassTint: 0x6a7039, foliageTint: 0x6a7039, waterTint: 0x617b64,
  skyTint: 0x7ba4d9, fogTint: 0x9fb08a,
  mobs: { cow: 4, sheep: 4, chicken: 4 },
});
biome('cherry_grove', {
  surface: 'grass_block', trees: { type: 'cherry', density: 2.0 }, grass: 0.5, flowers: 0.2,
  heightScale: 0.9, rainBias: 0.5,
  grassTint: 0xb6db61, foliageTint: 0xb6db61, skyTint: 0x8ab6ff, fogTint: 0xf0d0e0,
  mobs: { sheep: 12, pig: 8, chicken: 8 },
});
biome('mountains', {
  surface: 'grass_block', subsurface: 'dirt', trees: { type: 'spruce', density: 0.6 },
  grass: 0.15, flowers: 0.02, heightScale: 1.0, heightOffset: 0, rainBias: 0.6,
  grassTint: 0x8ab689, foliageTint: 0x6da36c, skyTint: 0x88b0ff, fogTint: 0xd0e0ff,
  mobs: { sheep: 6 },
});
biome('stony_peaks', {
  surface: 'stone', subsurface: 'stone', underwater: 'stone', trees: null,
  grass: 0.0, flowers: 0, heightScale: 1.0, snow: true, rainBias: 0.7,
  grassTint: 0x8ab689, foliageTint: 0x6da36c, skyTint: 0x9cc0ff, fogTint: 0xdfeaff,
  mobs: {},
});

export const BIOME_BY_NAME = BY_NAME;
export function biomeByName(n) { return BY_NAME.get(n); }
export const OCEAN = BY_NAME.get('ocean').id;
export const BEACH = BY_NAME.get('beach').id;
export const SNOWY_BEACH = BY_NAME.get('snowy_beach').id;
export const MOUNTAINS = BY_NAME.get('mountains').id;
export const STONY_PEAKS = BY_NAME.get('stony_peaks').id;

/**
 * Pick a land biome from climate. `temp` and `humid` are 0..1, `weird` adds
 * variety inside a climate cell so neighbouring regions are not identical.
 */
export function landBiome(temp, humid, weird) {
  if (temp < 0.16) return humid < 0.45 ? BY_NAME.get('snowy_tundra').id : BY_NAME.get('snowy_taiga').id;
  if (temp < 0.34) {
    if (humid < 0.30) return BY_NAME.get('snowy_tundra').id;
    return BY_NAME.get('taiga').id;
  }
  if (temp < 0.52) {
    if (humid < 0.24) return weird > 0.55 ? BY_NAME.get('sunflower_plains').id : BY_NAME.get('plains').id;
    if (humid < 0.52) return weird > 0.80 ? BY_NAME.get('cherry_grove').id : BY_NAME.get('forest').id;
    if (humid < 0.74) return BY_NAME.get('birch_forest').id;
    return BY_NAME.get('dark_forest').id;
  }
  if (temp < 0.72) {
    if (humid < 0.22) return BY_NAME.get('plains').id;
    if (humid < 0.48) return BY_NAME.get('forest').id;
    if (humid < 0.70) return weird > 0.82 ? BY_NAME.get('cherry_grove').id : BY_NAME.get('forest').id;
    return BY_NAME.get('swamp').id;
  }
  if (temp < 0.86) {
    if (humid < 0.28) return BY_NAME.get('savanna').id;
    if (humid < 0.62) return BY_NAME.get('plains').id;
    return BY_NAME.get('jungle').id;
  }
  if (humid < 0.34) return BY_NAME.get('desert').id;
  if (humid < 0.62) return BY_NAME.get('savanna').id;
  return BY_NAME.get('jungle').id;
}

/** Linear-interpolate two packed RGB colours. */
export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}
