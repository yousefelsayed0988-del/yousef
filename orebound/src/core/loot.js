// Loot tables: what a block drops when broken, what a mob drops when killed,
// and what a generated chest is filled with. All weight/count driven data.

import { BLOCKS, blockByName } from './blocks.js';
import { itemId, hasItem, item } from './items.js';

const D = (name, count = 1) => ({ id: itemId(name), count });

/** Table entry: { item, weight, min, max } */
function table(entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  return { entries, total };
}

function rollTable(t, rng) {
  let r = rng.float() * t.total;
  for (const e of t.entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return t.entries[t.entries.length - 1];
}

// ------------------------------------------------------------- block drops
// Handlers get (blockDef, state, ctx) and return an array of {id,count}.
const BLOCK_LOOT = new Map();

function loot(names, fn) {
  for (const n of Array.isArray(names) ? names : [names]) {
    if (blockByName(n)) BLOCK_LOOT.set(blockByName(n).id, fn);
  }
}

for (const b of BLOCKS) {
  if (!b.leaves) continue;
  const wood = b.name.replace('_leaves', '');
  loot(b.name, (def, state, ctx) => {
    if (ctx.tool === 'shears' || ctx.tool === 'hoe') return [D(b.name)];
    const outv = [];
    if (ctx.rng.chance(0.05) && hasItem(`${wood}_sapling`)) outv.push(D(`${wood}_sapling`));
    if (ctx.rng.chance(0.02)) outv.push(D('stick', 1 + ctx.rng.int(2)));
    if ((wood === 'oak' || wood === 'dark_oak') && ctx.rng.chance(0.005)) outv.push(D('apple'));
    return outv;
  });
}

loot(['short_grass', 'fern'], (def, state, ctx) => {
  if (ctx.tool === 'shears') return [D(def.name)];
  return ctx.rng.chance(0.125) ? [D('wheat_seeds')] : [];
});
loot('tall_grass', (def, state, ctx) => {
  if (ctx.tool === 'shears') return [D('tall_grass')];
  return ctx.rng.chance(0.125) ? [D('wheat_seeds')] : [];
});
loot('gravel', (def, state, ctx) => (ctx.rng.chance(0.10) ? [D('flint')] : [D('gravel')]));
loot('clay', () => [D('clay_ball', 4)]);
loot('snow_layer', (def, state) => [D('snowball', (state & 7) + 1)]);
loot('grass_block', (def, state, ctx) => (ctx.tool === 'shears' ? [D('grass_block')] : [D('dirt')]));

loot('wheat', (def, state, ctx) => {
  const age = state & 7;
  if (age < 7) return [D('wheat_seeds')];
  return [D('wheat'), D('wheat_seeds', 1 + ctx.rng.int(3))];
});
loot('carrots', (def, state, ctx) => {
  const age = state & 7;
  return age < 7 ? [D('carrot')] : [D('carrot', 1 + ctx.rng.int(4))];
});
loot('potatoes', (def, state, ctx) => {
  const age = state & 7;
  return age < 7 ? [D('potato')] : [D('potato', 1 + ctx.rng.int(4))];
});

loot(['ice', 'glass', 'glass_pane', 'spawner', 'fire'], () => []);
loot('bookshelf', () => [D('book', 3)]);
loot('melon', (def, state, ctx) => [D('melon_slice', 3 + ctx.rng.int(5))]);

/**
 * Resolve the drops for a broken block.
 * @param {object} def block definition
 * @param {number} state block state byte
 * @param {object} ctx { tool, tier, rng, canHarvest }
 */
export function blockDrops(def, state, ctx) {
  if (!ctx.canHarvest) return [];
  const custom = BLOCK_LOOT.get(def.id);
  if (custom) return custom(def, state, ctx).filter(d => d && d.count > 0);
  if (def.drop === null) return [];
  if (def.drop === 'LOOT') return [];
  const name = def.drop || def.name;
  if (!hasItem(name)) return [];
  let count = 1;
  if (Array.isArray(def.dropCount)) {
    const [lo, hi] = def.dropCount;
    count = lo + ctx.rng.int(hi - lo + 1);
  } else if (typeof def.dropCount === 'number') count = def.dropCount;
  return count > 0 ? [D(name, count)] : [];
}

// --------------------------------------------------------------- mob drops
export const MOB_LOOT = {
  cow:     rng => [D('leather', rng.int(3)), D('beef', 1 + rng.int(3))],
  pig:     rng => [D('porkchop', 1 + rng.int(3))],
  sheep:   rng => [D('mutton', 1 + rng.int(2))],
  chicken: rng => [D('feather', rng.int(3)), D('chicken', 1)],
  zombie:  rng => [D('rotten_flesh', rng.int(3))],
  skeleton: rng => [D('bone', rng.int(3)), D('arrow', rng.int(3))],
  creeper: rng => [D('gunpowder', rng.int(3))],
  spider:  rng => [D('string', rng.int(3)), rng.chance(0.33) ? D('spider_eye') : null],
};

export function mobDrops(type, rng) {
  const fn = MOB_LOOT[type];
  if (!fn) return [];
  return fn(rng).filter(d => d && d.count > 0);
}

// ------------------------------------------------------------- chest loot
export const CHEST_LOOT = {
  dungeon: {
    rolls: [3, 6],
    table: table([
      { item: 'bone', weight: 10, min: 1, max: 4 },
      { item: 'gunpowder', weight: 10, min: 1, max: 4 },
      { item: 'rotten_flesh', weight: 10, min: 1, max: 4 },
      { item: 'string', weight: 10, min: 1, max: 4 },
      { item: 'wheat', weight: 8, min: 1, max: 4 },
      { item: 'bread', weight: 8, min: 1, max: 3 },
      { item: 'iron_ingot', weight: 6, min: 1, max: 4 },
      { item: 'bucket', weight: 4, min: 1, max: 1 },
      { item: 'gold_ingot', weight: 3, min: 1, max: 3 },
      { item: 'wheat_seeds', weight: 6, min: 2, max: 4 },
      { item: 'melon_seeds', weight: 4, min: 2, max: 4 },
      { item: 'pumpkin_seeds', weight: 4, min: 2, max: 4 },
      { item: 'iron_pickaxe', weight: 2, min: 1, max: 1 },
      { item: 'diamond', weight: 2, min: 1, max: 2 },
      { item: 'golden_helmet', weight: 1, min: 1, max: 1 },
    ]),
  },
  mineshaft: {
    rolls: [2, 5],
    table: table([
      { item: 'iron_ingot', weight: 10, min: 1, max: 5 },
      { item: 'gold_ingot', weight: 5, min: 1, max: 3 },
      { item: 'redstone', weight: 5, min: 4, max: 9 },
      { item: 'lapis_lazuli', weight: 5, min: 4, max: 9 },
      { item: 'diamond', weight: 3, min: 1, max: 2 },
      { item: 'coal', weight: 10, min: 3, max: 8 },
      { item: 'bread', weight: 15, min: 1, max: 3 },
      { item: 'torch', weight: 15, min: 4, max: 16 },
      { item: 'oak_planks', weight: 8, min: 4, max: 12 },
      { item: 'stick', weight: 8, min: 2, max: 6 },
      { item: 'melon_seeds', weight: 5, min: 2, max: 4 },
      { item: 'pumpkin_seeds', weight: 5, min: 2, max: 4 },
    ]),
  },
  ruins: {
    rolls: [2, 4],
    table: table([
      { item: 'wheat', weight: 10, min: 1, max: 5 },
      { item: 'apple', weight: 10, min: 1, max: 3 },
      { item: 'coal', weight: 10, min: 1, max: 6 },
      { item: 'iron_ingot', weight: 6, min: 1, max: 3 },
      { item: 'emerald', weight: 3, min: 1, max: 2 },
      { item: 'stone_axe', weight: 4, min: 1, max: 1 },
      { item: 'stone_pickaxe', weight: 4, min: 1, max: 1 },
      { item: 'leather_boots', weight: 3, min: 1, max: 1 },
      { item: 'book', weight: 5, min: 1, max: 2 },
      { item: 'wheat_seeds', weight: 8, min: 1, max: 4 },
      { item: 'torch', weight: 8, min: 2, max: 8 },
    ]),
  },
  buried_treasure: {
    rolls: [4, 8],
    table: table([
      { item: 'iron_ingot', weight: 10, min: 1, max: 4 },
      { item: 'gold_ingot', weight: 8, min: 1, max: 4 },
      { item: 'diamond', weight: 5, min: 1, max: 2 },
      { item: 'emerald', weight: 5, min: 1, max: 4 },
      { item: 'cooked_beef', weight: 10, min: 2, max: 4 },
      { item: 'cooked_porkchop', weight: 10, min: 2, max: 4 },
      { item: 'iron_sword', weight: 3, min: 1, max: 1 },
      { item: 'iron_chestplate', weight: 2, min: 1, max: 1 },
      { item: 'lapis_lazuli', weight: 6, min: 3, max: 9 },
    ]),
  },
};

/** Fill a 27-slot container array from a named loot table. */
export function fillChest(tableName, rng, slots = 27) {
  const t = CHEST_LOOT[tableName];
  const contents = new Array(slots).fill(null);
  if (!t) return contents;
  const rolls = t.rolls[0] + rng.int(t.rolls[1] - t.rolls[0] + 1);
  const free = [];
  for (let i = 0; i < slots; i++) free.push(i);
  rng.shuffle(free);
  let placed = 0;
  for (let i = 0; i < rolls && placed < slots; i++) {
    const e = rollTable(t.table, rng);
    if (!hasItem(e.item)) continue;
    const count = e.min + rng.int(e.max - e.min + 1);
    if (count <= 0) continue;
    const id = itemId(e.item);
    const limit = item(id).stack;
    contents[free[placed++]] = { id, count: Math.min(count, limit), dmg: 0 };
  }
  return contents;
}
