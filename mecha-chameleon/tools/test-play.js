// One page, one player, one round: the fastest proof that the game is actually
// playable rather than merely rendering. Deliberately avoids opening several
// browser contexts - on a software renderer they starve each other badly enough
// that the timings stop meaning anything.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/test-play.js

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PLAY_PORT || 8137);
const BASE = `http://127.0.0.1:${PORT}`;

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

let failures = 0;
const pass = (n, d = '') => console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
const fail = (n, d = '') => { failures++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 30000, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js'), '--port', String(PORT)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => server.kill());

await waitFor(async () => (await fetch(`${BASE}/health`).catch(() => null))?.ok, { label: 'server' });
pass('server up');

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const screen = () => page.evaluate(() => document.querySelector('.screen.on')?.id);
const phase = () => page.evaluate(() => window.__mcDebug?.phase());

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await screen()) === 'screen-menu', { label: 'menu' });
  await page.click('[data-action="solo"]');
  await waitFor(async () => (await screen()) === 'screen-lobby', { label: 'lobby' });
  pass('solo room created');

  await page.click('#startBtn');
  await waitFor(async () => (await phase()) === 2, { label: 'prep phase', timeout: 60000 });
  pass('reached the prep phase');

  // Close the paint screen if it opened for us.
  await page.evaluate(() => {
    const s = document.getElementById('paintScreen');
    if (s && !s.classList.contains('hidden')) document.getElementById('paintClose').click();
  });
  await sleep(400);
  const role = await page.evaluate(() => window.__mcDebug.game.me.role);
  pass('a role was drawn', role === 1 ? 'hider' : role === 2 ? 'hunter' : `role ${role}`);

  // Painting from the map's own palette must move the camouflage score.
  const blend = await page.evaluate(async () => {
    const g = window.__mcDebug.game;
    const start = window.__mcDebug.blend()?.score ?? 0;
    const swatch = g.mapDef.palette[0];
    for (const part of ['body', 'head', 'legs', 'tail', 'crest']) g.paint[part] = swatch.slice();
    g.sendPaint();
    await new Promise((r) => setTimeout(r, 500));
    return { start, end: window.__mcDebug.blend()?.score ?? 0 };
  });
  if (blend.end !== blend.start) {
    pass('painting changes the camouflage score',
      `${(blend.start * 100).toFixed(0)}% -> ${(blend.end * 100).toFixed(0)}%`);
  } else fail('painting changes the camouflage score', `stuck at ${blend.end}`);

  await waitFor(async () => (await phase()) === 3, { label: 'hunt phase', timeout: 90000 });
  pass('the hunt begins');

  // Movement is tested here rather than during prep: hunters are deliberately
  // frozen until the release, so a prep-phase walk test passes or fails on the
  // role the round happened to draw.
  await waitFor(async () => await page.evaluate(() => window.__mcDebug.game.released),
    { label: 'hunters released', timeout: 20000 });
  // Face whichever way is actually open before walking - spawns point in a
  // random direction, and "did not move" against a wall proves nothing.
  const heading = await page.evaluate(async () => {
    const { raycast } = await import('/shared/collision.js');
    const g = window.__mcDebug.game;
    const eye = { x: g.me.pos.x, y: g.me.pos.y + 1.0, z: g.me.pos.z };
    let bestYaw = 0, bestClear = -1;
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
      const hit = raycast(g.world, eye, dir, 12, {});
      const clear = hit.hit ? hit.t : 12;
      if (clear > bestClear) { bestClear = clear; bestYaw = yaw; }
    }
    g.input.setAngles(bestYaw, 0);
    return { yaw: bestYaw, clear: bestClear };
  });

  // Time the walk inside the page. Under a software renderer the keyup can
  // land seconds after the test asked for it, so wall-clock here would make
  // the resulting speed meaningless.
  // The key event is dispatched from inside the page rather than through the
  // driver: it lands on the same window listener a real key does, without
  // depending on which element the harness happened to leave focused.
  const before = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    return { ...window.__mcDebug.pos(), t: performance.now(), held: window.__mcDebug.game.input.isDown('forward') };
  });
  if (before.held) pass('the movement key registers');
  else fail('the movement key registers', 'keydown never reached the input layer');

  await sleep(2000);
  const after = await page.evaluate(() => {
    const p = { ...window.__mcDebug.pos(), t: performance.now() };
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    return p;
  });

  const dist = Math.hypot(after.x - before.x, after.z - before.z);
  const seconds = (after.t - before.t) / 1000;
  const speed = dist / Math.max(seconds, 0.001);
  // Walking speed, with room for the sprint multiplier and a slice of banked
  // input either side. Far above that means the client is out-simulating the
  // server; near zero means input is not reaching the simulation at all.
  if (speed > 1.0 && speed < 12) pass('walking moves the player at a sane speed', `${speed.toFixed(1)} m/s over ${seconds.toFixed(1)}s`);
  else fail('walking moves the player at a sane speed', `${speed.toFixed(1)} m/s (${dist.toFixed(1)}m in ${seconds.toFixed(1)}s), ${heading.clear.toFixed(1)}m clearance ahead`);

  // At rest the predicted position must stop moving. A steady drift here is
  // prediction and authority disagreeing, which a player feels as rubber-band.
  const rest1 = await page.evaluate(() => window.__mcDebug.pos());
  await sleep(1200);
  const rest2 = await page.evaluate(() => window.__mcDebug.pos());
  const drift = Math.hypot(rest2.x - rest1.x, rest2.z - rest1.z);
  if (drift < 0.35) pass('prediction settles at rest', `${drift.toFixed(3)}m over 1.2s`);
  else fail('prediction settles at rest', `${drift.toFixed(2)}m drift`);

  // Somebody has to become visible during the round. If the visibility filter
  // were inverted, a player would never receive anyone at all.
  const sawSomeone = await waitFor(async () =>
    await page.evaluate(() => window.__mcDebug.others().length > 0),
  { label: 'other players', timeout: 45000 }).catch(() => false);
  if (sawSomeone) pass('other players are received and drawn');
  else fail('other players are received and drawn', 'nobody ever appeared in a snapshot');

  const stats = await page.evaluate(() => window.__mcDebug.stats());
  if (stats.instances > 100) pass('world is being rendered', `${stats.instances} instances`);
  else fail('world is being rendered', JSON.stringify(stats));

  if (!errors.length) pass('no console or page errors');
  else {
    fail(`${errors.length} console/page error(s)`);
    errors.slice(0, 8).forEach((e) => console.log(`        ${e}`));
  }
} catch (err) {
  fail('run completed', err.message);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed.'}`);
process.exit(failures ? 1 : 0);
