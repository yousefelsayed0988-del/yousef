// Scene capture: boots a world, teleports to interesting places, and shoots
// PNGs so visuals and UI can be reviewed without a display.
//
//   node orebound/tools/scenes.mjs [outDir]

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || './shots';
mkdirSync(OUT, { recursive: true });
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.OREBOUND_URL || 'http://localhost:8123/';

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', e => console.log('[pageerror]', (e.stack || e.message).split('\n').slice(0, 4).join('\n')));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('[err]', m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.ui);
await page.screenshot({ path: `${OUT}/00-menu.png` });

await page.fill('.panel input[type=text]', process.env.SEED || 'orebound');
await page.evaluate(() => [...document.querySelectorAll('.panel button')].find(x => /New World|^Play$/.test(x.textContent)).click());
await page.waitForFunction(() => window.game.started === true, null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.game;
  g.controls.requestLock = () => { };
  if (g.ui.isOpen) g.ui.close();
});

/** Move the player to a good vantage point and wait for chunks to stream in. */
async function place(opts) {
  await page.evaluate((o) => {
    const g = window.game, w = g.world, p = g.player;
    if (o.find) {
      // Walk outward from the origin looking for a column matching a predicate.
      // "open" additionally requires clear sky over a small radius, so shots
      // are not taken from inside a tree canopy.
      const openAt = (x, z, rad) => {
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            const h = w.gen.heightAt(x + dx, z + dz);
            const top = w.topSolid(x + dx, z + dz);
            if (top > h + 1) return false;      // something (leaves) overhead
            if (Math.abs(h - w.gen.heightAt(x, z)) > 5) return false;
          }
        }
        return true;
      };
      let best = null;
      for (let r = 8; r < 400 && !best; r += 3) {
        for (let a = 0; a < 48; a++) {
          const ang = a / 48 * Math.PI * 2 + r * 0.31;
          const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
          if (!w.isLoaded(x >> 4, z >> 4)) continue;
          const h = w.gen.heightAt(x, z);
          if (o.find === 'open' && h > 64 && h < 100 && openAt(x, z, o.rad || 4)) { best = { x, z, h }; break; }
          if (o.find === 'land' && h > 66 && h < 96) { best = { x, z, h }; break; }
          if (o.find === 'mountain' && h > 105) { best = { x, z, h }; break; }
          if (o.find === 'shore' && h >= 62 && h <= 64) { best = { x, z, h }; break; }
        }
      }
      if (best) { p.x = best.x + 0.5; p.z = best.z + 0.5; p.y = best.h + 1; }
      else if (o.find === 'open') { p.y = w.topSolid(Math.floor(p.x), Math.floor(p.z)) + 1; }
    }
    if (o.x !== undefined) { p.x = o.x; p.z = o.z; p.y = o.y; }
    if (o.dy) p.y += o.dy;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.vx = p.vy = p.vz = 0;
    if (o.yaw !== undefined) p.yaw = o.yaw;
    if (o.pitch !== undefined) p.pitch = o.pitch;
    if (o.time !== undefined) w.time = Math.round(24000 * o.time);
    if (o.weather !== undefined) {
      w.weather.type = o.weather;
      w.weather.intensity = o.weather === 'clear' ? 0 : 1;
      w.weather.target = o.weather === 'clear' ? 0 : 1;
      w.weather.ticks = 20000;
    }
    if (o.give) {
      import('/src/items/inventory.js').then(async ({ mkStack }) => {
        const { itemByName } = await import('/src/core/items.js');
        o.give.forEach((n, i) => {
          const it = itemByName(n);
          if (it) g.player.inventory.set(i, mkStack(it.id, n.includes('_') && it.stack > 1 ? 32 : 1));
        });
      });
    }
  }, opts);
  await page.waitForTimeout(opts.wait || 5000);
}

const shots = [];
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  shots.push(name);
  console.log('shot', name);
}

// 1. daylight landscape
await place({ find: 'open', rad: 6, dy: 9, pitch: -0.20, yaw: 0.7, time: 0.22, weather: 'clear', wait: 11000 });
await shot('01-landscape-noon');

// 2. sunset from the same spot
await place({ time: 0.47, wait: 2500 });
await shot('02-sunset');

// 3. night
await place({ time: 0.75, wait: 2500 });
await shot('03-night');

// 4. rain
await place({ time: 0.25, weather: 'rain', wait: 3000 });
await shot('04-rain');

// 5. ground level with foliage + a placed torch and some blocks
await place({ find: 'open', rad: 5, dy: 1, pitch: -0.05, yaw: 0, time: 0.25, weather: 'clear', wait: 8000 });
await page.evaluate(async () => {
  const g = window.game, w = g.world, p = g.player;
  const { blockId } = await import('/src/core/blocks.js');
  const bx = Math.floor(p.x), bz = Math.floor(p.z);
  const front = 4;
  const gy = w.topSolid(bx, bz - front);
  // a little built scene: a wall, a torch, a crafting table, a chest, stairs
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 2; dy++) w.setBlock(bx + dx, gy + dy, bz - front, blockId('cobblestone'));
  }
  w.setBlock(bx - 3, gy + 1, bz - front, blockId('crafting_table'));
  w.setBlock(bx + 3, gy + 1, bz - front, blockId('chest'), 2);
  w.setBlock(bx, gy + 3, bz - front, blockId('torch'), 0);
  w.setBlock(bx - 1, gy + 3, bz - front, blockId('oak_stairs'), 0);
  w.setBlock(bx + 1, gy + 3, bz - front, blockId('oak_slab'), 0);
  w.setBlock(bx - 4, gy + 1, bz - front, blockId('oak_fence'));
  w.setBlock(bx - 5, gy + 1, bz - front, blockId('oak_fence'));
  w.setBlock(bx + 4, gy + 1, bz - front, blockId('glass'));
  w.setBlock(bx + 5, gy + 1, bz - front, blockId('furnace'), 2 | 4);
  w.light.update(400000);
});
await page.waitForTimeout(2500);
await shot('05-built-blocks');

// 6. mobs
await page.evaluate(async () => {
  const g = window.game, w = g.world, p = g.player;
  const { Mob } = await import('/src/entities/entities.js');
  const types = ['cow', 'pig', 'sheep', 'chicken', 'zombie', 'skeleton', 'creeper', 'spider'];
  types.forEach((t, i) => {
    const ang = (i / types.length) * Math.PI * 2;
    const x = p.x + Math.sin(p.yaw) * 6 + Math.cos(ang) * 2.6;
    const z = p.z - Math.cos(p.yaw) * 6 + Math.sin(ang) * 2.6;
    const y = w.topSolid(Math.floor(x), Math.floor(z)) + 1;
    const m = new Mob(w, t, x, y, z);
    m.persistent = true;
    m.yaw = p.yaw + Math.PI;
    w.entities.push(m);
  });
});
await page.waitForTimeout(1800);
await shot('06-mobs');

// 7. underground with torches
await page.evaluate(async () => {
  const g = window.game, w = g.world, p = g.player;
  const { blockId } = await import('/src/core/blocks.js');
  const bx = Math.floor(p.x), bz = Math.floor(p.z);
  const y = 20;
  for (let dz = -1; dz < 16; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = 0; dy < 4; dy++) w.setBlock(bx + dx, y + dy, bz + dz, 0);
    }
    if (dz % 5 === 0) w.setBlock(bx + 2, y + 2, bz + dz, blockId('torch'), 2);
  }
  for (let dx = -2; dx <= 2; dx++) w.setBlock(bx + dx, y - 1, bz + 8, blockId('iron_ore'));
  w.setBlock(bx, y - 1, bz + 10, blockId('diamond_ore'));
  w.setBlock(bx + 1, y - 1, bz + 10, blockId('coal_ore'));
  p.x = bx + 0.5; p.y = y; p.z = bz + 0.5;
  p.px = p.x; p.py = p.y; p.pz = p.z;
  p.pitch = -0.1; p.yaw = Math.PI;
  w.light.update(600000);
});
await page.waitForTimeout(4000);
await shot('07-underground');

// 8. inventory + crafting UI
await page.evaluate(async () => {
  const g = window.game;
  const { mkStack } = await import('/src/items/inventory.js');
  const { itemByName } = await import('/src/core/items.js');
  const give = [
    ['oak_log', 32], ['cobblestone', 64], ['torch', 24], ['iron_pickaxe', 1],
    ['bread', 8], ['coal', 16], ['diamond', 5], ['oak_planks', 40], ['bucket', 1],
  ];
  give.forEach(([n, c], i) => { const it = itemByName(n); if (it) g.player.inventory.set(i, mkStack(it.id, c)); });
  const more = [['iron_ingot', 12], ['wheat_seeds', 9], ['apple', 3], ['stick', 20], ['diamond_sword', 1],
    ['iron_chestplate', 1], ['bow', 1], ['arrow', 32], ['crafting_table', 1], ['furnace', 1], ['chest', 2],
    ['white_wool', 6], ['sand', 30], ['glass', 12], ['bone_meal', 9]];
  more.forEach(([n, c], i) => { const it = itemByName(n); if (it) g.player.inventory.set(9 + i, mkStack(it.id, c)); });
  const armor = ['iron_helmet', 'diamond_chestplate', 'iron_leggings', 'leather_boots'];
  armor.forEach((n, i) => { const it = itemByName(n); if (it) g.player.inventory.set(36 + i, mkStack(it.id, 1)); });
  g.ui.openInventory();
});
await page.waitForTimeout(600);
await shot('08-inventory');

// 9. crafting table with a real recipe laid out
await page.evaluate(async () => {
  const g = window.game;
  g.ui.close();
  g.ui.openCraftingTable();
  const { itemByName } = await import('/src/core/items.js');
  const grid = g.ui.craftGrid;
  const P = itemByName('oak_planks').id, S = itemByName('stick').id;
  grid.slots[0] = { id: P, count: 3, dmg: 0 };
  grid.slots[1] = { id: P, count: 3, dmg: 0 };
  grid.slots[2] = { id: P, count: 3, dmg: 0 };
  grid.slots[4] = { id: S, count: 2, dmg: 0 };
  grid.slots[7] = { id: S, count: 2, dmg: 0 };
  grid.update();
  g.ui.refresh();
});
await page.waitForTimeout(500);
await shot('09-crafting');

// 10. furnace mid-smelt
await page.evaluate(async () => {
  const g = window.game, w = g.world, p = g.player;
  const { itemByName } = await import('/src/core/items.js');
  g.ui.close();
  const be = { x: 0, y: 0, z: 0, type: 'furnace', cook: 90, cookTotal: 200, burn: 900, burnMax: 1600 };
  be.input = { id: itemByName('raw_iron').id, count: 12, dmg: 0 };
  be.fuel = { id: itemByName('coal').id, count: 7, dmg: 0 };
  be.output = { id: itemByName('iron_ingot').id, count: 3, dmg: 0 };
  g.ui.openFurnace(be);
  g.ui.refresh();
});
await page.waitForTimeout(500);
await shot('10-furnace');

// 11. help screen
await page.evaluate(() => { window.game.ui.close(); window.game.ui.openHelp(); });
await page.waitForTimeout(400);
await shot('11-help');

// 12. debug overlay in world
await page.evaluate(() => {
  const g = window.game;
  g.ui.close();
  if (!g.debugVisible) g.toggleDebug();
  g.ui.updateDebug(g.debugText());
});
await page.waitForTimeout(900);
await shot('12-debug');

await browser.close();
console.log('\n' + shots.length + ' shots written to ' + OUT);
