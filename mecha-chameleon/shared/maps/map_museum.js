// Museum - natural history. One tall atrium with a mounted sauropod on a
// podium, flanked by two low side galleries and wrapped on two sides by a
// mezzanine walkway. The glass cases are solid but `opaque: false`, so hunters
// can see straight through them and still cannot walk through them - which is
// what makes the case rows a real gamble rather than free cover.

import { createMap } from './kit.js';

export const meta = {
  id: 'museum',
  name: 'Museum',
  theme: 'natural history',
  tagline: 'Marble, brass and old bone. Everything is labelled except you.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [52, 44],
    ceiling: 9,
    sky: '#1a1e24',
    ambient: '#5f6470',
    sunDir: [-0.34, -0.86, -0.38],
    sunColor: '#fff4e2',
    sunIntensity: 0.6,
    fog: '#252a31',
    fogDensity: 0.012,
  });

  const MARBLE = '#cfcabf';
  const MARBLE_DK = '#8f8b82';
  const SLATE = '#3d474f';
  const WALL = '#5c6a70';
  const WOOD = '#4a3628';
  const WOOD_LT = '#6d5238';
  const BRASS = '#a8873f';
  const BONE = '#ddd2b4';
  const TEAL = '#2f6f72';
  const RUST = '#a85a34';
  const AMETHYST = '#6a4a9c';
  const EMERALD = '#2f8a5a';
  const GLASS = '#9fc3d2';
  const CREAM = '#e6dcc4';

  const ATRIUM_H = 9, GALL_H = 4.6, DECK = 4.4;

  // ------------------------------------------------------------------ shell --
  m.perimeter(13, SLATE);
  m.floor(0, 0, 52, 44, MARBLE);
  m.ceil(0, 0, 52, 44, SLATE, ATRIUM_H);
  m.room({ x: 0, z: 0, w: 50, d: 42, h: ATRIUM_H, floor: MARBLE, wall: WALL });

  // Gallery partitions run the full height so the void over the low galleries
  // is sealed off; the door gaps are the only way between hall and gallery.
  const partition = (x, segs, doors) => {
    for (const [z0, z1] of segs) m.box(x, 0, (z0 + z1) / 2, 0.5, ATRIUM_H, z1 - z0, WALL, { tag: 'wall' });
    for (const [z0, z1] of doors) {
      m.box(x, 3.6, (z0 + z1) / 2, 0.5, ATRIUM_H - 3.6, z1 - z0, WALL, { tag: 'wall' });
      m.box(x, 3.6, (z0 + z1) / 2, 0.7, 0.28, z1 - z0 + 0.4, BRASS, { solid: false });
    }
  };
  partition(-13, [[-21, -10.2], [-5.8, 5.8], [10.2, 21]], [[-10.2, -5.8], [5.8, 10.2]]);
  partition(13, [[-21, -12.2], [-7.8, 3.8], [8.2, 21]], [[-12.2, -7.8], [3.8, 8.2]]);
  m.box(19.4, 0, 4, 11.2, GALL_H, 0.4, WALL, { tag: 'wall' });
  m.box(14.4, 0, 4, 2.8, GALL_H, 0.4, WALL, { tag: 'wall' });
  m.ceil(-19, 0, 12, 42, SLATE, GALL_H);
  m.ceil(19, -8.5, 12, 25, SLATE, GALL_H);
  m.ceil(19, 12.5, 12, 17, SLATE, GALL_H);

  // Pilasters and a dado rail keep the long atrium walls from reading flat.
  for (let i = 0; i < 8; i++) {
    const z = -18 + i * 5.2;
    for (const s of [-1, 1]) {
      m.box(s * 12.4, 0, z, 0.36, 6.4, 0.9, CREAM, { solid: false, jitter: 0.05 });
    }
  }
  for (const s of [-1, 1]) {
    m.box(0, 1.15, s * 20.6, 25.6, 0.16, 0.3, CREAM, { solid: false });
    m.box(s * 12.6, 1.15, 0, 0.3, 0.16, 41.4, CREAM, { solid: false });
  }

  // --------------------------------------------------------- compass inlay --
  // Brass rose set into the marble at the south end of the hall - flat, purely
  // visual, and the one bit of floor colour a hider can paint against.
  m.cyl(0, 0.004, 11, 5.6, 0.012, MARBLE_DK, { solid: false, tag: 'inlay' });
  for (let i = 0; i < 4; i++) {
    m.box(0, 0.008, 11, 10.6, 0.014, 0.7, BRASS, { solid: false, yaw: i * 45, tag: 'inlay' });
  }
  for (let i = 0; i < 4; i++) {
    m.box(0, 0.01, 11, 7.4, 0.014, 0.34, SLATE, { solid: false, yaw: 22.5 + i * 45, tag: 'inlay' });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    m.box(Math.cos(a) * 5.35, 0.012, 11 + Math.sin(a) * 5.35, 0.55, 0.016, 0.24,
      i % 5 === 0 ? BRASS : SLATE, { solid: false, yaw: -(a * 180 / Math.PI), tag: 'inlay' });
  }
  m.cyl(0, 0.014, 11, 1.05, 0.018, BRASS, { solid: false, tag: 'inlay' });

  // ------------------------------------------------------- the centrepiece --
  m.box(0, 0, -3, 14, 0.35, 7, MARBLE_DK, { tag: 'podium', jitter: 0.04 });
  m.box(0, 0.35, -3, 13.2, 0.06, 6.2, SLATE, { solid: false });
  for (const [lx, lz] of [[-2.0, -5.0], [2.0, -5.0], [-2.0, -1.2], [2.0, -1.2]]) {
    m.cyl(lx, 0.35, lz, 0.3, 2.9, BONE, { tag: 'bone', jitter: 0.05 });
    m.cyl(lx, 0.35, lz, 0.38, 0.3, BONE, { solid: false });
  }
  m.box(0, 3.25, -5.0, 2.3, 0.95, 1.9, BONE, { jitter: 0.05, tag: 'bone' });
  m.box(0, 3.25, -1.2, 2.1, 0.9, 1.7, BONE, { jitter: 0.05, tag: 'bone' });
  // Spine: tail sweeping up off the floor, body, then the neck and skull.
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    m.sphere(0, 1.5 + t * 2.7, 6 - t * 11, 0.13 + t * 0.15, BONE, { solid: false, jitter: 0.04 });
  }
  for (let i = 0; i < 5; i++) {
    m.sphere(0, 4.2, -5 + i * 0.95, 0.3, BONE, { solid: false, jitter: 0.04 });
  }
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    m.sphere(0, 4.2 + t * 2.6, -1.2 - t * 8.4, 0.27 - t * 0.12, BONE, { solid: false, jitter: 0.04 });
  }
  m.box(0, 6.62, -10.5, 0.5, 0.46, 1.5, BONE, { solid: false, jitter: 0.04 });
  m.box(0, 6.4, -10.9, 0.42, 0.2, 1.0, BONE, { solid: false });
  for (const s of [-1, 1]) m.sphere(s * 0.22, 6.9, -10.2, 0.09, SLATE, { solid: false });
  // Ribcage: verticals hung off the spine, cross-tied at the belly.
  for (let i = 0; i < 6; i++) {
    const rz = -4.7 + i * 0.68;
    for (const s of [-1, 1]) m.cyl(s * 0.78, 2.75, rz, 0.06, 1.5, BONE, { solid: false, jitter: 0.05 });
    m.box(0, 2.72, rz, 1.7, 0.09, 0.1, BONE, { solid: false });
  }
  for (const [ax, az, ah] of [[0, 4.2, 4.3], [0, -8.6, 6.4], [1.6, -3, 4.0], [-1.6, -3, 4.0]]) {
    m.cyl(ax, 0.35, az, 0.06, ah, SLATE, { solid: false });
  }
  m.spot(0, 0.35, -3.4, { stance: 'prone', quality: 0.84, hint: 'Flat under the ribcage' });
  m.spot(2.75, 0.35, -5.0, { stance: 'crouch', quality: 0.66, hint: 'Behind a hind leg' });
  m.spot(-5.6, 0.35, -3, { stance: 'crouch', quality: 0.6, hint: 'On the podium edge, tail side' });

  // Velvet rope around the mount.
  const rope = (x1, z1, x2, z2, y = 0) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / 4.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      m.cyl(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, 0.07, 1.0, BRASS, { tag: 'stanchion' });
    }
    const yaw = -Math.atan2(z2 - z1, x2 - x1) * 180 / Math.PI;
    m.box((x1 + x2) / 2, y + 0.78, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), 0.07, 0.07, RUST,
      { solid: false, yaw, tag: 'rope' });
  };
  rope(-7.6, -7.1, 7.6, -7.1);
  rope(-7.6, 1.1, 7.6, 1.1);
  rope(-7.6, -7.1, -7.6, 1.1);
  rope(7.6, -7.1, 7.6, 1.1);

  // ---------------------------------------------------------- the mezzanine --
  m.box(0, DECK - 0.3, -18.75, 26, 0.3, 4.5, WOOD_LT, { tag: 'deck', jitter: 0.04 });
  m.box(11, DECK - 0.3, -0.75, 4, 0.3, 31.5, WOOD_LT, { tag: 'deck', jitter: 0.04 });
  for (const [px, pz] of [[-10, -17.4], [-4, -17.4], [4, -17.4], [10.2, -12], [10.2, -5],
    [10.2, 2], [10.2, 9], [10.2, 14]]) {
    m.cyl(px, 0, pz, 0.22, DECK - 0.3, CREAM, { tag: 'strut' });
  }
  m.fence(-12.6, -16.5, 5.7, -16.5, 1.0, BRASS, { y: DECK, spacing: 2.2 });
  m.fence(9.2, -16.5, 9.2, 14.8, 1.0, BRASS, { y: DECK, spacing: 2.6 });
  m.fence(9.2, 14.8, 12.6, 14.8, 1.0, BRASS, { y: DECK, spacing: 1.7 });
  // Sixteen treads of 0.275 - the deck is exactly 4.4 up.
  m.stairs(7.4, -10.2, 3.0, 16, 0.275, 0.42, MARBLE_DK, { yaw: 180 });
  rope(5.6, -9.4, 9.2, -9.4);
  m.spot(-9.4, DECK, -18.6, { stance: 'prone', quality: 0.8, hint: 'Flat on the north balcony' });
  m.spot(11.4, DECK, 6.5, { stance: 'prone', quality: 0.78, hint: 'Behind the balcony rail' });
  m.spot(11.4, DECK, -11, { stance: 'prone', quality: 0.74, hint: 'Above the gallery doors' });

  // Balcony furniture: a run of benches and a couple of cases up top.
  for (const [bx, bz, byaw] of [[-6, -18.4, 0], [1, -18.4, 0], [12.2, -3, 90], [12.2, 8, 90]]) {
    m.box(bx, DECK, bz, byaw ? 0.6 : 2.2, 0.44, byaw ? 2.2 : 0.6, WOOD, { tag: 'bench', jitter: 0.05 });
    m.box(bx, DECK + 0.44, bz, byaw ? 0.5 : 2.2, 0.09, byaw ? 2.2 : 0.5, WOOD_LT);
  }

  // ------------------------------------------------------------ glass cases --
  /** Plinth, a solid-but-see-through vitrine, and whatever is under the glass. */
  const CASE_FILL = [AMETHYST, EMERALD, RUST, BRASS, TEAL, BONE, CREAM, '#8c3f5a'];
  const showcase = (x, z, yaw, w, d, kind) => {
    m.box(x, 0, z, w, 0.85, d, WOOD, { yaw, tag: 'plinth', jitter: 0.05 });
    m.box(x, 0.85, z, w - 0.1, 1.25, d - 0.1, GLASS,
      { yaw, opaque: false, rough: 0.08, metal: 0.15, tag: 'vitrine' });
    if (kind === 'mineral') {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.399963;
        m.sphere(x + Math.cos(a) * w * 0.24, 1.05 + m.rand() * 0.3, z + Math.sin(a) * d * 0.24,
          m.range(0.12, 0.24), m.pick(CASE_FILL), { solid: false, rough: 0.2, jitter: 0.14 });
      }
    } else {
      m.box(x, 0.9, z, w * 0.7, 0.08, d * 0.7, SLATE, { yaw, solid: false });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.1;
        m.sphere(x + Math.cos(a) * (0.12 + i * 0.07), 0.99, z + Math.sin(a) * (0.12 + i * 0.07),
          0.09 + i * 0.025, BONE, { solid: false, jitter: 0.1 });
      }
    }
  };

  // West gallery: minerals, two rows with a walkable spine between them.
  for (let i = 0; i < 4; i++) {
    const z = -16 + i * 10;
    showcase(-22, z, 0, 2.0, 1.4, 'mineral');
    showcase(-16, z, 0, 2.0, 1.4, 'mineral');
  }
  m.spot(-19, 0, -16, { stance: 'crouch', quality: 0.7, hint: 'Between the mineral cases' });
  m.spot(-19, 0, 14, { stance: 'crouch', quality: 0.68, hint: 'Down the far case row' });
  // East gallery: fossils.
  for (let i = 0; i < 3; i++) {
    const z = -17 + i * 6;
    showcase(16.4, z, 0, 2.0, 1.4, 'fossil');
    showcase(22, z, 0, 2.0, 1.4, 'fossil');
  }
  m.spot(19.2, 0, -11, { stance: 'crouch', quality: 0.72, hint: 'Between the fossil cases' });
  // Atrium: four long low cases either side of the mount.
  for (const s of [-1, 1]) {
    showcase(s * 9.6, 5.5, 0, 1.6, 3.4, 'mineral');
    showcase(s * 9.6, 16, 0, 1.6, 3.4, 'fossil');
  }
  m.spot(-9.6, 0, 10.8, { stance: 'crouch', quality: 0.62, hint: 'In the gap between vitrines' });

  // ------------------------------------------------------------- dioramas --
  // Bright painted backboards with cut-out scenery in front of them. These are
  // the loudest colours in the building and the best paint targets.
  const diorama = (x, z, yaw, back, mid) => {
    m.box(x, 0.4, z, 6.2, 3.4, 0.16, back, { yaw, solid: false, emis: 0.18, tag: 'diorama' });
    m.box(x, 0, z, 6.4, 0.4, 0.9, SLATE, { yaw, tag: 'dioramaBase' });
    const a = yaw * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      const o = -2.1 + i * 1.4;
      m.cyl(x + Math.cos(a) * o - Math.sin(a) * 0.34, 0.4, z + Math.sin(a) * o + Math.cos(a) * 0.34,
        m.range(0.12, 0.2), m.range(0.9, 2.0), m.pick([WOOD, EMERALD, RUST]),
        { solid: false, jitter: 0.15 });
    }
    m.box(x, 0.4, z, 6.0, 0.7, 0.7, mid, { yaw, solid: false, jitter: 0.12 });
  };
  diorama(-24.5, -12, 90, TEAL, EMERALD);
  diorama(-24.5, 0, 90, '#3f5f8c', MARBLE_DK);
  diorama(-24.5, 12, 90, RUST, '#7a5a2e');
  diorama(24.5, -14, -90, EMERALD, '#4a6b2e');
  diorama(0, -20.5, 0, '#2f4f6f', TEAL);
  m.spot(-23.4, 0, -12, { stance: 'crouch', quality: 0.76, hint: 'Inside the tundra diorama' });
  m.spot(-23.4, 0, 12, { stance: 'crouch', quality: 0.74, hint: 'Inside the desert diorama' });
  m.spot(23.4, 0, -14, { stance: 'crouch', quality: 0.76, hint: 'Inside the forest diorama' });

  // ---------------------------------------------------------- info plinths --
  const infoPlinth = (x, z, yaw, c) => {
    m.box(x, 0, z, 0.7, 0.95, 0.5, SLATE, { yaw, tag: 'info' });
    m.box(x, 0.95, z, 0.8, 0.12, 0.62, BRASS, { yaw });
    m.box(x, 1.02, z, 0.66, 0.06, 0.44, c, { yaw, solid: false, emis: 0.25 });
  };
  for (const [ix, iz, iy] of [[-6.5, 2.4, 0], [6.5, 2.4, 0], [-6.5, -8.2, 0], [6.5, -8.2, 0],
    [-14.6, -8, 90], [-14.6, 8, 90], [14.6, -10, 90], [14.6, 6, 90],
    [-19, 4, 0], [19, -5, 0], [0, 6.4, 0], [3.5, 17, 0]]) {
    infoPlinth(ix, iz, iy, m.pick([CREAM, TEAL, RUST]));
  }

  // ----------------------------------------------------------- gift shop --
  // South-east corner: tight, colourful and full of shelf clutter.
  m.box(19.4, 0, 8.2, 8.0, 1.05, 0.8, WOOD_LT, { tag: 'counter', jitter: 0.05 });
  m.box(19.4, 1.05, 8.2, 8.2, 0.1, 1.0, SLATE, { solid: false });
  m.box(22.6, 1.05, 8.2, 0.6, 0.4, 0.5, SLATE, { solid: false });
  m.spot(19.4, 0, 9.2, { stance: 'crouch', quality: 0.82, hint: 'Behind the gift-shop counter' });
  for (let i = 0; i < 4; i++) {
    m.shelf(14.6, 11 + i * 2.6, 2.4, 2.2, 0.6, WOOD, { yaw: -90, levels: 4, spot: i !== 1 });
  }
  m.shelf(21, 19.4, 6.0, 2.4, 0.6, WOOD, { yaw: 180, levels: 4, spot: false });
  m.spot(21, 0, 19.4, { stance: 'prone', quality: 0.8, hint: 'On the bottom of the plush shelf' });
  const PLUSH = [RUST, EMERALD, TEAL, AMETHYST, BRASS, CREAM, '#8c3f5a'];
  for (let i = 0; i < 26; i++) {
    const wall = m.chance(0.55);
    const px = wall ? 15.0 : m.range(18.4, 23.6);
    const pz = wall ? m.range(10.2, 19.4) : 19.2;
    m.sphere(px, 0.35 + m.irange(0, 3) * 0.55, pz, m.range(0.14, 0.26), m.pick(PLUSH),
      { solid: false, rough: 0.95, jitter: 0.13, tag: 'plush' });
  }
  for (let i = 0; i < 8; i++) {
    m.box(m.range(16.5, 23), 0, m.range(12, 17.5), m.range(0.7, 1.2), m.range(0.6, 1.1), m.range(0.7, 1.2),
      m.pick([WOOD, RUST, TEAL]), { yaw: m.range(-25, 25), jitter: 0.12, tag: 'stock' });
  }
  m.crateStack(23.4, 12.4, WOOD, 3, 1.0, { spot: false });
  m.spot(23.2, 0, 14.4, { stance: 'crouch', quality: 0.78, hint: 'Behind the stockroom crates' });

  // ------------------------------------------------ fossil wall and benches --
  for (let i = 0; i < 4; i++) {
    const z = -18.5 + i * 4.4;
    m.box(24.4, 1.0, z, 0.2, 2.6, 3.0, SLATE, { solid: false, jitter: 0.06 });
    for (let k = 0; k < 5; k++) {
      const a = k * 1.1;
      m.sphere(24.2, 2.3 + Math.sin(a) * (0.14 + k * 0.09), z + Math.cos(a) * (0.14 + k * 0.09),
        0.08 + k * 0.015, BONE, { solid: false, jitter: 0.09 });
    }
  }
  for (const [bx, bz, byaw] of [[-4, 8, 0], [4, 8, 0], [-4, 18, 0], [4, 18, 0],
    [-19, -4, 90], [-19, 12, 90], [19, -14, 90]]) {
    m.box(bx, 0, bz, byaw ? 0.62 : 2.4, 0.4, byaw ? 2.4 : 0.62, MARBLE_DK, { tag: 'bench', jitter: 0.05 });
    m.box(bx, 0.4, bz, byaw ? 0.54 : 2.4, 0.1, byaw ? 2.4 : 0.54, WOOD_LT);
  }
  m.spot(-4, 0.5, 18, { stance: 'prone', quality: 0.52, hint: 'Lying on the hall bench' });

  // Planters break the long atrium sight lines without closing them.
  for (const [px, pz] of [[-10.4, 19], [10.4, 19], [-10.4, -13.6], [10.4, -13.6]]) {
    m.plant(px, pz, 1.5, MARBLE_DK, EMERALD);
    m.spot(px, 0, pz + (pz > 0 ? 1.1 : -1.1), { stance: 'crouch', quality: 0.58, hint: 'Tucked behind a planter' });
  }

  // ---------------------------------------------------------------- lighting --
  for (const [lx, lz] of [[-6, -12], [6, -12], [-6, 2], [6, 2], [0, 14], [-6, 18], [6, 18]]) {
    m.lamp(lx, ATRIUM_H - 0.5, lz, '#fff2d8', 1.0, 17);
  }
  for (const [lx, lz] of [[-19, -14], [-19, 0], [-19, 14], [19, -14], [19, -2], [19, 12], [19, 19]]) {
    m.box(lx, GALL_H - 0.32, lz, 2.6, 0.14, 0.34, '#fff6e4', { solid: false, emis: 2.0 });
    m.light(lx, GALL_H - 0.5, lz, '#ffeecf', 0.75, 11);
  }
  m.light(0, 6.5, -4, '#e8dcc0', 0.7, 20);
  m.light(0, 2.0, 11, '#c9b98a', 0.4, 12);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-19, -18);
  m.spawnHider(-19, 18);
  m.spawnHider(-19, 0);
  m.spawnHider(19, -19);
  m.spawnHider(19, 0.5);
  m.spawnHider(17.6, 16.6);
  m.spawnHider(-9.4, -18.6, DECK);
  m.spawnHider(11.4, 3, DECK);
  m.spawnHider(-9.6, -12);
  m.spawnHider(-9.6, 12.6);
  m.spawnHider(9.6, -12);
  m.spawnHider(0, -13.6);
  m.spawnSeeker(0, 19.4);
  m.spawnSeeker(-2.6, 19.4);
  m.spawnSeeker(2.6, 19.4);
  m.spawnSeeker(0, 16.8);
  m.lobbySpawn(0, 18);

  m.palette([MARBLE, MARBLE_DK, SLATE, WALL, WOOD, WOOD_LT, BRASS, BONE, TEAL, RUST, AMETHYST, EMERALD, GLASS, CREAM]);
  return m.finish();
}
