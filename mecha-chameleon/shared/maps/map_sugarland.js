// Sugar Land - the beginner map. Everything is confectionery at ten times
// scale, painted in six loud, well-separated hues: a new hider who paints
// roughly pink is already half hidden, and a new hunter can read the room at a
// glance. Sight lines are short but never mazy.

import { createMap } from './kit.js';

export const meta = {
  id: 'sugarland',
  name: 'Sugar Land',
  theme: 'confectionery',
  tagline: 'Pastel sugar at giant scale. Forgiving colours, gentle sight lines.',
  difficulty: 1,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [56, 48],
    ceiling: 9,
    sky: '#ffd9ea',
    ambient: '#8b7f88',
    sunDir: [-0.3, -0.86, -0.42],
    sunColor: '#fff4e2',
    sunIntensity: 0.95,
    fog: '#ffe3ef',
    fogDensity: 0.008,
    exposure: 1.05,
  });

  const PINK = '#ffa6c9';
  const HOTPINK = '#ff5f9e';
  const MINT = '#9defd6';
  const DEEPMINT = '#3fc7a3';
  const CREAM = '#fff3dc';
  const WAFER = '#e8c48a';
  const CHOC = '#6b4230';
  const LILAC = '#cfb2ff';
  const LEMON = '#ffe066';
  const CANDY = '#ff5a5a';
  const WHITE = '#fdfbf7';
  const SKYBLUE = '#a8dcff';
  const BEANS = [HOTPINK, LEMON, MINT, LILAC, CANDY, SKYBLUE];

  m.perimeter(11, WAFER);
  m.floor(0, 0, 56, 48, CREAM);
  m.ceil(0, 0, 56, 48, '#ffeaf3', 9);

  // Checkerboard of icing tiles. Non-solid, but the blend meter samples them,
  // so a hider lying on the floor has something honest to match.
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 6; iz++) {
      const x = -24.5 + ix * 7;
      const z = -20 + iz * 8;
      m.rug(x, z, 7, 8, (ix + iz) % 2 ? PINK : MINT);
    }
  }

  // ------------------------------------------------------------ wafer walls --
  // Free-standing slabs. They cut the hall into rooms without closing it, so
  // there is always a way round rather than a dead end.
  const waferWall = (x1, z1, x2, z2, h = 3.4) => {
    m.wall(x1, z1, x2, z2, h, WAFER, { thickness: 0.6, tag: 'wafer' });
    for (const y of [0.85, 1.75, 2.65]) {
      m.wall(x1, z1, x2, z2, 0.12, '#cf9f68', { thickness: 0.68, y, solid: false, tag: 'seam' });
    }
  };
  waferWall(2, -23.5, 2, -15);
  waferWall(2, -15, 11, -15);
  waferWall(-25.5, -3, -16, -3);
  waferWall(-6, -3, 2, -3);
  waferWall(10, 2, 10, 12);
  waferWall(-14, 8, -4, 8);
  waferWall(16, -6, 25.5, -6);

  // ------------------------------------------------------------- layer cake --
  // Three climbable tiers with a wafer flight onto each. The top is the most
  // exposed real estate on the map and the tier ledges are the safest.
  const CX = -13, CZ = -11;
  m.cyl(CX, 0, CZ, 6.0, 0.9, PINK, { tag: 'cake' });
  m.cyl(CX, 0.9, CZ, 4.2, 0.9, CREAM, { tag: 'cake' });
  m.cyl(CX, 1.8, CZ, 2.6, 0.9, HOTPINK, { tag: 'cake' });
  m.sphere(CX, 3.45, CZ, 0.8, CANDY, { rough: 0.2 });
  m.cyl(CX, 2.7, CZ, 0.1, 0.7, DEEPMINT, { solid: false });

  const drip = (r, y, n, c) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.sphere(CX + Math.cos(a) * r, y, CZ + Math.sin(a) * r, m.range(0.28, 0.44), c,
        { solid: false, rough: 0.3, jitter: 0.05 });
    }
  };
  drip(6.0, 0.86, 16, CREAM);
  drip(4.2, 1.76, 12, CREAM);
  drip(2.6, 2.66, 10, LILAC);

  m.stairs(CX, CZ - 7.5, 3, 3, 0.3, 0.5, WAFER);
  m.stairs(CX, CZ + 5.7, 3, 3, 0.3, 0.5, WAFER, { yaw: 180, y: 0.9 });
  m.stairs(CX - 4.0, CZ, 2.4, 3, 0.3, 0.5, WAFER, { yaw: 90, y: 1.8 });

  // Birthday candles double as the cake's light source.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const cx = CX + Math.cos(a) * 1.8, cz = CZ + Math.sin(a) * 1.8;
    m.cyl(cx, 2.7, cz, 0.11, 0.9, m.pick([CANDY, MINT, LILAC]), { solid: false });
    m.sphere(cx, 3.75, cz, 0.14, '#ffd27a', { solid: false, emis: 2.6 });
  }
  m.light(CX, 4.1, CZ, '#ffd8a4', 1.1, 14);

  m.spot(CX + 4.9, 0.9, CZ + 1.6, { stance: 'prone', quality: 0.82, hint: 'Flat on the sponge tier' });
  m.spot(CX - 3.2, 0.9, CZ - 4.2, { stance: 'prone', quality: 0.78, hint: 'On the far side of the bottom tier' });
  m.spot(CX - 1.6, 1.8, CZ + 3.2, { stance: 'prone', quality: 0.74, hint: 'Behind the icing on the second tier' });
  m.spot(CX + 1.7, 2.7, CZ - 0.6, { stance: 'crouch', quality: 0.55, hint: 'Beside the cherry, in plain sight' });
  m.spot(CX + 6.6, 0, CZ - 3.4, { stance: 'crouch', quality: 0.68, hint: 'In the frosting drips at the cake base' });

  // ----------------------------------------------------------- giant lollies --
  const lolly = (x, z, y = 0) => {
    const h = m.range(3.4, 5.0);
    m.cyl(x, y, z, 0.18, h, WHITE, { tag: 'stick' });
    const c = m.pick([HOTPINK, MINT, LEMON, LILAC, CANDY, SKYBLUE]);
    m.sphere(x, y + h + 1.0, z, 1.05, c, { rough: 0.25, jitter: 0.06 });
    m.cyl(x, y + h + 0.94, z, 1.1, 0.12, WHITE, { solid: false });
    m.cyl(x, y, z, 0.75, 0.34, m.pick([CREAM, PINK]), { tag: 'lollybase', jitter: 0.05 });
  };
  for (const [x, z] of [[-25, -15], [-20, -22], [-2, -21], [7, -6], [22, -2],
    [-26, 10], [-11, 20], [1, 17], [17, 21], [26, 15]]) lolly(x, z);

  // ------------------------------------------------------- gumball machines --
  const gumball = (x, z) => {
    m.cyl(x, 0, z, 0.9, 1.05, '#d8425f', { tag: 'gumbase', metal: 0.25, rough: 0.4 });
    m.cyl(x, 1.05, z, 1.02, 0.14, '#e8b34a', { metal: 0.7, rough: 0.3 });
    m.sphere(x, 2.35, z, 1.16, '#dff1ff', { opaque: false, rough: 0.12 });
    for (let i = 0; i < 9; i++) {
      const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.rand()) * 0.82;
      m.sphere(x + Math.cos(a) * rr, m.range(1.55, 2.6), z + Math.sin(a) * rr, 0.2,
        m.pick(BEANS), { solid: false, rough: 0.25 });
    }
    m.spot(x, 0, z + 1.6, { stance: 'crouch', quality: 0.62, hint: 'Round the back of the gumball machine' });
  };
  gumball(13, -2); gumball(19, 3); gumball(24, 9); gumball(16, 11);

  // ------------------------------------------------------- candy-cane posts --
  const cane = (x, z, h) => {
    m.cyl(x, 0, z, 0.42, h, WHITE, { tag: 'pillar' });
    for (let i = 0; i * 0.62 + 0.3 < h - 0.3; i++) {
      m.cyl(x, 0.3 + i * 0.62, z, 0.46, 0.3, CANDY, { solid: false });
    }
    m.spot(x + 0.85, 0, z, { stance: 'stand', quality: 0.5, hint: 'Standing dead still behind a candy cane' });
  };
  cane(6, -9, 6.4); cane(-6, 12, 5.8); cane(15, 3, 6.4); cane(-21, 5, 5.8); cane(3, 7, 6.4);

  // ------------------------------------------------------- jelly-bean dunes --
  const beanPile = (x, z, r) => {
    m.cyl(x, 0, z, r, 0.58, '#e2705f', { tag: 'beanpile', jitter: 0.05 });
    m.cyl(x, 0.58, z, r * 0.58, 0.42, '#e2705f', { tag: 'beanpile', jitter: 0.05 });
    for (let i = 0; i < 12; i++) {
      const a = m.range(0, Math.PI * 2);
      const rr = Math.sqrt(m.rand()) * r * 1.12;
      const y = rr < r * 0.55 ? m.range(0.95, 1.2) : m.range(0.52, 0.68);
      m.sphere(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, m.range(0.13, 0.2),
        m.pick(BEANS), { solid: false, rough: 0.28 });
    }
    m.spot(x, 0, z + r + 0.75, { stance: 'prone', quality: 0.74, hint: 'Flat against the jelly-bean dune' });
  };
  beanPile(-23, -9, 2.0);
  beanPile(-4, -15, 1.8);
  beanPile(7, 16, 2.2);
  beanPile(-17, -21, 1.9);

  // ----------------------------------------------------------- macaron steps --
  // Chunky stacks: low cover, and a step up onto anything taller nearby.
  const macaron = (x, z, n, c) => {
    for (let i = 0; i < n; i++) {
      const r = 0.88 - i * 0.07;
      m.cyl(x, i * 0.38, z, r, 0.38, c, { jitter: 0.08 });
      m.cyl(x, i * 0.38 + 0.15, z, r * 1.06, 0.1, CREAM, { solid: false });
    }
  };
  for (const [x, z, n, c] of [[-11, 0, 3, PINK], [-3, 6, 2, LEMON], [5, -6, 3, MINT],
    [13, 14, 2, LILAC], [-19, 14, 3, HOTPINK], [22, -9, 3, LEMON],
    [0, -12, 2, MINT], [24, 20, 3, PINK]]) macaron(x, z, n, c);
  m.spot(-11, 1.14, 0, { stance: 'prone', quality: 0.58, hint: 'Curled on top of the macaron stack' });
  m.spot(22, 0, -10.4, { stance: 'crouch', quality: 0.6, hint: 'Tucked beside the macarons' });

  // ---------------------------------------------------------- sugar terrace --
  // Raised wafer deck in the north-east. Shaded underside is prime real estate.
  const TX = 20, TZ = -18;
  m.box(TX, 2.0, TZ, 14, 0.4, 10, WAFER, { tag: 'terrace' });
  for (const [px, pz] of [[TX - 5.5, TZ - 3.5], [TX + 5.5, TZ - 3.5], [TX - 5.5, TZ + 3.5], [TX + 5.5, TZ + 3.5]]) {
    m.cyl(px, 0, pz, 0.5, 2.0, CHOC, { tag: 'terraceLeg' });
  }
  m.stairs(TX, TZ + 8, 3, 6, 0.4, 0.5, WAFER, { yaw: 180 });
  for (let i = 0; i < 14; i++) {
    const bx = TX - 6.6 + i * 1.02;
    if (Math.abs(bx - TX) < 1.9) continue; // stair mouth
    m.cyl(bx, 2.4, TZ + 4.8, 0.11, 0.95, CANDY, { solid: false });
  }
  m.box(TX, 3.3, TZ + 4.8, 14, 0.12, 0.16, WHITE, { tag: 'rail' });
  lolly(TX - 4, TZ - 3, 2.4);
  lolly(TX + 4.5, TZ + 1, 2.4);
  m.crateStack(TX - 4.5, TZ + 2.5, CREAM, 3, 1.0, { y: 2.4 });
  m.spot(TX + 5.4, 2.4, TZ - 3.6, { stance: 'prone', quality: 0.8, hint: 'Flat in the corner of the sugar terrace' });
  m.spot(TX, 0, TZ - 1, { stance: 'crouch', quality: 0.84, hint: 'In the shade under the terrace' });
  m.spot(TX - 5.5, 0, TZ + 2.4, { stance: 'prone', quality: 0.76, hint: 'Between the terrace legs' });

  // -------------------------------------------------------- chocolate river --
  // Purely decorative - you wade straight through it - but it is the darkest
  // surface on the map, and lying in it is the only way to be brown here.
  let rz = 16;
  for (let i = 0; i < 14; i++) {
    const x = -26 + i * 4;
    rz += m.range(-1.0, 1.0);
    rz = Math.max(13.5, Math.min(19.5, rz));
    m.box(x, 0, rz, 4.3, 0.06, m.range(4.6, 6.2), CHOC, { solid: false, tag: 'river', rough: 0.15, jitter: 0.07 });
    m.cyl(x + m.range(-1.3, 1.3), 0.05, rz + m.range(-1.6, 1.6), m.range(0.5, 1.0), 0.05, '#a2704f',
      { solid: false, rough: 0.2 });
    if (i % 3 === 0) {
      m.cyl(x, 0, rz - 3.4, 1.3, 0.42, WAFER, { tag: 'cookie', jitter: 0.06 });
    }
  }
  m.spot(-10, 0, 16.5, { stance: 'prone', quality: 0.7, hint: 'Lying in the chocolate' });
  m.spot(12, 0, 17.2, { stance: 'prone', quality: 0.66, hint: 'Downstream, flat in the chocolate' });

  // Marshmallow banks along the south side of the river.
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6 + m.range(-0.8, 0.8);
    m.box(x, 0, 21.5 + m.range(-0.6, 0.6), m.range(2.2, 3.4), 0.85, 1.5,
      m.pick([CREAM, PINK]), { yaw: m.range(-12, 12), tag: 'bank', jitter: 0.06 });
  }
  m.spot(-18, 0, 20, { stance: 'crouch', quality: 0.68, hint: 'Behind a marshmallow block' });
  m.spot(6, 0, 20.2, { stance: 'crouch', quality: 0.64, hint: 'Wedged between marshmallows' });

  // ------------------------------------------------------- shelves and tins --
  for (const [sx, sz, yaw] of [[-8, -23.2, 0], [-4, -23.2, 0], [10, 23.2, 180], [14, 23.2, 180]]) {
    m.shelf(sx, sz, 2.6, 2.6, 0.7, '#f0d3a8', { yaw, levels: 4 });
  }
  // Sweet jars: dozens of small colour targets right at eye height.
  for (let i = 0; i < 18; i++) {
    const north = m.chance(0.5);
    const sx = north ? m.range(-9, -3) : m.range(9, 15);
    const sz = north ? -23.2 : 23.2;
    m.cyl(sx, 0.12 + m.irange(0, 3) * 0.65, sz, m.range(0.14, 0.22), m.range(0.3, 0.5),
      m.pick(BEANS), { solid: false, rough: 0.25 });
  }
  for (const [lx, lz, yaw] of [[-27, -6, 90], [-27, -8.6, 90], [27, 13, -90], [27, 15.6, -90]]) {
    m.locker(lx, lz, 1.1, 2.2, 0.9, '#f4b8cf', { yaw });
  }

  m.crateStack(-24, 2, CREAM, 3, 1.0);
  m.crateStack(9, -18, PINK, 3, 1.05);
  m.crateStack(25, -3, CREAM, 2, 1.1);

  // Chocolate-bar benches: waist-high solid cover for the open west and south.
  const bench = (x, z, yaw) => {
    m.box(x, 0, z, 3.2, 0.62, 1.1, CHOC, { yaw, tag: 'bench', jitter: 0.05 });
    for (const off of [-1.0, 0, 1.0]) {
      const a = yaw * Math.PI / 180;
      m.box(x + Math.cos(a) * off, 0.62, z - Math.sin(a) * off, 0.9, 0.1, 1.0, '#4f3024',
        { yaw, solid: false, tag: 'segment' });
    }
    m.spot(x - Math.sin(yaw * Math.PI / 180) * 1.1, 0, z - Math.cos(yaw * Math.PI / 180) * 1.1,
      { stance: 'prone', quality: 0.66, hint: 'Flat behind a chocolate bar' });
  };
  bench(-25, 6, 0);
  bench(-17, 2, 90);
  bench(-9, 11, 0);
  bench(4, 12, 180);
  bench(20, 16, 90);

  // -------------------------------------------------------------- lighting --
  for (const [lx, lz] of [[-16, -16], [16, -16], [-16, 0], [16, 0], [0, -8], [0, 8], [-18, 16], [18, 16]]) {
    m.lamp(lx, 8.4, lz, '#fff0f6', 1.25, 20);
  }
  m.light(0, 3.0, 0, '#ffe6f2', 0.5, 14);
  m.light(TX, 1.6, TZ, '#ffd9c4', 0.4, 9);

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(-24, -20); m.spawnHider(-5, -20); m.spawnHider(-22, 2);
  m.spawnHider(-8, 3); m.spawnHider(8, -21); m.spawnHider(24, -8);
  m.spawnHider(12, 8); m.spawnHider(-24, 18); m.spawnHider(-2, 22);
  m.spawnHider(22, 20);
  m.spawnSeeker(2, -2); m.spawnSeeker(-2, -2); m.spawnSeeker(2, 2); m.spawnSeeker(-2, 2);
  m.lobbySpawn(0, 5);

  m.palette([PINK, HOTPINK, MINT, DEEPMINT, CREAM, WAFER, CHOC, LILAC, LEMON, CANDY, WHITE, SKYBLUE]);
  return m.finish();
}
