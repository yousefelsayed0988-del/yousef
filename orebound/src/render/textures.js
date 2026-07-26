// Procedural texture generation.
//
// Every texture in the game is synthesised at load time from a seeded RNG --
// there are no image assets in this project at all. Block textures go into a
// 16x16 WebGL2 texture array (plus a parallel single-channel "tint mask" array
// so grass sides can tint only their green overlay). Item icons are drawn to a
// 2D canvas and handed to the DOM UI as data URLs.

import { BLOCKS, WOODS, DYES } from '../core/blocks.js';
import { ITEMS, TOOL_ORDER, ARMOR_SLOTS } from '../core/items.js';
import { Random } from '../core/rng.js';
import { RENDER_IDS } from '../core/blocks.js';

export const TILE = 16;

function keyRng(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return new Random(h);
}

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function shade(c, f) {
  const [r, g, b] = rgb(c);
  return [Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0];
}

class Tile {
  constructor() {
    this.px = new Uint8ClampedArray(TILE * TILE * 4);
    this.mask = new Uint8ClampedArray(TILE * TILE);
  }
  set(x, y, r, g, b, a = 255, m = 0) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = a;
    this.mask[y * TILE + x] = m;
  }
  get(x, y) {
    const i = ((y & 15) * TILE + (x & 15)) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  fill(color, a = 255, m = 0) {
    const [r, g, b] = rgb(color);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, r, g, b, a, m);
  }
  clear() { this.px.fill(0); this.mask.fill(0); }
  /** Per-pixel brightness jitter. */
  grain(rng, amount = 0.12, mask = -1) {
    for (let i = 0; i < TILE * TILE; i++) {
      if (this.px[i * 4 + 3] === 0) continue;
      const f = 1 + (rng.float() - 0.5) * 2 * amount;
      this.px[i * 4] = Math.min(255, this.px[i * 4] * f);
      this.px[i * 4 + 1] = Math.min(255, this.px[i * 4 + 1] * f);
      this.px[i * 4 + 2] = Math.min(255, this.px[i * 4 + 2] * f);
      if (mask >= 0) this.mask[i] = mask;
    }
  }
  rect(x0, y0, x1, y1, color, a = 255, m = 0) {
    const [r, g, b] = rgb(color);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, r, g, b, a, m);
  }
  setMaskAll(v) { this.mask.fill(v); }
}

// ---------------------------------------------------------------- generators
function noiseTile(base, amount, rng, maskAll = 0) {
  const t = new Tile();
  t.fill(base);
  t.grain(rng, amount);
  if (maskAll) t.setMaskAll(maskAll);
  return t;
}

function cobbleTile(base, rng, mossy = false) {
  const t = new Tile();
  t.fill(base);
  t.grain(rng, 0.10);
  // irregular stone cells separated by darker mortar
  const cells = [];
  for (let i = 0; i < 9; i++) cells.push([rng.int(16), rng.int(16)]);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let best = 1e9, second = 1e9, bi = 0;
      for (let i = 0; i < cells.length; i++) {
        let dx = Math.abs(cells[i][0] - x); dx = Math.min(dx, 16 - dx);
        let dy = Math.abs(cells[i][1] - y); dy = Math.min(dy, 16 - dy);
        const d = dx * dx + dy * dy;
        if (d < best) { second = best; best = d; bi = i; }
        else if (d < second) second = d;
      }
      const edge = Math.sqrt(second) - Math.sqrt(best);
      const f = edge < 0.9 ? 0.62 : 0.92 + (bi % 3) * 0.07;
      const i4 = (y * 16 + x) * 4;
      t.px[i4] *= f; t.px[i4 + 1] *= f; t.px[i4 + 2] *= f;
      if (mossy && rng.float() < 0.18) {
        t.px[i4] *= 0.7; t.px[i4 + 1] = Math.min(255, t.px[i4 + 1] * 1.25); t.px[i4 + 2] *= 0.7;
      }
    }
  }
  return t;
}

function plankTile(base, rng) {
  const t = new Tile();
  t.fill(base);
  const rows = [0, 4, 8, 12];
  for (let y = 0; y < 16; y++) {
    const boardTop = rows.includes(y);
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      let f = 1 + (rng.float() - 0.5) * 0.14;
      if (boardTop) f *= 0.78;
      // vertical seam offset per board
      const board = Math.floor(y / 4);
      const seam = (board * 7 + 3) % 16;
      if (x === seam) f *= 0.7;
      t.px[i] *= f; t.px[i + 1] *= f; t.px[i + 2] *= f;
    }
  }
  return t;
}

function logSideTile(colors, rng) {
  const t = new Tile();
  t.fill(colors[0]);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const bark = Math.sin(x * 1.5 + Math.sin(y * 0.7) * 1.4) * 0.5 + 0.5;
      const f = 0.78 + bark * 0.35 + (rng.float() - 0.5) * 0.12;
      t.px[i] *= f; t.px[i + 1] *= f; t.px[i + 2] *= f;
    }
  }
  return t;
}

function logTopTile(colors, rng) {
  const t = new Tile();
  t.fill(colors[1]);
  const [r0, g0, b0] = rgb(colors[1]);
  const [r1, g1, b1] = rgb(colors[0]);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const ring = (Math.sin(d * 2.2) * 0.5 + 0.5);
      const f = 0.85 + ring * 0.3 + (rng.float() - 0.5) * 0.1;
      const edge = d > 6.6 ? 0.75 : 1;
      t.set(x, y, (r0 * (1 - ring) + r1 * ring) * f * edge, (g0 * (1 - ring) + g1 * ring) * f * edge, (b0 * (1 - ring) + b1 * ring) * f * edge);
    }
  }
  return t;
}

function leafTile(base, rng, cherry = false) {
  const t = new Tile();
  t.fill(base);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const f = 0.7 + rng.float() * 0.6;
      t.px[i] *= f; t.px[i + 1] *= f; t.px[i + 2] *= f;
      if (rng.float() < 0.16) t.px[i + 3] = 0;      // cutout holes
      t.mask[y * 16 + x] = cherry ? 0 : 255;         // cherry leaves are not tinted
    }
  }
  return t;
}

function oreTile(baseTile, oreColor, rng, blobs = 4) {
  const t = new Tile();
  t.px.set(baseTile.px); t.mask.set(baseTile.mask);
  const [r, g, b] = rgb(oreColor);
  for (let n = 0; n < blobs; n++) {
    const cx = 2 + rng.int(12), cy = 2 + rng.int(12);
    const size = 1 + rng.int(2);
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dy * dy > size * size + 0.5) continue;
        if (rng.float() < 0.15) continue;
        const f = 0.75 + rng.float() * 0.5;
        t.set(cx + dx, cy + dy, r * f, g * f, b * f, 255, 0);
      }
    }
  }
  return t;
}

function grassTopTile(rng) {
  const t = new Tile();
  t.fill(0xffffff);
  for (let i = 0; i < 256; i++) {
    const f = 0.72 + rng.float() * 0.36;
    t.px[i * 4] = 255 * f; t.px[i * 4 + 1] = 255 * f; t.px[i * 4 + 2] = 255 * f;
    t.mask[i] = 255;
  }
  return t;
}

function grassSideTile(dirt, rng) {
  const t = new Tile();
  t.px.set(dirt.px);
  t.mask.fill(0);
  for (let x = 0; x < 16; x++) {
    const h = 3 + rng.int(3);
    for (let y = 0; y < h; y++) {
      const f = 0.72 + rng.float() * 0.36;
      t.set(x, y, 255 * f, 255 * f, 255 * f, 255, 255);
    }
  }
  return t;
}

function crossPlantTile(color, rng, kind) {
  const t = new Tile();
  t.clear();
  const [r, g, b] = rgb(color);
  const blades = kind === 'fern' ? 7 : 6;
  for (let i = 0; i < blades; i++) {
    const x0 = 1 + rng.int(14);
    const h = kind === 'tall' ? 13 + rng.int(3) : 7 + rng.int(6);
    let x = x0;
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      if (rng.float() < 0.22) x += rng.chance(0.5) ? 1 : -1;
      const f = 0.7 + (k / h) * 0.5;
      t.set(x, y, r * f, g * f, b * f, 255, 255);
      if (kind === 'fern' && k > 2 && k % 2 === 0) {
        t.set(x - 1, y, r * f * 0.85, g * f * 0.85, b * f * 0.85, 255, 255);
        t.set(x + 1, y, r * f * 0.85, g * f * 0.85, b * f * 0.85, 255, 255);
      }
    }
  }
  return t;
}

function flowerTile(petal, centre, rng) {
  const t = new Tile();
  t.clear();
  const [sr, sg, sb] = rgb(0x3a7a28);
  const stemX = 7 + rng.int(2);
  for (let y = 15; y >= 7; y--) t.set(stemX, y, sr, sg, sb, 255, 0);
  for (let y = 12; y >= 9; y -= 2) {
    t.set(stemX + (y % 4 === 0 ? 1 : -1), y, sr, sg, sb);
  }
  const [pr, pg, pb] = rgb(petal);
  const cx = stemX, cy = 5;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = dx * dx + dy * dy;
      if (d > 9) continue;
      if (d > 5 && rng.float() < 0.5) continue;
      const f = 0.8 + rng.float() * 0.4;
      t.set(cx + dx, cy + dy, pr * f, pg * f, pb * f, 255, 0);
    }
  }
  const [cr, cg, cb] = rgb(centre);
  t.set(cx, cy, cr, cg, cb); t.set(cx + 1, cy, cr, cg, cb);
  t.set(cx, cy + 1, cr, cg, cb); t.set(cx + 1, cy + 1, cr, cg, cb);
  return t;
}

function cropTile(stage, rng, kind) {
  const t = new Tile();
  t.clear();
  const maxH = 3 + Math.round((stage / 7) * 11);
  const colors = kind === 'wheat'
    ? [0x4a7a26, 0x86a13a, 0xdcbb65]
    : (kind === 'stem' ? [0x4a7a26, 0x6a9a36, 0x8aba46] : [0x2f6b1f, 0x3f7f26, 0x4f8f2e]);
  const c = colors[Math.min(2, Math.floor((stage / 7) * 3))];
  const [r, g, b] = rgb(c);
  for (let x = 2; x < 16; x += 4) {
    for (let k = 0; k < maxH; k++) {
      const y = 15 - k;
      const f = 0.75 + rng.float() * 0.4;
      t.set(x, y, r * f, g * f, b * f, 255, 0);
      if (stage >= 5 && k > maxH - 5 && k % 2 === 0) {
        t.set(x - 1, y, r * f * 0.9, g * f * 0.9, b * f * 0.9, 255, 0);
        t.set(x + 1, y, r * f * 0.9, g * f * 0.9, b * f * 0.9, 255, 0);
      }
    }
  }
  return t;
}

function glassTile(rng) {
  const t = new Tile();
  t.clear();
  const [r, g, b] = rgb(0xd8f0ff);
  for (let x = 0; x < 16; x++) { t.set(x, 0, r, g, b, 190); t.set(x, 15, r, g, b, 190); }
  for (let y = 0; y < 16; y++) { t.set(0, y, r, g, b, 190); t.set(15, y, r, g, b, 190); }
  for (let i = 0; i < 8; i++) {
    const x = 2 + rng.int(12), y = 2 + rng.int(12);
    t.set(x, y, 255, 255, 255, 120);
    t.set(x + 1, y, 255, 255, 255, 90);
  }
  return t;
}

function torchTile(rng) {
  const t = new Tile();
  t.clear();
  for (let y = 15; y >= 6; y--) {
    const f = 0.7 + rng.float() * 0.3;
    t.set(7, y, 150 * f, 110 * f, 60 * f);
    t.set(8, y, 130 * f, 95 * f, 50 * f);
  }
  for (let y = 5; y >= 3; y--) {
    t.set(7, y, 255, 220 + rng.int(30), 120);
    t.set(8, y, 255, 200 + rng.int(40), 90);
  }
  t.set(7, 2, 255, 240, 190); t.set(8, 2, 255, 235, 170);
  return t;
}

function fireTile(rng) {
  const t = new Tile();
  t.clear();
  for (let x = 0; x < 16; x++) {
    const h = 6 + Math.round(Math.sin(x * 0.9) * 3) + rng.int(4);
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      const f = k / h;
      t.set(x, y, 255, 120 + f * 130, 30 + f * 60, 255 - f * 80);
    }
  }
  return t;
}

function ladderTile() {
  const t = new Tile();
  t.clear();
  const [r, g, b] = rgb(0x9b7842);
  for (let y = 0; y < 16; y++) { t.set(3, y, r, g, b); t.set(4, y, r * 0.8, g * 0.8, b * 0.8); t.set(11, y, r, g, b); t.set(12, y, r * 0.8, g * 0.8, b * 0.8); }
  for (let y = 2; y < 16; y += 5) for (let x = 4; x < 12; x++) { t.set(x, y, r * 1.1, g * 1.1, b * 1.1); t.set(x, y + 1, r * 0.85, g * 0.85, b * 0.85); }
  return t;
}

function webTile() {
  const t = new Tile();
  t.clear();
  for (let i = 0; i < 16; i++) {
    t.set(i, i, 235, 235, 240); t.set(15 - i, i, 235, 235, 240);
    t.set(i, 7, 220, 220, 228); t.set(7, i, 220, 220, 228);
  }
  for (let r = 3; r < 8; r += 2) {
    for (let a = 0; a < 32; a++) {
      const ang = a / 32 * Math.PI * 2;
      t.set(Math.round(7.5 + Math.cos(ang) * r), Math.round(7.5 + Math.sin(ang) * r), 210, 210, 220);
    }
  }
  return t;
}

function waterTile(rng) {
  const t = new Tile();
  t.fill(0xffffff, 200, 255);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const w = Math.sin(x * 0.8 + y * 0.4) * 0.5 + Math.sin(y * 1.1) * 0.5;
      const f = 0.86 + w * 0.12 + (rng.float() - 0.5) * 0.06;
      const i = (y * 16 + x) * 4;
      t.px[i] = 255 * f; t.px[i + 1] = 255 * f; t.px[i + 2] = 255 * f; t.px[i + 3] = 200;
      t.mask[y * 16 + x] = 255;
    }
  }
  return t;
}

function lavaTile(rng) {
  const t = new Tile();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const w = Math.sin(x * 0.6 + Math.sin(y * 0.5) * 2) * 0.5 + 0.5;
      const hot = w * 0.7 + rng.float() * 0.3;
      t.set(x, y, 200 + hot * 55, 60 + hot * 130, 10 + hot * 30);
    }
  }
  return t;
}

function bricksTile(base, rng, mortar) {
  const t = new Tile();
  t.fill(base);
  t.grain(rng, 0.10);
  const [mr, mg, mb] = rgb(mortar);
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / 4);
    for (let x = 0; x < 16; x++) {
      const off = (row % 2) * 4;
      if (y % 4 === 0 || (x + off) % 8 === 0) t.set(x, y, mr, mg, mb);
    }
  }
  return t;
}

function bookshelfTile(planks, rng) {
  const t = new Tile();
  t.px.set(planks.px);
  for (let y = 3; y < 14; y++) {
    if (y === 8) continue;
    for (let x = 1; x < 15; x++) {
      const band = Math.floor(x / 2) * 37 + (y < 8 ? 11 : 71);
      const rr = new Random(band);
      if (rr.chance(0.15)) continue;
      const c = [0xa33b2f, 0x2f5aa3, 0x2f8a4a, 0xa38a2f, 0x7a2fa3][rr.int(5)];
      const [r, g, b] = rgb(c);
      const f = 0.75 + rr.float() * 0.4;
      t.set(x, y, r * f, g * f, b * f);
    }
  }
  for (let x = 0; x < 16; x++) { t.set(x, 8, 90, 66, 38); t.set(x, 2, 90, 66, 38); t.set(x, 14, 90, 66, 38); }
  return t;
}

function chestTile(rng, trapped) {
  const t = new Tile();
  t.fill(trapped ? 0x8a5a3a : 0x9b6b34);
  t.grain(rng, 0.10);
  t.rect(0, 5, 15, 6, 0x4a3320);
  t.rect(6, 4, 9, 8, 0x5a5a5a);
  t.rect(7, 6, 8, 7, 0xd8c05a);
  for (let x = 0; x < 16; x++) { t.set(x, 0, 74, 51, 32); t.set(x, 15, 74, 51, 32); }
  for (let y = 0; y < 16; y++) { t.set(0, y, 74, 51, 32); t.set(15, y, 74, 51, 32); }
  return t;
}

function furnaceFrontTile(base, lit, rng) {
  const t = new Tile();
  t.px.set(base.px);
  t.rect(3, 7, 12, 13, 0x2a2a2a);
  if (lit) {
    for (let y = 9; y <= 13; y++) for (let x = 4; x <= 11; x++) {
      const f = (13 - y) / 5;
      t.set(x, y, 255, 140 + f * 90 + rng.int(20), 40 + f * 50);
    }
  }
  t.rect(3, 3, 12, 5, 0x5a5a5a);
  return t;
}

function craftingTopTile(planks, rng) {
  const t = new Tile();
  t.px.set(planks.px);
  t.rect(0, 0, 15, 1, 0x6a4a28);
  for (let i = 1; i <= 3; i++) { t.rect(0, i * 4, 15, i * 4, 0x6a4a28); t.rect(i * 4, 0, i * 4, 15, 0x6a4a28); }
  return t;
}

function spawnerTile(rng) {
  const t = new Tile();
  t.clear();
  const [r, g, b] = rgb(0x2b2b33);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const bar = (x % 4 < 2) !== (y % 4 < 2);
    if (bar) { const f = 0.8 + Math.random() * 0; t.set(x, y, r * f, g * f, b * f, 255); }
    else t.set(x, y, 0, 0, 0, 60);
  }
  return t;
}

function sugarCaneTile(rng) {
  const t = new Tile();
  t.clear();
  for (let x = 5; x <= 10; x++) {
    for (let y = 0; y < 16; y++) {
      const f = 0.8 + rng.float() * 0.3;
      const edge = (x === 5 || x === 10) ? 0.8 : 1;
      t.set(x, y, 190 * f * edge, 220 * f * edge, 140 * f * edge, 255, 255);
    }
  }
  for (let y = 3; y < 16; y += 6) for (let x = 5; x <= 10; x++) t.set(x, y, 150, 180, 110, 255, 255);
  return t;
}

function cactusTile(rng, kind) {
  const t = new Tile();
  t.fill(kind === 'top' ? 0x5a8a3a : 0x3f6b2a);
  t.grain(rng, 0.10);
  if (kind === 'side') {
    for (let y = 0; y < 16; y += 4) for (let x = 1; x < 15; x += 3) t.set(x, y, 220, 230, 200);
    t.rect(0, 0, 0, 15, 0x2f5320); t.rect(15, 0, 15, 15, 0x2f5320);
  }
  return t;
}

function mushroomTile(red, rng) {
  const t = new Tile();
  t.clear();
  const cap = red ? 0xc73a34 : 0x9b6b4a;
  const [cr, cg, cb] = rgb(cap);
  for (let dy = 0; dy < 5; dy++) {
    const w = 6 - dy;
    for (let dx = -w; dx <= w; dx++) t.set(8 + dx, 4 + dy, cr, cg, cb);
  }
  if (red) for (let i = 0; i < 6; i++) t.set(4 + rng.int(9), 4 + rng.int(4), 240, 240, 230);
  for (let y = 9; y < 14; y++) { t.set(7, y, 225, 220, 205); t.set(8, y, 205, 200, 185); }
  return t;
}

function snowTile(rng) { return noiseTile(0xf2fbfb, 0.05, rng); }

function pumpkinFaceTile(base) {
  const t = new Tile();
  t.px.set(base.px);
  t.rect(3, 5, 5, 7, 0x2a1a08); t.rect(10, 5, 12, 7, 0x2a1a08);
  t.rect(5, 10, 10, 11, 0x2a1a08); t.rect(4, 9, 4, 10, 0x2a1a08); t.rect(11, 9, 11, 10, 0x2a1a08);
  return t;
}

function doorTile(planks, upper) {
  const t = new Tile();
  t.px.set(planks.px);
  t.rect(0, 0, 0, 15, 0x00000010);
  if (upper) { t.rect(4, 3, 11, 9, 0xc8e4f0); t.rect(4, 3, 11, 3, 0x5a4a2a); t.rect(4, 9, 11, 9, 0x5a4a2a); }
  else { t.rect(12, 7, 13, 8, 0x3a3a3a); }
  for (let y = 0; y < 16; y++) { t.set(0, y, 90, 70, 40); t.set(15, y, 90, 70, 40); }
  return t;
}

function bedTile(kind, rng) {
  const t = new Tile();
  if (kind === 'top') { t.fill(0xa8322c); t.grain(rng, 0.08); t.rect(0, 0, 15, 1, 0xe8e6e0); }
  else { t.fill(0xa8322c); t.grain(rng, 0.08); t.rect(0, 11, 15, 15, 0xd8d4cc); }
  return t;
}

function tntTile(kind, rng) {
  const t = new Tile();
  if (kind === 'side') {
    t.fill(0xc23a2a); t.grain(rng, 0.07);
    t.rect(0, 5, 15, 9, 0xe8e4dc);
    t.rect(2, 6, 13, 8, 0xc23a2a);
  } else if (kind === 'top') { t.fill(0xc23a2a); t.grain(rng, 0.07); t.rect(4, 4, 11, 11, 0x3a3a3a); }
  else { t.fill(0x7a4a3a); t.grain(rng, 0.08); }
  return t;
}

// ------------------------------------------------------- texture key table
function buildTileFor(key, cache) {
  const rng = keyRng(key);
  const get = k => cache.get(k) || buildTileFor(k, cache);

  // wood families
  for (const w of WOODS) {
    if (key === `${w.name}_log`) return logSideTile(w.log, rng);
    if (key === `${w.name}_log_top`) return logTopTile(w.log, rng);
    if (key === `${w.name}_planks`) return plankTile(w.planks, rng);
    if (key === `${w.name}_leaves`) {
      const base = w.name === 'cherry' ? 0xe8a8c8 : (w.name === 'spruce' ? 0xbfd4bf : 0xffffff);
      return leafTile(base, rng, w.name === 'cherry');
    }
    if (key === `${w.name}_sapling`) return saplingTile(w, rng);
    if (key === `${w.name}_door_top`) return doorTile(get(`${w.name}_planks`), true);
    if (key === `${w.name}_door_bottom`) return doorTile(get(`${w.name}_planks`), false);
  }
  for (const [dye, color] of DYES) {
    if (key === `${dye}_wool`) { const t = noiseTile(color, 0.09, rng); return t; }
  }
  for (const kind of ['wheat', 'carrots', 'potatoes', 'stem']) {
    const m = key.match(new RegExp(`^${kind}_(\\d)$`));
    if (m) return cropTile(+m[1], rng, kind);
  }

  switch (key) {
    case 'stone': return noiseTile(0x7b7b7b, 0.11, rng);
    case 'smooth_stone': return noiseTile(0x9a9a9a, 0.05, rng);
    case 'deepslate': return noiseTile(0x4c4c50, 0.13, rng);
    case 'deepslate_top': return noiseTile(0x54545a, 0.09, rng);
    case 'cobblestone': return cobbleTile(0x8a8a8a, rng);
    case 'cobbled_deepslate': return cobbleTile(0x5a5a60, rng);
    case 'mossy_cobblestone': return cobbleTile(0x7f8a72, rng, true);
    case 'stone_bricks': return bricksTile(0x888888, rng, 0x666666);
    case 'bedrock': {
      const t = noiseTile(0x565656, 0.30, rng);
      for (let i = 0; i < 30; i++) { const x = rng.int(16), y = rng.int(16); t.set(x, y, 30, 30, 30); }
      return t;
    }
    case 'dirt': return noiseTile(0x8a6844, 0.14, rng);
    case 'coarse_dirt': return noiseTile(0x7d5c3c, 0.20, rng);
    case 'podzol_top': return noiseTile(0x6b4423, 0.20, rng);
    case 'podzol_side': { const t = new Tile(); t.px.set(get('dirt').px); for (let x = 0; x < 16; x++) for (let y = 0; y < 3 + rng.int(2); y++) t.set(x, y, 90 + rng.int(30), 60 + rng.int(20), 30); return t; }
    case 'mycelium_top': return noiseTile(0x7a6a7a, 0.16, rng);
    case 'mycelium_side': { const t = new Tile(); t.px.set(get('dirt').px); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) t.set(x, y, 122 + rng.int(20), 106 + rng.int(20), 122); return t; }
    case 'grass_top': return grassTopTile(rng);
    case 'grass_side': return grassSideTile(get('dirt'), rng);
    case 'sand': return noiseTile(0xdbd3a0, 0.07, rng);
    case 'red_sand': return noiseTile(0xbe6b2e, 0.08, rng);
    case 'gravel': { const t = noiseTile(0x8a8a88, 0.22, rng); for (let i = 0; i < 26; i++) { const x = rng.int(16), y = rng.int(16); t.set(x, y, 110, 108, 104); } return t; }
    case 'clay': return noiseTile(0xa0a6b0, 0.07, rng);
    case 'sandstone': { const t = noiseTile(0xdbd3a0, 0.06, rng); for (let y = 0; y < 16; y += 5) t.rect(0, y, 15, y, 0xc4bb8a); return t; }
    case 'sandstone_top': return noiseTile(0xe0d8a6, 0.05, rng);
    case 'sandstone_bottom': return noiseTile(0xcfc694, 0.06, rng);
    case 'red_sandstone': { const t = noiseTile(0xbe6b2e, 0.06, rng); for (let y = 0; y < 16; y += 5) t.rect(0, y, 15, y, 0xa25a26); return t; }
    case 'red_sandstone_top': return noiseTile(0xc47632, 0.05, rng);
    case 'red_sandstone_bottom': return noiseTile(0xb0602a, 0.06, rng);
    case 'snow_block': return snowTile(rng);
    case 'ice': { const t = noiseTile(0xa8ccf0, 0.06, rng); for (let i = 0; i < 256; i++) t.px[i * 4 + 3] = 200; return t; }
    case 'packed_ice': return noiseTile(0x93b8e0, 0.07, rng);
    case 'obsidian': { const t = noiseTile(0x18131f, 0.35, rng); for (let i = 0; i < 12; i++) t.set(rng.int(16), rng.int(16), 90, 60, 130); return t; }
    case 'farmland': { const t = noiseTile(0x6b4a2a, 0.10, rng); for (let y = 2; y < 16; y += 4) t.rect(0, y, 15, y, 0x53381f); return t; }
    case 'farmland_wet': { const t = noiseTile(0x452c16, 0.10, rng); for (let y = 2; y < 16; y += 4) t.rect(0, y, 15, y, 0x33200f); return t; }
    case 'water': return waterTile(rng);
    case 'lava': return lavaTile(rng);
    case 'glass': return glassTile(rng);
    case 'glass_pane': return glassTile(rng);
    case 'glass_pane_top': { const t = new Tile(); t.fill(0xcfe8f5, 220); return t; }
    case 'bookshelf': return bookshelfTile(get('oak_planks'), rng);
    case 'crafting_table_top': return craftingTopTile(get('oak_planks'), rng);
    case 'crafting_table_front': { const t = new Tile(); t.px.set(get('oak_planks').px); t.rect(1, 5, 14, 6, 0x6a4a28); t.rect(2, 8, 6, 12, 0x8a6a3a); t.rect(9, 8, 13, 12, 0x8a6a3a); return t; }
    case 'crafting_table_side': { const t = new Tile(); t.px.set(get('oak_planks').px); t.rect(0, 4, 15, 5, 0x6a4a28); t.rect(3, 8, 12, 13, 0x7a5a30); return t; }
    case 'furnace_top': { const t = noiseTile(0x808080, 0.10, rng); t.rect(3, 3, 12, 12, 0x6a6a6a); return t; }
    case 'furnace_side': return noiseTile(0x7c7c7c, 0.10, rng);
    case 'furnace_front': return furnaceFrontTile(get('furnace_side'), false, rng);
    case 'furnace_front_lit': return furnaceFrontTile(get('furnace_side'), true, rng);
    case 'chest': return chestTile(rng, false);
    case 'trapped_chest': return chestTile(rng, true);
    case 'torch': return torchTile(rng);
    case 'ladder': return ladderTile();
    case 'cobweb': return webTile();
    case 'fire': return fireTile(rng);
    case 'spawner': return spawnerTile(rng);
    case 'bed_top': return bedTile('top', rng);
    case 'bed_side': return bedTile('side', rng);
    case 'tnt_top': return tntTile('top', rng);
    case 'tnt_bottom': return tntTile('bottom', rng);
    case 'tnt_side': return tntTile('side', rng);
    case 'short_grass': return crossPlantTile(0xffffff, rng, 'short');
    case 'fern': return crossPlantTile(0xffffff, rng, 'fern');
    case 'tall_grass': return crossPlantTile(0xffffff, rng, 'tall');
    case 'dead_bush': { const t = crossPlantTile(0x9b7a3a, rng, 'short'); t.setMaskAll(0); return t; }
    case 'sugar_cane': return sugarCaneTile(rng);
    case 'cactus_top': return cactusTile(rng, 'top');
    case 'cactus_bottom': return cactusTile(rng, 'bottom');
    case 'cactus_side': return cactusTile(rng, 'side');
    case 'brown_mushroom': return mushroomTile(false, rng);
    case 'red_mushroom': return mushroomTile(true, rng);
    case 'pumpkin_top': return noiseTile(0xc07615, 0.10, rng);
    case 'pumpkin_side': { const t = noiseTile(0xc07615, 0.08, rng); for (let x = 1; x < 16; x += 3) t.rect(x, 0, x, 15, 0xa5620f); return t; }
    case 'pumpkin_face': return pumpkinFaceTile(get('pumpkin_side'));
    case 'melon_top': return noiseTile(0x6f9a2e, 0.10, rng);
    case 'melon_side': { const t = noiseTile(0x8fb03a, 0.10, rng); for (let x = 0; x < 16; x += 4) t.rect(x, 0, x, 15, 0x4f7020); return t; }
    case 'coal_block': return noiseTile(0x1b1b1b, 0.20, rng);
    case 'iron_block': return noiseTile(0xd8d8d8, 0.07, rng);
    case 'gold_block': return noiseTile(0xf2cf3c, 0.07, rng);
    case 'diamond_block': return noiseTile(0x4fd8d0, 0.08, rng);
    case 'emerald_block': return noiseTile(0x2fc44e, 0.08, rng);
    case 'copper_block': return noiseTile(0xc06a48, 0.08, rng);
    case 'lapis_block': return noiseTile(0x2a48a8, 0.09, rng);
    case 'redstone_block': return noiseTile(0xa81f1f, 0.10, rng);
  }

  // 10-stage break progress overlay
  const cm = key.match(/^crack_(\d)$/);
  if (cm) return crackTile(+cm[1]);

  // ores
  const oreColors = {
    coal: 0x1c1c1c, iron: 0xd8a878, copper: 0xd0743f, gold: 0xf2cf3c,
    redstone: 0xd02020, lapis: 0x2a55c8, diamond: 0x5ce8de, emerald: 0x2fd45a,
  };
  let m = key.match(/^(deepslate_)?(\w+)_ore$/);
  if (m && oreColors[m[2]] !== undefined) {
    const base = get(m[1] ? 'deepslate' : 'stone');
    return oreTile(base, oreColors[m[2]], rng, m[2] === 'diamond' || m[2] === 'emerald' ? 3 : 5);
  }

  // flowers
  const flowerColors = {
    dandelion: [0xf2d33c, 0xd8b820], poppy: [0xd03028, 0x2a1a10],
    cornflower: [0x4a6ad8, 0x2a3a88], allium: [0xc47ad8, 0xe8d8f0],
    azure_bluet: [0xe8eaf0, 0xf2d33c], oxeye_daisy: [0xf0f0e8, 0xf2d33c],
    orange_tulip: [0xe08020, 0x3a5a20], pink_petals: [0xf0a8c8, 0xf0e0e8],
  };
  if (flowerColors[key]) return flowerTile(flowerColors[key][0], flowerColors[key][1], rng);

  // fallback: flat magenta so a missing texture is unmistakable in dev
  const t = new Tile();
  t.fill(0xff00ff);
  t.rect(0, 0, 7, 7, 0x000000); t.rect(8, 8, 15, 15, 0x000000);
  return t;
}

/**
 * Break progress overlay, stages 0..9. Each stage keeps the previous stage's
 * cracks and grows them, so the animation reads as one fracture spreading.
 */
function crackTile(stage) {
  const t = new Tile();
  t.clear();
  const rng = new Random(0x5eed);
  // fixed set of crack seeds; how many are drawn (and how long) scales with stage
  const seeds = [];
  for (let i = 0; i < 10; i++) seeds.push([rng.int(16), rng.int(16), rng.float() * Math.PI * 2]);
  const active = 2 + stage;
  for (let i = 0; i < Math.min(seeds.length, active); i++) {
    const [sx, sy, ang0] = seeds[i];
    let x = sx, y = sy, ang = ang0;
    const len = 3 + stage + rng.int(3);
    for (let k = 0; k < len; k++) {
      t.set(x, y, 20, 20, 20, 210);
      if (k % 2 === 0) t.set(x + 1, y, 30, 30, 30, 120);
      ang += (rng.float() - 0.5) * 1.1;
      x = (x + Math.round(Math.cos(ang)) + 16) % 16;
      y = (y + Math.round(Math.sin(ang)) + 16) % 16;
    }
  }
  return t;
}

/**
 * Dilate colour and tint-mask into fully transparent texels.
 *
 * Mipmapping averages RGBA across texels, so a cutout texture whose
 * transparent pixels are black-and-mask-zero goes dark and loses its biome
 * tint as it recedes -- which is exactly why untreated grass and leaves read
 * as grey fringe at distance. Bleeding the neighbouring colour outwards (while
 * leaving alpha at 0) keeps the mip chain honest.
 */
function bleedTile(tile, passes = 6) {
  const px = tile.px, mask = tile.mask;
  let opaque = new Uint8Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) opaque[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  let anyOpaque = false;
  for (let i = 0; i < opaque.length; i++) if (opaque[i]) { anyOpaque = true; break; }
  if (!anyOpaque) return tile;

  for (let pass = 0; pass < passes; pass++) {
    const next = opaque.slice();
    let changed = false;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = y * TILE + x;
        if (opaque[i]) continue;
        let r = 0, g = 0, b = 0, m = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= TILE || ny >= TILE) continue;
            const j = ny * TILE + nx;
            if (!opaque[j]) continue;
            r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; m += mask[j];
            n++;
          }
        }
        if (n === 0) continue;
        px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n;
        mask[i] = m / n;
        next[i] = 1;
        changed = true;
      }
    }
    opaque = next;
    if (!changed) break;
  }
  return tile;
}

function saplingTile(w, rng) {
  const t = new Tile();
  t.clear();
  const leafColor = w.name === 'cherry' ? 0xe8a8c8 : (w.name === 'spruce' ? 0x4a7a58 : 0x4f9c2f);
  const [lr, lg, lb] = rgb(leafColor);
  for (let y = 15; y >= 11; y--) t.set(8, y, 110, 80, 45);
  for (let dy = 0; dy < 6; dy++) {
    const wdt = dy < 2 ? 1 : (dy < 4 ? 3 : 2);
    for (let dx = -wdt; dx <= wdt; dx++) {
      if (rng.float() < 0.15) continue;
      const f = 0.75 + rng.float() * 0.45;
      t.set(8 + dx, 10 - dy, lr * f, lg * f, lb * f);
    }
  }
  return t;
}

// ---------------------------------------------------------------- the atlas
export function buildAtlas() {
  const cache = new Map();
  const keys = [];
  const layerOf = new Map();

  const need = (key) => {
    if (key == null) return 0;
    if (layerOf.has(key)) return layerOf.get(key);
    const layer = keys.length;
    keys.push(key);
    layerOf.set(key, layer);
    return layer;
  };
  need('__missing__');
  for (let i = 0; i < 10; i++) need('crack_' + i);

  // Face slot order is [-X, +X, -Y, +Y, -Z, +Z].
  const n = BLOCKS.length;
  const faceLayer = new Uint16Array(n * 6);
  const special = new Uint16Array(n * 4);

  for (const b of BLOCKS) {
    const tex = b.tex || {};
    const pick = (...names) => {
      for (const nm of names) if (tex[nm] != null) return tex[nm];
      return null;
    };
    const west = pick('west', 'side', 'all');
    const east = pick('east', 'side', 'all');
    const down = pick('bottom', 'all');
    const up = pick('top', 'all');
    const north = pick('north', 'side', 'all');
    const south = pick('south', 'side', 'all');
    const base = b.id * 6;
    faceLayer[base + 0] = need(west);
    faceLayer[base + 1] = need(east);
    faceLayer[base + 2] = need(down);
    faceLayer[base + 3] = need(up);
    faceLayer[base + 4] = need(north);
    faceLayer[base + 5] = need(south);

    if (b.render === 'facing') {
      special[b.id * 4 + 0] = need(tex.front || west);
      special[b.id * 4 + 1] = tex.frontLit ? need(tex.frontLit) : 0;
    }
    if (b.render === 'door') special[b.id * 4 + 0] = need(tex.top);
    if (b.name === 'farmland') special[b.id * 4 + 2] = need('farmland_wet');
    if (b.render === 'crop') {
      const kind = b.name === 'melon_stem' || b.name === 'pumpkin_stem' ? 'stem' : b.name;
      let first = 0;
      for (let a = 0; a < 8; a++) {
        const l = need(`${kind}_${a}`);
        if (a === 0) first = l;
      }
      special[b.id * 4 + 0] = first;
      faceLayer[base + 0] = first;
    }
  }

  // Rasterise every referenced key.
  const layers = keys.length;
  const data = new Uint8Array(layers * TILE * TILE * 4);
  const mask = new Uint8Array(layers * TILE * TILE);
  for (let i = 0; i < layers; i++) {
    const key = keys[i];
    let tile = cache.get(key);
    if (!tile) { tile = buildTileFor(key, cache); cache.set(key, tile); }
    if (!tile._bled) { bleedTile(tile); tile._bled = true; }
    data.set(tile.px, i * TILE * TILE * 4);
    mask.set(tile.mask, i * TILE * TILE);
  }

  return { layers, data, mask, keys, faceLayer, special, layerOf, tiles: cache };
}

/** Tables the mesher needs, derived from the block registry + atlas. */
export function buildMeshTables(atlas) {
  const n = BLOCKS.length;
  const T = {
    count: n,
    render: new Uint8Array(n),
    cube: new Uint8Array(n),
    solid: new Uint8Array(n),
    opacity: new Uint8Array(n),
    emit: new Uint8Array(n),
    liquid: new Uint8Array(n),
    tint: new Uint8Array(n),
    pass: new Uint8Array(n),
    selfCull: new Uint8Array(n),
    replaceable: new Uint8Array(n),
    faceLayer: atlas.faceLayer,
    special: atlas.special,
    caveAirId: 1,
  };
  for (const b of BLOCKS) {
    const i = b.id;
    T.render[i] = RENDER_IDS[b.render] ?? 1;
    T.cube[i] = b.cube ? 1 : 0;
    T.solid[i] = b.solid ? 1 : 0;
    T.opacity[i] = b.opacity;
    T.emit[i] = b.emit;
    T.liquid[i] = b.liquid === 'water' ? 1 : (b.liquid === 'lava' ? 2 : 0);
    T.tint[i] = b.tint === 'grass' ? 1 : (b.tint === 'foliage' ? 2 : (b.tint === 'water' ? 3 : 0));
    T.pass[i] = b.liquid === 'water' ? 2 : 0;
    T.selfCull[i] = (b.leaves || b.transparent || b.liquid || b.name === 'ice') ? 1 : 0;
    T.replaceable[i] = b.replaceable ? 1 : 0;
  }
  T.render[0] = RENDER_IDS.air;
  T.render[1] = RENDER_IDS.air;
  return T;
}

// ------------------------------------------------------------- item icons
const ICON_CACHE = new Map();
const ICON_SIZE = 32;

function iconCanvas() {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE; c.height = ICON_SIZE;
  return c;
}

function tileToImageData(ctx, tile) {
  const img = ctx.createImageData(TILE, TILE);
  img.data.set(tile.px);
  return img;
}

/** Draw a block-item as a small isometric cube built from its own textures. */
function drawBlockIcon(ctx, atlas, blockDef, tintColor) {
  const tex = blockDef.tex || {};
  const topKey = tex.top || tex.all || tex.side;
  const sideKey = tex.side || tex.all || tex.north || tex.top;
  const top = atlas.tiles.get(topKey) || atlas.tiles.get('__missing__');
  const side = atlas.tiles.get(sideKey) || top;
  if (!top) return;

  const sample = (tile, u, v, tint, light) => {
    const x = Math.min(15, Math.max(0, Math.floor(u * 16)));
    const y = Math.min(15, Math.max(0, Math.floor(v * 16)));
    const i = (y * 16 + x) * 4;
    let r = tile.px[i], g = tile.px[i + 1], b = tile.px[i + 2];
    const a = tile.px[i + 3];
    const m = tile.mask[y * 16 + x] / 255;
    if (m > 0 && tint != null) {
      r = r * (1 - m) + r * m * ((tint >> 16 & 255) / 255);
      g = g * (1 - m) + g * m * ((tint >> 8 & 255) / 255);
      b = b * (1 - m) + b * m * ((tint & 255) / 255);
    }
    return [r * light, g * light, b * light, a];
  };

  const img = ctx.createImageData(ICON_SIZE, ICON_SIZE);
  const D = img.data;
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) return;
    if (c[3] === 0) return;
    const i = (y * ICON_SIZE + x) * 4;
    D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
  };

  // isometric projection of a unit cube into a 32x32 icon
  const ox = 16, oy = 5, sx = 14, sy = 7, hh = 13;
  for (let v = 0; v < 1; v += 1 / 48) {
    for (let u = 0; u < 1; u += 1 / 48) {
      const px = ox + (u - v) * sx;
      const py = oy + (u + v) * sy;
      put(Math.round(px), Math.round(py), sample(top, u, v, tintColor, 1.0));
      put(Math.round(px) + 1, Math.round(py), sample(top, u, v, tintColor, 1.0));
    }
  }
  for (let h = 0; h < 1; h += 1 / 48) {
    for (let u = 0; u < 1; u += 1 / 48) {
      const px = ox - u * sx;
      const py = oy + u * sy + h * hh;
      put(Math.round(px), Math.round(py), sample(side, u, h, tintColor, 0.78));
      put(Math.round(px) - 1, Math.round(py), sample(side, u, h, tintColor, 0.78));
      const px2 = ox + u * sx;
      const py2 = oy + u * sy + h * hh;
      put(Math.round(px2), Math.round(py2), sample(side, 1 - u, h, tintColor, 0.6));
      put(Math.round(px2) + 1, Math.round(py2), sample(side, 1 - u, h, tintColor, 0.6));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Flat icon: just the texture, scaled -- used for plants, doors, panes. */
function drawFlatIcon(ctx, atlas, key, tintColor) {
  const tile = atlas.tiles.get(key) || atlas.tiles.get('__missing__');
  if (!tile) return;
  const img = ctx.createImageData(ICON_SIZE, ICON_SIZE);
  const D = img.data;
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const sxp = Math.floor(x / 2), syp = Math.floor(y / 2);
      const i = (syp * 16 + sxp) * 4;
      const o = (y * ICON_SIZE + x) * 4;
      let r = tile.px[i], g = tile.px[i + 1], b = tile.px[i + 2];
      const m = tile.mask[syp * 16 + sxp] / 255;
      if (m > 0 && tintColor != null) {
        r = r * (1 - m) + r * m * ((tintColor >> 16 & 255) / 255);
        g = g * (1 - m) + g * m * ((tintColor >> 8 & 255) / 255);
        b = b * (1 - m) + b * m * ((tintColor & 255) / 255);
      }
      D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = tile.px[i + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
}

const MAT_COLOR = {
  wooden: '#a9763f', stone: '#8a8a8a', iron: '#d8d8d8', golden: '#f2cf3c', diamond: '#4fd8d0',
  leather: '#96613a',
};

function drawTool(ctx, type, material) {
  const c = MAT_COLOR[material] || '#bbb';
  ctx.lineCap = 'round';
  // handle
  ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(9, 25); ctx.lineTo(21, 10); ctx.stroke();
  ctx.strokeStyle = c; ctx.fillStyle = c;
  ctx.lineWidth = 3.5;
  switch (type) {
    case 'pickaxe':
      ctx.beginPath(); ctx.moveTo(15, 11); ctx.quadraticCurveTo(22, 4, 29, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, 11); ctx.quadraticCurveTo(15, 4, 22, 3); ctx.stroke();
      break;
    case 'axe':
      ctx.beginPath(); ctx.moveTo(18, 12); ctx.lineTo(24, 5); ctx.lineTo(29, 11); ctx.lineTo(22, 16); ctx.closePath(); ctx.fill();
      break;
    case 'shovel':
      ctx.beginPath(); ctx.moveTo(19, 12); ctx.lineTo(25, 5); ctx.lineTo(29, 9); ctx.lineTo(23, 15); ctx.closePath(); ctx.fill();
      break;
    case 'hoe':
      ctx.beginPath(); ctx.moveTo(18, 11); ctx.lineTo(29, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 11); ctx.lineTo(19, 5); ctx.stroke();
      break;
    case 'sword':
      ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(8, 26); ctx.lineTo(12, 22); ctx.stroke();
      ctx.strokeStyle = '#9a7a40'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(9, 19); ctx.lineTo(16, 26); ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(12, 22); ctx.lineTo(27, 6); ctx.stroke();
      break;
  }
}

function drawArmor(ctx, slot, material) {
  const c = MAT_COLOR[material] || '#bbb';
  ctx.fillStyle = c; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
  switch (slot) {
    case 'helmet':
      ctx.beginPath(); ctx.arc(16, 16, 10, Math.PI, 0); ctx.lineTo(26, 22); ctx.lineTo(21, 22);
      ctx.lineTo(21, 18); ctx.lineTo(11, 18); ctx.lineTo(11, 22); ctx.lineTo(6, 22); ctx.closePath();
      ctx.fill(); ctx.stroke(); break;
    case 'chestplate':
      ctx.beginPath(); ctx.moveTo(7, 8); ctx.lineTo(25, 8); ctx.lineTo(25, 26); ctx.lineTo(19, 26);
      ctx.lineTo(19, 16); ctx.lineTo(13, 16); ctx.lineTo(13, 26); ctx.lineTo(7, 26); ctx.closePath();
      ctx.fill(); ctx.stroke(); break;
    case 'leggings':
      ctx.fillRect(8, 6, 16, 8); ctx.fillRect(8, 14, 6, 12); ctx.fillRect(18, 14, 6, 12);
      ctx.strokeRect(8, 6, 16, 8); break;
    case 'boots':
      ctx.fillRect(7, 12, 7, 12); ctx.fillRect(18, 12, 7, 12);
      ctx.fillRect(5, 20, 9, 5); ctx.fillRect(18, 20, 9, 5); break;
  }
}

const SIMPLE_ICONS = {
  stick: ctx => { ctx.strokeStyle = '#9a7130'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(9, 24); ctx.lineTo(23, 8); ctx.stroke(); },
  coal: ctx => blob(ctx, '#1e1e1e', '#3a3a3a'),
  charcoal: ctx => blob(ctx, '#33302a', '#4d4840'),
  flint: ctx => blob(ctx, '#4a4a52', '#6a6a72'),
  gunpowder: ctx => dust(ctx, '#8a8a8a'),
  redstone: ctx => dust(ctx, '#d02020'),
  bone_meal: ctx => dust(ctx, '#e8e8dc'),
  sugar: ctx => dust(ctx, '#f4f4f4'),
  lapis_lazuli: ctx => gem(ctx, '#2a55c8'),
  diamond: ctx => gem(ctx, '#5ce8de'),
  emerald: ctx => gem(ctx, '#2fd45a'),
  iron_ingot: ctx => ingot(ctx, '#d8d8d8'),
  gold_ingot: ctx => ingot(ctx, '#f2cf3c'),
  copper_ingot: ctx => ingot(ctx, '#d0743f'),
  brick: ctx => ingot(ctx, '#a4553f'),
  raw_iron: ctx => blob(ctx, '#c8a080', '#e0b898'),
  raw_gold: ctx => blob(ctx, '#d4b040', '#eccc60'),
  raw_copper: ctx => blob(ctx, '#c07048', '#d88860'),
  leather: ctx => { ctx.fillStyle = '#96613a'; roundRect(ctx, 6, 8, 20, 16, 4); ctx.fill(); ctx.strokeStyle = '#6a4327'; ctx.stroke(); },
  string: ctx => { ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(6, 10 + i * 6); ctx.quadraticCurveTo(16, 4 + i * 6, 26, 12 + i * 6); } ctx.stroke(); },
  feather: ctx => { ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(10, 25); ctx.quadraticCurveTo(20, 16, 22, 5); ctx.stroke(); ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const t = i / 6; ctx.beginPath(); ctx.moveTo(12 + t * 9, 23 - t * 15); ctx.lineTo(17 + t * 8, 22 - t * 16); ctx.stroke(); } },
  bone: ctx => { ctx.strokeStyle = '#eae7dc'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(9, 23); ctx.lineTo(23, 9); ctx.stroke(); ctx.fillStyle = '#eae7dc'; ctx.beginPath(); ctx.arc(7, 26, 4, 0, 7); ctx.arc(25, 7, 4, 0, 7); ctx.fill(); },
  wheat: ctx => { ctx.strokeStyle = '#d8b95a'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(16 + i * 5, 27); ctx.lineTo(16 + i * 6, 8); ctx.stroke(); } ctx.fillStyle = '#e8cf7a'; for (let i = -1; i <= 1; i++) for (let k = 0; k < 4; k++) ctx.fillRect(14 + i * 6, 7 + k * 4, 4, 3); },
  wheat_seeds: ctx => seeds(ctx, '#8aa03a'),
  melon_seeds: ctx => seeds(ctx, '#d8d0a0'),
  pumpkin_seeds: ctx => seeds(ctx, '#e0d8b0'),
  apple: ctx => { ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.arc(16, 18, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(18, 5); ctx.stroke(); ctx.fillStyle = '#4a8a2a'; ctx.beginPath(); ctx.ellipse(21, 6, 4, 2.5, -0.5, 0, 7); ctx.fill(); },
  bread: ctx => { ctx.fillStyle = '#c08a40'; roundRect(ctx, 4, 11, 24, 12, 5); ctx.fill(); ctx.strokeStyle = '#8a5f28'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(9 + i * 6, 13); ctx.lineTo(11 + i * 6, 21); ctx.stroke(); } },
  cookie: ctx => { ctx.fillStyle = '#c08a55'; ctx.beginPath(); ctx.arc(16, 16, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3a1a'; for (const [x, y] of [[12, 12], [19, 13], [15, 19], [21, 19]]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); } },
  paper: ctx => { ctx.fillStyle = '#f2f2ea'; ctx.fillRect(7, 6, 18, 21); ctx.strokeStyle = '#c8c8bc'; ctx.strokeRect(7, 6, 18, 21); ctx.fillStyle = '#c8c8bc'; for (let i = 0; i < 4; i++) ctx.fillRect(10, 11 + i * 4, 12, 1); },
  book: ctx => { ctx.fillStyle = '#8a3a2a'; ctx.fillRect(6, 6, 20, 21); ctx.fillStyle = '#f2f2ea'; ctx.fillRect(10, 8, 14, 17); ctx.fillStyle = '#d8b840'; ctx.fillRect(6, 6, 3, 21); },
  bowl: ctx => { ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(6, 14); ctx.quadraticCurveTo(16, 28, 26, 14); ctx.closePath(); ctx.fill(); },
  mushroom_stew: ctx => { ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(6, 14); ctx.quadraticCurveTo(16, 28, 26, 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#b07a4a'; ctx.fillRect(7, 12, 18, 3); },
  beetroot_soup: ctx => { ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(6, 14); ctx.quadraticCurveTo(16, 28, 26, 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#992244'; ctx.fillRect(7, 12, 18, 3); },
  bucket: ctx => bucket(ctx, null),
  water_bucket: ctx => bucket(ctx, '#3f76e4'),
  lava_bucket: ctx => bucket(ctx, '#e07020'),
  milk_bucket: ctx => bucket(ctx, '#f4f4f0'),
  snowball: ctx => { ctx.fillStyle = '#f0f8ff'; ctx.beginPath(); ctx.arc(16, 17, 9, 0, 7); ctx.fill(); },
  egg: ctx => { ctx.fillStyle = '#f0e4d0'; ctx.beginPath(); ctx.ellipse(16, 17, 7, 9, 0, 0, 7); ctx.fill(); },
  arrow: ctx => { ctx.strokeStyle = '#9a7130'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, 25); ctx.lineTo(24, 8); ctx.stroke(); ctx.fillStyle = '#c8c8c8'; ctx.beginPath(); ctx.moveTo(26, 6); ctx.lineTo(20, 8); ctx.lineTo(24, 12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#f0f0f0'; ctx.beginPath(); ctx.moveTo(8, 25); ctx.lineTo(12, 26); ctx.moveTo(8, 25); ctx.lineTo(7, 21); ctx.stroke(); },
  bow: ctx => { ctx.strokeStyle = '#9a7130'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(10, 16, 12, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15, 5); ctx.lineTo(15, 27); ctx.stroke(); },
  shield: ctx => { ctx.fillStyle = '#9a7130'; ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(27, 8); ctx.lineTo(27, 19); ctx.quadraticCurveTo(16, 29, 5, 19); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 2; ctx.stroke(); },
  shears: ctx => { ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(22, 24); ctx.moveTo(24, 8); ctx.lineTo(10, 24); ctx.stroke(); },
  flint_and_steel: ctx => { ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(13, 18, 7, 0.6, 5.4); ctx.stroke(); ctx.fillStyle = '#4a4a52'; ctx.beginPath(); ctx.arc(24, 10, 5, 0, 7); ctx.fill(); },
  clay_ball: ctx => blob(ctx, '#a0a6b0', '#b8bec8'),
  rotten_flesh: ctx => blob(ctx, '#6a5a3a', '#8a7a4a'),
  spider_eye: ctx => { ctx.fillStyle = '#8a2a2a'; ctx.beginPath(); ctx.arc(16, 16, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#e8d040'; ctx.beginPath(); ctx.arc(16, 16, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(15, 12, 2, 8); },
  ink_sac: ctx => blob(ctx, '#16161a', '#2a2a30'),
  boat: ctx => { ctx.fillStyle = '#a9763f'; ctx.beginPath(); ctx.moveTo(4, 14); ctx.lineTo(28, 14); ctx.lineTo(24, 24); ctx.lineTo(8, 24); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2; ctx.stroke(); },
  bed_item: ctx => { ctx.fillStyle = '#a8322c'; ctx.fillRect(4, 14, 24, 8); ctx.fillStyle = '#e8e6e0'; ctx.fillRect(4, 12, 8, 6); ctx.fillStyle = '#7a5a30'; ctx.fillRect(4, 22, 24, 3); },
  dye: (ctx, tint) => dust(ctx, '#' + (tint || 0xffffff).toString(16).padStart(6, '0')),
  pumpkin_pie: ctx => { ctx.fillStyle = '#d8a850'; ctx.beginPath(); ctx.arc(16, 17, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#b07830'; ctx.beginPath(); ctx.arc(16, 17, 7, 0, 7); ctx.fill(); },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function blob(ctx, dark, light) {
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(11, 10); ctx.lineTo(21, 8); ctx.lineTo(25, 17); ctx.lineTo(19, 25); ctx.lineTo(10, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.moveTo(12, 13); ctx.lineTo(19, 11); ctx.lineTo(21, 16); ctx.lineTo(14, 18); ctx.closePath(); ctx.fill();
}
function dust(ctx, color) {
  ctx.fillStyle = color;
  const pts = [[10, 20], [14, 14], [19, 12], [22, 18], [17, 22], [12, 24], [20, 24], [15, 18]];
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }
}
function gem(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(26, 14); ctx.lineTo(16, 27); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(21, 14); ctx.lineTo(16, 18); ctx.lineTo(11, 14); ctx.closePath(); ctx.fill();
}
function ingot(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(7, 22); ctx.lineTo(10, 12); ctx.lineTo(24, 12); ctx.lineTo(27, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.moveTo(11, 14); ctx.lineTo(23, 14); ctx.lineTo(24, 17); ctx.lineTo(10, 17); ctx.closePath(); ctx.fill();
}
function seeds(ctx, color) {
  ctx.fillStyle = color;
  for (const [x, y] of [[11, 13], [18, 11], [21, 18], [13, 20], [16, 16]]) {
    ctx.beginPath(); ctx.ellipse(x, y, 3, 2, 0.6, 0, 7); ctx.fill();
  }
}
function bucket(ctx, fluid) {
  ctx.fillStyle = '#c8c8d0';
  ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(24, 10); ctx.lineTo(21, 26); ctx.lineTo(11, 26); ctx.closePath(); ctx.fill();
  if (fluid) { ctx.fillStyle = fluid; ctx.beginPath(); ctx.moveTo(10, 13); ctx.lineTo(22, 13); ctx.lineTo(20, 24); ctx.lineTo(12, 24); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = '#9a9aa4'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(8, 10); ctx.quadraticCurveTo(16, 3, 24, 10); ctx.stroke();
}

function drawFood(ctx, name) {
  const cooked = name.startsWith('cooked_') || name === 'baked_potato';
  const raw = { beef: '#c85a5a', porkchop: '#e8a0a0', chicken: '#f0c8a8', mutton: '#d07070' };
  const base = name.replace('cooked_', '');
  if (raw[base]) {
    ctx.fillStyle = cooked ? '#8a5a30' : raw[base];
    ctx.beginPath(); ctx.ellipse(16, 17, 10, 7, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = cooked ? '#a97a48' : '#f0c8c8';
    ctx.beginPath(); ctx.ellipse(14, 15, 5, 3, 0.3, 0, 7); ctx.fill();
    return true;
  }
  if (base === 'carrot') {
    ctx.fillStyle = '#e07820'; ctx.beginPath(); ctx.moveTo(12, 27); ctx.lineTo(20, 11); ctx.lineTo(23, 13); ctx.lineTo(15, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f8a2a'; ctx.beginPath(); ctx.arc(22, 9, 4, 0, 7); ctx.fill();
    return true;
  }
  if (base === 'potato') {
    ctx.fillStyle = cooked ? '#c8a050' : '#c8a870'; ctx.beginPath(); ctx.ellipse(16, 17, 9, 7, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.2)'; for (const [x, y] of [[13, 15], [19, 18], [16, 21]]) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
    return true;
  }
  if (base === 'melon_slice') {
    ctx.fillStyle = '#4f7020'; ctx.beginPath(); ctx.moveTo(4, 24); ctx.lineTo(28, 24); ctx.lineTo(16, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d84a4a'; ctx.beginPath(); ctx.moveTo(7, 22); ctx.lineTo(25, 22); ctx.lineTo(16, 9); ctx.closePath(); ctx.fill();
    return true;
  }
  return false;
}

export function itemIconURL(it, atlas) {
  if (ICON_CACHE.has(it.id)) return ICON_CACHE.get(it.id);
  const canvas = iconCanvas();
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const b = it.block != null ? BLOCKS[it.block] : null;
  if (b) {
    const tintColor = b.tint === 'grass' ? 0x91bd59 : (b.tint === 'foliage' ? 0x77ab2f : null);
    const flat = ['cross', 'tall_cross', 'crop', 'door', 'pane', 'ladder', 'torch', 'sign', 'fire', 'cactus'];
    if (flat.includes(b.render)) drawFlatIcon(ctx, atlas, (b.tex.all || b.tex.side || b.tex.top), tintColor);
    else drawBlockIcon(ctx, atlas, b, tintColor);
  } else if (it.tool && it.tool.material && ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'].includes(it.tool.type)) {
    drawTool(ctx, it.tool.type, it.tool.material);
  } else if (it.armor) {
    drawArmor(ctx, ARMOR_SLOTS[it.armor.slot], it.armor.material);
  } else if (it.boat) {
    SIMPLE_ICONS.boat(ctx);
  } else if (it.name.endsWith('_dye')) {
    SIMPLE_ICONS.dye(ctx, it.tint);
  } else if (SIMPLE_ICONS[it.name]) {
    SIMPLE_ICONS[it.name](ctx, it.tint);
  } else if (!drawFood(ctx, it.name)) {
    // last resort: a lettered chip so unknown items are still identifiable
    ctx.fillStyle = '#5a5f6a'; roundRect(ctx, 5, 5, 22, 22, 4); ctx.fill();
    ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 14px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.display.slice(0, 2).toUpperCase(), 16, 17);
  }
  const url = canvas.toDataURL();
  ICON_CACHE.set(it.id, url);
  return url;
}
