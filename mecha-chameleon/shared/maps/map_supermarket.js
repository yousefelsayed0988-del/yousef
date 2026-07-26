// Supermarket. Five double-sided gondola runs cut the floor into six long
// north-south aisles; a cross aisle, mid-aisle pallet stacks, the freezer
// islands and a walled stockroom are what stop those aisles being free kills.
// The stock is the point: every shelf is a band of printed colour, so a hider
// who paints off the right facing disappears into the merchandise.

import { createMap } from './kit.js';

export const meta = {
  id: 'supermarket',
  name: 'Supermarket',
  theme: 'retail',
  tagline: 'Flat white light, a thousand printed colours, nowhere that is truly dark.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [58, 44],
    ceiling: 5.0,
    sky: '#ccd2d8',
    ambient: '#8d959d',
    sunDir: [-0.24, -0.94, -0.26],
    sunColor: '#f2f7fc',
    sunIntensity: 0.3,
    fog: '#c9d0d7',
    fogDensity: 0.007,
  });

  const FLOOR = '#d8dcda';
  const FLOOR_DK = '#bcc2c1';
  const WALL = '#e6e9e6';
  const CEILC = '#c6cbcf';
  const STEEL = '#a4abb2';
  const STEEL_DK = '#6f767e';
  const SHELF = '#dfe3e6';
  const RED = '#c23a2d';
  const BLUE = '#2d63b2';
  const YELLOW = '#ddaa27';
  const GREEN = '#3f9350';
  const ORANGE = '#dc7a29';
  const PURPLE = '#77468f';
  const FROST = '#bcd9e2';
  const WOOD = '#a9804d';

  const GOODS = [RED, BLUE, YELLOW, GREEN, ORANGE, PURPLE, '#d9d3c4'];
  const CEIL = 5.0;

  // ------------------------------------------------------------------ shell --
  m.perimeter(9, '#ccd2d6');
  m.floor(0, 0, 58, 44, FLOOR);
  m.ceil(0, 0, 58, 44, CEILC, CEIL);

  for (let i = 0; i < 6; i++) {
    m.box(m.range(-27, 27), 0.004, m.range(-20, 20), m.range(2.2, 5.0), 0.02, m.range(2.2, 5.0),
      m.chance(0.5) ? FLOOR_DK : '#cdd2d1', { solid: false, tag: 'tile', jitter: 0.05 });
  }
  for (const [sx, sz, w, d] of [[0, -21.6, 56, 0.3], [0, 21.6, 56, 0.3], [-28.6, 0, 0.3, 43], [28.6, 0, 0.3, 43]]) {
    m.box(sx, 0, sz, w, 0.42, d, STEEL_DK, { solid: false, tag: 'skirt' });
  }

  // --------------------------------------------------------- stockroom shell --
  // North-east corner, walled off: a personnel door on the west face and a
  // roller shutter on the south face, both standing open.
  const SR_X = 15.5, SR_Z = -10;
  m.box(SR_X, 0, -19.6, 0.35, CEIL, 4.8, WALL, { tag: 'wall' });
  m.box(SR_X, 0, -12.4, 0.35, CEIL, 4.8, WALL, { tag: 'wall' });
  m.box(SR_X, 3.0, -15.9, 0.35, CEIL - 3.0, 2.4, WALL, { tag: 'wall' });
  m.box(18.4, 0, SR_Z, 5.8, CEIL, 0.35, WALL, { tag: 'wall' });
  m.box(26.7, 0, SR_Z, 4.6, CEIL, 0.35, WALL, { tag: 'wall' });
  m.box(23.0, 3.4, SR_Z, 2.8, CEIL - 3.4, 0.35, WALL, { tag: 'wall' });
  for (let i = 0; i < 5; i++) {
    m.box(23.0, 3.5 + i * 0.12, SR_Z, 2.8, 0.1, 0.5, STEEL, { solid: false, tag: 'shutter' });
  }
  m.box(23.0, 3.4, SR_Z - 0.36, 3.0, 0.16, 0.24, YELLOW, { solid: false, tag: 'doorTrim' });

  // ---------------------------------------------------------------- gondolas --
  const GOND_W = 2.0, GOND_H = 2.2, BASE_H = 0.4;
  const GX = [-17.0, -11.8, -6.6, -1.4, 3.8];
  const RUNS = [];
  for (const gx of GX) {
    RUNS.push({ x: gx, z: -11.2, len: 13.6 });
    RUNS.push({ x: gx, z: 3.8, len: 10.4 });
  }

  for (const r of RUNS) {
    m.box(r.x, 0, r.z, GOND_W, BASE_H, r.len, STEEL_DK, { tag: 'gondolaBase' });
    // The spine is the only thing stopping a hider walking through a run, and
    // it leaves an 0.85 m recess either side: the bottom-shelf hiding hole.
    m.box(r.x, BASE_H, r.z, 0.3, GOND_H - BASE_H, r.len, STEEL, { tag: 'gondolaSpine' });
    for (const s of [-1, 1]) {
      for (const ly of [1.0, 1.5, 2.0]) {
        m.box(r.x + s * 0.57, ly, r.z, 0.86, 0.05, r.len, SHELF, { solid: false, tag: 'shelf' });
      }
    }
    for (const e of [-1, 1]) {
      m.box(r.x, BASE_H, r.z + e * (r.len / 2 - 0.06), GOND_W, GOND_H - BASE_H, 0.12, STEEL, { tag: 'endcap' });
    }
    m.box(r.x, GOND_H, r.z - r.len / 2 + 0.3, 1.5, 0.34, 0.06,
      m.pick([RED, BLUE, GREEN, ORANGE]), { solid: false, emis: 0.25, tag: 'aisleSign' });
  }

  // Stock. One long band per shelf reads as a full facing for the price of a
  // single prop; the accents on top break up the repeat.
  for (const r of RUNS) {
    for (const s of [-1, 1]) {
      for (const ly of [1.05, 1.55, 2.05]) {
        const top = ly > 2;
        m.box(r.x + s * 0.58, ly, r.z + m.range(-1.4, 1.4), m.range(0.6, 0.72),
          top ? m.range(0.16, 0.26) : m.range(0.26, 0.42), r.len * m.range(0.5, 0.8),
          m.pick(GOODS), { solid: false, jitter: 0.13, tag: 'goods' });
        const n = m.irange(0, 1);
        for (let i = 0; i < n; i++) {
          const z = r.z + m.range(-r.len / 2 + 0.7, r.len / 2 - 0.7);
          const x = r.x + s * m.range(0.5, 0.64);
          if (m.chance(0.4)) {
            const rad = m.range(0.09, 0.13);
            for (let k = 0; k < 2; k++) {
              m.cyl(x, ly, z + (k - 0.5) * rad * 2.4, rad, m.range(0.16, 0.26), m.pick(GOODS),
                { solid: false, jitter: 0.16, tag: 'goods' });
            }
          } else {
            m.box(x, ly, z, m.range(0.34, 0.5), m.range(0.2, 0.34), m.range(0.5, 1.0),
              m.pick(GOODS), { solid: false, jitter: 0.18, tag: 'goods' });
          }
        }
      }
    }
  }

  m.spot(GX[0] + 0.6, BASE_H, -11.2, { stance: 'prone', quality: 0.84, hint: 'Flat on the bottom shelf' });
  m.spot(GX[2] - 0.6, BASE_H, 3.8, { stance: 'prone', quality: 0.82, hint: 'Bottom shelf, behind the facings' });
  m.spot(GX[3] + 0.6, BASE_H, -11.2, { stance: 'prone', quality: 0.8, hint: 'Under the middle-aisle shelving' });
  m.spot(GX[4] - 0.6, BASE_H, 3.8, { stance: 'prone', quality: 0.78, hint: 'Bottom shelf by the aisle head' });

  // ---------------------------------------------------------- pallet displays --
  const palletLoad = (x, y, z, h, c, yaw = 0) => {
    m.box(x, y, z, 1.25, 0.14, 1.05, WOOD, { yaw, tag: 'pallet', jitter: 0.07 });
    m.box(x, y + 0.14, z, 1.12, h, 0.94, c, { yaw, tag: 'load', jitter: 0.09 });
    m.box(x, y + 0.14, z, 1.2, h * 0.55, 1.0, '#e2e9ec',
      { yaw, solid: false, opaque: false, tag: 'wrap' });
  };

  // Mid-aisle stacks: the only things breaking a 14 m gondola sight line.
  for (const [px, pz, ph] of [[-14.4, -8.0, 1.35], [-9.2, -14.6, 1.5], [-4.0, 6.0, 1.25], [1.2, -13.0, 1.4]]) {
    palletLoad(px, 0, pz, ph, m.pick([RED, BLUE, YELLOW, GREEN]));
  }
  m.spot(-14.4, 0, -9.2, { stance: 'crouch', quality: 0.75, hint: 'Behind the mid-aisle pallet' });
  m.spot(-4.0, 0, 7.2, { stance: 'crouch', quality: 0.72, hint: 'Tucked against a stacked pallet' });

  // Cross-aisle promotions.
  for (const px of [-14.4, -4.0, 1.2]) palletLoad(px, 0, -2.9, 1.55, m.pick([ORANGE, PURPLE, BLUE]));
  m.spot(-4.0, 0, -1.85, { stance: 'crouch', quality: 0.7, hint: 'Behind the promo stack' });

  // Back-aisle staging cages.
  for (const [cx, cz] of [[-19.0, -20.2], [-12.6, -20.0], [-5.4, -20.2], [1.6, -19.8]]) {
    m.box(cx, 0, cz, 1.3, 0.16, 1.1, STEEL_DK, { tag: 'cageBase' });
    m.box(cx, 0.16, cz, 1.3, 1.6, 1.1, STEEL, { opaque: false, tag: 'cage' });
    for (let i = 0; i < 2; i++) {
      m.box(cx + m.range(-0.3, 0.3), 0.25 + i * 0.55, cz, m.range(0.45, 0.7), 0.44, m.range(0.45, 0.8),
        m.pick(GOODS), { solid: false, jitter: 0.15, tag: 'goods' });
    }
  }
  m.spot(-15.8, 0, -20.1, { stance: 'crouch', quality: 0.7, hint: 'Between the roll cages out back' });
  m.spot(-1.9, 0, -20.0, { stance: 'crouch', quality: 0.68, hint: 'Wedged in the back-aisle staging' });

  // ----------------------------------------------------------------- produce --
  const produceBin = (x, z, fruit) => {
    m.box(x, 0, z, 2.0, 0.52, 1.4, WOOD, { tag: 'bin', jitter: 0.06 });
    m.box(x, 0.52, z, 2.06, 0.1, 1.46, WOOD, { solid: false, jitter: 0.05, tag: 'binRim' });
    for (let i = 0; i < 5; i++) {
      m.sphere(x + m.range(-0.72, 0.72), 0.62 + m.range(0, 0.14), z + m.range(-0.42, 0.42),
        m.range(0.14, 0.2), fruit, { solid: false, jitter: 0.18, tag: 'fruit' });
    }
  };
  const FRUIT = [ORANGE, GREEN, RED, YELLOW, '#8fae3f', '#b8452f'];
  for (let i = 0; i < 4; i++) produceBin(-26.4, -14.6 + i * 5.2, FRUIT[i]);
  for (let i = 0; i < 4; i++) produceBin(-21.8, -12.4 + i * 5.2, FRUIT[i + 2]);
  m.spot(-24.1, 0, -12.0, { stance: 'crouch', quality: 0.74, hint: 'Between the produce bins' });
  m.spot(-24.1, 0, 5.6, { stance: 'crouch', quality: 0.7, hint: 'In the fruit-aisle gap' });
  m.spot(-19.6, 0, -6.0, { stance: 'prone', quality: 0.66, hint: 'Flat against a produce bin' });

  // Hanging scales over the produce run.
  for (const [sx, sz] of [[-26.4, 3.0], [-21.8, -16.4]]) {
    m.cyl(sx, 2.4, sz, 0.05, 1.5, STEEL_DK, { solid: false });
    m.cyl(sx, 2.08, sz, 0.34, 0.32, STEEL, { solid: false });
    m.box(sx, 2.0, sz, 0.5, 0.1, 0.5, WALL, { solid: false });
  }

  // ------------------------------------------------------------------ frozen --
  const chestFreezer = (x, z, open) => {
    const w = 2.4, d = 1.3;
    if (open) {
      m.box(x, 0, z - d / 2 + 0.07, w, 0.95, 0.14, WALL, { tag: 'freezer' });
      m.box(x, 0, z + d / 2 - 0.07, w, 0.95, 0.14, WALL, { tag: 'freezer' });
      for (const s of [-1, 1]) m.box(x + s * (w / 2 - 0.07), 0, z, 0.14, 0.95, d, WALL, { tag: 'freezer' });
      m.box(x, 0, z, w - 0.3, 0.1, d - 0.3, FROST, { solid: false, jitter: 0.06, tag: 'frost' });
      for (let i = 0; i < 2; i++) {
        m.box(x + m.range(-0.8, 0.8), 0.1, z + m.range(-0.3, 0.3), m.range(0.34, 0.5), 0.2, m.range(0.34, 0.5),
          m.pick(GOODS), { solid: false, jitter: 0.16, tag: 'goods' });
      }
      // The stock pallet beside it is also the step you climb in from.
      palletLoad(x + w / 2 + 0.85, 0, z, 0.44, FROST);
      m.spot(x, 0, z, { stance: 'crouch', quality: 0.87, hint: 'Down inside the open freezer' });
    } else {
      m.box(x, 0, z, w, 0.9, d, WALL, { tag: 'freezer', jitter: 0.04 });
      m.box(x, 0.55, z, w - 0.2, 0.28, d - 0.2, FROST, { solid: false, jitter: 0.08, tag: 'frost' });
      // Sliding glass lid: it collides, but you can see straight through it.
      m.box(x, 0.9, z, w - 0.06, 0.12, d - 0.06, '#d3e8ef', { opaque: false, rough: 0.12, tag: 'glassLid' });
      m.box(x + m.range(-0.7, 0.7), 0.58, z, m.range(0.36, 0.5), 0.24, m.range(0.36, 0.5),
        m.pick(GOODS), { solid: false, jitter: 0.16, tag: 'goods' });
    }
  };
  for (const fx of [8.4, 13.4]) {
    for (const fz of [-5.5, -0.5, 4.5]) {
      chestFreezer(fx, fz, (fx === 8.4 && fz === -0.5) || (fx === 13.4 && fz === 4.5));
    }
  }
  m.spot(10.9, 0, -3.0, { stance: 'prone', quality: 0.72, hint: 'Flat between the freezer islands' });
  m.spot(10.9, 0, 7.4, { stance: 'crouch', quality: 0.64, hint: 'At the end of the freezer run' });

  // Upright glass-door coolers on the east wall.
  for (const cz of [-3.0, 1.6, 6.2]) {
    m.box(27.9, 0, cz, 0.9, 2.4, 4.0, STEEL_DK, { tag: 'cooler' });
    m.box(27.42, 0.1, cz, 0.08, 2.2, 3.9, '#cfe6ee', { opaque: false, rough: 0.1, emis: 0.12, tag: 'coolerGlass' });
    for (let i = 0; i < 3; i++) {
      m.cyl(27.75 + m.range(-0.12, 0.12), 0.35 + i * 0.62, cz + m.range(-1.7, 1.7),
        m.range(0.08, 0.11), m.range(0.24, 0.32), m.pick(GOODS), { solid: false, jitter: 0.16, tag: 'goods' });
    }
  }
  m.spot(26.7, 0, -0.7, { stance: 'stand', quality: 0.7, hint: 'In the gap between the drinks coolers' });
  m.spot(26.7, 0, 4.0, { stance: 'crouch', quality: 0.66, hint: 'Against a cooler end panel' });

  // ------------------------------------------------------------ bakery counter --
  // Front and top only, so the staff side behind it is a genuine pocket.
  const BK_X = 23.5, BK_Z = -6.6, BK_W = 10.4, BK_D = 1.3;
  m.box(BK_X, 0, BK_Z + BK_D / 2 - 0.07, BK_W, 1.05, 0.14, WALL, { tag: 'counterFront' });
  for (const s of [-1, 1]) m.box(BK_X + s * (BK_W / 2 - 0.07), 0, BK_Z, 0.14, 1.05, BK_D, WALL, { tag: 'counterSide' });
  m.box(BK_X, 1.05, BK_Z, BK_W, 0.09, BK_D + 0.16, STEEL, { tag: 'counterTop' });
  m.box(BK_X, 0.45, BK_Z + BK_D / 2 - 0.02, BK_W - 0.6, 0.55, 0.06, '#dcecf2',
    { opaque: false, solid: false, rough: 0.1, tag: 'sneezeGuard' });
  for (let i = 0; i < 8; i++) {
    m.box(BK_X - BK_W / 2 + 0.8 + i * 1.25, 0.6, BK_Z, m.range(0.4, 0.6), m.range(0.12, 0.2), 0.75,
      m.pick(['#c8963f', '#a8712f', '#e0c07a', RED]), { solid: false, jitter: 0.14, tag: 'bread' });
  }
  m.box(BK_X, 2.3, BK_Z + 0.9, 4.0, 0.7, 0.07, YELLOW, { solid: false, emis: 0.4, tag: 'sign' });
  m.spot(BK_X - 2.5, 0, BK_Z - 1.2, { stance: 'prone', quality: 0.8, hint: 'Behind the bakery counter' });
  m.spot(BK_X + 3.4, 0, BK_Z - 1.25, { stance: 'crouch', quality: 0.72, hint: 'In the staff alley behind the bakery' });

  // --------------------------------------------------------------- checkouts --
  for (const cx of GX) {
    m.box(cx, 0, 15.6, 0.95, 0.92, 5.2, WALL, { tag: 'counter' });
    m.box(cx, 0.92, 14.0, 0.66, 0.05, 2.0, '#3b4046', { solid: false, rough: 0.4, tag: 'conveyor' });
    m.box(cx, 0.92, 17.4, 0.8, 0.05, 1.4, STEEL, { solid: false, tag: 'bagging' });
    m.box(cx - 0.18, 0.97, 15.9, 0.4, 0.32, 0.46, STEEL_DK, { tag: 'register' });
    m.box(cx - 0.18, 1.29, 15.9, 0.34, 0.24, 0.05, '#7fd8c6', { solid: false, emis: 1.1, yaw: 14, tag: 'screen' });
    m.box(cx + 0.62, 0, 12.5, 0.5, 1.5, 0.9, STEEL, { tag: 'sweetRack' });
    m.box(cx + 0.62, 0.6 + m.range(0, 0.5), 12.5 + m.range(-0.26, 0.26), 0.42, 0.26, m.range(0.24, 0.36),
      m.pick(GOODS), { solid: false, jitter: 0.2, tag: 'goods' });
    m.box(cx, 2.6, 18.4, 0.55, 0.55, 0.06, m.pick([RED, BLUE, GREEN]), { solid: false, emis: 0.6, tag: 'laneNumber' });
  }
  m.spot(GX[0], 0, 18.7, { stance: 'crouch', quality: 0.58, hint: 'Ducked at the end of a checkout' });
  m.spot(GX[3] + 0.9, 0, 13.4, { stance: 'crouch', quality: 0.6, hint: 'Behind the sweet rack' });
  m.spot(GX[1] + 2.6, 0, 15.6, { stance: 'prone', quality: 0.62, hint: 'Flat in a closed lane' });

  // ------------------------------------------------------ trolleys + entrance --
  const trolley = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    m.box(x, 0.26, z, 0.62, 0.55, 0.92, STEEL, { yaw, opaque: false, tag: 'trolley' });
    m.box(x, 0.2, z, 0.52, 0.06, 0.82, STEEL_DK, { yaw, solid: false });
    m.box(x - Math.sin(a) * 0.5, 0.84, z - Math.cos(a) * 0.5, 0.62, 0.06, 0.06, RED, { yaw, solid: false });
  };
  for (let i = 0; i < 5; i++) trolley(25.8, 13.6 + i * 0.62, 0);
  for (let i = 0; i < 3; i++) trolley(22.6, 14.4 + i * 0.62, 0);
  for (const [tx, tz, ty] of [[6.4, 8.6, 20], [-19.4, 11.4, -35], [18.6, 6.4, 110]]) trolley(tx, tz, ty);
  m.spot(24.2, 0, 15.4, { stance: 'crouch', quality: 0.68, hint: 'Inside the trolley nest' });
  m.spot(27.6, 0, 19.6, { stance: 'prone', quality: 0.6, hint: 'Flat in the entrance corner' });

  m.fence(10.5, 11.2, 20.5, 11.2, 1.0, STEEL, { spacing: 3.2 });
  for (let i = 0; i < 4; i++) {
    m.box(20.0, i * 0.24, 19.8, 0.62, 0.26, 0.46, m.pick([RED, BLUE]), { solid: false, jitter: 0.1, tag: 'basket' });
  }
  m.box(13.4, 0, 20.7, 2.6, 2.2, 0.5, STEEL_DK, { tag: 'kiosk' });
  m.box(13.4, 1.3, 20.4, 2.2, 0.7, 0.06, '#7fd8c6', { solid: false, emis: 0.9, tag: 'kioskScreen' });
  m.spot(15.4, 0, 20.6, { stance: 'stand', quality: 0.64, hint: 'Alongside the self-service kiosk' });

  // ------------------------------------------------------- stockroom contents --
  const rack = (x0, x1, z, d, h, decks) => {
    const n = Math.max(2, Math.round((x1 - x0) / 3.4));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) / n) * i;
      for (const s of [-1, 1]) {
        m.box(x, 0, z + s * (d / 2 - 0.08), 0.16, h, 0.16, ORANGE, { tag: 'upright', jitter: 0.06 });
      }
    }
    for (const ly of decks) m.box((x0 + x1) / 2, ly, z, x1 - x0, 0.13, d, STEEL_DK, { tag: 'beam' });
  };
  rack(17.4, 27.6, -20.4, 1.3, 3.9, [1.5, 2.8]);
  rack(17.4, 27.6, -13.0, 1.3, 3.9, [1.5, 2.8]);
  for (let i = 0; i < 3; i++) {
    palletLoad(18.6 + i * 3.4, 1.63, -20.4, 0.95, m.pick([BLUE, RED, YELLOW, GREEN]));
    palletLoad(18.6 + i * 3.4, 2.93, -13.0, 0.8, m.pick([ORANGE, PURPLE, BLUE]));
  }
  for (const [px, pz] of [[18.2, -20.4], [26.4, -13.0]]) palletLoad(px, 0, pz, 1.1, m.pick([GREEN, YELLOW, PURPLE]));
  m.spot(23.0, 0, -19.5, { stance: 'crouch', quality: 0.86, hint: 'Tucked under the stockroom racking' });
  m.spot(19.0, 0, -12.1, { stance: 'crouch', quality: 0.82, hint: 'Below the second rack bay' });
  m.crateStack(27.0, -16.8, WOOD, 3, 1.05);
  m.box(17.2, 0, -17.0, 1.0, 2.1, 2.6, STEEL_DK, { tag: 'compactor' });
  m.spot(17.2, 0, -18.7, { stance: 'stand', quality: 0.84, hint: 'Behind the compactor in the stockroom' });
  m.box(21.0, 0, -16.6, 1.6, 1.1, 1.2, GREEN, { tag: 'wasteHopper' });
  m.box(24.2, 0, -16.8, 1.1, 0.9, 0.8, YELLOW, { tag: 'palletTruck' });
  m.box(24.2, 0.9, -17.1, 0.1, 0.95, 0.1, STEEL_DK, { solid: false });

  // ------------------------------------------------------------------ signage --
  for (let i = 0; i < GX.length; i++) {
    m.box(GX[i] + 2.6, 3.3, -18.9, 1.9, 0.6, 0.07, m.pick([BLUE, RED, GREEN, ORANGE]),
      { solid: false, emis: 0.35, tag: 'aisleBoard' });
    m.box(GX[i] + 2.6, 3.3, 9.6, 1.9, 0.6, 0.07, m.pick([BLUE, RED, GREEN, ORANGE]),
      { solid: false, emis: 0.35, tag: 'aisleBoard' });
  }
  for (const [bx, bz, bw, byaw] of [[-6, -21.4, 10, 0], [-8, 21.4, 10, 0], [-28.4, -4, 11, 90]]) {
    m.box(bx, 3.4, bz, bw, 1.6, 0.08, m.pick([RED, BLUE, GREEN, ORANGE, YELLOW]),
      { yaw: byaw, solid: false, emis: 0.3, tag: 'banner' });
  }
  for (const [hx, hz, hc] of [[-24.1, -2, GREEN], [-9.2, 0, BLUE], [10.9, -0.5, FROST], [23.5, 2, ORANGE]]) {
    m.box(hx, 3.6, hz, 3.4, 0.8, 0.09, hc, { solid: false, emis: 0.5, tag: 'deptSign' });
    m.cyl(hx, 4.4, hz, 0.03, 0.6, STEEL_DK, { solid: false });
  }

  // ------------------------------------------------------------------- lights --
  for (const lx of [-24.1, -12.5, -1.4, 10.9, 22.5]) {
    for (const lz of [-16, -6, 4, 14]) {
      m.box(lx, CEIL - 0.28, lz, 0.3, 0.09, 3.6, '#f7fbff', { solid: false, emis: 2.6, tag: 'tube' });
    }
  }
  for (const [lx, lz] of [[-24, -14], [-24, 4], [-12.5, -16], [-12.5, -5], [-12.5, 5], [-12.5, 15],
    [-1.4, -16], [-1.4, 4], [-1.4, 15], [10.9, -5], [10.9, 5], [22.5, -4], [22.5, 5], [22.5, 15]]) {
    m.light(lx, CEIL - 0.7, lz, '#eef4fb', 0.72, 17);
  }
  m.light(22, CEIL - 0.9, -16.5, '#dfe8f2', 0.6, 15);
  m.light(18, CEIL - 0.9, -20, '#dfe8f2', 0.5, 13);

  // ------------------------------------------------------------------- spawns --
  m.spawnHider(-24.1, -13);
  m.spawnHider(-24.1, 4);
  m.spawnHider(-19.4, -8);
  m.spawnHider(-14.4, -14);
  m.spawnHider(-9.2, 5);
  m.spawnHider(-4.0, -12);
  m.spawnHider(1.2, 6);
  m.spawnHider(6.2, -14);
  m.spawnHider(10.9, 2.0);
  m.spawnHider(21.0, -2.0);
  m.spawnHider(23.0, -16.6);
  m.spawnHider(-8.0, 10.8);
  m.spawnSeeker(17.0, 18.0);
  m.spawnSeeker(19.4, 18.4);
  m.spawnSeeker(17.8, 16.2);
  m.spawnSeeker(20.6, 16.6);
  m.lobbySpawn(18.5, 19.8);

  m.palette([FLOOR, FLOOR_DK, WALL, STEEL, STEEL_DK, SHELF, RED, BLUE, YELLOW, GREEN, ORANGE, PURPLE, FROST, WOOD]);
  return m.finish();
}
