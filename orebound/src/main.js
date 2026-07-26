// Game entry point: boot, the fixed-step simulation loop, and the render loop.
//
// Simulation runs at a fixed 20 ticks/second and rendering interpolates between
// the last two ticks, so physics is frame-rate independent and deterministic
// while the camera stays smooth at any refresh rate.

import { CONFIG, WORLD, TICK_MS, TPS, difficulty, saveSettings } from './core/config.js';
import { BLOCKS, blockId, AIR, blockByName } from './core/blocks.js';
import { ITEMS, item, itemByName } from './core/items.js';
import { parseSeed, Random } from './core/rng.js';
import { buildAtlas, buildMeshTables, itemIconURL } from './render/textures.js';
import { averageTileColor, drawMob, drawItemEntity, drawArrow, drawFallingBlock, drawBoat, drawTNT } from './render/entitymodels.js';
import { Renderer } from './render/renderer.js';
import { ViewModel } from './render/viewmodel.js';
import { World } from './world/world.js';
import { FluidSim } from './world/fluids.js';
import { RandomTicker } from './world/randomtick.js';
import { Player, PW, PH } from './player/player.js';
import { Controls } from './player/controls.js';
import { selectionBoxes, raycast, setBoxAt } from './player/physics.js';
import { Entity, ItemEntity, FallingBlock, Arrow, Mob, Boat, PrimedTNT } from './entities/entities.js';
import { MobSpawner, tickSpawnerBlocks } from './entities/spawn.js';
import { GameUI } from './ui/ui.js';
import { Audio } from './audio/audio.js';
import { SaveManager } from './save/save.js';
import { mkStack } from './items/inventory.js';
import { smeltResult, fuelTicks } from './core/recipes.js';
import { mixColor } from './world/biomes.js';
import { blockDrops } from './core/loot.js';

const CHEST = blockId('chest');
const FURNACE = blockId('furnace');

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.renderer = new Renderer(this.canvas);
    this.atlas = buildAtlas();
    this.renderer.uploadAtlas(this.atlas);
    this.meshTables = buildMeshTables(this.atlas);

    this.audio = new Audio();
    this.ui = new GameUI(this, document.getElementById('ui'));
    this.save = new SaveManager(this, 'world1');
    this.controls = null;

    this.started = false;
    this.paused = false;
    this.debugVisible = false;
    this.particles = [];
    this.accum = 0;
    this.lastFrame = performance.now();
    this.fps = 60;
    this.frameTimes = [];
    this.perf = { frame: 0, tick: 0, world: 0, render: 0 };
    this.camPos = [0, 0, 0];
    this.itemColors = new Map();
    this._precomputeItemColors();
    this.viewModel = new ViewModel(this);

    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    window.addEventListener('beforeunload', () => {
      if (this.started) { try { this.save.serialize(); } catch { } }
    });
  }

  _precomputeItemColors() {
    for (const it of ITEMS) {
      if (it.block == null) continue;
      const b = BLOCKS[it.block];
      const key = (b.tex && (b.tex.top || b.tex.all || b.tex.side)) || null;
      const tile = key ? this.atlas.tiles.get(key) : null;
      let c = averageTileColor(tile);
      if (b.tint === 'grass') c = mixColor(c, 0x79c05a, 0.75);
      if (b.tint === 'foliage') c = mixColor(c, 0x59ae30, 0.75);
      this.itemColors.set(it.id, c);
    }
  }

  itemColor(id) {
    if (this.itemColors.has(id)) return this.itemColors.get(id);
    const it = item(id);
    if (!it) return 0xcccccc;
    // stable pseudo-colour for non-block items so drops are still readable
    let h = 0;
    for (let i = 0; i < it.name.length; i++) h = (h * 31 + it.name.charCodeAt(i)) | 0;
    const c = 0x808080 | ((h & 0x3f3f3f) ^ 0x404040);
    this.itemColors.set(id, c);
    return c;
  }

  // =============================================================== lifecycle
  async boot() {
    document.getElementById('boot').remove();
    await this.showMainMenu();
  }

  async showMainMenu() {
    this.started = false;
    let saves = [];
    try { saves = await this.save.listSaves(); } catch { }
    this.ui.openMainMenu(saves);
  }

  async startNewWorld(seedText) {
    const seed = parseSeed(seedText);
    this.ui.openLoading('Generating world...');
    await this._createWorld(seed);
    // start shortly after sunrise so a new world opens in daylight
    this.world.time = Math.round(CONFIG.dayLengthTicks * 0.06);
    const spawn = this.world.gen.findSpawn();
    this.player.x = spawn.x; this.player.y = spawn.y + 1; this.player.z = spawn.z;
    this.player.px = this.player.x; this.player.py = this.player.y; this.player.pz = this.player.z;
    this.player.spawn = { x: spawn.x, y: spawn.y + 1, z: spawn.z };
    await this._waitForSpawnChunks();
    this._finishStart();
  }

  async startFromSave(slot) {
    this.ui.openLoading('Loading world...');
    this.save.slot = slot;
    let record = null, parsed = null;
    try {
      record = await this.save.loadRecord();
      if (record) parsed = await this.save.parse(record);
    } catch (e) {
      console.error(e);
      this.ui.toast('That save could not be read: ' + e.message);
      return this.showMainMenu();
    }
    if (!parsed) return this.startNewWorld('');
    await this._createWorld(parsed.seed);
    this.save.restore(parsed);
    await this._waitForSpawnChunks();
    this._finishStart();
  }

  async _createWorld(seed) {
    if (this.world) this.world.dispose();
    this.world = new World(seed, {
      renderer: this.renderer,
      onChunkReady: (c) => this.save.applyToChunk(c),
      onChunkUnload: (c) => this.save.captureChunk(c),
    });
    this.world.game = this;
    this.world.setMeshTables(this.meshTables);
    this.world.onFallingBlock = (x, y, z, id, state) => {
      this.world.setBlock(x, y, z, AIR);
      this.world.entities.push(new FallingBlock(this.world, x, y, z, id, state));
    };
    this.world.onBreakNaturally = (x, y, z) => this.breakNaturally(x, y, z);
    this.world.onFluidWash = (x, y, z) => this.breakNaturally(x, y, z);
    this.world.onFluidSolidify = () => this.audio.play('splash');

    this.fluids = new FluidSim(this.world);
    this.ticker = new RandomTicker(this.world);
    this.spawner = new MobSpawner(this.world);
    this.player = new Player(this.world, this);
    this.rng = new Random(seed ^ 0x51f3);
    if (!this.controls) this.controls = new Controls(this, this.canvas);
    this.particles.length = 0;
  }

  async _waitForSpawnChunks() {
    const px = this.player.x, pz = this.player.z;
    const need = 3;
    const total = (need * 2 + 1) ** 2;
    for (let attempt = 0; attempt < 2400; attempt++) {
      this.world.update(px, pz, 0.05);
      let ready = 0;
      for (let dz = -need; dz <= need; dz++) {
        for (let dx = -need; dx <= need; dx++) {
          if (this.world.isLoaded((Math.floor(px) >> 4) + dx, (Math.floor(pz) >> 4) + dz)) ready++;
        }
      }
      this.ui.setLoading(ready / total, `Generating world... ${Math.round(ready / total * 100)}%`);
      if (ready >= total) break;
      await new Promise(r => setTimeout(r, 8));
    }
    // drop the player onto the surface in case the terrain differs from the estimate
    const top = this.world.topSolid(Math.floor(this.player.x), Math.floor(this.player.z));
    if (top > WORLD.MIN_Y) {
      this.player.y = Math.max(this.player.y, top + 1);
      this.player.py = this.player.y;
    }
    this.ui.setLoading(1, 'Entering world...');
    await new Promise(r => setTimeout(r, 60));
  }

  _finishStart() {
    this.started = true;
    this.ui.close();
    this.audio.resume();
    this.lastFrame = performance.now();
    this.accum = 0;
    if (!this._looping) { this._looping = true; requestAnimationFrame(() => this.frame()); }
    this.controls.requestLock();
    this.ui.toast('Left click to mine, right click to place. Press E for inventory, F3 for debug.', 6000);
  }

  quitToMenu() {
    this.started = false;
    document.exitPointerLock();
    this.showMainMenu();
  }

  // ================================================================== loop
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.25) dt = 0.25;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > 40) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = 1 / Math.max(1e-6, avg);

    if (!this.started) return;

    // Main-thread cost breakdown. Chunk generation and meshing happen on
    // workers, so what matters here is how much of the frame *this* thread
    // spends -- that is the number a GPU upgrade will not fix.
    const tFrame = performance.now();
    const simulating = !this.ui.isOpen || this.ui.screen === 'chest' || this.ui.screen === 'furnace';
    if (simulating) {
      this.accum += dt * 1000;
      let steps = 0;
      const t0 = performance.now();
      while (this.accum >= TICK_MS && steps < 6) {
        this.accum -= TICK_MS;
        this.tick();
        steps++;
      }
      this.perf.tick = this.perf.tick * 0.9 + (performance.now() - t0) * 0.1;
      if (steps === 6) this.accum = 0;
    } else {
      this.accum = 0;
    }

    const alpha = Math.min(1, this.accum / TICK_MS);
    const tWorld = performance.now();
    this.world.update(this.player.x, this.player.z, dt);
    this.perf.world = this.perf.world * 0.9 + (performance.now() - tWorld) * 0.1;
    const tRender = performance.now();
    this.render(alpha, dt);
    this.perf.render = this.perf.render * 0.9 + (performance.now() - tRender) * 0.1;
    this.perf.frame = this.perf.frame * 0.9 + (performance.now() - tFrame) * 0.1;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.2);
    if (this.ui.isOpen) this.ui.refresh();
    this.ui.updateHUD();
    if (this.debugVisible) this.ui.updateDebug(this.debugText());
    this.audio.tickMusic(dt, this.world.isNight());
  }

  tick() {
    const w = this.world;
    const p = this.player;
    w.time++;

    this.controls._syncState();
    const input = this.controls.state;
    p.tick(input);
    p.tickEating(input);
    if (p.bowCharge >= 0) p.bowCharge++;
    p.shieldRaised = input.use && !!p.findShield() && !p.eating;

    this.tickEntities();
    this.fluids.tick();
    this.ticker.tick(p.x, p.z);
    this.tickFurnaces();
    this.tickWeather();
    this.spawner.tick(p);
    if (w.time % 4 === 0) tickSpawnerBlocks(w, p);
    this.tickParticles();

    if (this.save.lastSave === 0) this.save.lastSave = performance.now();
    if (performance.now() - this.save.lastSave > CONFIG.autosaveMinutes * 60000) {
      this.save.lastSave = performance.now();
      this.save.save().then(ok => { if (ok) this.ui.toast('Autosaved'); });
    }
  }

  tickEntities() {
    const w = this.world;
    const p = this.player;
    const list = w.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const sim = CONFIG.simulationDistance * 16;
      if (dx * dx + dz * dz > sim * sim * 1.6 && e.type !== 'item') continue;
      e.tick();

      if (e.type === 'item' && !e.dead && e.pickupDelay <= 0) {
        const dy = e.y - (p.y + 0.9);
        if (dx * dx + dy * dy + dz * dz < 2.0) {
          const left = p.inventory.pickUp(e.stack);
          if (!left) { e.remove(); this.audio.play('pickup'); }
          else if (left.count !== e.stack.count) { e.stack = left; this.audio.play('pickup'); }
        }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  }

  tickFurnaces() {
    const w = this.world;
    const p = this.player;
    const r = CONFIG.simulationDistance;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const c = w.getChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const be of c.blockEntities.values()) {
          if (be.type !== 'furnace') continue;
          this.tickFurnace(be);
        }
      }
    }
  }

  tickFurnace(be) {
    const w = this.world;
    let changed = false;
    const recipe = be.input ? smeltResult(be.input.id) : null;
    const canOutput = recipe && (!be.output ||
      (be.output.id === recipe.id && be.output.count + recipe.count <= item(recipe.id).stack));

    if (be.burn > 0) { be.burn--; changed = true; }

    if (be.burn <= 0 && canOutput && be.fuel) {
      const ticks = fuelTicks(be.fuel.id);
      if (ticks > 0) {
        be.burn = ticks; be.burnMax = ticks;
        const wasBucket = item(be.fuel.id).name === 'lava_bucket';
        be.fuel.count--;
        if (be.fuel.count <= 0) be.fuel = wasBucket ? mkStack(itemByName('bucket').id, 1) : null;
        changed = true;
      }
    }

    be.cookTotal = recipe ? recipe.ticks : 200;
    if (be.burn > 0 && canOutput) {
      be.cook++;
      if (be.cook >= be.cookTotal) {
        be.cook = 0;
        if (be.output) be.output.count += recipe.count;
        else be.output = mkStack(recipe.id, recipe.count);
        be.input.count--;
        if (be.input.count <= 0) be.input = null;
      }
      changed = true;
    } else if (be.cook > 0) {
      be.cook = Math.max(0, be.cook - 2);
      changed = true;
    }

    // keep the lit block state in sync so the furnace front glows
    const lit = be.burn > 0;
    const state = w.getState(be.x, be.y, be.z);
    if (((state & 4) !== 0) !== lit) w.setState(be.x, be.y, be.z, lit ? (state | 4) : (state & ~4));
    if (changed) {
      const c = w.getChunk(be.x >> 4, be.z >> 4);
      if (c) c.dirtySave = true;
    }
  }

  tickWeather() {
    const w = this.world;
    const wx = w.weather;
    wx.ticks--;
    if (wx.ticks <= 0) {
      const biome = w.biomeAt(Math.floor(this.player.x), Math.floor(this.player.z));
      const wantRain = this.rng.float() < (0.28 + biome.rainBias * 0.25);
      if (wx.type === 'clear' && wantRain) {
        wx.type = this.rng.chance(0.25) ? 'thunder' : 'rain';
        wx.target = 1;
        wx.ticks = 3000 + this.rng.int(9000);
      } else {
        wx.type = 'clear';
        wx.target = 0;
        wx.ticks = 6000 + this.rng.int(24000);
      }
    }
    wx.intensity += (wx.target - wx.intensity) * 0.004;
    if (wx.intensity < 0.002) wx.intensity = 0;
    this.audio.setRain(wx.type === 'clear' ? 0 : wx.intensity);
    if (wx.type === 'thunder' && wx.intensity > 0.5 && this.rng.float() < 0.0012) {
      this.audio.play('thunder');
      this.lightningFlash = 6;
    }
    if (this.lightningFlash > 0) this.lightningFlash--;

    // snow accumulation and rain extinguishing fires
    if (wx.intensity > 0.4 && w.time % 20 === 0) this.ticker.snowfall(this.player.x, this.player.z, this.rng);
  }

  tickParticles() {
    const w = this.world;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life--;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.vy -= 0.04;
      pt.x += pt.vx; pt.y += pt.vy; pt.z += pt.vz;
      pt.vx *= 0.92; pt.vz *= 0.92;
      const bx = Math.floor(pt.x), by = Math.floor(pt.y), bz = Math.floor(pt.z);
      if (BLOCKS[w.getBlock(bx, by, bz)].solid && BLOCKS[w.getBlock(bx, by, bz)].cube) {
        pt.vy = 0; pt.y = by + 1.001; pt.vx *= 0.6; pt.vz *= 0.6;
      }
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  // ============================================================== callbacks
  onUIOpen() { document.exitPointerLock(); }
  onUIClose() { if (this.started && !this.player.dead) this.controls.requestLock(); }
  get uiOpen() { return this.ui.isOpen; }

  onAttackPressed() {
    if (this.ui.isOpen || this.player.dead) return;
    const p = this.player;
    // entity attack takes priority over block breaking when one is in the way
    const hit = this.pickEntity(CONFIG.reach);
    if (hit) { p.attackEntity(hit); return; }
    p.swingTime = 6;
  }

  onUsePressed() {
    if (this.ui.isOpen || this.player.dead) return;
    const p = this.player;
    const ent = this.pickEntity(CONFIG.reach);
    if (ent instanceof Boat) { if (!p.riding) ent.mount(p); return; }
    if (ent && ent instanceof Mob && ent.interact(p)) return;
    const t = p.target();
    p.use(t);
  }

  onUseReleased() {
    const p = this.player;
    if (p.bowCharge >= 0) p.releaseBow();
    p.shieldRaised = false;
    p.eating = 0;
  }

  pickEntity(maxDist) {
    const p = this.player;
    const [dx, dy, dz] = p.lookVector();
    const ox = p.x, oy = p.eyeY, oz = p.z;
    let best = null, bestT = maxDist;
    for (const e of this.world.entities) {
      if (e.dead || e.type === 'item' || e.type === 'arrow' || e.type === 'falling_block') continue;
      const b = e.boundingBox();
      const t = rayAABB(ox, oy, oz, dx, dy, dz, b.x0 - 0.1, b.y0 - 0.1, b.z0 - 0.1, b.x1 + 0.1, b.y1 + 0.1, b.z1 + 0.1);
      if (t !== null && t < bestT) { bestT = t; best = e; }
    }
    if (!best) return null;
    // a block in front of the entity blocks the swing
    const blockHit = raycast(this.world, ox, oy, oz, dx, dy, dz, bestT);
    if (blockHit) return null;
    return best;
  }

  onMiningStop() { }

  onBlockBroken(x, y, z, def, drops) {
    this.audio.break(def);
    const color = this.blockParticleColor(def);
    // a dense core burst plus a slower outward puff reads as the block
    // shattering rather than as a single symmetric pop
    this.spawnParticles(x + 0.5, y + 0.5, z + 0.5, 26, color,
      { spread: 0.85, speed: 0.15, life: 16, size: 0.05 });
    this.spawnParticles(x + 0.5, y + 0.5, z + 0.5, 12, mixColor(color, 0x000000, 0.35),
      { spread: 1.0, speed: 0.06, life: 26, size: 0.028 });
    this.shake = Math.min(0.8, (this.shake || 0) + 0.28);
    for (const d of drops) {
      this.dropItemAt(x + 0.5, y + 0.25, z + 0.5, mkStack(d.id, d.count), false);
    }
  }

  breakNaturally(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (id === AIR) return;
    const def = BLOCKS[id];
    const state = w.getState(x, y, z);
    const drops = defaultDrops(def, state, this.rng);
    w.setBlock(x, y, z, AIR);
    this.audio.break(def);
    for (const d of drops) this.dropItemAt(x + 0.5, y + 0.3, z + 0.5, mkStack(d.id, d.count), false);
  }

  dropItemAt(x, y, z, stack, scatter) {
    if (!stack || stack.count <= 0) return;
    const e = new ItemEntity(this.world, x, y, z, { ...stack }, scatter ? 40 : 10);
    const s = scatter ? 0.22 : 0.08;
    e.vx = (Math.random() - 0.5) * s;
    e.vz = (Math.random() - 0.5) * s;
    e.vy = 0.14 + Math.random() * 0.06;
    this.world.entities.push(e);
  }

  dropItemFromPlayer(stack) {
    const p = this.player;
    const [dx, dy, dz] = p.lookVector();
    const e = new ItemEntity(this.world, p.x + dx * 0.4, p.eyeY - 0.3, p.z + dz * 0.4, { ...stack }, 40);
    e.vx = dx * 0.3; e.vy = dy * 0.3 + 0.1; e.vz = dz * 0.3;
    this.world.entities.push(e);
  }

  dropHeld(all) {
    const p = this.player;
    const s = p.held;
    if (!s) return;
    if (all || s.count === 1) {
      this.dropItemFromPlayer(s);
      p.inventory.set(p.inventory.selected, null);
    } else {
      this.dropItemFromPlayer(mkStack(s.id, 1, s.dmg));
      p.inventory.consumeHeld(1);
    }
  }

  spawnBoat(x, y, z, wood) {
    this.world.entities.push(new Boat(this.world, x, y, z, wood));
  }

  primeTNT(x, y, z, fuse = 80) {
    this.world.entities.push(new PrimedTNT(this.world, x, y, z, fuse));
  }

  spawnArrow(x, y, z, dx, dy, dz, speed, owner) {
    this.world.entities.push(new Arrow(this.world, x, y, z, dx, dy, dz, speed, owner));
  }

  spawnParticles(x, y, z, n, color, opts = {}) {
    const spread = opts.spread ?? 0.7;
    const speed = opts.speed ?? 0.11;
    const dir = opts.dir;
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * speed;
      let vy = Math.random() * speed * 1.3;
      let vz = (Math.random() - 0.5) * speed;
      if (dir) {
        // bias the spray out along the struck face
        vx += dir[0] * speed * (0.8 + Math.random());
        vy += dir[1] * speed * (0.8 + Math.random());
        vz += dir[2] * speed * (0.8 + Math.random());
      }
      this.particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: z + (Math.random() - 0.5) * spread,
        vx, vy, vz,
        life: (opts.life ?? 18) + Math.floor(Math.random() * 22),
        size: (opts.size ?? 0.045) + Math.random() * 0.045,
        color,
      });
    }
  }

  /** Colour to spray when a given block is struck. */
  blockParticleColor(def) {
    const key = (def.tex && (def.tex.side || def.tex.all || def.tex.top)) || null;
    let c = averageTileColor(key ? this.atlas.tiles.get(key) : null);
    if (def.tint === 'grass') c = mixColor(c, 0x79c05a, 0.7);
    if (def.tint === 'foliage') c = mixColor(c, 0x59ae30, 0.7);
    return c;
  }

  /**
   * Called on every crack stage. Chips fly off the struck face, the crosshair
   * pulses, and the camera picks up a small kick -- the block should feel like
   * it is being worked, not silently ticking a progress bar.
   */
  onMiningProgress(target, def, progress) {
    const n = FACE_NORMALS[target.face] || [0, 1, 0];
    const color = this.blockParticleColor(def);
    const count = 2 + Math.round(progress * 4);
    this.spawnParticles(
      target.px + n[0] * 0.06, target.py + n[1] * 0.06, target.pz + n[2] * 0.06,
      count, color,
      { spread: 0.22, speed: 0.05 + progress * 0.06, dir: n, life: 10, size: 0.022 });
    this.shake = Math.min(0.5, (this.shake || 0) + 0.06 + progress * 0.10);
    this.ui.pulseCrosshair(progress);
  }

  explode(x, y, z, radius) {
    const w = this.world;
    this.audio.play('explode');
    const r = Math.ceil(radius);
    const destroyed = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > radius) continue;
          const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          const id = w.getBlock(bx, by, bz);
          if (id === AIR) continue;
          const def = BLOCKS[id];
          if (def.hardness < 0) continue;
          const strength = (1 - d / radius) * 8;
          if (def.blast > strength) continue;
          destroyed.push([bx, by, bz, def]);
        }
      }
    }
    for (const [bx, by, bz, def] of destroyed) {
      if (def.name === 'tnt') {
        w.setBlock(bx, by, bz, AIR);
        this.primeTNT(bx, by, bz, 10 + Math.floor(Math.random() * 20));
        continue;
      }
      const be = w.getBlockEntity(bx, by, bz);
      if (be && be.items) for (const s of be.items) if (s) this.dropItemAt(bx + 0.5, by + 0.5, bz + 0.5, s, true);
      w.setBlock(bx, by, bz, AIR);
      if (Math.random() < 0.3) {
        for (const d of defaultDrops(def, 0, this.rng)) this.dropItemAt(bx + 0.5, by + 0.5, bz + 0.5, mkStack(d.id, d.count), true);
      }
    }
    this.spawnParticles(x, y, z, 60, 0x6a6a6a);

    // damage everything nearby, falling off with distance
    const p = this.player;
    const pd = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
    if (pd < radius * 2) {
      const f = 1 - pd / (radius * 2);
      p.damage(Math.ceil(f * f * 22), 'explosion');
      p.knockback(p.x - x, p.z - z, f * 1.1);
    }
    for (const e of w.entities) {
      if (e.dead || e.type === 'item') continue;
      const d = Math.hypot(e.x - x, e.y - y, e.z - z);
      if (d > radius * 2) continue;
      const f = 1 - d / (radius * 2);
      e.damage(Math.ceil(f * f * 20), null);
      e.knockback(e.x - x, e.z - z, f * 0.9);
    }
  }

  onPlayerHurt() { this.audio.play('hurt'); }
  onPlayerDeath() { document.exitPointerLock(); this.ui.openDeath(); }
  respawn() { this.player.respawn(); this.controls.requestLock(); }
  toast(msg) { this.ui.toast(msg); }

  openCrafting() { this.ui.openCraftingTable(); }
  openChest(x, y, z) {
    let be = this.world.getBlockEntity(x, y, z);
    if (!be) { be = { x, y, z, type: 'chest', items: new Array(27).fill(null) }; this.world.setBlockEntity(x, y, z, be); }
    if (!be.items) be.items = new Array(27).fill(null);
    this.audio.play('open');
    this.ui.openChest(be);
  }
  openSignEditor(be) { this.ui.openSignEditor(be); }

  openFurnace(x, y, z) {
    let be = this.world.getBlockEntity(x, y, z);
    if (!be || be.type !== 'furnace') {
      be = { x, y, z, type: 'furnace', input: null, fuel: null, output: null, cook: 0, burn: 0, burnMax: 0 };
      this.world.setBlockEntity(x, y, z, be);
    }
    this.audio.play('open');
    this.ui.openFurnace(be);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.ui.setDebug(this.debugVisible);
  }

  remeshAll() {
    for (const c of this.world.chunks.values()) {
      for (let sy = 0; sy < WORLD.SECTIONS; sy++) {
        const s = c.sections[sy];
        if (s && !s.empty) this.world.dirtySections.add(c.key * 32 + sy);
      }
    }
  }

  // ================================================================= render
  environment() {
    const w = this.world;
    const p = this.player;
    const f = w.dayFraction();
    const ang = f * Math.PI * 2;
    let sx = Math.cos(ang), sy = Math.sin(ang), sz = 0.28;
    const l = Math.hypot(sx, sy, sz);
    const sunDir = [sx / l, sy / l, sz / l];
    const dayLight = w.skyLightFactor();

    const biome = w.biomeAt(Math.floor(p.x), Math.floor(p.z));
    const elev = sunDir[1];
    const dusk = Math.max(0, 1 - Math.abs(elev) * 3.2);
    const night = Math.max(0, Math.min(1, -elev * 2.4 + 0.35));

    let top = mixColor(biome.skyTint, 0x050914, night);
    let horizon = mixColor(biome.fogTint, 0x0a1024, night);
    top = mixColor(top, 0xff8a4a, dusk * 0.35 * (1 - night));
    horizon = mixColor(horizon, 0xff9a5a, dusk * 0.55 * (1 - night));

    const rain = w.weather.type === 'clear' ? 0 : w.weather.intensity;
    if (rain > 0) {
      top = mixColor(top, 0x4a5260, rain * 0.7);
      horizon = mixColor(horizon, 0x5a6270, rain * 0.7);
    }
    if (this.lightningFlash > 0) { top = mixColor(top, 0xffffff, 0.5); horizon = mixColor(horizon, 0xffffff, 0.5); }

    let fog = horizon;
    let fogEnd = CONFIG.renderDistance * 16 * 0.92;
    let fogStart = fogEnd * (rain > 0.3 ? 0.28 : 0.52);

    const head = BLOCKS[w.getBlock(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z))];
    this.underwater = head.liquid === 'water';
    this.inLavaView = head.liquid === 'lava';
    if (this.underwater) { fog = biome.waterTint; fogStart = 0.4; fogEnd = 14; }
    else if (this.inLavaView) { fog = 0xd04a10; fogStart = 0.1; fogEnd = 2.0; }

    return {
      dayLight, sunDir, time: w.time / TPS, rain,
      skyTop: toVec(top), skyHorizon: toVec(horizon), fogColor: toVec(fog),
      fogStart, fogEnd,
    };
  }

  render(alpha, dt) {
    const r = this.renderer;
    const w = this.world;
    const p = this.player;
    const env = this.environment();

    p.eyePosition(alpha, this.camPos);
    // subtle view bob
    if (CONFIG.viewBobbing) {
      this.camPos[1] += Math.sin(p.bobPhase * 2) * 0.028;
      this.camPos[0] += Math.cos(p.bobPhase) * 0.012 * Math.sin(p.yaw + Math.PI / 2);
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.09;
      const t = performance.now() * 0.001;
      this.camPos[0] += Math.sin(t * 63) * s;
      this.camPos[1] += Math.sin(t * 71 + 2.1) * s;
      this.camPos[2] += Math.cos(t * 57 + 1.3) * s;
    }
    let fov = CONFIG.fov;
    if (p.sprinting) fov *= 1.07;
    if (p.bowCharge > 0) fov *= 1 - Math.min(0.18, p.bowCharge / 20 * 0.18);
    r.setCamera(this.camPos, p.yaw, p.pitch, fov);

    r.beginFrame(env);
    const { opaque, translucent } = w.collectVisible(this.camPos);
    r.stats.sections = opaque.length;
    r.drawTerrain(opaque, env, false);

    // entities and particles share one immediate-mode batch
    r.beginDyn();
    const pos = [0, 0, 0];
    for (const e of w.entities) {
      if (e.dead) continue;
      const dx = e.x - this.camPos[0], dy = e.y - this.camPos[1], dz = e.z - this.camPos[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (CONFIG.renderDistance * 16) ** 2) continue;
      e.interpolated(alpha, pos);
      const light = this.lightAt(e.x, e.y + 0.5, e.z, env.dayLight);
      if (e.type === 'item') drawItemEntity(r, e, pos, light, this.itemColor(e.stack.id));
      else if (e.type === 'arrow') drawArrow(r, e, pos, light);
      else if (e.type === 'boat') drawBoat(r, e, pos, light);
      else if (e.type === 'tnt') drawTNT(r, e, pos, light);
      else if (e.type === 'falling_block') {
        const def = BLOCKS[e.blockId];
        const key = (def.tex && (def.tex.top || def.tex.all)) || null;
        drawFallingBlock(r, e, pos, light, averageTileColor(this.atlas.tiles.get(key)));
      } else drawMob(r, e, pos, light);
    }
    for (const pt of this.particles) {
      const light = this.lightAt(pt.x, pt.y, pt.z, env.dayLight);
      r.pushBox(pt.x - pt.size, pt.y - pt.size, pt.z - pt.size,
        pt.x + pt.size, pt.y + pt.size, pt.z + pt.size, pt.color, light, 0, 0, 0);
    }
    this.drawRain(r, env);
    r.flushDyn(false);

    r.drawTerrain(translucent, env, true);

    // block highlight + crack overlay
    if (!this.ui.isOpen && !p.dead) {
      const t = p.target();
      this.currentTarget = t;
      const be = t ? w.getBlockEntity(t.x, t.y, t.z) : null;
      this.ui.showSignText(be && be.type === 'sign' ? be.lines : null);
      if (t) {
        const boxes = selectionBoxes(w, t.x, t.y, t.z);
        if (boxes) {
          r.drawSelection(t.x, t.y, t.z, boxes);
          if (p.mining && p.mining.x === t.x && p.mining.y === t.y && p.mining.z === t.z) {
            r.drawCrack(t.x, t.y, t.z, Math.min(9, Math.floor(p.mining.progress * 10)),
              boxes, Math.min(1, p.mining.progress), performance.now() * 0.001);
          }
        }
      }
    }

    // the hand goes last, on a cleared depth buffer
    if (!this.ui.isOpen) this.viewModel.draw(r, this.camPos, p.yaw, p.pitch, env, alpha);

    this.ui.fluidOverlay.style.opacity = this.underwater ? 0.42 : (this.inLavaView ? 0.85 : 0);
    this.ui.fluidOverlay.style.background = this.inLavaView ? '#c8400a' : '#2b5ea8';
  }

  drawRain(r, env) {
    const w = this.world;
    if (env.rain < 0.05) return;
    const p = this.player;
    const biome = w.biomeAt(Math.floor(p.x), Math.floor(p.z));
    const snow = biome.snow;
    const count = Math.floor(env.rain * (snow ? 110 : 190));
    const t = w.time;
    for (let i = 0; i < count; i++) {
      const a = (i * 2.39996);
      const rad = 1.5 + (i % 17);
      const x = p.x + Math.cos(a) * rad;
      const z = p.z + Math.sin(a) * rad;
      const top = w.topSolid(Math.floor(x), Math.floor(z));
      if (top > p.y + 6) continue;
      const speed = snow ? 0.12 : 0.55;
      const yy = p.y + 9 - ((t * speed + i * 3.7) % 14);
      if (yy < top + 1) continue;
      const len = snow ? 0.07 : 0.4;
      const s = snow ? 0.05 : 0.018;
      r.pushBox(x - s, yy, z - s, x + s, yy + len, z + s,
        snow ? 0xf0f6ff : 0x8fa8d8, 0.85, 0, 0, 0);
    }
  }

  lightAt(x, y, z, dayLight) {
    const w = this.world;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const sky = w.getSkyLight(bx, by, bz) / 15 * dayLight;
    const blk = w.getBlockLight(bx, by, bz) / 15;
    const l = Math.max(sky, blk);
    return 0.10 + l * l * 0.78 + l * 0.14;
  }

  debugText() {
    const p = this.player;
    const w = this.world;
    const f = p.facing();
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const biome = w.biomeAt(bx, bz);
    const dayTicks = Math.floor(w.time % CONFIG.dayLengthTicks);
    const hours = Math.floor((dayTicks / CONFIG.dayLengthTicks) * 24 + 6) % 24;
    const mins = Math.floor(((dayTicks / CONFIG.dayLengthTicks) * 24 * 60) % 60);
    const t = this.currentTarget;
    const lines = [
      `OREBOUND  ${this.fps.toFixed(0)} fps`,
      `XYZ ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Block ${bx} ${by} ${bz}   Chunk ${bx >> 4} ${bz >> 4} (${bx & 15} ${bz & 15})`,
      `Facing ${f.name} (${f.angle.toFixed(1)}°)  pitch ${(p.pitch * 180 / Math.PI).toFixed(1)}°`,
      `Biome ${biome.display}`,
      `Light sky ${w.getSkyLight(bx, by + 1, bz)} block ${w.getBlockLight(bx, by + 1, bz)} eff ${w.lightLevel(bx, by + 1, bz)}`,
      `Day ${Math.floor(w.time / CONFIG.dayLengthTicks) + 1}  ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  ${w.isNight() ? 'night' : 'day'}`,
      `Weather ${w.weather.type} ${(w.weather.intensity * 100).toFixed(0)}%   Difficulty ${CONFIG.difficulty}`,
      `Chunks ${w.chunks.size} loaded, ${w.stats.queued} queued, ${r0(w.stats.generated)} generated`,
      `Sections drawn ${this.renderer.stats.sections}  draws ${this.renderer.stats.drawCalls}  tris ${r0(this.renderer.stats.triangles)}`,
      `Meshes ${this.renderer.meshCount}  dirty ${w.dirtySections.size}  light backlog ${w.light.backlog}`,
      `Worker  gen ${w.stats.genMs.toFixed(1)}ms  mesh ${w.stats.meshMs.toFixed(1)}ms`,
      `Main    frame ${this.perf.frame.toFixed(2)}ms = tick ${this.perf.tick.toFixed(2)} + world ${this.perf.world.toFixed(2)} + render ${this.perf.render.toFixed(2)}`,
      `Entities ${w.entities.length}  particles ${this.particles.length}`,
      `HP ${p.health.toFixed(1)}  Food ${p.hunger}  Sat ${p.saturation.toFixed(1)}  Exh ${p.exhaustion.toFixed(2)}`,
      t ? `Target ${BLOCKS[w.getBlock(t.x, t.y, t.z)].name} @ ${t.x} ${t.y} ${t.z} face ${t.face}` : 'Target none',
    ];
    return lines.join('\n');
  }
}

const FACE_NORMALS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

function r0(n) { return Math.round(n).toLocaleString(); }
function toVec(c) {
  return new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
}

/** Drops for breaks with no tool involved: explosions, unsupported blocks. */
function defaultDrops(def, state, rng) {
  return blockDrops(def, state, { tool: null, rng, canHarvest: !def.needsTool });
}

function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const axis = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    return tmax >= tmin;
  };
  if (!axis(ox, dx, x0, x1)) return null;
  if (!axis(oy, dy, y0, y1)) return null;
  if (!axis(oz, dz, z0, z1)) return null;
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}

// ------------------------------------------------------------------- boot
//
// Construction has to be inside the guard too: `new Game()` builds the GL
// context and the texture atlas, and a throw there used to escape as an
// uncaught module error, leaving the loading screen up with no explanation.
function fail(err) {
  console.error(err);
  const detail = err && err.stack ? err.stack : String(err);
  const show = window.__oreboundFail;
  if (show) {
    show('Orebound failed to start',
      '<p>Something went wrong while starting the game. The details below say what.</p>' +
      '<p>Orebound needs WebGL2 and module workers: Chrome 91+, Firefox 114+, or Safari 16.4+.</p>',
      detail);
  } else {
    document.body.textContent = 'Orebound failed to start: ' + detail;
  }
}

try {
  const game = new Game();
  window.game = game;
  game.boot().then(() => { window.__oreboundBooted = true; }).catch(fail);
} catch (err) {
  fail(err);
}
