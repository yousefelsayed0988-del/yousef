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
  const hurt = mob.hurtTimer > 0;
  const fuse = mob.fuse >= 0 ? (Math.floor(mob.fuse / 3) % 2 === 0 ? 1 : 0) : 0;
  const burning = mob.fireTicks > 0;

  const emit = (x0, y0, z0, x1, y1, z1, color, anim) => {
    let dz = 0, dy = 0;
    if (anim === 1 || anim === 4) dz = swing;
    else if (anim === 2 || anim === 3) dz = swing2;
    else if (anim === 6) dz = swing * 0.7;
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
      color = mob.sheared ? 0xe8dcc8 : (WOOL_COLORS[mob.woolColor % WOOL_COLORS.length] || 0xe9ecec);
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
