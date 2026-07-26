// Toy Room - a child's bedroom rebuilt at toy scale, so a chameleon is about
// as tall as an alphabet block is wide. Everything is chunky and primary,
// which makes paint choices obvious; the difficulty is that the good hiding
// places (chest, doll house, top shelf) all need a climb, and every climb is a
// staircase of dropped picture books out in the open.

import { createMap } from './kit.js';

export const meta = {
  id: 'toyroom',
  name: 'Toy Room',
  theme: 'giant nursery',
  tagline: 'Primary colours, giant blocks, and a very long way up the bookshelf.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [52, 42],
    ceiling: 13,
    sky: '#cfe6f5',
    ambient: '#6e7a86',
    sunDir: [0.46, -0.78, -0.42],
    sunColor: '#fff2d8',
    sunIntensity: 0.85,
    fog: '#dbeaf4',
    fogDensity: 0.007,
    exposure: 1.05,
  });

  const PLANK = '#c9974f';
  const PLANK2 = '#b07f3f';
  const WALL = '#a8cfe8';
  const CREAM = '#f2e7d2';
  const RED = '#e23b3b';
  const BLUE = '#2f6fd0';
  const YELLOW = '#ffd23f';
  const GREEN = '#3fae5a';
  const PURPLE = '#8f5fd0';
  const PINK = '#f08cae';
  const WHITE = '#f7f3ea';
  const TEAL = '#2f8f8f';
  const PLUSH = '#b07a4a';
  const PRIMARY = [RED, BLUE, YELLOW, GREEN, PURPLE, PINK];
  const BOOKC = [RED, BLUE, YELLOW, GREEN, PURPLE, PINK, WHITE, TEAL];

  m.perimeter(15, WALL);
  m.room({ x: 0, z: 0, w: 52, d: 42, h: 13, floor: PLANK, wall: WALL, ceil: '#f6f2e6' });
  for (let i = 0; i < 21; i++) {
    m.rug(0, -20 + i * 2, 52, 1.9, i % 2 ? PLANK : PLANK2);
  }
  for (const [x, z, w, d] of [[0, -20.6, 52, 0.5], [0, 20.6, 52, 0.5], [-25.6, 0, 0.5, 42], [25.6, 0, 0.5, 42]]) {
    m.box(x, 0, z, w, 0.9, d, CREAM, { solid: false, tag: 'skirting' });
    m.box(x, 6.0, z, w, 0.5, d, CREAM, { solid: false, tag: 'dado' });
  }

  // Every climb on this map is a staircase of dropped picture books. Steps are
  // kept under 0.45 so they are walkable rather than jump-only.
  const bookStair = (x, z, yaw, n, rise, run, w, y0 = 0) => {
    const a = yaw * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const off = (i + 0.5) * run;
      m.box(x + Math.sin(a) * off, y0, z + Math.cos(a) * off, w, rise * (i + 1), run,
        m.pick(BOOKC), { yaw, jitter: 0.08, tag: 'bookstep' });
    }
  };

  // ------------------------------------------------------------- bookshelf --
  // Four galleries along the north wall. Books stand at the back, the front
  // 1.7 m of every level is a walkway, and a staircase on each level climbs
  // through a deliberate gap in the walkway above it.
  const BOOK_Z = -19.3, WALK_Z = -16.85, SHELF_W = 26.4, SHELF_CX = -11;
  const LEVELS = [0, 3.3, 6.6, 9.9];
  const BAYS = [[-23.75, -19.05], [-18.55, -13.85], [-13.35, -8.65], [-8.15, -3.45], [-2.95, 1.75]];
  m.box(SHELF_CX, 0, -20.2, SHELF_W, 11.5, 0.6, PLANK2, { tag: 'shelfBack' });
  for (const ux of [-24, -18.8, -13.6, -8.4, -3.2, 2]) {
    m.box(ux, 0, -19.0, 0.5, 11.5, 2.6, PLANK2, { tag: 'shelfUpright' });
  }
  // Walkway gaps that the internal staircases climb through.
  const WALK_GAP = { 2: [-8.9, -3.5], 3: [-16.3, -11.3] };
  LEVELS.forEach((ly, li) => {
    m.box(SHELF_CX, ly, -19.05, SHELF_W, 0.35, 2.7, PLANK, { tag: 'shelf' });
    const gap = WALK_GAP[li];
    const segs = gap
      ? [[-24.2, gap[0]], [gap[1], 2.2]]
      : [[-24.2, 2.2]];
    for (const [a, b] of segs) {
      m.box((a + b) / 2, ly, WALK_Z, b - a, 0.35, 1.7, PLANK, { tag: 'shelfWalk' });
    }
  });
  // Books, filled bay by bay. One bay per level is left clear to stand in.
  const CLEAR = [[0, 2], [1, 4], [2, 0], [3, 3]];
  LEVELS.forEach((ly, li) => {
    BAYS.forEach((bay, bi) => {
      if (CLEAR.some(([l, b]) => l === li && b === bi)) return;
      let bx = bay[0] + 0.2;
      while (bx < bay[1] - 0.9) {
        const w = m.range(0.55, 1.15);
        if (m.chance(0.12)) { bx += w + 0.6; continue; }
        m.box(bx + w / 2, ly + 0.35, BOOK_Z + m.range(-0.2, 0.2), w, m.range(1.5, 2.1), 2.2,
          m.pick(BOOKC), { yaw: m.range(-4, 4), jitter: 0.09, tag: 'book' });
        bx += w + 0.12;
      }
    });
  });
  bookStair(-0.6, -10.3, 180, 9, 0.41, 0.7, 3.0);                    // floor  -> level 1
  bookStair(-8.8, WALK_Z, 90, 8, 0.41, 0.55, 1.5, 3.3);              // level 1 -> level 2
  bookStair(-11.4, WALK_Z, 270, 8, 0.41, 0.55, 1.5, 6.6);            // level 2 -> level 3
  m.spot(-11.0, 0.35, BOOK_Z, { stance: 'crouch', quality: 0.72, hint: 'In the empty bay on the bottom shelf' });
  m.spot(-0.6, 3.65, WALK_Z, { stance: 'crouch', quality: 0.58, hint: 'Where the book stairs land, second shelf' });
  m.spot(-0.6, 3.65, BOOK_Z, { stance: 'stand', quality: 0.8, hint: 'Standing among the books, second shelf' });
  m.spot(-21.4, 6.95, BOOK_Z, { stance: 'crouch', quality: 0.86, hint: 'Third shelf, far end' });
  m.spot(-5.8, 10.25, BOOK_Z, { stance: 'prone', quality: 0.9, hint: 'Flat on the very top shelf' });
  m.spot(-20, 10.25, WALK_Z, { stance: 'prone', quality: 0.82, hint: 'Along the top gallery' });

  // ------------------------------------------------------------ doll house --
  const DX = 16, DZ = -15.5;
  m.box(DX, 0, DZ - 4.2, 12, 8.2, 0.5, CREAM, { tag: 'dollBack' });
  for (const s of [-1, 1]) m.box(DX + s * 5.75, 0, DZ, 0.5, 8.2, 8.4, CREAM, { tag: 'dollSide' });
  for (const s of [-1, 1]) m.box(DX + s * 4.6, 0, DZ + 4.2, 2.3, 8.2, 0.5, CREAM, { tag: 'dollFront' });
  m.box(DX, 0, DZ + 4.2, 7.2, 0.6, 0.5, PINK, { tag: 'dollSill' });
  m.box(DX, 6.4, DZ + 4.2, 7.2, 1.8, 0.5, CREAM, { tag: 'dollLintel' });
  m.box(18.25, 3.6, DZ + 0.1, 6.5, 0.4, 8.2, PLANK, { tag: 'dollFloor2' });
  m.box(DX, 7.6, DZ, 12, 0.4, 8.4, PLANK2, { tag: 'dollAttic' });
  m.wedge(DX, 8.0, DZ, 12.6, 3.0, 9.0, RED, { tag: 'dollRoof' });
  for (const [wx, wy] of [[-3.4, 1.4], [3.4, 1.4], [-3.4, 5.0], [3.4, 5.0]]) {
    m.box(DX + wx, wy, DZ - 4.4, 2.0, 1.8, 0.12, '#cfeaff', { solid: false, tag: 'window', emis: 0.35 });
  }
  bookStair(10.5, DZ - 0.5, 90, 9, 0.44, 0.5, 3.0);
  m.box(19.2, 0, DZ - 2.4, 3.0, 1.0, 1.6, BLUE, { tag: 'dollBed' });
  m.box(20.4, 0, DZ + 2.0, 1.6, 1.4, 1.6, YELLOW, { tag: 'dollChair' });
  m.box(19.4, 4.0, DZ - 2.6, 2.6, 1.2, 2.6, GREEN, { tag: 'dollTable' });
  m.light(DX, 5.8, DZ, '#ffe6b8', 0.8, 12);
  m.spot(19.4, 0, DZ + 0.4, { stance: 'crouch', quality: 0.8, hint: 'Inside the doll house, ground floor' });
  m.spot(18.4, 4.0, DZ + 1.6, { stance: 'prone', quality: 0.88, hint: 'Upstairs in the doll house' });
  m.spot(12.6, 0, DZ + 3.4, { stance: 'crouch', quality: 0.7, hint: 'Under the doll house stairs' });

  // ------------------------------------------------------------- toy chest --
  // Books outside get you to the rim; there are books inside to climb back
  // out, which is the only reason dropping in is not a one-way trip.
  const CXX = -19, CZZ = 11, CW = 10.5, CD = 10;
  m.box(CXX, 0, CZZ, CW, 0.5, CD, PLANK2, { tag: 'chestFloor' });
  for (const s of [-1, 1]) {
    m.box(CXX + s * (CW / 2 - 0.3), 0, CZZ, 0.6, 2.7, CD, RED, { tag: 'chestWall', jitter: 0.05 });
    m.box(CXX, 0, CZZ + s * (CD / 2 - 0.3), CW - 1.2, 2.7, 0.6, RED, { tag: 'chestWall', jitter: 0.05 });
    m.box(CXX + s * (CW / 2 - 0.3), 2.7, CZZ, 0.8, 0.25, CD + 0.4, YELLOW, { tag: 'chestRim' });
  }
  m.box(CXX, 0, CZZ + CD / 2 + 0.9, CW, 6.2, 0.5, RED, { tag: 'chestLid' });
  m.box(CXX, 2.4, CZZ + CD / 2 + 0.7, CW - 1.5, 1.2, 0.16, YELLOW, { solid: false, tag: 'lidPanel' });
  bookStair(CXX + 1.5, CZZ - 4.7 - 6 * 0.66, 0, 6, 0.46, 0.66, 3.0);       // outside, up to the rim
  bookStair(CXX - 2.6, CZZ + 3.2, 180, 5, 0.45, 0.62, 2.6, 0.5);           // inside, back out
  for (let i = 0; i < 9; i++) {
    m.box(CXX + m.range(-3.2, 3.2), 0.5, CZZ + m.range(-3.4, 0.2), m.range(1.0, 1.8), m.range(0.6, 1.4),
      m.range(1.0, 1.8), m.pick(PRIMARY), { yaw: m.range(0, 90), jitter: 0.08, tag: 'toy' });
  }
  m.spot(CXX + 2.6, 0.5, CZZ + 3.0, { stance: 'prone', quality: 0.9, hint: 'Down inside the toy chest' });
  m.spot(CXX, 0, CZZ - 6.4, { stance: 'crouch', quality: 0.6, hint: 'Against the front of the chest' });
  m.spot(CXX - 4.2, 0, CZZ + 6.9, { stance: 'crouch', quality: 0.74, hint: 'Behind the open chest lid' });

  // ------------------------------------------------------------ train track --
  const LOOP = [[-11, -6], [11, -6], [11, 10], [-11, 10]];
  for (let i = 0; i < 4; i++) {
    const a = LOOP[i], b = LOOP[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.round(len / 1.3);
    const yaw = -Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      m.box(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t, 0.5, 0.16, 2.6, PLANK2,
        { yaw, solid: false, tag: 'sleeper', jitter: 0.06 });
    }
    for (const off of [-0.9, 0.9]) {
      const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
      m.box((a[0] + b[0]) / 2 + nx * off, 0.16, (a[1] + b[1]) / 2 + nz * off, len, 0.14, 0.22, '#8f959c',
        { yaw, solid: false, tag: 'rail', metal: 0.5 });
    }
  }
  const carriage = (x, z, yaw, c, loco) => {
    m.box(x, 0.3, z, 2.6, 1.5, 4.4, c, { yaw, tag: 'carriage', jitter: 0.05 });
    m.box(x, 0, z, 2.2, 0.3, 4.0, '#4a4f58', { yaw, tag: 'bogie' });
    const a = yaw * Math.PI / 180;
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        m.cyl(x + (s * 1.1 * Math.cos(a) - t * 1.5 * Math.sin(a)), 0,
          z + (s * 1.1 * Math.sin(a) + t * 1.5 * Math.cos(a)), 0.4, 0.28, '#3a3f48', { tag: 'wheel' });
      }
    }
    if (loco) {
      m.cyl(x, 1.8, z - 0.9, 1.0, 1.6, c, { tag: 'boiler', jitter: 0.05 });
      m.cyl(x, 3.4, z - 0.9, 0.4, 0.9, '#3a3f48', { tag: 'funnel' });
      m.box(x, 1.8, z + 1.3, 2.2, 1.8, 1.6, '#3a3f48', { yaw, tag: 'cab' });
    } else {
      for (const s of [-1, 1]) m.box(x + s * 1.2, 1.8, z, 0.25, 1.1, 4.2, c, { yaw, tag: 'wagonWall' });
      for (const t of [-1, 1]) m.box(x, 1.8, z + t * 2.05, 2.5, 1.1, 0.25, c, { yaw, tag: 'wagonWall' });
    }
  };
  carriage(-11, -1.5, 0, GREEN, true);
  carriage(-11, 4.5, 0, BLUE, false);
  carriage(-4.5, 10, 90, YELLOW, false);
  carriage(11, 4.0, 0, RED, false);
  m.spot(-11, 1.8, 4.5, { stance: 'prone', quality: 0.84, hint: 'Curled inside the open wagon' });
  m.spot(11, 1.8, 4.0, { stance: 'prone', quality: 0.8, hint: 'In the red wagon by the wall' });
  m.spot(-13.2, 0, -1.5, { stance: 'crouch', quality: 0.64, hint: 'Behind the locomotive' });

  // ----------------------------------------------------------- rug and road --
  m.rug(0, 2, 20, 15, TEAL);
  for (const [rx, rz, rw, rd] of [[-7, -3.5, 14, 2.6], [-7, 7.5, 14, 2.6], [-7.5, 2, 2.6, 11], [7.5, 2, 2.6, 11]]) {
    m.box(rx, 0.02, rz, rw, 0.03, rd, '#5c626c', { solid: false, tag: 'road' });
  }
  for (let i = 0; i < 14; i++) {
    m.box(-7 + (i / 14) * 14, 0.05, i % 2 ? -3.5 : 7.5, 0.9, 0.02, 0.16, WHITE, { solid: false, tag: 'roadline' });
  }
  for (const [cx, cz, cy] of [[-4, -3.5, 0], [3, 8.6, 90], [-7.5, 0, 90], [6.5, 4, 12]]) {
    m.box(cx, 0.05, cz, 1.3, 0.9, 2.4, m.pick(PRIMARY), { yaw: cy, tag: 'car', jitter: 0.06 });
    m.box(cx, 0.95, cz, 1.1, 0.55, 1.2, '#cfeaff', { yaw: cy, solid: false, tag: 'carGlass' });
  }

  // ------------------------------------------------------------ plush piles --
  const plushPile = (x, z, r0) => {
    for (let i = 0; i < 6; i++) {
      m.cyl(x, i * 0.42, z, r0 - i * 0.42, 0.42, PLUSH, { tag: 'plush', jitter: 0.07 });
    }
    for (let i = 0; i < 18; i++) {
      const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.rand()) * r0;
      m.sphere(x + Math.cos(a) * rr, m.range(0.5, 2.9) * (1 - rr / (r0 * 1.6)), z + Math.sin(a) * rr,
        m.range(0.5, 1.0), m.pick([PLUSH, PINK, YELLOW, WHITE, GREEN]),
        { solid: false, rough: 0.98, jitter: 0.1 });
    }
    m.spot(x, 2.52, z, { stance: 'prone', quality: 0.7, hint: 'Flat on top of the plush pile' });
    m.spot(x + r0 + 0.9, 0, z, { stance: 'crouch', quality: 0.68, hint: 'Buried in the edge of the plush pile' });
  };
  plushPile(-21, -6, 3.6);
  plushPile(-9, 17.4, 2.6);

  // -------------------------------------------------------- alphabet blocks --
  const blockStack = (x, z, sizes) => {
    let y = 0;
    for (const s of sizes) {
      const yaw = m.range(-10, 10);
      m.box(x, y, z, s, s, s, m.pick(PRIMARY), { yaw, jitter: 0.06, tag: 'block' });
      for (const [ox, oz] of [[0, -s / 2 - 0.05], [0, s / 2 + 0.05], [-s / 2 - 0.05, 0], [s / 2 + 0.05, 0]]) {
        const a = yaw * Math.PI / 180;
        m.box(x + ox * Math.cos(a) - oz * Math.sin(a), y + s * 0.22, z + ox * Math.sin(a) + oz * Math.cos(a),
          s * 0.55, s * 0.55, 0.08, WHITE, { yaw: yaw + (ox ? 90 : 0), solid: false, tag: 'letter' });
      }
      y += s;
    }
  };
  blockStack(-6, -8.5, [2.4, 1.8]);
  blockStack(4.5, -9.5, [2.4]);
  blockStack(7.5, -8.6, [2.2, 1.6, 1.1]);
  blockStack(-16, 0.5, [2.4, 1.8]);
  blockStack(-13.5, -3, [1.8]);
  blockStack(0, 14, [2.4, 1.6]);
  blockStack(-4, 17, [2.2]);
  blockStack(9, 16.5, [2.4, 1.8, 1.2]);
  blockStack(22, -4, [2.4, 1.7]);
  blockStack(23.5, -0.5, [1.8]);
  m.spot(-6, 0, -10.4, { stance: 'crouch', quality: 0.62, hint: 'Behind the alphabet blocks' });
  m.spot(8.4, 0, 18.5, { stance: 'crouch', quality: 0.66, hint: 'In the crook of the block stack' });
  m.spot(22.7, 0, -2.2, { stance: 'prone', quality: 0.64, hint: 'Wedged between two blocks' });

  // ------------------------------------------------------------------ bed --
  // Deliberately tall: the dark under it is the best prone cover on the map,
  // and the only way onto it is a long book staircase at the foot.
  const BX = 18, BZ = 9;
  m.box(BX, 3.3, BZ, 15, 0.5, 13, PLANK, { tag: 'bedBase' });
  for (const [lx, lz] of [[BX - 6.8, BZ - 5.8], [BX + 6.8, BZ - 5.8], [BX - 6.8, BZ + 5.8], [BX + 6.8, BZ + 5.8]]) {
    m.box(lx, 0, lz, 1.0, 3.3, 1.0, PLANK2, { tag: 'bedLeg' });
  }
  m.box(BX, 3.8, BZ + 1, 14.4, 1.3, 10, WHITE, { tag: 'mattress', rough: 0.98 });
  m.box(BX, 5.1, BZ + 2.5, 14.4, 0.6, 6.5, PINK, { tag: 'duvet', rough: 0.98, jitter: 0.05 });
  m.box(BX, 5.1, BZ - 2.5, 8.0, 1.4, 3.0, WHITE, { tag: 'pillow', rough: 0.98 });
  m.box(BX, 3.3, BZ - 6.9, 15, 5.0, 0.6, PLANK2, { tag: 'headboard' });
  bookStair(BX, BZ - 6.5 - 9 * 0.62, 0, 9, 0.43, 0.62, 3.4);
  m.spot(BX - 3, 0, BZ + 1, { stance: 'prone', quality: 0.9, hint: 'Deep under the bed' });
  m.spot(BX + 5, 0, BZ + 4, { stance: 'crouch', quality: 0.82, hint: 'Under the bed, by the far leg' });
  m.spot(BX - 5, 5.1, BZ - 2.5, { stance: 'prone', quality: 0.55, hint: 'Flat on the mattress, in the open' });
  m.spot(BX + 4, 5.7, BZ + 2.5, { stance: 'prone', quality: 0.72, hint: 'Folded into the duvet' });

  // -------------------------------------------------------------- crayons --
  const TIX = 2, TIZ = 14;
  for (const s of [-1, 1]) {
    m.box(TIX + s * 3.65, 0, TIZ, 0.3, 1.6, 4.0, GREEN, { tag: 'crayonTin' });
    m.box(TIX, 0, TIZ + s * 1.85, 7.0, 1.6, 0.3, GREEN, { tag: 'crayonTin' });
  }
  for (let i = 0; i < 6; i++) {
    m.cyl(TIX - 2.6 + (i % 3) * 1.3, 0, TIZ - 0.75 + Math.floor(i / 3) * 1.5, 0.3, m.range(3.4, 5.2),
      m.pick(PRIMARY), { tag: 'crayon', jitter: 0.05 });
  }
  for (const [cx, cz] of [[-9, 19], [-7.5, 16.5], [12, -6], [13.6, -7], [-24, -8], [6, 11]]) {
    m.cyl(cx, 0, cz, 0.32, m.range(3.6, 5.4), m.pick(PRIMARY), { tag: 'crayon', jitter: 0.05 });
    m.cyl(cx, 0, cz, 0.34, 0.5, WHITE, { solid: false });
  }
  for (const [cx, cz, cy] of [[-2, 20, 20], [15, -8.5, 70], [-13, 13.5, -35]]) {
    m.box(cx, 0, cz, 5.6, 0.62, 0.62, m.pick(PRIMARY), { yaw: cy, tag: 'crayonLying', jitter: 0.05 });
    m.wedge(cx + Math.cos(cy * Math.PI / 180) * 3.3, 0, cz + Math.sin(cy * Math.PI / 180) * 3.3,
      0.9, 0.62, 0.62, CREAM, { yaw: cy });
  }
  m.spot(TIX + 2.6, 0, TIZ + 1.0, { stance: 'crouch', quality: 0.74, hint: 'Standing up in the crayon tin' });

  // ------------------------------------------------------ marbles and balls --
  m.sphere(-23, 2.6, 1, 2.6, RED, { tag: 'ball', rough: 0.5 });
  m.sphere(9, 2.2, -13, 2.2, BLUE, { tag: 'ball', rough: 0.5 });
  m.spot(-23, 0, 4.4, { stance: 'crouch', quality: 0.66, hint: 'Pinched between the big ball and the toy chest' });
  for (let i = 0; i < 14; i++) {
    m.sphere(m.range(-24, 24), 0.45, m.range(-4, 19), 0.45, m.pick([PURPLE, TEAL, YELLOW, WHITE]),
      { solid: false, rough: 0.15, tag: 'marble' });
  }

  // -------------------------------------------------------------- lighting --
  m.sphere(0, 11.2, -2, 2.0, '#fff6e0', { solid: false, emis: 2.4, tag: 'globeLamp' });
  m.light(0, 10.6, -2, '#fff3d8', 1.7, 30);
  m.lamp(-14, 12.4, 12, '#fff0dc', 1.1, 20);
  m.lamp(14, 12.4, -6, '#fff0dc', 1.1, 20);
  m.box(-25.4, 4.5, 4, 0.3, 7.0, 9.0, '#dff0ff', { solid: false, tag: 'window', emis: 0.9 });
  m.light(-23.5, 7.0, 4, '#dceeff', 1.2, 24);
  m.light(-19, 3.0, 11, '#ffe0ea', 0.5, 12);
  m.light(6, 2.5, 4, '#e8f6ff', 0.55, 16);

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(-23, -14); m.spawnHider(-8, -14); m.spawnHider(5, -18);
  m.spawnHider(-24, 18); m.spawnHider(-8, 6); m.spawnHider(6, -2);
  m.spawnHider(0, 18); m.spawnHider(16, 19); m.spawnHider(24, 6);
  m.spawnHider(24, -10); m.spawnHider(-16, 19); m.spawnHider(13, -9);
  m.spawnSeeker(-2.5, 4.5); m.spawnSeeker(2.5, 4.5); m.spawnSeeker(-2.5, 1.5); m.spawnSeeker(2.5, 1.5);
  m.lobbySpawn(0, 5);

  m.palette([PLANK, PLANK2, WALL, CREAM, RED, BLUE, YELLOW, GREEN, PURPLE, PINK, WHITE, TEAL, PLUSH]);
  return m.finish();
}
