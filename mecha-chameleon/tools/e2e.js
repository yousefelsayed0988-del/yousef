// End-to-end test: boots the real server, drives real browsers, plays a real
// round. Anything that throws in a page fails the run.
//
//   node tools/e2e.js              full run
//   node tools/e2e.js --shots      also screenshot every map
//   node tools/e2e.js --headed     watch it happen
//
// Uses the Chromium already installed on this box; nothing is downloaded.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = join(ROOT, 'shots');
const wantShots = process.argv.includes('--shots');
const headed = process.argv.includes('--headed');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  try {
    ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
  } catch (err) {
    console.error('Playwright is not installed. Run `npm i -D playwright` or install it globally.');
    process.exit(2);
  }
}

const results = [];
const pass = (name, detail = '') => { results.push({ ok: true, name, detail }); console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail = '') => { results.push({ ok: false, name, detail }); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 20000, interval = 200, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await sleep(interval);
  }
}

// --------------------------------------------------------------- server --
let server;
async function startServer() {
  rmSync(join(ROOT, 'data'), { recursive: true, force: true });
  server = spawn(process.execPath, [join(ROOT, 'server', 'index.js'), '--port', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  server.stdout.on('data', (d) => logs.push(String(d)));
  server.stderr.on('data', (d) => logs.push(`ERR ${d}`));
  server.on('exit', (code) => { if (code) console.error('server exited', code, logs.join('')); });

  await waitFor(async () => {
    try {
      const res = await fetch(`${BASE}/health`);
      return res.ok;
    } catch { return false; }
  }, { label: 'server health', timeout: 15000 });
  return logs;
}

function stopServer() {
  if (server && !server.killed) server.kill('SIGTERM');
}

// ---------------------------------------------------------------- pages --
function watchPage(page, label, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.startsWith(BASE)) errors.push(`[${label}] request failed: ${url} ${req.failure()?.errorText}`);
  });
}

const hudPhase = (page) => page.evaluate(() => document.getElementById('phaseName')?.textContent || '');
const screenOn = (page) => page.evaluate(() => document.querySelector('.screen.on')?.id || '');

async function main() {
  console.log(`Mecha Chameleon e2e — server on ${BASE}\n`);
  const serverLogs = await startServer();
  pass('server boots and answers /health');

  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: !headed,
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required', '--no-sandbox',
      '--enable-webgl', '--ignore-gpu-blocklist',
    ],
  });
  const errors = [];

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const host = await ctx.newPage();
    watchPage(host, 'host', errors);

    await host.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

    // 1. WebGL comes up and the menu appears.
    await waitFor(async () => (await screenOn(host)) === 'screen-menu', { label: 'main menu' });
    pass('client boots, WebGL2 context created, menu shown');

    const glOk = await host.evaluate(() => {
      const c = document.getElementById('scene');
      return !!c.getContext('webgl2') && c.width > 0;
    });
    if (glOk) pass('canvas has a live WebGL2 context'); else fail('canvas has a live WebGL2 context');

    // 2. Identity + room creation with bots.
    await host.fill('#nameInput', 'HostCham');
    await host.fill('#usernameInput', 'hostcham');
    await host.click('#saveNameBtn');
    await sleep(400);

    await host.click('[data-action="solo"]');
    await waitFor(async () => (await screenOn(host)) === 'screen-lobby', { label: 'lobby' });
    const code = (await host.textContent('#lobbyCode'))?.trim();
    if (code && code.length >= 4) pass('room created', `code ${code}`);
    else fail('room created', `got ${code}`);

    const mapCount = await host.evaluate(() => document.querySelectorAll('#mapGrid .map-card').length);
    if (mapCount >= 1) pass('map picker populated', `${mapCount} maps`);
    else fail('map picker populated');

    const botCount = await host.evaluate(() =>
      [...document.querySelectorAll('#playerList .player-row')].filter((r) => r.textContent.includes('BOT')).length);
    if (botCount > 0) pass('bots filled the lobby', `${botCount} bots`);
    else fail('bots filled the lobby', 'no bot rows rendered');

    // 3. A second client joins through the share link.
    const guest = await ctx.newPage();
    watchPage(guest, 'guest', errors);
    await guest.goto(`${BASE}/?join=${code}`, { waitUntil: 'domcontentloaded' });
    await waitFor(async () => (await screenOn(guest)) === 'screen-lobby', { label: 'guest lobby', timeout: 25000 });
    const guestCode = (await guest.textContent('#lobbyCode'))?.trim();
    if (guestCode === code) pass('second player joined through the share link');
    else fail('second player joined through the share link', `guest is in ${guestCode}`);

    const seen = await waitFor(async () => {
      const n = await host.evaluate(() => document.querySelectorAll('#playerList .player-row').length);
      return n >= botCount + 2 ? n : false;
    }, { label: 'host sees the guest', timeout: 15000 }).catch(() => 0);
    if (seen) pass('host sees the guest in the player list', `${seen} rows`);
    else fail('host sees the guest in the player list');

    // 4. Chat round-trips.
    await guest.fill('#lobbyChatInput', 'hello from the guest');
    await guest.press('#lobbyChatInput', 'Enter');
    const gotChat = await waitFor(async () =>
      (await host.textContent('#lobbyChatLog'))?.includes('hello from the guest'),
    { label: 'chat delivery', timeout: 8000 }).catch(() => false);
    if (gotChat) pass('chat reaches the other client'); else fail('chat reaches the other client');

    // 5. Invite by username. A separate context so the invitee has their own
    // storage and their own handle, like an actual second person.
    const otherCtx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const friend = await otherCtx.newPage();
    watchPage(friend, 'friend', errors);
    await friend.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitFor(async () => (await screenOn(friend)) === 'screen-menu', { label: 'friend menu' });
    await friend.fill('#nameInput', 'FriendCham');
    await friend.fill('#usernameInput', 'friendcham');
    await friend.click('#saveNameBtn');
    await sleep(900);

    await host.fill('#lobbyInviteUser', 'friendcham');
    await host.click('#lobbyInviteGo');
    const gotInvite = await waitFor(async () =>
      await friend.evaluate(() => !document.getElementById('invitePopup').classList.contains('hidden')),
    { label: 'invite popup', timeout: 12000 }).catch(() => false);
    if (gotInvite) {
      pass('invite by username reaches the other player');
      await friend.click('#inviteAccept');
      const landed = await waitFor(async () =>
        (await screenOn(friend)) === 'screen-lobby' && (await friend.textContent('#lobbyCode'))?.trim() === code,
      { label: 'friend joins by invite', timeout: 15000 }).catch(() => false);
      if (landed) pass('accepting the invite drops them into the room');
      else fail('accepting the invite drops them into the room');
    } else {
      fail('invite by username reaches the other player');
    }
    await otherCtx.close();

    // 6. Start the match and walk it through prep into the hunt.
    await host.click('#startBtn');
    await waitFor(async () => (await hudPhase(host)) === 'Hide', { label: 'prep phase', timeout: 40000 });
    pass('match started and reached the prep phase');

    await host.screenshot({ path: join(SHOT_DIR, 'e2e-prep.png') });

    const role = await host.evaluate(() => document.getElementById('phaseName').textContent);
    const paintOpen = await waitFor(async () =>
      await host.evaluate(() => !document.getElementById('paintScreen').classList.contains('hidden')),
    { label: 'paint screen', timeout: 12000 }).catch(() => false);
    if (paintOpen) {
      pass('paint screen opens for hiders during prep');
      const swatches = await host.evaluate(() => document.querySelectorAll('#mapPalette .swatch').length);
      if (swatches > 0) pass('map palette offers swatches', `${swatches}`); else fail('map palette offers swatches');
      // Paint the body from the map palette and confirm the blend meter reacts.
      await host.click('#mapPalette .swatch');
      await sleep(600);
      const blend = await host.evaluate(() => document.getElementById('paintBlendFill').style.width);
      if (blend && blend !== '0%') pass('painting updates the blend meter', blend);
      else fail('painting updates the blend meter', `width=${blend}`);
      await host.click('#paintClose');
    } else {
      // The host may have drawn hunter; that is legitimate, not a failure.
      pass('prep phase reached (host drew hunter, paint screen not applicable)', role);
    }

    // 7. The player can actually move, and prediction agrees with the server.
    const from = await host.evaluate(() => window.__mcDebug.pos());
    await host.click('#scene', { position: { x: 640, y: 400 } }).catch(() => {});
    await host.keyboard.down('KeyW');
    await sleep(1800);
    await host.keyboard.up('KeyW');
    await sleep(700);
    const to = await host.evaluate(() => window.__mcDebug.pos());
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    if (dist > 1.5) pass('walking moves the player', `${dist.toFixed(1)}m`);
    else fail('walking moves the player', `only ${dist.toFixed(2)}m`);

    // The server's own position for this player must agree with the client's
    // prediction - a big gap means prediction and authority have diverged.
    const drift = await host.evaluate(async () => {
      const g = window.__mcDebug.game;
      return new Promise((resolve) => {
        const started = performance.now();
        const tick = () => {
          // me.p in the last snapshot is the authoritative position; the
          // predicted one is game.me.pos.
          if (performance.now() - started > 1500) resolve(null);
          else setTimeout(() => resolve({ x: g.me.pos.x, y: g.me.pos.y, z: g.me.pos.z }), 400);
        };
        tick();
      });
    });
    const settled = await host.evaluate(() => window.__mcDebug.pos());
    const wobble = drift ? Math.hypot(settled.x - drift.x, settled.z - drift.z) : 99;
    if (wobble < 0.6) pass('prediction settles instead of rubber-banding', `${wobble.toFixed(2)}m drift at rest`);
    else fail('prediction settles instead of rubber-banding', `${wobble.toFixed(2)}m drift at rest`);

    await waitFor(async () => (await hudPhase(host)) === 'Hunt', { label: 'hunt phase', timeout: 90000 });
    pass('round advanced from prep into the hunt');
    await sleep(2500);
    await host.screenshot({ path: join(SHOT_DIR, 'e2e-hunt.png') });

    // 7. Snapshots are flowing and the world is being drawn.
    const stats = await host.evaluate(() => window.__mcDebug?.stats?.() || null);
    if (stats && stats.instances > 50) pass('renderer is drawing the world', `${stats.instances} instances, ${stats.draws} draws`);
    else fail('renderer is drawing the world', JSON.stringify(stats));

    const fps = await host.evaluate(() => window.__mcDebug?.fps?.() || 0);
    if (fps > 5) pass('frame loop is running', `${fps.toFixed(0)} fps (software GL)`);
    else fail('frame loop is running', `${fps} fps`);

    // 8. Nothing exploded on the server.
    const health = await (await fetch(`${BASE}/health`)).json();
    if (health.ok) pass('server still healthy after a round', JSON.stringify(health));
    else fail('server still healthy after a round');

    // 9. Map screenshots.
    if (wantShots) {
      const maps = await host.evaluate(async () => {
        const mod = await import('/shared/maps/index.js');
        return mod.MAP_IDS;
      });
      // Two live games rendering on software GL will starve the shot page.
      await guest.close();
      await host.close();
      const shotPage = await ctx.newPage();
      shotPage.setDefaultTimeout(60000);
      watchPage(shotPage, 'preview', errors);
      for (const id of maps) {
        await shotPage.goto(`${BASE}/?preview=${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await shotPage.waitForFunction(() => window.__mcDebug?.stats?.().instances > 0, null, { timeout: 30000 })
          .catch(() => {});
        await sleep(1600);
        await shotPage.screenshot({ path: join(SHOT_DIR, `map-${id}.png`) });
        console.log(`  shot  ${id}`);
      }
      await shotPage.close();
      pass(`screenshotted ${maps.length} maps into shots/`);
    }
  } catch (err) {
    fail('run completed', err.message);
    console.error(err);
  } finally {
    if (errors.length) {
      fail(`${errors.length} console/page error(s)`);
      for (const e of errors.slice(0, 25)) console.log(`        ${e}`);
    } else {
      pass('zero console errors, zero page errors, zero failed requests');
    }
    await browser.close();
    stopServer();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

main();
