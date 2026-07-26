// Osaka - the outdoor map. A shuttered shopping street after midnight: two
// rows of shop fronts, one alley, and no sun. Every usable light is a neon
// sign, so the street is a patchwork of hot pink, cyan and amber pools with
// black between them. Painting for the pools is easy; painting for the black
// is what wins rounds.

import { createMap } from './kit.js';

export const meta = {
  id: 'osaka',
  name: 'Osaka',
  theme: 'night street',
  tagline: 'Wet asphalt and neon. Stand in the wrong colour and you glow.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [64, 40],
    ceiling: 9,
    indoor: false,
    sky: '#0a0c16',
    ambient: '#1b2030',
    sunDir: [-0.28, -0.9, 0.34],
    sunColor: '#8fa6d8',
    sunIntensity: 0.14,
    fog: '#0d1020',
    fogDensity: 0.022,
    exposure: 1.2,
  });

  const ASPHALT = '#23262e';
  const WET = '#171a21';
  const KERB = '#5a5f68';
  const FACADE_A = '#3a3340';
  const FACADE_B = '#2e3a44';
  const FACADE_C = '#3d3630';
  const SHUTTER = '#4a5260';
  const NEON_P = '#ff2e88';
  const NEON_C = '#2ee8ff';
  const NEON_A = '#ffb03a';
  const LANTERN = '#ff5a3c';
  const VEND = '#dfe8f2';
  const WOOD = '#6b4a30';
  const CANVAS = '#8f2f3a';
  const FACADES = [FACADE_A, FACADE_B, FACADE_C];
  const NEONS = [NEON_P, NEON_C, NEON_A];

  m.perimeter(13, '#191c24');
  // Wet asphalt: low roughness so the neon smears across it.
  m.box(0, -0.4, 0, 64, 0.4, 40, ASPHALT, { tag: 'floor', rough: 0.3, metal: 0.12 });

  // Kerbs and pavement, then the dashed centre line.
  for (const s of [-1, 1]) {
    m.box(0, 0, s * 5.5, 64, 0.15, 0.4, KERB, { tag: 'kerb' });
    m.box(0, 0, s * 6.3, 64, 0.14, 1.3, '#31353d', { tag: 'pavement', rough: 0.8 });
  }
  for (let i = 0; i < 16; i++) {
    m.box(-30 + i * 4, 0, 0, 2.2, 0.02, 0.16, '#b9bec6', { solid: false, tag: 'line' });
  }
  // Puddles. Non-solid, but they are the darkest thing on the map and the
  // blend meter samples them, so prone in a puddle is a real option.
  for (let i = 0; i < 16; i++) {
    m.cyl(m.range(-30, 30), 0, m.range(-5, 5), m.range(0.8, 2.3), 0.03, WET,
      { solid: false, tag: 'puddle', rough: 0.06, metal: 0.35 });
  }

  // ------------------------------------------------------------ shop fronts --
  // Each shop is a rear mass plus two front piers, leaving a recessed entry
  // with a roller shutter at the back of it. Shutters come down to varying
  // heights: a fully closed one is a black niche, a half-open one is a hole.
  const shop = (cx, w, dir) => {
    const front = dir > 0 ? -7 : 7;
    const back = dir > 0 ? -20 : 20;
    const rw = 3.0, rd = 1.8, hgt = m.range(6.6, 8.2);
    const facade = m.pick(FACADES);
    const pierW = (w - rw) / 2;
    m.box(cx, 0, (back + front - dir * rd) / 2, w, hgt, Math.abs(back - front) - rd, facade,
      { tag: 'shop', jitter: 0.05 });
    for (const s of [-1, 1]) {
      m.box(cx + s * (rw + pierW) / 2, 0, front - dir * rd / 2, pierW, hgt, rd, facade, { jitter: 0.05 });
    }
    m.box(cx, 3.4, front - dir * rd / 2, rw, hgt - 3.4, rd, facade, { jitter: 0.05 });

    // Roller shutter at the rear plane of the recess.
    const shutH = m.pick([3.3, 3.3, 3.3, 2.1, 1.2, 0.7]);
    const sz = front - dir * (rd - 0.14);
    m.box(cx, 0, sz, rw - 0.1, shutH, 0.14, SHUTTER, { jitter: 0.06, tag: 'shutter' });
    for (let i = 1; i < 6; i++) {
      m.box(cx, (shutH / 6) * i, sz + dir * 0.09, rw - 0.14, 0.05, 0.05, '#363d48', { solid: false });
    }
    m.box(cx, 0, front - dir * 0.25, rw, 0.16, 0.5, '#6c7079', { tag: 'threshold' });

    // Awning over the entry, then the signage stack above it.
    m.box(cx, 3.2, front + dir * 0.85, w - 0.6, 0.16, 1.9, CANVAS, { tag: 'awning', jitter: 0.08 });
    m.box(cx, 2.9, front + dir * 1.75, w - 0.6, 0.32, 0.1, '#d8d2c4', { solid: false, tag: 'valance' });
    const neon = m.pick(NEONS);
    m.box(cx, 3.9, front + dir * 0.3, w - 1.4, 0.9, 0.16, neon, { solid: false, emis: 2.8, tag: 'neon' });
    m.box(cx + (rw + pierW) / 2 * (m.chance(0.5) ? 1 : -1), 4.4, front + dir * 0.42,
      0.75, 2.6, 0.18, m.pick(NEONS), { solid: false, emis: 2.4, tag: 'neon' });
    // Air-con box bolted to the facade, high and useless to hide behind.
    m.box(cx - w * 0.3, 5.6, front + dir * 0.45, 1.0, 0.8, 0.7, '#7d838c', { tag: 'ac', metal: 0.4 });

    const closed = shutH > 3;
    m.spot(cx, 0, front - dir * 0.95, {
      stance: closed ? 'crouch' : 'stand',
      quality: closed ? 0.8 : 0.7,
      hint: closed ? 'In the dark shop doorway' : 'Under the half-open shutter',
    });
    return neon;
  };

  const northX = [-28, -20, -12, -4, 8, 16, 24];
  const southX = [-28, -20, -12, -4, 4, 12, 20, 28];
  let neonLights = 0;
  for (const cx of northX) {
    const neon = shop(cx, 7.6, 1);
    if (neonLights < 4) { m.light(cx, 3.6, -6.2, neon, 1.15, 15); neonLights++; }
  }
  for (const cx of southX) {
    const neon = shop(cx, 7.6, -1);
    if (neonLights < 7) { m.light(cx, 3.6, 6.2, neon, 1.15, 15); neonLights++; }
  }

  // ------------------------------------------------------------- side alley --
  // The gap the north row leaves between x = -0.2 and x = 4.2. Dead ends at
  // the back wall, which is exactly why it is the best place on the map.
  const AX = 2;
  for (let i = 0; i < 4; i++) {
    const z = -12.2 - i * 2.0;
    const west = m.chance(0.5);
    m.box(west ? 0.25 : 3.75, m.range(2.3, 3.6), z, 1.0, 0.8, 0.75, '#6f757e',
      { tag: 'ac', metal: 0.45, jitter: 0.06 });
    m.box(west ? 0.05 : 4.05, 0, z + 0.7, 0.22, 3.4, 0.22, '#41474f', { tag: 'downpipe' });
  }
  m.box(AX, 0, -19.4, 4.6, 4.5, 0.5, '#2b2f37', { tag: 'alleyEnd' });
  for (let i = 0; i < 4; i++) {
    m.box(m.range(0.4, 3.6), m.range(0.6, 2.6), -19.1, m.range(0.8, 1.6), m.range(0.5, 1.1), 0.06,
      m.pick(NEONS), { solid: false, tag: 'graffiti', emis: 0.25 });
  }
  // Wheelie bins: too low to stand in, so no auto-spot - the gap between them
  // is the real hiding place.
  m.locker(0.9, -17.6, 1.3, 1.35, 1.1, '#2f4a3a', { yaw: 0, spot: false });
  m.locker(3.4, -17.6, 1.3, 1.35, 1.1, '#3a3d2f', { yaw: 0, spot: false });
  m.barrel(0.8, -14.8, '#3d4148');
  m.barrel(1.7, -15.3, '#3d4148');
  m.crateStack(3.4, -12.6, '#6b5638', 3, 1.0);
  m.crateStack(0.9, -11.2, '#6b5638', 2, 0.9);
  // Low roof over the alley mouth - crates get you up, and nothing looks up.
  m.box(AX, 2.6, -9.5, 4.6, 0.3, 3.0, '#2f3540', { tag: 'alleyRoof' });
  m.box(AX, 2.9, -8.1, 4.6, 0.5, 0.12, '#4a5260', { solid: false });
  m.spot(AX, 2.9, -9.6, { stance: 'prone', quality: 0.88, hint: 'On the alley roof - nobody looks up' });
  m.spot(2.2, 0, -18.9, { stance: 'crouch', quality: 0.86, hint: 'Between the bins at the alley dead end' });
  m.spot(1.2, 0, -13.4, { stance: 'prone', quality: 0.78, hint: 'Flat behind the alley barrels' });
  m.light(AX, 3.4, -11.5, NEON_C, 0.55, 9);
  m.light(AX, 2.0, -18.6, NEON_P, 0.4, 7);
  m.box(AX, 3.2, -10.8, 1.6, 0.6, 0.12, NEON_C, { solid: false, emis: 2.6, tag: 'neon' });

  // ------------------------------------------------------------ ramen stall --
  const RX = -14, RZ = 3.0;
  m.box(RX, 0, RZ + 1.5, 5.2, 2.1, 1.5, WOOD, { tag: 'stallBody', jitter: 0.05 });
  m.box(RX, 0, RZ, 5.2, 1.05, 0.85, '#8a6540', { tag: 'counter' });
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      m.cyl(RX + s * 2.7, 0, RZ + (t > 0 ? 2.4 : -0.6), 0.09, 2.5, '#4a3628', { tag: 'stallPost' });
    }
  }
  m.box(RX, 2.5, RZ + 0.9, 6.2, 0.18, 4.0, CANVAS, { tag: 'stallRoof' });
  m.box(RX, 1.9, RZ - 0.75, 5.6, 0.6, 0.06, CANVAS, { solid: false, tag: 'noren', emis: 0.12 });
  for (let i = 0; i < 5; i++) {
    m.cyl(RX - 2.0 + i * 1.0, 0, RZ - 1.1, 0.22, 0.62, '#4a3628', { tag: 'stool' });
  }
  for (let i = 0; i < 3; i++) {
    m.cyl(RX - 1.8 + i * 1.8, 1.95, RZ + 0.2, 0.24, 0.46, LANTERN, { solid: false, emis: 2.2 });
  }
  m.light(RX, 2.0, RZ, LANTERN, 0.95, 12);
  m.sphere(RX + 1.4, 2.3, RZ + 1.2, 0.5, '#c8ccd4', { solid: false, tag: 'steam', emis: 0.15 });
  m.spot(RX, 0, RZ + 0.9, { stance: 'prone', quality: 0.82, hint: 'Under the ramen counter' });
  m.spot(RX - 3.2, 0, RZ + 1.4, { stance: 'crouch', quality: 0.7, hint: 'Beside the ramen stall' });

  // --------------------------------------------------------------- vending --
  const vending = (x, z, dir) => {
    m.box(x, 0, z, 1.05, 1.95, 0.78, '#c3c8d1', { tag: 'vending', metal: 0.3, rough: 0.35 });
    m.box(x, 0.55, z + dir * 0.42, 0.86, 1.25, 0.06, m.pick([NEON_C, VEND, NEON_A]),
      { solid: false, emis: 1.7, tag: 'vendGlass' });
    for (let i = 0; i < 6; i++) {
      m.box(x - 0.3 + (i % 3) * 0.3, 0.72 + Math.floor(i / 3) * 0.42, z + dir * 0.46, 0.16, 0.3, 0.04,
        m.pick([NEON_P, NEON_A, NEON_C, VEND]), { solid: false, emis: 0.6 });
    }
    m.box(x, 1.95, z, 1.05, 0.1, 0.8, '#8d939c', { solid: false });
  };
  for (const [vx, vz, vd] of [[-25.5, -6.4, 1], [-24.2, -6.4, 1], [-22.9, -6.4, 1],
    [11.5, 6.4, -1], [12.8, 6.4, -1], [19.4, -6.4, 1], [21.4, -6.4, 1], [-9.5, 6.4, -1]]) {
    vending(vx, vz, vd);
  }
  m.light(-24, 2.2, -5.6, NEON_C, 0.6, 9);
  m.light(12, 2.2, 5.6, NEON_A, 0.6, 9);
  m.spot(-24.2, 0, -5.6, { stance: 'crouch', quality: 0.6, hint: 'Lit up beside the vending bank' });
  m.spot(20.4, 0, -6.4, { stance: 'crouch', quality: 0.78, hint: 'Squeezed into the slot between two vending machines' });

  // -------------------------------------------------------------- bicycles --
  const bike = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    const ox = Math.cos(a) * 0.52, oz = Math.sin(a) * 0.52;
    for (const s of [-1, 1]) m.box(x + s * ox, 0, z + s * oz, 0.66, 0.66, 0.06, '#191c22', { yaw, tag: 'wheel' });
    m.box(x, 0.42, z, 1.0, 0.07, 0.05, m.pick(['#3f6f8f', '#8f3f4f', '#4f6f4f', '#6f6f4f']), { yaw, tag: 'frame' });
    m.cyl(x - ox * 0.35, 0.46, z - oz * 0.35, 0.035, 0.4, '#6a707a');
    m.box(x + ox * 0.62, 0.9, z + oz * 0.62, 0.09, 0.06, 0.54, '#6a707a', { yaw });
    m.box(x + ox * 0.45, 0.66, z + oz * 0.45, 0.36, 0.26, 0.3, '#3a4048', { yaw, tag: 'basket' });
  };
  for (let i = 0; i < 6; i++) bike(2.6 + i * 0.85, 6.5, 88 + m.range(-6, 6));
  for (let i = 0; i < 3; i++) bike(-19.5 + i * 0.9, -6.3, 92 + m.range(-6, 6));
  m.spot(4.6, 0, 6.9, { stance: 'prone', quality: 0.66, hint: 'Flat under the bike rack' });

  // -------------------------------------------- poles, cables and lanterns --
  const poles = [[-24, 6.0], [-8, 6.0], [8, 6.0], [24, 6.0]];
  for (const [px, pz] of poles) {
    m.cyl(px, 0, pz, 0.17, 7.6, '#4c515a', { tag: 'pole' });
    m.box(px, 6.6, pz, 1.8, 0.1, 0.1, '#4c515a', { solid: false });
    m.box(px, 5.4, pz, 0.5, 0.9, 0.45, '#5e646d', { solid: false, tag: 'transformer' });
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    for (const y of [6.55, 6.25]) {
      m.box((a[0] + b[0]) / 2, y, a[1], b[0] - a[0], 0.05, 0.05, '#14161c', { solid: false, tag: 'cable' });
    }
  }
  // Lanterns strung across the street from the poles.
  for (let i = 0; i < 7; i++) {
    const lx = -26 + i * 8.5;
    const lz = i % 2 ? -2.4 : 2.4;
    m.cyl(lx, 4.4, lz, 0.28, 0.55, LANTERN, { solid: false, emis: 2.4, tag: 'lantern' });
    m.box(lx, 4.95, lz, 0.05, 1.5, 0.05, '#14161c', { solid: false });
    if (i % 2 === 0 && i < 7) m.light(lx, 4.5, lz, LANTERN, 0.7, 11);
  }

  // ----------------------------------------------------- street furniture --
  for (let i = 0; i < 8; i++) {
    m.cyl(-27 + i * 7.6, 0, 5.1, 0.12, 0.85, '#8d939c', { tag: 'bollard', metal: 0.4 });
  }
  m.crateStack(-30.4, -6.2, '#6b5638', 3, 1.05);
  m.crateStack(28.5, 6.3, '#6b5638', 2, 1.0);
  m.locker(30.6, -3.4, 1.2, 2.05, 1.1, '#2f4a3a', { yaw: -90 });
  m.locker(30.6, -1.6, 1.2, 2.05, 1.1, '#3a3d2f', { yaw: -90 });
  m.spot(30.2, 0, -2.5, { stance: 'crouch', quality: 0.7, hint: 'Between the utility cabinets at the east end' });
  for (const [bx, bz] of [[-6.5, 5.0], [16, -5.0], [26, 5.0]]) {
    m.box(bx, 0, bz, 1.9, 0.45, 0.7, '#4a4f58', { tag: 'bench' });
    for (const s of [-1, 1]) m.box(bx + s * 0.75, 0, bz, 0.14, 0.44, 0.6, '#6a707a');
    m.spot(bx, 0, bz + (bz > 0 ? 0.9 : -0.9), { stance: 'prone', quality: 0.58, hint: 'Flat behind a street bench' });
  }
  for (const [px, pz] of [[-17.5, -5.2], [6.5, 5.2], [22.5, 5.2]]) {
    m.box(px, 0, pz, 1.1, 0.7, 1.1, '#5b4a3a', { tag: 'planter' });
    for (let i = 0; i < 4; i++) {
      m.sphere(px + m.range(-0.35, 0.35), m.range(0.85, 1.25), pz + m.range(-0.35, 0.35),
        m.range(0.24, 0.38), '#2f4a34', { solid: false, jitter: 0.1 });
    }
  }

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(2, -13); m.spawnHider(3.4, -17); m.spawnHider(-16, -6.2);
  m.spawnHider(-4, -6.2); m.spawnHider(-14, 6.2); m.spawnHider(0, 3.5);
  m.spawnHider(9, -3.5); m.spawnHider(17, 6.2); m.spawnHider(25, -6.2);
  m.spawnHider(29, 2.5); m.spawnHider(-29, 3.0); m.spawnHider(-9, -3.0);
  m.spawnSeeker(-30, -2.5); m.spawnSeeker(-30, 0.5); m.spawnSeeker(-28.5, -1.5); m.spawnSeeker(-28.5, 1.5);
  m.lobbySpawn(-26, 0);

  m.palette([ASPHALT, WET, KERB, FACADE_A, FACADE_B, FACADE_C, SHUTTER,
    NEON_P, NEON_C, NEON_A, LANTERN, VEND, WOOD, CANVAS]);
  return m.finish();
}
