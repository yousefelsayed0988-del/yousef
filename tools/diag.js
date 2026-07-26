/* Multi-shot diagnostic: one browser session, several lighting setups.
   node tools/diag.js <outdir>                                            */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTDIR = process.argv[2] || '/tmp/diag';
fs.mkdirSync(OUTDIR, { recursive: true });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (p === '/index.html') body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;', 'window.__QA__=2;'), 'utf8');
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  res.end(body);
});

const PORTRAIT = fs.readFileSync(path.join(ROOT, 'tools/portrait.js'), 'utf8');

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(22000);

  await page.evaluate(src => eval(src), 'window.__POSE__="idle";window.__DIST__=1.5;window.__PITCH__=0.28;window.__NOHUD__=1;' + PORTRAIT);
  await page.waitForTimeout(800);

  const CASES = [
    ['a_normal',      ''],
    ['b_noTorch_amb', 'P.torch=false; window.__AMB__=0.9;'],
    ['c_flatWhite',   'window.__FLAT__=1;'],
    ['d_normals',     'window.__SHOWN__=1;'],
  ];

  // patch renderFrame hooks the cases rely on
  await page.evaluate(() => {
    const realDraw = drawScene;
    window.__origAmb = null;
    const m = PROG.main;
    const loop0 = renderFrame;
    renderFrame = function (dt) {
      loop0(dt);
    };
  });

  const out = {};
  for (const [name, setup] of CASES) {
    if (setup) await page.evaluate(src => eval(src), setup);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTDIR, name + '.png') });
    out[name] = await page.evaluate(() => {
      const c = document.getElementById('scene');
      const g = c.getContext('webgl2');
      const W = c.width, H = c.height;
      const px = new Uint8Array(4);
      const read = (fx, fy) => {
        g.readPixels(Math.floor(fx * W), Math.floor((1 - fy) * H), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
        return [px[0], px[1], px[2]];
      };
      return { chestBlob: read(0.50, 0.42), torso: read(0.44, 0.52), face: read(0.50, 0.24) };
    });
    if (setup) await page.evaluate(src => eval(src), 'P.torch=true;');
  }
  console.log(JSON.stringify({ out, errs: errs.slice(0, 8) }, null, 1));
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
