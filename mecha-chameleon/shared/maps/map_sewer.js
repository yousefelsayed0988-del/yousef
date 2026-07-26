// Storm drain. Four brick tunnels meet over a central sump; the water channel
// runs the length of the map at floor level with raised walkways either side,
// so the map reads as two connected height layers rather than one corridor.
// Props only rotate about Y, so every arch and pipe here is a stepped shell -
// conservative bands that touch the true circle at their inner edge.

import { createMap } from './kit.js';

export const meta = {
  id: 'sewer',
  name: 'Sewer',
  theme: 'storm drain',
  tagline: 'Mossy brick and standing water. The pipes are big enough to lose someone in.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [56, 40],
    ceiling: 5.2,
    sky: '#111509',
    ambient: '#2c3b30',
    sunDir: [-0.18, -0.95, -0.26],
    sunColor: '#c2d2ac',
    sunIntensity: 0.2,
    fog: '#161c17',
    fogDensity: 0.04,
  });

  const BRICK = '#6a5142';
  const BRICK_DK = '#463629';
  const STONE = '#5b5950';
  const STONE_DK = '#3f3e37';
  const MOSS = '#4d6a3e';
  const MOSS_DK = '#354b2b';
  const ALGAE = '#2e6355';
  const WATER = '#3b5943';
  const RUST = '#8a4a26';
  const RUST_DK = '#5b3019';
  const IRON = '#474a52';
  const STAIN = '#39432f';

  const CEIL = 5.2;
  const WY = 0.9;    // walkway deck height
  const CH = 2.8;    // half-width of the main channel
  const BRW = 2.4;   // half-width of the branch channels
  const TUN = 6.4;   // main tunnel wall offset from the centreline
  const SX = 8.5, SZ = 13.5; // sump half-extents
  const POOL = 6.5;  // sump pool half-extent

  // ------------------------------------------------------------------ shell --
  m.perimeter(9, BRICK_DK);
  m.floor(0, 0, 56, 40, STONE_DK);
  m.ceil(0, 0, 56, 40, BRICK_DK, CEIL);

  /** Raised walkway slab, given as an axis-aligned span. */
  const deck = (x0, x1, z0, z1, c = STONE) =>
    m.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, WY, z1 - z0, c, { tag: 'deck', jitter: 0.05 });

  /** Water is see-through and wadeable: no collision, no occlusion. */
  const water = (x, z, w, d) =>
    m.box(x, 0.06, z, w, 0.14, d, WATER, { solid: false, opaque: false, rough: 0.16, tag: 'water' });

  water(0, 0, 56, CH * 2);
  water(0, -(POOL + CH) / 2, POOL * 2, POOL - CH);
  water(0, (POOL + CH) / 2, POOL * 2, POOL - CH);
  water(0, -(20 + POOL) / 2, BRW * 2, 20 - POOL);
  water(0, (20 + POOL) / 2, BRW * 2, 20 - POOL);

  // Main tunnel walkways, then the sump ledge that wraps the pool, then the
  // branch stubs - one continuous surface at WY with four gaps down to water.
  deck(-28, -SX, -TUN, -CH);
  deck(-28, -SX, CH, TUN);
  deck(SX, 28, -TUN, -CH);
  deck(SX, 28, CH, TUN);
  deck(-SX, -BRW, -SZ, -POOL);
  deck(BRW, SX, -SZ, -POOL);
  deck(-SX, -BRW, POOL, SZ);
  deck(BRW, SX, POOL, SZ);
  deck(-SX, -POOL, -POOL, -CH);
  deck(-SX, -POOL, CH, POOL);
  deck(POOL, SX, -POOL, -CH);
  deck(POOL, SX, CH, POOL);
  deck(-5.6, -BRW, -20, -SZ);
  deck(BRW, 5.6, -20, -SZ);
  deck(-5.6, -BRW, SZ, 20);
  deck(BRW, 5.6, SZ, 20);

  // Solid brick between the branch stubs and the side chambers. These blocks
  // are also the branch tunnel's outer wall and the sump's north/south face.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.box(sx * 7.05, 0, sz * 16.75, 2.9, CEIL, 6.5, BRICK, { tag: 'wall', jitter: 0.05 });
    }
  }

  // ---------------------------------------------------------- side chambers --
  // Pump rooms in all four corners, floored at walkway height so they hang off
  // the deck network. Their inner walls double as the main tunnel's walls.
  const rooms = [
    { x: -18.25, z: -13.2, side: 's', at: -3 },
    { x: 18.25, z: -13.2, side: 's', at: 3 },
    { x: -18.25, z: 13.2, side: 'n', at: -3 },
    { x: 18.25, z: 13.2, side: 'n', at: 3 },
  ];
  for (const r of rooms) {
    m.room({
      x: r.x, z: r.z, w: 19.5, d: 13.6, h: CEIL, floor: false, wall: BRICK,
      openings: [{ side: r.side, at: r.at, width: 3.4, height: 3.0 }],
    });
    m.floor(r.x, r.z, 19.5, 13.6, STONE, WY, WY);
  }

  // -------------------------------------------------------- stepped ceiling --
  // Brick ribs across the main tunnel. bottom(u) drops as you approach the
  // walls, so the underside reads as an arch instead of a flat slab.
  const RIB_N = 3, RIB_DROP = 1.5;
  for (const rx of [-25.5, -20, -14.5, 14.5, 20, 25.5]) {
    for (let i = 0; i < RIB_N; i++) {
      const u0 = (i / RIB_N) * TUN, u1 = ((i + 1) / RIB_N) * TUN;
      const bottom = CEIL - 0.35 - RIB_DROP * (1 - Math.sqrt(Math.max(0, 1 - (u1 / TUN) ** 2)));
      for (const s of [-1, 1]) {
        m.box(rx, bottom, s * (u0 + u1) / 2, 0.5, CEIL - bottom, u1 - u0, BRICK_DK, { jitter: 0.05 });
      }
    }
  }

  // ------------------------------------------------------------- ring pipes --
  /**
   * Half-sunk pipe you can walk through. The shell is stepped in `bands`; each
   * band sits at the arch height of its INNER edge so it never eats into the
   * bore. `axis` is the world axis the pipe runs along.
   */
  const ringPipe = (cx, cz, len, r, yBase, axis, c = IRON) => {
    const yc = yBase + r * 0.72;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const u0 = (i / bands) * r, u1 = ((i + 1) / bands) * r;
      const arch = Math.sqrt(Math.max(0, r * r - u0 * u0));
      const top = yc + arch;
      const under = yc - arch;
      for (const s of [-1, 1]) {
        const ox = axis === 'x' ? 0 : s * (u0 + u1) / 2;
        const oz = axis === 'x' ? s * (u0 + u1) / 2 : 0;
        const sx = axis === 'x' ? len : u1 - u0;
        const sz = axis === 'x' ? u1 - u0 : len;
        m.box(cx + ox, top, cz + oz, sx, yc + r + 0.4 - top, sz, c, { tag: 'pipe', jitter: 0.06 });
        if (under > yBase + 0.05) {
          m.box(cx + ox, yBase, cz + oz, sx, under - yBase, sz, c, { tag: 'pipe', jitter: 0.06 });
        }
      }
    }
    // Mouth collars: a chunky rusted frame at each end so the bore reads dark.
    for (const e of [-1, 1]) {
      const ex = axis === 'x' ? cx + e * len / 2 : cx;
      const ez = axis === 'x' ? cz : cz + e * len / 2;
      const fw = axis === 'x' ? 0.3 : r * 2.5;
      const fd = axis === 'x' ? r * 2.5 : 0.3;
      m.box(ex, yc + r + 0.1, ez, fw, 0.32, fd, RUST_DK, { solid: false, jitter: 0.08 });
      for (const s of [-1, 1]) {
        const px = axis === 'x' ? ex : cx + s * (r + 0.35);
        const pz = axis === 'x' ? cz + s * (r + 0.35) : ez;
        m.box(px, yBase, pz, axis === 'x' ? 0.3 : 0.42, yc + r, axis === 'x' ? 0.42 : 0.3,
          RUST_DK, { solid: false, jitter: 0.08 });
      }
    }
  };

  ringPipe(18, -11, 8, 1.7, WY, 'x');
  ringPipe(-22, 13, 9, 1.75, WY, 'z');
  ringPipe(5.4, -10, 6.5, 1.5, WY, 'z');
  ringPipe(0, 16.5, 6, 1.6, 0, 'z', RUST_DK);
  m.spot(18, WY, -11, { stance: 'stand', quality: 0.88, hint: 'Inside the big east pipe' });
  m.spot(-22, WY, 13, { stance: 'stand', quality: 0.86, hint: 'Inside the west pipe run' });
  m.spot(5.4, WY, -10.4, { stance: 'crouch', quality: 0.9, hint: 'Deep in the sump pipe' });
  m.spot(0, 0, 16.5, { stance: 'crouch', quality: 0.84, hint: 'Inside the flooded south pipe' });

  // ------------------------------------------------------- stairs and ramps --
  // Three steps of 0.3 clear the deck lip without exceeding stepHeight.
  const upN = (x, z0) => m.stairs(x, z0, 1.6, 3, WY / 3, 0.4, STONE_DK, { yaw: 180 });
  const upS = (x, z0) => m.stairs(x, z0, 1.6, 3, WY / 3, 0.4, STONE_DK, { yaw: 0 });
  upN(-14, -CH + 1.2); upN(14, -CH + 1.2); upN(-3.6, -CH + 1.2);
  upS(-14, CH - 1.2); upS(14, CH - 1.2); upS(3.6, CH - 1.2);
  // Down into the pool from the east and west ledges.
  m.stairs(-POOL + 1.2, -4.6, 1.6, 3, WY / 3, 0.4, STONE_DK, { yaw: 90 });
  m.stairs(POOL - 1.2, 4.6, 1.6, 3, WY / 3, 0.4, STONE_DK, { yaw: -90 });
  // Branch stubs.
  m.stairs(-BRW - 0.9, POOL + 1.2, 1.4, 3, WY / 3, 0.4, STONE_DK, { yaw: 90 });
  m.stairs(BRW + 0.9, -POOL - 1.2, 1.4, 3, WY / 3, 0.4, STONE_DK, { yaw: -90 });

  // ---------------------------------------------------------------- railings --
  const rail = (x1, z1, x2, z2) => m.fence(x1, z1, x2, z2, 1.0, IRON, { y: WY, spacing: 3 });
  rail(-27, -CH, -16, -CH); rail(-12.5, -CH, -9, -CH);
  rail(-27, CH, -16, CH); rail(-12.5, CH, -9, CH);
  rail(16, -CH, 27, -CH); rail(9, -CH, 12.5, -CH);
  rail(16, CH, 27, CH); rail(9, CH, 12.5, CH);
  rail(-POOL, -POOL, -POOL, -CH); rail(POOL, CH, POOL, POOL);
  rail(-BRW, -SZ + 0.6, -BRW, -POOL); rail(BRW, POOL, BRW, SZ - 0.6);

  // --------------------------------------------------------- pump furniture --
  /** Valve stand: housing, stem and a flat handwheel. */
  const valve = (x, z, y, yaw) => {
    m.box(x, y, z, 1.15, 1.15, 0.95, IRON, { yaw, tag: 'valve', jitter: 0.05 });
    m.box(x, y + 1.15, z, 0.7, 0.18, 0.7, RUST_DK, { yaw });
    m.cyl(x, y + 1.33, z, 0.11, 0.42, RUST);
    m.cyl(x, y + 1.72, z, 0.5, 0.08, RUST, { solid: false });
    for (let k = 0; k < 3; k++) {
      m.box(x, y + 1.74, z, 1.0, 0.06, 0.08, RUST, { yaw: k * 60, solid: false });
    }
  };
  valve(-7.5, -8.6, WY, 0);
  valve(7.5, 8.6, WY, 0);
  valve(-19, -8.4, WY, 90);
  valve(21.5, 9.2, WY, 90);
  valve(-4.4, -15.6, WY, 0);
  m.spot(-7.5, WY, -9.6, { stance: 'crouch', quality: 0.76, hint: 'Behind the sump valve stand' });
  m.spot(7.5, WY, 9.6, { stance: 'crouch', quality: 0.74, hint: 'Behind the far valve stand' });
  m.spot(-19.9, WY, -8.4, { stance: 'crouch', quality: 0.72, hint: 'Wedged beside the valve housing' });
  m.spot(22.4, WY, 9.2, { stance: 'crouch', quality: 0.7, hint: 'Behind the pump room valve' });

  /** Bar grate: blocks a body but not a sight line, which is the whole trick. */
  const grate = (x, y, z, w, h, yaw) => {
    m.box(x, y, z, w, 0.14, 0.2, RUST_DK, { yaw });
    m.box(x, y + h - 0.14, z, w, 0.14, 0.2, RUST_DK, { yaw });
    const n = Math.max(2, Math.round(w / 0.34));
    for (let i = 0; i <= n; i++) {
      const o = -w / 2 + (w / n) * i;
      const a = yaw * Math.PI / 180;
      m.box(x + o * Math.cos(a), y, z + o * Math.sin(a), 0.09, h, 0.09, RUST,
        { opaque: false, jitter: 0.07 });
    }
  };
  grate(0, 0, -19.4, 4.6, 2.8, 0);
  grate(0, 0, 19.4, 4.6, 2.8, 0);
  grate(-27.4, WY, -13.2, 3.2, 2.4, 90);
  grate(27.4, WY, 13.2, 3.2, 2.4, 90);
  m.spot(0, 0, -18.6, { stance: 'prone', quality: 0.82, hint: 'Flat against the north grate' });
  m.spot(0, 0, 18.6, { stance: 'prone', quality: 0.8, hint: 'Flat against the south grate' });

  // Steel gantry over the pool: the only prone spot with water all around it.
  m.box(-4.75, 1.18, 4.7, 3.5, 0.12, 3.0, IRON, { tag: 'gantry' });
  for (const [gx, gz] of [[-6.2, 3.4], [-3.3, 3.4], [-6.2, 6.0], [-3.3, 6.0]]) {
    m.box(gx, 0, gz, 0.18, 1.18, 0.18, IRON);
  }
  m.fence(-6.4, 6.2, -3.1, 6.2, 0.9, IRON, { y: 1.3, spacing: 1.6 });
  m.spot(-4.75, 0, 4.7, { stance: 'prone', quality: 0.85, hint: 'Under the gantry, in the water' });
  m.spot(-4.75, 1.3, 4.7, { stance: 'prone', quality: 0.56, hint: 'Flat on the gantry deck' });

  // ------------------------------------------------------------ room clutter --
  m.crateStack(-24, -10.5, MOSS_DK, 3, 1.0);
  m.crateStack(-13.5, -17, RUST_DK, 2, 1.05);
  m.crateStack(24.5, -17.5, MOSS_DK, 3, 0.95);
  m.crateStack(-24.5, 17.5, RUST_DK, 2, 1.1);
  m.table(-16, -17, 2.4, 1.0, 0.78, BRICK_DK, { y: WY });
  m.table(14.5, 17.2, 2.4, 1.0, 0.78, BRICK_DK, { y: WY });
  m.shelf(-27.3, -17.5, 3.0, 2.4, 0.7, IRON, { yaw: 90, levels: 3, y: WY });
  m.shelf(27.3, 17.5, 3.0, 2.4, 0.7, IRON, { yaw: -90, levels: 3, y: WY });
  m.locker(11.2, -18.6, 1.1, 2.1, 0.9, IRON, { yaw: 0, y: WY });
  m.locker(-11.2, 18.6, 1.1, 2.1, 0.9, IRON, { yaw: 180, y: WY });

  for (const [bx, bz] of [[-21, -17.8], [-20.1, -18.2], [22.8, -11.5], [23.7, -11.9],
    [-23.5, 9.2], [-22.6, 9.6], [16.5, 11.4], [17.4, 11.0], [-9.9, -8.4], [9.9, 8.4]]) {
    m.barrel(bx, bz, m.pick([MOSS_DK, RUST_DK, ALGAE]), { y: WY });
  }
  m.spot(-20.5, WY, -18.9, { stance: 'crouch', quality: 0.7, hint: 'Between the barrels' });
  m.spot(23.2, WY, -12.6, { stance: 'crouch', quality: 0.68, hint: 'Behind the drum pair' });

  // Sludge pumps: chunky boxes that break the pump rooms into pockets.
  for (const [px, pz, pyaw] of [[-16.5, -10.5, 0], [16.5, -15.5, 90], [-16.5, 15.5, 90], [16.5, 10.5, 0]]) {
    m.box(px, WY, pz, 3.2, 1.5, 1.9, IRON, { yaw: pyaw, tag: 'pump', jitter: 0.05 });
    m.cyl(px, WY + 1.5, pz, 0.62, 0.9, RUST_DK);
    m.box(px, WY + 2.4, pz, 1.6, 0.25, 1.6, RUST, { solid: false });
    m.spot(px + (pyaw ? 2.1 : 0), WY, pz + (pyaw ? 0 : 1.5),
      { stance: 'crouch', quality: 0.75, hint: 'Tucked behind a sludge pump' });
  }

  // ------------------------------------------------------------ wall dressing --
  // Pilasters keep the long tunnel walls from reading as one flat band.
  for (let i = 0; i < 14; i++) {
    const x = -26 + i * 4;
    if (Math.abs(x) < SX) continue;
    for (const s of [-1, 1]) {
      m.box(x, 0, s * (TUN - 0.35), 0.5, CEIL - 0.4, 0.35, BRICK_DK, { jitter: 0.06 });
    }
  }
  // Damp courses and moss creep along the waterline.
  for (let i = 0; i < 26; i++) {
    const x = m.range(-27, 27);
    if (Math.abs(x) < SX) continue;
    const s = m.chance(0.5) ? -1 : 1;
    m.box(x, m.range(0.1, 1.4), s * (TUN - 0.2), m.range(0.8, 2.6), m.range(0.3, 0.9), 0.08,
      m.pick([MOSS, MOSS_DK, ALGAE, STAIN]), { solid: false, jitter: 0.1, tag: 'moss' });
  }
  for (let i = 0; i < 16; i++) {
    const x = m.range(-27, 27);
    if (Math.abs(x) < SX) continue;
    const s = m.chance(0.5) ? -1 : 1;
    m.box(x, m.range(2.4, 4.2), s * (TUN - 0.2), m.range(0.3, 0.7), m.range(0.9, 2.1), 0.07,
      m.pick([STAIN, RUST_DK, MOSS_DK]), { solid: false, jitter: 0.1, tag: 'stain' });
  }
  // Moss on the sump ledges, where a green-painted hider disappears.
  for (let i = 0; i < 18; i++) {
    const s = m.chance(0.5) ? -1 : 1;
    m.box(s * m.range(POOL + 0.2, SX - 0.2), WY, m.range(-SZ + 1, SZ - 1),
      m.range(0.7, 1.8), 0.03, m.range(0.7, 1.8), m.pick([MOSS, MOSS_DK, ALGAE]),
      { solid: false, jitter: 0.12, tag: 'moss' });
  }

  // Service pipes bracketed high on the tunnel walls.
  for (const s of [-1, 1]) {
    m.pipe(-27, 3.4, s * (TUN - 0.55), -SX, s * (TUN - 0.55), 0.18, RUST, { jitter: 0.05 });
    m.pipe(SX, 3.4, s * (TUN - 0.55), 27, s * (TUN - 0.55), 0.18, RUST, { jitter: 0.05 });
    m.pipe(-27, 4.1, s * (TUN - 0.85), -SX, s * (TUN - 0.85), 0.12, IRON, { jitter: 0.05 });
    m.pipe(SX, 4.1, s * (TUN - 0.85), 27, s * (TUN - 0.85), 0.12, IRON, { jitter: 0.05 });
  }
  for (let i = 0; i < 12; i++) {
    const x = -25 + i * 4.5;
    if (Math.abs(x) < SX) continue;
    for (const s of [-1, 1]) m.box(x, 3.2, s * (TUN - 0.4), 0.14, 1.1, 0.5, IRON, { solid: false });
  }

  // Floating debris - planks and drums riding the channel.
  for (let i = 0; i < 30; i++) {
    const inPool = m.chance(0.42);
    const x = inPool ? m.range(-POOL + 0.7, POOL - 0.7) : m.range(-26, 26);
    const z = inPool ? (m.chance(0.5) ? m.range(-POOL, -CH) : m.range(CH, POOL)) : m.range(-CH + 0.5, CH - 0.5);
    m.box(x, 0.16, z, m.range(0.5, 1.9), m.range(0.06, 0.18), m.range(0.16, 0.5),
      m.pick([RUST_DK, MOSS_DK, BRICK_DK, STAIN]), { solid: false, yaw: m.range(0, 180), jitter: 0.12 });
  }
  for (let i = 0; i < 4; i++) {
    m.cyl(m.range(-22, 22), 0.1, m.range(-CH + 0.7, CH - 0.7), 0.32, 0.5,
      m.pick([RUST, MOSS_DK]), { solid: false, jitter: 0.1 });
  }

  // ------------------------------------------------------------------ lights --
  // Grated shafts: a bright slab under a ceiling grate plus the visible column.
  for (const [lx, lz] of [[-17, 0], [0, -9.5], [17, 0]]) {
    for (let i = -2; i <= 2; i++) {
      m.box(lx + i * 0.4, CEIL - 0.18, lz, 0.14, 0.16, 1.8, IRON, { solid: false });
    }
    m.box(lx, 0, lz, 1.9, CEIL - 0.2, 1.9, '#cfe0b4',
      { solid: false, opaque: false, emis: 0.35, tag: 'shaft' });
    m.light(lx, CEIL - 0.8, lz, '#d6e6bc', 1.5, 16);
  }
  // Sparse caged wall lamps.
  for (const [lx, ly, lz] of [[-23, 3.5, -TUN + 0.7], [-11, 3.5, TUN - 0.7], [11, 3.5, -TUN + 0.7],
    [23, 3.5, TUN - 0.7], [-18.25, 3.6, -13.2], [18.25, 3.6, -13.2],
    [-18.25, 3.6, 13.2], [18.25, 3.6, 13.2], [0, 4.0, 16.5], [0, 4.0, -16.5]]) {
    m.box(lx, ly, lz, 0.4, 0.34, 0.4, '#ffd9a0', { solid: false, emis: 1.8 });
    m.light(lx, ly - 0.1, lz, '#ffcb8a', 0.55, 9);
  }
  m.light(0, 3.4, 0, '#8fd6b4', 0.5, 14);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-20, -17, WY);
  m.spawnHider(20, -17, WY);
  m.spawnHider(-16.5, 17, WY);
  m.spawnHider(20, 17, WY);
  m.spawnHider(0, -16.5 + 3.6, 0);
  m.spawnHider(0, 16.5 - 3.6, 0);
  m.spawnHider(-7.4, -12, WY);
  m.spawnHider(7.4, 12, WY);
  m.spawnHider(0, 0, 0);
  m.spawnHider(-3.5, 5.6, 0);
  m.spawnHider(11, -4.6, WY);
  m.spawnHider(-11, 4.6, WY);
  m.spawnSeeker(-25.5, -4.6, WY);
  m.spawnSeeker(-25.5, 4.6, WY);
  m.spawnSeeker(-24, 0, 0);
  m.spawnSeeker(-26.5, 0, 0);
  m.lobbySpawn(-22, 0, 0);

  m.palette([BRICK, BRICK_DK, STONE, STONE_DK, MOSS, MOSS_DK, ALGAE, WATER, RUST, RUST_DK, IRON, STAIN]);
  return m.finish();
}
