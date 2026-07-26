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
    const resume = () => { setMode('play'); P.alive = true; P.fadeOut = 0; V.stun = 0; };
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

    // 11. a long soak with the villain hunting
    V.state = 'hunt'; V.lastSeen = { x: Math.floor(P.x), y: Math.floor(P.z) };
    P.alive = true;
    frames(600);
    log.push('soak done: V=' + V.state + ' @' + V.x.toFixed(1) + ',' + V.z.toFixed(1));

    return { log, errs };
  });

  console.log('--- LOG ---');
  report.log.forEach(l => console.log('  ' + l));
  console.log('--- ERRORS (' + (report.errs.length + fatal.length) + ') ---');
  report.errs.forEach(l => console.log('  ' + l));
  fatal.filter(f => !/Pointer Lock/.test(f)).forEach(l => console.log('  ' + l));
  await browser.close(); server.close();
  process.exit(report.errs.length ? 3 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
