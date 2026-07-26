// An ice hotel lobby. One tall open room with a U-shaped mezzanine, so hunters
// get long sight lines from above and hiders get a covered colonnade below.
//
// The penguin statues are the joke and the mechanic: a hider painted white and
// black can stand in a flock of them and be counted as furniture.

import { createMap } from './kit.js';

export const meta = {
  id: 'penguin',
  name: 'Penguin Hotel',
  theme: 'ice lobby',
  tagline: 'Blue marble, brass carts and a great many statues. Paint yourself formal.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [52, 40],
    ceiling: 8.0,
    sky: '#9fc0dd',
    ambient: '#54697e',
    sunDir: [-0.28, -0.84, 0.46],
    sunColor: '#dceaf6',
    sunIntensity: 0.6,
    fog: '#a9c4d8',
    fogDensity: 0.01,
  });

  const ICE = '#bcd8ea';
  const ICE_DK = '#8fb4cc';
  const BLUE = '#3f6f9a';
  const BLUE_DK = '#2a4d70';
  const NAVY = '#1e3550';
  const WHITE = '#eaf2f7';
  const SNOW = '#dce9f2';
  const MARBLE = '#c3d3de';
  const GOLD = '#c8a45a';
  const BLACK = '#232a33';
  const TEAL = '#4f9aa2';

  const DEG = Math.PI / 180;
  const CEILH = 8.0;
  const MEZZ = 4.0;      // mezzanine deck height
  const MEZZ_Z = -13;    // inner edge of the north gallery
  const MEZZ_X = 20;     // inner edge of the side galleries

  m.perimeter(12, BLUE_DK);
  m.floor(0, 0, 52, 40, MARBLE);
  m.ceil(0, 0, 52, 40, ICE, CEILH);
  m.box(0, 0, -19.7, 52, CEILH, 0.6, ICE_DK, { tag: 'wall', jitter: 0.04 });
  m.box(0, 0, 19.7, 52, CEILH, 0.6, ICE_DK, { tag: 'wall', jitter: 0.04 });
  m.box(-25.7, 0, 0, 0.6, CEILH, 40, ICE_DK, { tag: 'wall', jitter: 0.04 });
  m.box(25.7, 0, 0, 0.6, CEILH, 40, ICE_DK, { tag: 'wall', jitter: 0.04 });

  // Entrance: a glazed screen you can see through but not walk through, with
  // the doorway itself open in the middle.
  for (const s of [-1, 1]) {
    m.box(s * 9.5, 0, 18.6, 11, 4.6, 0.25, ICE, { opaque: false, rough: 0.15, tag: 'glass' });
    m.box(s * 4.1, 0, 18.6, 0.4, 4.6, 0.5, GOLD);
  }
  m.box(0, 4.6, 18.6, 30, 1.2, 0.5, BLUE, { jitter: 0.04 });
  m.box(0, 0, 16.4, 9, 0.02, 4.2, TEAL, { solid: false, tag: 'rug' });

  // ------------------------------------------------------------- mezzanine --
  m.box(0, MEZZ - 0.35, -16.5, 51.4, 0.35, 7, MARBLE, { tag: 'mezz', jitter: 0.03 });
  for (const s of [-1, 1]) {
    m.box(s * 23, MEZZ - 0.35, -2.5, 6, 0.35, 21, MARBLE, { tag: 'mezz', jitter: 0.03 });
  }
  // Colonnade holding it up. The bays between the columns are the best cover
  // on the ground floor.
  for (const px of [-22, -15, -8, 8, 15, 22]) {
    m.cyl(px, 0, MEZZ_Z + 0.3, 0.38, MEZZ - 0.35, WHITE, { tag: 'pillar', jitter: 0.03 });
    m.cyl(px, MEZZ - 0.55, MEZZ_Z + 0.3, 0.5, 0.2, GOLD, { solid: false });
  }
  for (const s of [-1, 1]) {
    for (const pz of [-8, -1, 6]) {
      m.cyl(s * (MEZZ_X - 0.3), 0, pz, 0.38, MEZZ - 0.35, WHITE, { tag: 'pillar', jitter: 0.03 });
      m.cyl(s * (MEZZ_X - 0.3), MEZZ - 0.55, pz, 0.5, 0.2, GOLD, { solid: false });
    }
  }
  const bal = (x1, z1, x2, z2) => m.fence(x1, z1, x2, z2, 1.0, WHITE, { y: MEZZ, spacing: 3.5 });
  bal(-25, MEZZ_Z, 2.0, MEZZ_Z);
  bal(5.2, MEZZ_Z, 25, MEZZ_Z);
  bal(-MEZZ_X, MEZZ_Z, -MEZZ_X, 8);
  bal(MEZZ_X, MEZZ_Z, MEZZ_X, 8);
  for (const s of [-1, 1]) bal(s * 25, 8, s * MEZZ_X, 8);
  m.spot(-23, MEZZ, -16, { stance: 'prone', quality: 0.8, hint: 'Flat in the gallery corner' });
  m.spot(23, MEZZ, -16, { stance: 'prone', quality: 0.8, hint: 'Flat in the far gallery corner' });
  m.spot(-23, MEZZ, 5, { stance: 'prone', quality: 0.74, hint: 'End of the west gallery' });
  m.spot(23, MEZZ, 5, { stance: 'prone', quality: 0.74, hint: 'End of the east gallery' });

  // Curved staircase. m.stairs only runs straight, so the treads are placed
  // around an arc and yawed to the tangent; the last tread's top face is
  // exactly the mezzanine deck.
  const SC = { x: 0, z: -9, r: 5.5, a0: 100, a1: -50, n: 16 };
  for (let i = 0; i < SC.n; i++) {
    const th = (SC.a0 + (SC.a1 - SC.a0) * (i / (SC.n - 1)));
    const a = th * DEG;
    m.box(SC.x + Math.cos(a) * SC.r, 0, SC.z + Math.sin(a) * SC.r,
      1.9, MEZZ * (i + 1) / SC.n, 0.95, MARBLE, { yaw: th, tag: 'stair' });
    if (i % 2 === 0) {
      m.box(SC.x + Math.cos(a) * (SC.r + 1.05), 0, SC.z + Math.sin(a) * (SC.r + 1.05),
        0.1, MEZZ * (i + 1) / SC.n + 0.95, 0.1, GOLD, { yaw: th, solid: false });
    }
    m.box(SC.x + Math.cos(a) * SC.r, 0, SC.z + Math.sin(a) * SC.r, 1.6, 0.02, 0.7, TEAL,
      { yaw: th, solid: false, tag: 'rug' });
  }
  m.spot(4.6, 0, -8.4, { stance: 'crouch', quality: 0.76, hint: 'Under the curl of the staircase' });

  // ------------------------------------------------------------- reception --
  m.box(0, 0, -15.4, 15, 1.15, 0.9, BLUE_DK, { tag: 'counter', jitter: 0.03 });
  m.box(0, 1.15, -15.4, 15.6, 0.1, 1.2, MARBLE);
  for (const s of [-1, 1]) m.box(s * 7.2, 0, -16.9, 0.9, 1.15, 2.1, BLUE_DK, { jitter: 0.03 });
  m.box(0, 0, -18.4, 15, 0.02, 4.4, NAVY, { solid: false, tag: 'rug' });
  // Pigeonholes: forty small squares of cold white, the best paint reference
  // on the map and a fine thing to be crouched in front of.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 10; c++) {
      m.box(-6.75 + c * 1.5, 0.95 + r * 0.6, -19.15, 1.36, 0.5, 0.36,
        m.chance(0.22) ? ICE_DK : WHITE, { solid: false, jitter: 0.06, tag: 'pigeonhole' });
    }
  }
  m.box(0, 3.4, -19.2, 14.4, 0.34, 0.5, GOLD, { solid: false });
  m.spot(0, 0, -16.9, { stance: 'crouch', quality: 0.86, hint: 'Behind the reception counter' });
  m.spot(-7.6, 0, -18.2, { stance: 'crouch', quality: 0.8, hint: 'In the corner of the back office' });
  m.spot(7.6, 0, -18.2, { stance: 'prone', quality: 0.78, hint: 'Under the key wall' });

  // -------------------------------------------------------- frozen fountain --
  const FX = 0, FZ = 3.5, FR = 3.2;
  for (let i = 0; i < 12; i++) {
    const th = i * 30;
    const a = th * DEG;
    m.box(FX + Math.cos(a) * FR, 0, FZ + Math.sin(a) * FR, 0.34, 0.62, 1.75, ICE_DK,
      { yaw: th, tag: 'basin', jitter: 0.05 });
  }
  m.cyl(FX, 0.02, FZ, FR - 0.28, 0.06, ICE, { solid: false, rough: 0.12, tag: 'ice' });
  m.cyl(FX, 0, FZ, 0.8, 1.1, ICE_DK, { jitter: 0.04 });
  m.cyl(FX, 1.1, FZ, 1.5, 0.16, ICE, { solid: false, rough: 0.15 });
  m.cyl(FX, 1.26, FZ, 0.4, 1.0, ICE, { rough: 0.15, jitter: 0.05 });
  m.cyl(FX, 2.26, FZ, 0.95, 0.14, ICE, { solid: false, rough: 0.15 });
  m.sphere(FX, 2.7, FZ, 0.34, WHITE, { solid: false });
  for (let i = 0; i < 9; i++) {
    const a = m.range(0, Math.PI * 2), rr = m.range(0.9, 2.4);
    m.box(FX + Math.cos(a) * rr, m.range(0.6, 1.9), FZ + Math.sin(a) * rr, 0.1, m.range(0.4, 1.1), 0.1,
      ICE, { solid: false, rough: 0.12, jitter: 0.06 });
  }
  m.spot(FX + 2.2, 0, FZ + 1.6, { stance: 'prone', quality: 0.82, hint: 'Lying in the frozen basin' });
  m.light(FX, 1.6, FZ, '#8fd8ff', 0.7, 12);

  // -------------------------------------------------------------- penguins --
  const penguin = (x, z, s, yaw) => {
    const a = yaw * DEG;
    m.cyl(x, 0, z, 0.66 * s, 0.14, MARBLE, { jitter: 0.04 });
    m.sphere(x, 0.14 + 0.66 * s, z, 0.66 * s, BLACK, { jitter: 0.04, tag: 'penguin' });
    m.sphere(x + Math.cos(a) * 0.24 * s, 0.14 + 0.62 * s, z + Math.sin(a) * 0.24 * s, 0.52 * s, WHITE,
      { solid: false, jitter: 0.03 });
    m.sphere(x, 0.14 + 1.42 * s, z, 0.38 * s, BLACK, { jitter: 0.04 });
    m.sphere(x + Math.cos(a) * 0.2 * s, 0.14 + 1.36 * s, z + Math.sin(a) * 0.2 * s, 0.28 * s, WHITE,
      { solid: false });
    m.box(x + Math.cos(a) * 0.46 * s, 0.14 + 1.3 * s, z + Math.sin(a) * 0.46 * s,
      0.34 * s, 0.15 * s, 0.16 * s, GOLD, { yaw, solid: false });
    for (const sd of [-1, 1]) {
      m.box(x - Math.sin(a) * sd * 0.62 * s, 0.14 + 0.4 * s, z + Math.cos(a) * sd * 0.62 * s,
        0.3 * s, 0.8 * s, 0.16 * s, BLACK, { yaw, solid: false, jitter: 0.04 });
    }
  };
  // A flock by the fountain, singles scattered, and two giants flanking the
  // stair so the silhouette scale reads immediately.
  const flock = [[-4.5, 8.5, 0.95, 40], [-3.0, 9.8, 0.8, 15], [-5.8, 10.2, 1.05, -25],
    [-2.2, 7.6, 0.62, 80], [-6.6, 8.2, 0.7, 130], [-4.2, 11.4, 0.88, -60],
    [6.5, 9.2, 1.0, -35], [8.2, 10.4, 0.75, 20], [5.4, 11.2, 0.9, 95],
    [7.4, 7.4, 0.6, 160], [-14, 1.5, 1.15, 65], [14, -3.5, 1.1, -70],
    [-11.5, -6.5, 0.85, 120], [11.8, 3.2, 0.7, -140]];
  for (const [px, pz, ps, pyaw] of flock) penguin(px, pz, ps, pyaw);
  penguin(-7.5, -10.5, 1.6, 30);
  penguin(9.5, -12.5, 1.55, -40);
  m.spot(-4.5, 0, 9.6, { stance: 'stand', quality: 0.83, hint: 'Stand in the flock and hold still' });
  m.spot(6.8, 0, 9.6, { stance: 'stand', quality: 0.81, hint: 'Third penguin from the left' });
  m.spot(-7.5, 0, -11.8, { stance: 'crouch', quality: 0.79, hint: 'At the foot of the giant penguin' });
  m.spot(-13.4, 0, 1.5, { stance: 'stand', quality: 0.66, hint: 'Behind a lone statue' });

  // --------------------------------------------------------------- luggage --
  const cart = (x, z, yaw, n) => {
    const a = yaw * DEG;
    m.box(x, 0.3, z, 1.7, 0.14, 1.0, GOLD, { yaw, tag: 'cart' });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const ox = sx * 0.7 * Math.cos(a) - sz * 0.4 * Math.sin(a);
        const oz = sx * 0.7 * Math.sin(a) + sz * 0.4 * Math.cos(a);
        m.box(x + ox, 0, z + oz, 0.16, 0.3, 0.16, BLACK);
        m.box(x + ox, 0.44, z + oz, 0.09, 1.35, 0.09, GOLD);
      }
    }
    m.box(x, 1.72, z, 1.8, 0.09, 0.09, GOLD, { yaw });
    m.box(x, 1.72, z, 0.09, 0.09, 1.1, GOLD, { yaw });
    for (let i = 0; i < n; i++) {
      m.box(x + m.range(-0.4, 0.4), 0.44 + i * 0.32, z + m.range(-0.2, 0.2), m.range(0.7, 1.1), 0.3,
        m.range(0.5, 0.75), m.pick([NAVY, BLUE_DK, BLACK, '#5a3a2e']),
        { yaw: yaw + m.range(-12, 12), jitter: 0.08, tag: 'case' });
    }
  };
  cart(-16.5, 12, 25, 3);
  cart(16.5, 13.5, -35, 3);
  cart(-19.5, -4, 90, 2);
  m.spot(-16.5, 0, 13.4, { stance: 'crouch', quality: 0.75, hint: 'Behind the luggage cart' });
  m.spot(16.5, 0, 14.9, { stance: 'crouch', quality: 0.73, hint: 'Behind the far cart' });
  m.spot(-19.5, 0, -5.4, { stance: 'crouch', quality: 0.72, hint: 'Under the colonnade cart' });

  const cases = (x, z) => {
    let y = 0;
    for (let i = 0; i < m.irange(3, 5); i++) {
      const w = m.range(0.8, 1.2), h = m.range(0.26, 0.4);
      m.box(x + m.range(-0.2, 0.2), y, z + m.range(-0.2, 0.2), w, h, m.range(0.55, 0.8),
        m.pick([NAVY, BLUE_DK, BLACK, '#5a3a2e', BLUE]), { yaw: m.range(-25, 25), jitter: 0.08, tag: 'case' });
      y += h;
    }
  };
  for (const [qx, qz] of [[-21.5, 10], [-22.5, 6.5], [21.5, 9], [22.5, 5.5], [-13, 15.5], [13.5, 16.5]]) cases(qx, qz);
  m.spot(-22, 0, 8.2, { stance: 'crouch', quality: 0.77, hint: 'Wedged between the suitcase piles' });
  m.spot(22, 0, 7.2, { stance: 'crouch', quality: 0.75, hint: 'Among the stacked cases' });

  // ------------------------------------------------------------------ firs --
  const fir = (x, z, s) => {
    m.cyl(x, 0, z, 0.42 * s, 0.5 * s, BLUE_DK, { jitter: 0.05, tag: 'pot' });
    m.cyl(x, 0.5 * s, z, 0.7 * s, 0.7 * s, '#2f5a44', { jitter: 0.07 });
    m.cyl(x, 1.15 * s, z, 0.52 * s, 0.65 * s, '#2f5a44', { solid: false, jitter: 0.07 });
    m.cyl(x, 1.75 * s, z, 0.34 * s, 0.6 * s, '#2f5a44', { solid: false, jitter: 0.07 });
    m.cyl(x, 2.3 * s, z, 0.16 * s, 0.4 * s, '#2f5a44', { solid: false, jitter: 0.07 });
  };
  const firs = [[-9.5, 15.5, 1.1], [9.5, 15.5, 1.1], [-18, 2.5, 1.0], [18, 2.5, 1.0],
    [-10.5, -8.5, 0.9], [12.5, -8.5, 0.9], [-24, -10.5, 1.15], [24, -10.5, 1.15],
    [-2.5, 16.5, 0.85], [2.5, 16.5, 0.85]];
  for (const [fx2, fz2, fs] of firs) fir(fx2, fz2, fs);
  m.spot(-9.5, 0, 14.3, { stance: 'crouch', quality: 0.7, hint: 'Behind a potted fir' });
  m.spot(-24, 0, -9.3, { stance: 'crouch', quality: 0.76, hint: 'Between the fir and the wall' });
  m.spot(24, 0, -9.3, { stance: 'crouch', quality: 0.76, hint: 'Behind the east fir' });

  // ------------------------------------------------------------- lounge set --
  m.sofa(-15, 7.5, 3.0, BLUE, { yaw: 90 });
  m.sofa(-15, 3.5, 3.0, BLUE, { yaw: -90 });
  m.sofa(15, 7.5, 3.0, BLUE, { yaw: 90 });
  m.sofa(15, 3.5, 3.0, BLUE, { yaw: -90 });
  m.table(-15, 5.5, 1.5, 1.0, 0.5, ICE_DK);
  m.table(15, 5.5, 1.5, 1.0, 0.5, ICE_DK);
  m.rug(-15, 5.5, 6.5, 5.5, NAVY);
  m.rug(15, 5.5, 6.5, 5.5, NAVY);
  m.rug(0, 3.5, 12, 12, '#3a5c7a');
  m.locker(-23.5, 15.5, 1.2, 2.2, 0.9, BLUE_DK, { yaw: 0 });
  m.locker(23.5, 15.5, 1.2, 2.2, 0.9, BLUE_DK, { yaw: 0 });

  // ------------------------------------------------------------- ice detail --
  for (let i = 0; i < 24; i++) {
    m.box(m.range(-24, 24), 0.008, m.range(-18, 18), m.range(1.2, 3.4), 0.016, m.range(1.2, 3.4),
      m.pick([SNOW, ICE, MARBLE]), { solid: false, rough: 0.2, jitter: 0.05, tag: 'rug' });
  }
  // Icicles off the gallery lip and the ceiling.
  for (let i = 0; i < 26; i++) {
    const onGallery = m.chance(0.6);
    const x = onGallery ? m.range(-25, 25) : m.range(-22, 22);
    const y = onGallery ? MEZZ - 0.35 : CEILH - 0.1;
    const z = onGallery ? MEZZ_Z - 0.1 : m.range(-16, 16);
    m.box(x, y - m.range(0.4, 1.1), z, 0.12, m.range(0.4, 1.1), 0.12, ICE,
      { solid: false, rough: 0.12, jitter: 0.06, tag: 'icicle' });
  }
  for (let i = 0; i < 14; i++) {
    const s = m.chance(0.5) ? -1 : 1;
    m.box(s * 25.3, m.range(1.0, 5.0), m.range(-18, 18), 0.1, m.range(0.8, 2.2), m.range(0.8, 2.4),
      m.pick([ICE, SNOW, TEAL]), { solid: false, jitter: 0.07, tag: 'frost' });
  }
  for (let i = 0; i < 6; i++) {
    m.poster(-14 + i * 5.6, 5.4, 19.3, 1.8, 2.4, m.pick([TEAL, BLUE, NAVY]));
  }

  // ------------------------------------------------------------ chandelier --
  m.cyl(0, CEILH - 0.4, 0, 0.1, 0.4, GOLD, { solid: false });
  m.cyl(0, CEILH - 1.5, 0, 2.1, 0.22, GOLD, { solid: false, emis: 0.5 });
  m.cyl(0, CEILH - 2.2, 0, 1.4, 0.18, GOLD, { solid: false, emis: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.box(Math.cos(a) * 1.9, CEILH - 2.4, Math.sin(a) * 1.9, 0.12, 0.9, 0.12, ICE,
      { solid: false, emis: 0.4, rough: 0.1 });
  }
  m.sphere(0, CEILH - 2.6, 0, 0.42, WHITE, { solid: false, emis: 0.8 });
  m.light(0, CEILH - 2.4, 0, '#ffeecf', 1.7, 26);

  // ---------------------------------------------------------------- lights --
  for (const [lx, lz] of [[-16, -10], [16, -10], [-16, 12], [16, 12], [0, -16.5]]) {
    m.lamp(lx, CEILH - 0.5, lz, '#e6f2ff', 0.85, 16);
  }
  for (const s of [-1, 1]) {
    m.lamp(s * 22, MEZZ + 3.2, -16, '#dbeaff', 0.6, 12);
    m.lamp(s * 22, MEZZ + 3.2, 2, '#dbeaff', 0.6, 12);
    m.light(s * 20, 2.4, -6, '#9fc8e6', 0.45, 10);
  }
  m.light(0, 3.0, 15, '#dceaf6', 0.8, 18);

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(-9, -16.5);
  m.spawnHider(9, -16.5);
  m.spawnHider(-22, -16, MEZZ);
  m.spawnHider(22, -16, MEZZ);
  m.spawnHider(-23, 2, MEZZ);
  m.spawnHider(23, 2, MEZZ);
  m.spawnHider(-17, -6);
  m.spawnHider(17, -6);
  m.spawnHider(-4, 13.5);
  m.spawnHider(4, 13.5);
  m.spawnHider(-21, 8);
  m.spawnHider(21, 8);
  m.spawnSeeker(0, 15.5);
  m.spawnSeeker(-2.4, 16.4);
  m.spawnSeeker(2.4, 16.4);
  m.spawnSeeker(0, 17.6);
  m.lobbySpawn(0, 13);

  m.palette([ICE, ICE_DK, BLUE, BLUE_DK, NAVY, WHITE, SNOW, MARBLE, GOLD, BLACK, TEAL, '#2f5a44']);
  return m.finish();
}
