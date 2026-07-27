// Art Gallery. Everything structural is one of four near-whites, so a hider
// painted from the walls reads as a grey smear the moment a hunter's eye
// sweeps past. The canvases are the only saturated surfaces on the map, which
// makes them the only real cover: nearly every curated spot here sits within a
// metre of a colour field, and the hint says which one.

import { createMap } from './kit.js';

export const meta = {
  id: 'gallery',
  name: 'Art Gallery',
  theme: 'modern gallery',
  tagline: 'White halls and polished stone. The paintings are the only place to hide.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [56, 44],
    ceiling: 6.0,
    sky: '#e8e9ea',
    ambient: '#9ea3a8',
    sunDir: [-0.3, -0.9, -0.32],
    sunColor: '#fff6e8',
    sunIntensity: 0.42,
    fog: '#dfe1e3',
    fogDensity: 0.006,
  });

  const DEG = Math.PI / 180;
  const CEIL = 6.0;

  const FLOOR = '#dbd7d0';
  const FLOOR_DK = '#c2beb6';
  const WALL = '#f1efeb';
  const WALL_SH = '#e0ddd7';
  const STONE = '#c9c4bb';
  const STONE_L = '#ded9d0';
  const TRIM = '#39352f';
  const LEATHER = '#4e3327';
  const ROPE = '#8d2b3c';
  const BRASS = '#b08a3c';

  const A_RED = '#c8352f';
  const A_ORANGE = '#e07a1f';
  const A_YELLOW = '#e8c437';
  const A_GREEN = '#2f8f5f';
  const A_TEAL = '#1f8fa0';
  const A_BLUE = '#2a4fa8';
  const A_PURPLE = '#6b3f9e';
  const A_PINK = '#d2568f';
  const HUES = [A_RED, A_ORANGE, A_YELLOW, A_GREEN, A_TEAL, A_BLUE, A_PURPLE, A_PINK];

  // ------------------------------------------------------------------ shell --
  m.perimeter(10, WALL);
  m.box(0, -0.4, 0, 56, 0.4, 44, FLOOR, { tag: 'floor', rough: 0.16 });
  m.ceil(0, 0, 56, 44, '#e9e7e3', CEIL);
  for (const [sx, sz, w, d] of [[0, -21.8, 56, 0.4], [0, 21.8, 56, 0.4], [-27.8, 0, 0.4, 44], [27.8, 0, 0.4, 44]]) {
    m.box(sx, 0, sz, w, 0.16, d, TRIM, { solid: false, tag: 'skirt' });
  }
  // Inlay banding: the polished floor needs a seam or it reads as fog.
  for (const [ix, iz, iw, id] of [[0, -9.2, 21.3, 0.3], [-10.6, 1, 0.3, 20], [10.7, 1, 0.3, 20],
    [0, 11.2, 56, 0.3], [0, 1, 12, 0.3], [-19, 1, 0.3, 18], [19, 1, 0.3, 18], [0, -0.5, 12, 0.3]]) {
    m.box(ix, 0.006, iz, iw, 0.02, id, FLOOR_DK, { solid: false, tag: 'inlay' });
  }

  // -------------------------------------------------------------- partitions --
  const part = (x, z, w, d) => m.box(x, 0, z, w, CEIL, d, WALL, { tag: 'wall' });
  const lintel = (x, z, w, d) => m.box(x, 3.6, z, w, CEIL - 3.6, d, WALL, { tag: 'wall' });

  // West hall / atrium, doors at z = -14 and z = 3.
  part(-10.6, -18.6, 0.4, 5.8);
  part(-10.6, -5.5, 0.4, 13.6);
  part(-10.6, 7.95, 0.4, 6.5);
  lintel(-10.6, -14, 0.4, 3.4);
  lintel(-10.6, 3, 0.4, 3.4);
  // East hall / atrium.
  part(10.7, -18.6, 0.4, 5.8);
  part(10.7, -5.5, 0.4, 13.6);
  part(10.7, 7.95, 0.4, 6.5);
  lintel(10.7, -14, 0.4, 3.4);
  lintel(10.7, 3, 0.4, 3.4);
  // Sculpture court / atrium, one central door.
  part(-6.4, -9, 8.4, 0.4);
  part(6.45, -9, 8.5, 0.4);
  lintel(0, -9, 4.4, 0.4);
  // Lobby wall, three doors.
  part(-23.4, 11.2, 9.2, 0.4);
  part(-9.1, 11.2, 12.2, 0.4);
  part(9.1, 11.2, 12.2, 0.4);
  part(23.4, 11.2, 9.2, 0.4);
  lintel(-17, 11.2, 3.6, 0.4);
  lintel(0, 11.2, 6.0, 0.4);
  lintel(17, 11.2, 3.6, 0.4);

  // The sculpture court sits half a metre up, so the doorway reads as a stage.
  m.box(0.05, 0, -15.25, 21.3, 0.5, 12.5, FLOOR_DK, { tag: 'floor', rough: 0.2 });
  m.stairs(0, -8.5, 4.0, 2, 0.25, 0.5, STONE, { yaw: 180 });

  // -------------------------------------------------- free-standing panels --
  const panel = (x, z, w, d, h, y = 0) => {
    m.box(x, y, z, w, h, d, WALL, { tag: 'panel' });
    m.box(x, y, z, w + 0.1, 0.14, d + 0.1, TRIM, { solid: false, tag: 'skirt' });
  };
  panel(-19.0, -5.0, 0.4, 8.0, 4.2);
  panel(-22.0, 5.5, 6.0, 0.4, 4.2);
  panel(-15.5, -16.0, 5.4, 0.4, 4.2);
  panel(19.5, -4.0, 0.4, 9.0, 4.2);
  panel(23.0, 6.5, 6.0, 0.4, 4.2);
  panel(14.5, -16.5, 0.4, 6.0, 4.2);
  panel(0, -16.0, 8.0, 0.4, 3.6, 0.5);

  // ----------------------------------------------------------------- the art --
  /**
   * A framed colour field. `out` is +1 or -1 along the panel's own +Z, which
   * is the direction the canvas face is pushed proud of its frame.
   */
  const art = (x, y, z, w, h, c, yaw, out) => {
    const a = yaw * DEG;
    const nx = -Math.sin(a) * out, nz = Math.cos(a) * out;
    const ax = Math.cos(a), az = Math.sin(a);
    m.box(x, y, z, w + 0.3, h + 0.3, 0.12, TRIM, { yaw, solid: false, tag: 'frame' });
    m.box(x + nx * 0.06, y + 0.15, z + nz * 0.06, w, h, 0.1, c,
      { yaw, tag: 'canvas', rough: 0.5, emis: 0.07 });
    m.box(x + nx * 0.05 + ax * (w / 2 + 0.46), y + h * 0.42, z + nz * 0.05 + az * (w / 2 + 0.46),
      0.3, 0.18, 0.04, '#fbfaf7', { yaw, solid: false, tag: 'label' });
  };

  // West perimeter, the map's biggest colour fields.
  const WEST_HUES = [A_RED, A_BLUE, A_YELLOW, A_GREEN, A_PURPLE];
  for (let i = 0; i < 5; i++) art(-27.86, 1.2, -18 + i * 6, 3.4, 2.6, WEST_HUES[i], 90, -1);
  // North perimeter.
  art(-22, 1.2, -21.86, 3.2, 2.4, A_TEAL, 0, 1);
  art(-16, 1.2, -21.86, 3.2, 2.4, A_ORANGE, 0, 1);
  art(-6, 1.7, -21.86, 3.0, 2.3, A_PINK, 0, 1);
  art(0, 1.7, -21.86, 3.0, 2.3, A_BLUE, 0, 1);
  art(6, 1.7, -21.86, 3.0, 2.3, A_YELLOW, 0, 1);
  art(16, 1.2, -21.86, 3.2, 2.4, A_GREEN, 0, 1);
  art(22, 1.2, -21.86, 3.2, 2.4, A_RED, 0, 1);
  art(26, 1.2, -21.86, 2.4, 2.0, A_PURPLE, 0, 1);
  // East perimeter.
  const EAST_HUES = [A_ORANGE, A_TEAL, A_PINK, A_GREEN];
  for (let i = 0; i < 4; i++) art(27.86, 1.2, -16 + i * 7.4, 3.4, 2.6, EAST_HUES[i], 90, 1);
  // Lobby south wall.
  art(-6, 1.3, 21.86, 3.6, 2.4, A_BLUE, 0, -1);
  art(6, 1.3, 21.86, 3.6, 2.4, A_ORANGE, 0, -1);

  // Partition faces.
  art(-10.86, 1.2, -18.6, 3.0, 2.4, A_PINK, 90, 1);
  art(-10.86, 1.2, -5.5, 3.0, 2.4, A_YELLOW, 90, 1);
  art(-10.86, 1.2, 7.9, 3.0, 2.4, A_TEAL, 90, 1);
  art(-10.34, 1.2, -5.5, 3.0, 2.4, A_RED, 90, -1);
  art(-10.34, 1.2, 5.0, 3.0, 2.4, A_GREEN, 90, -1);
  art(10.96, 1.2, -18.6, 3.0, 2.4, A_BLUE, 90, -1);
  art(10.96, 1.2, -5.5, 3.0, 2.4, A_PURPLE, 90, -1);
  art(10.96, 1.2, 7.9, 3.0, 2.4, A_ORANGE, 90, -1);
  art(10.44, 1.2, -5.5, 3.0, 2.4, A_PINK, 90, 1);
  art(10.44, 1.2, 5.0, 3.0, 2.4, A_YELLOW, 90, 1);
  art(-6.4, 1.7, -9.26, 3.0, 2.2, A_GREEN, 0, -1);
  art(6.45, 1.7, -9.26, 3.0, 2.2, A_RED, 0, -1);
  art(-6.4, 1.2, -8.74, 3.0, 2.2, A_TEAL, 0, 1);
  art(6.45, 1.2, -8.74, 3.0, 2.2, A_PURPLE, 0, 1);
  art(-9.1, 1.3, 10.94, 3.6, 2.6, A_ORANGE, 0, -1);
  art(9.1, 1.3, 10.94, 3.6, 2.6, A_BLUE, 0, -1);
  art(-23.4, 1.3, 11.46, 3.6, 2.6, A_YELLOW, 0, 1);
  art(23.4, 1.3, 11.46, 3.6, 2.6, A_PINK, 0, 1);

  // Free-standing panel faces.
  art(-19.26, 1.1, -6.5, 2.6, 2.0, A_ORANGE, 90, 1);
  art(-19.26, 1.1, -3.0, 2.6, 2.0, A_BLUE, 90, 1);
  art(-18.74, 1.1, -5.0, 2.6, 2.0, A_GREEN, 90, -1);
  art(-22.0, 1.1, 5.24, 2.8, 2.0, A_YELLOW, 0, -1);
  art(-22.0, 1.1, 5.76, 2.8, 2.0, A_PURPLE, 0, 1);
  art(-15.5, 1.1, -15.74, 2.8, 2.0, A_TEAL, 0, 1);
  art(-15.5, 1.1, -16.26, 2.8, 2.0, A_RED, 0, -1);
  art(19.24, 1.1, -6.0, 2.6, 2.0, A_PINK, 90, 1);
  art(19.24, 1.1, -1.5, 2.6, 2.0, A_TEAL, 90, 1);
  art(19.76, 1.1, -4.0, 2.6, 2.0, A_YELLOW, 90, -1);
  art(23.0, 1.1, 6.24, 2.8, 2.0, A_RED, 0, -1);
  art(23.0, 1.1, 6.76, 2.8, 2.0, A_GREEN, 0, 1);
  art(14.76, 1.1, -16.5, 2.6, 2.0, A_PURPLE, 90, -1);
  art(14.24, 1.1, -16.5, 2.6, 2.0, A_ORANGE, 90, 1);
  art(0, 1.5, -15.74, 3.2, 2.2, A_BLUE, 0, 1);
  art(0, 1.5, -16.26, 3.2, 2.2, A_PINK, 0, -1);

  // --------------------------------------------------------------- sculpture --
  const plinth = (x, y, z, w, h) => {
    m.box(x, y, z, w, h, w, STONE, { tag: 'plinth', jitter: 0.04 });
    const top = y + h;
    const c = m.pick(HUES);
    const kind = m.irange(0, 3);
    if (kind === 0) {
      let ly = top;
      for (let i = 0; i < 3; i++) {
        const s = m.range(0.26, 0.46);
        m.box(x + m.range(-0.1, 0.1), ly, z + m.range(-0.1, 0.1), s, s, s,
          i === 1 ? c : STONE_L, { yaw: m.range(-42, 42), jitter: 0.08 });
        ly += s;
      }
    } else if (kind === 1) {
      const ch = m.range(0.5, 0.9), r = m.range(0.22, 0.32);
      m.cyl(x, top, z, m.range(0.13, 0.19), ch, STONE_L, { jitter: 0.05 });
      m.sphere(x, top + ch + r * 0.7, z, r, c, { jitter: 0.06 });
    } else if (kind === 2) {
      let ly = top + 0.22;
      for (let i = 0; i < 3; i++) {
        const r = m.range(0.19, 0.29);
        m.sphere(x + m.range(-0.26, 0.26), ly, z + m.range(-0.26, 0.26), r,
          i === 0 ? c : STONE_L, { jitter: 0.07 });
        ly += r * 1.5;
      }
    } else {
      m.box(x, top, z, m.range(0.7, 1.0), 0.12, m.range(0.2, 0.3), c,
        { yaw: m.range(0, 180), jitter: 0.06 });
      const sh = m.range(0.5, 0.9);
      m.box(x, top + 0.12, z, 0.18, sh, 0.18, STONE_L, { yaw: m.range(0, 180) });
      m.sphere(x, top + 0.12 + sh + 0.2, z, m.range(0.17, 0.25), c, { jitter: 0.06 });
    }
  };

  // West hall.
  plinth(-24.0, 0, -12.0, 1.0, 1.05);
  plinth(-21.6, 0, -9.0, 0.8, 1.25);
  plinth(-24.6, 0, 1.0, 1.1, 0.9);
  plinth(-14.0, 0, -11.0, 0.9, 1.1);
  plinth(-13.2, 0, 2.0, 1.0, 1.0);
  plinth(-25.4, 0, 9.0, 0.9, 1.2);
  // East hall.
  plinth(23.0, 0, -12.0, 1.0, 1.05);
  plinth(25.6, 0, -8.4, 0.8, 1.3);
  plinth(24.4, 0, 0.0, 1.1, 0.9);
  plinth(14.0, 0, -10.0, 0.9, 1.1);
  plinth(13.4, 0, 2.0, 1.0, 1.0);
  plinth(16.6, 0, 9.4, 0.9, 1.15);
  // Sculpture court, raised.
  plinth(-7.4, 0.5, -13.0, 1.0, 1.1);
  plinth(-3.6, 0.5, -12.4, 0.9, 0.95);
  plinth(3.6, 0.5, -12.4, 0.9, 1.2);
  plinth(7.4, 0.5, -13.0, 1.0, 1.05);
  plinth(-6.0, 0.5, -19.0, 1.1, 0.85);
  plinth(6.0, 0.5, -19.0, 1.1, 0.85);
  // Atrium.
  plinth(-5.6, 0, 6.4, 1.0, 1.0);
  plinth(5.6, 0, 6.4, 1.0, 1.0);
  plinth(-5.6, 0, -3.0, 0.9, 1.15);
  plinth(5.6, 0, -3.0, 0.9, 1.15);
  // Lobby, in the bare band between the door wall and the coat check.
  plinth(-20.0, 0, 15.0, 0.9, 1.1);

  // The centrepiece: a big drum with a leaning slab and a hollow you can duck in.
  m.cyl(0, 0, 1.6, 2.3, 0.55, STONE, { tag: 'daisPlinth' });
  m.cyl(0, 0.55, 1.6, 1.5, 0.35, STONE_L, { tag: 'dais' });
  m.box(0, 0.9, 1.6, 1.0, 3.0, 0.4, A_RED, { yaw: 18, jitter: 0.05, tag: 'sculpture' });
  m.box(-0.5, 0.9, 1.9, 0.4, 2.4, 0.9, A_BLUE, { yaw: -26, jitter: 0.05, tag: 'sculpture' });
  m.sphere(0.7, 2.4, 1.2, 0.55, A_YELLOW, { jitter: 0.06, tag: 'sculpture' });
  m.cyl(-0.9, 0.9, 0.9, 0.22, 2.0, A_GREEN, { jitter: 0.05, tag: 'sculpture' });

  // Vitrines: glass boxes you can see through but not walk through.
  for (const [vx, vz, vc] of [[-8.6, 8.6, A_TEAL], [8.6, 8.6, A_PINK], [0, -5.6, A_ORANGE]]) {
    m.box(vx, 0, vz, 1.3, 0.85, 1.3, STONE, { tag: 'vitrineBase' });
    m.box(vx, 0.85, vz, 1.24, 1.1, 1.24, '#e4eef2',
      { opaque: false, rough: 0.08, tag: 'vitrineGlass' });
    m.sphere(vx - 0.2, 1.15, vz, 0.2, vc, { solid: false, jitter: 0.08 });
    m.box(vx + 0.28, 0.85, vz + 0.1, 0.28, 0.5, 0.28, STONE_L, { solid: false, yaw: 24 });
  }

  // ---------------------------------------------------------------- furniture --
  const bench = (x, z, len, yaw) => {
    const a = yaw * DEG;
    m.box(x, 0.38, z, len, 0.14, 0.62, LEATHER, { yaw, tag: 'bench', jitter: 0.05 });
    for (const s of [-1, 1]) {
      m.box(x + Math.cos(a) * s * (len / 2 - 0.32), 0, z + Math.sin(a) * s * (len / 2 - 0.32),
        0.16, 0.38, 0.5, STONE, { yaw, tag: 'benchLeg' });
    }
  };
  bench(-17.5, -8.0, 2.4, 90);
  bench(-17.5, 4.0, 2.4, 90);
  bench(-22.0, -17.5, 2.4, 0);
  bench(17.5, -7.0, 2.4, 90);
  bench(17.5, 4.5, 2.4, 90);
  bench(22.5, -17.5, 2.4, 0);
  bench(0, -12.5, 3.0, 0);
  bench(-4.0, 9.0, 2.6, 0);
  bench(4.0, 9.0, 2.6, 0);
  bench(-2.0, 15.5, 3.0, 0);
  bench(10.0, 15.5, 3.0, 0);

  const ropeRun = (x1, z1, x2, z2, n) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
      m.cyl(px, 0, pz, 0.16, 0.06, BRASS, { tag: 'stanchionBase' });
      m.cyl(px, 0.06, pz, 0.045, 0.9, BRASS, { tag: 'stanchion' });
      m.sphere(px, 1.02, pz, 0.07, BRASS, { solid: false });
    }
    const yaw = -Math.atan2(z2 - z1, x2 - x1) / DEG;
    m.box((x1 + x2) / 2, 0.78, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), 0.07, 0.07, ROPE,
      { yaw, solid: false, tag: 'rope' });
  };
  ropeRun(-3.2, 4.4, 3.2, 4.4, 3);
  ropeRun(-25.6, -14.4, -25.6, -9.6, 3);
  ropeRun(25.6, -14.4, 25.6, -9.6, 3);
  ropeRun(-4.0, -10.8, 4.0, -10.8, 4);

  // ---------------------------------------------------------------- coat check --
  m.box(-21.5, 0, 17.25, 9.0, 1.05, 0.14, WALL, { tag: 'counterFront' });
  for (const s of [-1, 1]) m.box(-21.5 + s * 4.43, 0, 17.0, 0.14, 1.05, 0.62, WALL, { tag: 'counterSide' });
  m.box(-21.5, 1.05, 17.0, 9.3, 0.09, 0.78, STONE, { tag: 'counterTop' });
  m.pipe(-26.2, 1.85, 19.6, -17.0, 19.6, 0.05, BRASS, { solid: false });
  const COATS = ['#3a3f47', '#5a4232', '#2f3a4a', '#6b6257', A_RED, A_GREEN, '#41474e', A_BLUE,
    '#544a3f', '#33383e', A_PURPLE, '#5c5148'];
  for (let i = 0; i < COATS.length; i++) {
    m.box(-25.8 + i * 0.72, 0.92, 19.6 + m.range(-0.1, 0.1), 0.44, 0.9, 0.26, COATS[i],
      { solid: false, jitter: 0.12, tag: 'coat' });
  }
  m.box(-26.6, 0, 21.0, 1.2, 2.2, 1.0, WALL_SH, { tag: 'coatShelf' });
  m.box(-19.0, 0, 21.0, 3.0, 1.6, 0.8, WALL_SH, { tag: 'coatShelf' });
  m.box(-19.0, 1.6, 21.0, 3.1, 0.08, 0.9, STONE, { solid: false });

  // Ticket desk and an info plinth.
  m.box(9.0, 0, 17.55, 5.0, 1.05, 0.14, WALL, { tag: 'deskFront' });
  for (const s of [-1, 1]) m.box(9.0 + s * 2.43, 0, 17.3, 0.14, 1.05, 0.62, WALL, { tag: 'deskSide' });
  m.box(9.0, 1.05, 17.3, 5.3, 0.09, 0.78, STONE, { tag: 'deskTop' });
  for (const dx of [7.6, 10.4]) {
    m.box(dx, 1.14, 17.2, 0.44, 0.3, 0.06, '#3d4750', { solid: false, yaw: 12, emis: 0.5 });
  }
  m.box(-8.0, 0, 14.0, 0.7, 1.15, 0.7, STONE, { tag: 'infoPlinth' });
  m.box(-8.0, 1.15, 14.0, 0.6, 0.42, 0.06, '#eef2f4', { solid: false, yaw: -20, emis: 0.35 });

  m.plant(-13.5, 13.5, 1.25, STONE, '#3f6b42');
  m.plant(15.5, 13.5, 1.25, STONE, '#3f6b42');
  m.plant(-3.0, 20.5, 1.15, STONE, '#446f45');

  // ------------------------------------------------------------- ceiling rig --
  for (const [tx, tz, tw, td] of [[-24, -5, 0.14, 30], [-13, -5, 0.14, 30], [13, -5, 0.14, 30],
    [24, -5, 0.14, 30], [0, 14, 52, 0.14], [0, 19, 52, 0.14], [0, -13, 20, 0.14], [0, -19, 20, 0.14]]) {
    m.box(tx, CEIL - 0.22, tz, tw, 0.12, td, TRIM, { solid: false, tag: 'track' });
  }
  for (const [hx, hz] of [[-24, -18], [-24, -12], [-24, -6], [-24, 0], [-24, 6],
    [-13, -16], [-13, -8], [-13, 0], [-13, 8],
    [13, -16], [13, -8], [13, 0], [13, 8],
    [24, -16], [24, -8], [24, 0], [24, 6],
    [-6, -13], [6, -13], [0, -19], [-9, 14], [9, 14], [-21, 19], [0, 19]]) {
    m.cyl(hx, CEIL - 0.55, hz, 0.09, 0.34, TRIM, { solid: false, tag: 'spotHead' });
    m.box(hx, CEIL - 0.58, hz, 0.14, 0.05, 0.14, '#fff3dc', { solid: false, emis: 2.4 });
  }

  // Atrium skylight.
  m.box(0, CEIL - 0.14, 1.0, 9.0, 0.12, 9.0, '#ffffff', { solid: false, emis: 2.2, tag: 'skylight' });
  for (const o of [-3, 0, 3]) {
    m.box(o, CEIL - 0.2, 1.0, 0.14, 0.14, 9.0, WALL_SH, { solid: false });
    m.box(0, CEIL - 0.2, 1.0 + o, 9.0, 0.14, 0.14, WALL_SH, { solid: false });
  }

  // Exit signs, extinguishers, a camera: the only clutter a gallery permits.
  for (const [ex, ez, eyaw] of [[0, 11.0, 0], [-17, 11.0, 0], [17, 11.0, 0]]) {
    m.box(ex, 3.3, ez, 0.7, 0.26, 0.06, '#3fbf6a', { yaw: eyaw, solid: false, emis: 1.6, tag: 'exitSign' });
  }
  m.cyl(-27.4, 0.35, 12.6, 0.11, 0.6, A_RED, { solid: false, tag: 'extinguisher' });
  m.cyl(27.4, 0.35, 12.6, 0.11, 0.6, A_RED, { solid: false, tag: 'extinguisher' });
  for (const [cx, cz] of [[-10.2, -8.6], [10.3, -8.6], [0, 10.8]]) {
    m.box(cx, 4.4, cz, 0.3, 0.16, 0.4, '#4a4f55', { solid: false, tag: 'camera' });
  }

  // ------------------------------------------------------------ hiding spots --
  // Everything here is placed against a colour field on purpose: the wall
  // behind you is white, so only the canvas gives you something to become.
  m.spot(-26.9, 0, -18, { stance: 'crouch', quality: 0.72, hint: 'Under the big red canvas' });
  m.spot(-26.9, 0, 6, { stance: 'crouch', quality: 0.7, hint: 'Beside the purple field, west wall' });
  m.spot(-19.95, 0, -6.5, { stance: 'stand', quality: 0.82, hint: 'Behind the orange panel' });
  m.spot(-18.1, 0, -5.0, { stance: 'crouch', quality: 0.78, hint: 'Against the green panel face' });
  m.spot(-17.5, 0.52, -8.0, { stance: 'prone', quality: 0.6, hint: 'Flat along the west bench' });
  m.spot(-15.5, 0, -15.1, { stance: 'crouch', quality: 0.76, hint: 'Tight to the teal partition' });
  m.spot(-22.0, 0, 6.4, { stance: 'crouch', quality: 0.74, hint: 'Behind the purple standing panel' });
  m.spot(-24.0, 0, -13.1, { stance: 'crouch', quality: 0.66, hint: 'Low behind a plinth' });
  m.spot(-11.5, 0, -5.5, { stance: 'crouch', quality: 0.7, hint: 'Under the yellow field on the partition' });

  m.spot(27.0, 0, -16, { stance: 'crouch', quality: 0.72, hint: 'Under the orange canvas, east wall' });
  m.spot(27.0, 0, 6.2, { stance: 'stand', quality: 0.68, hint: 'Flat to the green field' });
  m.spot(20.2, 0, -6.0, { stance: 'stand', quality: 0.82, hint: 'Behind the pink panel' });
  m.spot(18.8, 0, -4.0, { stance: 'crouch', quality: 0.78, hint: 'Against the yellow panel face' });
  m.spot(23.0, 0, 7.4, { stance: 'crouch', quality: 0.74, hint: 'Behind the green standing panel' });
  m.spot(13.9, 0, -16.5, { stance: 'crouch', quality: 0.8, hint: 'Wedged behind the orange panel' });
  m.spot(17.5, 0.52, 4.5, { stance: 'prone', quality: 0.6, hint: 'Flat along the east bench' });
  m.spot(11.6, 0, -5.5, { stance: 'crouch', quality: 0.7, hint: 'Under the purple field on the partition' });

  m.spot(0, 0.5, -16.9, { stance: 'stand', quality: 0.8, hint: 'Behind the pink court panel' });
  m.spot(0, 0.5, -15.1, { stance: 'crouch', quality: 0.78, hint: 'Tight under the blue court panel' });
  m.spot(-6, 0.5, -20.9, { stance: 'crouch', quality: 0.74, hint: 'Under the pink canvas in the court' });
  m.spot(6, 0.5, -20.9, { stance: 'crouch', quality: 0.74, hint: 'Under the yellow canvas in the court' });
  m.spot(-6.4, 0.5, -9.9, { stance: 'prone', quality: 0.68, hint: 'Flat at the foot of the green field' });

  m.spot(1.0, 0.9, 2.4, { stance: 'crouch', quality: 0.7, hint: 'On the dais, among the sculpture' });
  m.spot(-8.6, 0, 7.4, { stance: 'crouch', quality: 0.58, hint: 'Behind the teal vitrine' });
  m.spot(-9.1, 0, 10.1, { stance: 'crouch', quality: 0.72, hint: 'Under the orange field by the lobby door' });

  m.spot(-24.5, 0, 19.6, { stance: 'stand', quality: 0.86, hint: 'In among the checked coats' });
  m.spot(-21.5, 0, 18.2, { stance: 'crouch', quality: 0.8, hint: 'Behind the coat-check counter' });
  m.spot(9.0, 0, 18.5, { stance: 'crouch', quality: 0.72, hint: 'Behind the ticket desk' });
  m.spot(-23.4, 0, 12.2, { stance: 'crouch', quality: 0.7, hint: 'Under the yellow field in the lobby' });
  m.spot(-2.0, 0.52, 15.5, { stance: 'prone', quality: 0.58, hint: 'Flat on the lobby bench' });

  // ---------------------------------------------------------------- lighting --
  m.light(0, 5.2, 1.0, '#ffffff', 1.25, 26);
  for (const [lx, lz] of [[-26, -18], [-26, -6], [-26, 6], [-19.8, -5], [-15.5, -15], [-11.8, -12],
    [26, -16], [26, 0], [26, 6], [19.8, -5], [14, -16.5], [11.8, -12]]) {
    m.light(lx, 4.6, lz, '#fff2dc', 0.78, 9);
  }
  m.light(-5, 4.8, -17, '#fff2dc', 0.7, 12);
  m.light(5, 4.8, -17, '#fff2dc', 0.7, 12);
  m.light(-21, 4.6, 18, '#ffeed6', 0.85, 14);
  m.light(0, 4.6, 17, '#ffeed6', 0.9, 16);
  m.light(18, 4.6, 17, '#ffeed6', 0.75, 14);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-24.0, -16.0);
  m.spawnHider(-16.0, -3.0);
  m.spawnHider(-24.5, 6.5);
  m.spawnHider(-14.0, 8.0);
  m.spawnHider(-6.0, -14.5, 0.5);
  m.spawnHider(6.0, -14.5, 0.5);
  m.spawnHider(0.0, -19.5, 0.5);
  m.spawnHider(16.6, -19.0);
  m.spawnHider(24.5, -4.0);
  m.spawnHider(13.5, 6.5);
  m.spawnHider(25.0, 8.5);
  m.spawnHider(-2.0, 7.5);
  m.spawnSeeker(0, 18.5);
  m.spawnSeeker(-2.2, 19.6);
  m.spawnSeeker(2.2, 19.6);
  m.spawnSeeker(0, 20.6);
  m.lobbySpawn(0, 19.8);

  m.palette([FLOOR, FLOOR_DK, WALL, STONE, TRIM, LEATHER,
    A_RED, A_ORANGE, A_YELLOW, A_GREEN, A_TEAL, A_BLUE, A_PURPLE, A_PINK]);
  return m.finish();
}
