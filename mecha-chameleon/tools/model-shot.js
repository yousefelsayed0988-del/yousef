// Renders the chameleon on its own, one image per pose, so the model can be
// eyeballed without hunting for a hider in a map.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/model-shot.js

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8145;
const SHOTS = join(ROOT, 'shots');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };

const PAGE = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#11151c;overflow:hidden}canvas{display:block;width:520px;height:520px}</style>
<canvas id="c"></canvas>
<script type="module">
import { createRenderer } from '/client/js/gl/renderer.js';
import { buildChameleon } from '/client/js/chameleon.js';
import { Stance, POSES } from '/shared/constants.js';

const canvas = document.getElementById('c');
const R = createRenderer(canvas, { antialias: true });
R.resize(520, 520, 2);

// A neutral studio: a floor slab and three lights, so shape reads clearly.
R.loadMap({
  id: 'studio',
  env: { sky: [0.09, 0.11, 0.14], ambient: [0.34, 0.36, 0.42], sunDir: [-0.45, -0.8, -0.4],
         sunColor: [1, 0.96, 0.9], sunIntensity: 1.15, fogColor: [0.07, 0.09, 0.12],
         fogDensity: 0.004, exposure: 1.05, indoor: false },
  bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8, maxY: 8, floorY: 0 },
  props: [
    { t: 0, p: [0, -0.2, 0], s: [8, 0.2, 8], yaw: 0, c: [0.22, 0.24, 0.29], solid: true, rough: 0.9, metal: 0, emis: 0 },
  ],
  lights: [
    { p: [2.5, 2.4, 2.2], c: [1, 0.92, 0.8], i: 1.5, r: 12 },
    { p: [-2.8, 1.8, 1.2], c: [0.6, 0.78, 1], i: 1.1, r: 12 },
    { p: [0, 2.2, -3], c: [1, 0.75, 0.85], i: 0.9, r: 12 },
  ],
  spawns: { hiders: [[0, 0, 0]], seekers: [[0, 0, 3]], lobby: [0, 0, 0] },
  hidingSpots: [], palette: [],
});

const PAINT = {
  body: [0.36, 0.66, 0.42], head: [0.4, 0.72, 0.46], tail: [0.31, 0.58, 0.37],
  legs: [0.28, 0.52, 0.34], crest: [0.62, 0.82, 0.36], eyes: [0.95, 0.72, 0.15],
  pattern: 'scales', patternColor: [0.18, 0.38, 0.26],
};

window.shoot = (pose, stance, yawDeg, animT, opts = {}) => {
  const yaw = yawDeg * Math.PI / 180;
  const parts = buildChameleon(PAINT, pose, animT, stance, opts);
  // Sit on the +yaw side and look back down the same yaw: the renderer's
  // forward is dirFromAngles(yaw, pitch), which points at the origin from here.
  const dist = 3.4;
  const camYaw = 0.7;
  const camY = 1.35;
  const aimY = 0.5;
  const cam = {
    pos: { x: Math.sin(camYaw) * dist, y: camY, z: Math.cos(camYaw) * dist },
    yaw: camYaw, pitch: -Math.atan2(camY - aimY, dist), fov: 0.62, aspect: 1,
  };
  R.beginFrame(cam, animT);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (const p of parts) {
    const ox = p.off.x * cy + p.off.z * sy;
    const oz = -p.off.x * sy + p.off.z * cy;
    R.drawInstance(p.type, { x: ox, y: p.off.y, z: oz }, p.size,
      [yaw + (p.yaw || 0), p.pitch || 0, p.roll || 0], p.colour, p.params);
  }
  R.endFrame();
  return { parts: parts.length, height: Math.max(...parts.map((p) => p.off.y + p.size.y / 2)) };
};
window.__ready = true;
</script>`;

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE); return; }
  const file = join(ROOT, normalize(path).replace(/^[/\\]+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      .end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});

server.listen(PORT, '127.0.0.1', async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });

  const shots = [
    ['idle', 0, 25, 0.4, {}],
    ['idle', 0, 115, 1.2, { moving: true, speed: 4 }],
    ['crouch', 1, 25, 0.4, {}],
    ['prone', 2, 25, 0.4, {}],
    ['ball', 1, 25, 0.4, {}],
    ['wall', 0, 25, 0.4, {}],
    ['statue', 0, 25, 0.4, {}],
    ['idle', 0, 25, 0.4, { tagged: true }],
  ];
  for (const [pose, stance, yaw, t, opts] of shots) {
    const info = await page.evaluate(
      ([p, s, y, tt, o]) => window.shoot(p, s, y, tt, o), [pose, stance, yaw, t, opts]);
    const name = `model-${pose}${opts.moving ? '-walk' : ''}${opts.tagged ? '-tagged' : ''}.png`;
    await page.screenshot({ path: join(SHOTS, name) });
    console.log(`${name}  parts=${info.parts} top=${info.height.toFixed(2)}m`);
  }

  await browser.close();
  server.close();
  process.exit(0);
});
