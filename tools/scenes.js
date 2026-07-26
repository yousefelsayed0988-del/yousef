/* Capture a set of gameplay moments in one browser session.
   node tools/scenes.js <outdir>                                            */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTDIR = process.argv[2] || '/tmp/scenes';
fs.mkdirSync(OUTDIR, { recursive: true });
const QA = process.argv[3] || '1';

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (p === '/index.html' && QA !== '0') body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;', 'window.__QA__=' + QA + ';'), 'utf8');
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const errs = [];
  page.on('pageerror', e => { if (!/Pointer Lock/.test(e.message)) errs.push('PAGEERROR: ' + e.message); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(24000);

  const shot = async (name, setup, wait) => {
    if (setup) {
      const r = await page.evaluate(src => { try { return String(eval(src)); } catch (e) { return 'EVAL ERROR: ' + e.message; } }, setup);
      if (/EVAL ERROR/.test(r)) errs.push(name + ' ' + r);
    }
    await page.waitForTimeout(wait || 2200);
    await page.screenshot({ path: path.join(OUTDIR, name + '.png') });
    const s = await page.evaluate(() => {
      const c = document.getElementById('scene'), g = c.getContext('webgl2');
      const buf = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, buf);
      let sum = 0, max = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4 * 89) { const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3; sum += l; if (l > max) max = l; n++; }
      return { mean: +(sum / n).toFixed(1), max: Math.round(max) };
    });
    console.log('  ' + name.padEnd(22) + ' mean=' + s.mean + ' max=' + s.max);
  };

  const STAND = `
    updatePlayer = function(){};
    (function(){
      var best=null;
      for (var gy=1; gy<MH-1; gy++) for (var gx=1; gx<MW-1; gx++){
        if (solid(gx,gy)) continue;
        var open=0;
        for (var oy=-2;oy<=2;oy++) for (var ox=-2;ox<=2;ox++)
          if (!solid(gx+ox,gy+oy) && !doorAt(gx+ox,gy+oy)) open++;
        if (!best || open>best.open) best={x:gx,y:gy,open:open};
      }
      if (best){ P.x=best.x+0.5; P.z=best.y+0.5; }
      var bestA=P.ang, bestRun=-1;
      for (var i=0;i<64;i++){
        var a=i/64*Math.PI*2, run=0;
        for (var s=0.4;s<8;s+=0.35){
          var cx=Math.floor(P.x+Math.cos(a)*s), cy=Math.floor(P.z+Math.sin(a)*s);
          if (solid(cx,cy)) break;
          run=s;
        }
        if (run>bestRun){ bestRun=run; bestA=a; }
      }
      P.ang=bestA; lookYaw=bestA; P.pitch=0.02;
    })();
  `;

  console.log('--- scenes ---');
  await shot('01_torch', STAND + 'P.torch=true; P.bat=1; V.active=false; "ok"');
  await shot('02_torch_off', 'P.torch=false; "ok"');
  await shot('03_lantern', 'P.torch=false; P.tools.lantern=true; P.lantern=true; "ok"');
  await shot('04_flare', `
    P.torch=true; P.lantern=false;
    THROWN.length=0;
    THROWN.push({ kind:'flare', state:'burn', x:P.x+Math.cos(P.ang)*3.2, y:0.06, z:P.z+Math.sin(P.ang)*3.2,
                  vx:0, vy:0, vz:0, until:40, spin:0, life:40 });
    "ok"`, 3200);
  await shot('05_lodger_hunt', `
    THROWN.length=0; LURES.length=0; WARDS.length=0;
    V.active=true; V.stun=0; V.busy=0;
    if (!V.mind) resetMind();
    V.x=P.x+Math.cos(P.ang)*4.2; V.z=P.z+Math.sin(P.ang)*4.2; V.ang=P.ang+Math.PI;
    updateVillain=function(dt){ V.anim+=dt; V.jaw=0.4; poseLodger(V.bones,V.anim,'hunt',3.2,0,0,0); placeVillain(); };
    "ok"`, 2600);
  await shot('06_lodger_roar', `
    V.x=P.x+Math.cos(P.ang)*2.6; V.z=P.z+Math.sin(P.ang)*2.6; V.ang=P.ang+Math.PI;
    updateVillain=function(dt){ V.anim+=dt; V.jaw=1; poseLodger(V.bones,1.05,'roar',0,0,0,0); placeVillain(); };
    "ok"`, 2200);
  await shot('07_lodger_listen', `
    V.x=P.x+Math.cos(P.ang)*3.0; V.z=P.z+Math.sin(P.ang)*3.0; V.ang=P.ang+Math.PI+0.5;
    updateVillain=function(dt){ V.anim+=dt; V.jaw=0.12; poseLodger(V.bones,V.anim,'listen',0,0,0.3,0); placeVillain(); };
    "ok"`, 2200);

  if (errs.length) { console.log('--- ERRORS ---'); errs.forEach(e => console.log('  ' + e)); }
  await browser.close(); server.close();
  process.exit(errs.length ? 3 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
