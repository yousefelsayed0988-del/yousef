// Villager trades.
//
// Data only: each profession owns a list of offers, and an offer is
// "give these, get that, this many times". Emeralds are the currency, so
// villagers give the player a use for surplus crops and ore and a source of
// gear that would otherwise need deep mining.

import { hasItem, itemId } from '../core/items.js';

const T = (give, get, maxUses = 12) => ({ give, get, maxUses });
const I = (name, count = 1) => ({ name, count });

export const TRADES = {
  farmer: [
    T([I('wheat', 18)], I('emerald', 1)),
    T([I('carrot', 20)], I('emerald', 1)),
    T([I('potato', 20)], I('emerald', 1)),
    T([I('pumpkin', 6)], I('emerald', 1)),
    T([I('emerald', 1)], I('bread', 5)),
    T([I('emerald', 1)], I('apple', 4)),
    T([I('emerald', 3)], I('pumpkin_pie', 3)),
  ],
  librarian: [
    T([I('paper', 24)], I('emerald', 1)),
    T([I('book', 4)], I('emerald', 1)),
    T([I('emerald', 1)], I('book', 2)),
    T([I('emerald', 4)], I('bookshelf', 1)),
    T([I('emerald', 2)], I('glass', 6)),
  ],
  blacksmith: [
    T([I('coal', 15)], I('emerald', 1)),
    T([I('iron_ingot', 4)], I('emerald', 1)),
    T([I('emerald', 4)], I('iron_pickaxe', 1), 4),
    T([I('emerald', 5)], I('iron_sword', 1), 4),
    T([I('emerald', 7)], I('iron_chestplate', 1), 3),
    T([I('emerald', 5)], I('iron_leggings', 1), 3),
    T([I('emerald', 12)], I('diamond', 1), 2),
    T([I('emerald', 3)], I('shield', 1), 4),
  ],
  butcher: [
    T([I('beef', 10)], I('emerald', 1)),
    T([I('porkchop', 10)], I('emerald', 1)),
    T([I('chicken', 12)], I('emerald', 1)),
    T([I('emerald', 1)], I('cooked_beef', 3)),
    T([I('emerald', 1)], I('cooked_porkchop', 3)),
  ],
  cleric: [
    T([I('rotten_flesh', 24)], I('emerald', 1)),
    T([I('gold_ingot', 3)], I('emerald', 1)),
    T([I('emerald', 3)], I('lapis_lazuli', 4)),
    T([I('emerald', 2)], I('redstone', 6)),
    T([I('emerald', 4)], I('glowstone_placeholder', 1), 0),
  ],
  cartographer: [
    T([I('paper', 20)], I('emerald', 1)),
    T([I('emerald', 1)], I('torch', 12)),
    T([I('emerald', 2)], I('ladder', 10)),
    T([I('emerald', 6)], I('golden_helmet', 1), 3),
    T([I('emerald', 1)], I('oak_planks', 12)),
  ],
};

/** Resolve names to ids once, dropping any offer referencing a missing item. */
const RESOLVED = {};
for (const [prof, list] of Object.entries(TRADES)) {
  RESOLVED[prof] = list
    .filter(t => t.maxUses > 0 && t.give.every(g => hasItem(g.name)) && hasItem(t.get.name))
    .map((t, i) => ({
      index: i,
      give: t.give.map(g => ({ id: itemId(g.name), count: g.count, name: g.name })),
      get: { id: itemId(t.get.name), count: t.get.count, name: t.get.name },
      maxUses: t.maxUses,
    }));
}

export function tradesFor(profession) {
  return RESOLVED[profession] || RESOLVED.farmer;
}

/** Can the inventory pay for this offer? */
export function canAfford(inv, offer) {
  return offer.give.every(g => inv.count(g.id) >= g.count);
}

/** Execute one trade. Returns true when it went through. */
export function doTrade(inv, mob, offer, dropFn) {
  if (!canAfford(inv, offer)) return false;
  const used = (mob.tradeUses && mob.tradeUses[offer.index]) || 0;
  if (used >= offer.maxUses) return false;
  const out = { id: offer.get.id, count: offer.get.count, dmg: 0 };
  // check the payout fits before taking payment
  if (!inv.canFit(out)) return false;
  for (const g of offer.give) inv.remove(g.id, g.count);
  const left = inv.pickUp(out);
  if (left && dropFn) dropFn(left);
  if (!mob.tradeUses) mob.tradeUses = {};
  mob.tradeUses[offer.index] = used + 1;
  return true;
}

export function usesLeft(mob, offer) {
  const used = (mob.tradeUses && mob.tradeUses[offer.index]) || 0;
  return Math.max(0, offer.maxUses - used);
}
