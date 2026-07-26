/* Cycle every quality preset in one session, screenshot each, and report any
   exception or a frame that comes out uniformly black.
   node tools/qtest.js <outdir>                                              */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTDIR = process.argv[2] || '/tmp/qtest';
fs.mkdirSync(OUTDIR, { recursive: true });

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
  const page = await browser.newPage({ viewport: { width: 720, height: 440 } });
  const errs = [];
  page.on('pageerror', e => { if (!/Pointer Lock/.test(e.message)) errs.push('PAGEERROR: ' + e.message); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(24000);

  // stand somewhere with something to look at, torch on
  await page.evaluate(() => {
    updatePlayer = function () {};
    P.torch = true; P.bat = 1;
    let bestA = P.ang, bestRun = -1;
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2; let run = 0;
      for (let s = 0.4; s < 7; s += 0.35) {
        if (solid(Math.floor(P.x + Math.cos(a) * s), Math.floor(P.z + Math.sin(a) * s))) break;
        run = s;
      }
      if (run > bestRun) { bestRun = run; bestA = a; }
    }
    P.ang = bestA; P.pitch = 0.02;
  });

  const out = [];
  for (let q = 0; q <= 4; q++) {
    const before = errs.length;
    await page.evaluate(qq => {
      S.q = qq;
      resize();
      safeBuildTextures();
    }, q).catch(e => errs.push('q' + q + ' switch: ' + e.message));
    await page.waitForTimeout(6000);
    const file = path.join(OUTDIR, 'q' + q + '.png');
    await page.screenshot({ path: file });
    const stats = await page.evaluate(() => {
      const c = document.getElementById('scene');
      const g = c.getContext('webgl2');
      const W = c.width, H = c.height;
      const buf = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, buf);
      let sum = 0, max = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4 * 97) { const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3; sum += l; if (l > max) max = l; n++; }
      return { mean: +(sum / n).toFixed(1), max, canvas: W + 'x' + H, shadow: !!shadowRT, vol: Q().vol, relief: Q().relief };
    });
    out.push({ q, name: ['Low', 'Medium', 'High', 'Ultra', 'Ultra 4K'][q], ...stats, newErrors: errs.length - before });
  }
  console.log(JSON.stringify(out, null, 1));
  if (errs.length) { console.log('--- ERRORS ---'); errs.forEach(e => console.log('  ' + e)); }
  const dark = out.filter(o => o.max < 12);
  if (dark.length) console.log('!!! BLACK FRAMES AT: ' + dark.map(d => d.name).join(', '));
  await browser.close(); server.close();
  process.exit(errs.length || dark.length ? 3 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
