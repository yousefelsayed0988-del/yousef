// Cold Storage. Five double-sided racking rows split by one lit cross aisle,
// with a catwalk running the length of that aisle. The lamps are all over the
// alleys and the cross aisle on purpose: the rack aisles themselves are the
// darkest ground on the roster, and the only way to sweep them is to walk in.

import { createMap } from './kit.js';

export const meta = {
  id: 'coldstorage',
  name: 'Cold Storage',
  theme: 'freezer warehouse',
  tagline: 'Frost-blue steel, strip curtains, and aisles the lights never reach.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [58, 42],
    ceiling: 7.5,
    sky: '#0e1620',
    ambient: '#31414e',
    sunDir: [-0.2, -0.94, -0.28],
    sunColor: '#cfe2f0',
    sunIntensity: 0.14,
    fog: '#131c25',
    fogDensity: 0.03,
  });

  const CEIL = 7.5;
  const FROST = '#c3d8e6';
  const FROST_DK = '#94b2c6';
  const ICE = '#e4f0f6';
  const STEEL = '#8d959d';
  const STEEL_DK = '#5b626a';
  const ORANGE = '#c4611e';
  const BLUE_DK = '#2b4356';
  const WRAP = '#b6ccd8';
  const WOOD = '#96723f';
  const CRATE_G = '#3d7648';
  const CRATE_R = '#a63834';
  const YELLOW = '#d4ae2e';
  const CARD = '#a8845a';
  const SHADOW = '#37434c';

  const LOADS = [CARD, WRAP, CRATE_G, CRATE_R, BLUE_DK, ICE];

  // ------------------------------------------------------------------ shell --
  m.perimeter(10, FROST_DK);
  m.box(0, -0.4, 0, 58, 0.4, 42, '#7d8d99', { tag: 'floor', rough: 0.6 });
  m.ceil(0, 0, 58, 42, '#3d4d5a', CEIL);
  // Insulated panel joints: the walls are one colour, so they need a seam.
  for (let i = 0; i < 8; i++) {
    const x = -25 + i * 7.2;
    for (const s of [-1, 1]) m.box(x, 0, s * 20.7, 0.14, 6.4, 0.14, FROST_DK, { solid: false, tag: 'panelJoint' });
  }
  for (let i = 0; i < 6; i++) {
    const z = -17.5 + i * 7.0;
    for (const s of [-1, 1]) m.box(s * 28.7, 0, z, 0.14, 6.4, 0.14, FROST_DK, { solid: false, tag: 'panelJoint' });
  }
  for (const [wx, wz, ww, wd] of [[0, -20.6, 58, 0.2], [0, 20.6, 58, 0.2], [-28.6, 0, 0.2, 42], [28.6, 0, 0.2, 42]]) {
    m.box(wx, 0, wz, ww, 0.55, wd, STEEL_DK, { solid: false, tag: 'kickPlate' });
  }
  // Frost bloom, low on the walls and pooled on the floor.
  for (let i = 0; i < 16; i++) {
    const side = m.irange(0, 3);
    if (side < 2) {
      m.box(m.range(-27, 27), m.range(0.3, 3.4), (side ? 1 : -1) * 20.5, m.range(0.8, 2.6),
        m.range(0.4, 1.2), 0.07, m.pick([ICE, FROST, WRAP]), { solid: false, jitter: 0.1, tag: 'frost' });
    } else {
      m.box(m.range(-27, 27), 0.01, m.range(-19, 19), m.range(1.2, 3.4), 0.03, m.range(1.2, 3.4),
        m.pick([ICE, FROST, '#a9c2d2']), { solid: false, jitter: 0.1, tag: 'frostFloor' });
    }
  }

  // ------------------------------------------------------------ dividing wall --
  // Freezer hall to the west, the loading anteroom to the east.
  const DIV = 14.6;
  m.box(DIV, 0, -11.5, 0.45, CEIL, 18.2, FROST, { tag: 'wall' });
  m.box(DIV, 0, 9.0, 0.45, CEIL, 6.0, FROST, { tag: 'wall' });
  m.box(DIV, 0, 17.0, 0.45, CEIL, 8.0, FROST, { tag: 'wall' });
  m.box(DIV, 3.6, -0.2, 0.45, CEIL - 3.6, 4.4, FROST, { tag: 'wall' });
  m.box(DIV, 2.4, 13.5, 0.45, CEIL - 2.4, 3.0, FROST, { tag: 'wall' });

  /** Hanging PVC strip curtain: walk straight through it, see almost nothing. */
  const stripCurtain = (x, z, along, width, top, bottom = 0.15) => {
    const n = Math.max(4, Math.round(width / 0.42));
    for (let i = 0; i <= n; i++) {
      const t = -width / 2 + (width / n) * i;
      const px = along === 'z' ? x : x + t;
      const pz = along === 'z' ? z + t : z;
      m.box(px, bottom, pz, along === 'z' ? 0.06 : 0.26, top - bottom, along === 'z' ? 0.26 : 0.06,
        m.pick([WRAP, ICE, '#cfe0ea']), { solid: false, jitter: 0.08, tag: 'stripCurtain' });
    }
    m.box(x, top, z, along === 'z' ? 0.2 : width + 0.3, 0.2, along === 'z' ? width + 0.3 : 0.2,
      STEEL_DK, { solid: false, tag: 'curtainRail' });
  };
  stripCurtain(DIV, -0.2, 'z', 4.4, 3.6);
  stripCurtain(DIV, 13.5, 'z', 3.0, 2.4);
  stripCurtain(-2.5, 13.4, 'x', 3.8, 3.0);
  m.spot(DIV, 0, -0.2, { stance: 'stand', quality: 0.78, hint: 'Standing inside the strip curtain' });
  m.spot(-2.5, 0, 13.4, { stance: 'crouch', quality: 0.72, hint: 'Behind the cross-aisle curtain' });

  // ---------------------------------------------------------------- racking --
  const RACK_H = 4.4;
  const DECKS = [1.35, 2.9];
  const ROWS = [-13, -7, -1, 5, 11];
  const RUNS = [[-25.5, -4.6], [-0.4, 13.4]];

  const pallet = (x, y, z, h, c) => {
    m.box(x, y, z, 1.15, 0.14, 1.0, WOOD, { tag: 'pallet', jitter: 0.09 });
    m.box(x, y + 0.14, z, 1.05, h, 0.92, c, { tag: 'load', jitter: 0.1 });
    if (m.chance(0.35)) {
      m.box(x, y + 0.14, z, 1.12, h * 0.62, 0.99, WRAP,
        { solid: false, opaque: false, rough: 0.25, tag: 'shrinkWrap' });
    }
  };

  for (const rz of ROWS) {
    for (const [x0, x1] of RUNS) {
      const bays = Math.max(2, Math.round((x1 - x0) / 4.2));
      for (let i = 0; i <= bays; i++) {
        const x = x0 + ((x1 - x0) / bays) * i;
        for (const s of [-1, 1]) {
          m.box(x, 0, rz + s * 1.25, 0.18, RACK_H, 0.18, ORANGE, { tag: 'upright', jitter: 0.06 });
        }
      }
      for (const ly of DECKS) {
        for (const s of [-1, 1]) {
          m.box((x0 + x1) / 2, ly, rz + s * 0.7, x1 - x0, 0.14, 1.3, STEEL, { tag: 'beam', jitter: 0.04 });
        }
      }
      // Loaded pallets, thinning out toward the top level.
      const span = x1 - x0;
      for (const ly of DECKS) {
        for (let k = 0; k < 2; k++) {
          const px = x0 + span * (0.22 + k * 0.48) + m.range(-0.5, 0.5);
          const s = m.chance(0.5) ? -1 : 1;
          pallet(px, ly + 0.14, rz + s * 0.7, m.range(0.7, 1.2), m.pick(LOADS));
        }
      }
      for (let k = 0; k < 2; k++) {
        const px = x0 + span * (0.28 + k * 0.44);
        pallet(px, 0, rz + (k ? 0.7 : -0.7), m.range(0.8, 1.15), m.pick(LOADS));
      }
    }
  }

  // Under the bottom beam is a metre and a third of black, and the lamps never
  // point that way. This is the map's bread and butter.
  m.spot(-22.5, 0, -13.7, { stance: 'crouch', quality: 0.88, hint: 'Under the bottom beam, north row' });
  m.spot(-9.0, 0, -6.3, { stance: 'crouch', quality: 0.86, hint: 'Deep under the second rack' });
  m.spot(-16.5, 0, -0.3, { stance: 'crouch', quality: 0.85, hint: 'Bottom bay, middle row' });
  m.spot(-14.5, 0, 5.7, { stance: 'crouch', quality: 0.84, hint: 'Under the racking, south of the aisle' });
  m.spot(-22.5, 0, 11.7, { stance: 'crouch', quality: 0.84, hint: 'Last bay before the south alley' });
  m.spot(7.5, 0, -12.3, { stance: 'crouch', quality: 0.82, hint: 'East run, under the bottom beam' });
  m.spot(6.5, 0, 4.3, { stance: 'crouch', quality: 0.8, hint: 'Bottom bay of the east racking' });
  // Second level, reachable by stepping off the catwalk.
  m.spot(-20.0, 3.04, -7.7, { stance: 'prone', quality: 0.82, hint: 'Flat on the second rack level' });
  m.spot(-13.5, 3.04, 5.7, { stance: 'prone', quality: 0.8, hint: 'Up on the racking, behind a pallet' });
  m.spot(6.5, 3.04, -0.3, { stance: 'prone', quality: 0.78, hint: 'Second level of the east run' });

  // ---------------------------------------------------------------- catwalk --
  // Sits 0.3 above the rack decks, so you can step straight off it into a bay.
  m.box(-2.5, 3.0, 1.25, 3.8, 0.2, 33.5, STEEL, { tag: 'catwalk' });
  m.box(-2.5, 3.0, -17.0, 3.8, 0.2, 3.0, STEEL, { tag: 'catwalkLanding' });
  for (const s of [-1, 1]) {
    for (const [cz, cd] of [[-8.5, 17], [9.5, 15]]) {
      m.box(-2.5 + s * 1.85, 3.2, cz, 0.1, 1.05, cd, STEEL_DK, { opaque: false, tag: 'catwalkRail' });
    }
  }
  for (const cz of [-15, -6, 3, 12]) {
    for (const s of [-1, 1]) m.box(-2.5 + s * 1.7, 0, cz, 0.16, 3.0, 0.16, STEEL_DK, { tag: 'catwalkLeg' });
  }
  m.stairs(-8.6, -17.0, 1.8, 11, 3.2 / 11, 0.42, STEEL_DK, { yaw: 90 });
  for (const s of [-1, 1]) {
    m.box(-6.4, 1.2, -17.0 + s * 0.95, 4.4, 1.0, 0.08, STEEL_DK, { opaque: false, yaw: 0, tag: 'stairRail' });
  }
  m.spot(-2.5, 3.2, 6.5, { stance: 'prone', quality: 0.7, hint: 'Flat on the catwalk deck' });
  m.spot(-2.5, 3.2, -11.0, { stance: 'crouch', quality: 0.66, hint: 'Crouched behind the catwalk rail' });
  m.spot(-2.5, 0, -6.0, { stance: 'crouch', quality: 0.76, hint: 'Underneath the catwalk' });

  // ----------------------------------------------------------- plant and kit --
  const condenser = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    m.box(x, 0, z, 2.6, 2.2, 1.4, STEEL, { yaw, tag: 'condenser', jitter: 0.05 });
    m.box(x, 2.2, z, 2.7, 0.25, 1.5, STEEL_DK, { yaw, tag: 'condenserTop' });
    for (const s of [-1, 1]) {
      m.cyl(x + Math.cos(a) * s * 0.62, 2.45, z + Math.sin(a) * s * 0.62, 0.44, 0.22, SHADOW,
        { solid: false, tag: 'fan' });
    }
    m.box(x - Math.sin(a) * 0.78, 0.4, z + Math.cos(a) * 0.78, 2.2, 1.3, 0.1, SHADOW,
      { yaw, solid: false, tag: 'grille' });
    m.pipe(x, 2.6, z, x, z + 3.2, 0.1, FROST_DK, { solid: false });
  };
  condenser(-22, -18.0, 0);
  condenser(-15, -18.0, 0);
  condenser(6, -18.0, 0);
  condenser(-24, 18.4, 180);
  m.spot(-18.5, 0, -18.6, { stance: 'prone', quality: 0.84, hint: 'Between the condenser units' });
  m.spot(-24, 0, 17.2, { stance: 'crouch', quality: 0.76, hint: 'Behind the south condenser' });

  // Chest freezers along the south alley.
  const chest = (x, z, open) => {
    if (open) {
      for (const s of [-1, 1]) {
        m.box(x, 0, z + s * 0.62, 2.4, 0.92, 0.14, ICE, { tag: 'chest' });
        m.box(x + s * 1.13, 0, z, 0.14, 0.92, 1.3, ICE, { tag: 'chest' });
      }
      m.box(x, 0, z, 2.1, 0.12, 1.0, FROST, { solid: false, jitter: 0.08, tag: 'chestFrost' });
      m.box(x + 1.9, 0, z, 1.15, 0.4, 1.0, WOOD, { tag: 'stepPallet' });
      m.spot(x, 0, z, { stance: 'crouch', quality: 0.86, hint: 'Down inside the open chest freezer' });
    } else {
      m.box(x, 0, z, 2.4, 0.88, 1.3, ICE, { tag: 'chest', jitter: 0.04 });
      m.box(x, 0.5, z, 2.2, 0.3, 1.1, FROST, { solid: false, jitter: 0.1, tag: 'chestFrost' });
      m.box(x, 0.88, z, 2.34, 0.12, 1.24, '#d7ecf4', { opaque: false, rough: 0.1, tag: 'chestLid' });
    }
  };
  chest(-18.5, 15.4, false);
  chest(-15.4, 15.4, true);
  chest(-11.0, 15.4, false);
  chest(-7.9, 15.4, false);
  chest(3.0, 16.2, true);
  chest(6.2, 16.2, false);
  m.spot(-9.5, 0, 16.4, { stance: 'prone', quality: 0.7, hint: 'Flat between the chest freezers' });

  // Crates of produce, stacked and loose.
  m.crateStack(-26.2, -16.4, CRATE_G, 3, 1.0);
  m.crateStack(11.5, 17.6, CRATE_R, 3, 0.95);
  m.crateStack(-6.0, 18.6, CRATE_G, 2, 1.05);
  m.crateStack(9.0, -18.2, CARD, 3, 0.9, { spot: false });
  m.spot(9.0, 0, -16.9, { stance: 'crouch', quality: 0.72, hint: 'Beside the crate stack in the north alley' });
  for (let i = 0; i < 10; i++) {
    const zone = m.irange(0, 2);
    const cx = zone === 0 ? m.range(-27, -6) : zone === 1 ? m.range(2, 13) : m.range(16, 27);
    const cz = zone === 2 ? m.range(-18, 18) : (m.chance(0.5) ? m.range(-19.5, -15.5) : m.range(14, 19.5));
    m.box(cx, 0, cz, m.range(0.6, 0.9), m.range(0.4, 0.6), m.range(0.5, 0.8),
      m.pick([CRATE_G, CRATE_R, CARD, BLUE_DK]), { yaw: m.range(0, 90), jitter: 0.14, tag: 'crate' });
  }
  m.spot(-26.2, 0, -15.1, { stance: 'crouch', quality: 0.74, hint: 'Beside the stacked produce crates' });

  // ------------------------------------------------------------ the anteroom --
  // Roller door in the east wall, a forklift, and a dock office on stilts.
  m.box(28.3, 0, 0, 0.35, 1.2, 12.0, STEEL_DK, { tag: 'dockEdge' });
  m.box(28.3, 4.2, 0, 0.35, CEIL - 4.2, 12.0, FROST, { tag: 'dockLintel' });
  for (let i = 0; i < 7; i++) {
    m.box(28.3, 4.3 + i * 0.13, 0, 0.5, 0.11, 11.6, STEEL, { solid: false, tag: 'rollerSlat' });
  }
  stripCurtain(27.7, 0, 'z', 7.0, 4.1);
  m.spot(27.4, 0, -4.6, { stance: 'crouch', quality: 0.74, hint: 'In the roller-door recess' });

  const forklift = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    const fx = -Math.sin(a), fz = Math.cos(a);
    m.box(x, 0.28, z, 1.25, 0.82, 2.0, YELLOW, { yaw, tag: 'forkliftBody', jitter: 0.05 });
    m.box(x - fx * 0.85, 0.28, z - fz * 0.85, 1.15, 0.62, 0.6, SHADOW, { yaw, tag: 'counterweight' });
    m.box(x - fx * 0.15, 1.1, z - fz * 0.15, 0.75, 0.5, 0.7, SHADOW, { yaw, tag: 'seat' });
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        m.box(x + Math.cos(a) * s * 0.52 + fx * t * 0.72, 1.1, z + Math.sin(a) * s * 0.52 + fz * t * 0.72,
          0.09, 1.15, 0.09, YELLOW, { yaw, tag: 'cagePost' });
      }
      m.box(x + Math.cos(a) * s * 0.62, 0, z + Math.sin(a) * s * 0.62, 0.34, 0.62, 0.7, SHADOW,
        { yaw, tag: 'wheel' });
      m.box(x + Math.cos(a) * s * 0.5 + fx * 1.02, 0, z + Math.sin(a) * s * 0.5 + fz * 1.02, 0.28, 0.46, 0.5,
        SHADOW, { yaw, tag: 'wheel' });
      m.box(x + Math.cos(a) * s * 0.34 + fx * 1.16, 0.16, z + Math.sin(a) * s * 0.34 + fz * 1.16,
        0.16, 0.08, 1.1, STEEL_DK, { yaw, tag: 'fork' });
      m.box(x + Math.cos(a) * s * 0.34 + fx * 1.1, 0.16, z + Math.sin(a) * s * 0.34 + fz * 1.1,
        0.12, 2.4, 0.12, STEEL_DK, { yaw, tag: 'mast' });
    }
    m.box(x + fx * 0.72, 2.25, z + fz * 0.72, 1.0, 0.12, 0.16, STEEL_DK, { yaw, solid: false, tag: 'mastTop' });
    m.box(x, 2.3, z, 1.3, 0.1, 1.5, YELLOW, { yaw, solid: false, tag: 'cageRoof' });
    m.box(x, 2.42, z, 0.24, 0.12, 0.24, '#e8b53a', { yaw, solid: false, emis: 1.4, tag: 'beacon' });
  };
  forklift(21.5, -6.5, 100);
  m.spot(21.5, 0, -8.0, { stance: 'crouch', quality: 0.72, hint: 'Behind the parked forklift' });

  m.box(25, 2.8, 16, 6, 0.2, 7, STEEL, { tag: 'officeDeck' });
  for (const [ox, oz] of [[22.3, 12.8], [27.7, 12.8], [22.3, 19.2], [27.7, 19.2]]) {
    m.box(ox, 0, oz, 0.2, 2.8, 0.2, STEEL_DK, { tag: 'officeLeg' });
  }
  m.stairs(18.0, 16, 1.6, 10, 0.3, 0.42, STEEL_DK, { yaw: 90 });
  m.box(25.4, 3.0, 19.3, 5.2, 2.3, 0.16, FROST, { tag: 'officeWall' });
  for (const s of [-1, 1]) m.box(25.4 + s * 2.6, 3.0, 17.4, 0.16, 2.3, 3.8, FROST, { tag: 'officeWall' });
  m.box(25.4, 3.0, 15.6, 5.2, 1.0, 0.12, FROST, { tag: 'officeSill' });
  m.box(25.4, 4.0, 15.6, 5.0, 1.2, 0.08, '#a8ccdc', { opaque: false, rough: 0.1, tag: 'officeGlass' });
  m.box(25.4, 5.3, 17.4, 5.5, 0.14, 4.0, STEEL_DK, { solid: false, tag: 'officeRoof' });
  m.box(23.0, 3.0, 17.6, 1.6, 0.75, 0.8, CARD, { tag: 'officeDesk' });
  m.box(22.6, 3.75, 17.6, 0.5, 0.36, 0.06, '#7fd0e0', { solid: false, emis: 0.9, yaw: 14, tag: 'monitor' });
  for (const s of [-1, 1]) {
    m.box(21.0, 3.0, 16 + s * 2.4, 0.1, 1.0, 2.0, STEEL_DK, { opaque: false, tag: 'officeRail' });
  }
  m.spot(26.6, 3.0, 17.6, { stance: 'stand', quality: 0.82, hint: 'In the corner of the dock office' });
  m.spot(25.0, 0, 11.8, { stance: 'crouch', quality: 0.8, hint: 'In the shadow under the dock office' });

  // Anteroom stock: banded pallets and a cage trolley.
  for (const [px, pz] of [[17.2, -14.0], [18.6, -14.0], [17.2, -12.5], [24.0, -16.0], [25.4, -16.0],
    [16.8, 3.0], [26.5, 5.5], [25.0, -1.5]]) {
    pallet(px, 0, pz, m.range(0.8, 1.5), m.pick(LOADS));
  }
  m.spot(17.9, 0, -15.4, { stance: 'crouch', quality: 0.76, hint: 'Behind the staged pallets' });
  for (const [gx, gz] of [[20.0, 17.5], [16.5, -18.5]]) {
    m.box(gx, 0, gz, 1.4, 0.16, 1.1, STEEL_DK, { tag: 'cageBase' });
    m.box(gx, 0.16, gz, 1.4, 1.7, 1.1, STEEL, { opaque: false, tag: 'rollCage' });
    for (let i = 0; i < 3; i++) {
      m.box(gx + m.range(-0.3, 0.3), 0.22 + i * 0.5, gz, m.range(0.5, 0.8), 0.44, m.range(0.5, 0.8),
        m.pick(LOADS), { solid: false, jitter: 0.14, tag: 'load' });
    }
  }

  // ---------------------------------------------------------------- signage --
  for (let i = 0; i < ROWS.length; i++) {
    m.box(-4.9, 3.6, ROWS[i] - 1.4, 0.08, 0.9, 1.2, ORANGE, { solid: false, emis: 0.3, tag: 'aisleTag' });
  }
  for (const [sx, sz, sw] of [[-14, -20.4, 6], [8, 20.4, 6], [22, -20.4, 5]]) {
    m.box(sx, 4.2, sz, sw, 1.2, 0.08, BLUE_DK, { solid: false, emis: 0.22, tag: 'wallSign' });
    m.box(sx, 4.5, sz - 0.05, sw - 1.4, 0.4, 0.05, ICE, { solid: false, tag: 'signText' });
  }
  m.box(DIV - 0.3, 2.6, -3.4, 0.06, 1.0, 1.4, '#3fc27a', { solid: false, emis: 1.2, tag: 'exitSign' });
  for (const [tx, tz] of [[-27.6, -6], [-27.6, 6], [27.9, -12]]) {
    m.box(tx, 1.5, tz, 0.1, 0.6, 0.5, YELLOW, { solid: false, emis: 0.5, tag: 'thermostat' });
  }

  // ---------------------------------------------------------------- lighting --
  // Every fixture sits over an alley, the cross aisle or the anteroom. Nothing
  // is hung above a rack aisle, which is exactly why they stay black.
  const FIX = [[-20, -17.5], [-9, -17.5], [4, -17.5], [-20, 17.0], [-8, 17.0], [6, 17.0],
    [-2.5, -9], [-2.5, 1], [-2.5, 11], [18.5, -12], [22, -2], [20, 10], [25.5, -17], [26, 6]];
  for (const [fx, fz] of FIX) {
    m.box(fx, CEIL - 0.4, fz, 1.5, 0.16, 0.34, '#eaf5ff', { solid: false, emis: 2.6, tag: 'fixture' });
  }
  m.light(-20, 6.6, -17.5, '#d8ecff', 0.85, 15);
  m.light(-9, 6.6, -17.5, '#d8ecff', 0.85, 15);
  m.light(4, 6.6, -17.5, '#d8ecff', 0.8, 14);
  m.light(-20, 6.6, 17.0, '#d8ecff', 0.8, 15);
  m.light(-8, 6.6, 17.0, '#d8ecff', 0.8, 15);
  m.light(6, 6.6, 17.0, '#d8ecff', 0.75, 14);
  m.light(-2.5, 6.6, -9, '#e2f2ff', 0.8, 13);
  m.light(-2.5, 6.6, 1, '#e2f2ff', 0.8, 13);
  m.light(-2.5, 6.6, 11, '#e2f2ff', 0.75, 13);
  m.light(18.5, 6.4, -12, '#e6f2fa', 0.8, 16);
  m.light(22, 6.4, -2, '#e6f2fa', 0.85, 17);
  m.light(20, 6.4, 10, '#e6f2fa', 0.8, 16);
  m.light(26, 6.4, 6, '#e6f2fa', 0.7, 14);
  // One failing lamp deep in an aisle, just enough to tease.
  m.light(-14, 4.4, -4, '#7fa8c8', 0.22, 7);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-22.0, -17.6);
  m.spawnHider(-12.0, -10.0);
  m.spawnHider(-20.0, -4.0);
  m.spawnHider(-8.0, 2.0);
  m.spawnHider(-16.0, 8.0);
  m.spawnHider(-24.0, 16.0);
  m.spawnHider(6.0, -10.0);
  m.spawnHider(10.0, 2.0);
  m.spawnHider(0.5, 18.5);
  m.spawnHider(-2.5, 6.0, 3.2);
  m.spawnHider(18.0, -3.0);
  m.spawnHider(24.0, 13.0);
  m.spawnSeeker(26.5, -8.5);
  m.spawnSeeker(24.5, -10.5);
  m.spawnSeeker(26.5, -11.5);
  m.spawnSeeker(23.0, -8.0);
  m.lobbySpawn(25.5, -10.0);

  m.palette([FROST, FROST_DK, ICE, STEEL, STEEL_DK, ORANGE, BLUE_DK, WRAP,
    WOOD, CRATE_G, CRATE_R, YELLOW, CARD, SHADOW]);
  return m.finish();
}
