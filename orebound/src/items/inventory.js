// Inventory model: stacks, containers, and the crafting grid.
//
// A stack is a plain { id, count, dmg } object (id 0 / null = empty) so it
// serialises straight into the save format with no conversion step.

import { item, stackLimit, maxDurability } from '../core/items.js';
import { findRecipe, CRAFT_REMAINDER } from '../core/recipes.js';

export const HOTBAR = 9;
export const MAIN = 27;
export const ARMOR = 4;
export const INV_SIZE = HOTBAR + MAIN + ARMOR + 1;   // + off-hand
export const ARMOR_START = HOTBAR + MAIN;
export const OFFHAND = ARMOR_START + ARMOR;

export function mkStack(id, count = 1, dmg = 0) {
  if (!id || count <= 0) return null;
  return { id, count, dmg };
}
export function copyStack(s) { return s ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null; }
export function sameItem(a, b) {
  if (!a || !b) return false;
  return a.id === b.id && (a.dmg || 0) === (b.dmg || 0);
}

export class Container {
  constructor(size, name = 'container') {
    this.slots = new Array(size).fill(null);
    this.name = name;
    this.version = 0;
  }
  get size() { return this.slots.length; }
  get(i) { return this.slots[i] || null; }
  set(i, stack) {
    this.slots[i] = (stack && stack.count > 0) ? stack : null;
    this.version++;
  }
  isEmpty() { return this.slots.every(s => !s); }

  /** Insert as much of `stack` as fits. Returns the leftover (or null). */
  add(stack, from = 0, to = this.slots.length) {
    if (!stack || stack.count <= 0) return null;
    const limit = stackLimit(stack.id);
    if (limit > 1) {
      for (let i = from; i < to; i++) {
        const s = this.slots[i];
        if (!s || !sameItem(s, stack)) continue;
        const room = limit - s.count;
        if (room <= 0) continue;
        const move = Math.min(room, stack.count);
        s.count += move; stack.count -= move; this.version++;
        if (stack.count <= 0) return null;
      }
    }
    for (let i = from; i < to; i++) {
      if (this.slots[i]) continue;
      const move = Math.min(limit, stack.count);
      this.slots[i] = { id: stack.id, count: move, dmg: stack.dmg || 0 };
      stack.count -= move; this.version++;
      if (stack.count <= 0) return null;
    }
    return stack;
  }

  /** Remove up to `count` of `id`. Returns how many were actually removed. */
  remove(id, count) {
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.slots[i] = null;
      this.version++;
    }
    return count - left;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id, n = 1) { return this.count(id) >= n; }

  firstEmpty(from = 0, to = this.slots.length) {
    for (let i = from; i < to; i++) if (!this.slots[i]) return i;
    return -1;
  }

  /** True when the whole stack would fit. */
  canFit(stack) {
    if (!stack) return true;
    const limit = stackLimit(stack.id);
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += limit;
      else if (sameItem(s, stack)) room += Math.max(0, limit - s.count);
      if (room >= stack.count) return true;
    }
    return false;
  }

  toJSON() {
    return this.slots.map(s => (s ? [s.id, s.count, s.dmg | 0] : 0));
  }
  static fromJSON(data, name) {
    const c = new Container(data.length, name);
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      c.slots[i] = (d && d !== 0) ? { id: d[0], count: d[1], dmg: d[2] | 0 } : null;
    }
    return c;
  }
}

/** Player inventory: hotbar + main + armour + off-hand, with routing rules. */
export class Inventory extends Container {
  constructor() {
    super(INV_SIZE, 'inventory');
    this.selected = 0;
  }
  get held() { return this.slots[this.selected] || null; }
  get offhand() { return this.slots[OFFHAND] || null; }
  armorSlot(i) { return this.slots[ARMOR_START + i] || null; }

  /** Pick up: hotbar first (matching stacks), then main, then any empty. */
  pickUp(stack) {
    let left = this.add(stack, 0, HOTBAR);
    if (!left) return null;
    left = this.add(left, HOTBAR, HOTBAR + MAIN);
    return left;
  }

  consumeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.version++;
  }

  totalArmor() {
    let def = 0, tough = 0;
    for (let i = 0; i < ARMOR; i++) {
      const s = this.armorSlot(i);
      if (!s) continue;
      const it = item(s.id);
      if (it && it.armor) { def += it.armor.defense; tough += it.armor.toughness; }
    }
    return { defense: def, toughness: tough };
  }
}

/** The 2x2 or 3x3 crafting grid plus its computed result. */
export class CraftingGrid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.slots = new Array(w * h).fill(null);
    this.result = null;
    this.recipe = null;
  }
  clearTo(inv, dropFn) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      const left = inv.pickUp(s);
      if (left && dropFn) dropFn(left);
      this.slots[i] = null;
    }
    this.update();
  }
  update() {
    this.recipe = findRecipe(this.slots, this.w, this.h);
    this.result = this.recipe ? { id: this.recipe.result.id, count: this.recipe.result.count, dmg: 0 } : null;
    return this.result;
  }
  /** Consume one set of ingredients; returns leftovers to hand back. */
  consume() {
    const remainders = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      const rem = CRAFT_REMAINDER.get(s.id);
      s.count--;
      if (s.count <= 0) this.slots[i] = null;
      if (rem) remainders.push({ id: rem, count: 1, dmg: 0 });
    }
    this.update();
    return remainders;
  }
  /** How many times the current recipe can be crafted with what is present. */
  maxCrafts() {
    let n = Infinity;
    for (const s of this.slots) if (s) n = Math.min(n, s.count);
    return n === Infinity ? 0 : n;
  }
}

/**
 * Shift-click routing between a container and the player inventory.
 * Returns true when something moved.
 */
export function quickMove(from, fromIndex, to, opts = {}) {
  const s = from.get(fromIndex);
  if (!s) return false;
  const stack = copyStack(s);
  const left = to.add(stack, opts.start || 0, opts.end || to.size);
  const moved = (left ? left.count : 0) !== s.count;
  from.set(fromIndex, left ? { id: s.id, count: left.count, dmg: s.dmg } : null);
  return moved;
}

/** Durability as a 0..1 fraction, or -1 when the item has no durability. */
export function durabilityFraction(stack) {
  if (!stack) return -1;
  const max = maxDurability(stack.id);
  if (!max) return -1;
  return 1 - (stack.dmg || 0) / max;
}
