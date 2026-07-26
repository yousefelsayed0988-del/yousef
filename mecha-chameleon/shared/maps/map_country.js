// A working barn that has been half converted into a farm shop. Stalls and a
// hay loft on the dark side, market crates and open floor on the sunlit side,
// with the big door at the south end doing all the lighting work.
//
// The cow and chicken standees are the point of the map: painted boards a
// cream-and-black hider can line up with and simply be one more of.

import { createMap } from './kit.js';

export const meta = {
  id: 'country',
  name: 'Indoor Country',
  theme: 'barn',
  tagline: 'Hay, teal paint and a tractor. Stand very still next to the cardboard cow.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [48, 36],
    ceiling: 7.0,
    sky: '#9fc4dd',
    ambient: '#5f5844',
    sunDir: [-0.16, -0.6, -0.78], // low and from the south, straight in the door
    sunColor: '#ffdfa8',
    sunIntensity: 0.95,
    fog: '#b7a888',
    fogDensity: 0.008,
  });

  const WOOD = '#8a5f3a';
  const WOOD_DK = '#5e3f26';
  const PLANK = '#a37a4c';
  const TEAL = '#2f7a72';
  const TEAL_DK = '#1f5a54';
  const HAY = '#c8a94e';
  const HAY_DK = '#a88a38';
  const GREEN = '#4a7a3a';
  const GREEN_LT = '#6a9a4a';
  const CREAM = '#e2d6b8';
  const RED = '#8a3a2e';
  const DIRT = '#6a5a44';
  const IRON = '#4a4d52';

  const H = 7.0;         // ridge height inside the barn
  const BARN_S = 12;     // the big door line
  const LOFT_Y = 3.4;
  const LOFT_Z = -9;     // south edge of the loft

  m.perimeter(10, WOOD_DK);
  m.floor(0, -3, 48, 30, PLANK);
  m.floor(0, 15, 48, 6, DIRT);
  m.ceil(0, -3, 48, 30, WOOD_DK, H);

  // ------------------------------------------------------------------ shell --
  m.box(0, 0, -17.7, 48, H, 0.6, WOOD, { tag: 'wall', jitter: 0.04 });
  m.box(-23.7, 0, -3, 0.6, H, 30, WOOD, { tag: 'wall', jitter: 0.04 });
  m.box(23.7, 0, -3, 0.6, H, 30, WOOD, { tag: 'wall', jitter: 0.04 });
  // South face: the big door is an 8 m gap with a lintel over it.
  m.box(-14, 0, BARN_S - 0.3, 20, H, 0.6, WOOD, { tag: 'wall', jitter: 0.04 });
  m.box(14, 0, BARN_S - 0.3, 20, H, 0.6, WOOD, { tag: 'wall', jitter: 0.04 });
  m.box(0, 5.2, BARN_S - 0.3, 8, H - 5.2, 0.6, WOOD, { tag: 'wall' });
  for (const s of [-1, 1]) {
    m.box(s * 4.4, 0, BARN_S - 0.3, 0.5, 5.2, 0.8, WOOD_DK); // door jamb
    m.box(s * 6.4, 0, BARN_S - 0.75, 3.4, 5.0, 0.24, TEAL_DK, { solid: false }); // rolled-back leaf
  }

  // Trusses. Tie beams sit at 5.0 so nothing up there is reachable, they are
  // purely what stops the ceiling reading as a lid.
  for (const tz of [-15, -9.5, -4, 1.5, 7, 11]) {
    m.box(0, 5.0, tz, 47, 0.3, 0.3, WOOD_DK);
    m.box(0, 5.3, tz, 0.3, 1.3, 0.28, WOOD_DK);
    for (const s of [-1, 1]) m.box(s * 8, 5.3, tz, 0.26, 1.0, 0.26, WOOD_DK, { solid: false });
  }
  m.box(0, 6.5, -3, 0.34, 0.34, 30, WOOD_DK);
  for (const s of [-1, 1]) m.wedge(s * 15, 5.0, -17.4, 16, 2.0, 0.5, WOOD_DK);

  // Teal accents: the shop half was painted, the working half never was.
  for (let i = 0; i < 7; i++) {
    m.box(23.3, 1.2, -6 + i * 2.6, 0.12, 2.6, 2.4, i % 2 ? TEAL : TEAL_DK, { solid: false, jitter: 0.05 });
  }
  for (let i = 0; i < 5; i++) {
    m.box(-16 + i * 8, 1.2, BARN_S - 0.62, 3.4, 2.8, 0.12, i % 2 ? TEAL_DK : TEAL, { solid: false, jitter: 0.05 });
  }

  // -------------------------------------------------------------- hay loft --
  m.box(0, LOFT_Y - 0.35, -13.5, 47, 0.35, 9, WOOD, { tag: 'loft', jitter: 0.04 });
  for (let i = 0; i < 9; i++) {
    m.box(-22 + i * 5.5, LOFT_Y - 0.7, -13.5, 0.3, 0.35, 9, WOOD_DK); // joists
    m.box(-22 + i * 5.5, 0, -13.5, 0.28, LOFT_Y - 0.7, 0.28, WOOD_DK, { tag: 'post' });
  }
  m.fence(-23, LOFT_Z, 8.6, LOFT_Z, 1.0, WOOD, { y: LOFT_Y, spacing: 3.2 });
  m.fence(11.4, LOFT_Z, 23, LOFT_Z, 1.0, WOOD, { y: LOFT_Y, spacing: 3.2 });
  // Ladder-stair: 12 risers landing flush with the loft deck.
  m.stairs(10, LOFT_Z + 4.8, 1.6, 12, LOFT_Y / 12, 0.4, WOOD, { yaw: 180 });
  for (let i = 0; i <= 12; i += 2) {
    m.box(10.9, LOFT_Y / 12 * i, LOFT_Z + 4.8 - i * 0.4, 0.12, 1.0, 0.12, WOOD_DK, { solid: false });
  }
  m.spot(-20, LOFT_Y, -16, { stance: 'prone', quality: 0.84, hint: 'Flat in the far loft corner' });
  m.spot(20, LOFT_Y, -16, { stance: 'prone', quality: 0.82, hint: 'Loft corner, behind the bales' });
  m.spot(0, LOFT_Y, -10, { stance: 'prone', quality: 0.6, hint: 'Along the loft rail' });
  m.spot(6, 0, -12, { stance: 'crouch', quality: 0.72, hint: 'Under the loft, behind a post' });

  // ------------------------------------------------------------------- hay --
  const bale = (x, y, z, yaw) => {
    m.box(x, y, z, 1.25, 0.7, 0.8, HAY, { yaw, tag: 'bale', jitter: 0.08 });
    m.box(x, y + 0.16, z, 1.27, 0.05, 0.82, HAY_DK, { yaw, solid: false });
    m.box(x, y + 0.46, z, 1.27, 0.05, 0.82, HAY_DK, { yaw, solid: false });
  };
  const baleStack = (x, z, cols, rows, yaw = 0) => {
    const a = yaw * Math.PI / 180;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o = (c - (cols - 1) / 2) * 1.32 + (r % 2 ? 0.3 : 0);
        bale(x + Math.cos(a) * o, r * 0.7, z + Math.sin(a) * o, yaw + (r % 2 ? 3 : -2));
      }
    }
  };
  baleStack(-19, -13, 3, 3, 0);
  baleStack(-6.5, -15.5, 4, 2, 0);
  baleStack(14, -15.5, 3, 2, 0);
  baleStack(-20.5, -16, 2, 2, 90);
  m.spot(-19, 0, -11.6, { stance: 'crouch', quality: 0.8, hint: 'In the gap behind the bale wall' });
  m.spot(14, 0, -13.6, { stance: 'crouch', quality: 0.78, hint: 'Between the stacked bales' });
  // Loft hay.
  for (let i = 0; i < 4; i++) bale(-21 + i * 1.4, LOFT_Y, -16.6, m.range(-6, 6));
  for (let i = 0; i < 4; i++) bale(21 - i * 1.4, LOFT_Y, -16.6, m.range(-6, 6));
  bale(4, LOFT_Y, -16, 12);
  bale(2.6, LOFT_Y, -15.4, -8);
  for (let i = 0; i < 10; i++) {
    m.box(m.range(-22, 22), m.chance(0.5) ? LOFT_Y + 0.01 : 0.01, m.range(-17, -9.5),
      m.range(0.5, 1.6), 0.03, m.range(0.5, 1.6), m.pick([HAY, HAY_DK]),
      { solid: false, yaw: m.range(0, 180), tag: 'rug', jitter: 0.1 });
  }

  // ----------------------------------------------------------------- stalls --
  // Five box stalls off the west wall. Half-height partitions, so a hunter has
  // to walk the row rather than clear it from the aisle.
  for (let i = 0; i < 6; i++) {
    const pz = -8 + i * 3.6;
    m.box(-21.6, 0, pz, 3.6, 1.3, 0.16, WOOD_DK, { tag: 'stall', jitter: 0.05 });
    m.box(-19.85, 0, pz, 0.22, 2.1, 0.22, WOOD, { tag: 'post' });
  }
  for (let i = 0; i < 5; i++) {
    const zc = -6.2 + i * 3.6;
    m.box(-19.9, 0.55, zc, 0.14, 0.12, 3.4, WOOD, { solid: false }); // gate rail
    m.box(-19.9, 1.0, zc, 0.14, 0.12, 3.4, WOOD, { solid: false });
    m.box(-21.8, 0.02, zc, 3.2, 0.03, 3.2, HAY_DK, { solid: false, tag: 'rug', jitter: 0.08 });
    m.spot(-22.2, 0, zc, { stance: 'crouch', quality: 0.79, hint: 'In the back of a stall' });
    if (i % 2 === 0) m.box(-20.6, 0, zc + 1.2, 1.0, 0.9, 0.5, WOOD, { jitter: 0.06, tag: 'trough' });
  }

  // ---------------------------------------------------------------- produce --
  const produce = (x, y, z, c, yaw = 0) => {
    m.box(x, y, z, 0.8, 0.44, 0.6, GREEN, { yaw, tag: 'crate', jitter: 0.07 });
    m.box(x, y + 0.44, z, 0.74, 0.05, 0.54, GREEN_LT, { yaw, solid: false });
    for (let i = 0; i < 2; i++) {
      m.sphere(x + m.range(-0.24, 0.24), y + 0.52, z + m.range(-0.16, 0.16), m.range(0.08, 0.14), c,
        { solid: false, jitter: 0.12 });
    }
  };
  const stack = [[9, 6.5], [9, 7.3], [10.2, 6.9], [13, 5], [13.9, 5.4], [13, 5.8],
    [17.5, 8], [18.4, 8.4], [17.5, 8.8], [6.5, 9.5], [7.4, 9.9]];
  for (const [px, pz] of stack) {
    produce(px, 0, pz, m.pick([RED, GREEN_LT, HAY, '#c86a2e']), m.range(-12, 12));
    if (m.chance(0.5)) produce(px, 0.44, pz, m.pick([RED, GREEN_LT, HAY]), m.range(-12, 12));
  }
  m.spot(9.6, 0, 7.9, { stance: 'crouch', quality: 0.74, hint: 'Boxed in by the produce crates' });
  m.spot(17.9, 0, 9.4, { stance: 'crouch', quality: 0.72, hint: 'Behind the crate pyramid' });

  m.table(4, 8.5, 2.6, 1.1, 0.8, WOOD, { yaw: 0 });
  m.table(-4, 8.5, 2.6, 1.1, 0.8, WOOD, { yaw: 0 });
  m.table(20, 3.5, 2.4, 1.0, 0.8, WOOD, { yaw: 90 });
  for (let i = 0; i < 4; i++) {
    m.shelf(22.4, -6 + i * 4, 3.4, 2.3, 0.8, WOOD, { yaw: -90, levels: 3 });
  }
  for (let i = 0; i < 12; i++) {
    const sh = m.irange(0, 3);
    m.box(22.3, 0.2 + m.irange(0, 2) * 0.77, -7.4 + sh * 4 + m.range(0, 2.8), 0.5, m.range(0.2, 0.4), 0.4,
      m.pick([GREEN, GREEN_LT, HAY, RED, CREAM]), { solid: false, jitter: 0.1, tag: 'goods' });
  }

  // ---------------------------------------------------------------- standees --
  // Flat painted boards on little feet. Person-sized, person-coloured.
  const cow = (x, z, yaw, s = 1) => {
    const a = yaw * Math.PI / 180;
    m.box(x, 0.62, z, 2.2 * s, 1.2 * s, 0.09, CREAM, { yaw, tag: 'standee', jitter: 0.03 });
    m.box(x + Math.cos(a) * 1.05 * s, 1.42 * s, z + Math.sin(a) * 1.05 * s, 0.8 * s, 0.7 * s, 0.09, CREAM, { yaw });
    for (const o of [-0.85, 0.85]) {
      m.box(x + Math.cos(a) * o * s, 0, z + Math.sin(a) * o * s, 0.22 * s, 0.62 * s, 0.09, CREAM, { yaw });
    }
    for (let i = 0; i < 3; i++) {
      const o = m.range(-0.9, 0.7);
      m.box(x + Math.cos(a) * o * s, m.range(0.7, 1.5) * s, z + Math.sin(a) * o * s,
        m.range(0.3, 0.6) * s, m.range(0.25, 0.5) * s, 0.11, '#2a2622', { yaw, solid: false });
    }
  };
  const chicken = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    m.box(x, 0.32, z, 0.75, 0.6, 0.07, CREAM, { yaw, tag: 'standee', jitter: 0.04 });
    m.box(x + Math.cos(a) * 0.36, 0.86, z + Math.sin(a) * 0.36, 0.34, 0.34, 0.07, CREAM, { yaw });
    m.box(x + Math.cos(a) * 0.42, 1.14, z + Math.sin(a) * 0.42, 0.2, 0.2, 0.08, RED, { yaw, solid: false });
    for (const o of [-0.18, 0.18]) {
      m.box(x + Math.cos(a) * o, 0, z + Math.sin(a) * o, 0.08, 0.34, 0.07, '#c8922e', { yaw, solid: false });
    }
  };
  cow(-13, 6.5, 12); cow(-9.5, 0.5, -95); cow(16, -5, 100, 0.92); cow(2, -7.5, 170, 1.05);
  chicken(-15.5, 9.5, 30); chicken(-14.6, 10.2, -40); chicken(7.5, -2, 120);
  chicken(19.5, 6.5, -20); chicken(-2.5, 10.5, 60);
  m.spot(-13.9, 0, 6.9, { stance: 'stand', quality: 0.7, hint: 'Line up with the cow board' });
  m.spot(1.2, 0, -7.9, { stance: 'stand', quality: 0.68, hint: 'Beside the second cow' });
  m.spot(16.8, 0, -5.3, { stance: 'stand', quality: 0.66, hint: 'Alongside the far standee' });

  // ------------------------------------------------------- churns and sacks --
  const churn = (x, z) => {
    m.cyl(x, 0, z, 0.28, 0.62, IRON, { jitter: 0.05, tag: 'churn' });
    m.cyl(x, 0.62, z, 0.19, 0.26, IRON, { jitter: 0.05 });
    m.cyl(x, 0.88, z, 0.22, 0.07, '#6a6d72');
  };
  for (const [qx, qz] of [[-17.5, -6.5], [-16.8, -5.8], [-17.9, -5.4], [-16.4, -7.1],
    [-17.2, 3.4], [-16.4, 4.1], [21.5, -12], [20.6, -12.6]]) churn(qx, qz);
  m.spot(-17.1, 0, -6.2, { stance: 'prone', quality: 0.75, hint: 'Down among the milk churns' });

  const sack = (x, y, z, yaw) => {
    m.box(x, y, z, 0.8, 0.4, 0.55, '#b09a70', { yaw, tag: 'sack', jitter: 0.08 });
    m.sphere(x, y + 0.42, z, 0.28, '#b09a70', { jitter: 0.08 });
  };
  const sackPile = (x, z) => {
    sack(x, 0, z, m.range(-20, 20));
    sack(x + 0.5, 0, z + 0.6, m.range(-20, 20));
    sack(x - 0.3, 0, z + 0.9, m.range(-20, 20));
    sack(x + 0.2, 0.4, z + 0.4, m.range(-20, 20));
  };
  sackPile(-11, -6); sackPile(19, -9); sackPile(-6, 3.5); sackPile(12.5, -10.5);
  m.spot(-11.2, 0, -4.6, { stance: 'prone', quality: 0.76, hint: 'Behind the feed sacks' });
  m.spot(19.2, 0, -7.6, { stance: 'prone', quality: 0.74, hint: 'Tucked into the sack pile' });

  // ---------------------------------------------------------------- tractor --
  const TX = -3.5, TZ = -3.5;
  m.box(TX, 0.55, TZ, 1.6, 0.95, 2.6, RED, { tag: 'tractor', jitter: 0.03 });
  m.box(TX, 1.5, TZ - 0.7, 1.35, 0.55, 1.4, RED, { jitter: 0.03 });
  m.box(TX, 1.5, TZ + 0.75, 0.85, 0.32, 0.62, WOOD_DK);
  m.cyl(TX, 1.82, TZ + 0.4, 0.06, 0.34, IRON);
  m.cyl(TX, 2.14, TZ + 0.4, 0.26, 0.06, IRON, { solid: false });
  m.cyl(TX + 0.5, 2.05, TZ - 1.25, 0.09, 0.95, IRON);
  for (const s of [-1, 1]) {
    m.box(TX + s * 0.98, 0, TZ + 0.5, 0.42, 1.5, 1.5, '#2e2b28', { tag: 'wheel', jitter: 0.04 });
    m.box(TX + s * 0.86, 0, TZ - 1.35, 0.3, 0.9, 0.9, '#2e2b28', { tag: 'wheel', jitter: 0.04 });
    m.box(TX + s * 1.02, 1.5, TZ + 0.5, 0.5, 0.14, 1.6, RED, { solid: false });
  }
  m.spot(TX, 0, TZ + 2.4, { stance: 'crouch', quality: 0.77, hint: 'Behind the tractor' });
  m.spot(TX - 1.9, 0, TZ, { stance: 'prone', quality: 0.72, hint: 'Flat against the tractor wheels' });

  // ------------------------------------------------------------------- yard --
  m.fence(-23, 17.4, 23, 17.4, 1.2, WOOD, { spacing: 3.6 });
  for (const s of [-1, 1]) m.fence(s * 23, 12.6, s * 23, 17.4, 1.2, WOOD, { spacing: 2.6 });
  for (let i = 0; i < 10; i++) {
    m.box(m.range(-21, 21), 0.01, m.range(12.8, 17.2), m.range(1.2, 3.0), 0.02, m.range(1.2, 3.0),
      m.pick([HAY_DK, DIRT, '#7a6a50']), { solid: false, tag: 'rug', jitter: 0.1 });
  }
  m.crateStack(-18, 14.5, WOOD, 3, 1.0);
  m.crateStack(18.5, 15, WOOD, 2, 1.1);
  m.plant(-8, 15.5, 1.3, '#8a5a3a', GREEN);
  m.plant(8, 15.5, 1.3, '#8a5a3a', GREEN);

  // ------------------------------------------------------------------ lights --
  // Daylight column through the door, then string lamps for the deep end.
  m.box(0, 0, 9.4, 8.4, 5.2, 5.6, '#ffe6b4', { solid: false, opaque: false, emis: 0.32, tag: 'sunbeam' });
  m.light(0, 3.2, 10.5, '#ffdda2', 1.8, 26);
  m.light(0, 2.4, 4, '#ffdda2', 0.9, 18);
  for (const [lx, lz] of [[-16, 6], [16, 6], [-16, -2], [16, -2], [0, -6], [-16, -12], [16, -12]]) {
    m.lamp(lx, 4.6, lz, '#ffe4b2', 0.85, 13);
  }
  m.lamp(-12, 6.4, -14, '#ffe4b2', 0.6, 11);
  m.lamp(12, 6.4, -14, '#ffe4b2', 0.6, 11);
  m.light(0, 2.2, 15, '#ffeec4', 1.1, 20);

  // Tools and tack on the west wall - small colour targets in the dim half.
  for (let i = 0; i < 8; i++) {
    const z = m.range(-8.5, 10.5);
    m.box(-23.2, m.range(1.4, 2.8), z, 0.1, m.range(0.5, 1.2), m.range(0.14, 0.4),
      m.pick([IRON, WOOD_DK, RED, TEAL_DK]), { solid: false, jitter: 0.1, tag: 'tool' });
  }
  for (let i = 0; i < 8; i++) {
    m.poster(-9 + i * 4.5, 2.6, BARN_S - 0.66, 1.1, 1.4, m.pick([TEAL, RED, HAY_DK, GREEN]));
  }

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-21.5, -6.2);
  m.spawnHider(-21.5, 4.6);
  m.spawnHider(-15, -12);
  m.spawnHider(2.5, -12);
  m.spawnHider(17, -11);
  m.spawnHider(-6, -14, LOFT_Y);
  m.spawnHider(16, -13, LOFT_Y);
  m.spawnHider(20, -2);
  m.spawnHider(-10, 2);
  m.spawnHider(6, 2);
  m.spawnHider(-19, 9.5);
  m.spawnHider(13, 10);
  m.spawnSeeker(0, 15.2);
  m.spawnSeeker(-2.2, 15.6);
  m.spawnSeeker(2.2, 15.6);
  m.spawnSeeker(0, 16.8);
  m.lobbySpawn(0, 14);

  m.palette([WOOD, WOOD_DK, PLANK, TEAL, TEAL_DK, HAY, HAY_DK, GREEN, GREEN_LT, CREAM, RED, DIRT]);
  return m.finish();
}
