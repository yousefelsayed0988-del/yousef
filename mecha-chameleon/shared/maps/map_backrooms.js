// The Backrooms. An irregular grid of chambers carved by a seeded spanning
// tree, so the layout loops instead of dead-ending, and a scatter of extra
// knock-throughs merges some cells into halls you can be caught crossing.
//
// The whole level is one yellow, on purpose. Paint-matching here is free, so
// the difficulty is entirely silhouette: the spots are corners, alcoves,
// doorway blind-sides and column shadows, and nothing else will save you.

import { createMap } from './kit.js';

export const meta = {
  id: 'backrooms',
  name: 'Backrooms',
  theme: 'liminal office',
  tagline: 'Damp carpet, buzzing lights, one colour forever. Only your outline gives you away.',
  difficulty: 4,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [58, 44],
    ceiling: 3.0,
    sky: '#2a2410',
    ambient: '#6a5c30',
    sunDir: [-0.3, -0.9, -0.32],
    sunColor: '#ffe9a8',
    sunIntensity: 0.12,
    fog: '#8a7a3c',
    fogDensity: 0.02,
  });

  const WALL_A = '#c8b26a';
  const WALL_B = '#bda45c';
  const WALL_C = '#d2bd78';
  const CARPET = '#a89448';
  const CARPET_B = '#96833c';
  const CEILING = '#cfc084';
  const TRIM = '#8c7a3c';
  const DAMP = '#7e6c34';
  const STAIN = '#6d5c2c';
  const TUBE = '#fff6cf';
  const PIPE = '#b09a52';

  const H = 3.0;          // ceiling, low enough to feel like a basement
  const WT = 0.3;         // wall thickness
  const DOOR_H = 2.25;
  const DOOR_W = 2.3;

  // Deliberately uneven so no two chambers read the same from a doorway.
  const XS = [-29, -19.4, -10.2, -0.6, 9.4, 19.2, 29];
  const ZS = [-22, -13.2, -4.8, 4.2, 13.4, 22];
  const COLS = XS.length - 1, ROWS = ZS.length - 1;
  const cx = (c) => (XS[c] + XS[c + 1]) / 2;
  const cz = (r) => (ZS[r] + ZS[r + 1]) / 2;

  m.perimeter(6, WALL_B);
  m.floor(0, 0, 58, 44, CARPET);
  m.ceil(0, 0, 58, 44, CEILING, H);

  // ------------------------------------------------------------ maze carve --
  // Randomised DFS gives a spanning tree (everything reachable); the second
  // pass adds loops and knock-throughs so it is not a pure corridor maze.
  const idx = (c, r) => r * COLS + c;
  const stateV = []; // wall on line XS[c] (c 1..COLS-1) beside row r
  const stateH = [];
  for (let c = 0; c < COLS; c++) { stateV.push(new Array(ROWS).fill(0)); }
  for (let c = 0; c < COLS; c++) { stateH.push(new Array(ROWS).fill(0)); }

  const carvedV = new Set(), carvedH = new Set();
  const seen = new Array(COLS * ROWS).fill(false);
  const stack = [[0, 0]];
  seen[0] = true;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const options = [];
    if (c > 0 && !seen[idx(c - 1, r)]) options.push(['v', c, r, c - 1, r]);
    if (c < COLS - 1 && !seen[idx(c + 1, r)]) options.push(['v', c + 1, r, c + 1, r]);
    if (r > 0 && !seen[idx(c, r - 1)]) options.push(['h', c, r, c, r - 1]);
    if (r < ROWS - 1 && !seen[idx(c, r + 1)]) options.push(['h', c, r + 1, c, r + 1]);
    if (!options.length) { stack.pop(); continue; }
    const o = options[Math.floor(m.rand() * options.length) % options.length];
    if (o[0] === 'v') carvedV.add(`${o[1]},${o[2]}`); else carvedH.add(`${o[1]},${o[2]}`);
    seen[idx(o[3], o[4])] = true;
    stack.push([o[3], o[4]]);
  }

  // 0 = solid, 1 = doorless opening, 2 = knocked through entirely.
  for (let c = 1; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (carvedV.has(`${c},${r}`)) stateV[c][r] = m.chance(0.2) ? 2 : 1;
      else { const q = m.rand(); stateV[c][r] = q < 0.26 ? 1 : q < 0.38 ? 2 : 0; }
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 1; r < ROWS; r++) {
      if (carvedH.has(`${c},${r}`)) stateH[c][r] = m.chance(0.2) ? 2 : 1;
      else { const q = m.rand(); stateH[c][r] = q < 0.26 ? 1 : q < 0.38 ? 2 : 0; }
    }
  }

  const doorways = [];
  const wallColour = () => m.pick([WALL_A, WALL_B, WALL_C]);
  const put = (axis, q, mid, len, yb, h) => {
    if (len <= 0.02) return;
    if (axis === 'v') m.box(q, yb, mid, WT, h, len, wallColour(), { tag: 'wall', jitter: 0.05 });
    else m.box(mid, yb, q, len, h, WT, wallColour(), { tag: 'wall', jitter: 0.05 });
  };
  const drawWall = (axis, q, a, b, state) => {
    if (state === 2) return;
    const len = b - a;
    if (state === 0 || len < DOOR_W + 1.6) { put(axis, q, (a + b) / 2, len, 0, H); return; }
    const gw = DOOR_W;
    const g0 = a + 0.7 + m.rand() * (len - gw - 1.4);
    const g1 = g0 + gw;
    put(axis, q, (a + g0) / 2, g0 - a, 0, H);
    put(axis, q, (g1 + b) / 2, b - g1, 0, H);
    put(axis, q, (g0 + g1) / 2, gw, DOOR_H, H - DOOR_H);
    doorways.push({ axis, q, at: (g0 + g1) / 2, a, b });
  };

  for (let c = 1; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) drawWall('v', XS[c], ZS[r], ZS[r + 1], stateV[c][r]);
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 1; r < ROWS; r++) drawWall('h', ZS[r], XS[c], XS[c + 1], stateH[c][r]);
  }

  // ------------------------------------------------------------- fixtures --
  // Fluorescents everywhere, but only a third of them are real lights - the
  // rest are emissive housings, which is what keeps the light count sane.
  let lit = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (m.chance(0.28)) continue;
      const x = cx(c) + m.range(-1.2, 1.2), z = cz(r) + m.range(-1.2, 1.2);
      const yaw = m.chance(0.5) ? 0 : 90;
      m.box(x, H - 0.16, z, 1.7, 0.1, 0.38, TRIM, { yaw, solid: false });
      m.box(x, H - 0.2, z, 1.55, 0.06, 0.26, TUBE, { yaw, solid: false, emis: 2.6, tag: 'tube' });
      if (lit < 14 && m.chance(0.55)) {
        m.light(x, H - 0.35, z, '#fff2c2', 0.85, 11);
        lit++;
      }
    }
  }
  // Guarantee the far corners are not pitch black.
  for (const [lx, lz] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) {
    if (lit >= 16) break;
    m.light(lx, H - 0.35, lz, '#fff2c2', 0.8, 12);
    lit++;
  }

  // Support columns: the only thing in an empty chamber worth standing behind.
  // Offset from the chamber centre so they never land on a spawn.
  const columns = [[0, 1, 2.8, -1.9], [1, 3, -2.6, 1.9], [2, 0, 2.5, 2.2], [3, 3, 2.8, -2.1],
    [4, 1, -2.7, -2.0], [5, 4, -2.5, 2.2], [2, 4, 2.6, -2.3], [4, 0, -2.8, 2.0]]
    .map(([c, r, ox, oz]) => [cx(c) + ox, cz(r) + oz]);
  for (const [px, pz] of columns) {
    m.box(px, 0, pz, 0.62, H, 0.62, WALL_C, { tag: 'column', jitter: 0.04 });
    m.box(px, H - 0.28, pz, 0.85, 0.28, 0.85, TRIM, { solid: false });
    m.box(px, 0, pz, 0.78, 0.12, 0.78, TRIM, { solid: false });
    m.spot(px, 0, pz + 0.72, { stance: 'stand', quality: 0.62, hint: 'In the column shadow' });
  }

  // Alcoves: two stub walls make a nook barely wider than a chameleon. Built
  // against the outer shell, which is the only wall guaranteed not to have
  // been knocked through by the carve.
  const alcoves = [[-29, -6.0, 'v', 1], [29, 6.0, 'v', -1], [-8.0, -22, 'h', 1],
    [10.0, 22, 'h', -1], [29, -14.0, 'v', -1]];
  for (const [ax, az, axis, dir] of alcoves) {
    if (axis === 'v') {
      for (const s of [-1, 1]) m.box(ax + dir * 0.7, 0, az + s * 0.85, 1.4, H, 0.24, WALL_B, { tag: 'wall', jitter: 0.05 });
      m.box(ax + dir * 1.35, DOOR_H, az, 0.24, H - DOOR_H, 1.9, WALL_B, { tag: 'wall' });
      m.spot(ax + dir * 0.7, 0, az, { stance: 'stand', quality: 0.86, hint: 'Standing in the alcove' });
    } else {
      for (const s of [-1, 1]) m.box(ax + s * 0.85, 0, az + dir * 0.7, 0.24, H, 1.4, WALL_B, { tag: 'wall', jitter: 0.05 });
      m.box(ax, DOOR_H, az + dir * 1.35, 1.9, H - DOOR_H, 0.24, WALL_B, { tag: 'wall' });
      m.spot(ax, 0, az + dir * 0.7, { stance: 'stand', quality: 0.86, hint: 'Standing in the alcove' });
    }
  }

  // The lone stacks of chairs. Three of them in the whole level.
  const chairStack = (x, z, n, yaw) => {
    m.chair(x, z, TRIM, { yaw });
    const a = yaw * Math.PI / 180;
    for (let i = 1; i < n; i++) {
      m.box(x, 0.44 + i * 0.16, z, 0.46, 0.07, 0.46, TRIM, { yaw: yaw + i * 5 });
      m.box(x - Math.sin(a) * 0.2, 0.5 + i * 0.16, z - Math.cos(a) * 0.2, 0.46, 0.52, 0.08, TRIM, { yaw: yaw + i * 5 });
    }
    m.spot(x + Math.sin(a) * 0.9, 0, z + Math.cos(a) * 0.9,
      { stance: 'prone', quality: 0.7, hint: 'Flat beside the chair stack' });
  };
  chairStack(-16.6, -17.4, 5, 20);
  chairStack(19.4, 8.4, 4, -35);
  chairStack(1.9, -1.4, 6, 70);

  // Exposed pipe runs and a couple of dead vents - the only relief on a wall.
  for (const [x1, z1, x2, z2, py] of [
    [-28, -18.5, -11, -18.5, 2.62], [1, 20.4, 27, 20.4, 2.62],
    [-28, 6.2, -12, 6.2, 2.7], [10, -6.4, 28, -6.4, 2.7],
    [-2, -12.8, -2, 3.4, 2.55], [16.5, 2.2, 16.5, 19, 2.55]]) {
    m.pipe(x1, py, z1, x2, z2, 0.12, PIPE, { solid: false, jitter: 0.05 });
  }
  for (let i = 0; i < 8; i++) {
    const c = m.irange(0, COLS - 1), r = m.irange(0, ROWS - 1);
    m.box(cx(c) + m.range(-2.5, 2.5), m.range(2.1, 2.6), cz(r) + m.range(-2.5, 2.5),
      0.5, 0.34, 0.06, TRIM, { solid: false, yaw: m.chance(0.5) ? 0 : 90, tag: 'vent' });
  }

  // Damp: patches on the wallpaper and soaked-through carpet. These are the
  // only tonal variation in the level, so they matter to the paint wheel.
  for (let i = 0; i < 26; i++) {
    const c = m.irange(1, COLS - 1), r = m.irange(0, ROWS - 1);
    if (stateV[c][r] === 2) continue;
    const s = m.chance(0.5) ? -1 : 1;
    m.box(XS[c] + s * 0.19, m.range(0.0, 1.5), m.range(ZS[r] + 1, ZS[r + 1] - 1),
      0.06, m.range(0.7, 1.9), m.range(0.6, 2.2), m.pick([DAMP, STAIN, CARPET_B]),
      { solid: false, jitter: 0.09, tag: 'damp' });
  }
  for (let i = 0; i < 22; i++) {
    m.box(m.range(-27, 27), 0.006, m.range(-20, 20), m.range(1.4, 4.2), 0.012, m.range(1.4, 4.2),
      m.pick([CARPET_B, DAMP, STAIN]), { solid: false, jitter: 0.08, tag: 'rug' });
  }
  // Ceiling tiles gone brown around the leaks.
  for (let i = 0; i < 10; i++) {
    m.box(m.range(-26, 26), H - 0.04, m.range(-20, 20), m.range(1.2, 2.4), 0.04, m.range(1.2, 2.4),
      m.pick([DAMP, STAIN]), { solid: false, jitter: 0.08 });
  }

  // --------------------------------------------------------------- corners --
  // Only intersections where both walls actually survived get a corner spot,
  // so the hint never promises cover that was knocked through.
  let corners = 0;
  for (let c = 1; c < COLS && corners < 10; c++) {
    for (let r = 1; r < ROWS && corners < 10; r++) {
      if (stateV[c][r] === 2 || stateH[c][r] === 2) continue;
      m.spot(XS[c] + 0.8, 0, ZS[r] + 0.8, { stance: 'crouch', quality: 0.68, hint: 'Jammed into the corner' });
      corners++;
    }
  }
  // Blind sides: stand flat against the wall a doorway is cut into and you are
  // invisible until a hunter is already through it.
  for (let i = 0; i < doorways.length && i < 30; i += 3) {
    const d = doorways[i];
    const side = m.chance(0.5) ? -1 : 1;
    // Hug whichever wall stub is longer, so the spot is never past its end.
    const off = (d.at - d.a) > (d.b - d.at) ? -1.7 : 1.7;
    if (d.axis === 'v') m.spot(d.q + side * 0.65, 0, d.at + off, { stance: 'stand', quality: 0.74, hint: 'Blind side of the doorway' });
    else m.spot(d.at + off, 0, d.q + side * 0.65, { stance: 'stand', quality: 0.74, hint: 'Blind side of the doorway' });
  }

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(cx(0), cz(0));
  m.spawnHider(cx(2), cz(0));
  m.spawnHider(cx(4), cz(0));
  m.spawnHider(cx(1), cz(2));
  m.spawnHider(cx(3), cz(2));
  m.spawnHider(cx(5), cz(2));
  m.spawnHider(cx(0), cz(3));
  m.spawnHider(cx(2), cz(4));
  m.spawnHider(cx(4), cz(4));
  m.spawnHider(cx(5), cz(4));
  m.spawnSeeker(cx(0), cz(1));
  m.spawnSeeker(cx(0) + 1.6, cz(1));
  m.spawnSeeker(cx(0) - 1.6, cz(1));
  m.spawnSeeker(cx(0), cz(1) + 1.6);
  m.lobbySpawn(cx(0), cz(1));

  m.palette([WALL_A, WALL_B, WALL_C, CARPET, CARPET_B, CEILING, TRIM, DAMP, STAIN, PIPE, TUBE]);
  return m.finish();
}
