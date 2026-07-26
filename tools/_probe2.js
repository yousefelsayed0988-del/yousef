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
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(22000);

  const out = await page.evaluate(() => {
    const L = []; const push = (...a) => L.push(a.join(' '));

    // find a long clear corridor so the bottle actually travels
    const floors = [];
    for (let gy = 1; gy < MH - 1; gy++) for (let gx = 1; gx < MW - 1; gx++)
      if (!solid(gx, gy)) floors.push({ x: gx, y: gy });
    // pick a cell with 6 clear cells to the east
    let spot = null, ang = 0;
    for (const f of floors) {
      let ok = true;
      for (let k = 1; k <= 6; k++) if (solid(f.x + k, f.y)) { ok = false; break; }
      if (ok) { spot = f; ang = 0; break; }
    }
    setMode('play'); P.alive = true; P.hidden = null; V.active = true; V.stun = 0; V.busy = 0;
    P.x = spot.x + 0.5; P.z = spot.y + 0.5; P.ang = 0; P.pitch = 0;
    P.crouch = 0; P.crouchT = 0; P.moving = 0; P.sprinting = false;
    // put him far away with no line of sight to the player if possible
    let far = floors[0], bd = 0;
    for (const f of floors) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z); if (d > bd) { bd = d; far = f; } }
    V.x = far.x + 0.5; V.z = far.y + 0.5;
    resetMind();
    THROWN.length = 0; LURES.length = 0; WARDS.length = 0; BLOODTRAIL.length = 0;
    NOISE.level = 0; NOISE.move = 0; NOISE.step = 0; NOISE.mic = 0;
    S.mic = false;
    P.bottles = 5;
    const pcell = Math.floor(P.x) + ',' + Math.floor(P.z);
    push('=== BOTTLE ===');
    push('player at', pcell, 'V at', Math.floor(V.x) + ',' + Math.floor(V.z), 'dist', bd.toFixed(1),
      'LOS', hasLOS(P.x, P.z, V.x, V.z), 'conf before', V.mind.conf.toFixed(3));
    throwBottle();
    let rec = null;
    for (let i = 0; i < 20 && !rec; i++) {
      updateThrown(0.05);
      const e = THROWN.find(t => t.kind === 'echo');
      if (e) {
        const lvlAtSmash = NOISE.level;
        updateBoons(0.05);
        updateVillain(0.05);
        rec = { echo: Math.floor(e.x) + ',' + Math.floor(e.z), lvl: lvlAtSmash,
                conf: V.mind.conf, lk: V.mind.lastKnown && (V.mind.lastKnown.x + ',' + V.mind.lastKnown.y),
                heardAt: NOISE.heardAt && (NOISE.heardAt.x + ',' + NOISE.heardAt.y), st: V.state };
      }
    }
    push('bottle smashed at cell', rec.echo, '(player is at', pcell + ')');
    push('  NOISE.level at smash =', rec.lvl.toFixed(2));
    push('  after one updateVillain: conf =', rec.conf.toFixed(3),
      ' lastKnown =', rec.lk, ' NOISE.heardAt =', rec.heardAt, ' state =', rec.st);

    // === V.busy exact drain, with the door-smash path disabled
    push('=== V.busy ===');
    resetMind(); V.stun = 0; V.smashDoor = null;
    V.busy = 6.0;
    let n = 0;
    while (V.busy > 0 && n < 500) { updateBoons(0.05); if (V.busy <= 0) break; const b0 = V.busy; V.busy -= 0.05; n++; if (V.busy <= 0) break; }
    push('  (manual model) 6.0s at 2x per frame ->', (n * 0.05).toFixed(2), 's');
    // real: instrument
    resetMind(); V.stun = 0; V.busy = 6.0; V.smashDoor = null;
    let frames = 0; const trace = [];
    for (let i = 0; i < 500; i++) {
      const before = V.busy;
      updateBoons(0.05);
      const mid = V.busy;
      updateVillain(0.05);
      const after = V.busy;
      if (i < 3) trace.push(before.toFixed(3) + '->' + mid.toFixed(3) + '->' + after.toFixed(3));
      frames++;
      if (after <= 0) break;
    }
    push('  real: V.busy 6.0 gone after', frames, 'frames of 0.05s =', (frames * 0.05).toFixed(2), 's');
    push('  per-frame trace (before->afterBoons->afterVillain):', trace.join('  '));

    // === music box
    push('=== MUSIC BOX ===');
    setMode('play'); P.alive = true; V.busy = 0; V.stun = 0; V.active = true;
    THROWN.length = 0; LURES.length = 0;
    for (const it of items) if (it.type === 'boxSet') it.live = false;
    P.boxes = 1; P.hidden = null;
    placeMusicBox();
    const box = THROWN.find(t => t.kind === 'box');
    updateThrown(0.05);
    const lure = LURES.find(l => l.kind === 'box');
    // stand him 1.2m off the box (inside the AI's 0.9 arrival radius of the CELL, outside updateThrown's 0.85)
    V.x = box.x + 1.2; V.z = box.z;
    push('  V is', Math.hypot(V.x - box.x, V.z - box.z).toFixed(2), 'm from the box;',
      'AI arrival test on cell centre =', Math.hypot(Math.floor(lure.x) + 0.5 - V.x, Math.floor(lure.z) + 0.5 - V.z).toFixed(2), '(< 0.9 arrives)');
    smashLureAt(lure);
    push('  after smashLureAt: in THROWN =', THROWN.includes(box), 'smashT =', box.smashT,
      'bogus .until =', box.until, 'boxSet visible =', items.some(i => i.type === 'boxSet' && i.live));
    let chimes = 0; const real = SFX.musicBox; SFX.musicBox = function () { chimes++; };
    for (let i = 0; i < 200; i++) updateThrown(0.05);   // 10 s
    SFX.musicBox = real;
    push('  10s later: box still in THROWN =', THROWN.includes(box), 'life =', box.life.toFixed(1),
      'chimes since "the music stops" =', chimes, 'still a LURE =', LURES.some(l => l.kind === 'box'));

    return L;
  });
  console.log(out.join('\n'));
  await browser.close(); server.close(); process.exit(0);
})();
