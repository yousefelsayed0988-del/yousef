// Greenhouse - a Victorian glasshouse. Every wall and every roof pane is
// `opaque: false`: hunters can see the whole building from anywhere in it, but
// they still have to walk the aisles. That trade is the map. Cover here is not
// geometry, it is chlorophyll - eleven shades of green and a hider who picked
// the right one is genuinely invisible at four metres.

import { createMap } from './kit.js';

export const meta = {
  id: 'greenhouse',
  name: 'Greenhouse',
  theme: 'victorian glasshouse',
  tagline: 'Green on green on green. Pick your leaf and do not twitch.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [48, 36],
    ceiling: 7,
    sky: '#8fb0a2',
    ambient: '#5c6e56',
    sunDir: [-0.36, -0.82, -0.44],
    sunColor: '#fff0cc',
    sunIntensity: 0.85,
    fog: '#7d9a8a',
    fogDensity: 0.014,
  });

  const GLASS = '#bcd8d2';
  const IRON = '#2f4038';
  const IRON_LT = '#425a4c';
  const LEAF = '#3f7a3a';
  const LEAF_DK = '#27522b';
  const LEAF_LT = '#6aa845';
  const FERN = '#54925a';
  const OLIVE = '#5f7a34';
  const MOSS = '#4a6b3c';
  const TERRA = '#a85f3c';
  const TERRA_DK = '#7a4228';
  const SOIL = '#3b2c22';
  const STONE = '#9a9a8e';
  const WATER = '#3a6b6a';
  const WOOD = '#6b5236';

  const GREENS = [LEAF, LEAF_DK, LEAF_LT, FERN, OLIVE, MOSS];
  const EAVE = 4.4, RIDGE = 7.0;
  const WX = 23, WZ = 17;   // glass wall lines

  // ------------------------------------------------------------------ shell --
  m.perimeter(11, IRON);
  m.floor(0, 0, 48, 36, STONE);

  /** A run of glazing: one see-through slab plus the bars that hold it. */
  const glazing = (x, z, w, h, d, y = 0) =>
    m.box(x, y, z, w, h, d, GLASS, { opaque: false, rough: 0.06, metal: 0.1, tag: 'glass' });

  glazing(0, -WZ, WX * 2, EAVE, 0.16);
  glazing(0, WZ, WX * 2, EAVE, 0.16);
  glazing(-WX, 0, 0.16, EAVE, WZ * 2);
  glazing(WX, 0, 0.16, EAVE, WZ * 2);
  for (let i = 0; i <= 7; i++) {
    const x = -WX + (i / 7) * WX * 2;
    for (const s of [-1, 1]) m.box(x, 0, s * WZ, 0.14, EAVE, 0.26, IRON, { tag: 'mullion' });
  }
  for (let i = 0; i <= 5; i++) {
    const z = -WZ + (i / 5) * WZ * 2;
    for (const s of [-1, 1]) m.box(s * WX, 0, z, 0.26, EAVE, 0.14, IRON, { tag: 'mullion' });
  }
  for (const s of [-1, 1]) {
    m.box(0, 2.1, s * WZ, WX * 2, 0.14, 0.3, IRON_LT, { solid: false });
    m.box(s * WX, 2.1, 0, 0.3, 0.14, WZ * 2, IRON_LT, { solid: false });
    m.box(0, EAVE - 0.2, s * WZ, WX * 2 + 0.6, 0.3, 0.5, IRON, { tag: 'eave' });
    m.box(s * WX, EAVE - 0.2, 0, 0.5, 0.3, WZ * 2 + 0.6, IRON, { tag: 'eave' });
  }

  // Stepped gable: four glazed bands per side climbing to a ridge lantern.
  // Props only yaw, so the pitch is faked with slabs that each sit at the
  // height of their own upper edge.
  for (let j = 0; j < 4; j++) {
    const y = EAVE + j * 0.65;
    const z0 = WZ - j * 4.25, z1 = WZ - (j + 1) * 4.25;
    for (const s of [-1, 1]) {
      glazing(0, s * (z0 + z1) / 2, WX * 2, 0.14, z0 - z1, y);
      m.box(0, y, s * z1, WX * 2, 0.7, 0.22, IRON, { solid: false, tag: 'purlin' });
    }
  }
  m.box(0, RIDGE - 0.65, 0, WX * 2, 0.16, 3.0, GLASS, { opaque: false, rough: 0.06, tag: 'lantern' });
  m.box(0, RIDGE - 0.5, 0, WX * 2, 0.34, 0.4, IRON, { solid: false, tag: 'ridge' });
  for (let i = 0; i < 9; i++) {
    const x = -20 + i * 5;
    m.box(x, EAVE, 0, 0.18, 2.5, WZ * 2, IRON, { solid: false, tag: 'rafter' });
  }

  // Cast-iron columns carrying the roof.
  for (const [cx, cz] of [[-19, -14], [-7, -14], [7, -14], [19, -14],
    [-19, 14], [-7, 14], [7, 14], [19, 14], [-19, -5], [19, -5], [-19, 5], [19, 5]]) {
    m.cyl(cx, 0, cz, 0.2, EAVE, IRON, { tag: 'column' });
    m.cyl(cx, EAVE - 0.4, cz, 0.32, 0.4, IRON_LT, { solid: false });
    for (const s of [-1, 1]) {
      m.box(cx + s * 0.55, EAVE - 1.1, cz, 1.1, 0.7, 0.14, IRON_LT, { solid: false, tag: 'bracket' });
    }
  }

  // ------------------------------------------------------------- stone paths --
  const path = (x, z, w, d) => m.box(x, 0.01, z, w, 0.03, d, '#b0aa9a', { solid: false, tag: 'path' });
  path(0, 0, 46, 3.6);
  path(0, 0, 3.6, 34);
  path(0, -10, 46, 2.6);
  path(0, 10, 46, 2.6);
  for (let i = 0; i < 22; i++) {
    m.box(m.range(-22, 22), 0.02, m.range(-16, 16), m.range(0.5, 1.4), 0.03, m.range(0.5, 1.4),
      m.pick([STONE, '#8a8578', MOSS]), { solid: false, yaw: m.range(0, 90), jitter: 0.12, tag: 'flag' });
  }

  // ----------------------------------------------------------- central pond --
  const POND_R = 4.1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.box(Math.cos(a) * (POND_R + 0.25), 0, Math.sin(a) * (POND_R + 0.25), 2.35, 0.45, 0.5, STONE,
      { yaw: -(a * 180 / Math.PI), tag: 'kerb', jitter: 0.07 });
  }
  m.cyl(0, 0.04, 0, POND_R, 0.3, WATER,
    { solid: false, opaque: false, rough: 0.1, metal: 0.15, tag: 'water' });
  m.cyl(0, 0, 0, 0.85, 0.7, STONE, { tag: 'fountain', jitter: 0.05 });
  m.cyl(0, 0.7, 0, 1.35, 0.16, STONE, { jitter: 0.05 });
  m.cyl(0, 0.86, 0, 0.22, 1.2, STONE, { jitter: 0.05 });
  m.cyl(0, 2.06, 0, 0.7, 0.14, STONE, { solid: false });
  m.sphere(0, 2.34, 0, 0.24, GLASS, { solid: false, opaque: false, rough: 0.05 });
  for (let i = 0; i < 8; i++) {
    const a = i * 2.399963, r = POND_R * 0.35 + (i % 4) * 0.6;
    m.cyl(Math.cos(a) * r, 0.3, Math.sin(a) * r, m.range(0.3, 0.55), 0.05,
      m.pick([LEAF, LEAF_DK, FERN]), { solid: false, jitter: 0.14, tag: 'lily' });
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.2;
    m.sphere(Math.cos(a) * 3.2, 0.5, Math.sin(a) * 3.2, m.range(0.28, 0.5),
      m.pick([FERN, LEAF_DK, OLIVE]), { solid: false, jitter: 0.16, tag: 'reed' });
  }
  m.spot(0, 0, 2.4, { stance: 'crouch', quality: 0.72, hint: 'Behind the fountain in the reeds' });
  m.spot(-3.4, 0, -3.4, { stance: 'prone', quality: 0.68, hint: 'Flat on the pond kerb' });

  // ---------------------------------------------------------- planting benches --
  /** Slatted bench, soil tray, and a hedge of foliage a crouched body fits in. */
  const bench = (x, z, len) => {
    m.box(x, 0.85, z, len, 0.1, 1.3, WOOD, { tag: 'benchTop', jitter: 0.07 });
    const legs = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= legs; i++) {
      const lx = x - len / 2 + (len / legs) * i;
      for (const s of [-1, 1]) m.box(lx, 0, z + s * 0.5, 0.13, 0.85, 0.13, WOOD, { jitter: 0.08 });
    }
    // Lower shelves at the ends only: a step up, and the middle stays crawlable.
    for (const s of [-1, 1]) {
      m.box(x + s * (len / 2 - 1.3), 0.4, z, 2.4, 0.08, 1.1, WOOD, { jitter: 0.08 });
    }
    m.box(x, 0.95, z, len - 0.3, 0.22, 1.05, SOIL, { tag: 'tray', jitter: 0.1 });
    for (let i = 0; i < 8; i++) {
      const fx = x - len / 2 + 0.6 + (i / 7) * (len - 1.2);
      m.sphere(fx + m.range(-0.2, 0.2), 1.17 + m.range(0.18, 0.62), z + m.range(-0.34, 0.34),
        m.range(0.24, 0.46), m.pick(GREENS), { solid: false, jitter: 0.18, tag: 'foliage' });
    }
    for (let i = 0; i < 2; i++) {
      m.cyl(x + m.range(-len / 2 + 1, len / 2 - 1), 1.17, z + m.range(-0.3, 0.3),
        m.range(0.14, 0.2), m.range(0.2, 0.3), TERRA, { solid: false, jitter: 0.15, tag: 'pot' });
    }
  };
  const BENCHES = [[-14, -12.5], [14, -12.5], [-14, -7.5], [14, -7.5], [-14, 7.5], [-14, 12.5]];
  for (const [bx, bz] of BENCHES) bench(bx, bz, 12);
  m.spot(-14, 0, -12.5, { stance: 'prone', quality: 0.82, hint: 'Under the north-west bench' });
  m.spot(14, 0, -7.5, { stance: 'prone', quality: 0.8, hint: 'Under the north-east bench' });
  m.spot(14, 0, -12.5, { stance: 'prone', quality: 0.78, hint: 'Under the far north-east bench' });
  m.spot(-14, 0, 7.5, { stance: 'prone', quality: 0.8, hint: 'Under the south-west bench' });
  m.spot(-16.4, 1.17, 12.5, { stance: 'crouch', quality: 0.9, hint: 'Kneeling in the bench foliage' });
  m.spot(11.6, 1.17, -12.5, { stance: 'crouch', quality: 0.88, hint: 'Up among the seedlings' });
  m.spot(-9.6, 0, -10, { stance: 'crouch', quality: 0.64, hint: 'In the aisle gap between benches' });

  // ------------------------------------------------------------- tall palms --
  const palm = (x, z, h, trunkR) => {
    m.cyl(x, 0, z, trunkR * 1.5, 0.5, TERRA_DK, { tag: 'planter', jitter: 0.08 });
    m.cyl(x, 0.5, z, trunkR, h, '#7a6a48', { tag: 'trunk', jitter: 0.1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + x;
      m.sphere(x + Math.cos(a) * (0.7 + trunkR), 0.5 + h + m.range(-0.3, 0.2), z + Math.sin(a) * (0.7 + trunkR),
        m.range(0.55, 0.85), m.pick([LEAF, LEAF_DK, FERN]), { solid: false, jitter: 0.16, tag: 'frond' });
    }
    m.sphere(x, 0.5 + h + 0.25, z, 0.6, LEAF_DK, { solid: false, jitter: 0.1 });
  };
  palm(-6.4, -15.2, 3.2, 0.24);
  palm(6.4, -15.2, 2.8, 0.22);
  palm(-6.4, 15.2, 3.0, 0.23);
  palm(-20.6, 0, 3.4, 0.26);
  palm(20.6, 0, 3.1, 0.25);
  palm(-20.6, -9.6, 2.6, 0.21);
  m.spot(-20.6, 0, -1.2, { stance: 'stand', quality: 0.76, hint: 'Behind the west palm' });
  m.spot(20.6, 0, 1.6, { stance: 'crouch', quality: 0.7, hint: 'Between the east palm and the glass' });
  m.spot(-6.4, 0, -16.1, { stance: 'crouch', quality: 0.74, hint: 'Between the palm and the glass' });

  // ---------------------------------------------------------- terracotta pots --
  const potStack = (x, z, n, r0) => {
    for (let i = 0; i < n; i++) {
      const r = r0 - i * 0.012;
      m.cyl(x + m.range(-0.05, 0.05), i * 0.14, z + m.range(-0.05, 0.05), r, 0.34,
        m.chance(0.5) ? TERRA : TERRA_DK, { jitter: 0.14, tag: 'pot' });
    }
  };
  potStack(-21.4, -13.4, 5, 0.36);
  potStack(-20.4, -12.6, 4, 0.42);
  potStack(21.4, -15.2, 5, 0.38);
  potStack(20.3, -14.4, 6, 0.34);
  potStack(-21.6, 12.0, 5, 0.4);
  potStack(-20.5, 12.8, 3, 0.44);
  potStack(9.4, -16.0, 4, 0.4);
  potStack(-2.4, -16.2, 4, 0.36);
  m.spot(-20.8, 0, -13.2, { stance: 'crouch', quality: 0.78, hint: 'Between the pot stacks' });
  m.spot(20.8, 0, -14.8, { stance: 'crouch', quality: 0.76, hint: 'Behind the terracotta tower' });

  // Loose pots and seed trays scattered on the ground.
  for (let i = 0; i < 16; i++) {
    const x = m.range(-21.5, 21.5), z = m.range(-16, 16);
    if (Math.hypot(x, z) < 5.4) continue;
    if (m.chance(0.55)) {
      m.cyl(x, 0, z, m.range(0.16, 0.3), m.range(0.24, 0.4), m.chance(0.5) ? TERRA : TERRA_DK,
        { jitter: 0.16, tag: 'pot' });
    } else {
      m.box(x, 0, z, m.range(0.5, 0.9), 0.14, m.range(0.35, 0.6), WOOD,
        { yaw: m.range(0, 90), jitter: 0.14, tag: 'tray' });
      m.box(x, 0.14, z, 0.5, 0.09, 0.35, SOIL, { solid: false, jitter: 0.12 });
    }
  }

  // ------------------------------------------------------------ ground beds --
  // Deep planting either side of the main path: waist-high, and where the
  // green-on-green blending actually pays off.
  const bed = (x, z, w, d) => {
    m.box(x, 0, z, w, 0.42, d, TERRA_DK, { tag: 'bedWall', jitter: 0.08 });
    m.box(x, 0.42, z, w - 0.3, 0.14, d - 0.3, SOIL, { jitter: 0.1 });
    const n = Math.round(w * d * 0.34);
    for (let i = 0; i < n; i++) {
      m.sphere(x + m.range(-w / 2 + 0.4, w / 2 - 0.4), 0.56 + m.range(0.2, 0.9),
        z + m.range(-d / 2 + 0.4, d / 2 - 0.4), m.range(0.28, 0.55),
        m.pick(GREENS), { solid: false, jitter: 0.2, tag: 'foliage' });
    }
  };
  bed(-11, -2.6, 8, 3.0);
  bed(11, -2.6, 8, 3.0);
  bed(-11, 2.6, 8, 3.0);
  bed(11, 2.6, 8, 3.0);
  bed(0, -13.6, 6.4, 3.4);
  m.spot(-11, 0.56, -2.6, { stance: 'prone', quality: 0.89, hint: 'Buried in the west bed' });
  m.spot(11, 0.56, 2.6, { stance: 'prone', quality: 0.87, hint: 'Buried in the east bed' });
  m.spot(0, 0.56, -13.6, { stance: 'prone', quality: 0.85, hint: 'Face down in the fern bed' });

  // ------------------------------------------------------- hanging baskets --
  for (let i = 0; i < 8; i++) {
    const bx = -19 + (i % 4) * 12.6;
    const bz = i < 4 ? -9.6 : 9.6;
    m.cyl(bx, 2.9, bz, 0.03, 1.3, IRON, { solid: false });
    m.cyl(bx, 2.55, bz, 0.42, 0.35, TERRA, { solid: false, jitter: 0.12, tag: 'basket' });
    m.sphere(bx, 2.48, bz, 0.52, m.pick(GREENS), { solid: false, jitter: 0.2, tag: 'foliage' });
  }

  // --------------------------------------------------------- potting corner --
  // Timber lean-to in the south-east: the one opaque structure in the building.
  m.box(15.2, 0, 16.4, 13.4, 2.8, 0.4, WOOD, { tag: 'shedWall', jitter: 0.06 });
  m.box(21.6, 0, 13.0, 0.4, 2.8, 7.2, WOOD, { tag: 'shedWall', jitter: 0.06 });
  m.box(15.2, 2.8, 13.2, 13.8, 0.3, 6.8, WOOD, { solid: false, tag: 'shedRoof', jitter: 0.06 });
  m.box(8.6, 0, 13.2, 0.24, 2.8, 0.24, WOOD);
  m.box(8.6, 0, 16.2, 0.24, 2.8, 0.24, WOOD);
  m.box(15.2, 0, 14.6, 6.8, 0.9, 1.1, WOOD, { tag: 'pottingBench', jitter: 0.07 });
  m.box(15.2, 0.9, 14.6, 7.0, 0.1, 1.2, WOOD, { jitter: 0.07 });
  m.box(15.2, 1.0, 14.6, 3.0, 0.22, 0.9, SOIL, { solid: false, jitter: 0.1 });
  m.spot(15.2, 0, 15.6, { stance: 'crouch', quality: 0.88, hint: 'Squeezed behind the potting bench' });
  m.spot(12.8, 0, 15.6, { stance: 'crouch', quality: 0.74, hint: 'Beside the compost sacks' });
  m.spot(20.4, 0, 12.0, { stance: 'stand', quality: 0.84, hint: 'In the dark end of the potting shed' });
  m.shelf(20.8, 15.4, 3.2, 2.2, 0.6, WOOD, { yaw: 90, levels: 3, spot: false });
  for (let i = 0; i < 10; i++) {
    m.cyl(20.6, 0.1 + m.irange(0, 2) * 0.73, m.range(14.2, 16.6), m.range(0.14, 0.24),
      m.range(0.2, 0.34), m.chance(0.6) ? TERRA : TERRA_DK, { solid: false, jitter: 0.16 });
  }
  // Sacks of compost and a water butt.
  for (let i = 0; i < 6; i++) {
    m.box(10.0 + (i % 3) * 0.9, (i > 2 ? 0.55 : 0), 15.4 + (i % 2) * 0.5, 0.85, 0.55, 0.62,
      m.pick([SOIL, '#5a4a34', WOOD]), { yaw: m.range(-14, 14), jitter: 0.14, tag: 'sack' });
  }
  m.cyl(9.0, 0, 12.0, 0.72, 1.6, IRON_LT, { tag: 'butt', jitter: 0.07 });
  m.cyl(9.0, 1.6, 12.0, 0.76, 0.1, IRON, { solid: false });
  m.spot(10.6, 0, 12.0, { stance: 'crouch', quality: 0.72, hint: 'Wedged behind the water butt' });

  // Tool racks and coiled hose.
  const toolRack = (x, z, yaw) => {
    m.box(x, 0, z, 2.2, 0.14, 0.4, WOOD, { yaw });
    m.box(x, 1.9, z, 2.2, 0.14, 0.3, WOOD, { yaw, solid: false });
    const a = yaw * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      const o = -0.75 + i * 0.5;
      m.cyl(x + Math.cos(a) * o, 0.14, z + Math.sin(a) * o, 0.035, 1.75, WOOD,
        { solid: false, jitter: 0.16 });
      m.box(x + Math.cos(a) * o, 1.75, z + Math.sin(a) * o, 0.1, 0.28, 0.24,
        m.pick([IRON_LT, '#8a8578']), { yaw, solid: false });
    }
  };
  toolRack(-16.2, 16.4, 0);
  toolRack(-8.4, -16.4, 0);
  toolRack(22.4, -8.0, 90);
  m.spot(-16.2, 0, 15.6, { stance: 'stand', quality: 0.7, hint: 'Standing in the tool rack' });

  for (const [hx, hz] of [[-18.4, 3.4], [17.6, 5.2], [-3.6, 13.4], [12.8, -16.2]]) {
    for (let k = 0; k < 3; k++) {
      m.cyl(hx, 0, hz, 0.52 - k * 0.13, 0.11, m.chance(0.5) ? LEAF_DK : IRON_LT,
        { solid: false, jitter: 0.12, tag: 'hose' });
    }
    m.cyl(hx, 0.33, hz, 0.16, 0.12, IRON, { solid: false });
  }

  // Compost heap in the north-west corner.
  m.box(-20.4, 0, -16.0, 4.4, 1.0, 0.3, WOOD, { jitter: 0.1 });
  m.box(-22.4, 0, -14.6, 0.3, 1.0, 3.2, WOOD, { jitter: 0.1 });
  m.box(-18.4, 0, -14.6, 0.3, 1.0, 3.2, WOOD, { jitter: 0.1 });
  for (let i = 0; i < 8; i++) {
    m.sphere(-20.4 + m.range(-1.6, 1.6), m.range(0.2, 0.9), -14.8 + m.range(-1.2, 1.2),
      m.range(0.22, 0.42), m.pick([SOIL, MOSS, OLIVE, '#5a4a2e']), { solid: false, jitter: 0.2 });
  }
  m.spot(-20.4, 0, -13.4, { stance: 'crouch', quality: 0.8, hint: 'Down in the compost bay' });

  // ------------------------------------------------------------------ lights --
  for (const [lx, lz] of [[-15, -10], [15, -10], [-15, 10], [15, 10], [0, -14], [0, 14]]) {
    m.box(lx, 3.5, lz, 0.34, 0.3, 0.34, IRON, { solid: false });
    m.sphere(lx, 3.35, lz, 0.22, '#ffe9bc', { solid: false, emis: 1.9 });
    m.light(lx, 3.2, lz, '#ffe6b4', 0.7, 13);
  }
  m.light(0, 3.0, 0, '#cfe8d0', 0.6, 16);
  m.light(15.2, 2.3, 14.6, '#ffd9a0', 0.5, 9);
  m.light(0, 5.6, -8, '#d8f0dc', 0.4, 22);
  m.light(0, 5.6, 8, '#d8f0dc', 0.4, 22);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-20.4, -13.4);
  m.spawnHider(20.6, -12.0);
  m.spawnHider(-20.6, 14.4);
  m.spawnHider(15.2, 12.4);
  m.spawnHider(-9.6, -10);
  m.spawnHider(9.6, -10);
  m.spawnHider(-9.6, 10);
  m.spawnHider(9.6, 10);
  m.spawnHider(-16.4, 0);
  m.spawnHider(16.4, 0);
  m.spawnHider(0, -16.0);
  m.spawnHider(4.6, 5.6);
  m.spawnSeeker(0, 6.4);
  m.spawnSeeker(-1.4, 7.8);
  m.spawnSeeker(1.4, 7.8);
  m.spawnSeeker(0, 8.8);
  m.lobbySpawn(0, 7.6);

  m.palette([GLASS, IRON, IRON_LT, LEAF, LEAF_DK, LEAF_LT, FERN, OLIVE, MOSS, TERRA, TERRA_DK, SOIL, STONE, WOOD]);
  return m.finish();
}
