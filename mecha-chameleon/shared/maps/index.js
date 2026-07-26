// The map roster. Every entry is a module exporting { meta, build() }.
// build() is called lazily and the result cached, so importing this module is
// cheap even though the pack is large.

import * as arcade from './map_arcade.js';
import * as backrooms from './map_backrooms.js';
import * as country from './map_country.js';
import * as egypt from './map_egypt.js';
import * as gallery from './map_gallery.js';
import * as greenhouse from './map_greenhouse.js';
import * as mansion from './map_mansion.js';
import * as museum from './map_museum.js';
import * as osaka from './map_osaka.js';
import * as penguin from './map_penguin.js';
import * as pool from './map_pool.js';
import * as sewer from './map_sewer.js';
import * as subway from './map_subway.js';
import * as sugarland from './map_sugarland.js';
import * as supermarket from './map_supermarket.js';
import * as toyroom from './map_toyroom.js';
import * as viking from './map_viking.js';

const MODULES = [
  arcade, backrooms, country, egypt, gallery, greenhouse, mansion, museum, osaka, penguin, pool, sewer, subway, sugarland, supermarket, toyroom, viking,
];

export const MAP_LIST = MODULES.map((mod) => ({
  id: mod.meta.id,
  name: mod.meta.name,
  theme: mod.meta.theme,
  tagline: mod.meta.tagline,
  difficulty: mod.meta.difficulty ?? 2,
}));

export const MAP_IDS = MAP_LIST.map((m) => m.id);

const cache = new Map();

/** Build (or fetch the cached) full map definition. */
export function getMap(id) {
  if (cache.has(id)) return cache.get(id);
  const mod = MODULES.find((mm) => mm.meta.id === id) || MODULES[0];
  const def = mod.build();
  cache.set(def.id, def);
  return def;
}

export function randomMapId(rng = Math.random) {
  return MAP_IDS[Math.floor(rng() * MAP_IDS.length) % MAP_IDS.length];
}

export { MODULES };
