// Item tags. Recipes reference tags (e.g. "#planks") so "any plank" works
// without writing seven near-identical recipes per plank type.

import { WOODS, DYES, FLOWERS } from './blocks.js';
import { ITEM_BY_NAME, hasItem } from './items.js';

export const TAGS = new Map();   // '#name' -> Set<itemId>
const TAG_OF = new Map();        // itemId -> Set<'#name'>

export function defTag(name, itemNames) {
  const key = name.startsWith('#') ? name : '#' + name;
  const set = TAGS.get(key) || new Set();
  for (const n of itemNames) {
    if (!hasItem(n)) continue;
    const id = ITEM_BY_NAME.get(n).id;
    set.add(id);
    let t = TAG_OF.get(id);
    if (!t) TAG_OF.set(id, t = new Set());
    t.add(key);
  }
  TAGS.set(key, set);
  return set;
}

export function tagItems(name) {
  return TAGS.get(name.startsWith('#') ? name : '#' + name) || new Set();
}

export function inTag(itemIdValue, tagName) {
  const s = TAGS.get(tagName);
  return !!s && s.has(itemIdValue);
}

export function tagsOf(itemIdValue) { return TAG_OF.get(itemIdValue) || null; }

const woodNames = WOODS.map(w => w.name);

defTag('#logs', woodNames.flatMap(w => [`${w}_log`, `${w}_wood`]));
defTag('#planks', woodNames.map(w => `${w}_planks`));
defTag('#wooden_slabs', woodNames.map(w => `${w}_slab`));
defTag('#wooden_stairs', woodNames.map(w => `${w}_stairs`));
defTag('#wooden_fences', woodNames.map(w => `${w}_fence`));
defTag('#wooden_doors', woodNames.map(w => `${w}_door`));
defTag('#leaves', woodNames.map(w => `${w}_leaves`));
defTag('#saplings', woodNames.map(w => `${w}_sapling`));
defTag('#boats', woodNames.map(w => `${w}_boat`));
defTag('#coals', ['coal', 'charcoal']);
defTag('#wool', DYES.map(([d]) => `${d}_wool`));
defTag('#flowers', FLOWERS);
defTag('#sand', ['sand', 'red_sand']);
defTag('#stone_crafting_materials', ['cobblestone', 'cobbled_deepslate']);
defTag('#dirt', ['dirt', 'coarse_dirt', 'podzol', 'grass_block', 'mycelium']);
defTag('#stone_tool_materials', ['cobblestone', 'cobbled_deepslate']);
defTag('#smelts_to_stone', ['cobblestone']);
defTag('#meat', ['beef', 'porkchop', 'chicken', 'mutton']);
defTag('#cooked_meat', ['cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton']);
defTag('#seeds', ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds']);
defTag('#dyes', DYES.filter(([d]) => d !== 'white').map(([d]) => `${d}_dye`).concat(['bone_meal', 'ink_sac']));
defTag('#ores', ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore']
  .flatMap(n => [n, 'deepslate_' + n]));
defTag('#fuel_wood', woodNames.flatMap(w => [`${w}_log`, `${w}_wood`, `${w}_planks`, `${w}_slab`, `${w}_stairs`, `${w}_fence`, `${w}_fence_gate`]));

/** Resolve a recipe ingredient token to a predicate over item ids. */
export function ingredientMatcher(token) {
  if (token == null) return null;
  if (typeof token === 'string' && token.startsWith('#')) {
    const set = TAGS.get(token);
    if (!set) throw new Error('unknown tag ' + token);
    return id => set.has(id);
  }
  const it = ITEM_BY_NAME.get(token);
  if (!it) throw new Error('unknown item in recipe: ' + token);
  return id => id === it.id;
}
