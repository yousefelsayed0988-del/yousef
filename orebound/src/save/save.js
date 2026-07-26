// Save / load.
//
// Only the *delta* from generated terrain is stored: the seed regenerates the
// world, and per-chunk edit lists replay on top. A freshly explored world costs
// almost nothing; a heavily built one costs proportional to what was built.
//
// Ids are written through a name table, so the block/item registries can be
// reordered between versions without corrupting old saves.
//
// Writes are atomic: the payload goes to a scratch key first, then a single
// IndexedDB transaction promotes it and clears the scratch -- the equivalent of
// write-temp-then-rename. A crash mid-write leaves the previous save intact.

import { Writer, Reader, compress, decompress } from './binary.js';
import { BLOCKS, BLOCK_BY_NAME } from '../core/blocks.js';
import { ITEMS, ITEM_BY_NAME } from '../core/items.js';
import { WORLD, CONFIG } from '../core/config.js';
import { chunkKey, keyToCX, keyToCZ } from '../world/chunk.js';
import { Inventory } from '../items/inventory.js';
import { Mob, ItemEntity, Arrow, FallingBlock, Boat } from '../entities/entities.js';

const MAGIC = 0x4f524542;   // "OREB"
const VERSION = 3;
const DB_NAME = 'orebound';
const STORE = 'saves';

// ------------------------------------------------------------- IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPromoteAndClear(db, from, to, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(value, to);
    store.delete(from);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbKeys(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ================================================================ manager
export class SaveManager {
  constructor(game, slot = 'world1') {
    this.game = game;
    this.slot = slot;
    this.stored = new Map();    // chunkKey -> { diff: Map, entities: [] }
    this.dbPromise = openDB().catch(e => { console.warn('IndexedDB unavailable:', e); return null; });
    this.lastSave = 0;
    this.saving = false;
  }

  get key() { return 'world:' + this.slot; }
  get tmpKey() { return 'world:' + this.slot + ':tmp'; }

  // ------------------------------------------------- chunk hooks
  /** Replay stored edits onto a chunk the generator just produced. */
  applyToChunk(chunk) {
    const rec = this.stored.get(chunk.key);
    if (!rec) return;
    for (const [idx, packed] of rec.diff) {
      const y = WORLD.MIN_Y + (idx >> 8);
      const z = (idx >> 4) & 15;
      const x = idx & 15;
      const id = packed >> 8;
      const state = packed & 255;
      chunk.setBlock(x, y, z, id, state);
      chunk.diff.set(idx, packed);
    }
    chunk.blockEntities.clear();
    for (const be of rec.blockEntities) {
      chunk.setBlockEntity(be.x & 15, be.y, be.z & 15, be);
    }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      chunk.recomputeHeight(x, z, this.game.world.light.opacity);
    }
    chunk.dirtySave = true;
  }

  /** Snapshot a chunk's edits before it leaves memory. */
  captureChunk(chunk) {
    if (chunk.diff.size === 0 && chunk.blockEntities.size === 0) {
      this.stored.delete(chunk.key);
      return;
    }
    this.stored.set(chunk.key, {
      diff: new Map(chunk.diff),
      blockEntities: [...chunk.blockEntities.values()].map(cloneBE),
    });
  }

  captureAllLoaded() {
    for (const chunk of this.game.world.chunks.values()) this.captureChunk(chunk);
  }

  // ------------------------------------------------- serialisation
  serialize() {
    const game = this.game;
    const world = game.world;
    const player = game.player;
    this.captureAllLoaded();

    const w = new Writer(1 << 18);
    w.u32w(MAGIC);
    w.u16w(VERSION);
    w.i32w(world.seed);
    w.f64w(world.time);
    w.strw(CONFIG.difficulty);
    w.boolw(CONFIG.keepInventory);
    w.strw(world.weather.type);
    w.f32w(world.weather.intensity);
    w.i32w(world.weather.ticks);

    // --- name tables so ids survive registry reordering
    w.u16w(BLOCKS.length);
    for (const b of BLOCKS) w.strw(b.name);
    w.u16w(ITEMS.length);
    for (const it of ITEMS) w.strw(it.name);

    // --- player
    w.f64w(player.x); w.f64w(player.y); w.f64w(player.z);
    w.f32w(player.yaw); w.f32w(player.pitch);
    w.f32w(player.health); w.f32w(player.hunger); w.f32w(player.saturation);
    w.f32w(player.exhaustion); w.f32w(player.air);
    w.u8w(player.inventory.selected);
    writeContainer(w, player.inventory.slots);
    w.f64w(player.spawn.x); w.f64w(player.spawn.y); w.f64w(player.spawn.z);
    w.boolw(!!player.bedSpawn);
    if (player.bedSpawn) { w.f64w(player.bedSpawn.x); w.f64w(player.bedSpawn.y); w.f64w(player.bedSpawn.z); }

    // --- chunk deltas
    w.u32w(this.stored.size);
    for (const [key, rec] of this.stored) {
      w.i32w(keyToCX(key));
      w.i32w(keyToCZ(key));
      w.varw(rec.diff.size);
      for (const [idx, packed] of rec.diff) {
        w.varw(idx);
        w.u16w(packed >> 8);
        w.u8w(packed & 255);
      }
      w.varw(rec.blockEntities.length);
      for (const be of rec.blockEntities) writeBlockEntity(w, be);
    }

    // --- entities (only those currently resident)
    // falling blocks and primed TNT are mid-flight state, not world content
    const savable = world.entities.filter(e => !e.dead && e.type !== 'falling_block' && e.type !== 'tnt');
    w.u32w(savable.length);
    for (const e of savable) writeEntity(w, e);

    return w.bytes();
  }

  async save() {
    if (this.saving) return false;
    this.saving = true;
    try {
      const db = await this.dbPromise;
      if (!db) return false;
      const raw = this.serialize();
      const { data, compressed } = await compress(raw);
      const record = {
        version: VERSION, compressed, data,
        seed: this.game.world.seed,
        time: this.game.world.time,
        savedAt: Date.now(),
        rawSize: raw.byteLength,
        name: this.slot,
      };
      // temp-then-promote, so an interrupted write cannot destroy the old save
      await idbPut(db, this.tmpKey, record);
      await idbPromoteAndClear(db, this.tmpKey, this.key, record);
      this.lastSave = performance.now();
      return true;
    } catch (e) {
      console.error('save failed', e);
      return false;
    } finally {
      this.saving = false;
    }
  }

  async loadRecord() {
    const db = await this.dbPromise;
    if (!db) return null;
    return (await idbGet(db, this.key)) || null;
  }

  async listSaves() {
    const db = await this.dbPromise;
    if (!db) return [];
    const keys = await idbKeys(db);
    const out = [];
    for (const k of keys) {
      if (typeof k !== 'string' || !k.startsWith('world:') || k.endsWith(':tmp')) continue;
      const rec = await idbGet(db, k);
      if (rec) out.push({ key: k, slot: k.slice(6), seed: rec.seed, time: rec.time, savedAt: rec.savedAt, size: rec.data.byteLength });
    }
    out.sort((a, b) => b.savedAt - a.savedAt);
    return out;
  }

  async deleteSave(slot) {
    const db = await this.dbPromise;
    if (!db) return;
    await idbDelete(db, 'world:' + slot);
  }

  /** Parse a save record into a plain object; does not touch live state. */
  async parse(record) {
    const bytes = await decompress(record.data, record.compressed);
    const r = new Reader(bytes);
    if (r.u32r() !== MAGIC) throw new Error('not an Orebound save');
    const version = r.u16r();
    if (version > VERSION) throw new Error('save was written by a newer version');
    const out = { version };
    out.seed = r.i32r();
    out.time = r.f64r();
    out.difficulty = r.strr();
    out.keepInventory = r.boolr();
    out.weather = { type: r.strr(), intensity: r.f32r(), ticks: r.i32r() };

    const blockCount = r.u16r();
    const blockNames = new Array(blockCount);
    for (let i = 0; i < blockCount; i++) blockNames[i] = r.strr();
    const itemCount = r.u16r();
    const itemNames = new Array(itemCount);
    for (let i = 0; i < itemCount; i++) itemNames[i] = r.strr();

    const blockMap = new Uint16Array(blockCount);
    for (let i = 0; i < blockCount; i++) {
      const b = BLOCK_BY_NAME.get(blockNames[i]);
      blockMap[i] = b ? b.id : 0;
    }
    const itemMap = new Uint16Array(itemCount + 1);
    for (let i = 0; i < itemCount; i++) {
      const it = ITEM_BY_NAME.get(itemNames[i]);
      itemMap[i + 1] = it ? it.id : 0;
    }
    const mapItem = id => (id > 0 && id <= itemCount ? itemMap[id] : 0);

    out.player = {
      x: r.f64r(), y: r.f64r(), z: r.f64r(),
      yaw: r.f32r(), pitch: r.f32r(),
      health: r.f32r(), hunger: r.f32r(), saturation: r.f32r(),
      exhaustion: r.f32r(), air: r.f32r(),
      selected: r.u8r(),
      slots: readContainer(r, mapItem),
    };
    out.player.spawn = { x: r.f64r(), y: r.f64r(), z: r.f64r() };
    out.player.bedSpawn = r.boolr() ? { x: r.f64r(), y: r.f64r(), z: r.f64r() } : null;

    const chunkCount = r.u32r();
    out.chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      const cx = r.i32r(), cz = r.i32r();
      const n = r.varr();
      const diff = new Map();
      for (let k = 0; k < n; k++) {
        const idx = r.varr();
        const rawId = r.u16r();
        const state = r.u8r();
        const id = rawId < blockCount ? blockMap[rawId] : 0;
        diff.set(idx, (id << 8) | state);
      }
      const beCount = r.varr();
      const blockEntities = [];
      for (let k = 0; k < beCount; k++) blockEntities.push(readBlockEntity(r, mapItem));
      out.chunks.push({ cx, cz, diff, blockEntities });
    }

    const entCount = r.u32r();
    out.entities = [];
    for (let i = 0; i < entCount; i++) out.entities.push(readEntity(r, mapItem));
    return out;
  }

  /** Apply a parsed save onto a freshly constructed game. */
  restore(parsed) {
    const game = this.game;
    const world = game.world;
    const player = game.player;

    world.time = parsed.time;
    world.weather.type = parsed.weather.type;
    world.weather.intensity = parsed.weather.intensity;
    world.weather.target = parsed.weather.type === 'clear' ? 0 : 1;
    world.weather.ticks = parsed.weather.ticks;
    CONFIG.difficulty = parsed.difficulty || CONFIG.difficulty;
    CONFIG.keepInventory = parsed.keepInventory;

    this.stored.clear();
    for (const c of parsed.chunks) {
      this.stored.set(chunkKey(c.cx, c.cz), { diff: c.diff, blockEntities: c.blockEntities });
    }

    const p = parsed.player;
    player.x = p.x; player.y = p.y; player.z = p.z;
    player.px = p.x; player.py = p.y; player.pz = p.z;
    player.yaw = p.yaw; player.pitch = p.pitch;
    player.health = p.health; player.hunger = p.hunger; player.saturation = p.saturation;
    player.exhaustion = p.exhaustion; player.air = p.air;
    player.inventory.selected = p.selected;
    for (let i = 0; i < player.inventory.size; i++) player.inventory.set(i, p.slots[i] || null);
    player.spawn = p.spawn;
    player.bedSpawn = p.bedSpawn;

    world.entities.length = 0;
    for (const e of parsed.entities) {
      const ent = buildEntity(world, e);
      if (ent) world.entities.push(ent);
    }
  }
}

// ------------------------------------------------------------ helpers
function cloneBE(be) {
  const c = { x: be.x, y: be.y, z: be.z, type: be.type };
  if (be.items) c.items = be.items.map(s => (s ? { ...s } : null));
  if (be.type === 'furnace') {
    c.input = be.input ? { ...be.input } : null;
    c.fuel = be.fuel ? { ...be.fuel } : null;
    c.output = be.output ? { ...be.output } : null;
    c.cook = be.cook || 0; c.burn = be.burn || 0; c.burnMax = be.burnMax || 0;
  }
  if (be.type === 'spawner') { c.mob = be.mob; c.delay = be.delay; }
  if (be.type === 'sign') c.lines = (be.lines || []).slice();
  return c;
}

function writeStack(w, s) {
  if (!s || !s.id || s.count <= 0) { w.u16w(0); return; }
  w.u16w(s.id);
  w.u16w(s.count);
  w.u16w(s.dmg | 0);
}
function readStack(r, mapItem) {
  const id = r.u16r();
  if (id === 0) return null;
  const count = r.u16r();
  const dmg = r.u16r();
  const mapped = mapItem(id);
  return mapped ? { id: mapped, count, dmg } : null;
}
function writeContainer(w, slots) {
  w.u16w(slots.length);
  for (const s of slots) writeStack(w, s);
}
function readContainer(r, mapItem) {
  const n = r.u16r();
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = readStack(r, mapItem);
  return out;
}

const BE_TYPES = ['chest', 'furnace', 'sign', 'spawner'];
function writeBlockEntity(w, be) {
  w.i32w(be.x); w.i32w(be.y); w.i32w(be.z);
  w.u8w(Math.max(0, BE_TYPES.indexOf(be.type)));
  switch (be.type) {
    case 'chest': writeContainer(w, be.items || new Array(27).fill(null)); break;
    case 'furnace':
      writeStack(w, be.input); writeStack(w, be.fuel); writeStack(w, be.output);
      w.u16w(be.cook | 0); w.u16w(be.burn | 0); w.u16w(be.burnMax | 0);
      break;
    case 'sign': {
      const lines = be.lines || [];
      w.u8w(lines.length);
      for (const l of lines) w.strw(l);
      break;
    }
    case 'spawner': w.strw(be.mob || 'zombie'); w.u16w(be.delay | 0); break;
    default: break;
  }
}
function readBlockEntity(r, mapItem) {
  const x = r.i32r(), y = r.i32r(), z = r.i32r();
  const type = BE_TYPES[r.u8r()] || 'chest';
  const be = { x, y, z, type };
  switch (type) {
    case 'chest': be.items = readContainer(r, mapItem); break;
    case 'furnace':
      be.input = readStack(r, mapItem); be.fuel = readStack(r, mapItem); be.output = readStack(r, mapItem);
      be.cook = r.u16r(); be.burn = r.u16r(); be.burnMax = r.u16r();
      break;
    case 'sign': {
      const n = r.u8r();
      be.lines = [];
      for (let i = 0; i < n; i++) be.lines.push(r.strr());
      break;
    }
    case 'spawner': be.mob = r.strr(); be.delay = r.u16r(); break;
    default: break;
  }
  return be;
}

function writeEntity(w, e) {
  w.strw(e.type);
  w.f64w(e.x); w.f64w(e.y); w.f64w(e.z);
  w.f32w(e.vx); w.f32w(e.vy); w.f32w(e.vz);
  w.f32w(e.yaw);
  w.f32w(e.health);
  w.u32w(e.age);
  if (e.type === 'item') { writeStack(w, e.stack); w.u16w(e.pickupDelay | 0); }
  else if (e.type === 'arrow') { w.f32w(e.damageAmount); w.boolw(e.stuck); }
  else if (e.type === 'boat') { w.strw(e.wood || 'oak'); }
  else {
    w.boolw(!!e.baby); w.boolw(!!e.sheared); w.u8w(e.woolColor | 0);
    w.u16w(e.loveTimer | 0); w.boolw(!!e.persistent);
  }
}

function readEntity(r, mapItem) {
  const e = { type: r.strr() };
  e.x = r.f64r(); e.y = r.f64r(); e.z = r.f64r();
  e.vx = r.f32r(); e.vy = r.f32r(); e.vz = r.f32r();
  e.yaw = r.f32r();
  e.health = r.f32r();
  e.age = r.u32r();
  if (e.type === 'item') { e.stack = readStack(r, mapItem); e.pickupDelay = r.u16r(); }
  else if (e.type === 'arrow') { e.damageAmount = r.f32r(); e.stuck = r.boolr(); }
  else if (e.type === 'boat') { e.wood = r.strr(); }
  else {
    e.baby = r.boolr(); e.sheared = r.boolr(); e.woolColor = r.u8r();
    e.loveTimer = r.u16r(); e.persistent = r.boolr();
  }
  return e;
}

function buildEntity(world, e) {
  if (e.type === 'item') {
    if (!e.stack) return null;
    const ent = new ItemEntity(world, e.x, e.y, e.z, e.stack, e.pickupDelay);
    ent.age = e.age;
    ent.vx = e.vx; ent.vy = e.vy; ent.vz = e.vz;
    return ent;
  }
  if (e.type === 'arrow') {
    const ent = new Arrow(world, e.x, e.y, e.z, 0, 0, 1, 0, null);
    ent.vx = e.vx; ent.vy = e.vy; ent.vz = e.vz;
    ent.yaw = e.yaw; ent.stuck = e.stuck; ent.damageAmount = e.damageAmount; ent.age = e.age;
    return ent;
  }
  if (e.type === 'boat') {
    const b = new Boat(world, e.x, e.y, e.z, e.wood);
    b.vx = e.vx; b.vy = e.vy; b.vz = e.vz; b.yaw = e.yaw; b.health = e.health;
    return b;
  }
  const mob = new Mob(world, e.type, e.x, e.y, e.z);
  if (!mob.def) return null;
  mob.vx = e.vx; mob.vy = e.vy; mob.vz = e.vz;
  mob.yaw = e.yaw;
  mob.health = Math.min(e.health, mob.maxHealth);
  mob.baby = e.baby; mob.sheared = e.sheared; mob.woolColor = e.woolColor;
  mob.loveTimer = e.loveTimer; mob.persistent = e.persistent;
  if (mob.baby) { mob.width *= 0.55; mob.height *= 0.55; }
  return mob;
}
