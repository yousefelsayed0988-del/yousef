// Swimming Pool. The hall floor is the pool basin; the deck is a 1.5 m slab
// laid around it, so the "sunken" pool is really the only piece of ground at
// world zero. Water is a non-solid, non-occluding slab: you can wade and hide
// in it, but it will not stop a hunter seeing you - only its colour helps.

import { createMap } from './kit.js';

export const meta = {
  id: 'pool',
  name: 'Swimming Pool',
  theme: 'natatorium',
  tagline: 'Aqua tile and chlorine glare. Everything here is one of three blues.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [52, 40],
    ceiling: 9.8,
    sky: '#cfe6ef',
    ambient: '#9fbcc6',
    sunDir: [-0.26, -0.9, -0.34],
    sunColor: '#ffffff',
    sunIntensity: 0.72,
    fog: '#d5e8ee',
    fogDensity: 0.006,
  });

  const DEG = Math.PI / 180;
  const DECK = 1.5;
  const CEIL = 9.8;

  const TILE = '#e6edef';
  const TILE_DK = '#c3d2d6';
  const AQUA = '#3fb7c4';
  const AQUA_DK = '#1f7f92';
  const DEEP = '#1b5f86';
  const WATER = '#43a8c6';
  const CONC = '#b7bcb9';
  const CONC_DK = '#878d90';
  const STEEL = '#a6adb3';
  const LANE_R = '#d84a3c';
  const LANE_Y = '#e4c23a';
  const WOOD = '#b98a52';
  const NAVY = '#26456e';
  const ORANGE = '#e07a2a';

  // ------------------------------------------------------------------ shell --
  m.perimeter(12, TILE);
  m.box(0, -0.4, 0, 52, 0.4, 40, '#9fd0da', { tag: 'floor', rough: 0.2 });
  m.ceil(0, 0, 52, 40, '#dfe6e8', CEIL);

  // Deck: four slabs leaving a 26 x 14 hole for the basin.
  m.box(-19, 0, 0, 12, DECK, 39, TILE_DK, { tag: 'deck' });
  m.box(19, 0, 0, 12, DECK, 39, TILE_DK, { tag: 'deck' });
  m.box(0, 0, -13.25, 26, DECK, 12.5, TILE_DK, { tag: 'deck' });
  m.box(0, 0, 13.25, 26, DECK, 12.5, TILE_DK, { tag: 'deck' });
  // Coping: a darker lip all the way round the water.
  for (const [cx, cz, cw, cd] of [[0, -7.2, 26.8, 0.4], [0, 7.2, 26.8, 0.4],
    [-13.2, 0, 0.4, 14.4], [13.2, 0, 0.4, 14.4]]) {
    m.box(cx, DECK - 0.06, cz, cw, 0.08, cd, AQUA_DK, { solid: false, tag: 'coping' });
  }

  // Stepped basin floor: shallow west, deep east under the boards.
  m.box(-9.5, 0, 0, 7.0, 0.55, 14, '#8ec9d4', { tag: 'poolShallow', rough: 0.25 });
  m.box(-2.5, 0, 0, 7.0, 0.3, 14, '#84c3d0', { tag: 'poolMid', rough: 0.25 });
  for (let i = 0; i < 5; i++) {
    m.box(0, 0.02, -4.67 + i * 2.334, 25.6, 0.03, 0.28, NAVY, { solid: false, tag: 'laneLine' });
  }
  // Basin wall tiling. Small patches so a swimmer always has aqua to sample.
  for (let i = 0; i < 22; i++) {
    const edge = m.irange(0, 3);
    const t = m.range(-0.85, 0.85);
    const c = m.pick([AQUA, AQUA_DK, DEEP, TILE]);
    if (edge < 2) {
      m.box(t * 12.4, m.range(0.2, 1.1), (edge ? 1 : -1) * 6.88, m.range(1.2, 3.0), m.range(0.3, 0.7), 0.08,
        c, { solid: false, jitter: 0.12, tag: 'poolTile' });
    } else {
      m.box((edge === 2 ? -1 : 1) * 12.88, m.range(0.2, 1.1), t * 6.6, 0.08, m.range(0.3, 0.7), m.range(1.2, 3.0),
        c, { solid: false, jitter: 0.12, tag: 'poolTile' });
    }
  }

  // Water. Non-solid and non-occluding: wade straight through it.
  m.box(0, 0, 0, 26, 1.35, 14, WATER, { solid: false, opaque: false, rough: 0.08, tag: 'water' });
  // Surface patches, spread so every swimmer has water colour within reach of
  // the blend sampler (which only sees a decorative prop's centre).
  for (let i = 0; i < 18; i++) {
    const px = -11.5 + (i % 6) * 4.6;
    const pz = -5 + Math.floor(i / 6) * 5;
    m.box(px + m.range(-0.6, 0.6), 1.24, pz + m.range(-0.6, 0.6), m.range(3.2, 4.6), 0.1, m.range(3.0, 4.2),
      m.pick([WATER, AQUA, '#5fc0d8']), { solid: false, opaque: false, jitter: 0.1, emis: 0.12, tag: 'waterSurface' });
  }

  // Steps down into the shallow end.
  for (const sz of [-3.5, 3.5]) {
    m.stairs(-11.4, sz, 2.4, 3, (DECK - 0.55) / 3, 0.5, TILE, { yaw: -90, y: 0.55 });
  }
  // Deep-end grab ladders.
  for (const lz of [-4.5, 4.5]) {
    for (const s of [-1, 1]) {
      m.cyl(12.7, DECK, lz + s * 0.22, 0.045, 0.9, STEEL, { tag: 'ladderRail', metal: 0.6 });
    }
    m.box(12.7, DECK + 0.9, lz, 0.1, 0.09, 0.5, STEEL, { solid: false });
  }

  m.spot(-10.5, 0.55, -5.4, { stance: 'prone', quality: 0.68, hint: 'Flat on the shallow-end floor' });
  m.spot(11.4, 0, 5.4, { stance: 'prone', quality: 0.72, hint: 'Down in the deep-end corner' });
  m.spot(-1.2, 0.3, -6.1, { stance: 'crouch', quality: 0.62, hint: 'Against the basin wall, mid-pool' });
  m.spot(7.0, 0, -6.1, { stance: 'crouch', quality: 0.66, hint: 'In the water along the north wall' });

  // --------------------------------------------------------- lanes and blocks --
  for (let i = 0; i < 5; i++) {
    const lz = -4.67 + i * 2.334;
    m.box(0, 1.26, lz, 25.6, 0.05, 0.05, TILE, { solid: false, tag: 'laneRope' });
    for (let k = 0; k < 9; k++) {
      m.cyl(-11.6 + k * 2.9, 1.22, lz, 0.1, 0.11, k % 2 ? LANE_R : LANE_Y,
        { solid: false, jitter: 0.1, tag: 'laneFloat' });
    }
  }
  for (let i = 0; i < 6; i++) {
    const bz = -5.25 + i * 2.1;
    m.box(-13.75, DECK, bz, 0.65, 0.52, 0.65, TILE, { tag: 'startBlock' });
    m.box(-13.72, DECK + 0.52, bz, 0.7, 0.08, 0.7, NAVY, { tag: 'startTop', yaw: 6 });
    m.box(-14.0, DECK + 0.6, bz, 0.12, 0.34, 0.12, STEEL, { solid: false, tag: 'startBar' });
    m.box(-14.06, DECK + 0.2, bz, 0.05, 0.22, 0.3, m.pick([LANE_R, LANE_Y, ORANGE]),
      { solid: false, tag: 'laneNumber' });
  }
  m.spot(-14.6, DECK, -1.05, { stance: 'crouch', quality: 0.6, hint: 'Behind the starting blocks' });
  // Backstroke flag lines: the brightest thing hanging over the water.
  for (const fx of [-8, 8]) {
    m.box(fx, 3.4, 0, 0.05, 0.05, 14.4, TILE, { solid: false, tag: 'flagLine' });
    for (let i = 0; i < 9; i++) {
      m.box(fx, 3.12, -6.4 + i * 1.6, 0.04, 0.3, 0.26,
        m.pick([LANE_R, LANE_Y, AQUA, NAVY, ORANGE]), { solid: false, tag: 'flag' });
    }
  }

  // -------------------------------------------------------------- dive tower --
  const DIVE3 = 4.8, DIVE5 = 6.8;
  for (const [cx, cz] of [[15.7, -1.7], [15.7, 1.7], [20.3, -1.7], [20.3, 1.7]]) {
    m.box(cx, DECK, cz, 0.42, DIVE5 - DECK, 0.42, CONC, { tag: 'towerColumn' });
  }
  m.box(18.0, DIVE3 - 0.2, 0, 5.2, 0.2, 4.4, CONC, { tag: 'diveDeck3' });
  m.box(16.2, DIVE5 - 0.2, 0, 3.4, 0.2, 3.0, CONC, { tag: 'diveDeck5' });
  m.stairs(25.0, 0, 1.8, 11, 0.3, 0.4, CONC, { yaw: -90, y: DECK });
  m.stairs(20.6, 0, 1.4, 7, 2 / 7, 0.4, CONC, { yaw: -90, y: DIVE3 });
  // Boards reaching out over the deep end.
  m.box(12.4, DIVE3 - 0.12, 0, 6.4, 0.12, 0.72, TILE, { tag: 'board3' });
  m.box(12.2, DIVE5 - 0.12, 0, 5.0, 0.12, 1.7, TILE, { tag: 'platform5' });
  m.box(11.0, DIVE3, 0, 1.4, 0.06, 0.8, '#4a5158', { solid: false, tag: 'boardGrip' });
  m.box(10.4, DIVE5, 0, 1.4, 0.06, 1.7, '#4a5158', { solid: false, tag: 'platformGrip' });
  // Railings, and the springboard down at deck level.
  for (const [rx, rz, rw, rd, ry] of [[18.0, -2.1, 5.2, 0.1, DIVE3], [18.0, 2.1, 5.2, 0.1, DIVE3],
    [20.5, 0, 0.1, 4.2, DIVE3], [16.2, -1.4, 3.4, 0.1, DIVE5], [16.2, 1.4, 3.4, 0.1, DIVE5],
    [17.75, 0, 0.1, 2.8, DIVE5]]) {
    m.box(rx, ry, rz, rw, 1.05, rd, STEEL, { opaque: false, tag: 'diveRail' });
  }
  m.box(14.4, DECK, -5.4, 1.0, 0.95, 1.0, CONC, { tag: 'springStand' });
  m.box(12.6, DECK + 0.95, -5.4, 4.4, 0.1, 0.62, TILE, { tag: 'springboard' });
  m.box(14.9, DECK + 0.95, -5.4, 0.5, 0.3, 0.7, STEEL, { solid: false, tag: 'fulcrum' });

  m.spot(18.0, DECK, 0, { stance: 'crouch', quality: 0.8, hint: 'Under the dive tower, between the columns' });
  m.spot(19.4, DIVE3, 1.5, { stance: 'prone', quality: 0.66, hint: 'Flat on the three-metre deck' });
  m.spot(15.6, DIVE5, 0, { stance: 'prone', quality: 0.72, hint: 'Flat on the five-metre platform' });
  m.spot(22.6, DECK, 1.6, { stance: 'crouch', quality: 0.74, hint: 'Tucked beside the tower stair' });

  // --------------------------------------------------------------- bleachers --
  for (let i = 0; i < 5; i++) {
    const bz = 12.6 + i * 1.1;
    m.box(-7, DECK, bz, 26, 0.42 * (i + 1), 1.1, CONC, { tag: 'bleacher' });
    m.box(-7, DECK + 0.42 * (i + 1), bz - 0.06, 25.6, 0.08, 0.7, WOOD, { solid: false, tag: 'bleacherSeat' });
  }
  m.box(-7, DECK, 19.2, 26.8, 3.4, 0.4, TILE, { tag: 'bleacherBack' });
  for (const s of [-1, 1]) {
    m.box(-7 + s * 13.2, DECK, 15.9, 0.4, 2.6, 7.0, TILE, { tag: 'bleacherEnd' });
  }
  m.spot(-7, DECK, 18.4, { stance: 'crouch', quality: 0.86, hint: 'In the dead gap behind the bleachers' });
  m.spot(-16, DECK + 2.1, 17.0, { stance: 'prone', quality: 0.6, hint: 'Flat on the top bleacher row' });
  m.spot(7.4, DECK, 16.2, { stance: 'crouch', quality: 0.7, hint: 'Round the end of the stand' });

  // ------------------------------------------------------- changing and store --
  const LOCKER_C = ['#5a8fa0', '#4a7f92', '#6a9aa8', '#3f7285'];
  for (let i = 0; i < 4; i++) {
    m.locker(-23.0, -17.2 + i * 1.2, 1.1, 2.0, 0.9, LOCKER_C[i], { y: DECK, yaw: 0 });
  }
  for (let i = 0; i < 4; i++) {
    m.locker(-17.4, -17.2 + i * 1.2, 1.1, 2.0, 0.9, LOCKER_C[(i + 2) % 4], { y: DECK, yaw: 180 });
  }
  m.box(-20.2, DECK, -14.6, 4.6, 0.45, 0.5, WOOD, { tag: 'changeBench' });
  for (const s of [-1, 1]) m.box(-20.2 + s * 2.0, DECK, -14.6, 0.14, 0.45, 0.45, STEEL, { tag: 'benchLeg' });
  m.spot(-20.2, DECK + 0.45, -14.6, { stance: 'prone', quality: 0.62, hint: 'Flat on the changing bench' });

  const cubicle = (x, z, yaw) => {
    const a = yaw * DEG;
    const fx = -Math.sin(a), fz = Math.cos(a);
    const rx = Math.cos(a), rz = Math.sin(a);
    m.box(x - fx * 0.86, DECK, z - fz * 0.86, 1.7, 2.1, 0.12, TILE, { yaw, tag: 'cubicle' });
    for (const s of [-1, 1]) {
      m.box(x + rx * s * 0.79, DECK, z + rz * s * 0.79, 0.12, 2.1, 1.8, TILE, { yaw, tag: 'cubicle' });
    }
    m.box(x + fx * 0.86, DECK, z + fz * 0.86, 1.7, 2.0, 0.07,
      m.pick([AQUA, NAVY, LANE_R, AQUA_DK]), { yaw, solid: false, tag: 'curtain' });
    m.spot(x, DECK, z, { stance: 'stand', quality: 0.82, hint: 'Behind a changing-cubicle curtain' });
  };
  for (let i = 0; i < 4; i++) cubicle(-23.2, 9.5 + i * 2.0, 90);
  cubicle(-22.0, 18.0, 180);

  // Showers along the west wall.
  for (let i = 0; i < 4; i++) {
    const sz = -6.0 + i * 3.2;
    m.cyl(-24.6, DECK, sz, 0.06, 2.2, STEEL, { tag: 'showerPipe' });
    m.box(-24.1, DECK + 2.1, sz, 1.0, 0.09, 0.24, STEEL, { solid: false, tag: 'showerArm' });
    m.cyl(-23.7, DECK + 1.95, sz, 0.13, 0.12, STEEL, { solid: false, tag: 'showerHead' });
  }
  m.box(-22.4, DECK, -1.2, 0.3, 2.3, 4.0, TILE, { tag: 'showerScreen' });
  m.spot(-23.4, DECK, -1.2, { stance: 'stand', quality: 0.72, hint: 'Behind the shower screen' });

  // Equipment store in the north-east corner of the deck.
  m.box(19.2, DECK, -15.6, 0.35, 3.4, 6.6, TILE, { tag: 'storeWall' });
  m.box(22.4, DECK, -12.5, 6.8, 3.4, 0.35, TILE, { tag: 'storeWall' });
  m.box(22.4, DECK, -18.7, 6.8, 3.4, 0.35, TILE, { tag: 'storeWall' });
  m.box(19.2, DECK + 2.2, -12.5, 3.2, 1.2, 0.35, TILE, { tag: 'storeLintel' });
  for (let i = 0; i < 7; i++) {
    m.box(m.range(20.4, 25.2), DECK + m.range(0, 1.2), m.range(-18.0, -13.4),
      m.range(0.5, 0.9), m.range(0.4, 0.8), m.range(0.5, 0.9),
      m.pick([ORANGE, LANE_R, AQUA, NAVY, LANE_Y]), { jitter: 0.16, yaw: m.range(0, 90), tag: 'poolKit' });
  }
  m.spot(24.6, DECK, -17.0, { stance: 'crouch', quality: 0.82, hint: 'Back of the equipment store' });

  // Kickboard racks and float bins.
  const rack = (x, z, yaw) => {
    m.box(x, DECK, z, 1.6, 1.5, 0.7, STEEL, { yaw, tag: 'kickRack' });
    for (let i = 0; i < 8; i++) {
      m.box(x + m.range(-0.6, 0.6), DECK + 0.2 + (i % 4) * 0.32, z + (i < 4 ? -0.16 : 0.16),
        0.5, 0.28, 0.08, m.pick([ORANGE, LANE_R, LANE_Y, AQUA]),
        { yaw, solid: false, jitter: 0.16, tag: 'kickboard' });
    }
  };
  rack(-9.0, -9.4, 0);
  rack(4.0, 9.4, 0);
  m.spot(-9.0, DECK, -10.2, { stance: 'crouch', quality: 0.76, hint: 'Behind the kickboard rack' });
  m.spot(4.0, DECK, 10.2, { stance: 'crouch', quality: 0.74, hint: 'Behind the far kickboard rack' });
  for (const [nx, nz] of [[-4.5, -9.6], [9.5, 9.6]]) {
    m.cyl(nx, DECK, nz, 0.55, 0.8, AQUA_DK, { tag: 'floatBin' });
    for (let i = 0; i < 5; i++) {
      m.cyl(nx + m.range(-0.3, 0.3), DECK + 0.6 + i * 0.16, nz + m.range(-0.3, 0.3), 0.14, 0.5,
        m.pick([ORANGE, LANE_Y, LANE_R]), { solid: false, jitter: 0.18, yaw: m.range(0, 90), tag: 'noodle' });
    }
  }

  // Lifeguard chairs.
  const guardChair = (x, z, yaw) => {
    const a = yaw * DEG;
    for (const s of [-1, 1]) {
      m.box(x + Math.cos(a) * s * 0.5, DECK, z + Math.sin(a) * s * 0.5, 0.12, 2.1, 0.12, STEEL, { tag: 'chairLeg' });
      m.box(x + Math.cos(a) * s * 0.5 - Math.sin(a) * 0.5, DECK, z + Math.sin(a) * s * 0.5 + Math.cos(a) * 0.5,
        0.12, 2.1, 0.12, STEEL, { tag: 'chairLeg' });
    }
    m.box(x, DECK + 2.1, z, 1.2, 0.1, 1.1, TILE, { tag: 'chairSeat' });
    m.box(x + Math.sin(a) * 0.5, DECK + 2.2, z - Math.cos(a) * 0.5, 1.2, 0.8, 0.1, TILE, { yaw, tag: 'chairBack' });
    for (let i = 0; i < 3; i++) {
      m.box(x, DECK + 0.5 + i * 0.55, z + Math.cos(a) * 0.5, 1.0, 0.07, 0.07, STEEL, { yaw, solid: false, tag: 'rung' });
    }
    m.cyl(x + 0.7, DECK, z, 0.36, 0.06, LANE_R, { solid: false, tag: 'ring' });
  };
  guardChair(-6.5, -8.6, 0);
  guardChair(6.5, 8.6, 180);
  m.spot(-6.5, DECK, -8.6, { stance: 'crouch', quality: 0.7, hint: 'Under the lifeguard chair' });
  m.spot(6.5, DECK, 8.6, { stance: 'crouch', quality: 0.68, hint: 'Under the far lifeguard chair' });

  // Poolside benches and bins.
  for (const [bx, bz, byaw] of [[-18, 4.5, 90], [-18, -4.5, 90], [15, 10.5, 0], [-2, -10.4, 0], [10, -10.4, 0]]) {
    const a = byaw * DEG;
    m.box(bx, DECK + 0.42, bz, 2.2, 0.12, 0.5, WOOD, { yaw: byaw, tag: 'bench' });
    for (const s of [-1, 1]) {
      m.box(bx + Math.cos(a) * s * 0.9, DECK, bz + Math.sin(a) * s * 0.9, 0.14, 0.42, 0.45, STEEL,
        { yaw: byaw, tag: 'benchLeg' });
    }
  }
  for (const [bx, bz] of [[-15.4, -10.6], [16.4, 6.4], [-8, 10.6]]) {
    m.cyl(bx, DECK, bz, 0.32, 0.9, AQUA_DK, { tag: 'bin' });
    m.cyl(bx, DECK + 0.9, bz, 0.35, 0.08, STEEL, { solid: false });
  }

  // ------------------------------------------------------------- wall detail --
  for (const [wx, wz, ww, wd] of [[0, -19.8, 52, 0.25], [0, 19.8, 52, 0.25], [-25.8, 0, 0.25, 40], [25.8, 0, 0.25, 40]]) {
    m.box(wx, DECK, wz, ww, 1.3, wd, AQUA, { solid: false, tag: 'dado' });
    m.box(wx, DECK + 1.3, wz, ww, 2.6, wd, TILE, { solid: false, tag: 'wallTile' });
  }
  for (let i = 0; i < 24; i++) {
    const side = m.irange(0, 3);
    const t = m.range(-0.9, 0.9);
    const c = m.pick([AQUA, AQUA_DK, DEEP, TILE_DK]);
    if (side < 2) {
      m.box(t * 24, DECK + m.range(0.2, 3.4), (side ? 1 : -1) * 19.7, m.range(1.2, 3.4), m.range(0.4, 0.9), 0.08,
        c, { solid: false, jitter: 0.14, tag: 'tilePatch' });
    } else {
      m.box((side === 2 ? -1 : 1) * 25.7, DECK + m.range(0.2, 3.4), t * 18, 0.08, m.range(0.4, 0.9), m.range(1.2, 3.4),
        c, { solid: false, jitter: 0.14, tag: 'tilePatch' });
    }
  }
  for (let i = 0; i < 6; i++) {
    m.box(-11 + i * 4.5, DECK - 0.12, -7.35, 0.6, 0.22, 0.05, NAVY, { solid: false, tag: 'depthMark' });
    m.box(-11 + i * 4.5, DECK - 0.12, 7.35, 0.6, 0.22, 0.05, NAVY, { solid: false, tag: 'depthMark' });
  }
  m.box(0, 6.2, -19.7, 1.4, 1.4, 0.1, TILE, { solid: false, tag: 'clock' });
  m.box(0, 6.86, -19.62, 0.1, 0.5, 0.05, NAVY, { solid: false, tag: 'clockHand' });
  m.box(-14, 5.4, -19.7, 6.0, 1.2, 0.1, AQUA_DK, { solid: false, emis: 0.25, tag: 'scoreboard' });

  // ---------------------------------------------------------- roof and light --
  for (const tx of [-18, -9, 0, 9, 18]) {
    m.box(tx, CEIL - 0.5, 0, 0.5, 0.5, 39, STEEL, { solid: false, tag: 'truss' });
  }
  for (const [kx, kz, kw, kd] of [[-11, 0, 8, 10], [0, 0, 8, 10], [11, 0, 8, 10], [-6, 13, 10, 8]]) {
    m.box(kx, CEIL - 0.2, kz, kw, 0.12, kd, '#ffffff', { solid: false, emis: 2.4, tag: 'skylight' });
    for (const o of [-1, 1]) {
      m.box(kx + o * kw / 4, CEIL - 0.26, kz, 0.14, 0.14, kd, TILE_DK, { solid: false });
      m.box(kx, CEIL - 0.26, kz + o * kd / 4, kw, 0.14, 0.14, TILE_DK, { solid: false });
    }
  }
  m.light(-11, 8.6, 0, '#ffffff', 1.15, 26);
  m.light(0, 8.6, 0, '#ffffff', 1.15, 26);
  m.light(11, 8.6, 0, '#ffffff', 1.1, 24);
  m.light(-6, 8.6, 13, '#f6fbff', 1.0, 22);
  m.light(-20, 5.5, -12, '#e8f4f8', 0.6, 15);
  m.light(-20, 5.5, 12, '#e8f4f8', 0.6, 15);
  m.light(20, 5.5, -14, '#e8f4f8', 0.55, 14);
  m.light(20, 5.5, 12, '#e8f4f8', 0.55, 14);
  m.light(0, 5.5, -15, '#e8f4f8', 0.6, 16);
  m.light(8, 5.5, 16, '#e8f4f8', 0.55, 15);
  m.light(-7, 0.9, 0, '#5fd6e8', 0.55, 12);
  m.light(8, 0.7, 0, '#4fc4e0', 0.55, 12);
  m.light(17, 7.4, 0, '#f2fafd', 0.6, 12);
  m.light(-23, 3.2, 12, '#e8f4f8', 0.5, 12);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-21.5, -11.0, DECK);
  m.spawnHider(-20.5, 2.0, DECK);
  m.spawnHider(-20.0, 13.5, DECK);
  m.spawnHider(-10.0, -11.0, DECK);
  m.spawnHider(2.0, -11.4, DECK);
  m.spawnHider(11.0, 11.0, DECK);
  m.spawnHider(-6.0, 0.55, 0);
  m.spawnHider(6.5, 0, 0);
  m.spawnHider(-11.5, 4.5, 0.55);
  m.spawnHider(17.8, -4.6, DECK);
  m.spawnHider(23.0, 8.0, DECK);
  m.spawnHider(19.4, 1.5, DIVE3);
  m.spawnSeeker(-24.0, -3.0, DECK);
  m.spawnSeeker(-24.0, -6.5, DECK);
  m.spawnSeeker(-24.6, 0.5, DECK);
  m.spawnSeeker(-21.6, -4.8, DECK);
  m.lobbySpawn(-23.4, -3.6, DECK);

  m.palette([TILE, TILE_DK, AQUA, AQUA_DK, DEEP, WATER, CONC, CONC_DK,
    STEEL, LANE_R, LANE_Y, WOOD, NAVY, ORANGE]);
  return m.finish();
}
