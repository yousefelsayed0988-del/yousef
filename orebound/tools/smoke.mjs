// Headless smoke test: boots the game, starts a world, plays a little, and
// reports console errors plus a few live invariants.
//
//   node orebound/tools/smoke.mjs [--shot out.png] [--seconds 12]

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const SHOT = arg('shot', null);
const SECONDS = Number(arg('seconds', 12));
const SEED = arg('seed', '4242');
const URL = arg('url', 'http://localhost:8123/');

// Use the browser that ships with the environment rather than downloading one.
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

const errors = [];
const warnings = [];
const isReal = (t) => !/Failed to load resource/.test(t);
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' && isReal(m.text())) errors.push(m.text());
  else if (t === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ui, null, { timeout: 20000 });

// start a new world with a fixed seed
await page.waitForSelector('.panel input[type=text]', { timeout: 15000 });
await page.fill('.panel input[type=text]', SEED);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.panel button')].find(x => /New World|^Play$/.test(x.textContent));
  b.click();
});

await page.waitForFunction(() => window.game.started === true, null, { timeout: 120000 });
console.log('world started');

// Headless has no real pointer lock, so stop the game asking for it and make
// sure we are not sitting in the pause menu (which correctly halts simulation).
await page.evaluate(() => {
  const g = window.game;
  g.controls.requestLock = () => { };
  if (g.ui.isOpen) g.ui.close();
});

// give it a moment to mesh, then drive real key state through the input path
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.game;
  g.controls.keys.add('KeyW');
  g.controls.keys.add('ControlLeft');
});
await page.waitForTimeout(SECONDS * 500);
await page.evaluate(() => {
  const g = window.game;
  g.player.yaw += 1.2;
  g.controls.keys.add('Space');
});
await page.waitForTimeout(SECONDS * 500);
await page.evaluate(() => { window.game.controls.keys.clear(); });
// let the player actually come to rest before sampling -- sampling mid-jump or
// mid-fall makes the "supported" assertion flaky for no good reason
await page.waitForFunction(
  () => { const p = window.game.player; return p.onGround || p.inWater || p.inLava; },
  null, { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(400);
// If the player walked off into a ravine the settle above can time out while
// they are still descending. The invariant that matters is "not falling
// forever", so report vertical velocity too.

const report = await page.evaluate(() => {
  const g = window.game;
  const w = g.world;
  let meshes = 0, sections = 0, nonEmpty = 0;
  for (const c of w.chunks.values()) {
    for (const s of c.sections) {
      if (!s) continue;
      sections++;
      if (!s.empty) nonEmpty++;
      if (s.meshHandle) meshes++;
    }
  }
  // exercise a few systems directly
  const p = g.player;
  const before = { x: p.x, y: p.y, z: p.z };
  return {
    fps: g.fps,
    chunks: w.chunks.size,
    meshes, sections, nonEmpty,
    entities: w.entities.length,
    drawCalls: g.renderer.stats.drawCalls,
    sectionsDrawn: g.renderer.stats.sections,
    triangles: Math.round(g.renderer.stats.triangles),
    player: before,
    onGround: p.onGround,
    inFluid: p.inWater || p.inLava,
    vy: p.vy,
    health: p.health,
    hunger: p.hunger,
    biome: w.biomeAt(Math.floor(p.x), Math.floor(p.z)).name,
    lightBacklog: w.light.backlog,
    dirty: w.dirtySections.size,
    genMs: +w.stats.genMs.toFixed(2),
    meshMs: +w.stats.meshMs.toFixed(2),
    time: w.time,
    topSolid: w.topSolid(Math.floor(p.x), Math.floor(p.z)),
  };
});

console.log(JSON.stringify(report, null, 2));

// --------------------------------------------------- functional assertions
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

check('chunks loaded', report.chunks > 40, `${report.chunks}`);
check('sub-chunk meshes built', report.meshes > 30, `${report.meshes}`);
check('terrain is being drawn', report.sectionsDrawn > 5, `${report.sectionsDrawn} sections`);
check('triangles > 0', report.triangles > 1000, `${report.triangles}`);
check('player is supported, not falling forever',
  report.onGround === true || report.inFluid === true || Math.abs(report.vy) < 0.05,
  `onGround=${report.onGround} inFluid=${report.inFluid} vy=${report.vy.toFixed(3)}`);
check('player above bedrock', report.player.y > -60, `y=${report.player.y.toFixed(1)}`);
check('player at/near surface', Math.abs(report.player.y - report.topSolid) < 6,
  `y=${report.player.y.toFixed(1)} top=${report.topSolid}`);
check('health intact', report.health > 0, `${report.health}`);
check('world ticking', report.time > 100, `${report.time} ticks`);
check('light queue drains', report.lightBacklog < 200000, `${report.lightBacklog}`);
check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));

// deeper gameplay probes
const probes = await page.evaluate(async () => {
  const g = window.game;
  const w = g.world;
  const out = {};

  const { blockId, BLOCKS } = await import('/src/core/blocks.js');
  const STONE = blockId('stone'), TORCH = blockId('torch'), AIR = blockId('air');

  // --- place and break a block, and check lighting reacts to a torch
  const px = Math.floor(g.player.x) + 3, pz = Math.floor(g.player.z) + 3;
  const py = w.topSolid(px, pz) + 1;
  out.placeBreak = (() => {
    const before = w.getBlock(px, py, pz);
    w.setBlock(px, py, pz, STONE);
    const mid = w.getBlock(px, py, pz);
    w.setBlock(px, py, pz, AIR);
    const after = w.getBlock(px, py, pz);
    return before === AIR && mid === STONE && after === AIR;
  })();

  // --- torch light propagates through the bounded BFS
  const lightBefore = w.getBlockLight(px + 2, py, pz);
  w.setBlock(px, py, pz, TORCH, 0);
  w.light.update(200000);
  out.torchLightAtSource = w.getBlockLight(px, py, pz);
  out.torchLightTwoAway = w.getBlockLight(px + 2, py, pz);
  w.setBlock(px, py, pz, AIR);
  w.light.update(200000);
  out.lightRemovedAfter = w.getBlockLight(px + 2, py, pz);
  out.lightBefore = lightBefore;

  // --- crafting: 1 log -> 4 planks via the real recipe matcher
  const { findRecipe } = await import('/src/core/recipes.js');
  const { itemByName } = await import('/src/core/items.js');
  const log = itemByName('oak_log');
  const grid = [{ id: log.id, count: 1, dmg: 0 }, null, null, null];
  const r = findRecipe(grid, 2, 2);
  out.craftPlanks = !!r && r.result.count === 4;

  // --- 3x3 shaped recipe: wooden pickaxe
  const planks = itemByName('oak_planks'), stick = itemByName('stick');
  const P = { id: planks.id, count: 1, dmg: 0 }, S = { id: stick.id, count: 1, dmg: 0 };
  const g3 = [P, P, P, null, S, null, null, S, null];
  const r3 = findRecipe(g3, 3, 3);
  out.craftPickaxe = !!r3 && (await import('/src/core/items.js')).item(r3.result.id).name === 'wooden_pickaxe';

  // --- smelting table
  const { smeltResult, fuelTicks } = await import('/src/core/recipes.js');
  out.smeltIron = !!smeltResult(itemByName('raw_iron').id);
  out.coalIsFuel = fuelTicks(itemByName('coal').id) === 1600;
  out.plankFuel = fuelTicks(planks.id) === 300;

  // --- tags
  const { tagItems } = await import('/src/core/tags.js');
  out.tagPlanks = tagItems('#planks').size === 7;
  out.tagCoals = tagItems('#coals').size === 2;

  // --- save round trip
  const bytes = g.save.serialize();
  out.saveBytes = bytes.byteLength;
  const parsed = await g.save.parse({ data: bytes, compressed: false });
  out.saveRoundTrip = parsed.seed === w.seed && Math.abs(parsed.player.x - g.player.x) < 0.001;

  // --- inventory
  const { mkStack } = await import('/src/items/inventory.js');
  g.player.inventory.pickUp(mkStack(itemByName('oak_log').id, 12));
  out.pickedUp = g.player.inventory.count(itemByName('oak_log').id) >= 12;

  // --- ore / deepslate / stone distribution over a real volume
  let ores = 0, deepslate = 0, stoneAbove = 0, deepOres = 0, caveAir = 0, underground = 0;
  const cx = Math.floor(g.player.x), cz = Math.floor(g.player.z);
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      for (let y = -60; y < 50; y++) {
        const name = BLOCKS[w.getBlock(cx + dx, y, cz + dz)].name;
        if (name.includes('_ore')) { ores++; if (y < 0) deepOres++; }
        if (y < -8 && name === 'deepslate') deepslate++;
        if (y > 8 && y < 40 && name === 'stone') stoneAbove++;
        underground++;
        if (name === 'air' || name === 'cave_air') caveAir++;
      }
    }
  }
  out.oresNearby = ores;
  out.deepslateOres = deepOres;
  out.deepslateBelowZero = deepslate;
  out.stoneAboveZero = stoneAbove;
  out.caveAirPct = +(caveAir / underground * 100).toFixed(2);
  // Local cave density swings wildly (some regions are simply solid), so the
  // assertion samples the generator across a wide area instead.
  {
    let hits = 0, n = 0;
    for (let i = 0; i < 24000; i++) {
      const sx = ((i * 7919) % 4000) - 2000;
      const sz = ((i * 104729) % 4000) - 2000;
      const sy = -55 + ((i * 31) % 95);
      const surf = w.gen.heightAt(sx, sz);
      if (sy >= surf - 2) continue;
      n++;
      if (w.gen.isCave(sx, sy, sz, surf)) hits++;
    }
    out.globalCavePct = +(hits / Math.max(1, n) * 100).toFixed(2);
  }
  out.caveAirRaw = caveAir;
  out.scanCenter = [cx, cz];
  out.scanColumn = [];
  for (let y = -60; y < 50; y += 6) out.scanColumn.push(y + ':' + BLOCKS[w.getBlock(cx, y, cz)].name);
  out.chunkLoadedAtScan = w.isLoaded(cx >> 4, cz >> 4);

  // --- bedrock floor
  out.bedrockFloor = BLOCKS[w.getBlock(px, -64, pz)].name === 'bedrock';

  // --- biome variety across a wide sample
  const biomes = new Set();
  for (let i = 0; i < 400; i++) {
    biomes.add(w.gen.biomeAt(i * 137 - 20000, i * 91 + 15000));
  }
  out.biomeVariety = biomes.size;

  // --- mob spawn machinery
  const { Mob } = await import('/src/entities/entities.js');
  const m = new Mob(w, 'zombie', g.player.x + 3, w.topSolid(px + 3, pz) + 1, g.player.z);
  w.entities.push(m);
  out.mobSpawned = !!m.def;
  return out;
});

console.log(JSON.stringify(probes, null, 2));
check('place/break block', probes.placeBreak === true);
check('torch emits light 14', probes.torchLightAtSource === 14, `${probes.torchLightAtSource}`);
check('torch light propagates', probes.torchLightTwoAway >= 11, `${probes.torchLightTwoAway} two blocks away`);
check('light removal cleans up', probes.lightRemovedAfter === probes.lightBefore,
  `${probes.lightRemovedAfter} vs ${probes.lightBefore} before`);
check('caves present but not hollow (global)', probes.globalCavePct > 3 && probes.globalCavePct < 25,
  `${probes.globalCavePct}% of underground voxels carved, ${probes.caveAirPct}% locally`);
check('deepslate ore variants below y=0', probes.deepslateOres > 0, `${probes.deepslateOres}`);
check('stone above y=0', probes.stoneAboveZero > 500, `${probes.stoneAboveZero}`);
check('craft planks from log', probes.craftPlanks === true);
check('craft wooden pickaxe (3x3 shaped)', probes.craftPickaxe === true);
check('smelting recipe present', probes.smeltIron === true);
check('coal fuel = 1600 ticks', probes.coalIsFuel === true);
check('plank fuel = 300 ticks', probes.plankFuel === true);
check('#planks tag has 7 woods', probes.tagPlanks === true);
check('#coals tag has 2', probes.tagCoals === true);
check('save round-trips', probes.saveRoundTrip === true, `${probes.saveBytes} bytes`);
check('inventory pickup', probes.pickedUp === true);
check('ores generate', probes.oresNearby > 200, `${probes.oresNearby} ore blocks in 17x17 volume`);
check('deepslate below y=0', probes.deepslateBelowZero > 2000, `${probes.deepslateBelowZero}`);
check('bedrock at y=-64', probes.bedrockFloor === true);
check('multiple biomes generate', probes.biomeVariety >= 6, `${probes.biomeVariety}`);
check('mob constructed', probes.mobSpawned === true);

// run a bit longer with the mob alive to exercise AI
await page.waitForTimeout(3000);
const after = await page.evaluate(() => ({
  fps: window.game.fps,
  errors: 0,
  entities: window.game.world.entities.length,
}));
check('still running after AI ticks', after.fps > 0);
check('no console errors (final)', errors.length === 0, errors.slice(0, 6).join('\n  '));

if (SHOT) {
  await page.screenshot({ path: SHOT });
  console.log('screenshot ->', SHOT);
}

await browser.close();

console.log('\n--- checks ---');
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
  if (!c.ok) failed++;
}
if (warnings.length) console.log(`\n${warnings.length} console warnings, first: ${warnings[0]}`);
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
