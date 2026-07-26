// Viking Hall - one long timber room down a single axis. The firepit splits it
// into two mirrored feasting aisles, the carved posts split those aisles again,
// and the only real open ground is the strip in front of the high seat. Props
// only yaw, so the "round" shields are two crossed plates plus a boss: from the
// floor the silhouette reads as a disc.

import { createMap } from './kit.js';

export const meta = {
  id: 'viking',
  name: 'Viking Hall',
  theme: 'timber longhouse',
  tagline: 'Smoke, ale and firelight. Paint yourself the colour of old oak.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [44, 28],
    ceiling: 6.2,
    sky: '#150f0a',
    ambient: '#4a3324',
    sunDir: [-0.28, -0.9, -0.34],
    sunColor: '#ffc98a',
    sunIntensity: 0.26,
    fog: '#1d130c',
    fogDensity: 0.03,
  });

  const TIMBER = '#6b4a2e';
  const TIMBER_DK = '#3f2a19';
  const OAK = '#7d5a37';
  const FLOOR = '#584330';
  const STONE = '#6a635a';
  const STONE_DK = '#453f38';
  const RED = '#8c2f28';
  const RED_DK = '#5e1f1c';
  const GOLD = '#b98b3a';
  const IRON = '#4c4a4a';
  const FUR = '#9a8a6c';
  const WOOL = '#c0ab84';
  const EMBER = '#ff7326';
  const ASH = '#3a332c';

  const CEIL = 6.2;
  const HW = 20;      // hall half-width in x (wall centres)
  const HD = 13;      // hall half-depth in z
  const SCREEN = 13.5; // partition between the entry lobby and the hall
  const DAIS_Y = 0.55;
  const PIT_W = -11, PIT_E = 10, PIT_Z = 0.9; // firepit extents

  // -------------------------------------------------------------- structure --
  m.perimeter(11, '#251710');
  m.floor(0, 0, 44, 28, FLOOR);
  m.ceil(0, 0, 44, 28, TIMBER_DK, CEIL);
  m.room({
    x: 0, z: 0, w: HW * 2, d: HD * 2, h: CEIL, floor: FLOOR, wall: TIMBER,
    openings: [{ side: 'e', at: 0, width: 3.8, height: 4.0 }],
  });

  // Vertical plank boarding: the wall has to read as staves, not a painted slab.
  for (let i = 0; i < 13; i++) {
    const x = -18.6 + i * 3.1;
    for (const s of [-1, 1]) {
      m.box(x, 0, s * (HD - 0.42), 1.3, m.range(2.2, 3.4), 0.16, TIMBER,
        { solid: false, jitter: 0.11, tag: 'stave' });
    }
  }
  for (const s of [-1, 1]) {
    m.box(0, 2.55, s * (HD - 0.36), 39.4, 0.22, 0.2, TIMBER_DK, { solid: false });
    m.box(0, 0.9, s * (HD - 0.36), 39.4, 0.18, 0.2, TIMBER_DK, { solid: false });
  }
  for (let i = 0; i < 6; i++) {
    m.box(-HW + 0.42, 0, -10.5 + i * 4.2, 0.16, m.range(2.4, 3.6), 2.5, TIMBER,
      { solid: false, jitter: 0.1, tag: 'stave' });
  }

  // Carved posts down both sides of the nave, carrying the wall plates.
  const POST_Z = 6.2;
  for (let i = 0; i < 7; i++) {
    const x = -12 + i * 4;
    for (const s of [-1, 1]) {
      m.cyl(x, 0, s * POST_Z, 0.34, 4.4, OAK, { tag: 'post', jitter: 0.06 });
      m.cyl(x, 1.5, s * POST_Z, 0.41, 0.22, TIMBER_DK, { solid: false });
      m.box(x, 4.4, s * POST_Z, 1.0, 0.34, 1.0, TIMBER_DK, { tag: 'capital' });
    }
  }
  for (const s of [-1, 1]) {
    m.box(0, 4.4, s * POST_Z, 39, 0.34, 0.42, TIMBER_DK, { tag: 'plate' });
  }
  m.box(0, 5.6, 0, 39, 0.36, 0.44, TIMBER_DK, { solid: false, tag: 'ridge' });

  // Tie beams and stepped rafters. Decorative only - nothing up here should
  // catch a jumping player, and non-solid props never block a sight line.
  for (let i = 0; i < 8; i++) {
    const x = -17 + i * 4.9;
    m.box(x, 4.3, 0, 0.28, 0.26, 24.4, TIMBER_DK, { solid: false, jitter: 0.05 });
    for (const s of [-1, 1]) {
      m.box(x, 4.62, s * 9.2, 0.24, 0.24, 6.6, OAK, { solid: false, jitter: 0.07 });
      m.box(x, 5.16, s * 3.1, 0.24, 0.24, 6.6, OAK, { solid: false, jitter: 0.07 });
    }
  }

  // -------------------------------------------------------------- the firepit --
  const pitLen = PIT_E - PIT_W, pitMid = (PIT_W + PIT_E) / 2;
  m.box(pitMid, 0, -PIT_Z, pitLen + 0.7, 0.42, 0.36, STONE, { tag: 'kerb', jitter: 0.08 });
  m.box(pitMid, 0, PIT_Z, pitLen + 0.7, 0.42, 0.36, STONE, { tag: 'kerb', jitter: 0.08 });
  m.box(PIT_W, 0, 0, 0.36, 0.42, PIT_Z * 2, STONE, { tag: 'kerb', jitter: 0.08 });
  m.box(PIT_E, 0, 0, 0.36, 0.42, PIT_Z * 2, STONE, { tag: 'kerb', jitter: 0.08 });
  m.box(pitMid, 0.01, 0, pitLen, 0.08, PIT_Z * 2 - 0.4, ASH, { solid: false, tag: 'ash' });
  for (let i = 0; i < 12; i++) {
    m.box(m.range(PIT_W + 0.5, PIT_E - 0.6), 0.06, m.range(-0.55, 0.55),
      m.range(0.4, 1.3), m.range(0.12, 0.22), 0.22, m.pick([STONE_DK, ASH, TIMBER_DK]),
      { solid: false, yaw: m.range(-40, 40), jitter: 0.12, tag: 'log' });
  }
  // Live coals only in the west two thirds - the east end is cold and dark,
  // which is deliberately the best spot in the hall.
  for (let i = 0; i < 12; i++) {
    m.box(m.range(PIT_W + 0.6, 6.4), 0.09, m.range(-0.5, 0.5),
      m.range(0.25, 0.6), 0.1, m.range(0.2, 0.4), EMBER,
      { solid: false, emis: m.range(1.6, 3.0), jitter: 0.14, tag: 'ember' });
  }
  for (const fx of [-9.5, -6, -2.5, 1, 4.5]) {
    m.light(fx, 1.1, 0, '#ff9438', 1.15, 11);
  }
  m.light(pitMid, 3.2, 0, '#e07a2c', 0.7, 20);

  // Cauldron on a tripod over the hottest stretch.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    m.box(-6 + Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75, 0.11, 2.05, 0.11, IRON, { solid: false });
  }
  m.cyl(-6, 1.1, 0, 0.46, 0.62, IRON, { tag: 'cauldron' });
  m.cyl(-6, 1.72, 0, 0.05, 0.35, IRON, { solid: false });
  m.cyl(-6, 1.05, 0, 0.5, 0.07, IRON, { solid: false });
  m.spot(9, 0, 0, { stance: 'crouch', quality: 0.9, hint: 'In the cold end of the firepit' });

  // ---------------------------------------------------------- trestle tables --
  // Two long runs of benches and boards flanking the fire.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const tx = -8 + i * 6.4;
      m.table(tx, s * 3.6, 5.6, 1.15, 0.78, OAK, { legColor: TIMBER_DK, spot: false });
    }
    for (let i = 0; i < 3; i++) {
      const bx = -8 + i * 6.4;
      for (const bz of [2.5, 4.7]) {
        m.box(bx, 0.44, s * bz, 5.4, 0.11, 0.42, TIMBER, { tag: 'bench', jitter: 0.06 });
        for (const e of [-1, 1]) {
          m.box(bx + e * 2.4, 0, s * bz, 0.16, 0.44, 0.4, TIMBER_DK);
        }
      }
    }
  }
  m.spot(-8, 0, -3.6, { stance: 'prone', quality: 0.8, hint: 'Flat under the north boards' });
  m.spot(4.4, 0, 3.6, { stance: 'prone', quality: 0.8, hint: 'Flat under the south boards' });
  // Behind the outer benches, not on them: the plank tops sit at 0.55 and a
  // prone body is 0.5 tall, so the bench line only works as a screen.
  m.spot(-1.6, 0, 5.3, { stance: 'prone', quality: 0.66, hint: 'Along the outer bench' });
  m.spot(-1.6, 0, -5.3, { stance: 'prone', quality: 0.66, hint: 'Along the far bench' });

  // Feast clutter. Small, bright, and everywhere - a hider who paints pewter
  // and lies on a board is genuinely hard to pick out.
  for (let i = 0; i < 11; i++) {
    const s = m.chance(0.5) ? -1 : 1;
    const x = m.range(-10.6, 7);
    const z = s * m.range(3.15, 4.05);
    const k = m.irange(0, 3);
    if (k === 0) {
      m.cyl(x, 0.78, z, 0.09, 0.26, m.pick([WOOL, FUR]), { solid: false, jitter: 0.1, tag: 'horn' });
      m.sphere(x, 1.06, z, 0.075, GOLD, { solid: false });
    } else if (k === 1) {
      m.cyl(x, 0.78, z, 0.19, 0.04, m.pick([WOOL, '#8f8b7c']), { solid: false, jitter: 0.12 });
    } else if (k === 2) {
      m.cyl(x, 0.78, z, 0.15, 0.28, m.pick([STONE_DK, TIMBER_DK]), { solid: false, jitter: 0.1 });
      m.cyl(x, 1.06, z, 0.08, 0.08, GOLD, { solid: false });
    } else {
      m.cyl(x, 0.78, z, 0.17, 0.13, m.pick([OAK, WOOL]), { solid: false, jitter: 0.12 });
    }
  }

  // ------------------------------------------------------------- high seat --
  m.box(-16.9, 0, 0, 5.8, DAIS_Y, 12, OAK, { tag: 'dais', jitter: 0.05 });
  m.stairs(-13.1, 0, 4.2, 2, DAIS_Y / 2, 0.45, TIMBER, { yaw: -90 });
  m.rug(-16.9, 0, 4.6, 8.6, RED_DK, { y: DAIS_Y });
  // Throne: seat block, a tall carved back, and a pair of beast-head posts.
  m.box(-18.2, DAIS_Y, 0, 1.2, 0.52, 1.5, TIMBER_DK, { tag: 'throne' });
  m.box(-18.7, DAIS_Y, 0, 0.28, 2.3, 1.6, OAK, { tag: 'throneBack', jitter: 0.05 });
  for (const s of [-1, 1]) {
    m.box(-18.2, DAIS_Y + 0.52, s * 0.72, 1.2, 0.22, 0.16, OAK);
    m.cyl(-17.5, DAIS_Y, s * 0.9, 0.14, 1.5, OAK, { jitter: 0.06 });
    m.sphere(-17.5, DAIS_Y + 1.62, s * 0.9, 0.2, GOLD);
    m.box(-19.2, DAIS_Y + 1.1, s * 2.6, 0.08, 2.4, 1.1, RED, { solid: false, jitter: 0.07, tag: 'banner' });
  }
  m.table(-15.6, 0, 6.0, 1.0, 0.78, OAK, { y: DAIS_Y, yaw: 90, legColor: TIMBER_DK, spot: false });
  for (let i = 0; i < 8; i++) {
    m.cyl(-15.6, DAIS_Y + 0.78, -2.4 + i * 0.7, 0.16, 0.24, m.pick([GOLD, WOOL, '#8f8b7c']),
      { solid: false, jitter: 0.12 });
  }
  for (const s of [-1, 1]) {
    m.chair(-14.9, s * 4.2, TIMBER_DK, { yaw: s > 0 ? 0 : 180, y: DAIS_Y });
  }
  m.spot(-19.3, DAIS_Y, 0, { stance: 'crouch', quality: 0.84, hint: 'Behind the high seat' });
  m.spot(-15.6, DAIS_Y, 0, { stance: 'prone', quality: 0.78, hint: 'Under the high table' });
  m.spot(-16.9, DAIS_Y, 5.2, { stance: 'prone', quality: 0.62, hint: 'On the dais edge, south side' });
  m.light(-17.4, 3.4, 0, '#ffbe72', 1.0, 14);

  // Chests of tribute stacked against the west wall, either side of the throne.
  const chest = (x, z, yaw, y, c) => {
    m.box(x, y, z, 1.15, 0.52, 0.62, c, { yaw, tag: 'chest', jitter: 0.07 });
    m.box(x, y + 0.52, z, 1.19, 0.16, 0.66, TIMBER_DK, { yaw });
    m.box(x, y + 0.14, z, 1.22, 0.09, 0.66, IRON, { yaw, solid: false });
    m.box(x, y + 0.4, z, 0.14, 0.32, 0.68, GOLD, { yaw, solid: false });
  };
  chest(-19.2, -5.4, 0, DAIS_Y, TIMBER_DK);
  chest(-19.2, 5.4, 0, DAIS_Y, TIMBER);
  chest(-18.3, -8.6, 12, 0, TIMBER_DK);
  chest(-18.3, 8.6, -12, 0, TIMBER);
  chest(-12.6, 11.4, 90, 0, TIMBER_DK);
  // z = -6.4 is off the end of the dais, so this one is at floor level looking
  // up at the chests, not on the platform with them.
  m.spot(-19.2, 0, -6.4, { stance: 'crouch', quality: 0.7, hint: 'Wedged behind the tribute chests' });
  m.spot(-18.3, 0, 9.6, { stance: 'crouch', quality: 0.72, hint: 'Beside the war chest' });

  // ---------------------------------------------------- side aisles: sleeping --
  // Plank platforms on stumpy legs: real crawl space underneath, fur on top.
  const platform = (x, z, w) => {
    m.box(x, 0.62, z, w, 0.14, 2.2, OAK, { tag: 'platform', jitter: 0.05 });
    for (const ex of [-1, 1]) {
      for (const ez of [-1, 1]) {
        m.box(x + ex * (w / 2 - 0.25), 0, z + ez * 0.85, 0.2, 0.62, 0.2, TIMBER_DK);
      }
    }
    m.box(x, 0.76, z - 0.3, w - 0.5, 0.1, 1.2, FUR, { solid: false, jitter: 0.12, tag: 'pelt' });
  };
  for (const s of [-1, 1]) {
    platform(-5.5, s * 11.4, 5.4);
    platform(2.5, s * 11.4, 5.4);
    platform(9.5, s * 11.4, 4.0);
  }
  m.spot(-5.5, 0, -11.4, { stance: 'prone', quality: 0.86, hint: 'Under the north sleeping bench' });
  m.spot(2.5, 0, 11.4, { stance: 'prone', quality: 0.86, hint: 'Under the south sleeping bench' });
  m.spot(9.5, 0.76, -11.4, { stance: 'prone', quality: 0.6, hint: 'Flat on the furs' });

  // Shields and banners hung the length of both aisles.
  const shield = (x, y, z, along, out, c) => {
    const t = 0.1;
    if (along === 'x') {
      m.box(x, y - 0.3, z, 0.88, 0.6, t, c, { solid: false, jitter: 0.09 });
      m.box(x, y - 0.44, z, 0.6, 0.88, t, c, { solid: false, jitter: 0.09 });
      m.sphere(x, y, z + out * 0.08, 0.13, IRON, { solid: false });
    } else {
      m.box(x, y - 0.3, z, t, 0.6, 0.88, c, { solid: false, jitter: 0.09 });
      m.box(x, y - 0.44, z, t, 0.88, 0.6, c, { solid: false, jitter: 0.09 });
      m.sphere(x + out * 0.08, y, z, 0.13, IRON, { solid: false });
    }
  };
  const SHIELD_C = [RED, RED_DK, GOLD, WOOL, '#3f5f4a', TIMBER_DK];
  for (let i = 0; i < 5; i++) {
    const x = -16.5 + i * 6.8;
    for (const s of [-1, 1]) {
      shield(x, 3.15 + (i % 2) * 0.28, s * (HD - 0.5), 'x', -s, m.pick(SHIELD_C));
    }
  }
  for (let i = 0; i < 2; i++) {
    shield(-HW + 0.5, 3.2, -7.5 + i * 15, 'z', 1, m.pick(SHIELD_C));
  }
  for (let i = 0; i < 6; i++) {
    const x = -15 + i * 5.6;
    for (const s of [-1, 1]) {
      m.box(x, 4.05, s * (HD - 0.6), 1.1, 2.2, 0.07, m.pick([RED, RED_DK, GOLD]),
        { solid: false, jitter: 0.1, tag: 'banner' });
    }
  }

  // Weapon racks: shafts stood upright in a slotted rail.
  const rack = (x, z, yaw, n) => {
    m.box(x, 0, z, 2.2, 0.26, 0.42, TIMBER_DK, { yaw, tag: 'rack', jitter: 0.06 });
    m.box(x, 1.55, z, 2.2, 0.14, 0.3, TIMBER_DK, { yaw, solid: false });
    const a = yaw * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const o = -0.9 + (i / (n - 1)) * 1.8;
      const px = x + Math.cos(a) * o, pz = z + Math.sin(a) * o;
      m.cyl(px, 0.26, pz, 0.05, 2.1, OAK, { solid: false, jitter: 0.1 });
      m.box(px, 2.36, pz, 0.09, 0.34, 0.09, IRON, { solid: false, yaw });
    }
  };
  rack(-9.5, -12.3, 0, 4);
  rack(6.5, 12.3, 0, 4);
  rack(-19.3, -10.5, 90, 3);
  rack(11.6, -12.3, 0, 3);
  m.spot(-9.5, 0, -11.5, { stance: 'stand', quality: 0.68, hint: 'Standing in the spear rack' });
  m.spot(6.5, 0, 11.5, { stance: 'stand', quality: 0.66, hint: 'Among the racked spears' });

  // ------------------------------------------------------------ ale and store --
  const BARREL_C = [TIMBER_DK, OAK, '#5a4a2e', TIMBER];
  const ale = [
    [-14.5, -9.4], [-13.6, -10.1], [-14.9, -10.8], [-13.2, -8.5],
    [-14.5, 9.4], [-13.6, 10.1], [-14.9, 10.8], [-13.2, 8.5],
    [0.5, -9.0], [1.4, -9.6], [-2.4, 9.3], [-3.3, 9.9],
    [12.2, 8.8], [12.9, 9.9],
    [17.6, -8.4], [18.4, -9.4], [17.2, -9.8],
  ];
  for (const [bx, bz] of ale) m.barrel(bx, bz, m.pick(BARREL_C), { h: m.range(0.85, 1.05), r: m.range(0.33, 0.4) });
  // These sit in the actual gaps between barrel bellies - a hand's width off
  // and the physics parks the hider on top of the lids instead.
  m.spot(-14.3, 0, -10.2, { stance: 'crouch', quality: 0.82, hint: 'Down among the ale barrels' });
  m.spot(-14.3, 0, 10.3, { stance: 'crouch', quality: 0.8, hint: 'Behind the south ale stack' });
  m.spot(17.6, 0, -9.2, { stance: 'crouch', quality: 0.76, hint: 'In the barrel store by the door' });

  // Firewood stacked against the north-west wall.
  for (let i = 0; i < 15; i++) {
    const row = Math.floor(i / 5);
    m.cyl(-9.4 + (i % 5) * 0.36, row * 0.34, -12.4, 0.17, 0.32, m.pick([TIMBER, OAK, TIMBER_DK]),
      { jitter: 0.14, tag: 'log' });
  }
  for (let i = 0; i < 8; i++) {
    m.box(-7.2 - m.range(0, 2.2), m.range(0, 1.0), -12.2 + m.range(-0.3, 0.3),
      m.range(0.8, 1.6), 0.2, 0.2, m.pick([TIMBER, OAK, TIMBER_DK]),
      { solid: false, yaw: m.range(-8, 8), jitter: 0.14 });
  }

  // Loom and a work corner in the south-west aisle. Both have to clear the
  // sleeping platform at x = -5.5, whose deck runs from x = -8.2 to -2.8.
  m.box(-10.8, 0, 12.1, 0.24, 2.6, 0.24, OAK);
  m.box(-8.6, 0, 12.1, 0.24, 2.6, 0.24, OAK);
  m.box(-9.7, 2.4, 12.1, 2.4, 0.22, 0.26, OAK);
  m.box(-9.7, 0.6, 12.25, 2.1, 1.7, 0.08, WOOL, { solid: false, jitter: 0.1, tag: 'cloth' });
  for (let i = 0; i < 7; i++) {
    m.box(-10.6 + i * 0.27, 0.5, 12.16, 0.06, m.range(1.2, 1.8), 0.05, m.pick([RED, WOOL, GOLD]),
      { solid: false, jitter: 0.12 });
  }
  m.table(-1.5, 10.6, 2.0, 0.9, 0.76, TIMBER_DK, { spot: false });
  m.spot(-1.5, 0, 10.6, { stance: 'prone', quality: 0.7, hint: 'Under the work table' });
  m.spot(-9.7, 0, 11.4, { stance: 'stand', quality: 0.74, hint: 'Behind the loom' });

  // Fur rugs scattered off the nave.
  for (const [rx, rz, rw, rd] of [[-3, -8.6, 3.4, 2.4], [4, -8.4, 3.0, 2.2], [-1, 8.6, 3.6, 2.4],
    [7.5, 8.2, 2.8, 2.0], [-11, -8.8, 2.6, 2.0], [-11, 8.8, 2.6, 2.0],
    [15.6, 3.6, 3.0, 2.6], [15.6, -3.6, 3.0, 2.6]]) {
    m.rug(rx, rz, rw, rd, m.pick([FUR, WOOL, RED_DK, '#7a6a4c']), { yaw: m.range(-12, 12) });
  }

  // ------------------------------------------------------------ entry lobby --
  // A stave screen with a wide gap: the lobby is the hunters' start, and the
  // gap is the only clean sight line into the nave.
  for (const s of [-1, 1]) {
    m.box(SCREEN, 0, s * 8, 0.35, 3.0, 10, TIMBER, { tag: 'screen', jitter: 0.05 });
    m.box(SCREEN, 3.0, s * 8, 0.6, 0.24, 10.2, TIMBER_DK, { solid: false });
    m.box(SCREEN, 0, s * 3.1, 0.5, 3.4, 0.5, OAK, { tag: 'doorpost' });
    m.sphere(SCREEN, 3.6, s * 3.1, 0.26, GOLD, { solid: false });
    m.box(SCREEN - 0.32, 1.0, s * 4.6, 0.1, 2.0, 1.6, FUR, { solid: false, jitter: 0.12, tag: 'pelt' });
  }
  m.spot(12.9, 0, 4.6, { stance: 'stand', quality: 0.72, hint: 'Behind the hanging pelt by the screen' });

  m.crateStack(15.6, -11.0, TIMBER_DK, 3, 1.05, { spot: false });
  m.crateStack(17.4, -11.4, OAK, 2, 1.15, { spot: false });
  m.crateStack(15.2, 11.2, OAK, 3, 1.0, { spot: false });
  m.crateStack(17.8, 11.6, TIMBER_DK, 2, 1.1, { spot: false });
  m.crateStack(19.0, 6.4, TIMBER, 2, 1.05, { spot: false });
  m.spot(16.4, 0, -9.6, { stance: 'crouch', quality: 0.78, hint: 'Between the crates by the door' });
  m.spot(16.3, 0, 9.8, { stance: 'crouch', quality: 0.76, hint: 'Behind the south crate stack' });
  m.shelf(19.3, -3.2, 3.2, 2.3, 0.7, TIMBER_DK, { yaw: -90, levels: 3, spot: false });
  m.spot(19.1, 0, -3.2, { stance: 'prone', quality: 0.74, hint: 'On the bottom of the door shelf' });
  for (let i = 0; i < 10; i++) {
    m.box(19.1, 0.15 + m.irange(0, 2) * 0.76, m.range(-4.4, -2.0), 0.4, m.range(0.2, 0.4), m.range(0.2, 0.5),
      m.pick([WOOL, FUR, TIMBER, GOLD]), { solid: false, jitter: 0.14 });
  }
  // Shifted south so the trough stops running through the door shelf's back.
  m.box(19.4, 0, 0.6, 0.5, 1.1, 4.2, STONE, { tag: 'trough', jitter: 0.06 });
  m.plant(14.6, 6.6, 1.1, TIMBER_DK, '#4f6b3c');

  // ---------------------------------------------------------------- lighting --
  for (const [lx, lz] of [[-16, -11.6], [-16, 11.6], [-2, -12.2], [-2, 12.2],
    [8, -12.2], [8, 12.2], [16.5, -12.2], [16.5, 12.2]]) {
    m.box(lx, 2.7, lz, 0.4, 0.5, 0.34, IRON, { solid: false });
    m.sphere(lx, 3.16, lz, 0.24, '#ffb055', { solid: false, emis: 2.6 });
    m.light(lx, 3.1, lz, '#ffb05a', 0.62, 8.5);
  }
  m.light(16.5, 3.4, 0, '#ffc07a', 0.7, 12);
  m.light(-8, 3.6, 0, '#e08a3c', 0.45, 16);

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-16.5, 3.4, DAIS_Y);
  m.spawnHider(-16.5, -3.4, DAIS_Y);
  m.spawnHider(-6, 8.8);
  m.spawnHider(-6, -8.8);
  m.spawnHider(2, 8.6);
  m.spawnHider(2, -8.6);
  m.spawnHider(10.6, 9.4);
  m.spawnHider(10.6, -9.4);
  m.spawnHider(-12.4, 2.2);
  m.spawnHider(-12.4, -2.2);
  m.spawnHider(6, 1.7);
  m.spawnHider(6, -1.7);
  m.spawnSeeker(17.0, 0);
  m.spawnSeeker(18.2, 1.8);
  m.spawnSeeker(18.2, -1.8);
  m.spawnSeeker(15.8, 2.4);
  m.lobbySpawn(16.4, 0);

  m.palette([FLOOR, TIMBER, TIMBER_DK, OAK, STONE, STONE_DK, RED, RED_DK, GOLD, IRON, FUR, WOOL, EMBER, ASH]);
  return m.finish();
}
