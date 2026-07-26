// Data-driven block registry.
//
// Adding a block is adding a row here (plus a procedural texture in
// render/textures.js). No engine code changes. Block ids are assigned in
// registration order and are stable as long as rows are appended, never
// inserted -- saves store ids via a name table so reordering is survivable too.

export const TIER = { WOOD: 0, GOLD: 0, STONE: 1, IRON: 2, DIAMOND: 3 };

export const WOODS = [
  { name: 'oak',      log: [0x9c7f4e, 0x6b5433], planks: 0xb8945f, leaf: 'foliage', sapling: true },
  { name: 'spruce',   log: [0x6b5334, 0x372918], planks: 0x7a5c3a, leaf: 'spruce',  sapling: true },
  { name: 'birch',    log: [0xd7cbb0, 0xefeadd], planks: 0xd7c589, leaf: 'birch',   sapling: true },
  { name: 'jungle',   log: [0x9c7f4e, 0x554419], planks: 0xa07550, leaf: 'foliage', sapling: true },
  { name: 'acacia',   log: [0xa85b32, 0x676157], planks: 0xb05c33, leaf: 'foliage', sapling: true },
  { name: 'dark_oak', log: [0x5a4325, 0x36271a], planks: 0x50361c, leaf: 'darkoak', sapling: true },
  { name: 'cherry',   log: [0x8a5f5a, 0x35242c], planks: 0xe0b6ac, leaf: 'cherry',  sapling: true },
];

export const DYES = [
  ['white', 0xe9ecec], ['orange', 0xf07613], ['magenta', 0xbd44b3], ['light_blue', 0x3ab3da],
  ['yellow', 0xf8c627], ['lime', 0x70b919], ['pink', 0xed8dac], ['gray', 0x3e4447],
  ['light_gray', 0x8e8e86], ['cyan', 0x158991], ['purple', 0x792aac], ['blue', 0x35399d],
  ['brown', 0x724728], ['green', 0x546d1b], ['red', 0xa12722], ['black', 0x141519],
];

export const BLOCKS = [];          // id -> definition
export const BLOCK_BY_NAME = new Map();

let nextId = 0;

function def(name, props = {}) {
  if (BLOCK_BY_NAME.has(name)) throw new Error('duplicate block ' + name);
  const b = Object.assign({
    id: nextId++,
    name,
    display: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    render: 'cube',        // cube | cross | liquid | torch | slab | stairs | fence | gate | pane | door | ladder | crop | bed | cactus | farmland | layer | air | fire | sign
    tex: null,             // {all} | {top,bottom,side} | {top,bottom,north,south,east,west} | {front,...}
    solid: true,           // has collision
    opacity: 15,           // light attenuation (>=15 = fully opaque)
    cube: true,            // occupies the full 1x1x1 volume (enables neighbour face culling)
    hardness: 1.0,         // seconds-ish base; -1 = unbreakable
    tool: null,            // 'pickaxe'|'axe'|'shovel'|'hoe'|'sword'|'shears'
    tier: 0,               // minimum tool tier for the block to drop anything
    needsTool: false,      // true = only drops when mined with the right tool class
    emit: 0,               // block light emitted 0..15
    tint: null,            // 'grass'|'foliage'|'water' -> biome tint applied via mask texture
    gravity: false,
    flammable: 0,          // 0 = fireproof; higher = catches faster
    liquid: null,          // 'water'|'lava'
    replaceable: false,    // can be built over (air, water, grass, fire, snow layer)
    blast: 1.0,            // blast resistance
    entity: null,          // 'chest'|'furnace'|'sign'|'spawner' -> has a block entity
    sound: 'stone',
    supportNeeded: null,   // 'ground'|'farmland'|'sand'|'water_adjacent'|'wall'
    fuel: 0,               // furnace burn ticks when used as fuel (block-item)
    item: true,            // has a corresponding item form
  }, props);
  if (b.tex == null) b.tex = { all: name };
  if (b.opacity < 15) b.blocksSky = false;
  BLOCKS.push(b);
  BLOCK_BY_NAME.set(name, b);
  return b;
}

export function blockId(name) {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error('unknown block: ' + name);
  return b.id;
}
export function block(id) { return BLOCKS[id]; }
export function blockByName(name) { return BLOCK_BY_NAME.get(name); }

// ---------------------------------------------------------------- air & fluids
def('air', { render: 'air', solid: false, cube: false, opacity: 0, hardness: -1, replaceable: true, item: false, tex: { all: null } });
def('cave_air', { render: 'air', solid: false, cube: false, opacity: 0, hardness: -1, replaceable: true, item: false, tex: { all: null } });

def('water', {
  render: 'liquid', liquid: 'water', solid: false, cube: false, opacity: 1, hardness: -1,
  replaceable: true, tint: 'water', item: false, sound: 'water', tex: { all: 'water' },
});
def('lava', {
  render: 'liquid', liquid: 'lava', solid: false, cube: false, opacity: 0, emit: 15, hardness: -1,
  replaceable: true, item: false, sound: 'lava', tex: { all: 'lava' },
});

// -------------------------------------------------------------------- terrain
def('stone', { hardness: 1.5, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, drop: 'cobblestone', blast: 6 });
def('deepslate', { hardness: 3.0, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, drop: 'cobbled_deepslate', blast: 6, render: 'pillar', tex: { top: 'deepslate_top', bottom: 'deepslate_top', side: 'deepslate' } });
def('cobblestone', { hardness: 2.0, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, blast: 6 });
def('cobbled_deepslate', { hardness: 3.5, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, blast: 6 });
def('mossy_cobblestone', { hardness: 2.0, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, blast: 6 });
def('bedrock', { hardness: -1, blast: 3600000, tool: 'pickaxe' });
def('dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def('coarse_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def('podzol', { hardness: 0.5, tool: 'shovel', sound: 'gravel', drop: 'dirt', tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' } });
def('mycelium', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 'dirt', tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' } });
def('grass_block', {
  hardness: 0.6, tool: 'shovel', sound: 'grass', drop: 'dirt', tint: 'grass',
  tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
});
def('sand', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
def('red_sand', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
def('gravel', { hardness: 0.6, tool: 'shovel', gravity: true, sound: 'gravel' });
def('clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel' });
def('sandstone', { hardness: 0.8, tool: 'pickaxe', needsTool: true, blast: 6, tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' } });
def('red_sandstone', { hardness: 0.8, tool: 'pickaxe', needsTool: true, blast: 6, tex: { top: 'red_sandstone_top', bottom: 'red_sandstone_bottom', side: 'red_sandstone' } });
def('snow_block', { hardness: 0.2, tool: 'shovel', needsTool: true, sound: 'snow', drop: 'snowball', dropCount: [4, 4] });
def('snow_layer', {
  render: 'layer', hardness: 0.1, tool: 'shovel', needsTool: true, sound: 'snow', cube: false, opacity: 0,
  solid: true, replaceable: true, supportNeeded: 'ground', drop: 'snowball', tex: { all: 'snow_block' },
});
def('ice', { hardness: 0.5, tool: 'pickaxe', opacity: 3, cube: true, drop: null, sound: 'glass', tex: { all: 'ice' } });
def('packed_ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass' });
def('obsidian', { hardness: 50, tool: 'pickaxe', needsTool: true, tier: TIER.DIAMOND, blast: 1200 });
def('farmland', {
  render: 'farmland', hardness: 0.6, tool: 'shovel', cube: false, sound: 'gravel', drop: 'dirt',
  tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' },
});

// ----------------------------------------------------------------------- ores
const ORES = [
  ['coal',    'coal',          3.0, TIER.WOOD,    [1, 1]],
  ['iron',    'raw_iron',      3.0, TIER.STONE,   [1, 1]],
  ['copper',  'raw_copper',    3.0, TIER.STONE,   [2, 5]],
  ['gold',    'raw_gold',      3.0, TIER.IRON,    [1, 1]],
  ['redstone','redstone',      3.0, TIER.IRON,    [4, 5]],
  ['lapis',   'lapis_lazuli',  3.0, TIER.STONE,   [4, 9]],
  ['diamond', 'diamond',       3.0, TIER.IRON,    [1, 1]],
  ['emerald', 'emerald',       3.0, TIER.IRON,    [1, 1]],
];
// Spec: wood mines stone/coal/copper; stone adds iron/lapis; iron adds
// gold/redstone/diamond/emerald; diamond adds obsidian.
const ORE_TIER = { coal: TIER.WOOD, copper: TIER.WOOD, iron: TIER.STONE, lapis: TIER.STONE, gold: TIER.IRON, redstone: TIER.IRON, diamond: TIER.IRON, emerald: TIER.IRON };
export const ORE_NAMES = ORES.map(o => o[0]);
for (const [ore, drop, hardness, , count] of ORES) {
  const tier = ORE_TIER[ore];
  def(`${ore}_ore`, { hardness, tool: 'pickaxe', needsTool: true, tier, drop, dropCount: count, blast: 3, emit: ore === 'redstone' ? 0 : 0 });
  def(`deepslate_${ore}_ore`, { hardness: hardness + 1.5, tool: 'pickaxe', needsTool: true, tier, drop, dropCount: count, blast: 3 });
}
def('coal_block', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.WOOD, blast: 6, fuel: 16000 });
def('iron_block', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.STONE, blast: 6 });
def('gold_block', { hardness: 3, tool: 'pickaxe', needsTool: true, tier: TIER.IRON, blast: 6 });
def('diamond_block', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.IRON, blast: 6 });
def('emerald_block', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.IRON, blast: 6 });
def('copper_block', { hardness: 3, tool: 'pickaxe', needsTool: true, tier: TIER.STONE, blast: 6 });
def('lapis_block', { hardness: 3, tool: 'pickaxe', needsTool: true, tier: TIER.STONE, blast: 6 });
def('redstone_block', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.STONE, blast: 6 });

// ------------------------------------------------------------- wood families
export const WOOD_BLOCKS = {};
for (const w of WOODS) {
  const n = w.name;
  WOOD_BLOCKS[n] = {
    log: def(`${n}_log`, {
      render: 'pillar', hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300,
      tex: { top: `${n}_log_top`, bottom: `${n}_log_top`, side: `${n}_log` },
    }),
    wood: def(`${n}_wood`, { hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, tex: { all: `${n}_log` } }),
    leaves: def(`${n}_leaves`, {
      hardness: 0.2, tool: 'hoe', sound: 'grass', opacity: 1, flammable: 30, cube: true,
      tint: n === 'cherry' ? null : 'foliage', drop: 'LOOT', tex: { all: `${n}_leaves` }, leaves: true,
    }),
    planks: def(`${n}_planks`, { hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, blast: 3, fuel: 300 }),
    slab: def(`${n}_slab`, { render: 'slab', cube: false, hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 150, tex: { all: `${n}_planks` } }),
    stairs: def(`${n}_stairs`, { render: 'stairs', cube: false, hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, tex: { all: `${n}_planks` } }),
    fence: def(`${n}_fence`, { render: 'fence', cube: false, opacity: 0, hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, tex: { all: `${n}_planks` } }),
    gate: def(`${n}_fence_gate`, { render: 'gate', cube: false, opacity: 0, hardness: 2.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, tex: { all: `${n}_planks` } }),
    door: def(`${n}_door`, {
      render: 'door', cube: false, opacity: 0, solid: true, hardness: 3.0, tool: 'axe', sound: 'wood', flammable: 5, fuel: 200,
      tex: { top: `${n}_door_top`, bottom: `${n}_door_bottom`, all: `${n}_door_bottom` },
    }),
    sapling: def(`${n}_sapling`, {
      render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass',
      supportNeeded: 'ground', flammable: 60, tex: { all: `${n}_sapling` },
    }),
  };
}

// -------------------------------------------------------------- stone variants
for (const s of ['stone', 'cobblestone', 'deepslate', 'sandstone']) {
  def(`${s}_slab`, { render: 'slab', cube: false, hardness: 2.0, tool: 'pickaxe', needsTool: true, blast: 6, tex: { all: s === 'deepslate' ? 'deepslate' : s } });
  def(`${s}_stairs`, { render: 'stairs', cube: false, hardness: 2.0, tool: 'pickaxe', needsTool: true, blast: 6, tex: { all: s === 'deepslate' ? 'deepslate' : s } });
}
def('stone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true, blast: 6 });
def('smooth_stone', { hardness: 1.5, tool: 'pickaxe', needsTool: true, blast: 6 });

// -------------------------------------------------------------------- utility
def('glass', { hardness: 0.3, opacity: 0, cube: true, sound: 'glass', drop: null, transparent: true });
def('glass_pane', { render: 'pane', cube: false, opacity: 0, hardness: 0.3, sound: 'glass', drop: null, transparent: true, tex: { all: 'glass_pane', edge: 'glass_pane_top' } });
def('bookshelf', { hardness: 1.5, tool: 'axe', sound: 'wood', flammable: 30, fuel: 300, drop: 'book', dropCount: [3, 3], tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' } });
def('crafting_table', {
  hardness: 2.5, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, interactive: 'crafting',
  tex: { top: 'crafting_table_top', bottom: 'oak_planks', north: 'crafting_table_front', south: 'crafting_table_front', east: 'crafting_table_side', west: 'crafting_table_side' },
});
def('furnace', {
  render: 'facing', hardness: 3.5, tool: 'pickaxe', needsTool: true, blast: 6, entity: 'furnace', interactive: 'furnace',
  tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front', frontLit: 'furnace_front_lit' },
});
def('chest', {
  render: 'chest', cube: false, opacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', flammable: 0, entity: 'chest', interactive: 'chest',
  tex: { all: 'chest' },
});
def('trapped_chest', {
  render: 'chest', cube: false, opacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', entity: 'chest', interactive: 'chest',
  tex: { all: 'trapped_chest' },
});
def('torch', {
  render: 'torch', cube: false, solid: false, opacity: 0, hardness: 0, emit: 14, sound: 'wood',
  supportNeeded: 'torch', tex: { all: 'torch' },
});
def('wall_torch', {
  render: 'torch', cube: false, solid: false, opacity: 0, hardness: 0, emit: 14, sound: 'wood',
  supportNeeded: 'wall', drop: 'torch', item: false, tex: { all: 'torch' },
});
def('ladder', {
  render: 'ladder', cube: false, solid: false, opacity: 0, hardness: 0.4, tool: 'axe', sound: 'wood',
  climbable: true, supportNeeded: 'wall', flammable: 0, tex: { all: 'ladder' },
});
def('sign', {
  render: 'sign', cube: false, solid: false, opacity: 0, hardness: 1.0, tool: 'axe', sound: 'wood',
  entity: 'sign', interactive: 'sign', supportNeeded: 'ground', tex: { all: 'oak_planks' },
});
def('wall_sign', {
  render: 'sign', cube: false, solid: false, opacity: 0, hardness: 1.0, tool: 'axe', sound: 'wood',
  entity: 'sign', supportNeeded: 'wall', drop: 'sign', item: false, tex: { all: 'oak_planks' },
});
def('bed', {
  render: 'bed', cube: false, opacity: 0, hardness: 0.2, sound: 'wool', interactive: 'bed', item: false,
  tex: { top: 'bed_top', side: 'bed_side', bottom: 'oak_planks' },
});
def('tnt', { hardness: 0, flammable: 15, tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' } });
def('spawner', { hardness: 5, tool: 'pickaxe', needsTool: true, tier: TIER.STONE, opacity: 0, cube: true, drop: null, entity: 'spawner', blast: 5, sound: 'metal' });
def('cobweb', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 4, tool: 'sword', drop: 'string', web: true });
def('fire', {
  render: 'fire', cube: false, solid: false, opacity: 0, hardness: 0, emit: 15, replaceable: true,
  drop: null, item: false, tex: { all: 'fire' },
});

// ----------------------------------------------------------------------- flora
def('short_grass', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, tint: 'grass', sound: 'grass', supportNeeded: 'ground', replaceable: true, flammable: 60, drop: 'LOOT', tex: { all: 'short_grass' } });
def('fern', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, tint: 'grass', sound: 'grass', supportNeeded: 'ground', replaceable: true, flammable: 60, drop: 'LOOT', tex: { all: 'fern' } });
def('tall_grass', { render: 'tall_cross', cube: false, solid: false, opacity: 0, hardness: 0, tint: 'grass', sound: 'grass', supportNeeded: 'ground', replaceable: true, flammable: 60, drop: 'LOOT', tex: { all: 'tall_grass' } });
def('dead_bush', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'ground', replaceable: true, flammable: 60, drop: 'stick', tex: { all: 'dead_bush' } });

export const FLOWERS = ['dandelion', 'poppy', 'cornflower', 'allium', 'azure_bluet', 'oxeye_daisy', 'orange_tulip', 'pink_petals'];
for (const f of FLOWERS) {
  def(f, { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'ground', replaceable: true, flammable: 60, tex: { all: f } });
}
def('brown_mushroom', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, emit: 1, sound: 'grass', supportNeeded: 'ground', tex: { all: 'brown_mushroom' } });
def('red_mushroom', { render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'ground', tex: { all: 'red_mushroom' } });

def('sugar_cane', {
  render: 'cross', cube: false, solid: false, opacity: 0, hardness: 0, tint: 'grass', sound: 'grass',
  supportNeeded: 'cane', tex: { all: 'sugar_cane' },
});
def('cactus', {
  render: 'cactus', cube: false, hardness: 0.4, sound: 'wool', supportNeeded: 'sand', opacity: 0,
  damage: 1, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' },
});
def('pumpkin', { hardness: 1.0, tool: 'axe', sound: 'wood', render: 'facing', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' } });
def('melon', { hardness: 1.0, tool: 'axe', sound: 'wood', drop: 'melon_slice', dropCount: [3, 7], tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' } });

// crops: state low 3 bits = growth age
def('wheat', { render: 'crop', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'farmland', maxAge: 7, drop: 'LOOT', item: false, tex: { all: 'wheat' } });
def('carrots', { render: 'crop', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'farmland', maxAge: 7, drop: 'LOOT', item: false, tex: { all: 'carrots' } });
def('potatoes', { render: 'crop', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'farmland', maxAge: 7, drop: 'LOOT', item: false, tex: { all: 'potatoes' } });
def('melon_stem', { render: 'crop', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'farmland', maxAge: 7, drop: 'melon_seeds', item: false, stemFruit: 'melon', tex: { all: 'stem' } });
def('pumpkin_stem', { render: 'crop', cube: false, solid: false, opacity: 0, hardness: 0, sound: 'grass', supportNeeded: 'farmland', maxAge: 7, drop: 'pumpkin_seeds', item: false, stemFruit: 'pumpkin', tex: { all: 'stem' } });

// ------------------------------------------------------------------------ wool
export const WOOL_BLOCKS = [];
for (const [dye] of DYES) {
  WOOL_BLOCKS.push(def(`${dye}_wool`, { hardness: 0.8, tool: 'shears', sound: 'wool', flammable: 30, tex: { all: `${dye}_wool` } }));
}

// --------------------------------------------------------------------- exports
export const AIR = blockId('air');
export const CAVE_AIR = blockId('cave_air');
export const WATER = blockId('water');
export const LAVA = blockId('lava');
export const STONE = blockId('stone');
export const DEEPSLATE = blockId('deepslate');
export const BEDROCK = blockId('bedrock');
export const DIRT = blockId('dirt');
export const GRASS_BLOCK = blockId('grass_block');
export const SAND = blockId('sand');
export const GRAVEL = blockId('gravel');
export const FARMLAND = blockId('farmland');
export const FIRE = blockId('fire');
export const TORCH = blockId('torch');
export const WALL_TORCH = blockId('wall_torch');
export const SNOW_LAYER = blockId('snow_layer');

/** Fast lookup tables consumed by the mesher and the light engine (transferable). */
export function buildBlockTables() {
  const n = BLOCKS.length;
  const t = {
    count: n,
    opacity: new Uint8Array(n),
    emit: new Uint8Array(n),
    cube: new Uint8Array(n),
    solid: new Uint8Array(n),
    liquid: new Uint8Array(n),      // 0 none, 1 water, 2 lava
    render: new Uint8Array(n),
    tint: new Uint8Array(n),        // 0 none, 1 grass, 2 foliage, 3 water
    replaceable: new Uint8Array(n),
    leaves: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const b = BLOCKS[i];
    t.opacity[i] = b.opacity;
    t.emit[i] = b.emit;
    t.cube[i] = b.cube ? 1 : 0;
    t.solid[i] = b.solid ? 1 : 0;
    t.liquid[i] = b.liquid === 'water' ? 1 : (b.liquid === 'lava' ? 2 : 0);
    t.render[i] = RENDER_IDS[b.render] ?? 0;
    t.tint[i] = b.tint === 'grass' ? 1 : (b.tint === 'foliage' ? 2 : (b.tint === 'water' ? 3 : 0));
    t.replaceable[i] = b.replaceable ? 1 : 0;
    t.leaves[i] = b.leaves ? 1 : 0;
  }
  return t;
}

export const RENDER_IDS = {
  air: 0, cube: 1, pillar: 2, facing: 3, liquid: 4, cross: 5, tall_cross: 6, crop: 7,
  slab: 8, stairs: 9, fence: 10, gate: 11, pane: 12, door: 13, ladder: 14, torch: 15,
  chest: 16, bed: 17, cactus: 18, farmland: 19, layer: 20, fire: 21, sign: 22,
};

/** True when a block should be treated as "solid ground" for spawning/support. */
export function isSolidCube(id) {
  const b = BLOCKS[id];
  return !!(b && b.cube && b.solid && !b.liquid);
}
