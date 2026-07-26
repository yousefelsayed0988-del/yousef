// Extended gameplay soak: streams chunks over a long walk, runs a full night,
// and drives the survival systems end to end (fluids, furnace, farming, mobs,
// combat, death/respawn, save/load). Fails on any console error or on a
// system that does not produce its expected effect.
//
//   node orebound/tools/soak.mjs [--seconds 60]

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.OREBOUND_URL || 'http://localhost:8123/';
const WALK_MS = Number(arg('seconds', 45)) * 1000;

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); };

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ui);
await page.fill('.panel input[type=text]', 'soak-test');
await page.evaluate(() => [...document.querySelectorAll('.panel button')].find(x => /New World|^Play$/.test(x.textContent)).click());
await page.waitForFunction(() => window.game.started === true, null, { timeout: 180000 });
await page.evaluate(() => {
  window.game.controls.requestLock = () => { };
  if (window.game.ui.isOpen) window.game.ui.close();
});
await page.waitForTimeout(3000);

// ---------------------------------------------------------------- 1. walk
const startChunks = await page.evaluate(() => window.game.world.chunks.size);
await page.evaluate(() => {
  const g = window.game;
  g.controls.keys.add('KeyW');
  g.controls.keys.add('ControlLeft');
  g.controls.keys.add('Space');   // hop obstacles instead of getting wedged on them
  g._soakStart = { x: g.player.x, z: g.player.z };
  g._soakPath = 0;
  g._soakLast = { x: g.player.x, z: g.player.z };
  g._soakPeakChunks = 0;
  g._soakTick = setInterval(() => {
    // Curve gently to sweep new terrain, and turn hard when wedged against a
    // tree or a cliff -- otherwise the walk stalls and stops exercising chunk
    // streaming. Track path length; displacement would read low on a loop.
    const step = Math.hypot(g.player.x - g._soakLast.x, g.player.z - g._soakLast.z);
    g.player.yaw += step < 0.4 ? 1.1 : 0.05;
    g._soakPath += step;
    g._soakLast = { x: g.player.x, z: g.player.z };
    g._soakPeakChunks = Math.max(g._soakPeakChunks, g.world.chunks.size);
  }, 500);
});
await page.waitForTimeout(WALK_MS);
const walk = await page.evaluate(() => {
  const g = window.game;
  clearInterval(g._soakTick);
  g.controls.keys.clear();
  return {
    dist: g._soakPath,
    perf: { ...g.perf },
    genMs: g.world.stats.genMs, meshMs: g.world.stats.meshMs,
    chunks: g.world.chunks.size,
    peak: g._soakPeakChunks,
    meshes: g.renderer.meshCount,
    fps: g.fps,
    y: g.player.y,
    health: g.player.health,
    hunger: g.player.hunger,
    exhaustion: g.player.exhaustion,
    saturation: g.player.saturation,
    entities: g.world.entities.length,
  };
});
console.log('walk:', JSON.stringify(walk));
check('player travelled', walk.dist > 25, `${walk.dist.toFixed(0)} blocks of path`);
check('chunk count stays bounded', walk.chunks < 500, `${walk.chunks} loaded (peak ${walk.peak})`);
check('GPU meshes stay bounded', walk.meshes < 9000, `${walk.meshes} meshes`);
check('sprinting accumulates exhaustion', walk.exhaustion > 0 || walk.saturation < 5,
  `exhaustion ${walk.exhaustion.toFixed(2)} sat ${walk.saturation.toFixed(1)} food ${walk.hunger}`);
// This runs on SwiftShader (software GL), so raster throughput is not
// representative. What we can assert is the cost on the main thread, which is
// the part the engine controls: generation and meshing are on workers.
check('main thread stays cheap', walk.perf.frame - walk.perf.render < 6,
  `tick ${walk.perf.tick.toFixed(2)}ms + world ${walk.perf.world.toFixed(2)}ms per frame`);
check('generation runs off-thread and fast', walk.genMs > 0 && walk.genMs < 90, `${walk.genMs.toFixed(1)}ms/chunk`);
check('meshing runs off-thread and fast', walk.meshMs >= 0 && walk.meshMs < 25, `${walk.meshMs.toFixed(1)}ms/section`);
console.log(`  (software-GL framerate was ${walk.fps.toFixed(1)} fps; render ${walk.perf.render.toFixed(1)}ms of it)`);

// -------------------------------------------------------------- 2. fluids
const fluid = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId, BLOCKS } = await import('/src/core/blocks.js');
  const AIR = blockId('air'), WATER = blockId('water'), LAVA = blockId('lava');
  const bx = Math.floor(g.player.x) + 20, bz = Math.floor(g.player.z) + 20;
  const by = w.topSolid(bx, bz) + 1;
  // flat stone pad so flow is predictable
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    w.setBlock(bx + dx, by - 1, bz + dz, blockId('stone'));
    for (let dy = 0; dy < 4; dy++) w.setBlock(bx + dx, by + dy, bz + dz, AIR);
  }
  w.setBlock(bx, by, bz, WATER, 0);
  w.scheduleFluid(bx, by, bz, 1);
  for (let i = 0; i < 200; i++) { w.time++; g.fluids.tick(); }
  let spread = 0;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    if (w.getBlock(bx + dx, by, bz + dz) === WATER) spread++;
  }

  // lava meeting flowing water should solidify
  w.setBlock(bx + 5, by, bz + 5, LAVA, 0);
  w.scheduleFluid(bx + 5, by, bz + 5, 1);
  for (let i = 0; i < 300; i++) { w.time++; g.fluids.tick(); }
  let stoneMade = 0;
  for (let dx = 0; dx <= 6; dx++) for (let dz = 0; dz <= 6; dz++) {
    const n = BLOCKS[w.getBlock(bx + dx, by, bz + dz)].name;
    if (n === 'obsidian' || n === 'cobblestone' || n === 'stone') stoneMade++;
  }

  // infinite source: 2x2 of sources should refill a removed corner
  const ix = bx - 5, iz = bz - 5;
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.setBlock(ix + dx, by, iz + dz, WATER, 0);
  w.setBlock(ix, by, iz, AIR);
  w.setBlock(ix, by, iz, WATER, 1);
  const refilled = g.fluids.tryInfiniteSource(ix, by, iz);
  return { spread, stoneMade, refilled, infiniteIsSource: w.getState(ix, by, iz) === 0 };
});
console.log('fluids:', JSON.stringify(fluid));
check('water spreads from a source', fluid.spread > 8, `${fluid.spread} water blocks`);
check('water + lava makes stone', fluid.stoneMade > 0, `${fluid.stoneMade} solidified`);
check('2x2 water is an infinite source', fluid.refilled && fluid.infiniteIsSource);

// ------------------------------------------------- 2b. hunger + saturation
const hunger = await page.evaluate(() => {
  const p = window.game.player;
  p.hunger = 20; p.saturation = 5; p.exhaustion = 0; p.health = 10;
  p.addExhaustion(4);                       // one full exhaustion unit
  const satAfter = p.saturation;
  p.saturation = 0;
  p.addExhaustion(4);
  const foodAfter = p.hunger;
  // well fed -> regenerates, consuming saturation first
  p.hunger = 20; p.saturation = 8; p.health = 10;
  for (let i = 0; i < 40; i++) p.tickSurvival();
  const healed = p.health;
  const satSpent = p.saturation < 8;
  // starving -> takes damage
  p.hunger = 0; p.saturation = 0; p.health = 20; p.starveTimer = 0;
  for (let i = 0; i < 200; i++) p.tickSurvival();
  const starved = p.health < 20;
  // eating restores both
  // leave the player in a clean state for the checks that follow
  p.hunger = 20; p.saturation = 5; p.exhaustion = 0; p.health = 20; p.hurtTimer = 0;
  return { satAfter, foodAfter, healed, satSpent, starved };
});
console.log('hunger:', JSON.stringify(hunger));
check('exhaustion drains saturation first', hunger.satAfter === 4);
check('exhaustion then drains food', hunger.foodAfter === 19);
check('well-fed player regenerates', hunger.healed > 10 && hunger.satSpent, `hp ${hunger.healed}`);
check('starvation damages the player', hunger.starved === true);

// ------------------------------------------------------------- 3. furnace
const furnace = await page.evaluate(async () => {
  const g = window.game;
  const { itemByName, item } = await import('/src/core/items.js');
  const be = {
    x: 0, y: 0, z: 0, type: 'furnace', cook: 0, burn: 0, burnMax: 0,
    input: { id: itemByName('raw_iron').id, count: 3, dmg: 0 },
    fuel: { id: itemByName('coal').id, count: 2, dmg: 0 },
    output: null,
  };
  g.world.setBlockEntity(0, 0, 0, be);
  for (let i = 0; i < 700; i++) g.tickFurnace(be);
  return {
    output: be.output ? item(be.output.id).name : null,
    count: be.output ? be.output.count : 0,
    inputLeft: be.input ? be.input.count : 0,
    burning: be.burn > 0,
    fuelLeft: be.fuel ? be.fuel.count : 0,
  };
});
console.log('furnace:', JSON.stringify(furnace));
check('furnace smelts ore to ingots', furnace.output === 'iron_ingot' && furnace.count >= 3,
  `${furnace.count} x ${furnace.output}`);
check('furnace consumes fuel', furnace.fuelLeft < 2, `${furnace.fuelLeft} coal left`);

// ------------------------------------------------------------- 4. farming
const farm = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId } = await import('/src/core/blocks.js');
  const { Random } = await import('/src/core/rng.js');
  const bx = Math.floor(g.player.x) - 20, bz = Math.floor(g.player.z) - 20;
  const by = w.topSolid(bx, bz);
  for (let dx = 0; dx < 4; dx++) {
    w.setBlock(bx + dx, by, bz, blockId('farmland'), 7);
    for (let dy = 1; dy < 4; dy++) w.setBlock(bx + dx, by + dy, bz, blockId('air'));
    w.setBlock(bx + dx, by + 1, bz, blockId('wheat'), 0);
  }
  w.setBlock(bx - 1, by, bz, blockId('water'), 0);
  const rng = new Random(7);
  // force many random ticks on the crops
  for (let i = 0; i < 4000; i++) {
    for (let dx = 0; dx < 4; dx++) g.ticker.apply(bx + dx, by + 1, bz, blockId('wheat'), rng);
  }
  const ages = [];
  for (let dx = 0; dx < 4; dx++) ages.push(w.getState(bx + dx, by + 1, bz) & 7);

  // sapling -> tree
  const sx = bx + 8, sz = bz;
  const sy = w.topSolid(sx, sz);
  w.setBlock(sx, sy, sz, blockId('grass_block'));
  for (let dy = 1; dy < 12; dy++) w.setBlock(sx, sy + dy, sz, blockId('air'));
  const { growTree } = await import('/src/world/randomtick.js');
  const grew = growTree(w, sx, sy + 1, sz, 'oak', new Random(3));
  let logs = 0, leaves = 0;
  const { BLOCKS } = await import('/src/core/blocks.js');
  for (let dy = 0; dy < 12; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const n = BLOCKS[w.getBlock(sx + dx, sy + dy, sz + dz)].name;
    if (n === 'oak_log') logs++;
    if (n === 'oak_leaves') leaves++;
  }
  return { ages, grew, logs, leaves };
});
console.log('farming:', JSON.stringify(farm));
check('crops grow on hydrated farmland', farm.ages.every(a => a === 7), `ages ${farm.ages.join(',')}`);
check('sapling grows into a tree', farm.grew && farm.logs >= 4 && farm.leaves > 20,
  `${farm.logs} logs, ${farm.leaves} leaves`);

// -------------------------------------------------- 5. night, mobs, combat
const night = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  w.time = Math.round(24000 * 0.75);        // midnight
  const before = w.entities.length;
  for (let i = 0; i < 400; i++) { g.spawner.tick(g.player); w.time++; }
  const { Mob } = await import('/src/entities/entities.js');
  let hostiles = 0;
  for (const e of w.entities) if (e instanceof Mob && e.hostile) hostiles++;

  // a zombie next to the player should hit, and be killable
  const z = new Mob(w, 'zombie', g.player.x + 1.0, g.player.y, g.player.z);
  z.persistent = true;
  w.entities.push(z);
  const extra = [];
  for (let i = 0; i < 6; i++) {
    const m = new Mob(w, i % 2 ? 'skeleton' : 'zombie', g.player.x + 2 + i, g.player.y, g.player.z + 2);
    m.persistent = true;
    w.entities.push(m);
    extra.push(m);
  }
  g.player.hurtTimer = 0;
  const hpBefore = g.player.health;
  // tick the player too, otherwise invulnerability frames never decay and the
  // mob's hits are all correctly ignored
  for (let i = 0; i < 120; i++) { z.tick(); g.player.tickTimers(); w.time++; }
  const hpAfterMob = g.player.health;

  // arm the player, and let i-frames decay between swings
  const { mkStack } = await import('/src/items/inventory.js');
  const { itemByName } = await import('/src/core/items.js');
  g.player.inventory.set(g.player.inventory.selected, mkStack(itemByName('iron_sword').id, 1));
  const dropsBefore = w.entities.filter(e => e.type === 'item').length;
  const zHpBefore = z.health;
  for (const m of [z, ...extra]) {
    for (let i = 0; i < 40 && !m.dead; i++) {
      g.player.attackCooldown = 0;
      g.player.attackEntity(m);
      for (let k = 0; k < 11; k++) m.hurtTimer = Math.max(0, m.hurtTimer - 1);
    }
  }
  const killed = z.dead && extra.every(m => m.dead);
  const drops = w.entities.filter(e => e.type === 'item').length - dropsBefore;
  return { before, after: w.entities.length, hostiles, hpBefore, hpAfterMob, zHpBefore, killed, drops };
});
console.log('night:', JSON.stringify(night));
check('hostiles spawn at night', night.hostiles > 0, `${night.hostiles} hostile mobs`);
check('mobs damage the player', night.hpAfterMob < night.hpBefore, `${night.hpBefore} -> ${night.hpAfterMob}`);
check('mobs can be killed and drop loot', night.killed && night.drops > 0,
  `killed=${night.killed}, ${night.drops} new item entities`);

// -------------------------------------------------- 6. death and respawn
const death = await page.evaluate(async () => {
  const g = window.game;
  const p = g.player;
  const { mkStack } = await import('/src/items/inventory.js');
  const { itemByName } = await import('/src/core/items.js');
  p.inventory.set(0, mkStack(itemByName('diamond').id, 5));
  const spawn = { ...p.spawn };
  p.damage(100, 'void');
  const died = p.dead;
  const droppedDiamonds = g.world.entities.some(e => e.type === 'item' && e.stack.id === itemByName('diamond').id);
  const invCleared = p.inventory.get(0) === null;
  g.ui.close();
  p.respawn();
  return {
    died, droppedDiamonds, invCleared,
    respawnedHealth: p.health, respawnedFood: p.hunger,
    atSpawn: Math.hypot(p.x - spawn.x, p.z - spawn.z) < 2,
    alive: !p.dead,
  };
});
console.log('death:', JSON.stringify(death));
check('player dies', death.died);
check('inventory drops on death (keepInventory=false)', death.droppedDiamonds && death.invCleared);
check('respawn restores health and food', death.respawnedHealth === 20 && death.respawnedFood === 20);
check('respawn returns to spawn point', death.atSpawn && death.alive);

// ------------------------------------------------------- 7. save and load
const save = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId, BLOCKS } = await import('/src/core/blocks.js');
  const bx = Math.floor(g.player.x) + 2, bz = Math.floor(g.player.z) + 2;
  const by = w.topSolid(bx, bz) + 1;
  w.setBlock(bx, by, bz, blockId('diamond_block'));
  const chestPos = { x: bx + 1, y: by, z: bz };
  w.setBlock(chestPos.x, chestPos.y, chestPos.z, blockId('chest'), 0);
  const { itemByName } = await import('/src/core/items.js');
  const items = new Array(27).fill(null);
  items[3] = { id: itemByName('gold_ingot').id, count: 7, dmg: 0 };
  w.setBlockEntity(chestPos.x, chestPos.y, chestPos.z, { ...chestPos, type: 'chest', items });

  const ok = await g.save.save();
  const rec = await g.save.loadRecord();
  const parsed = await g.save.parse(rec);
  const chunk = parsed.chunks.find(c => c.cx === (bx >> 4) && c.cz === (bz >> 4));
  const be = chunk && chunk.blockEntities.find(b => b.x === chestPos.x && b.y === chestPos.y && b.z === chestPos.z);
  return {
    ok,
    compressed: rec.compressed,
    bytes: rec.data.byteLength,
    chunkCount: parsed.chunks.length,
    diamondSaved: !!chunk && [...chunk.diff.values()].some(v => BLOCKS[v >> 8].name === 'diamond_block'),
    chestSaved: !!be && !!be.items[3] && be.items[3].count === 7,
    entityCount: parsed.entities.length,
    playerMatches: Math.abs(parsed.player.x - g.player.x) < 0.01,
  };
});
console.log('save:', JSON.stringify(save));
check('save writes successfully', save.ok === true);
check('save is compressed binary, not JSON', save.compressed === true, `${save.bytes} bytes`);
check('block edits persist', save.diamondSaved === true);
check('chest contents persist', save.chestSaved === true);
check('entities persist', save.entityCount > 0, `${save.entityCount}`);
check('player state persists', save.playerMatches === true);

// reload the world from disk and confirm the edits came back
await page.evaluate(() => window.game.quitToMenu());
await page.waitForTimeout(500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.panel button')].find(x => /Continue/.test(x.textContent));
  if (b) b.click();
});
await page.waitForFunction(() => window.game.started === true, null, { timeout: 180000 });
await page.evaluate(() => { window.game.controls.requestLock = () => { }; if (window.game.ui.isOpen) window.game.ui.close(); });
await page.waitForTimeout(4000);
const reload = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { BLOCKS } = await import('/src/core/blocks.js');
  const bx = Math.floor(g.player.x) + 2, bz = Math.floor(g.player.z) + 2;
  let found = null, chest = null;
  for (let dy = -3; dy <= 3 && !found; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const y = w.topSolid(bx + dx, bz + dz) + dy;
        for (let yy = y - 4; yy <= y + 4; yy++) {
          if (BLOCKS[w.getBlock(bx + dx, yy, bz + dz)].name === 'diamond_block') found = [bx + dx, yy, bz + dz];
          const be = w.getBlockEntity(bx + dx, yy, bz + dz);
          if (be && be.type === 'chest' && be.items && be.items[3]) chest = be.items[3].count;
        }
      }
    }
  }
  return { found: !!found, chest, seed: w.seed, time: w.time };
});
console.log('reload:', JSON.stringify(reload));
check('reloaded world restores block edits', reload.found === true);
check('reloaded world restores chest contents', reload.chest === 7, `${reload.chest}`);

// --------------------------------------------------------- 8. explosions
const boom = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId, BLOCKS } = await import('/src/core/blocks.js');
  const bx = Math.floor(g.player.x) + 30, bz = Math.floor(g.player.z) + 30;
  const by = w.topSolid(bx, bz) + 1;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 4; dy++) {
    w.setBlock(bx + dx, by + dy, bz + dz, blockId('dirt'));
  }
  w.setBlock(bx, by, bz, blockId('bedrock'));
  let before = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 4; dy++) {
    if (BLOCKS[w.getBlock(bx + dx, by + dy, bz + dz)].name === 'dirt') before++;
  }
  g.explode(bx + 0.5, by + 2.5, bz + 0.5, 3.5);
  let after = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 4; dy++) {
    if (BLOCKS[w.getBlock(bx + dx, by + dy, bz + dz)].name === 'dirt') after++;
  }
  return { before, after, bedrockSurvives: BLOCKS[w.getBlock(bx, by, bz)].name === 'bedrock' };
});
console.log('explosion:', JSON.stringify(boom));
check('explosions destroy terrain', boom.after < boom.before, `${boom.before} -> ${boom.after} dirt`);
check('bedrock is indestructible', boom.bedrockSurvives === true);

// ------------------------------------------------- 8b. boats, TNT, signs
const extras = await page.evaluate(async () => {
  const g = window.game, w = g.world, p = g.player;
  const { blockId, BLOCKS } = await import('/src/core/blocks.js');

  // --- boat: place on water, ride it, steer, dismount
  const bx = Math.floor(p.x) + 40, bz = Math.floor(p.z) + 40;
  const by = w.topSolid(bx, bz) + 1;
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    w.setBlock(bx + dx, by - 1, bz + dz, blockId('stone'));
    w.setBlock(bx + dx, by, bz + dz, blockId('water'), 0);
    w.setBlock(bx + dx, by + 1, bz + dz, blockId('air'));
  }
  g.spawnBoat(bx + 0.5, by + 0.1, bz + 0.5, 'oak');
  const boat = w.entities.find(e => e.type === 'boat');
  const mounted = boat.mount(p);
  const startZ = boat.z;
  g.controls.keys.clear();
  g.controls.keys.add('KeyW');
  g.controls._syncState();
  boat.yaw = 0;
  for (let i = 0; i < 60; i++) { boat.tick(); }
  const moved = Math.hypot(boat.x - (bx + 0.5), boat.z - startZ);
  const ridesAlong = Math.abs(p.z - boat.z) < 0.01 && Math.abs(p.x - boat.x) < 0.01;
  g.controls.keys.clear();
  g.controls._syncState();
  boat.dismount();
  const dismounted = p.riding === null && boat.rider === null;

  // --- TNT: ignite with flint and steel, explodes after its fuse
  const tx = Math.floor(p.x) - 40, tz = Math.floor(p.z) - 40;
  const ty = w.topSolid(tx, tz) + 1;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 3; dy++) {
    w.setBlock(tx + dx, ty + dy, tz + dz, blockId('dirt'));
  }
  w.setBlock(tx, ty + 3, tz, blockId('tnt'));
  const { mkStack } = await import('/src/items/inventory.js');
  const { itemByName } = await import('/src/core/items.js');
  p.inventory.set(p.inventory.selected, mkStack(itemByName('flint_and_steel').id, 1));
  p.useCooldown = 0;
  const ignited = p.useIgniter({ x: tx, y: ty + 3, z: tz, face: 3 });
  const primed = w.entities.filter(e => e.type === 'tnt').length;
  let dirtBefore = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 3; dy++) {
    if (BLOCKS[w.getBlock(tx + dx, ty + dy, tz + dz)].name === 'dirt') dirtBefore++;
  }
  const tnt = w.entities.find(e => e.type === 'tnt');
  for (let i = 0; i < 200 && tnt && !tnt.dead; i++) tnt.tick();
  let dirtAfter = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy < 3; dy++) {
    if (BLOCKS[w.getBlock(tx + dx, ty + dy, tz + dz)].name === 'dirt') dirtAfter++;
  }

  // --- sign: block entity carries text through a save round-trip
  const sx = Math.floor(p.x) + 4, sz = Math.floor(p.z) + 4;
  const sy = w.topSolid(sx, sz) + 1;
  w.setBlock(sx, sy, sz, blockId('sign'), 0);
  w.setBlockEntity(sx, sy, sz, { x: sx, y: sy, z: sz, type: 'sign', lines: ['this way', 'to the mine', '', ''] });
  const bytes = g.save.serialize();
  const parsed = await g.save.parse({ data: bytes, compressed: false });
  const chunk = parsed.chunks.find(c => c.cx === (sx >> 4) && c.cz === (sz >> 4));
  const signBE = chunk && chunk.blockEntities.find(b => b.type === 'sign' && b.x === sx && b.z === sz);
  const boatSaved = parsed.entities.some(e => e.type === 'boat' && e.wood === 'oak');
  const tntSaved = parsed.entities.some(e => e.type === 'tnt');

  return {
    mounted, moved, ridesAlong, dismounted,
    ignited, primed, dirtBefore, dirtAfter,
    signText: signBE ? signBE.lines.join('|') : null,
    boatSaved, tntSaved,
  };
});
console.log('extras:', JSON.stringify(extras));
check('boat can be ridden', extras.mounted && extras.ridesAlong);
check('boat moves under steering', extras.moved > 0.5, `${extras.moved.toFixed(2)} blocks`);
check('boat dismounts', extras.dismounted === true);
check('flint and steel primes TNT', extras.ignited && extras.primed === 1);
check('primed TNT explodes', extras.dirtAfter < extras.dirtBefore, `${extras.dirtBefore} -> ${extras.dirtAfter} dirt`);
check('sign text persists', extras.signText === 'this way|to the mine||');
check('boats persist in saves', extras.boatSaved === true);
check('primed TNT is not persisted', extras.tntSaved === false);

// ------------------------------------------------------------ 9. limits
const limits = await page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId, BLOCKS } = await import('/src/core/blocks.js');
  const bx = Math.floor(g.player.x), bz = Math.floor(g.player.z);
  const buildCap = w.setBlock(bx, 320, bz, blockId('stone'));
  const belowFloor = w.setBlock(bx, -65, bz, blockId('stone'));
  const beyondBorder = w.setBlock(30000001, 70, 0, blockId('stone'));
  const bedrockAtFloor = BLOCKS[w.getBlock(bx, -64, bz)].name;
  return { buildCap, belowFloor, beyondBorder, bedrockAtFloor };
});
console.log('limits:', JSON.stringify(limits));
check('build height cap enforced (y=320)', limits.buildCap === false);
check('nothing below y=-64', limits.belowFloor === false);
check('world border enforced', limits.beyondBorder === false);
check('bedrock floor at y=-64', limits.bedrockAtFloor === 'bedrock');

check('no console errors during soak', errors.length === 0, errors.slice(0, 5).join('\n  '));

await browser.close();
console.log('\n--- soak checks ---');
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
  if (!c.ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
