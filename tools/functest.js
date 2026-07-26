/* Headless functional test: drive every system in the game from script and
   report anything that throws. node tools/functest.js                      */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

  const report = await page.evaluate(async () => {
    const log = [];
    const errs = [];
    const T = (name, fn) => { try { const r = fn(); log.push(name + ' -> ' + (r === undefined ? 'ok' : r)); } catch (e) { errs.push(name + ': ' + e.message + ' @ ' + String(e.stack).split('\n')[1]); } };
    // the Lodger will happily kill the player halfway through a mechanical
    // test; put the world back on its feet between sections
    const resume = () => { setMode('play'); P.alive = true; P.fadeOut = 0; V.stun = 0; V.active = true; V.busy = 0; };
    // the game only empties THROWN in startGame, which rebuilds `items` too;
    // a test that empties it by hand has to take the props with it
    const clearThrown = () => {
      THROWN.length = 0; LURES.length = 0; WARDS.length = 0;
      for (const it of items) if (it.type === 'flareLit' || it.type === 'boxSet' || it.type === 'bottleShards') it.live = false;
    };
    const frames = n => { for (let i = 0; i < n; i++) { try { updateThrown(0.05); updateBoons(0.05); updateVillain(0.05); updateCombat(0.05); updateDoors(0.05); updateNoise(0.05); } catch (e) { errs.push('tick: ' + e.message); break; } } };

    // 1. every declared item model must compile and be registered
    const want = ['fuse','battery','note','clue','pistol','shotgun','ammo','shells','trap','trapSet',
      'doorkey','crowbar','cutters','screwdriver','oilcan','hammer','medkit','lockpick',
      'bottle','flare','flareLit','musicbox','musicboxOpen','bandage','adrenaline','laudanum',
      'nailgun','nails','axe','camera','plates','lantern','watch','ledger','cellarkey',
      'bottleShards','boxSet'];
    const missingModel = want.filter(k => !WORLD.itemModels[k]);
    log.push('itemModels missing: ' + (missingModel.length ? missingModel.join(',') : 'none'));

    // 2. every spawned item type must have a model, a label and a pickup handler
    const spawned = [...new Set(items.map(i => i.type))];
    log.push('spawned types (' + spawned.length + '): ' + spawned.join(','));
    const noModel = spawned.filter(t => !WORLD.itemModels[t]);
    // fuse, battery and note are taken inside interact() rather than through
    // an ITEMPICK entry, which is how the original build did it
    const HANDLED_BY_INTERACT = ['fuse', 'battery', 'note'];
    const noPick = spawned.filter(t => !ITEMPICK[t] && HANDLED_BY_INTERACT.indexOf(t) < 0);
    const noLabel = spawned.filter(t => !ITEMLABEL[t]);
    if (noModel.length) errs.push('spawned with no model: ' + noModel.join(','));
    if (noPick.length) errs.push('spawned with no ITEMPICK: ' + noPick.join(','));
    if (noLabel.length) errs.push('spawned with no ITEMLABEL: ' + noLabel.join(','));

    // 3. take one of everything. fuse/battery/note are handled inside
    //    interact() rather than by an ITEMPICK entry, so skip those.
    for (const t of spawned) {
      const it = items.find(i => i.type === t && i.live);
      if (!it || !ITEMPICK[t]) continue;
      T('pick:' + t, () => { ITEMPICK[t](it); });
      resume();                   // a ledger page opens the reader as it is taken
    }
    T('updateHUD', () => updateHUD());
    log.push('after pickups: bottles=' + P.bottles + ' flares=' + P.flares + ' boxes=' + P.boxes +
             ' bandages=' + P.bandages + ' adren=' + P.adrenaline + ' laud=' + P.laudanum +
             ' nails=' + P.ammo.nails + ' plates=' + P.ammo.plates + ' ledger=' + P.ledger +
             ' watch=' + P.hasWatch + ' lantern=' + P.tools.lantern + ' cellarkey=' + P.tools.cellarkey);

    resume();

    // 4. weapons
    for (const w of ['pistol','shotgun','hammer','nailgun','axe','camera']) {
      T('equip:' + w, () => { equipWeapon(w); return P.weapon; });
      P.fireCool = 0;
      T('fire:' + w, () => { fireWeapon(); return 'ammo=' + JSON.stringify(P.ammo); });
    }
    T('equip:null', () => equipWeapon(null));

    resume();

    // 5. the thrown and placed things
    P.bottles = 3; P.flares = 3; P.boxes = 2;
    T('throwBottle', () => { throwBottle(); return 'THROWN=' + THROWN.length; });
    T('strikeFlare', () => { strikeFlare(); return 'THROWN=' + THROWN.length; });
    T('placeMusicBox', () => { placeMusicBox(); return 'THROWN=' + THROWN.length; });
    frames(40);
    log.push('after 2s: THROWN=' + THROWN.length + ' LURES=' + LURES.length + ' WARDS=' + WARDS.length +
             ' items=' + items.filter(i => i.live).length);
    frames(400);
    log.push('after 22s: THROWN=' + THROWN.length + ' LURES=' + LURES.length + ' WARDS=' + WARDS.length);

    resume();

    // 6. the consumables
    P.bandages = 2; P.adrenaline = 2; P.laudanum = 2; P.bleed = 0.8;
    T('useBandage', () => { useBandage(); return 'bleed=' + P.bleed; });
    T('useAdrenaline', () => { useAdrenaline(); return 'adrenT=' + P.adrenT; });
    T('useLaudanum', () => { useLaudanum(); return 'laudT=' + P.laudT; });
    T('toggleLantern', () => { toggleLantern(); return 'lantern=' + P.lantern; });
    T('moveScale', () => moveScale());
    T('noiseScale', () => noiseScale());
    T('extraLights', () => extraLights().length);
    T('watchTime', () => watchTime());
    frames(60);

    resume();

    // 7. traps, medkit, ledger, notes
    P.traps = 2; T('placeTrap', () => { placeTrap(); return 'items=' + items.filter(i => i.live).length; });
    P.medkits = 1; P.trapHurt = 1; T('useMedkit', () => useMedkit());
    T('openLedger', () => { openLedger(0); resume(); });
    T('openNote', () => { openNote(0); resume(); });

    resume();

    // 8. progression: door stages and the strongbox
    T('objectiveNow', () => objectiveNow());
    T('doorStage', () => doorStage());
    T('doorPromptText', () => doorPromptText());
    T('scanNear', () => scanNear());
    T('interact', () => interact());
    T('kpPress', () => { openKeypad(); kpPress('1'); resume(); });

    // 9. the villain, driven through every state
    for (const st of ['walk','hunt','lunge','stun','idle']) {
      T('pose:' + st, () => { poseLodger(V.bones, 1.3, st, 3, 0, 0.2, -0.1); placeVillain(); });
    }
    T('tryStun', () => tryStun());
    T('hitVillain', () => hitVillain(12, 'test'));
    frames(200);

    resume();

    // 10. hiding
    if (WORLD.hides && WORLD.hides.length) {
      T('enterHide', () => { enterHide(WORLD.hides[0]); return !!P.hidden; });
      for (let i = 0; i < 30; i++) { if (!P.hidden) break; try { updateHidden(0.05); } catch (e) { errs.push('updateHidden: ' + e.message); break; } }
      T('leaveHide', () => { leaveHide(); return !!P.hidden; });
    }

    // 10b. the Lodger's mind: drive a long simulation and record which
    //      states he actually reaches, and that his memory decays
    {
      resume();
      const seen = {};
      const poses = {};
      const realPose = poseLodger;
      poseLodger = function (b, t, st, sp, ln, hy, hp) { poses[st] = (poses[st] | 0) + 1; return realPose(b, t, st, sp, ln, hy, hp); };
      // quiet player, far away: he should patrol, listen and search
      P.x = 2.5; P.z = 2.5; V.x = 26.5; V.z = 26.5; P.hidden = null;
      THROWN.length = 0; LURES.length = 0; WARDS.length = 0; BLOODTRAIL.length = 0;
      resetMind(); NOISE.level = 0; NOISE.mic = 0; NOISE.move = 0; NOISE.step = 0;
      for (let i = 0; i < 3000; i++) {
        P.alive = true;
        try { updateNoise(0.05); updateVillain(0.05); } catch (e) { errs.push('AI tick: ' + e.message + ' @ ' + String(e.stack).split('\n')[1]); break; }
        seen[V.state] = (seen[V.state] | 0) + 1;
        if (Math.hypot(V.x - P.x, V.z - P.z) < 1.2) { V.x = 26.5; V.z = 26.5; resetMind(); }
      }
      log.push('quiet 150s states: ' + JSON.stringify(seen));
      // now make a racket and check he commits, and that he actually arrives
      const seen2 = {};
      resetMind();
      // put both of them on real floor, far apart
      const floors = [];
      for (let gy = 1; gy < MH - 1; gy++) for (let gx = 1; gx < MW - 1; gx++)
        if (!solid(gx, gy) && !doorAt(gx, gy)) floors.push({ x: gx, y: gy });
      P.x = floors[0].x + 0.5; P.z = floors[0].y + 0.5;
      let far = floors[0];
      for (const f of floors) {
        const d = Math.hypot(f.x + 0.5 - P.x, f.y + 0.5 - P.z);
        if (d > 13 && d < 18) { far = f; break; }
      }
      V.x = far.x + 0.5; V.z = far.y + 0.5;
      const d0 = Math.hypot(V.x - P.x, V.z - P.z);
      let nullSteps = 0, moved = 0, stuckAt = null;
      let px = V.x, pz = V.z, stillFor = 0;
      for (let i = 0; i < 1200; i++) {
        NOISE.level = 0.9; NOISE.stepAt = { x: Math.floor(P.x), y: Math.floor(P.z) }; P.alive = true;
        try { updateVillain(0.05); } catch (e) { errs.push('AI loud tick: ' + e.message); break; }
        seen2[V.state] = (seen2[V.state] | 0) + 1;
        const st = pathStep(Math.floor(V.x), Math.floor(V.z), Math.floor(P.x), Math.floor(P.z));
        if (!st) nullSteps++;
        const d = Math.hypot(V.x - px, V.z - pz);
        moved += d;
        if (d < 0.002) { stillFor++; if (stillFor > 40 && !stuckAt) stuckAt = Math.floor(V.x) + ',' + Math.floor(V.z) + ' state=' + V.state; }
        else stillFor = 0;
        px = V.x; pz = V.z;
        if (Math.hypot(V.x - P.x, V.z - P.z) < 1.0) break;
      }
      log.push('loud states: ' + JSON.stringify(seen2) + ' conf=' + V.mind.conf.toFixed(2));
      log.push('  start dist=' + d0.toFixed(1) + ' end dist=' + Math.hypot(V.x - P.x, V.z - P.z).toFixed(1) +
               ' travelled=' + moved.toFixed(1) + 'm  pathStep null on ' + nullSteps + ' frames' +
               (stuckAt ? '  STUCK at ' + stuckAt : ''));
      // a quiet, steady footfall a few rooms away should put him into a
      // stalk - walking it down - rather than a flat run
      const seen3 = {};
      resetMind();
      for (const f of floors) {
        const d = Math.hypot(f.x + 0.5 - P.x, f.y + 0.5 - P.z);
        if (d > 4 && d < 7) { V.x = f.x + 0.5; V.z = f.y + 0.5; break; }
      }
      for (let i = 0; i < 700; i++) {
        NOISE.level = 0.055; NOISE.stepAt = { x: Math.floor(P.x), y: Math.floor(P.z) }; P.alive = true;
        try { updateVillain(0.05); } catch (e) { errs.push('AI stalk tick: ' + e.message); break; }
        seen3[V.state] = (seen3[V.state] | 0) + 1;
      }
      log.push('quiet-footfall states: ' + JSON.stringify(seen3));
      Object.keys(seen3).forEach(k => { seen2[k] = (seen2[k] | 0) + seen3[k]; });

      // a fading idea of where you went should send him to look, not to run
      {
        const seen4 = {};
        resume();                 // the last phase ended with him on top of you
        resetMind();
        for (const f of floors) {
          const d = Math.hypot(f.x + 0.5 - P.x, f.y + 0.5 - P.z);
          if (d > 9 && d < 13) { V.x = f.x + 0.5; V.z = f.y + 0.5; break; }
        }
        V.mind.conf = 0.22;
        V.mind.lastKnown = { x: Math.floor(P.x), y: Math.floor(P.z) };
        NOISE.level = 0;
        for (let i = 0; i < 200; i++) {
          P.alive = true; V.active = true;
          try { updateVillain(0.05); } catch (e) { errs.push('AI investigate tick: ' + e.message); break; }
          seen4[V.state] = (seen4[V.state] | 0) + 1;
        }
        log.push('fading-belief states: ' + JSON.stringify(seen4));
        Object.keys(seen4).forEach(k => { seen2[k] = (seen2[k] | 0) + seen4[k]; });
      }

      // and that belief rots when the house goes quiet again
      NOISE.level = 0;
      for (let i = 0; i < 400; i++) { try { updateVillain(0.05); } catch (e) { break; } }
      log.push('after 20s silence: conf=' + V.mind.conf.toFixed(2) + ' state=' + V.state +
               ' frustration=' + V.mind.frustration.toFixed(2));
      log.push('poses driven: ' + Object.keys(poses).join(','));
      poseLodger = realPose;
      const wanted = ['patrol', 'listen', 'search', 'investigate', 'stalk', 'hunt'];
      const never = wanted.filter(w => !seen[w] && !seen2[w]);
      if (never.length) errs.push('AI states never reached: ' + never.join(','));
    }

    // 10c. can the night still be finished? Walk the whole objective chain.
    {
      resume();
      V.active = false;                       // he is not the thing under test here
      const chain = [];
      chain.push('start: ' + objectiveNow());
      // the fuse box
      P.tools.screwdriver = true;
      T('unscrew', () => { P.boxOpen = true; return objectiveNow(); });
      P.fuses = 4;
      chain.push('fuses in: ' + objectiveNow());
      T('power', () => { P.powerOn = true; SFX.hum(true); return objectiveNow(); });
      // the strongbox
      T('safe code', () => {
        openKeypad();
        for (const ch of safeCode) kpPress(ch);
        kpPress('OK');                       // the box needs telling you are done
        resume();
        return 'safeOpen=' + safeOpen + ' items=' + items.filter(i => i.live && i.type === 'doorkey').length;
      });
      const key = items.find(i => i.type === 'doorkey' && i.live);
      if (key) T('take key', () => { ITEMPICK.doorkey(key); return objectiveNow(); });
      // the front door, stage by stage
      P.tools.crowbar = true; P.tools.cutters = true; P.tools.oilcan = true;
      P.x = exitCell.x + 0.5; P.z = exitCell.y + 0.5;
      let guard = 0;
      while (doorStage() !== 'out' && guard++ < 12) {
        const st = doorStage();
        try { workTheDoor(); } catch (e) { errs.push('workTheDoor(' + st + '): ' + e.message); break; }
        chain.push(st + ' -> ' + doorStage());
        resume();
      }
      chain.push('final stage: ' + doorStage() + '  objective: ' + objectiveNow());
      if (doorStage() !== 'out') errs.push('the front door cannot be finished: stuck at ' + doorStage());
      T('winGame', () => { winGame(); const w = MODE; resume(); return 'mode was ' + w; });
      log.push('objective chain: ' + chain.join(' | '));
      V.active = true;
    }

    // 10d. the distraction items must actually distract. A bottle raises the
    //      same global noise level a footstep does, so the whole point of it
    //      is that he walks to the BOTTLE and not to you.
    {
      resume();
      resetMind();
      clearThrown(); BLOODTRAIL.length = 0;
      NOISE.level = 0; NOISE.mic = 0; NOISE.move = 0; NOISE.step = 0; NOISE.src = 'player';
      const fl = [];
      for (let gy = 1; gy < MH - 1; gy++) for (let gx = 1; gx < MW - 1; gx++)
        if (!solid(gx, gy) && !doorAt(gx, gy)) fl.push({ x: gx, y: gy });
      P.x = fl[0].x + 0.5; P.z = fl[0].y + 0.5;
      // him a fair way off, and a bottle landing well to one side of you
      let him = fl[0], spot = fl[0];
      for (const f of fl) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z); if (d > 9 && d < 13) { him = f; break; } }
      for (const f of fl) { const d = Math.hypot(f.x + .5 - P.x, f.y + .5 - P.z);
        const dh = Math.hypot(f.x + .5 - (him.x + .5), f.y + .5 - (him.y + .5));
        if (d > 6 && d < 10 && dh > 5) { spot = f; break; } }
      V.x = him.x + 0.5; V.z = him.y + 0.5;
      THROWN.push({ kind: 'bottle', x: spot.x + 0.5, y: 1.2, z: spot.y + 0.5, vx: 0, vy: -0.1, vz: 0, spin: 0, life: 9 });
      let nearestToSpot = 99, nearestToPlayer = 99;
      for (let i = 0; i < 260; i++) {
        P.alive = true; V.active = true;
        try { updateThrown(0.05); updateBoons(0.05); updateVillain(0.05); } catch (e) { errs.push('bottle tick: ' + e.message); break; }
        nearestToSpot = Math.min(nearestToSpot, Math.hypot(V.x - (spot.x + 0.5), V.z - (spot.y + 0.5)));
        nearestToPlayer = Math.min(nearestToPlayer, Math.hypot(V.x - P.x, V.z - P.z));
      }
      log.push('bottle lure: he got within ' + nearestToSpot.toFixed(1) + 'm of the bottle and ' +
               nearestToPlayer.toFixed(1) + 'm of the player (shards on floor: ' +
               items.filter(i => i.live && i.type === 'bottleShards').length + ')');
      if (nearestToSpot > 2.5) errs.push('a thrown bottle does not draw him: closest approach ' + nearestToSpot.toFixed(1) + 'm');
      if (nearestToPlayer < nearestToSpot) errs.push('a thrown bottle draws him to the PLAYER instead of the bottle');
    }

    // 10e. a burning flare must have a body, and must keep him off
    {
      resume();
      resetMind();
      clearThrown();
      THROWN.push({ kind: 'flare', state: 'fly', x: P.x + 1.2, y: 0.6, z: P.z, vx: 0, vy: -0.2, vz: 0, spin: 0, life: 35 });
      for (let i = 0; i < 20; i++) updateThrown(0.05);
      const lit = items.filter(i => i.live && i.type === 'flareLit').length;
      log.push('flare: burning=' + THROWN.filter(t => t.kind === 'flare' && t.state === 'burn').length +
               ' body on floor=' + lit + ' wards=' + WARDS.length + ' lights=' + extraLights().length);
      if (!lit) errs.push('a burning flare has no visible body');
      if (!WARDS.length) errs.push('a burning flare does not ward him off');
      // and it must clean itself up
      for (const t of THROWN) if (t.kind === 'flare') t.life = 0.01;
      for (let i = 0; i < 5; i++) updateThrown(0.05);
      if (items.filter(i => i.live && i.type === 'flareLit').length)
        errs.push('a burnt-out flare leaves its body on the floor forever');
    }

    // 10f. a music box must be destroyable, and take its model with it
    {
      resume();
      resetMind();
      clearThrown();
      P.boxes = 1;
      placeMusicBox();
      const boxes0 = items.filter(i => i.live && i.type === 'boxSet').length;
      V.x = P.x; V.z = P.z; V.stun = 0; V.active = true;
      for (let i = 0; i < 200; i++) { P.alive = true; updateThrown(0.05); }
      log.push('music box: props before=' + boxes0 + ' after=' +
               items.filter(i => i.live && i.type === 'boxSet').length +
               ' still playing=' + THROWN.filter(t => t.kind === 'box').length);
      if (THROWN.filter(t => t.kind === 'box').length) errs.push('the music box survives him breaking it');
      if (items.filter(i => i.live && i.type === 'boxSet').length) errs.push('a broken music box leaves its model behind');
    }

    // 10g. GPU resources must be handed back. A player who dies and retries
    //      sixty times in a session used to orphan twenty thousand VAOs.
    {
      resume();
      const g = document.getElementById('scene').getContext('webgl2');
      const count = { vao: 0, buf: 0, vaoDel: 0, bufDel: 0, fb: 0, tex: 0, fbDel: 0, texDel: 0 };
      const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = function () { count[key]++; return f.apply(obj, arguments); }; return f; };
      const orig = {
        cva: wrap(g, 'createVertexArray', 'vao'), cb: wrap(g, 'createBuffer', 'buf'),
        dva: wrap(g, 'deleteVertexArray', 'vaoDel'), db: wrap(g, 'deleteBuffer', 'bufDel'),
        cf: wrap(g, 'createFramebuffer', 'fb'), ct: wrap(g, 'createTexture', 'tex'),
        df: wrap(g, 'deleteFramebuffer', 'fbDel'), dt: wrap(g, 'deleteTexture', 'texDel'),
      };
      for (let i = 0; i < 3; i++) { try { startGame(); } catch (e) { errs.push('restart ' + i + ': ' + e.message); break; } }
      // and drive resize through several distinct sizes
      const rw = RW;
      for (let i = 0; i < 6; i++) { RW = rw + i * 37; RH = 200 + i * 11; try { resize(); } catch (e) { errs.push('resize: ' + e.message); break; } }
      g.createVertexArray = orig.cva; g.createBuffer = orig.cb;
      g.deleteVertexArray = orig.dva; g.deleteBuffer = orig.db;
      g.createFramebuffer = orig.cf; g.createTexture = orig.ct;
      g.deleteFramebuffer = orig.df; g.deleteTexture = orig.dt;
      log.push('gpu over 3 restarts + 6 resizes: vao ' + count.vao + ' created / ' + count.vaoDel +
               ' freed, buffers ' + count.buf + ' / ' + count.bufDel +
               ', framebuffers ' + count.fb + ' / ' + count.fbDel);
      // two rebuilds worth of world meshes should come back; allow the first
      // build (nothing to free yet) and the Lodger's own rig to stay live
      if (count.vaoDel < count.vao * 0.55) errs.push('vertex arrays are leaking on level rebuild: ' + count.vao + ' created, only ' + count.vaoDel + ' freed');
      if (count.fbDel < count.fb * 0.55) errs.push('framebuffers are leaking on resize: ' + count.fb + ' created, only ' + count.fbDel + ' freed');
      resume();
    }

    // 11. a long soak with the villain hunting
    V.state = 'hunt'; V.lastSeen = { x: Math.floor(P.x), y: Math.floor(P.z) };
    P.alive = true;
    frames(600);
    log.push('soak done: V=' + V.state + ' @' + V.x.toFixed(1) + ',' + V.z.toFixed(1));

    return { log, errs };
  });

  console.log('--- LOG ---');
  report.log.forEach(l => console.log('  ' + l));
  const realFatal = fatal.filter(f => !/Pointer Lock/.test(f));
  console.log('--- ERRORS (' + (report.errs.length + realFatal.length) + ') ---');
  report.errs.forEach(l => console.log('  ' + l));
  realFatal.forEach(l => console.log('  ' + l));
  await browser.close(); server.close();
  process.exit((report.errs.length + realFatal.length) ? 3 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
