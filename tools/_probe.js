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
  const fatal = [];
  page.on('pageerror', e => fatal.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(22000);

  const out = await page.evaluate(() => {
    const L = [];
    const push = (...a) => L.push(a.join(' '));

    // --- spawn pool: duplicates?
    const cells = items.map(i => Math.floor(i.y) * MW + Math.floor(i.x));
    const counts = {};
    for (const c of cells) counts[c] = (counts[c] | 0) + 1;
    const dup = Object.entries(counts).filter(([k, v]) => v > 1);
    push('items spawned:', items.length, 'distinct cells:', new Set(cells).size, 'dup cells:', dup.length);
    push('NOTES', NOTES.length, 'LEDGER', LEDGER.length);

    // --- P.bleed ever set? search source
    push('P.bleed at start =', P.bleed);

    // --- bottle throw: does it point him at the player?
    setMode('play'); P.alive = true; P.hidden = null; V.active = true; V.stun = 0; V.busy = 0;
    // put them far apart on floor
    const floors = [];
    for (let gy = 1; gy < MH - 1; gy++) for (let gx = 1; gx < MW - 1; gx++)
      if (!solid(gx, gy)) floors.push({ x: gx, y: gy });
    P.x = floors[0].x + 0.5; P.z = floors[0].y + 0.5;
    let far = floors[0];
    for (const f of floors) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z); if (d > 12) { far = f; break; } }
    V.x = far.x + 0.5; V.z = far.y + 0.5;
    resetMind();
    THROWN.length = 0; LURES.length = 0; WARDS.length = 0; BLOODTRAIL.length = 0;
    NOISE.level = 0; NOISE.move = 0; NOISE.step = 0; NOISE.mic = 0;
    P.moving = 0; P.sprinting = false; P.crouch = 1; P.crouchT = 1;
    P.bottles = 5;
    push('before throw: conf =', V.mind.conf.toFixed(3), 'V-P dist =', Math.hypot(V.x - P.x, V.z - P.z).toFixed(2));
    throwBottle();
    // simulate exactly what the main loop does, per frame
    const px = Math.floor(P.x), pz = Math.floor(P.z);
    let smashFrame = -1, confAfter = null, lkAfter = null;
    for (let i = 0; i < 60; i++) {
      updatePlayer(0.05);     // recomputes NOISE.level from movement (0)
      updateThrown(0.05);
      updateBoons(0.05);
      updateVillain(0.05);
      if (smashFrame < 0 && THROWN.some(t => t.kind === 'echo')) {
        smashFrame = i;
        confAfter = V.mind.conf;
        lkAfter = V.mind.lastKnown && (V.mind.lastKnown.x + ',' + V.mind.lastKnown.y);
      }
    }
    const echo = THROWN.find(t => t.kind === 'echo');
    push('bottle: smashFrame', smashFrame, 'conf after smash =', confAfter, 'lastKnown =', lkAfter,
      'player cell =', px + ',' + pz, 'echo cell =', echo ? Math.floor(echo.x) + ',' + Math.floor(echo.z) : 'gone',
      'V.state =', V.state);

    // --- V.busy double decrement
    resetMind(); V.busy = 6.0; V.stun = 0;
    let ticks = 0;
    for (let i = 0; i < 400 && V.busy > 0; i++) { updateBoons(0.05); updateVillain(0.05); ticks++; }
    push('V.busy=6.0 drained after', ticks, 'ticks of 0.05s =', (ticks * 0.05).toFixed(2), 'seconds');

    // --- music box: does smashLureAt actually kill it?
    setMode('play'); P.alive = true; V.busy = 0; V.stun = 0;
    THROWN.length = 0; LURES.length = 0;
    for (const it of items) if (it.type === 'boxSet') it.live = false;
    P.boxes = 1;
    placeMusicBox();
    const box = THROWN.find(t => t.kind === 'box');
    push('box placed at', box.x.toFixed(2), box.z.toFixed(2), 'life', box.life);
    updateThrown(0.05);
    const lure = LURES.find(l => l.kind === 'box');
    push('LURE for box:', JSON.stringify(lure));
    // simulate him arriving at the goal cell centre, 0.89 away (AI arrival radius)
    V.x = Math.floor(lure.x) + 0.5 + 0.6; V.z = Math.floor(lure.z) + 0.5 + 0.6;
    push('V distance to box =', Math.hypot(V.x - box.x, V.z - box.z).toFixed(2));
    smashLureAt(lure);
    push('after smashLureAt: box still in THROWN =', THROWN.includes(box),
      'box.smashT =', box.smashT, 'box.until =', box.until, 'box.life =', box.life.toFixed(2));
    // run 3 more seconds without moving him and see if the music is still going
    let chimes = 0;
    const realChime = SFX.musicBox; SFX.musicBox = function () { chimes++; };
    for (let i = 0; i < 60; i++) updateThrown(0.05);
    SFX.musicBox = realChime;
    push('3s after "the music stops": box in THROWN =', THROWN.includes(box), 'chimes played =', chimes);

    // --- flare: is anything drawn for it?
    THROWN.length = 0; P.flares = 1; P.hidden = null;
    strikeFlare();
    for (let i = 0; i < 40; i++) updateThrown(0.05);
    const fl = THROWN.find(t => t.kind === 'flare');
    push('flare state =', fl && fl.state, 'items of type flareLit =', items.filter(i => i.type === 'flareLit').length,
      'EXTRALIGHTS =', extraLights().length);

    // --- melee HUD ammo
    P.has.axe = true; equipWeapon('axe');
    push('P.ammo has key "melee"? ', ('melee' in P.ammo), ' -> HUD shows', (P.ammo[WEAPONS.axe.ammoKey] | 0));

    // --- Q cycle with nothing owned
    P.has = { pistol: false, shotgun: false, hammer: false, nailgun: false, axe: false, camera: false };
    P.weapon = null;
    const order = [null, 'pistol', 'shotgun', 'hammer', 'nailgun', 'axe', 'camera'].filter(w => w === null || P.has[w]);
    push('Q order with nothing owned:', JSON.stringify(order), 'next =', order[(order.indexOf(P.weapon) + 1) % order.length]);

    return L;
  });

  console.log(out.join('\n'));
  console.log('FATAL:', JSON.stringify(fatal, null, 1));
  await browser.close();
  server.close();
  process.exit(0);
})();
