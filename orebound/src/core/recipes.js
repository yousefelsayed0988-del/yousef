// Crafting + smelting registries. Recipes are data; the matcher is generic.

import { WOODS, DYES, FLOWERS } from './blocks.js';
import { ITEMS, itemId, hasItem, TOOL_ORDER } from './items.js';
import { ingredientMatcher } from './tags.js';

export const RECIPES = [];

function out(spec) {
  if (typeof spec === 'string') return { id: itemId(spec), count: 1 };
  return { id: itemId(spec.item), count: spec.count || 1 };
}

/**
 * Shaped recipe. `rows` is an array of equal-length strings, ' ' = empty.
 * `keys` maps a character to an item name or a '#tag'.
 */
export function shaped(rows, keys, result, opts = {}) {
  const h = rows.length, w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error('ragged recipe pattern');
  const cells = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === ' ') continue;
      const token = keys[ch];
      if (token === undefined) throw new Error('recipe key missing: ' + ch);
      cells[y * w + x] = { token, match: ingredientMatcher(token) };
    }
  }
  const r = { type: 'shaped', w, h, cells, rows, keys, result: out(result), mirror: opts.mirror !== false, group: opts.group };
  RECIPES.push(r);
  return r;
}

/** Shapeless recipe -- ingredient order and position are irrelevant. */
export function shapeless(tokens, result, opts = {}) {
  const r = {
    type: 'shapeless',
    ingredients: tokens.map(t => ({ token: t, match: ingredientMatcher(t) })),
    result: out(result), group: opts.group,
  };
  RECIPES.push(r);
  return r;
}

// --------------------------------------------------------------- matching
function gridBounds(grid, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = grid[y * w + x];
    if (s && s.id && s.count > 0) {
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, n };
}

function matchShapedAt(recipe, grid, w, h, ox, oy, mirrored) {
  for (let y = 0; y < recipe.h; y++) {
    for (let x = 0; x < recipe.w; x++) {
      const rc = recipe.cells[y * recipe.w + (mirrored ? recipe.w - 1 - x : x)];
      const s = grid[(oy + y) * w + (ox + x)];
      const filled = s && s.id && s.count > 0;
      if (!rc) { if (filled) return false; continue; }
      if (!filled || !rc.match(s.id)) return false;
    }
  }
  // everything outside the recipe footprint must be empty
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= ox && x < ox + recipe.w && y >= oy && y < oy + recipe.h;
    if (inside) continue;
    const s = grid[y * w + x];
    if (s && s.id && s.count > 0) return false;
  }
  return true;
}

function matchShapeless(recipe, grid) {
  const stacks = grid.filter(s => s && s.id && s.count > 0);
  if (stacks.length !== recipe.ingredients.length) return false;
  const used = new Array(stacks.length).fill(false);
  for (const ing of recipe.ingredients) {
    let found = -1;
    for (let i = 0; i < stacks.length; i++) {
      if (!used[i] && ing.match(stacks[i].id)) { found = i; break; }
    }
    if (found < 0) return false;
    used[found] = true;
  }
  return true;
}

/**
 * Find the recipe matching a crafting grid.
 * @param {Array} grid row-major array of {id,count} or null, length w*h
 */
export function findRecipe(grid, w, h) {
  const b = gridBounds(grid, w, h);
  if (b.n === 0) return null;
  for (const r of RECIPES) {
    if (r.type === 'shaped') {
      if (r.w > w || r.h > h) continue;
      const rw = b.maxX - b.minX + 1, rh = b.maxY - b.minY + 1;
      if (rw !== r.w || rh !== r.h) continue;
      if (matchShapedAt(r, grid, w, h, b.minX, b.minY, false)) return r;
      if (r.mirror && matchShapedAt(r, grid, w, h, b.minX, b.minY, true)) return r;
    } else {
      if (matchShapeless(r, grid)) return r;
    }
  }
  return null;
}

/** Items left behind after crafting (empty bucket from a filled one, etc). */
export const CRAFT_REMAINDER = new Map();
function remainder(from, to) {
  if (hasItem(from) && hasItem(to)) CRAFT_REMAINDER.set(itemId(from), itemId(to));
}
remainder('water_bucket', 'bucket');
remainder('lava_bucket', 'bucket');
remainder('milk_bucket', 'bucket');

// ============================================================== the recipes
const woods = WOODS.map(w => w.name);

for (const w of woods) {
  shapeless([`${w}_log`], { item: `${w}_planks`, count: 4 });
  shapeless([`${w}_wood`], { item: `${w}_planks`, count: 4 });
  shaped(['##', '##'], { '#': `${w}_log` }, { item: `${w}_wood`, count: 3 });
  shaped(['###'], { '#': `${w}_planks` }, { item: `${w}_slab`, count: 6 });
  shaped(['#  ', '## ', '###'], { '#': `${w}_planks` }, { item: `${w}_stairs`, count: 4 });
  shaped(['#|#', '#|#'], { '#': `${w}_planks`, '|': 'stick' }, { item: `${w}_fence`, count: 3 });
  shaped(['|#|', '|#|'], { '#': `${w}_planks`, '|': 'stick' }, { item: `${w}_fence_gate`, count: 1 });
  shaped(['##', '##', '##'], { '#': `${w}_planks` }, { item: `${w}_door`, count: 3 });
  shaped(['# #', '###'], { '#': `${w}_planks` }, { item: `${w}_boat`, count: 1 });
}

shaped(['#', '#'], { '#': '#planks' }, { item: 'stick', count: 4 });
shaped(['##', '##'], { '#': '#planks' }, 'crafting_table');
shaped(['###', '# #', '###'], { '#': '#stone_crafting_materials' }, 'furnace');
shaped(['###', '# #', '###'], { '#': '#planks' }, 'chest');
shaped(['###', '# #', '###'], { '#': '#planks' }, 'trapped_chest');
shaped(['c', '|'], { c: '#coals', '|': 'stick' }, { item: 'torch', count: 4 });
shaped(['###'], { '#': '#planks' }, { item: 'sign', count: 3 }, { mirror: false });
shaped(['# #', '###', '# #'], { '#': 'stick' }, { item: 'ladder', count: 3 });
shaped(['www', 'ppp'], { w: '#wool', p: '#planks' }, 'bed_item');
shapeless(['wheat', 'wheat', 'wheat'], 'bread');
shaped(['# #', ' # '], { '#': '#planks' }, { item: 'bowl', count: 4 });
shapeless(['brown_mushroom', 'red_mushroom', 'bowl'], 'mushroom_stew');
shaped(['ccc'], { c: 'sugar_cane' }, { item: 'paper', count: 3 });
shaped(['ppp', ' l '], { p: 'paper', l: 'leather' }, 'book', { mirror: false });
shaped(['ppp', 'bbb', 'ppp'], { p: '#planks', b: 'book' }, 'bookshelf');
shaped(['ggg', 'ggg'], { g: 'glass' }, { item: 'glass_pane', count: 16 });
shaped(['i i', ' i '], { i: 'iron_ingot' }, 'bucket');
shaped(['pip', 'ppp', ' p '], { p: '#planks', i: 'iron_ingot' }, 'shield');
shaped(['i ', ' i'], { i: 'iron_ingot' }, 'shears');
shapeless(['iron_ingot', 'flint'], 'flint_and_steel');
shaped([' |s', '| s', ' |s'], { '|': 'stick', s: 'string' }, 'bow', { mirror: true });
shaped(['f', '|', 'v'], { f: 'flint', '|': 'stick', v: 'feather' }, { item: 'arrow', count: 4 });
shaped(['gsg', 'sgs', 'gsg'], { g: 'gunpowder', s: '#sand' }, 'tnt');
shaped(['ss', 'ss'], { s: 'snowball' }, 'snow_block');
shapeless(['sugar_cane'], 'sugar');
shapeless(['melon_slice'], 'melon_seeds');
shapeless(['pumpkin'], { item: 'pumpkin_seeds', count: 4 });
shapeless(['wheat', 'wheat', 'sugar'], { item: 'cookie', count: 8 });
shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie');
shaped(['dd', 'gg'], { d: 'dirt', g: 'gravel' }, { item: 'coarse_dirt', count: 4 });
shaped(['ss', 'ss'], { s: 'stone' }, { item: 'stone_bricks', count: 4 });
shaped(['ss', 'ss'], { s: 'string' }, 'white_wool');
shapeless(['bone'], { item: 'bone_meal', count: 3 });

for (const s of ['stone', 'cobblestone', 'deepslate', 'sandstone']) {
  const src = s === 'deepslate' ? 'cobbled_deepslate' : s;
  shaped(['###'], { '#': src }, { item: `${s}_slab`, count: 6 });
  shaped(['#  ', '## ', '###'], { '#': src }, { item: `${s}_stairs`, count: 4 });
}
shaped(['ss', 'ss'], { s: 'sand' }, { item: 'sandstone', count: 1 });
shaped(['ss', 'ss'], { s: 'red_sand' }, { item: 'red_sandstone', count: 1 });

// tools + armour per material
const TOOL_MAT_ITEM = {
  wooden: '#planks', stone: '#stone_tool_materials', iron: 'iron_ingot',
  golden: 'gold_ingot', diamond: 'diamond',
};
const ARMOR_MAT_ITEM = { leather: 'leather', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
for (const mat of TOOL_ORDER) {
  const m = TOOL_MAT_ITEM[mat];
  shaped(['mmm', ' | ', ' | '], { m, '|': 'stick' }, `${mat}_pickaxe`, { mirror: false });
  shaped(['mm', 'm|', ' |'], { m, '|': 'stick' }, `${mat}_axe`);
  shaped(['m', '|', '|'], { m, '|': 'stick' }, `${mat}_shovel`);
  shaped(['mm', ' |', ' |'], { m, '|': 'stick' }, `${mat}_hoe`);
  shaped(['m', 'm', '|'], { m, '|': 'stick' }, `${mat}_sword`);
}
for (const [mat, m] of Object.entries(ARMOR_MAT_ITEM)) {
  shaped(['mmm', 'm m'], { m }, `${mat}_helmet`);
  shaped(['m m', 'mmm', 'mmm'], { m }, `${mat}_chestplate`);
  shaped(['mmm', 'm m', 'm m'], { m }, `${mat}_leggings`);
  shaped(['m m', 'm m'], { m }, `${mat}_boots`);
}

// compaction: 9 -> block, block -> 9
const COMPACT = [
  ['coal', 'coal_block'], ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'],
  ['diamond', 'diamond_block'], ['emerald', 'emerald_block'], ['copper_ingot', 'copper_block'],
  ['redstone', 'redstone_block'],
];
for (const [ing, blk] of COMPACT) {
  shaped(['iii', 'iii', 'iii'], { i: ing }, blk);
  shapeless([blk], { item: ing, count: 9 });
}
shaped(['lll', 'lll', 'lll'], { l: 'lapis_lazuli' }, 'lapis_block');
shapeless(['lapis_block'], { item: 'lapis_lazuli', count: 9 });

// dyes from flowers, wool dyeing
const FLOWER_DYE = {
  dandelion: 'yellow', poppy: 'red', cornflower: 'blue', allium: 'magenta',
  azure_bluet: 'light_gray', oxeye_daisy: 'light_gray', orange_tulip: 'orange', pink_petals: 'pink',
};
for (const f of FLOWERS) {
  const dye = FLOWER_DYE[f];
  if (dye && dye !== 'white' && hasItem(`${dye}_dye`)) shapeless([f], { item: `${dye}_dye`, count: 1 });
}
for (const [dye] of DYES) {
  if (dye === 'white') continue;
  if (!hasItem(`${dye}_dye`)) continue;
  shapeless(['#wool', `${dye}_dye`], `${dye}_wool`);
}
shapeless(['#wool', 'bone_meal'], 'white_wool');

// ============================================================== smelting
export const SMELTING = new Map();   // input item id -> { id, count, xp, ticks }
export function smelt(input, result, ticks = 200) {
  if (!hasItem(input) || !hasItem(typeof result === 'string' ? result : result.item)) return;
  const r = typeof result === 'string' ? { item: result, count: 1 } : result;
  SMELTING.set(itemId(input), { id: itemId(r.item), count: r.count || 1, ticks });
}

smelt('raw_iron', 'iron_ingot');
smelt('iron_ore', 'iron_ingot');
smelt('deepslate_iron_ore', 'iron_ingot');
smelt('raw_gold', 'gold_ingot');
smelt('gold_ore', 'gold_ingot');
smelt('deepslate_gold_ore', 'gold_ingot');
smelt('raw_copper', 'copper_ingot');
smelt('copper_ore', 'copper_ingot');
smelt('deepslate_copper_ore', 'copper_ingot');
smelt('coal_ore', 'coal');
smelt('deepslate_coal_ore', 'coal');
smelt('diamond_ore', 'diamond');
smelt('deepslate_diamond_ore', 'diamond');
smelt('emerald_ore', 'emerald');
smelt('deepslate_emerald_ore', 'emerald');
smelt('lapis_ore', 'lapis_lazuli');
smelt('deepslate_lapis_ore', 'lapis_lazuli');
smelt('redstone_ore', 'redstone');
smelt('deepslate_redstone_ore', 'redstone');
smelt('sand', 'glass');
smelt('red_sand', 'glass');
smelt('cobblestone', 'stone');
smelt('stone', 'smooth_stone');
smelt('clay_ball', 'brick');
smelt('beef', 'cooked_beef');
smelt('porkchop', 'cooked_porkchop');
smelt('chicken', 'cooked_chicken');
smelt('mutton', 'cooked_mutton');
smelt('rabbit', 'cooked_rabbit');
smelt('potato', 'baked_potato');
for (const w of woods) { smelt(`${w}_log`, 'charcoal'); smelt(`${w}_wood`, 'charcoal'); }

/**
 * Furnace fuel burn time in ticks (0 = not a fuel).
 * Reference points from the spec: coal/charcoal smelt 8 items (1600t), a plank
 * 1.5 items (300t), a stick 0.5 items (100t), a lava bucket 100 items (20000t).
 */
export function fuelTicks(itemIdValue) {
  if (!itemIdValue) return 0;
  const it = ITEMS[itemIdValue - 1];   // ids are assigned sequentially from 1
  return it ? (it.fuel | 0) : 0;
}

/** Everything a furnace can consume, for UI hinting. */
export function isFuel(id) { return fuelTicks(id) > 0; }
export function smeltResult(id) { return SMELTING.get(id) || null; }
