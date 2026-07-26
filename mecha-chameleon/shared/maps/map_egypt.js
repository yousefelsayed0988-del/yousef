// Egypt - a rock-cut tomb read along one axis: a stepped entry ramp drops from
// the desert into a low passage, the passage opens into a pillared hall, and the
// hall opens onto the burial chamber. Everything that is not a room is a solid
// block of bedrock, so the "walls" here are mostly the negative space between
// those blocks - cheaper than four walls per room and it never leaves a seam.

import { createMap } from './kit.js';

export const meta = {
  id: 'egypt',
  name: 'Egypt',
  theme: 'tomb interior',
  tagline: 'Ochre, gold and lapis under torchlight. The dark corners are very dark.',
  difficulty: 3,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [56, 40],
    ceiling: 7,
    sky: '#0d0a06',
    ambient: '#3b2e1d',
    sunDir: [0.55, -0.76, -0.34],
    sunColor: '#ffd79a',
    sunIntensity: 0.22,
    fog: '#191106',
    fogDensity: 0.035,
  });

  const SAND = '#b9975c';
  const SAND_DK = '#8a6f42';
  const STONE = '#a8875a';
  const STONE_DK = '#6d5636';
  const ROCK = '#4e3f2a';
  const OCHRE = '#b5622c';
  const GOLD = '#d9a53c';
  const GOLD_DK = '#96702a';
  const LAPIS = '#2a4a8c';
  const LAPIS_LT = '#3f6cc0';
  const TURQ = '#2f8a86';
  const RED = '#a83a2a';
  const IVORY = '#e2d4ae';
  const BLACK = '#241d16';

  const HALL_H = 7, CHAMBER_H = 5.6, PASSAGE_H = 4.4, SIDE_H = 4.2;

  // ------------------------------------------------------------------ shell --
  m.perimeter(14, ROCK);
  m.floor(0, 0, 56, 40, SAND_DK);

  /** A block of untouched bedrock. */
  const rock = (x0, x1, z0, z1) =>
    m.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 14, z1 - z0, ROCK,
      { tag: 'bedrock', jitter: 0.06 });

  rock(12, 28, 3.5, 20);
  rock(12, 28, -20, -3.5);
  rock(26, 28, -3.5, 3.5);
  rock(-10, -4, -20, -14);
  rock(4, 12, -20, -14);
  rock(-10, -4, 14, 20);
  rock(4, 12, 14, 20);
  rock(-14, -10, -20, -9);
  rock(-14, -10, 9, 20);
  rock(-26, -14, -20, -17);
  rock(-26, -14, 17, 20);
  rock(-28, -26, -20, 20);

  m.ceil(1, 0, 22, 28, ROCK, HALL_H);
  m.ceil(-18, 0, 16, 18, ROCK, CHAMBER_H);
  m.ceil(-20, -13, 12, 8, ROCK, SIDE_H);
  m.ceil(-20, 13, 12, 8, ROCK, SIDE_H);
  m.ceil(0, -17, 8, 6, ROCK, PASSAGE_H);
  m.ceil(0, 17, 8, 6, ROCK, PASSAGE_H);
  m.ceil(19, 0, 14, 7, ROCK, 5.4);

  // ------------------------------------------------------------- entry ramp --
  // Nine treads of 0.29, comfortably under the 0.45 step height, so the descent
  // reads as a slope rather than a staircase.
  const STEP = 0.29;
  for (let i = 0; i < 9; i++) {
    m.box(14.61 + i * 1.22, 0, 0, 1.22, (i + 1) * STEP, 7, STONE,
      { tag: 'ramp', jitter: 0.05 });
  }
  m.box(25.5, 0, 0, 1.0, 9 * STEP, 7, STONE, { tag: 'ramp' });
  for (let i = 0; i < 6; i++) {
    m.box(14.5 + i * 2, 3.2 + i * 0.42, 0, 2, 0.4, 7.2, ROCK, { solid: false, jitter: 0.06 });
  }
  // The sealed entrance: a plug slab with a slot above it, the only daylight.
  m.box(25.9, 2.61, 0, 0.5, 2.0, 5.4, STONE_DK, { tag: 'plug', jitter: 0.05 });
  m.box(25.9, 4.7, 0, 0.4, 0.5, 4.6, '#ffe9b0', { solid: false, opaque: false, emis: 1.6 });
  m.light(24.6, 4.4, 0, '#ffe6ae', 1.5, 14);
  for (const s of [-1, 1]) {
    m.box(13, 0, s * 3.3, 2.4, PASSAGE_H, 0.4, STONE_DK, { jitter: 0.05 });
  }

  // ------------------------------------------------------------- cut walls --
  const wallBlock = (x, z, w, h, d, y = 0) => m.box(x, y, z, w, h, d, STONE, { tag: 'wall', jitter: 0.05 });
  // Hall east wall, doorway at z = 0.
  wallBlock(12, -2.55, 0.6, HALL_H, 1.9);
  wallBlock(12, 2.55, 0.6, HALL_H, 1.9);
  wallBlock(12, 0, 0.6, HALL_H - PASSAGE_H, 3.2, PASSAGE_H);
  // Hall west wall onto the burial chamber, doorway six wide.
  wallBlock(-10, -6, 0.7, HALL_H, 6);
  wallBlock(-10, 6, 0.7, HALL_H, 6);
  wallBlock(-10, 0, 0.7, HALL_H - 4.6, 6, 4.6);
  // Hall north and south walls with the chapel doorways.
  for (const s of [-1, 1]) {
    wallBlock(-6.9, s * 14, 6.2, HALL_H, 0.6);
    wallBlock(7.9, s * 14, 8.2, HALL_H, 0.6);
    wallBlock(0, s * 14, 3.6, HALL_H - 3.8, 0.6, 3.8);
  }
  // Burial chamber north and south walls onto the treasure rooms.
  for (const s of [-1, 1]) {
    wallBlock(-24, s * 9, 4, CHAMBER_H, 0.6);
    wallBlock(-14.5, s * 9, 9, CHAMBER_H, 0.6);
    wallBlock(-20.5, s * 9, 3, CHAMBER_H - 3.4, 0.6, 3.4);
  }

  // ------------------------------------------------------ hieroglyph panels --
  // Rows of small painted blocks: enough to read as text from across the hall,
  // and a dozen distinct colours for a hider to steal off the wall.
  const GLYPH_C = [LAPIS, LAPIS_LT, TURQ, OCHRE, GOLD, RED, IVORY, BLACK];
  const glyphs = (x, y, z, along, cols, rows) => {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const u = (c - (cols - 1) / 2) * 0.46;
        const gy = y + r * 0.46;
        if (along === 'x') {
          m.box(x + u, gy, z, 0.34, 0.34, 0.07, m.pick(GLYPH_C), { solid: false, jitter: 0.13, tag: 'glyph' });
        } else {
          m.box(x, gy, z + u, 0.07, 0.34, 0.34, m.pick(GLYPH_C), { solid: false, jitter: 0.13, tag: 'glyph' });
        }
      }
    }
  };
  for (const s of [-1, 1]) {
    glyphs(-6.9, 1.4, s * 13.65, 'x', 4, 3);
    glyphs(7.9, 1.4, s * 13.65, 'x', 4, 3);
    glyphs(-16, 1.3, s * 8.65, 'x', 4, 3);
  }
  glyphs(11.65, 1.5, -2.55, 'z', 3, 2);
  glyphs(11.65, 1.5, 2.55, 'z', 3, 2);
  glyphs(-9.6, 1.4, -6, 'z', 3, 2);
  glyphs(-9.6, 1.4, 6, 'z', 3, 2);

  // ------------------------------------------------------------- the columns --
  // Sixteen columns are the hall's whole sight-line story: nothing here is
  // truly open, and nothing here is truly hidden either.
  const column = (x, z, r) => {
    m.cyl(x, 0, z, r * 1.18, 0.34, STONE_DK, { tag: 'plinth', jitter: 0.05 });
    m.cyl(x, 0.34, z, r, HALL_H - 1.1, STONE, { tag: 'column', jitter: 0.05 });
    m.cyl(x, HALL_H - 0.76, z, r * 1.22, 0.5, OCHRE, { tag: 'capital', jitter: 0.07 });
    for (let b = 0; b < 2; b++) {
      m.cyl(x, 1.2 + b * 2.4, z, r * 1.05, 0.2, m.pick([LAPIS, OCHRE, GOLD]),
        { solid: false, jitter: 0.14, tag: 'band' });
    }
  };
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      column(-6 + i * 5, s * 5.5, 1.1);
      column(-6 + i * 5, s * 11, 1.0);
    }
  }
  for (const [cx, cz] of [[-6, 5.5], [4, -5.5], [9, 11], [-1, -11]]) {
    m.spot(cx + 1.55, 0, cz, { stance: 'stand', quality: 0.54, hint: 'Pressed against a column' });
  }
  // Drums from a collapsed column, scattered across the open nave. This is the
  // only cover in the middle of the hall, which is what makes the nave a gamble.
  for (let i = 0; i < 4; i++) {
    m.cyl(0.4 + i * 1.5, 0, 2.6 + i * 0.1, 0.95, 1.9, STONE, { jitter: 0.06, tag: 'drum' });
  }
  m.box(6.6, 0, 2.9, 2.2, 1.2, 2.2, STONE_DK, { jitter: 0.06, tag: 'block' });
  m.spot(2.6, 0, 4.4, { stance: 'prone', quality: 0.78, hint: 'Behind the fallen column drums' });

  // -------------------------------------------------------- burial chamber --
  m.box(-18, 0, 0, 7.2, 0.5, 5.2, STONE_DK, { tag: 'plinth', jitter: 0.04 });
  for (const s of [-1, 1]) {
    m.box(-18, 0.5, s * 2.0, 6.6, 0.16, 0.4, GOLD_DK, { solid: false, jitter: 0.08 });
  }

  /** Open stone coffin: four walls, no floor, lid shoved clear along its axis. */
  const sarcophagus = (x, z, yaw, y, body, lidOff) => {
    const t = 0.28, w = 2.9, d = 1.7, h = 0.95;
    const a = yaw * Math.PI / 180;
    for (const s of [-1, 1]) {
      m.box(x - Math.sin(a) * s * (d / 2 - t / 2), y, z + Math.cos(a) * s * (d / 2 - t / 2),
        w, h, t, body, { yaw, jitter: 0.05, tag: 'sarc' });
      m.box(x + Math.cos(a) * s * (w / 2 - t / 2), y, z + Math.sin(a) * s * (w / 2 - t / 2),
        t, h, d, body, { yaw, jitter: 0.05, tag: 'sarc' });
    }
    m.box(x + Math.cos(a) * lidOff, y + h, z + Math.sin(a) * lidOff, w * 0.62, 0.22, d, GOLD_DK,
      { yaw, jitter: 0.06, tag: 'lid' });
    m.sphere(x + Math.cos(a) * (lidOff + w * 0.22), y + h + 0.32, z + Math.sin(a) * (lidOff + w * 0.22),
      0.26, GOLD, { solid: false });
  };
  sarcophagus(-18, 0, 0, 0.5, LAPIS, 1.05);
  sarcophagus(-24, -5.6, 90, 0, STONE_DK, 0.9);
  sarcophagus(-24, 5.6, 90, 0, OCHRE, -0.9);
  m.spot(-18.8, 0.5, 0, { stance: 'prone', quality: 0.93, hint: 'Lying inside the king\'s sarcophagus' });
  m.spot(-18, 0, 3.6, { stance: 'crouch', quality: 0.7, hint: 'Behind the burial plinth' });
  m.spot(-24, 0, -6.3, { stance: 'prone', quality: 0.9, hint: 'Inside the empty north coffin' });
  m.spot(-24, 0, 5.9, { stance: 'prone', quality: 0.88, hint: 'Inside the south coffin' });

  // Canopic shrines: four jars per stand, animal-headed stoppers.
  const canopic = (x, z, yaw) => {
    m.box(x, 0, z, 2.0, 0.75, 0.9, STONE_DK, { yaw, tag: 'shrine', jitter: 0.05 });
    const a = yaw * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      const o = -0.7 + i * 0.47;
      const jx = x + Math.cos(a) * o, jz = z + Math.sin(a) * o;
      m.cyl(jx, 0.75, jz, 0.19, 0.42, IVORY, { jitter: 0.08, tag: 'jar' });
      m.sphere(jx, 1.28, jz, 0.15, m.pick([GOLD, LAPIS, OCHRE, TURQ]), { solid: false });
    }
  };
  canopic(-21.5, -7.6, 0);
  canopic(-14.5, -7.6, 0);
  canopic(-21.5, 7.6, 0);
  canopic(-14.5, 7.6, 0);
  m.spot(-12.9, 0, -7.7, { stance: 'crouch', quality: 0.74, hint: 'Wedged between shrine and wall' });
  m.spot(-18, 0, -7.9, { stance: 'crouch', quality: 0.66, hint: 'Flat against the shrine wall' });

  // Guardian figures flanking the chamber door, two facing each way.
  const guardian = (x, z, yaw, skin) => {
    m.box(x, 0, z, 1.2, 0.34, 1.1, STONE_DK, { yaw, jitter: 0.05 });
    m.box(x, 0.34, z, 0.62, 1.15, 0.42, skin, { yaw, tag: 'statue', jitter: 0.05 });
    m.box(x, 1.49, z, 0.86, 0.62, 0.5, skin, { yaw, jitter: 0.05 });
    m.box(x, 2.11, z, 0.4, 0.42, 0.4, BLACK, { yaw, jitter: 0.06 });
    m.box(x, 2.32, z, 0.62, 0.5, 0.34, GOLD_DK, { yaw, solid: false, jitter: 0.08 });
    m.cyl(x, 0.34, z + 0.46, 0.07, 2.6, GOLD_DK, { solid: false });
  };
  guardian(-11.6, -4.4, 0, OCHRE);
  guardian(-11.6, 4.4, 0, OCHRE);
  guardian(-8.4, -4.4, 180, STONE);
  guardian(-8.4, 4.4, 180, STONE);
  m.spot(-11.6, 0, -5.7, { stance: 'stand', quality: 0.68, hint: 'In the guardian statue\'s shadow' });

  // A false door: a deep painted niche you can stand right inside.
  for (const s of [-1, 1]) {
    m.box(-25.7, 0, s * 1.9, 0.7, 3.2, 0.6, OCHRE, { jitter: 0.06 });
  }
  m.box(-25.7, 2.6, 0, 0.7, 0.6, 4.4, OCHRE, { jitter: 0.06 });
  m.box(-25.9, 0, 0, 0.35, 2.6, 3.2, BLACK, { solid: false, tag: 'falseDoor' });
  m.spot(-25.5, 0, 0, { stance: 'stand', quality: 0.86, hint: 'Standing inside the false door' });
  m.light(-25.2, 2.4, 0, '#6b7fd0', 0.4, 7);

  // -------------------------------------------------------- treasure rooms --
  /** Heap of grave goods: gold spheres graded so the mound reads as a cone. */
  const hoard = (x, z, n, r) => {
    m.cyl(x, 0, z, r * 0.85, 0.42, GOLD_DK, { jitter: 0.08, tag: 'hoard' });
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = i * 2.399963;
      const rad = r * Math.sqrt(1 - t) * 0.9;
      m.sphere(x + Math.cos(a) * rad, 0.16 + t * 0.75, z + Math.sin(a) * rad,
        m.range(0.13, 0.24), m.pick([GOLD, GOLD_DK, IVORY, TURQ]),
        { solid: false, metal: 0.7, rough: 0.3, jitter: 0.1, tag: 'treasure' });
    }
  };
  hoard(-22, -13.4, 12, 1.5);
  hoard(-17.2, -12.2, 9, 1.2);
  hoard(-22, 13.4, 12, 1.5);
  hoard(-17.2, 12.2, 9, 1.2);
  m.spot(-19.6, 0, -12.8, { stance: 'crouch', quality: 0.82, hint: 'Curled between the gold heaps' });
  m.spot(-19.6, 0, 12.8, { stance: 'crouch', quality: 0.8, hint: 'Inside the south hoard' });

  const chest = (x, z, yaw, c) => {
    m.box(x, 0, z, 1.5, 0.7, 0.9, c, { yaw, tag: 'chest', jitter: 0.07 });
    m.box(x, 0.7, z, 1.56, 0.2, 0.96, GOLD_DK, { yaw });
    m.box(x, 0.3, z, 1.6, 0.1, 0.98, GOLD, { yaw, solid: false });
  };
  chest(-24.6, -10.6, 0, OCHRE);
  chest(-24.6, -14.6, 0, LAPIS);
  chest(-24.6, 10.6, 0, LAPIS);
  chest(-24.6, 14.6, 0, OCHRE);
  chest(-15.0, -14.4, 90, OCHRE);
  chest(-15.0, 14.4, 90, LAPIS);
  m.spot(-24.6, 0, -12.6, { stance: 'crouch', quality: 0.78, hint: 'Between the treasure chests' });
  m.spot(-24.6, 0, 12.6, { stance: 'crouch', quality: 0.76, hint: 'Behind the south chests' });

  // Rows of storage jars against the far wall and the chamber wall.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const jx = -23.4 + i * 2.0, jz = s * 16.2;
      const r = m.range(0.3, 0.44);
      m.cyl(jx, 0, jz, r, r * 2.5, m.pick([OCHRE, SAND, SAND_DK, IVORY]), { jitter: 0.14, tag: 'jar' });
      m.cyl(jx, r * 2.5, jz, r * 0.5, 0.22, m.pick([BLACK, GOLD_DK]), { solid: false });
    }
    for (let i = 0; i < 5; i++) {
      const jx = -17.6 + i * 0.95, jz = s * 10.3;
      const r = m.range(0.26, 0.38);
      m.cyl(jx, 0, jz, r, r * 2.6, m.pick([OCHRE, SAND, IVORY]), { jitter: 0.14, tag: 'jar' });
    }
    m.spot(-20.4, 0, s * 15.2, { stance: 'crouch', quality: 0.72, hint: 'Behind the storage jars' });
  }

  // ------------------------------------------------------------ side chapels --
  for (const s of [-1, 1]) {
    m.box(0, 0, s * 19.2, 6.4, 1.0, 0.8, STONE_DK, { tag: 'altar', jitter: 0.05 });
    glyphs(0, 1.4, s * 19.4, 'x', 4, 2);
    m.table(0, s * 16.2, 3.0, 1.4, 0.82, STONE, { spot: false });
    m.spot(0, 0, s * 16.2, { stance: 'prone', quality: 0.84, hint: 'Under the offering table' });
    for (let i = 0; i < 5; i++) {
      m.cyl(-2.6 + i * 1.3, 1.0, s * 19.2, m.range(0.2, 0.3), m.range(0.4, 0.7),
        m.pick([IVORY, OCHRE, GOLD_DK, SAND]), { jitter: 0.12, tag: 'jar' });
    }
    for (const ex of [-1, 1]) {
      m.box(ex * 3.4, 0, s * 17.6, 1.0, 2.4, 1.0, STONE, { jitter: 0.06, tag: 'pylon' });
      m.box(ex * 3.4, 2.4, s * 17.6, 1.3, 0.3, 1.3, OCHRE, { jitter: 0.08 });
    }
    m.spot(-3.4, 0, s * 18.7, { stance: 'crouch', quality: 0.8, hint: 'Behind the chapel pylon' });
    m.rug(0, s * 16.6, 5.0, 4.0, s < 0 ? LAPIS : RED);
  }

  // ----------------------------------------------------------- hall dressing --
  // Quarried blocks and rubble along both aisles, well clear of the walkways.
  for (let i = 0; i < 18; i++) {
    let x = m.range(-8.6, 9.9);
    const z = m.chance(0.5) ? m.range(-13.2, -9.6) : m.range(9.6, 13.2);
    const w = m.range(0.5, 1.5);
    // The outer column row runs straight down this aisle, so a block that
    // landed on a base gets slid into the nearest gap instead of through it.
    for (const cx of [-6, -1, 4, 9]) {
      if (Math.abs(x - cx) < 1.35 + w / 2) { x = cx - 2.5; break; }
    }
    m.box(x, 0, z, w, m.range(0.35, 1.1), m.range(0.5, 1.4),
      m.pick([STONE, STONE_DK, SAND_DK, ROCK]), { yaw: m.range(-30, 30), jitter: 0.1, tag: 'block' });
  }
  m.crateStack(10.6, -12.8, SAND_DK, 3, 1.1, { spot: false });
  m.crateStack(10.6, 12.8, SAND_DK, 2, 1.2, { spot: false });
  m.spot(9.0, 0, -12.9, { stance: 'crouch', quality: 0.74, hint: 'Beside the mason\'s crates' });
  for (let i = 0; i < 10; i++) {
    m.box(m.range(-9, 11), 0, m.range(-2.4, 2.4), m.range(0.3, 0.8), m.range(0.1, 0.3), m.range(0.3, 0.8),
      m.pick([SAND, SAND_DK, STONE_DK]), { solid: false, yaw: m.range(0, 90), jitter: 0.12, tag: 'debris' });
  }
  for (let i = 0; i < 8; i++) {
    m.box(m.range(12.5, 24), 0.02, m.range(-3.2, 3.2), m.range(1.0, 2.6), 0.06, m.range(0.6, 1.6),
      SAND, { solid: false, yaw: m.range(-20, 20), jitter: 0.1, tag: 'drift' });
  }
  // Stone bench run along the hall's east wall, low enough to lie flat on.
  for (const s of [-1, 1]) {
    m.box(11.4, 0, s * 8, 1.2, 0.6, 7.0, STONE_DK, { tag: 'ledge', jitter: 0.05 });
    m.spot(11.2, 0.6, s * 8, { stance: 'prone', quality: 0.62, hint: 'Flat on the wall ledge' });
  }

  // ---------------------------------------------------------------- braziers --
  const brazier = (x, z) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      m.box(x + Math.cos(a) * 0.34, 0, z + Math.sin(a) * 0.34, 0.11, 1.0, 0.11, GOLD_DK, { solid: false });
    }
    m.cyl(x, 1.0, z, 0.52, 0.34, GOLD_DK, { tag: 'brazier', jitter: 0.06 });
    m.sphere(x, 1.42, z, 0.36, '#ff8a2e', { solid: false, emis: 2.8 });
    m.light(x, 1.6, z, '#ffa14a', 1.0, 11);
  };
  // z = +-3.4, not +-5.5: the column row stands on +-5.5 and a brazier placed
  // there ends up entirely inside a shaft.
  brazier(-6, -3.4); brazier(-6, 3.4);
  brazier(9, -3.4); brazier(9, 3.4);
  brazier(-12.6, 0);
  brazier(-18, -6.2); brazier(-18, 6.2);
  brazier(0, -15.4); brazier(0, 15.4);
  brazier(-20.4, -11.0); brazier(-20.4, 11.0);
  m.light(1.5, 6.0, 0, '#c98a4a', 0.45, 24);
  m.light(-18, 4.6, 0, '#a87c4c', 0.4, 18);

  // Wall torches stepping up the passage with the ramp.
  for (const px of [15.5, 19.5, 23.0]) {
    const ty = 2.0 + (px - 14) * 0.2;
    for (const s of [-1, 1]) {
      m.box(px, ty, s * 3.1, 0.3, 0.5, 0.3, GOLD_DK, { solid: false });
      m.sphere(px, ty + 0.45, s * 3.0, 0.2, '#ff9b3c', { solid: false, emis: 2.5 });
    }
    m.light(px, ty + 0.6, 0, '#ffa14a', 0.6, 8);
  }

  // ------------------------------------------------------------------ spawns --
  m.spawnHider(-19.6, -15.4);
  m.spawnHider(-19.6, 15.4);
  m.spawnHider(-22.4, -3.2);
  m.spawnHider(-22.4, 3.2);
  m.spawnHider(-13.9, 0);
  m.spawnHider(-3.5, -7.6);
  m.spawnHider(-3.5, 7.6);
  m.spawnHider(6.5, -7.6);
  m.spawnHider(6.5, 7.6);
  m.spawnHider(0, -17.6);
  m.spawnHider(0, 17.6);
  m.spawnHider(2.0, 0);
  m.spawnSeeker(24.5, 0, 2.61);
  m.spawnSeeker(23.1, 1.7, 2.32);
  m.spawnSeeker(23.1, -1.7, 2.32);
  m.spawnSeeker(21.9, 0, 2.03);
  // x = 23.5 straddles two treads; 23.1 sits square on the 2.32 one.
  m.lobbySpawn(23.1, 0, 2.32);

  m.palette([SAND, SAND_DK, STONE, STONE_DK, ROCK, OCHRE, GOLD, GOLD_DK, LAPIS, LAPIS_LT, TURQ, RED, IVORY, BLACK]);
  return m.finish();
}
