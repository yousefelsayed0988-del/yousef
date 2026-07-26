const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/yousef';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (p === '/index.html') body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;', 'window.__QA__=1;'), 'utf8');
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  res.end(body);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(22000);
  const out = await page.evaluate(() => {
    const L = []; const push = (...a) => L.push(a.join(' '));
    const floors = [];
    for (let gy = 1; gy < MH - 1; gy++) for (let gx = 1; gx < MW - 1; gx++) if (!solid(gx, gy)) floors.push({ x: gx, y: gy });
    let spot = null;
    for (const f of floors) { let ok = true; for (let k = 1; k <= 6; k++) if (solid(f.x + k, f.y)) { ok = false; break; } if (ok) { spot = f; break; } }
    setMode('play'); P.alive = true; P.hidden = null; V.active = true; V.stun = 0; V.busy = 0; S.mic = false;
    P.x = spot.x + 0.5; P.z = spot.y + 0.5; P.ang = 0; P.pitch = 0; P.crouch = 0; P.crouchT = 0; P.moving = 0; P.sprinting = false; P.torch = false;
    // put him ~14 m away, no LOS preferred
    let pick = null;
    for (const f of floors) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z); if (d > 12 && d < 16 && !hasLOS(P.x, P.z, f.x + .5, f.y + .5)) { pick = f; break; } }
    if (!pick) for (const f of floors) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z); if (d > 12 && d < 16) { pick = f; break; } }
    V.x = pick.x + 0.5; V.z = pick.y + 0.5;
    resetMind();
    THROWN.length = 0; LURES.length = 0; WARDS.length = 0; BLOODTRAIL.length = 0;
    NOISE.level = 0; NOISE.move = 0; NOISE.step = 0; NOISE.mic = 0;
    P.bottles = 5;
    const pcell = Math.floor(P.x) + ',' + Math.floor(P.z);
    push('=== BOTTLE (he is', Math.hypot(V.x - P.x, V.z - P.z).toFixed(1), 'm away, LOS', hasLOS(P.x, P.z, V.x, V.z), ') ===');
    throwBottle();
    for (let i = 0; i < 20; i++) {
      updateThrown(0.05);
      const e = THROWN.find(t => t.kind === 'echo');
      if (e) {
        const lvl = NOISE.level;
        updateBoons(0.05); updateVillain(0.05);
        push(' bottle landed at cell', Math.floor(e.x) + ',' + Math.floor(e.z), '| player cell', pcell);
        push(' NOISE.level =', lvl.toFixed(2), '| after one AI tick: conf =', V.mind.conf.toFixed(2),
          '| lastKnown =', V.mind.lastKnown ? V.mind.lastKnown.x + ',' + V.mind.lastKnown.y : 'null',
          '| state =', V.state);
        break;
      }
    }
    // let him run 6 s and see where he heads
    const d0 = Math.hypot(V.x - P.x, V.z - P.z);
    for (let i = 0; i < 120; i++) { updateNoise(0.05); updateThrown(0.05); updateBoons(0.05); updateVillain(0.05); }
    push(' 6 s later he is', Math.hypot(V.x - P.x, V.z - P.z).toFixed(1), 'm from the player (was', d0.toFixed(1), '), state', V.state, 'conf', V.mind.conf.toFixed(2));

    // === music box realistic geometry: player stands near a cell corner
    push('=== MUSIC BOX (realistic) ===');
    THROWN.length = 0; LURES.length = 0; V.busy = 0; V.stun = 0;
    for (const it of items) if (it.type === 'boxSet') it.live = false;
    P.x = spot.x + 0.95; P.z = spot.y + 0.95; P.boxes = 1; P.hidden = null;
    placeMusicBox();
    const box = THROWN.find(t => t.kind === 'box');
    updateThrown(0.05);
    const lure = LURES.find(l => l.kind === 'box');
    const gx = Math.floor(lure.x), gy = Math.floor(lure.z);
    // he stands 0.85 from the cell centre, on the far side -> "arrived" for the AI
    V.x = gx + 0.5 - 0.6; V.z = gy + 0.5 - 0.6;
    push(' AI arrival dist to cell centre =', Math.hypot(gx + .5 - V.x, gy + .5 - V.z).toFixed(2), '(needs < 0.9)',
      '| actual dist to box =', Math.hypot(V.x - box.x, V.z - box.z).toFixed(2), '(updateThrown needs < 0.85)');
    let smashCalls = 0; const realSmash = SFX.doorSmash; SFX.doorSmash = function () { smashCalls++; };
    let chimes = 0; const realChime = SFX.musicBox; SFX.musicBox = function () { chimes++; };
    // emulate the AI investigate branch firing whenever it would
    for (let i = 0; i < 900; i++) {   // 45 s
      updateThrown(0.05);
      const l = LURES.find(x => x.kind === 'box');
      if (V.busy > 0) { V.busy = Math.max(0, V.busy - 0.05); continue; }   // he sits still while busy
      if (l && Math.hypot(Math.floor(l.x) + .5 - V.x, Math.floor(l.z) + .5 - V.z) < 0.9) { V.busy = 6.0; smashLureAt(l); }
    }
    SFX.doorSmash = realSmash; SFX.musicBox = realChime;
    push(' over the box\'s 45 s life: smashLureAt fired', smashCalls, 'times; music chimed', chimes, 'times;',
      'box still in THROWN =', THROWN.includes(box));
    return L;
  });
  console.log(out.join('\n'));
  await browser.close(); server.close(); process.exit(0);
})();
