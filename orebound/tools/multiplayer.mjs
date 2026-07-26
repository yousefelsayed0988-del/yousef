// Multiplayer test: two real browsers join the same server and must agree on
// the world. Verifies the shared seed, block edits propagating both ways,
// player presence, chat, a synced clock, and persistence across a reconnect.
//
//   node orebound/tools/multiplayer.mjs

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.OREBOUND_URL || 'http://localhost:8123/';

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
const errors = [];

const browser = await chromium.launch({
  executablePath: existsSync(EXE) ? EXE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

/** Boot a page and join the shared world under `name`. */
async function joinAs(name) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${name}] ` + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${name}] ` + m.text());
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.ui);
  await page.evaluate((n) => window.game.startOnline(n), name);
  await page.waitForFunction(() => window.game.started === true, null, { timeout: 180000 });
  await page.evaluate(() => { window.game.controls.requestLock = () => { }; if (window.game.ui.isOpen) window.game.ui.close(); });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

console.log('joining as Alice...');
const a = await joinAs('Alice');
console.log('joining as Bob...');
const b = await joinAs('Bob');
await a.page.waitForTimeout(3000);

// ---------------------------------------------------------- shared world
const seeds = await Promise.all([a, b].map(c => c.page.evaluate(() => window.game.world.seed)));
check('both clients share one seed', seeds[0] === seeds[1], `${seeds[0]} / ${seeds[1]}`);

const connected = await Promise.all([a, b].map(c => c.page.evaluate(() => window.game.net.connected)));
check('both clients are connected', connected.every(Boolean));

// --------------------------------------------------------- player presence
await a.page.waitForTimeout(2500);
const rosters = await Promise.all([a, b].map(c => c.page.evaluate(() =>
  [...window.game.net.players.values()].map(p => p.name))));
console.log('rosters:', JSON.stringify(rosters));
check('Alice sees Bob', rosters[0].includes('Bob'), rosters[0].join(','));
check('Bob sees Alice', rosters[1].includes('Alice'), rosters[1].join(','));

// remote positions must actually track: move Alice and watch Bob's copy
const before = await b.page.evaluate(() => {
  const r = [...window.game.net.players.values()][0];
  return r ? { x: r.x, z: r.z } : null;
});
await a.page.evaluate(() => { const p = window.game.player; p.x += 12; p.z += 6; p.px = p.x; p.pz = p.z; });
await a.page.waitForTimeout(1600);
const after = await b.page.evaluate(() => {
  const r = [...window.game.net.players.values()][0];
  return r ? { x: r.x, z: r.z } : null;
});
check('remote position updates propagate',
  !!before && !!after && Math.hypot(after.x - before.x, after.z - before.z) > 5,
  before && after ? `moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)} blocks` : 'no remote');

// ------------------------------------------------------------ block edits
const spot = await a.page.evaluate(async () => {
  const g = window.game, w = g.world;
  const { blockId } = await import('/src/core/blocks.js');
  const x = Math.floor(g.player.x) + 5, z = Math.floor(g.player.z) + 5;
  const y = w.topSolid(x, z) + 1;
  w.setBlock(x, y, z, blockId('diamond_block'));
  return { x, y, z };
});
await b.page.waitForTimeout(1800);
const sawEdit = await b.page.evaluate(async (s) => {
  const { BLOCKS } = await import('/src/core/blocks.js');
  return BLOCKS[window.game.world.getBlock(s.x, s.y, s.z)].name;
}, spot);
check("Alice's placement appears for Bob", sawEdit === 'diamond_block', sawEdit);

// and back the other way, including a removal
const spot2 = await b.page.evaluate(async (s) => {
  const g = window.game, w = g.world;
  const { blockId } = await import('/src/core/blocks.js');
  w.setBlock(s.x, s.y, s.z, blockId('air'));
  const x = s.x + 2;
  w.setBlock(x, s.y, s.z, blockId('gold_block'));
  return { x, y: s.y, z: s.z };
}, spot);
await a.page.waitForTimeout(1800);
// page.evaluate passes exactly one argument, so both spots go in together
const sawBack = await a.page.evaluate(async ({ s, s2 }) => {
  const { BLOCKS } = await import('/src/core/blocks.js');
  return {
    removed: BLOCKS[window.game.world.getBlock(s.x, s.y, s.z)].name,
    placed: BLOCKS[window.game.world.getBlock(s2.x, s2.y, s2.z)].name,
  };
}, { s: spot, s2: spot2 });
check("Bob's removal appears for Alice", sawBack.removed === 'air', sawBack.removed);
check("Bob's placement appears for Alice", sawBack.placed === 'gold_block', sawBack.placed);

// ------------------------------------------------------------------- chat
await a.page.evaluate(() => window.game.net.sendChat('hello from alice'));
await b.page.waitForTimeout(1200);
const bobChat = await b.page.evaluate(() => window.game.net.chat.map(c => c.from + ':' + c.text));
check('chat reaches the other player',
  bobChat.some(c => c.includes('hello from alice')), bobChat.slice(-2).join(' | '));

// ------------------------------------------------------------- world clock
const times = await Promise.all([a, b].map(c => c.page.evaluate(() => window.game.world.time)));
check('world clocks agree', Math.abs(times[0] - times[1]) < 60, `${times[0]} vs ${times[1]}`);

// --------------------------------------------------------- persistence
// a third client joining later must receive the accumulated edit log
console.log('joining as Carol (late)...');
const c = await joinAs('Carol');
await c.page.waitForTimeout(2500);
const carolSees = await c.page.evaluate(async (s2) => {
  const { BLOCKS } = await import('/src/core/blocks.js');
  return BLOCKS[window.game.world.getBlock(s2.x, s2.y, s2.z)].name;
}, spot2);
check('a late joiner receives the edit log', carolSees === 'gold_block', carolSees);

const carolSeed = await c.page.evaluate(() => window.game.world.seed);
check('late joiner gets the same seed', carolSeed === seeds[0]);

const carolRoster = await c.page.evaluate(() => [...window.game.net.players.values()].map(p => p.name).sort());
check('late joiner sees both players',
  carolRoster.includes('Alice') && carolRoster.includes('Bob'), carolRoster.join(','));

// ------------------------------------------------------------- disconnect
await b.ctx.close();
await a.page.waitForTimeout(2500);
const afterLeave = await a.page.evaluate(() => [...window.game.net.players.values()].map(p => p.name));
check('leaving removes the player', !afterLeave.includes('Bob'), afterLeave.join(',') || '(none)');

check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));

await a.ctx.close();
await c.ctx.close();
await browser.close();

console.log('\n--- multiplayer checks ---');
let failed = 0;
for (const ch of checks) {
  console.log(`${ch.ok ? 'PASS' : 'FAIL'}  ${ch.name}${ch.detail ? '  (' + ch.detail + ')' : ''}`);
  if (!ch.ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
