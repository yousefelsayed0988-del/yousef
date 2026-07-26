// One movement step, shared verbatim by the client's prediction and the
// server's authority. Given the same player state and the same input it must
// produce bit-identical output on both ends, otherwise the client rubber-bands
// and the anti-cheat starts flagging honest players.

import { MOVE, STAMINA, Stance, Role } from './constants.js';
import { moveCapsule, capsuleOverlaps } from './collision.js';
import { clamp } from './math.js';

export const BTN = {
  JUMP: 1,
  SPRINT: 2,
  CROUCH: 4,
  PRONE: 8,
  USE: 16,
};

/** Stance the player is asking for, before headroom is taken into account. */
function wantedStance(buttons) {
  if (buttons & BTN.PRONE) return Stance.PRONE;
  if (buttons & BTN.CROUCH) return Stance.CROUCH;
  return Stance.STAND;
}

/**
 * Advance one player by `dt` seconds under `input`.
 * Mutates p.pos, p.vel, p.stance, p.stamina, p.onGround, p.yaw, p.pitch.
 * `p` needs: pos, vel, yaw, pitch, stance, stamina, onGround, role, frozen.
 */
export function applyInput(world, p, input, dt) {
  dt = clamp(dt, MOVE.minInputDt, MOVE.maxInputDt);

  // Look angles are always the client's to set - they are cosmetic until a
  // shot is fired, and the shot path validates them separately.
  if (Number.isFinite(input.yaw)) p.yaw = input.yaw;
  if (Number.isFinite(input.pitch)) p.pitch = clamp(input.pitch, -1.553, 1.553);

  const buttons = input.buttons | 0;

  // Stance: standing up needs headroom, so a player crouched under a shelf
  // stays crouched instead of teleporting through it.
  let stance = wantedStance(buttons);
  if (stance < p.stance) {
    const h = MOVE.height[stance];
    if (capsuleOverlaps(world, p.pos.x, p.pos.y, p.pos.z, MOVE.radius, h)) stance = p.stance;
  }
  p.stance = stance;

  const height = MOVE.height[stance];

  if (p.frozen) {
    // Hunters during prep, and anyone in the round-end freeze: gravity still
    // applies so nobody hangs in the air, but no input moves them.
    p.vel.x = 0; p.vel.z = 0;
    p.vel.y -= MOVE.gravity * dt;
    const r = moveCapsule(world, p.pos, p.vel, dt, MOVE.radius, height, { stepHeight: MOVE.stepHeight });
    p.onGround = r.onGround;
    if (r.onGround && p.vel.y < 0) p.vel.y = 0;
    return r;
  }

  // Movement intent, rotated out of the player's frame into the world.
  let mx = clamp(input.mx || 0, -1, 1);
  let mz = clamp(input.mz || 0, -1, 1);
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }

  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Forward is -Z in the player's frame; yaw rotates it about +Y.
  const wishX = -mx * cos - mz * sin;
  const wishZ = mx * sin - mz * cos;

  // Sprinting: only upright, only moving forward-ish, only with stamina.
  const wantSprint = !!(buttons & BTN.SPRINT) && stance === Stance.STAND && mag > 0.1;
  const canSprint = wantSprint && p.stamina > (p.sprinting ? 0 : STAMINA.sprintMin);
  p.sprinting = canSprint;
  if (canSprint) {
    p.stamina = Math.max(0, p.stamina - STAMINA.drain * dt);
    p.staminaHold = STAMINA.regenDelay;
  } else if ((p.staminaHold ?? 0) > 0) {
    p.staminaHold -= dt;
  } else {
    p.stamina = Math.min(STAMINA.max, p.stamina + STAMINA.regen * dt);
  }

  let speed = MOVE.speed[stance];
  if (canSprint) speed *= MOVE.sprintMul;
  if (p.role === Role.SEEKER) speed *= MOVE.seekerMul;
  if (p.speedMul) speed *= p.speedMul; // ability effects (tail dash, slows)

  const wishSpeed = speed * Math.min(1, mag);
  const accel = p.onGround ? MOVE.accelGround : MOVE.accelAir;

  // Ground friction, applied before acceleration so stopping feels crisp.
  if (p.onGround) {
    const cur = Math.hypot(p.vel.x, p.vel.z);
    if (cur > 0) {
      const drop = Math.max(cur, 1) * MOVE.friction * dt;
      const scale = Math.max(0, cur - drop) / cur;
      p.vel.x *= scale;
      p.vel.z *= scale;
    }
  }

  if (wishSpeed > 0) {
    const curSpeed = p.vel.x * wishX + p.vel.z * wishZ;
    const addSpeed = wishSpeed - curSpeed;
    if (addSpeed > 0) {
      const accelSpeed = Math.min(accel * dt * wishSpeed, addSpeed);
      p.vel.x += wishX * accelSpeed;
      p.vel.z += wishZ * accelSpeed;
    }
  }

  if ((buttons & BTN.JUMP) && p.onGround && stance === Stance.STAND && p.stamina > 5) {
    p.vel.y = MOVE.jumpVel;
    p.onGround = false;
    p.stamina = Math.max(0, p.stamina - 6);
    p.jumped = true;
  }

  p.vel.y -= MOVE.gravity * dt;
  if (p.vel.y < -MOVE.maxVertSpeed) p.vel.y = -MOVE.maxVertSpeed;

  const res = moveCapsule(world, p.pos, p.vel, dt, MOVE.radius, height, { stepHeight: MOVE.stepHeight });
  p.onGround = res.onGround;
  if (res.onGround && p.vel.y < 0) {
    p.landedFrom = p.vel.y;
    p.vel.y = 0;
  }
  return res;
}

/** Eye position for a player, used for cameras, shots and visibility. */
export function eyeOf(p, out = {}) {
  out.x = p.pos.x;
  out.y = p.pos.y + MOVE.eye[p.stance ?? 0];
  out.z = p.pos.z;
  return out;
}

/** Horizontal speed, the number the anti-cheat cares about most. */
export const horizSpeed = (p) => Math.hypot(p.vel.x, p.vel.z);
