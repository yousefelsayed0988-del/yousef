// Subway. An island platform a metre above two track trenches, a stopped
// carriage you can walk through, and a ticket hall at the east end with a
// stair to the mezzanine. Three usable heights - trench, platform, mezzanine -
// and the trenches are the dark route that lets a hider cross the map unseen.

import { createMap } from './kit.js';

export const meta = {
  id: 'subway',
  name: 'Subway',
  theme: 'metro station',
  tagline: 'Cream tile, teal dado and a train that is not leaving. Mind the gap.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [64, 22],
    ceiling: 7.6,
    sky: '#12161a',
    ambient: '#3f4a52',
    sunDir: [-0.2, -0.95, -0.24],
    sunColor: '#cfe0ea',
    sunIntensity: 0.16,
    fog: '#141a1f',
    fogDensity: 0.026,
  });

  const CREAM = '#ded5c0';
  const CREAM_DK = '#bfb6a1';
  const TEAL = '#2e7f80';
  const TEAL_DK = '#1d5a5c';
  const CONCRETE = '#8d8d88';
  const CONCRETE_DK = '#5f6064';
  const STEEL = '#99a0a6';
  const RUST = '#7a4a2c';
  const TRAIN = '#c5c9ce';
  const ACCENT = '#bd3a2e';
  const SEAT = '#2f4f8a';
  const AMBER = '#dfa42c';
  const DARK = '#26282c';
  const GLASS = '#b6cfd6';

  const PLAT_Y = 1.0;
  // Ballast top. Trench-level spawns and spots stand on it, not on the slab
  // underneath, so they have to declare this height and not zero.
  const BALLAST_Y = 0.18;
  const PLAT_X0 = -29, PLAT_X1 = 19;
  const TR_N = -7.7, TR_S = 7.7;      // track centrelines
  const CAR_Z = -7.0;                 // the stopped carriage sits off-centre,
                                      // hard against the platform edge

  // ------------------------------------------------------------------ shell --
  m.perimeter(11, CONCRETE_DK);
  m.box(0, -0.4, 0, 64, 0.4, 22, CONCRETE_DK, { tag: 'floor', rough: 0.9 });
  // Suspended ceiling over the platform and tracks; the ticket hall stays open.
  m.box(-6.25, 4.8, 0, 51.5, 0.35, 21.4, CONCRETE_DK, { tag: 'ceiling' });
  m.ceil(25.5, 0, 13, 21.4, CONCRETE_DK, 7.6);

  // Platform: a narrow core with a lip over it, so the trench side has a real
  // undercut you can lie in rather than a flat concrete cliff.
  m.box((PLAT_X0 + PLAT_X1) / 2, 0, 0, PLAT_X1 - PLAT_X0, 0.72, 8.4, CONCRETE, { tag: 'platformCore' });
  m.box((PLAT_X0 + PLAT_X1) / 2, 0.72, 0, PLAT_X1 - PLAT_X0, 0.28, 10.0, CONCRETE, { tag: 'platformLip' });
  for (const s of [-1, 1]) {
    m.box((PLAT_X0 + PLAT_X1) / 2, 0.99, s * 4.4, PLAT_X1 - PLAT_X0, 0.03, 0.9, AMBER,
      { solid: false, tag: 'tactile' });
  }
  // Ticket hall floor, which also caps the ends of both trenches.
  m.box(25.5, 0, 0, 13, PLAT_Y, 21.4, CONCRETE, { tag: 'concourseFloor' });

  // ------------------------------------------------------------ tiled walls --
  for (const s of [-1, 1]) {
    const z = s * 10.55;
    m.box(-6.25, 0, z, 51.5, 0.9, 0.2, CONCRETE_DK, { tag: 'tileSkirt' });
    m.box(-6.25, 0.9, z, 51.5, 1.5, 0.2, TEAL, { tag: 'dado' });
    m.box(-6.25, 2.4, z, 51.5, 2.4, 0.2, CREAM, { tag: 'tileField' });
  }
  // Ticket hall tiling, taller because the hall is open to the roof.
  for (const [tx, tz, tw, td] of [[25.5, -10.55, 13, 0.2], [25.5, 10.55, 13, 0.2], [31.6, 0, 0.2, 21.4]]) {
    m.box(tx, 1.0, tz, tw, 1.6, td, TEAL, { tag: 'dado' });
    m.box(tx, 2.6, tz, tw, 4.4, td, CREAM, { tag: 'tileField' });
  }
  // Loose tiles and grime: the wheel needs more than two flat greys.
  for (let i = 0; i < 34; i++) {
    const s = m.chance(0.5) ? -1 : 1;
    const x = m.range(-30, 18);
    m.box(x, m.range(1.0, 4.4), s * 10.42, m.range(0.5, 1.6), m.range(0.4, 1.1), 0.06,
      m.pick([CREAM, CREAM_DK, TEAL, TEAL_DK]), { solid: false, jitter: 0.14, tag: 'tile' });
  }
  for (let i = 0; i < 12; i++) {
    const s = m.chance(0.5) ? -1 : 1;
    m.box(m.range(-30, 18), m.range(0.9, 2.2), s * 10.4, m.range(0.6, 2.2), m.range(0.3, 0.8), 0.05,
      m.pick([TEAL_DK, RUST, CONCRETE_DK]), { solid: false, jitter: 0.16, tag: 'grime' });
  }

  // West portal: the platform stops, the tunnels keep going into the dark.
  m.box(-29.4, 0, 0, 0.6, 4.8, 10.4, CREAM_DK, { tag: 'endWall' });
  for (const tz of [TR_N, TR_S]) {
    m.box(-29.4, 0, tz, 0.7, 4.4, 4.6, CONCRETE_DK, { tag: 'portalFrame' });
    m.box(-30.8, 0, tz, 2.4, 3.6, 3.9, '#0b0d10', { solid: false, tag: 'tunnelDark' });
    m.box(-29.4, 3.6, tz, 0.8, 0.5, 4.2, RUST, { solid: false, jitter: 0.1, tag: 'portalArch' });
  }
  m.spot(-30.6, BALLAST_Y, TR_N, { stance: 'stand', quality: 0.88, hint: 'Inside the north tunnel mouth' });
  m.spot(-30.6, BALLAST_Y, TR_S, { stance: 'stand', quality: 0.86, hint: 'Inside the south tunnel mouth' });

  // --------------------------------------------------------------- trackwork --
  for (const tz of [TR_N, TR_S]) {
    m.box(-6.4, 0, tz, 49.2, BALLAST_Y, 4.2, '#4b4741', { tag: 'ballast', jitter: 0.06 });
    for (const s of [-1, 1]) {
      m.box(-6.4, BALLAST_Y, tz + s * 0.72, 49.2, 0.14, 0.12, STEEL, { tag: 'rail', metal: 0.7, rough: 0.35 });
    }
    for (let i = 0; i < 21; i++) {
      m.box(-30.5 + i * 2.4, 0.16, tz, 0.24, 0.12, 2.1, '#3b332a',
        { solid: false, jitter: 0.12, tag: 'sleeper' });
    }
    // Buffer stop where the trench dies under the ticket hall.
    m.box(18.4, 0.2, tz, 0.5, 1.1, 2.4, RUST, { tag: 'bufferStop', jitter: 0.08 });
    m.box(18.4, 1.3, tz, 0.6, 0.3, 2.6, AMBER, { solid: false });
  }
  m.spot(17.2, BALLAST_Y, TR_S, { stance: 'crouch', quality: 0.8, hint: 'Behind the south buffer stop' });
  // Signals and cable trays.
  for (const [sx, sz] of [[-18, TR_N], [4, TR_S]]) {
    m.cyl(sx, 0.2, sz + 1.85, 0.09, 2.4, CONCRETE_DK, { tag: 'signalPost' });
    m.box(sx, 2.4, sz + 1.85, 0.3, 0.8, 0.3, DARK, { tag: 'signalHead' });
    m.sphere(sx, 2.72, sz + 1.6, 0.11, '#d03a2c', { solid: false, emis: 1.6 });
  }
  for (const s of [-1, 1]) {
    m.pipe(-30, 1.5, s * 10.2, 18, s * 10.2, 0.11, DARK, { solid: false });
    m.pipe(-30, 1.8, s * 10.2, 18, s * 10.2, 0.08, RUST, { solid: false });
    for (let i = 0; i < 5; i++) {
      m.box(-28 + i * 11, 1.2, s * 10.25, 0.16, 0.8, 0.28, STEEL, { solid: false, tag: 'bracket' });
    }
  }
  for (let i = 0; i < 12; i++) {
    const tz = m.chance(0.5) ? TR_N : TR_S;
    m.box(m.range(-28, 17), 0.2, tz + m.range(-1.8, 1.8), m.range(0.2, 0.6), 0.08, m.range(0.2, 0.5),
      m.pick([CREAM_DK, RUST, '#3b3f44', AMBER]), { solid: false, yaw: m.range(0, 180), tag: 'litter' });
  }

  // Steps down into each trench, so the low route is actually reachable.
  m.stairs(-22, -6.6, 1.8, 3, PLAT_Y / 3, 0.5, CONCRETE_DK, { yaw: 0 });
  m.stairs(0, 6.6, 1.8, 3, PLAT_Y / 3, 0.5, CONCRETE_DK, { yaw: 180 });

  // Under-lip hides: the single best low cover on the map.
  m.spot(-24, 0, -5.25, { stance: 'prone', quality: 0.86, hint: 'Under the platform lip, north side' });
  m.spot(-8, 0, 5.25, { stance: 'prone', quality: 0.86, hint: 'Under the platform lip, south side' });
  m.spot(9, 0, 5.25, { stance: 'prone', quality: 0.82, hint: 'Flat in the south trench' });
  m.spot(-25, BALLAST_Y, -9.6, { stance: 'crouch', quality: 0.78, hint: 'In the north trench, past the train' });

  // ---------------------------------------------------------------- carriage --
  const CX0 = -14, CX1 = 12;
  const CXC = (CX0 + CX1) / 2, CLEN = CX1 - CX0;
  const CAR_FLOOR = 1.05;
  m.box(CXC, 0.32, CAR_Z, CLEN - 0.6, 0.62, 2.4, DARK, { tag: 'underframe' });
  for (const bx of [CX0 + 4, CX1 - 4]) {
    m.box(bx, 0.2, CAR_Z, 3.0, 0.5, 2.6, '#1e2024', { tag: 'bogie' });
    for (const s of [-1, 1]) m.cyl(bx + s * 1.0, 0.2, CAR_Z, 0.34, 0.18, STEEL, { solid: false, yaw: 90 });
  }
  m.box(CXC, 0.95, CAR_Z, CLEN, 0.1, 3.0, TRAIN, { tag: 'carFloor' });
  m.box(CXC, CAR_FLOOR, CAR_Z, CLEN - 0.3, 0.02, 2.7, '#4a4f56', { solid: false, tag: 'carLino' });
  // Roof is sight-blocking but not standable: nobody camps a 3.5 m train roof
  // under a 4.8 m ceiling, and leaving it non-solid keeps the interior clean.
  m.box(CXC, 3.3, CAR_Z, CLEN + 0.2, 0.28, 3.2, TRAIN, { solid: false, tag: 'carRoof' });

  const carSide = (z) => {
    m.box(CXC, CAR_FLOOR, z, CLEN, 0.75, 0.1, TRAIN, { tag: 'carSide' });
    m.box(CXC, 1.8, z, CLEN - 1.0, 0.95, 0.1, GLASS, { opaque: false, rough: 0.1, tag: 'carWindow' });
    m.box(CXC, 2.75, z, CLEN, 0.55, 0.1, TRAIN, { tag: 'carSide' });
  };
  carSide(CAR_Z - 1.45);
  // Platform side is broken by three sets of open doors.
  const DOORS = [-10, -1, 8];
  const segs = [[CX0, -10.7], [-9.3, -1.7], [-0.3, 7.3], [8.7, CX1]];
  for (const [a, b] of segs) {
    const c = (a + b) / 2, l = b - a;
    m.box(c, CAR_FLOOR, CAR_Z + 1.45, l, 0.75, 0.1, TRAIN, { tag: 'carSide' });
    m.box(c, 1.8, CAR_Z + 1.45, l - 0.5, 0.95, 0.1, GLASS, { opaque: false, rough: 0.1, tag: 'carWindow' });
    m.box(c, 2.75, CAR_Z + 1.45, l, 0.55, 0.1, TRAIN, { tag: 'carSide' });
  }
  for (const dx of [...DOORS]) {
    for (const s of [-1, 1]) {
      m.box(dx + s * 0.72, CAR_FLOOR, CAR_Z + 1.45, 0.14, 2.25, 0.16, AMBER, { tag: 'doorPost' });
    }
  }
  for (const [ex, sgn] of [[CX0 - 0.05, -1], [CX1 + 0.05, 1]]) {
    m.box(ex, CAR_FLOOR, CAR_Z, 0.12, 2.25, 3.0, TRAIN, { tag: 'carEnd' });
    m.box(ex + sgn * 0.04, 1.85, CAR_Z, 0.06, 0.85, 1.5, GLASS, { opaque: false, tag: 'cabWindow' });
  }
  for (const s of [-1, 1]) {
    m.box(CXC, 1.68, CAR_Z + s * 1.52, CLEN, 0.2, 0.05, ACCENT, { solid: false, tag: 'livery' });
  }

  // Interior: facing bench seats, poles, a ceiling handrail.
  for (const [sx, sz] of [[-11.5, -1], [-11.5, 1], [-6.5, -1], [-6.5, 1],
    [1.5, -1], [1.5, 1], [6.5, -1], [9.5, 1]]) {
    const z = CAR_Z + sz * 1.1;
    m.box(sx, CAR_FLOOR, z, 2.1, 0.45, 0.5, SEAT, { tag: 'seat', jitter: 0.06 });
    m.box(sx, CAR_FLOOR + 0.45, z + sz * 0.2, 2.1, 0.55, 0.1, SEAT, { tag: 'seatBack', jitter: 0.06 });
  }
  for (const [px, pz] of [[-11, -0.55], [-6, 0.55], [-1, -0.55], [4, 0.55], [9, -0.55]]) {
    m.cyl(px, CAR_FLOOR, CAR_Z + pz, 0.045, 2.2, STEEL, { tag: 'grabPole', metal: 0.6 });
  }
  for (const s of [-1, 1]) {
    m.box(CXC, 2.85, CAR_Z + s * 0.55, CLEN - 1.5, 0.05, 0.05, STEEL, { solid: false, tag: 'handrail' });
    for (let i = 0; i < 7; i++) {
      m.box(CX0 + 2 + i * 3.5, 2.45, CAR_Z + s * 0.55, 0.06, 0.4, 0.06, DARK, { solid: false, tag: 'strap' });
    }
  }
  m.box(CXC, 3.16, CAR_Z, CLEN - 1.0, 0.06, 0.5, '#f0f6fa', { solid: false, emis: 2.0, tag: 'carLight' });

  m.spot(-12.6, CAR_FLOOR, CAR_Z, { stance: 'prone', quality: 0.82, hint: 'Flat in the carriage aisle' });
  m.spot(11.2, CAR_FLOOR, CAR_Z, { stance: 'stand', quality: 0.86, hint: 'Jammed against the cab end' });
  m.spot(-3.4, CAR_FLOOR, CAR_Z - 0.6, { stance: 'crouch', quality: 0.7, hint: 'Crouched between the grab poles' });
  m.spot(6.6, CAR_FLOOR, CAR_Z + 0.6, { stance: 'crouch', quality: 0.74, hint: 'Behind the last row of seats' });

  // ------------------------------------------------------- platform fittings --
  const PILLARS = [-26, -20.5, -15, -9.5, -4, 1.5, 7, 12.5, 17];
  for (let i = 0; i < PILLARS.length; i++) {
    const px = PILLARS[i];
    m.box(px, PLAT_Y, 0, 1.1, 0.16, 1.1, CONCRETE_DK, { tag: 'pillarBase' });
    m.cyl(px, PLAT_Y, 0, 0.42, 3.8, CREAM_DK, { tag: 'pillar', jitter: 0.05 });
    m.box(px, PLAT_Y + 0.16, 0, 0.92, 0.9, 0.06, TEAL, { solid: false, tag: 'pillarBand' });
    for (const s of [-1, 1]) {
      m.box(px, PLAT_Y + 1.2, s * 0.5, 0.8, 1.2, 0.05,
        m.pick([ACCENT, TEAL_DK, SEAT, AMBER, '#5a3d7a']), { solid: false, emis: 0.16, tag: 'routePoster' });
    }
  }
  m.spot(-20.5, PLAT_Y, 0.9, { stance: 'crouch', quality: 0.56, hint: 'Behind a platform pillar' });
  m.spot(7, PLAT_Y, -0.9, { stance: 'crouch', quality: 0.56, hint: 'Tight to a pillar, poster side' });

  const bench = (x, z, yaw) => {
    m.box(x, PLAT_Y + 0.4, z, 2.6, 0.12, 0.5, '#4d5259', { yaw, tag: 'bench' });
    m.box(x, PLAT_Y + 0.52, z + 0.2, 2.6, 0.45, 0.08, '#4d5259', { yaw, tag: 'benchBack' });
    for (const s of [-1, 1]) m.box(x + s * 1.0, PLAT_Y, z, 0.14, 0.4, 0.45, STEEL, { yaw, tag: 'benchLeg' });
  };
  bench(-24, 3.2, 0);
  bench(-17, -3.2, 0);
  bench(-11, 3.2, 0);
  bench(-1, -3.2, 0);
  bench(5, 3.2, 0);
  bench(14, -3.2, 0);
  m.spot(-24, PLAT_Y, 3.9, { stance: 'prone', quality: 0.64, hint: 'Flat behind a platform bench' });
  m.spot(14, PLAT_Y, -3.9, { stance: 'prone', quality: 0.62, hint: 'Behind the far bench' });

  const vending = (x, z, yaw, c) => {
    const a = yaw * Math.PI / 180;
    m.box(x, PLAT_Y, z, 1.1, 1.95, 0.75, c, { yaw, tag: 'vending', jitter: 0.05 });
    m.box(x - Math.sin(a) * 0.34, PLAT_Y + 0.55, z + Math.cos(a) * 0.34, 0.9, 1.15, 0.08, GLASS,
      { yaw, opaque: false, rough: 0.1, emis: 0.3, tag: 'vendGlass' });
    for (let i = 0; i < 4; i++) {
      m.box(x - Math.sin(a) * 0.2 + m.range(-0.3, 0.3), PLAT_Y + 0.65 + i * 0.28,
        z + Math.cos(a) * 0.2, 0.18, 0.22, 0.1,
        m.pick([ACCENT, AMBER, TEAL, SEAT, '#e0e4e8']), { yaw, solid: false, jitter: 0.18, tag: 'snack' });
    }
  };
  vending(-13.4, 4.0, 180, ACCENT);
  vending(-12.2, 4.0, 180, SEAT);
  vending(-11.0, 4.0, 180, TEAL_DK);
  vending(9.6, -4.0, 0, ACCENT);
  vending(10.8, -4.0, 0, AMBER);
  m.spot(-14.3, PLAT_Y, 4.1, { stance: 'crouch', quality: 0.76, hint: 'At the end of the vending bank' });
  m.spot(10.2, PLAT_Y, -5.1, { stance: 'crouch', quality: 0.7, hint: 'Squeezed behind the snack machines' });

  for (const [bx, bz] of [[-27, 3.4], [-6, -3.6], [3, 3.6], [16, -3.6]]) {
    m.cyl(bx, PLAT_Y, bz, 0.33, 0.95, CONCRETE_DK, { tag: 'litterBin' });
    m.cyl(bx, PLAT_Y + 0.95, bz, 0.36, 0.1, STEEL, { solid: false });
  }
  for (const dx of [-22, -7, 8]) {
    m.box(dx, 3.5, 0, 2.6, 0.7, 0.16, DARK, { solid: false, tag: 'departureBoard' });
    m.box(dx, 3.62, 0.09, 2.3, 0.42, 0.04, '#ffb43a', { solid: false, emis: 1.5, tag: 'departureText' });
  }
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1;
    m.box(-27 + Math.floor(i / 2) * 12, 2.6, s * 10.4, 4.0, 0.8, 0.05, TEAL_DK,
      { solid: false, emis: 0.18, tag: 'stationName' });
    m.box(-27 + Math.floor(i / 2) * 12, 2.78, s * 10.36, 3.4, 0.4, 0.04, CREAM,
      { solid: false, tag: 'stationText' });
  }
  m.box(PLAT_X0 + 0.6, PLAT_Y, 0, 0.4, 2.6, 4.0, CREAM_DK, { tag: 'endPanel' });
  m.box(PLAT_X0 + 0.42, PLAT_Y + 0.9, 0, 0.06, 1.4, 3.2, TEAL, { solid: false, tag: 'endMap' });
  m.spot(PLAT_X0 + 1.2, PLAT_Y, 2.6, { stance: 'crouch', quality: 0.72, hint: 'In the west platform alcove' });

  // ------------------------------------------------------------- ticket hall --
  const gateWall = (z, len) => m.box(20.8, PLAT_Y, z, 0.4, 6.6, len, CREAM_DK, { tag: 'wall' });
  gateWall(-7.6, 5.6);
  gateWall(7.6, 5.6);
  m.box(20.8, PLAT_Y + 3.2, 0, 0.4, 3.4, 9.6, CREAM_DK, { tag: 'wall' });
  m.box(20.55, PLAT_Y + 2.4, 0, 0.12, 0.75, 6.0, TEAL, { solid: false, emis: 0.3, tag: 'wayfinding' });

  const CAB_Z = [-4.5, -2.6, -0.7, 1.2, 3.1, 5.0];
  for (const cz of CAB_Z) {
    m.box(20.8, PLAT_Y, cz, 1.3, 1.0, 0.55, STEEL, { tag: 'turnstile', jitter: 0.05 });
    m.box(20.8, PLAT_Y + 1.0, cz, 1.36, 0.08, 0.6, CONCRETE_DK, { tag: 'turnstileTop' });
    m.box(20.3, PLAT_Y + 1.02, cz, 0.24, 0.05, 0.24, '#3fd07a', { solid: false, emis: 1.4 });
  }
  for (let i = 0; i < CAB_Z.length - 1; i++) {
    const gz = (CAB_Z[i] + CAB_Z[i + 1]) / 2;
    for (const k of [-1, 0, 1]) {
      m.box(21.0, PLAT_Y + 0.72, gz, 0.06, 0.06, 0.9, STEEL, { solid: false, yaw: k * 60, tag: 'tripod' });
    }
  }
  m.spot(19.6, PLAT_Y, 5.7, { stance: 'crouch', quality: 0.62, hint: 'At the end of the turnstile bank' });

  const ticketMachine = (x, z, yaw) => {
    const a = yaw * Math.PI / 180;
    m.box(x, PLAT_Y, z, 0.95, 1.85, 0.7, CONCRETE_DK, { yaw, tag: 'ticketMachine' });
    m.box(x - Math.sin(a) * 0.3, PLAT_Y + 1.0, z + Math.cos(a) * 0.3, 0.6, 0.45, 0.1, '#1f5f7a',
      { yaw, solid: false, emis: 0.9, tag: 'ticketScreen' });
    m.box(x - Math.sin(a) * 0.32, PLAT_Y + 0.6, z + Math.cos(a) * 0.32, 0.4, 0.12, 0.08, AMBER,
      { yaw, solid: false, tag: 'ticketSlot' });
    m.box(x, PLAT_Y + 1.85, z, 1.0, 0.12, 0.75, TEAL, { yaw, solid: false });
  };
  ticketMachine(24.2, -9.6, 0);
  ticketMachine(26.0, -9.6, 0);
  ticketMachine(27.8, -9.6, 0);
  ticketMachine(31.1, -3.0, -90);
  ticketMachine(31.1, -1.0, -90);
  m.spot(26.0, PLAT_Y, -8.7, { stance: 'crouch', quality: 0.72, hint: 'Behind the ticket machines' });
  m.spot(31.0, PLAT_Y, -2.0, { stance: 'crouch', quality: 0.68, hint: 'In the machine bay, east wall' });

  m.box(23.0, PLAT_Y, -6.2, 2.6, 2.4, 0.3, CREAM_DK, { tag: 'mapBoard' });
  m.box(23.0, PLAT_Y + 0.5, -6.0, 2.2, 1.5, 0.06, '#e8eef0', { solid: false, tag: 'networkMap' });
  for (let i = 0; i < 7; i++) {
    m.box(23.0 + m.range(-0.9, 0.9), PLAT_Y + 0.7 + m.range(0, 1.1), -5.96, m.range(0.4, 1.4), 0.07, 0.03,
      m.pick([ACCENT, SEAT, TEAL, AMBER, '#5a3d7a']), { solid: false, yaw: m.range(-30, 30), tag: 'mapLine' });
  }
  m.spot(23.0, PLAT_Y, -6.9, { stance: 'stand', quality: 0.7, hint: 'Behind the network map board' });
  bench(24.5, 9.4, 0);
  m.box(29.0, PLAT_Y, 9.6, 2.4, 2.3, 0.7, TEAL_DK, { tag: 'kioskStand' });
  m.box(29.0, PLAT_Y + 1.1, 9.2, 2.2, 0.1, 0.6, CREAM, { solid: false });
  m.spot(29.0, PLAT_Y, 8.6, { stance: 'crouch', quality: 0.74, hint: 'Ducked at the closed news kiosk' });

  // --------------------------------------------------------------- mezzanine --
  m.stairs(26.5, -2.6, 3.4, 12, 3.4 / 12, 0.5, CONCRETE, { yaw: 0, y: PLAT_Y });
  // The deck stops at the face of the tiled hall wall (z = 10.45); running it
  // further would bury it in the wall and push it past the level bounds.
  m.box(26.5, 4.0, 6.95, 8.0, 0.4, 6.9, CONCRETE, { tag: 'mezzDeck' });
  for (const [bx, bz, bw, bd] of [[22.6, 6.95, 0.2, 6.9], [23.5, 3.55, 2.2, 0.2], [29.5, 3.55, 2.2, 0.2]]) {
    m.box(bx, 4.4, bz, bw, 1.0, bd, STEEL, { opaque: false, tag: 'balustrade' });
    m.box(bx, 5.4, bz, bw + 0.1, 0.08, bd + 0.1, CONCRETE_DK, { solid: false, tag: 'handrail' });
  }
  m.box(28.6, 4.4, 9.3, 3.4, 2.2, 2.2, CREAM_DK, { tag: 'mezzOffice' });
  m.box(26.85, 4.9, 9.3, 0.1, 1.1, 1.6, GLASS, { opaque: false, rough: 0.1, tag: 'officeGlass' });
  m.box(28.6, 6.6, 9.3, 3.5, 0.12, 2.3, CONCRETE_DK, { solid: false });
  vending(23.6, 9.8, 180, SEAT);
  vending(24.8, 9.8, 180, ACCENT);
  bench(25.6, 5.4, 0);
  m.spot(24.4, 4.4, 8.9, { stance: 'crouch', quality: 0.78, hint: 'Behind the mezzanine vending pair' });
  m.spot(26.4, 4.4, 10.0, { stance: 'stand', quality: 0.8, hint: 'Beside the mezzanine office' });
  m.spot(23.4, 4.4, 5.8, { stance: 'prone', quality: 0.62, hint: 'Flat along the mezzanine rail' });
  m.spot(23.6, PLAT_Y, 3.0, { stance: 'crouch', quality: 0.8, hint: 'In the dead corner beside the stair' });

  // ---------------------------------------------------------------- lighting --
  for (let i = 0; i < 12; i++) {
    m.box(-28 + i * 4.2, 4.62, 0, 0.3, 0.1, 3.2, '#eef6fa', { solid: false, emis: 2.6, tag: 'fluoro' });
  }
  for (const [fx, fz] of [[23.5, -8], [23.5, 0], [23.5, 8], [30.0, -6], [30.0, 2], [26.5, -4]]) {
    m.box(fx, 7.4, fz, 2.4, 0.1, 0.3, '#eef6fa', { solid: false, emis: 2.4, tag: 'fluoro' });
  }
  for (const lx of [-26, -20, -14, -8, -2, 4, 10, 16]) m.light(lx, 4.4, 0, '#dfeaf2', 0.62, 13);
  m.light(-22, 1.9, TR_N, '#8fb4c4', 0.3, 10);
  m.light(6, 1.9, TR_S, '#8fb4c4', 0.3, 10);
  m.light(-8, 2.9, CAR_Z, '#eef4f8', 0.5, 7);
  m.light(6, 2.9, CAR_Z, '#eef4f8', 0.5, 7);
  m.light(24, 5.6, -6, '#e4eef4', 0.8, 15);
  m.light(24, 5.6, 4, '#e4eef4', 0.8, 15);
  m.light(30, 5.6, 0, '#e4eef4', 0.7, 13);
  m.light(26.5, 6.6, 8, '#e4eef4', 0.6, 12);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-26.5, 2.6, PLAT_Y);
  m.spawnHider(-23, -2.6, PLAT_Y);
  m.spawnHider(-18, 2.6, PLAT_Y);
  m.spawnHider(-6, -2.6, PLAT_Y);
  m.spawnHider(3, 2.6, PLAT_Y);
  m.spawnHider(15, -1.6, PLAT_Y);
  m.spawnHider(-8, CAR_Z, CAR_FLOOR);
  m.spawnHider(6, CAR_Z, CAR_FLOOR);
  m.spawnHider(-24, -9.6, BALLAST_Y);
  m.spawnHider(-14, TR_S, BALLAST_Y);
  m.spawnHider(8, TR_S, BALLAST_Y);
  m.spawnHider(-27.2, -1.6, PLAT_Y);
  m.spawnSeeker(23.5, -3.5, PLAT_Y);
  m.spawnSeeker(22.0, -5.0, PLAT_Y);
  m.spawnSeeker(24.6, -5.4, PLAT_Y);
  m.spawnSeeker(22.4, -2.4, PLAT_Y);
  m.lobbySpawn(23.0, -4.0, PLAT_Y);

  m.palette([CREAM, CREAM_DK, TEAL, TEAL_DK, CONCRETE, CONCRETE_DK, STEEL, RUST,
    TRAIN, ACCENT, SEAT, AMBER, DARK, GLASS]);
  return m.finish();
}
