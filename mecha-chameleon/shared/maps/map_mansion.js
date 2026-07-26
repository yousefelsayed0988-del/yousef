// Hide-and-Seek Mansion - the reference map. Two wings, a central hall with a
// staircase to a balcony, and enough upholstery that a well-painted chameleon
// can sit in plain sight.

import { createMap } from './kit.js';

export const meta = {
  id: 'mansion',
  name: 'Hide-and-Seek Mansion',
  theme: 'Victorian interior',
  tagline: 'Wine reds, oak and dust. Sit still and be furniture.',
  difficulty: 2,
};

export function build() {
  const m = createMap({
    ...meta,
    size: [56, 44],
    ceiling: 5.4,
    sky: '#1d1a24',
    ambient: '#4a4048',
    sunDir: [-0.35, -0.78, -0.52],
    sunColor: '#ffe3bd',
    sunIntensity: 0.55,
    fog: '#2a232c',
    fogDensity: 0.016,
  });

  const WOOD = '#5c3f2a';
  const FLOOR = '#6b4a30';
  const WALL = '#7d6350';
  const WALL_DARK = '#5f4a3c';
  const CARPET = '#7a2230';
  const TRIM = '#3f2c1e';
  const GOLD = '#b3903f';
  const CREAM = '#c9b795';

  m.perimeter(9, '#2a2027');
  m.floor(0, 0, 56, 44, FLOOR);
  m.ceil(0, 0, 56, 44, '#3a2e28', 5.4);

  // ------------------------------------------------------------ great hall --
  // The wing doorways have to line up with the openings the wings themselves
  // declare, or the rooms end up sealed behind two coincident walls.
  m.room({
    x: 0, z: 0, w: 24, d: 24, h: 5.4, floor: FLOOR, wall: WALL,
    openings: [
      { side: 'w', at: -8, width: 4, height: 3.4 },   // library
      { side: 'e', at: -8, width: 4, height: 3.4 },   // kitchen
      { side: 'w', at: 10, width: 4, height: 3.4 },   // dining room
      { side: 'e', at: 10, width: 4, height: 3.4 },   // ballroom
      { side: 'n', at: -6, width: 3.2, height: 3.4 },
      { side: 'n', at: 6, width: 3.2, height: 3.4 },
      { side: 's', at: 0, width: 5, height: 3.6 },
    ],
  });
  m.rug(0, 2, 12, 9, CARPET);

  // Staircase up to a balcony that overlooks the hall. The top step has to
  // land flush with the balcony's walking surface (3.26), not its underside,
  // and the balustrade needs a gap where the stair arrives.
  const BALCONY_Y = 3.26;
  const STAIR_STEPS = 12, STAIR_RUN = 0.34;
  const STAIR_RISE = BALCONY_Y / STAIR_STEPS;
  const STAIR_TOP_Z = -8.7;
  m.stairs(0, STAIR_TOP_Z + STAIR_STEPS * STAIR_RUN, 5, STAIR_STEPS, STAIR_RISE, STAIR_RUN, WOOD, { yaw: 180 });
  m.box(0, BALCONY_Y - 0.4, -10.4, 12, 0.4, 3.4, WOOD, { tag: 'balcony' });
  m.box(-4.6, BALCONY_Y - 0.4, -6.6, 2.8, 0.4, 4.4, WOOD, { tag: 'balcony' });
  m.box(4.6, BALCONY_Y - 0.4, -6.6, 2.8, 0.4, 4.4, WOOD, { tag: 'balcony' });
  for (let i = -6; i <= 6; i++) {
    const px = i * 0.95;
    if (Math.abs(px) < 2.9) continue; // stair mouth
    m.box(px, BALCONY_Y, STAIR_TOP_Z, 0.09, 0.85, 0.09, TRIM);
  }
  for (const s of [-1, 1]) {
    m.box(s * 4.45, BALCONY_Y + 0.85, STAIR_TOP_Z, 3.1, 0.12, 0.16, WOOD);
  }
  m.spot(0, BALCONY_Y, -10.2, { stance: 'prone', quality: 0.86, hint: 'Flat on the balcony lip' });
  m.spot(-4.6, BALCONY_Y, -6.6, { stance: 'prone', quality: 0.78, hint: 'On the west gallery wing' });
  m.spot(4.6, BALCONY_Y, -6.6, { stance: 'prone', quality: 0.78, hint: 'On the east gallery wing' });

  // Pillars and the chandelier.
  for (const [px, pz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    m.pillar(px, pz, 0.55, 5.4, CREAM);
    m.box(px, 5.0, pz, 1.5, 0.4, 1.5, GOLD, { tag: 'capital' });
    m.spot(px + 0.9, 0, pz, { stance: 'stand', quality: 0.6, hint: 'Behind a pillar' });
  }
  m.cyl(0, 4.2, 0, 1.1, 0.5, GOLD, { solid: false, emis: 0.7 });
  m.light(0, 4.0, 0, '#ffdfae', 1.5, 22);

  // Furniture that doubles as cover.
  m.sofa(-6, 6.5, 3.2, '#6a2a34', { yaw: 0 });
  m.sofa(6, 6.5, 3.2, '#6a2a34', { yaw: 180 });
  m.table(0, 6.5, 2.2, 1.1, 0.72, WOOD);
  m.plant(-10.4, 4.5, 1.25, '#7a5a3c', '#3d6b3a');
  m.plant(10.4, 4.5, 1.25, '#7a5a3c', '#3d6b3a');
  m.plant(-10.4, -4.5, 1.1, '#7a5a3c', '#3d6b3a');
  m.plant(10.4, -4.5, 1.1, '#7a5a3c', '#3d6b3a');

  // ------------------------------------------------------------ west wing --
  m.room({
    x: -19, z: -8, w: 14, d: 16, h: 4.6, floor: '#5a4a3a', wall: WALL_DARK,
    openings: [{ side: 'e', at: 0, width: 4, height: 3.4 }],
  });
  // Library: bookcases make superb vertical clutter.
  for (let i = 0; i < 5; i++) {
    m.shelf(-24.6, -14 + i * 3.1, 2.6, 2.9, 0.6, '#4a3222', { yaw: 90, levels: 5 });
  }
  for (let i = 0; i < 3; i++) {
    m.shelf(-14.2, -12 + i * 3.4, 2.6, 2.9, 0.6, '#4a3222', { yaw: -90, levels: 5 });
  }
  // Book spines: dozens of small colour targets to paint against.
  for (let i = 0; i < 90; i++) {
    const shelfX = m.chance(0.55) ? -24.1 : -14.7;
    const y = 0.35 + Math.floor(m.rand() * 5) * 0.56;
    const z = -14 + m.rand() * 13;
    m.box(shelfX, y, z, 0.32, m.range(0.2, 0.34), m.range(0.05, 0.09),
      m.pick(['#8a2f2f', '#2f5a8a', '#2f7a4a', '#8a742f', '#5a2f7a', '#c9b795']),
      { solid: false, tag: 'book' });
  }
  m.table(-19, -8, 2.6, 1.3, 0.76, '#4a3222');
  m.chair(-19, -6.2, '#4a3222', { yaw: 0 });
  m.chair(-19, -9.8, '#4a3222', { yaw: 180 });
  m.spot(-19, 0, -8, { stance: 'prone', quality: 0.8, hint: 'Under the reading table' });
  m.light(-19, 3.8, -8, '#ffd9a0', 0.9, 14);
  m.spot(-24.2, 0.35, -3, { stance: 'crouch', quality: 0.88, hint: 'Wedged in the bookcase' });

  // Dining room, west-south.
  m.room({
    x: -19, z: 10, w: 14, d: 14, h: 4.6, floor: FLOOR, wall: WALL,
    openings: [{ side: 'e', at: 0, width: 4, height: 3.2 }],
  });
  m.table(-19, 10, 5.2, 1.6, 0.78, '#3f2c1e');
  for (let i = -2; i <= 2; i++) {
    m.chair(-19 + i * 1.1, 11.4, '#3f2c1e', { yaw: 0 });
    m.chair(-19 + i * 1.1, 8.6, '#3f2c1e', { yaw: 180 });
  }
  m.spot(-19, 0, 10, { stance: 'prone', quality: 0.84, hint: 'Under the long table' });
  m.box(-24.5, 0, 10, 1.2, 2.4, 4.4, '#4a3222', { tag: 'cabinet' });
  m.spot(-23.4, 0, 12.6, { stance: 'crouch', quality: 0.7, hint: 'Beside the cabinet' });
  m.light(-19, 3.6, 10, '#ffd9a0', 0.9, 14);

  // ------------------------------------------------------------ east wing --
  m.room({
    x: 19, z: -8, w: 14, d: 16, h: 4.6, floor: '#5f5348', wall: '#6d5b4c',
    openings: [{ side: 'w', at: 0, width: 4, height: 3.2 }],
  });
  // Kitchen: counters, crates and a walk-in pantry.
  m.box(19, 0, -15.2, 12, 0.92, 0.8, '#8e8577', { tag: 'counter' });
  m.box(24.2, 0, -8, 0.8, 0.92, 12, '#8e8577', { tag: 'counter' });
  for (let i = 0; i < 6; i++) {
    m.box(14.5 + i * 1.6, 0.92, -15.2, 0.5, 0.5, 0.5, m.pick(['#b7b2a6', '#8e8577', '#6d6459']),
      { solid: false, jitter: 0.06 });
  }
  m.locker(13.6, -12, 1.1, 2.2, 0.9, '#5a5148', { yaw: 90 });
  m.locker(13.6, -10.4, 1.1, 2.2, 0.9, '#5a5148', { yaw: 90 });
  m.crateStack(22, -2.5, '#7a5c3a', 3, 0.95);
  m.barrel(16, -3, '#4a5a4a');
  m.barrel(16.9, -3.4, '#4a5a4a');
  m.light(19, 3.8, -8, '#e8f0ff', 0.8, 14);
  m.spot(19, 0, -14.4, { stance: 'crouch', quality: 0.82, hint: 'Under the counter run' });

  // Ballroom, east-south: deliberately open, so only good paint saves you.
  m.room({
    x: 19, z: 10, w: 14, d: 14, h: 5.2, floor: '#7a6a52', wall: '#8a7a62',
    openings: [{ side: 'w', at: 0, width: 4, height: 3.4 }],
  });
  for (let i = 0; i < 4; i++) {
    m.pillar(14.5 + i * 3, 15.5, 0.4, 5.2, CREAM);
    m.pillar(14.5 + i * 3, 4.6, 0.4, 5.2, CREAM);
  }
  m.rug(19, 10, 9, 8, '#5a3040');
  m.box(24.4, 0, 10, 0.5, 1.1, 5, '#8a7a62', { tag: 'ledge' });
  m.spot(24.0, 1.1, 10, { stance: 'prone', quality: 0.66, hint: 'On the window ledge' });
  m.light(19, 4.4, 10, '#ffeccd', 1.1, 18);
  m.cyl(19, 4.2, 10, 0.8, 0.4, GOLD, { solid: false, emis: 0.6 });

  // ------------------------------------------------------ corridors + trim --
  for (let i = 0; i < 14; i++) {
    const x = -26 + i * 4;
    m.poster(x, 2.6, -21.7, 1.4, 1.8, m.pick(['#3a2a4a', '#4a3a2a', '#2a3a4a']), { yaw: 0 });
  }
  // Suits of armour: person-shaped decoys that also break up outlines.
  for (const [ax, az] of [[-11.5, -11], [11.5, -11], [-11.5, 11], [11.5, 11]]) {
    m.box(ax, 0, az, 0.6, 0.1, 0.6, '#3a3a42');
    m.box(ax, 0.1, az, 0.5, 1.1, 0.36, '#6a6a74', { tag: 'armour' });
    m.sphere(ax, 1.45, az, 0.22, '#6a6a74');
    m.box(ax + 0.34, 0.3, az, 0.12, 1.5, 0.12, '#8a8a94');
    m.spot(ax, 0, az + 0.7, { stance: 'crouch', quality: 0.74, hint: 'Beside the armour' });
  }

  // Fireplaces - dark alcoves, the single best spot on the map if painted right.
  for (const [fx, fz, yaw] of [[-11.7, 0, 90], [11.7, 0, -90]]) {
    m.box(fx, 0, fz, 0.8, 3.0, 3.6, '#4a3f38', { tag: 'chimney' });
    m.box(fx + (yaw > 0 ? 0.3 : -0.3), 0, fz, 0.4, 1.5, 1.9, '#241d1a', { solid: false, tag: 'hearth' });
    m.spot(fx + (yaw > 0 ? 0.5 : -0.5), 0, fz, { stance: 'crouch', quality: 0.9, hint: 'Inside the cold fireplace' });
    m.light(fx, 1.2, fz, '#ff8a3a', 0.35, 6);
  }

  // ---------------------------------------------------------------- spawns --
  m.spawnHider(0, 4); m.spawnHider(-3, 6); m.spawnHider(3, 6);
  m.spawnHider(-19, -8); m.spawnHider(19, -8); m.spawnHider(-19, 10); m.spawnHider(19, 10);
  m.spawnHider(0, -4); m.spawnHider(-7, 0); m.spawnHider(7, 0);
  m.spawnSeeker(0, 10.5); m.spawnSeeker(-2, 10.5); m.spawnSeeker(2, 10.5); m.spawnSeeker(0, 9);
  m.lobbySpawn(0, 8);

  m.palette([FLOOR, WALL, WALL_DARK, CARPET, WOOD, TRIM, GOLD, CREAM, '#6a2a34', '#4a3222', '#8e8577', '#241d1a']);
  return m.finish();
}
