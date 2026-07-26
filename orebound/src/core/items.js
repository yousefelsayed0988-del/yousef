// Item registry. Block-items are generated from the block registry; tools,
// armour, food and materials are declared as data rows below.

import { BLOCKS, WOODS, DYES, TIER } from './blocks.js';

export const ITEMS = [];
export const ITEM_BY_NAME = new Map();

let nextId = 1; // 0 is reserved for "empty"

function def(name, props = {}) {
  if (ITEM_BY_NAME.has(name)) return ITEM_BY_NAME.get(name);
  const it = Object.assign({
    id: nextId++,
    name,
    display: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    stack: 64,
    tex: name,        // icon texture key
    block: null,      // block id when placeable
    tool: null,       // { type, tier, speed, durability, damage }
    armor: null,      // { slot, defense, toughness, durability }
    food: null,       // { hunger, saturation, eatTicks, effect }
    fuel: 0,
    damage: 1,        // attack damage in half-hearts... (full hearts * 2)
    tint: null,
  }, props);
  ITEMS.push(it);
  ITEM_BY_NAME.set(name, it);
  return it;
}

export function item(id) { return ITEMS[id - 1]; }
export function itemByName(name) { return ITEM_BY_NAME.get(name); }
export function itemId(name) {
  const it = ITEM_BY_NAME.get(name);
  if (!it) throw new Error('unknown item: ' + name);
  return it.id;
}
export function hasItem(name) { return ITEM_BY_NAME.has(name); }

// ------------------------------------------------------------- block items
for (const b of BLOCKS) {
  if (!b.item) continue;
  def(b.name, {
    block: b.id,
    display: b.display,
    tex: 'block:' + b.name,
    fuel: b.fuel || 0,
    tint: b.tint,
    stack: 64,
  });
}

// ---------------------------------------------------------------- materials
const MATERIALS = [
  ['stick', { fuel: 100 }],
  ['coal', { fuel: 1600 }],
  ['charcoal', { fuel: 1600 }],
  ['iron_ingot', {}],
  ['gold_ingot', {}],
  ['copper_ingot', {}],
  ['raw_iron', {}],
  ['raw_gold', {}],
  ['raw_copper', {}],
  ['diamond', {}],
  ['emerald', {}],
  ['lapis_lazuli', {}],
  ['redstone', {}],
  ['leather', {}],
  ['string', {}],
  ['gunpowder', {}],
  ['flint', {}],
  ['bone', {}],
  ['bone_meal', {}],
  ['feather', {}],
  ['wheat', {}],
  ['wheat_seeds', {}],
  ['melon_seeds', {}],
  ['pumpkin_seeds', {}],
  ['clay_ball', {}],
  ['brick', {}],
  ['paper', {}],
  ['book', {}],
  ['bowl', { fuel: 100 }],
  ['sugar', {}],
  ['arrow', {}],
  ['snowball', { stack: 16 }],
  ['egg', { stack: 16 }],
  ['ink_sac', {}],
  ['rotten_flesh', {}],
  ['spider_eye', {}],
];
for (const [name, props] of MATERIALS) def(name, props);

// ------------------------------------------------------------------- tools
// Vanilla-accurate feel: gold is wood-tier but very fast and very fragile.
export const TOOL_MATERIALS = {
  wooden:  { tier: TIER.WOOD,    speed: 2,  durability: 59,   dmg: { sword: 4, axe: 7, pickaxe: 2, shovel: 2.5, hoe: 1 } },
  stone:   { tier: TIER.STONE,   speed: 4,  durability: 131,  dmg: { sword: 5, axe: 9, pickaxe: 3, shovel: 3.5, hoe: 1 } },
  iron:    { tier: TIER.IRON,    speed: 6,  durability: 250,  dmg: { sword: 6, axe: 9, pickaxe: 4, shovel: 4.5, hoe: 1 } },
  golden:  { tier: TIER.GOLD,    speed: 12, durability: 32,   dmg: { sword: 4, axe: 7, pickaxe: 2, shovel: 2.5, hoe: 1 } },
  diamond: { tier: TIER.DIAMOND, speed: 8,  durability: 1561, dmg: { sword: 7, axe: 9, pickaxe: 5, shovel: 5.5, hoe: 1 } },
};
export const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];
export const TOOL_ORDER = ['wooden', 'stone', 'iron', 'golden', 'diamond'];

for (const mat of TOOL_ORDER) {
  const m = TOOL_MATERIALS[mat];
  for (const type of TOOL_TYPES) {
    def(`${mat}_${type}`, {
      stack: 1,
      damage: m.dmg[type],
      fuel: mat === 'wooden' ? 200 : 0,
      tool: { type, tier: m.tier, speed: m.speed, durability: m.durability, material: mat },
    });
  }
}
def('shears', { stack: 1, damage: 1, tool: { type: 'shears', tier: 0, speed: 5, durability: 238, material: 'iron' } });
def('flint_and_steel', { stack: 1, tool: { type: 'igniter', tier: 0, speed: 1, durability: 64, material: 'iron' } });

// ------------------------------------------------------------------- armour
export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_MATERIALS = {
  leather: { defense: [1, 3, 2, 1], toughness: 0, durability: [55, 80, 75, 65] },
  iron:    { defense: [2, 6, 5, 2], toughness: 0, durability: [165, 240, 225, 195] },
  golden:  { defense: [2, 5, 3, 1], toughness: 0, durability: [77, 112, 105, 91] },
  diamond: { defense: [3, 8, 6, 3], toughness: 2, durability: [363, 528, 495, 429] },
};
for (const [mat, m] of Object.entries(ARMOR_MATERIALS)) {
  ARMOR_SLOTS.forEach((slot, i) => {
    def(`${mat}_${slot}`, {
      stack: 1,
      armor: { slot: i, defense: m.defense[i], toughness: m.toughness, durability: m.durability[i], material: mat },
    });
  });
}

// --------------------------------------------------------------------- food
const FOODS = [
  ['apple', 4, 2.4],
  ['bread', 5, 6.0],
  ['porkchop', 3, 1.8],
  ['cooked_porkchop', 8, 12.8],
  ['beef', 3, 1.8],
  ['cooked_beef', 8, 12.8],
  ['chicken', 2, 1.2],
  ['cooked_chicken', 6, 7.2],
  ['mutton', 2, 1.2],
  ['rabbit', 3, 1.8],
  ['cooked_rabbit', 5, 6.0],
  ['sweet_berries', 2, 0.4],
  ['cooked_mutton', 6, 9.6],
  ['carrot', 3, 3.6],
  ['potato', 1, 0.6],
  ['baked_potato', 5, 6.0],
  ['melon_slice', 2, 1.2],
  ['cookie', 2, 0.4],
  ['pumpkin_pie', 8, 4.8],
  ['mushroom_stew', 6, 7.2, { stack: 1, container: 'bowl' }],
  ['beetroot_soup', 6, 7.2, { stack: 1, container: 'bowl' }],
];
for (const [name, hunger, sat, extra] of FOODS) {
  def(name, Object.assign({ food: { hunger, saturation: sat, eatTicks: 32 } }, extra || {}));
}
// rotten flesh is deliberately bad but edible
ITEM_BY_NAME.get('rotten_flesh').food = { hunger: 4, saturation: 0.8, eatTicks: 32, poison: true };

// ------------------------------------------------------------------ special
def('bucket', { stack: 1 });
def('water_bucket', { stack: 1, fluid: 'water' });
def('lava_bucket', { stack: 1, fluid: 'lava', fuel: 20000 });
def('milk_bucket', { stack: 1, food: { hunger: 0, saturation: 0, eatTicks: 32, milk: true } });
def('bow', { stack: 1, damage: 1, tool: { type: 'bow', tier: 0, speed: 1, durability: 384, material: 'wood' } });
def('shield', { stack: 1, damage: 1, tool: { type: 'shield', tier: 0, speed: 1, durability: 336, material: 'wood' } });
for (const w of WOODS) def(`${w.name}_boat`, { stack: 1, boat: w.name, tex: 'boat' });
def('bed_item', { stack: 1, display: 'Bed', tex: 'bed_item', placesBed: true });
for (const [dye, color] of DYES) {
  if (dye !== 'white') def(`${dye}_dye`, { tex: 'dye', tint: color });
}
ITEM_BY_NAME.get('bone_meal').tint = 0xf0f0e0;

/** Damage a tool/armour stack. Returns true when the item breaks. */
export function damageItem(stack, amount = 1) {
  if (!stack || !stack.id) return false;
  const it = item(stack.id);
  const max = it.tool ? it.tool.durability : (it.armor ? it.armor.durability : 0);
  if (!max) return false;
  stack.dmg = (stack.dmg || 0) + amount;
  if (stack.dmg >= max) { stack.id = 0; stack.count = 0; stack.dmg = 0; return true; }
  return false;
}

export function maxDurability(id) {
  const it = item(id);
  if (!it) return 0;
  return it.tool ? it.tool.durability : (it.armor ? it.armor.durability : 0);
}

export function stackLimit(id) {
  const it = item(id);
  return it ? it.stack : 64;
}
