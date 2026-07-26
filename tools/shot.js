/* HOLLOWMERE screenshot / smoke-test harness.
   node tools/shot.js --qa=1 --out=a.png --wait=12000 --eval="P.x=5" [--shots=3] [--gap=500]
   QA modes baked into the game: 0 normal, 1 straight into play,
   2/5/6 villain art check at 3.0 / 2.1 / 0.85 m.                             */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => {
  const hit = process.argv.slice(2).find(a => a.startsWith('--' + k + '='));
  return hit === undefined ? d : hit.slice(k.length + 3);
};
const QA = arg('qa', '0');
const OUT = arg('out', 'shot.png');
const WAIT = parseInt(arg('wait', '14000'), 10);
const SETUP = arg('eval', '');
const SHOTS = parseInt(arg('shots', '1'), 10);
const GAP = parseInt(arg('gap', '600'), 10);
const W = parseInt(arg('w', '1280'), 10);
const H = parseInt(arg('h', '720'), 10);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (p === '/index.html' && QA !== '0') {
    body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;', 'window.__QA__=' + QA + ';'), 'utf8');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(body);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + String(e.stack).split('\n').slice(1, 4).join('\n')));
  page.on('console', m => {
    const t = m.text();
    if (/willReadFrequently/.test(t)) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ': ' + t.slice(0, 400));
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(WAIT);

  if (SETUP) {
    const r = await page.evaluate(src => { try { return String(eval(src)); } catch (e) { return 'EVAL ERROR: ' + e.message; } }, SETUP);
    if (/EVAL ERROR/.test(r)) errors.push(r);
    await page.waitForTimeout(700);
  }

  for (let i = 0; i < SHOTS; i++) {
    const file = SHOTS === 1 ? OUT : OUT.replace(/\.png$/, '') + '_' + i + '.png';
    await page.screenshot({ path: file });
    if (i < SHOTS - 1) await page.waitForTimeout(GAP);
  }

  const state = await page.evaluate(() => {
    const out = { mode: typeof MODE !== 'undefined' ? MODE : '?', gl: !!(typeof gl !== 'undefined' && gl) };
    try { out.villain = { active: V.active, state: V.state, x: +V.x.toFixed(2), z: +V.z.toFixed(2), ang: +V.ang.toFixed(2) }; } catch (e) {}
    try { out.player = { x: +P.x.toFixed(2), z: +P.z.toFixed(2), alive: P.alive, fuses: P.fuses, torch: P.torch }; } catch (e) {}
    try { out.items = items.filter(i => i.live).length; } catch (e) {}
    try { out.fps = window.__FPS__; } catch (e) {}
    return out;
  }).catch(e => ({ err: String(e) }));

  console.log(JSON.stringify({ state, errors: errors.slice(0, 20) }, null, 2));
  await browser.close();
  server.close();
  process.exit(errors.some(e => e.startsWith('PAGEERROR')) ? 2 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
