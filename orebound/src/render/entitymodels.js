// Entity models.
//
// Mobs are built from axis-aligned boxes in the same immediate-mode batch the
// selection box uses. Deliberately blocky, deliberately original -- no assets,
// no imported meshes. Limbs "walk" by sliding along the body's forward axis,
// which reads correctly at these proportions without needing joint rotation.

import { DYES } from '../core/blocks.js';

const P = 1 / 16;

// part: [x0,y0,z0, x1,y1,z1, color, animKind]
// anim: 0 none, 1 front-left leg, 2 front-right, 3 back-left, 4 back-right,
//       5 head (bob), 6 arms
const MODELS = {
  zombie: {
    parts: [
      [-4, 24, -4, 4, 32, 4, 0x6f9c55, 5],
      [-4, 12, -2, 4, 24, 2, 0x3d5a8c, 0],
      [-4, 0, -2, -1, 12, 2, 0x2b3550, 1],
      [1, 0, -2, 4, 12, 2, 0x2b3550, 2],
      [-8, 12, -2, -4, 22, 2, 0x6f9c55, 6],
      [4, 12, -2, 8, 22, 2, 0x6f9c55, 6],
    ],
    eyes: [[-2.5, 28, -4.2, -1, 29.5, -3.9], [1.5, 28, -4.2, 3, 29.5, -3.9]],
    eyeColor: 0x1a2a1a,
  },
  skeleton: {
    parts: [
      [-4, 24, -4, 4, 32, 4, 0xd8d6cc, 5],
      [-2, 12, -1.5, 2, 24, 1.5, 0xc8c6bc, 0],
      [-2, 0, -1.5, -0.5, 12, 1.5, 0xc8c6bc, 1],
      [0.5, 0, -1.5, 2, 12, 1.5, 0xc8c6bc, 2],
      [-5.5, 12, -1.5, -2.5, 22, 1.5, 0xc8c6bc, 6],
      [2.5, 12, -1.5, 5.5, 22, 1.5, 0xc8c6bc, 6],
    ],
    eyes: [[-2.5, 28, -4.2, -1, 29.5, -3.9], [1.5, 28, -4.2, 3, 29.5, -3.9]],
    eyeColor: 0x101010,
  },
  creeper: {
    parts: [
      [-4, 18, -4, 4, 26, 4, 0x53a353, 5],
      [-4, 6, -2, 4, 18, 2, 0x63b063, 0],
      [-4, 0, -6, -1, 6, -2, 0x4a9a4a, 1],
      [1, 0, -6, 4, 6, -2, 0x4a9a4a, 2],
      [-4, 0, 2, -1, 6, 6, 0x4a9a4a, 3],
      [1, 0, 2, 4, 6, 6, 0x4a9a4a, 4],
    ],
    eyes: [[-3, 21, -4.2, -1, 23, -3.9], [1, 21, -4.2, 3, 23, -3.9], [-1, 18.5, -4.2, 1, 21, -3.9]],
    eyeColor: 0x0e1a0e,
  },
  spider: {
    parts: [
      [-5, 3, -3, 5, 12, 8, 0x2e2320, 0],
      [-4, 4, -8, 4, 11, -3, 0x3a2c26, 5],
      [-10, 4, -2, -5, 7, 0, 0x241b18, 1],
      [5, 4, -2, 10, 7, 0, 0x241b18, 2],
      [-10, 4, 2, -5, 7, 4, 0x241b18, 3],
      [5, 4, 2, 10, 7, 4, 0x241b18, 4],
      [-9, 3, -5, -5, 6, -3, 0x241b18, 2],
      [5, 3, -5, 9, 6, -3, 0x241b18, 1],
    ],
    eyes: [[-3, 8, -8.3, -1.5, 9.5, -7.9], [1.5, 8, -8.3, 3, 9.5, -7.9]],
    eyeColor: 0xc02020,
  },
  cow: {
    parts: [
      [-6, 10, -6, 6, 20, 8, 0x4a3527, 0],
      [-4, 12, -12, 4, 20, -6, 0xe4dfd4, 5],
      [-6, 0, -5, -2, 10, -1, 0x3a2a1e, 1],
      [2, 0, -5, 6, 10, -1, 0x3a2a1e, 2],
      [-6, 0, 3, -2, 10, 7, 0x3a2a1e, 3],
      [2, 0, 3, 6, 10, 7, 0x3a2a1e, 4],
      [-5, 20, -11, -2, 23, -8, 0xd8d4c8, 5],
      [2, 20, -11, 5, 23, -8, 0xd8d4c8, 5],
    ],
    eyes: [[-3.5, 16, -12.3, -2, 17.5, -11.9], [2, 16, -12.3, 3.5, 17.5, -11.9]],
    eyeColor: 0x141414,
  },
  pig: {
    parts: [
      [-5, 6, -8, 5, 14, 8, 0xe8a5a5, 0],
      [-4, 6, -13, 4, 14, -8, 0xe09a9a, 5],
      [-2, 8, -14, 2, 11, -13, 0xc98080, 5],
      [-5, 0, -6, -1, 6, -2, 0xd08f8f, 1],
      [1, 0, -6, 5, 6, -2, 0xd08f8f, 2],
      [-5, 0, 2, -1, 6, 6, 0xd08f8f, 3],
      [1, 0, 2, 5, 6, 6, 0xd08f8f, 4],
    ],
    eyes: [[-3, 11, -13.3, -1.5, 12.5, -12.9], [1.5, 11, -13.3, 3, 12.5, -12.9]],
    eyeColor: 0x141414,
  },
  sheep: {
    parts: [
      [-6, 8, -8, 6, 19, 8, null, 0],          // wool body, colour from state
      [-4, 9, -13, 4, 17, -8, 0xe8dcc8, 5],
      [-5, 0, -6, -1, 8, -2, 0xe0d4c0, 1],
      [1, 0, -6, 5, 8, -2, 0xe0d4c0, 2],
      [-5, 0, 2, -1, 8, 6, 0xe0d4c0, 3],
      [1, 0, 2, 5, 8, 6, 0xe0d4c0, 4],
    ],
    eyes: [[-3, 14, -13.3, -1.5, 15.5, -12.9], [1.5, 14, -13.3, 3, 15.5, -12.9]],
    eyeColor: 0x141414,
  },
  rabbit: {
    parts: [
      [-2.5, 2, -3, 2.5, 6, 3, 0xa28b6f, 0],
      [-2, 4, -6, 2, 8, -3, 0xb5997a, 5],
      [-1.6, 8, -5.4, -0.4, 12, -4.4, 0xb5997a, 5],
      [0.4, 8, -5.4, 1.6, 12, -4.4, 0xb5997a, 5],
      [-2.5, 0, -2.5, -0.8, 2, -0.5, 0x8d7860, 1],
      [0.8, 0, -2.5, 2.5, 2, -0.5, 0x8d7860, 2],
      [-2.5, 0, 1, -0.8, 2, 3.5, 0x8d7860, 3],
      [0.8, 0, 1, 2.5, 2, 3.5, 0x8d7860, 4],
      [-1.2, 3, 3, 1.2, 5, 4.4, 0xe8e2d8, 0],
    ],
    eyes: [[-2.1, 6, -6.3, -1, 7.1, -5.9], [1, 6, -6.3, 2.1, 7.1, -5.9]],
    eyeColor: 0x2a1414,
  },
  wolf: {
    parts: [
      [-3, 6, -4, 3, 12, 6, 0xd8d4cc, 0],
      [-2.5, 7, -9, 2.5, 12.5, -4, 0xe4e0d8, 5],
      [-2.5, 12.5, -8, -0.6, 15, -6, 0xd0ccc4, 5],
      [0.6, 12.5, -8, 2.5, 15, -6, 0xd0ccc4, 5],
      [-1.2, 8.2, -10.6, 1.2, 10, -8.6, 0x3a3630, 5],
      [-2.6, 0, -3, -0.8, 6, -1, 0xcfcbc2, 1],
      [0.8, 0, -3, 2.6, 6, -1, 0xcfcbc2, 2],
      [-2.6, 0, 2.5, -0.8, 6, 4.5, 0xcfcbc2, 3],
      [0.8, 0, 2.5, 2.6, 6, 4.5, 0xcfcbc2, 4],
      [-0.9, 8, 5.5, 0.9, 13, 8, 0xd8d4cc, 0],
    ],
    eyes: [[-1.8, 10, -9.3, -0.7, 11, -8.9], [0.7, 10, -9.3, 1.8, 11, -8.9]],
    eyeColor: 0xc02020,
  },
  fox: {
    parts: [
      [-2.5, 4, -4, 2.5, 9, 6, 0xd67f31, 0],
      [-2.2, 5, -9, 2.2, 9.5, -4, 0xe08a3c, 5],
      [-2.2, 9.5, -8, -0.5, 12, -6.2, 0xc46a26, 5],
      [0.5, 9.5, -8, 2.2, 12, -6.2, 0xc46a26, 5],
      [-1.1, 5.8, -11, 1.1, 7.4, -9, 0xf0ece4, 5],
      [-2.3, 0, -3, -0.8, 4, -1.4, 0x3a2a1e, 1],
      [0.8, 0, -3, 2.3, 4, -1.4, 0x3a2a1e, 2],
      [-2.3, 0, 2.6, -0.8, 4, 4.2, 0x3a2a1e, 3],
      [0.8, 0, 2.6, 2.3, 4, 4.2, 0x3a2a1e, 4],
      [-1.6, 5, 5.5, 1.6, 8, 10, 0xf0ece4, 0],
    ],
    eyes: [[-1.6, 7.4, -9.3, -0.6, 8.4, -8.9], [0.6, 7.4, -9.3, 1.6, 8.4, -8.9]],
    eyeColor: 0x141414,
  },
  horse: {
    parts: [
      [-4, 11, -8, 4, 19, 8, 0x6b4a2c, 0],
      [-2.5, 16, -15, 2.5, 22, -8, 0x775432, 5],
      [-2, 21, -13.5, -0.4, 24, -12, 0x775432, 5],
      [0.4, 21, -13.5, 2, 24, -12, 0x775432, 5],
      [-1.6, 12.5, -18, 1.6, 17, -14, 0x5a3d24, 5],
      [-0.8, 19, -14, 0.8, 24, -8, 0x2e2018, 5],
      [-4, 0, -6, -1.4, 11, -3, 0x5f4227, 1],
      [1.4, 0, -6, 4, 11, -3, 0x5f4227, 2],
      [-4, 0, 4, -1.4, 11, 7, 0x5f4227, 3],
      [1.4, 0, 4, 4, 11, 7, 0x5f4227, 4],
      [-0.7, 14, 8, 0.7, 20, 12, 0x2e2018, 0],
    ],
    eyes: [[-2.3, 19, -15.3, -1.1, 20.2, -14.9], [1.1, 19, -15.3, 2.3, 20.2, -14.9]],
    eyeColor: 0x141414,
  },
  squid: {
    parts: [
      [-4, 4, -4, 4, 12, 4, 0x5a4a80, 0],
      [-1.2, 0, -4.4, 1.2, 4.5, -2, 0x4d3f6e, 1],
      [-4.4, 0, -1.2, -2, 4.5, 1.2, 0x4d3f6e, 2],
      [2, 0, -1.2, 4.4, 4.5, 1.2, 0x4d3f6e, 3],
      [-1.2, 0, 2, 1.2, 4.5, 4.4, 0x4d3f6e, 4],
      [-3.2, 0, -3.6, -1.4, 4, -1.8, 0x4d3f6e, 2],
      [1.4, 0, -3.6, 3.2, 4, -1.8, 0x4d3f6e, 1],
      [-3.2, 0, 1.8, -1.4, 4, 3.6, 0x4d3f6e, 4],
      [1.4, 0, 1.8, 3.2, 4, 3.6, 0x4d3f6e, 3],
    ],
    eyes: [[-4.3, 9, -2.2, -3.8, 10.6, -0.6], [3.8, 9, -2.2, 4.3, 10.6, -0.6]],
    eyeColor: 0xe0e0e0,
  },
  bat: {
    parts: [
      [-2, 4, -2, 2, 10, 2, 0x4a3a30, 0],
      [-2, 9, -2.4, 2, 13, 1.6, 0x584538, 5],
      [-2.4, 12.5, -1.6, -0.6, 15, -0.2, 0x584538, 5],
      [0.6, 12.5, -1.6, 2.4, 15, -0.2, 0x584538, 5],
      [-9, 5, -0.6, -2, 12, 0.6, 0x3c2f26, 6],
      [2, 5, -0.6, 9, 12, 0.6, 0x3c2f26, 6],
    ],
    eyes: [[-1.5, 11, -2.7, -0.6, 11.9, -2.3], [0.6, 11, -2.7, 1.5, 11.9, -2.3]],
    eyeColor: 0xc02020,
  },
  villager: {
    parts: [
      [-4, 24, -4, 4, 32, 4, 0xb8825f, 5],
      [-1.2, 25, -5.2, 1.2, 28, -3.8, 0xa06f4f, 5],
      [-4, 10, -3, 4, 24, 3, null, 0],
      [-2, 22, -3.4, 2, 24, 3.4, 0x8a6a4a, 0],
      [-2, 0, -2, -0.2, 10, 2, 0x3b3b46, 1],
      [0.2, 0, -2, 2, 10, 2, 0x3b3b46, 2],
      [-6, 12, -2.2, -4, 23, 2.2, null, 6],
      [4, 12, -2.2, 6, 23, 2.2, null, 6],
    ],
    eyes: [[-2.6, 28, -4.3, -1.4, 29.2, -3.9], [1.4, 28, -4.3, 2.6, 29.2, -3.9]],
    eyeColor: 0x2a2a3a,
  },
  chicken: {
    parts: [
      [-3, 5, -3, 3, 11, 4, 0xf0f0ee, 0],
      [-2, 9, -6, 2, 14, -3, 0xf0f0ee, 5],
      [-2, 14, -5, 2, 16, -3, 0xc03028, 5],
      [-1.5, 11, -7.5, 1.5, 13, -6, 0xe8a020, 5],
      [-2, 0, -1, -0.5, 5, 1, 0xe8a020, 1],
      [0.5, 0, -1, 2, 5, 1, 0xe8a020, 2],
      [-4, 6, -2, -3, 11, 3, 0xe4e4e0, 6],
      [3, 6, -2, 4, 11, 3, 0xe4e4e0, 6],
    ],
    eyes: [[-2.2, 12, -6.3, -1, 13.2, -5.9], [1, 12, -6.3, 2.2, 13.2, -5.9]],
    eyeColor: 0x141414,
  },
};

const WOOL_COLORS = DYES.map(d => d[1]);

/** Villager robes read their trade at a glance. */
const PROFESSION_COLORS = {
  farmer: 0x8a6a3a, librarian: 0xd8d0b0, blacksmith: 0x3b4250,
  butcher: 0xd8d8d8, cleric: 0x7a3fa0, cartographer: 0xd8c88a,
};

/**
 * Push one entity's boxes into the renderer's immediate-mode batch.
 * @param {number} light 0..1 light multiplier sampled at the entity position
 */
export function drawMob(renderer, mob, pos, light) {
  const model = MODELS[mob.type];
  if (!model) { renderer.pushBox(pos[0] - 0.3, pos[1], pos[2] - 0.3, pos[0] + 0.3, pos[1] + 1.6, pos[2] + 0.3, 0xcc44cc, light, mob.yaw, pos[0], pos[2]); return; }

  const scale = mob.baby ? 0.55 : 1;
  const swing = mob.moving ? Math.sin(mob.walkPhase) * 2.2 : 0;
  const swing2 = mob.moving ? Math.sin(mob.walkPhase + Math.PI) * 2.2 : 0;
  // bats beat their wings continuously; anim slot 6 doubles as the wing slot
  const flap = mob.def && mob.def.flying ? Math.sin(mob.wingPhase || 0) * 3.2 : 0;
  const hurt = mob.hurtTimer > 0;
  const fuse = mob.fuse >= 0 ? (Math.floor(mob.fuse / 3) % 2 === 0 ? 1 : 0) : 0;
  const burning = mob.fireTicks > 0;

  const emit = (x0, y0, z0, x1, y1, z1, color, anim) => {
    let dz = 0, dy = 0;
    if (anim === 1 || anim === 4) dz = swing;
    else if (anim === 2 || anim === 3) dz = swing2;
    else if (anim === 6) { dz = swing * 0.7; if (flap) { dy = flap; dz = 0; } }
    else if (anim === 5) dy = mob.moving ? Math.abs(Math.sin(mob.walkPhase)) * 0.4 : 0;

    let c = color;
    if (hurt) c = mixColor(c, 0xff4040, 0.55);
    if (fuse) c = mixColor(c, 0xffffff, 0.6);
    if (burning) c = mixColor(c, 0xff8020, 0.35);

    renderer.pushBox(
      pos[0] + x0 * P * scale, pos[1] + (y0 + dy) * P * scale, pos[2] + (z0 + dz) * P * scale,
      pos[0] + x1 * P * scale, pos[1] + (y1 + dy) * P * scale, pos[2] + (z1 + dz) * P * scale,
      c, light, mob.yaw, pos[0], pos[2]);
  };

  for (const p of model.parts) {
    let color = p[6];
    if (color === null) {
      color = mob.type === 'villager'
        ? (PROFESSION_COLORS[mob.profession] || 0x8a6a4a)
        : (mob.sheared ? 0xe8dcc8 : (WOOL_COLORS[mob.woolColor % WOOL_COLORS.length] || 0xe9ecec));
    }
    emit(p[0], p[1], p[2], p[3], p[4], p[5], color, p[7]);
  }
  if (model.eyes) {
    const dy = mob.moving ? Math.abs(Math.sin(mob.walkPhase)) * 0.4 : 0;
    for (const e of model.eyes) {
      renderer.pushBox(
        pos[0] + e[0] * P * scale, pos[1] + (e[1] + dy) * P * scale, pos[2] + e[2] * P * scale,
        pos[0] + e[3] * P * scale, pos[1] + (e[4] + dy) * P * scale, pos[2] + e[5] * P * scale,
        model.eyeColor, Math.min(1, light + 0.35), mob.yaw, pos[0], pos[2]);
    }
  }
}

/** Another player, drawn from the same box vocabulary as the mobs. */
export function drawRemotePlayer(renderer, r, pos, light, walking) {
  const scale = 1;
  const swing = walking ? Math.sin(performance.now() * 0.008) * 2.4 : 0;
  const crouch = r.sneak ? -2 : 0;
  const box = (x0, y0, z0, x1, y1, z1, color, dz = 0) => renderer.pushBox(
    pos[0] + x0 * P, pos[1] + (y0 + crouch) * P, pos[2] + (z0 + dz) * P,
    pos[0] + x1 * P, pos[1] + (y1 + crouch) * P, pos[2] + (z1 + dz) * P,
    color, light, r.yaw, pos[0], pos[2]);
  box(-4, 24, -4, 4, 32, 4, 0xc99b6d);            // head
  box(-4, 12, -2, 4, 24, 2, 0x3f7ac0);            // torso
  box(-4, 0, -2, -1, 12, 2, 0x2f3f6a, swing);     // legs
  box(1, 0, -2, 4, 12, 2, 0x2f3f6a, -swing);
  box(-8, 12, -2, -4, 22, 2, 0xc99b6d, -swing);   // arms
  box(4, 12, -2, 8, 22, 2, 0xc99b6d, swing);
  // eyes, so you can tell which way someone is facing at a distance
  renderer.pushBox(pos[0] - 2.6 * P, pos[1] + (28 + crouch) * P, pos[2] - 4.3 * P,
    pos[0] - 1.2 * P, pos[1] + (29.4 + crouch) * P, pos[2] - 3.9 * P,
    0x25262e, Math.min(1, light + 0.3), r.yaw, pos[0], pos[2]);
  renderer.pushBox(pos[0] + 1.2 * P, pos[1] + (28 + crouch) * P, pos[2] - 4.3 * P,
    pos[0] + 2.6 * P, pos[1] + (29.4 + crouch) * P, pos[2] - 3.9 * P,
    0x25262e, Math.min(1, light + 0.3), r.yaw, pos[0], pos[2]);
}

export function drawItemEntity(renderer, e, pos, light, color) {
  const spin = (e.age * 0.045) % (Math.PI * 2);
  const bob = Math.sin(e.age * 0.09) * 0.045;
  const s = 0.13;
  renderer.pushBox(
    pos[0] - s, pos[1] + 0.06 + bob, pos[2] - s,
    pos[0] + s, pos[1] + 0.06 + bob + s * 2, pos[2] + s,
    color, light, spin, pos[0], pos[2]);
}

export function drawArrow(renderer, e, pos, light) {
  const s = 0.045;
  renderer.pushBox(pos[0] - s, pos[1] - s, pos[2] - 0.35, pos[0] + s, pos[1] + s, pos[2] + 0.15,
    0x8a6a3a, light, e.yaw, pos[0], pos[2]);
  renderer.pushBox(pos[0] - s * 1.6, pos[1] - s * 1.6, pos[2] - 0.42, pos[0] + s * 1.6, pos[1] + s * 1.6, pos[2] - 0.30,
    0xc8c8c8, light, e.yaw, pos[0], pos[2]);
}

const BOAT_COLORS = {
  oak: 0xa9763f, spruce: 0x7a5c3a, birch: 0xd7c589, jungle: 0xa07550,
  acacia: 0xb05c33, dark_oak: 0x50361c, cherry: 0xe0b6ac,
};

export function drawBoat(renderer, e, pos, light) {
  const c = BOAT_COLORS[e.wood] || 0xa9763f;
  const box = (x0, y0, z0, x1, y1, z1) => renderer.pushBox(
    pos[0] + x0, pos[1] + y0, pos[2] + z0,
    pos[0] + x1, pos[1] + y1, pos[2] + z1,
    c, light, e.yaw, pos[0], pos[2]);
  box(-0.7, 0.0, -0.5, 0.7, 0.12, 0.5);          // hull floor
  box(-0.7, 0.12, -0.5, -0.55, 0.42, 0.5);       // stern
  box(0.55, 0.12, -0.5, 0.7, 0.42, 0.5);         // bow
  box(-0.7, 0.12, -0.5, 0.7, 0.42, -0.36);       // port side
  box(-0.7, 0.12, 0.36, 0.7, 0.42, 0.5);         // starboard side
  box(-0.1, 0.12, -0.36, 0.1, 0.26, 0.36);       // bench
}

export function drawTNT(renderer, e, pos, light) {
  // flash white as the fuse runs out
  const flash = (Math.floor(e.fuse / 4) % 2 === 0) ? 0xffffff : 0xc23a2a;
  renderer.pushBox(pos[0] - 0.49, pos[1], pos[2] - 0.49, pos[0] + 0.49, pos[1] + 0.98, pos[2] + 0.49,
    flash, Math.min(1, light + 0.3), 0, 0, 0);
}

export function drawFallingBlock(renderer, e, pos, light, color) {
  renderer.pushBox(pos[0] - 0.5, pos[1], pos[2] - 0.5, pos[0] + 0.5, pos[1] + 1, pos[2] + 0.5, color, light, 0, 0, 0);
}

function mixColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

/** Average colour of an atlas tile -- used to colour dropped-item cubes. */
export function averageTileColor(tile) {
  if (!tile) return 0xaaaaaa;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 256; i++) {
    const a = tile.px[i * 4 + 3];
    if (a < 40) continue;
    r += tile.px[i * 4]; g += tile.px[i * 4 + 1]; b += tile.px[i * 4 + 2];
    n++;
  }
  if (n === 0) return 0xaaaaaa;
  return (((r / n) | 0) << 16) | (((g / n) | 0) << 8) | ((b / n) | 0);
}
