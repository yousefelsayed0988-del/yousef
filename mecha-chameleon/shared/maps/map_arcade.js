// Arcade - the room has almost no ambient light of its own. Everything you can
// see is a screen, a marquee or a neon strip, which means the light is coloured,
// local and constantly wrong for whatever paint you picked. The trick here is
// not blending, it is standing still in the gap between two cabinet backs.

import { createMap } from './kit.js';

export const meta = {
  id: 'arcade',
  name: 'Arcade',
  theme: 'neon arcade',
  tagline: 'Lit entirely by its own machines. Paint barely helps. Stillness does.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [46, 34],
    ceiling: 4.6,
    sky: '#05050c',
    ambient: '#12101f',
    sunDir: [-0.2, -0.94, -0.28],
    sunColor: '#404a80',
    sunIntensity: 0.06,
    fog: '#07060f',
    fogDensity: 0.028,
    exposure: 1.15,
  });

  const CARPET = '#1b1440';
  const CARPET2 = '#2c1c62';
  const BODY = '#171a22';
  const BODY2 = '#252a34';
  const METAL = '#3a3f48';
  const WALL = '#141826';
  const MAGENTA = '#e0399b';
  const CYAN = '#2ad6e8';
  const LIME = '#8ee02a';
  const AMBER = '#f2a52a';
  const RED = '#e8452f';
  const VIOLET = '#7a3fd6';

  const NEON = [MAGENTA, CYAN, LIME, AMBER, RED, VIOLET];
  const CEIL = 4.6;

  // ------------------------------------------------------------------ shell --
  m.perimeter(9, '#08070f');
  m.floor(0, 0, 46, 34, CARPET);
  m.ceil(0, 0, 46, 34, '#0b0a14', CEIL);
  m.room({ x: 0, z: 0, w: 44, d: 32, h: CEIL, floor: CARPET, wall: WALL });

  // Patterned carpet: a swirl of neon shapes on a black-light ground. Purely
  // visual, but it is the only large surface a floor-hugging hider can match.
  m.rug(0, 0, 43, 31, CARPET2);
  for (let i = 0; i < 46; i++) {
    const x = m.range(-20.5, 20.5), z = m.range(-14.5, 14.5);
    const k = m.irange(0, 2);
    const c = m.pick(NEON);
    if (k === 0) m.box(x, 0.012, z, m.range(1.2, 3.4), 0.012, m.range(0.3, 0.7), c, { solid: false, yaw: m.range(0, 180), jitter: 0.18, tag: 'carpet' });
    else if (k === 1) m.cyl(x, 0.012, z, m.range(0.4, 1.1), 0.012, c, { solid: false, jitter: 0.18, tag: 'carpet' });
    else m.box(x, 0.012, z, m.range(0.6, 1.4), 0.012, m.range(0.6, 1.4), c, { solid: false, yaw: m.range(0, 90), jitter: 0.18, tag: 'carpet' });
  }

  // ---------------------------------------------------------------- cabinets --
  /** Body, glowing screen, marquee and a stripe of side art down each flank. */
  const SCREEN_C = ['#2ad6e8', '#e0399b', '#8ee02a', '#f2a52a', '#e8452f', '#7a3fd6', '#4a7cf0'];
  const cabinet = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    const fx = -Math.sin(a), fz = -Math.cos(a);   // the face the player looks at
    const rx = Math.cos(a), rz = Math.sin(a);     // along the cabinet's width
    const art = m.pick(NEON), glow = m.pick(SCREEN_C);
    m.box(x, 0, z, 0.78, 1.72, 0.86, m.chance(0.5) ? BODY : BODY2, { yaw, tag: 'cabinet', jitter: 0.1 });
    m.box(x + fx * 0.42, 1.02, z + fz * 0.42, 0.6, 0.5, 0.06, glow,
      { yaw, solid: false, emis: m.range(1.8, 3.2), rough: 0.2, tag: 'screen' });
    m.box(x + fx * 0.4, 1.72, z + fz * 0.4, 0.74, 0.34, 0.12, art,
      { yaw, solid: false, emis: m.range(1.4, 2.4), tag: 'marquee' });
    for (const s of [-1, 1]) {
      m.box(x + rx * s * 0.4, 0.15, z + rz * s * 0.4, 0.05, 1.35, 0.72, art,
        { yaw, solid: false, emis: 0.35, jitter: 0.14, tag: 'sideart' });
    }
  };

  // Central island: two banks back to back with a 0.95 m slot between them.
  for (let i = 0; i < 10; i++) {
    const x = -6.3 + i * 1.4;
    cabinet(x, -0.9, 0);
    cabinet(x, 0.9, 180);
  }
  m.spot(0, 0, 0, { stance: 'stand', quality: 0.88, hint: 'In the slot between the cabinet backs' });
  m.spot(-5.6, 0, 0, { stance: 'crouch', quality: 0.84, hint: 'Deep in the cabinet slot' });
  m.spot(7.6, 0, -0.9, { stance: 'crouch', quality: 0.62, hint: 'At the end of the machine row' });

  // West wall bank, facing the room.
  for (let i = 0; i < 8; i++) cabinet(-20.6, -10.5 + i * 3, 90);
  m.spot(-20.6, 0, -12.4, { stance: 'crouch', quality: 0.7, hint: 'Squeezed beside the west row' });
  m.spot(-20.6, 0, 12.4, { stance: 'crouch', quality: 0.68, hint: 'End of the west row' });
  // North wall bank.
  for (let i = 0; i < 6; i++) cabinet(-12 + i * 3, -14.6, 180);
  m.spot(-13.7, 0, -14.6, { stance: 'crouch', quality: 0.72, hint: 'Between the wall and the north bank' });

  // ---------------------------------------------------------------- tables --
  const poolTable = (x, z, yaw) => {
    m.box(x, 0.5, z, 2.8, 0.28, 1.6, '#2f6b3f', { yaw, tag: 'felt', rough: 0.95 });
    m.box(x, 0.5, z, 3.0, 0.36, 1.8, '#3a2418', { yaw, tag: 'rail' });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        m.box(x + sx * 1.2, 0, z + sz * 0.6, 0.22, 0.5, 0.22, '#3a2418', { yaw });
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 1.7;
      m.sphere(x + Math.cos(a) * 0.7, 0.86, z + Math.sin(a) * 0.4, 0.075,
        m.pick([AMBER, RED, VIOLET, CYAN, LIME, '#e8e4d8']), { solid: false, rough: 0.25 });
    }
    m.box(x, 0.9, z, 3.0, 0.05, 0.05, '#6d5238', { yaw: yaw + 12, solid: false });
    m.spot(x, 0, z, { stance: 'prone', quality: 0.82, hint: 'Flat under the pool table' });
  };
  poolTable(15.4, -9.5, 0);
  poolTable(15.4, -3.4, 0);
  m.box(15.4, 3.2, -6.4, 2.6, 0.12, 2.6, '#e8e4d8', { solid: false, emis: 1.1 });
  m.light(15.4, 3.0, -6.4, '#fff0c8', 0.9, 9);

  const airHockey = (x, z, yaw) => {
    m.box(x, 0.55, z, 2.6, 0.16, 1.5, '#0e2a3a', { yaw, tag: 'ice', emis: 0.5, rough: 0.15 });
    m.box(x, 0.55, z, 2.8, 0.34, 1.7, CYAN, { yaw, solid: false, emis: 0.9 });
    m.box(x, 0, z, 2.7, 0.55, 1.6, BODY, { yaw, tag: 'table', jitter: 0.08 });
    for (const s of [-1, 1]) {
      m.cyl(x + s * 0.8, 0.71, z, 0.14, 0.09, m.pick([MAGENTA, LIME]), { solid: false, emis: 0.8 });
      m.box(x + s * 1.5, 0.9, z, 0.24, 0.55, 0.5, BODY2, { yaw, jitter: 0.1 });
      m.box(x + s * 1.5, 1.45, z, 0.3, 0.22, 0.3, m.pick(NEON), { yaw, solid: false, emis: 1.8 });
    }
  };
  airHockey(-14.8, 7.2, 0);
  airHockey(-14.8, 12.0, 0);
  m.spot(-14.8, 0, 9.6, { stance: 'crouch', quality: 0.74, hint: 'Between the air hockey tables' });

  // -------------------------------------------------------------- prize wall --
  // Counter across the south-east corner with a wall of plush behind it.
  m.box(12.6, 0, 13.4, 15.0, 1.1, 0.9, BODY2, { tag: 'counter', jitter: 0.06 });
  m.box(12.6, 1.1, 13.4, 15.2, 0.12, 1.1, METAL, { solid: false });
  m.box(12.6, 0.26, 13.4, 15.2, 0.16, 1.0, MAGENTA, { solid: false, emis: 1.6 });
  m.box(12.6, 0.7, 13.4, 15.2, 0.14, 1.0, CYAN, { solid: false, emis: 1.4 });
  m.box(18.4, 1.1, 13.4, 0.7, 0.45, 0.6, BODY, { tag: 'till' });
  m.box(18.4, 1.55, 13.4, 0.5, 0.2, 0.4, LIME, { solid: false, emis: 1.9 });
  m.spot(12.6, 0, 14.6, { stance: 'crouch', quality: 0.86, hint: 'Ducked behind the prize counter' });

  for (let i = 0; i < 4; i++) {
    m.shelf(7.4 + i * 3.6, 15.4, 3.4, 2.6, 0.55, BODY, { yaw: 180, levels: 5, spot: i !== 2 });
  }
  const PLUSH = [MAGENTA, CYAN, LIME, AMBER, RED, VIOLET, '#f06a9a', '#5ce0b0'];
  for (let i = 0; i < 44; i++) {
    m.sphere(m.range(6.0, 20.6), 0.3 + m.irange(0, 4) * 0.52, m.range(15.05, 15.35),
      m.range(0.15, 0.27), m.pick(PLUSH), { solid: false, rough: 0.95, jitter: 0.12, tag: 'plush' });
  }
  m.box(12.6, 2.9, 15.5, 15.4, 0.7, 0.2, VIOLET, { solid: false, emis: 2.1, tag: 'sign' });
  m.light(12.6, 2.6, 14.4, '#c85ae0', 0.85, 12);

  // --------------------------------------------------------------- claw row --
  const clawMachine = (x, z, yaw, c) => {
    m.box(x, 0, z, 1.15, 0.95, 1.15, BODY, { yaw, tag: 'claw', jitter: 0.08 });
    m.box(x, 0.95, z, 1.1, 1.3, 1.1, '#9fd8e8',
      { yaw, opaque: false, rough: 0.06, metal: 0.2, tag: 'clawGlass' });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399963;
      const r = 0.34 * Math.sqrt(i / 9);
      m.sphere(x + Math.cos(a) * r, 1.05 + (i % 3) * 0.17, z + Math.sin(a) * r,
        m.range(0.12, 0.19), m.pick(PLUSH), { solid: false, rough: 0.95, jitter: 0.12 });
    }
    m.box(x, 2.25, z, 1.2, 0.42, 1.2, c, { yaw, solid: false, emis: 2.4, tag: 'clawTop' });
    m.box(x, 1.9, z, 0.16, 0.3, 0.16, METAL, { solid: false });
  };
  clawMachine(-2.6, 13.6, 0, MAGENTA);
  clawMachine(-0.9, 13.6, 0, CYAN);
  clawMachine(0.8, 13.6, 0, AMBER);
  m.spot(-1.8, 0, 14.8, { stance: 'crouch', quality: 0.8, hint: 'Behind the claw machines' });
  m.light(-0.9, 2.7, 13.6, '#e05ab0', 0.7, 8);

  // ------------------------------------------------------------- photo booth --
  m.locker(-19.4, -13.0, 1.7, 2.35, 1.7, BODY2, { yaw: 180, spot: false });
  m.box(-19.4, 0, -13.85, 1.7, 2.35, 0.12, VIOLET, { solid: false, emis: 0.7, tag: 'boothSide' });
  m.box(-19.4, 0.9, -12.25, 1.5, 1.45, 0.1, '#2a1a44', { solid: false, tag: 'curtain' });
  m.box(-19.4, 2.35, -13.0, 1.9, 0.36, 1.9, MAGENTA, { solid: false, emis: 2.2 });
  m.box(-19.4, 1.5, -13.5, 0.9, 0.4, 0.08, '#fff6d8', { solid: false, emis: 1.2 });
  m.box(-19.4, 0.35, -13.5, 1.2, 0.12, 0.5, BODY, { solid: false });
  m.spot(-19.4, 0, -13.0, { stance: 'stand', quality: 0.91, hint: 'Sitting inside the photo booth' });
  m.light(-19.4, 2.1, -13.0, '#d05ae0', 0.55, 7);

  // ------------------------------------------------------------ skee-ball row --
  for (let i = 0; i < 3; i++) {
    const z = -13.6 + i * 2.1;
    m.box(15.5, 0, z, 6.4, 0.5, 1.5, BODY2, { tag: 'lane', jitter: 0.07 });
    m.box(15.5, 0.5, z, 6.0, 0.09, 1.2, '#5a4a34', { solid: false });
    m.box(19.4, 0, z, 1.4, 2.2, 1.5, BODY, { tag: 'laneHead', jitter: 0.07 });
    m.box(19.0, 1.0, z, 0.6, 1.0, 1.3, m.pick(NEON), { solid: false, emis: 1.6 });
    m.box(19.4, 2.2, z, 1.6, 0.34, 1.6, m.pick(NEON), { solid: false, emis: 2.0 });
    for (let b = 0; b < 3; b++) {
      m.sphere(13.2 + b * 0.5, 0.68, z + (b - 1) * 0.3, 0.11, '#d8cfa8', { solid: false });
    }
  }
  m.spot(12.4, 0, -11.5, { stance: 'prone', quality: 0.76, hint: 'Flat at the foot of the skee-ball lanes' });

  // -------------------------------------------------------------- dance pad --
  m.box(-15.0, 0.32, -6.4, 2.8, 0.14, 2.8, BODY2, { tag: 'pad' });
  for (const [ox, oz] of [[-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85]]) {
    m.box(-15.0 + ox, 0.46, -6.4 + oz, 0.7, 0.05, 0.7, m.pick(NEON), { solid: false, emis: 2.0 });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.box(-15.0 + sx * 1.25, 0, -6.4 + sz * 1.25, 0.24, 0.32, 0.24, METAL);
  }
  m.box(-15.0, 0, -8.4, 3.2, 2.6, 0.8, BODY, { tag: 'padRig', jitter: 0.08 });
  m.box(-15.0, 1.1, -8.0, 2.4, 1.2, 0.1, '#1a4a8c', { solid: false, emis: 2.2, tag: 'screen' });
  m.box(-15.0, 2.6, -8.4, 3.6, 0.4, 1.0, LIME, { solid: false, emis: 2.2 });
  for (const s of [-1, 1]) m.cyl(-15.0 + s * 1.9, 0, -7.4, 0.16, 2.4, m.pick([MAGENTA, CYAN]), { solid: false, emis: 1.3 });
  m.spot(-15.0, 0, -7.4, { stance: 'prone', quality: 0.7, hint: 'Behind the dance machine rig' });

  // ------------------------------------------------------- change and stools --
  for (const [cx, cz, cyaw] of [[-8.6, 14.6, 0], [8.0, -14.6, 180], [21.2, 8.0, 90]]) {
    m.box(cx, 0, cz, 0.9, 1.6, 0.7, BODY2, { yaw: cyaw, tag: 'changer', jitter: 0.08 });
    m.box(cx, 1.6, cz, 1.0, 0.28, 0.8, AMBER, { yaw: cyaw, solid: false, emis: 2.0 });
    m.box(cx, 0.8, cz, 0.5, 0.3, 0.06, CYAN, { yaw: cyaw, solid: false, emis: 1.4 });
  }
  m.spot(-9.8, 0, 14.6, { stance: 'crouch', quality: 0.66, hint: 'Beside the change machine' });
  for (const [sx, sz] of [[-9.6, 4.2], [-8.4, 5.0], [4.4, 5.6], [5.6, 4.6], [-3.2, -5.4],
    [-2.0, -6.2], [9.4, 6.4], [10.6, 5.4]]) {
    m.cyl(sx, 0, sz, 0.16, 0.62, METAL);
    m.cyl(sx, 0.62, sz, 0.3, 0.12, m.pick([RED, VIOLET, BODY]), { jitter: 0.12 });
  }
  m.box(-6.6, 0, 8.6, 2.4, 0.9, 1.2, BODY2, { tag: 'seat', jitter: 0.08 });
  m.box(-6.6, 0.9, 8.6, 2.4, 0.14, 1.2, VIOLET, { solid: false, emis: 0.7 });
  m.spot(-6.6, 0, 9.6, { stance: 'crouch', quality: 0.6, hint: 'Behind the seating block' });

  // Stacked spare cabinets in the unlit south-west corner - the darkest spot
  // on the map, and the only one with no screen glow anywhere near it.
  m.crateStack(-19.6, 11.4, BODY, 3, 1.15, { spot: false });
  m.crateStack(-18.2, 13.6, BODY2, 2, 1.25, { spot: false });
  m.box(-20.8, 0, 14.4, 1.4, 1.9, 1.0, BODY, { yaw: 14, tag: 'spare', jitter: 0.1 });
  m.spot(-19.6, 0, 13.2, { stance: 'crouch', quality: 0.9, hint: 'In the dead corner behind the spares' });
  m.spot(-21.0, 0, 9.4, { stance: 'stand', quality: 0.78, hint: 'Flat against the dark west wall' });

  // ------------------------------------------------------------- neon strips --
  for (let i = 0; i < 9; i++) {
    const x = -19.6 + i * 4.9;
    for (const s of [-1, 1]) {
      m.box(x, 2.9, s * 15.7, 4.2, 0.16, 0.1, NEON[i % NEON.length], { solid: false, emis: 2.6, tag: 'neon' });
      m.box(x, 0.22, s * 15.7, 4.2, 0.1, 0.1, NEON[(i + 3) % NEON.length], { solid: false, emis: 1.8, tag: 'neon' });
    }
  }
  for (let i = 0; i < 7; i++) {
    const z = -13.2 + i * 4.4;
    for (const s of [-1, 1]) {
      m.box(s * 21.7, 2.9, z, 0.1, 0.16, 3.8, NEON[(i + 2) % NEON.length], { solid: false, emis: 2.6, tag: 'neon' });
    }
  }
  for (const [nx, nz] of [[-21.6, -15.6], [21.6, -15.6], [-21.6, 15.6], [21.6, 15.6]]) {
    m.box(nx, 0.3, nz, 0.14, 3.6, 0.14, m.pick(NEON), { solid: false, emis: 2.4, tag: 'neon' });
  }
  // Ceiling truss with a few slow-swinging colour washes.
  for (let i = 0; i < 5; i++) {
    const x = -16 + i * 8;
    m.box(x, CEIL - 0.4, 0, 0.3, 0.28, 30, METAL, { solid: false, tag: 'truss' });
  }
  for (const [lx, lz, lc] of [[-16, -8, '#e0399b'], [-8, 6, '#2ad6e8'], [0, -8, '#8ee02a'],
    [8, 7, '#f2a52a'], [16, 0, '#7a3fd6'], [-4, 12, '#2ad6e8'], [4, -12, '#e0399b']]) {
    m.box(lx, CEIL - 0.62, lz, 0.5, 0.22, 0.5, lc, { solid: false, emis: 2.8 });
    m.light(lx, CEIL - 0.9, lz, lc, 0.65, 13);
  }
  m.light(0, 1.6, 0, '#5a3fd6', 0.35, 11);
  m.light(-14.8, 1.6, 9.6, '#2ad6e8', 0.45, 9);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-19.4, -13.0);
  m.spawnHider(-19.6, 13.2);
  m.spawnHider(-16.6, 0);
  m.spawnHider(-14.8, 9.6);
  m.spawnHider(0, 0);
  m.spawnHider(-4.5, -11.5);
  m.spawnHider(5.0, -11.0);
  m.spawnHider(11.6, -6.4);
  m.spawnHider(19.0, 3.0);
  m.spawnHider(12.6, 14.6);
  m.spawnHider(-1.8, 14.8);
  m.spawnHider(9.4, 9.4);
  m.spawnSeeker(-19.0, 3.4);
  m.spawnSeeker(-17.6, 1.6);
  m.spawnSeeker(-17.6, 5.2);
  m.spawnSeeker(-16.4, 3.4);
  m.lobbySpawn(-17.6, 3.4);

  m.palette([CARPET, CARPET2, BODY, BODY2, METAL, WALL, MAGENTA, CYAN, LIME, AMBER, RED, VIOLET]);
  return m.finish();
}
