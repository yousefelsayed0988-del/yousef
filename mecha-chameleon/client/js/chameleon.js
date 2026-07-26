// The chameleon, as pure geometry. No GL calls, no DOM - it returns a list of
// primitive parts and the renderer instances them.
//
// Local frame: +Y up, -Z forward, origin at the FEET. Sizes are full extents.
// Everything is deterministic: the same (paint, pose, animT, stance, opts) must
// always produce the same parts, because two clients drawing the same hider
// differently is a fairness problem, not a cosmetic one.
//
// Limbs and tail are built from joint positions rather than by eyeballing
// offsets and rotations separately - `bone()` takes two points and works out
// where the cylinder goes, so nothing detaches when a pose moves a joint.

import { MOVE, Stance, PAINT } from '../../shared/constants.js';
import { clamp, clamp01 } from '../../shared/math.js';

const BOX = 0, CYL = 1, SPHERE = 2;

export const PART_COUNT = 80;

// Pose shaping. Each entry warps the base rig instead of redefining it, so a
// new pose is a handful of numbers rather than a new model.
const POSE_SHAPES = {
  idle: { lift: 1.0, squash: 1.0, spread: 1.0, tailCurl: 1.0, headDrop: 0, flatten: 1.0, legSplay: 1.0 },
  crouch: { lift: 0.6, squash: 0.9, spread: 1.15, tailCurl: 1.35, headDrop: 0.05, flatten: 1.0, legSplay: 1.4 },
  prone: { lift: 0.26, squash: 0.7, spread: 1.3, tailCurl: 0.7, headDrop: 0.08, flatten: 1.0, legSplay: 1.9 },
  wall: { lift: 0.88, squash: 1.05, spread: 1.4, tailCurl: 1.5, headDrop: 0, flatten: 0.45, legSplay: 1.7 },
  ball: { lift: 0.52, squash: 0.8, spread: 0.6, tailCurl: 2.3, headDrop: 0.2, flatten: 1.0, legSplay: 0.5 },
  stack: { lift: 0.68, squash: 0.88, spread: 0.72, tailCurl: 1.8, headDrop: 0.13, flatten: 1.0, legSplay: 0.6, boxy: 1 },
  hang: { lift: 0.95, squash: 1.0, spread: 1.3, tailCurl: 1.7, headDrop: -0.08, flatten: 1.0, legSplay: 1.6, inverted: 1 },
  statue: { lift: 0.94, squash: 1.0, spread: 0.85, tailCurl: 1.1, headDrop: 0, flatten: 1.0, legSplay: 0.8, still: 1 },
};

const EMOTE_SHAPES = { sit: 'crouch', ball: 'ball', flat: 'prone', statue: 'statue' };

/** Deterministic 0..1 from an integer, for the noise pattern. */
function hash01(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Blend a part's base colour toward the pattern colour. `t` is 0..1
 * front-to-back along the body.
 */
function patterned(base, pattern, patternColour, index, t) {
  if (!pattern || pattern === 'solid' || !patternColour) return base;
  let mix = 0;
  switch (pattern) {
    case 'stripes': mix = Math.sin(t * Math.PI * 7) > 0 ? 0.85 : 0; break;
    case 'spots': mix = index % 3 === 0 ? 0.75 : 0; break;
    case 'scales': mix = ((index % 2) ^ (Math.floor(t * 6) % 2)) ? 0.5 : 0; break;
    case 'checker': mix = index % 2 === 0 ? 0.8 : 0; break;
    case 'gradient': mix = clamp01(t) * 0.85; break;
    case 'noise': mix = hash01(index * 7 + 13) > 0.55 ? 0.7 : 0; break;
    default: mix = 0;
  }
  if (mix <= 0) return base;
  return [
    base[0] + (patternColour[0] - base[0]) * mix,
    base[1] + (patternColour[1] - base[1]) * mix,
    base[2] + (patternColour[2] - base[2]) * mix,
  ];
}

const shade = (c, k) => [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];

export function buildChameleon(paint = {}, pose = 'idle', animT = 0, stance = Stance.STAND, opts = {}) {
  const parts = [];
  const P = {
    body: paint.body || [0.55, 0.72, 0.45],
    head: paint.head || paint.body || [0.58, 0.75, 0.48],
    tail: paint.tail || paint.body || [0.5, 0.68, 0.42],
    legs: paint.legs || paint.body || [0.48, 0.64, 0.4],
    crest: paint.crest || paint.body || [0.62, 0.8, 0.5],
    eyes: paint.eyes || [0.12, 0.12, 0.16],
  };
  const pattern = PAINT.patterns.includes(paint.pattern) ? paint.pattern : 'solid';
  const patternColour = paint.patternColor || shade(P.body, 0.7);

  const emoteShape = opts.emote && EMOTE_SHAPES[opts.emote];
  const shapeKey = emoteShape || (POSE_SHAPES[pose] ? pose : 'idle');
  const S = POSE_SHAPES[shapeKey];

  const capsule = MOVE.height[clamp(stance | 0, 0, 2)];
  const lift = S.lift;
  const flat = S.flatten;
  const spread = S.spread;

  const still = S.still || opts.tagged || !opts.moving;
  const speed = clamp(opts.speed || 0, 0, 8);
  const walkPhase = opts.moving ? animT * (5.0 + speed * 0.7) : 0;
  const breathe = still ? Math.sin(animT * 1.6) * 0.010 : Math.sin(animT * 3.2) * 0.018;
  const sway = opts.moving ? Math.sin(walkPhase) * 0.045 : 0;
  const bob = opts.moving ? Math.abs(Math.sin(walkPhase * 2)) * 0.022 : 0;

  const bodyLen = 1.0;
  const bodyY = 0.70 * lift + bob + breathe;
  const bodyW = 0.36 * spread * flat;
  const bodyH = 0.44 * S.squash;

  const add = (type, x, y, z, sx, sy, sz, colour, extra = {}) => {
    parts.push({
      type,
      off: { x, y, z },
      size: { x: Math.max(0.008, sx), y: Math.max(0.008, sy), z: Math.max(0.008, sz) },
      yaw: extra.yaw || 0,
      pitch: extra.pitch || 0,
      roll: extra.roll || 0,
      colour,
      params: extra.params || [0.72, 0.06, 0, 1],
    });
  };

  /**
   * A cylinder spanning two points. A cylinder's own axis is +Y, and the
   * renderer's YXZ euler maps that to (sin p sin yaw, cos p, sin p cos yaw) -
   * so pitch is the angle off vertical and yaw is the compass bearing.
   */
  const bone = (a, b, radius, colour, params) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const pitch = Math.acos(clamp(dy / len, -1, 1));
    const yaw = Math.atan2(dx, dz);
    add(CYL, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
      radius * 2, len, radius * 2, colour, { yaw, pitch, params });
  };

  const tagged = !!opts.tagged;
  const splat = [1, 0.34, 0.48];

  // ------------------------------------------------------------- torso ----
  const SEGMENTS = 5;
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / (SEGMENTS - 1);
    const z = -bodyLen * 0.45 + t * bodyLen;
    const taper = 0.66 + Math.sin((1 - t) * Math.PI * 0.85 + 0.35) * 0.44;
    const w = bodyW * taper;
    const h = bodyH * taper;
    const colour = patterned(P.body, pattern, patternColour, i, t);
    add(BOX, sway * (1 - t) * 0.5, bodyY + Math.sin(t * Math.PI) * 0.015, z,
      w, h, bodyLen / SEGMENTS * 1.3, tagged && i % 2 ? splat : colour,
      { params: [0.7, 0.05, 0, 1] });

    // Dorsal crest: the sail of small plates that says "chameleon" in one look.
    const crestH = (0.06 + Math.sin(t * Math.PI) * 0.07) * lift;
    add(BOX, 0, bodyY + h * 0.5 + crestH * 0.5, z, 0.03 * flat, crestH, bodyLen / SEGMENTS * 1.0,
      patterned(P.crest, pattern, patternColour, i + 11, t), { params: [0.55, 0.1, 0, 1] });
  }

  // Mecha detailing: a chest plate, shoulder vents and a panel line per flank.
  add(BOX, 0, bodyY - bodyH * 0.18, -bodyLen * 0.3, bodyW * 0.72, bodyH * 0.42, 0.18,
    shade(P.body, 1.16), { params: [0.34, 0.62, 0, 1] });
  for (const s of [-1, 1]) {
    add(BOX, s * bodyW * 0.48, bodyY + bodyH * 0.22, -bodyLen * 0.2, 0.05, 0.09, 0.18,
      shade(P.body, 0.7), { params: [0.3, 0.7, 0, 1] });
    add(BOX, s * bodyW * 0.5, bodyY, bodyLen * 0.05, 0.02, bodyH * 0.36, bodyLen * 0.55,
      shade(P.body, 0.6), { params: [0.4, 0.5, 0, 1] });
  }

  // --------------------------------------------------------------- head ----
  const headZ = -bodyLen * 0.5 - 0.26;
  const headY = bodyY + (0.14 - S.headDrop) * lift;
  bone([0, bodyY + 0.03, -bodyLen * 0.42], [0, headY, headZ + 0.1], 0.10 * flat,
    patterned(P.head, pattern, patternColour, 20, 0.05), [0.68, 0.08, 0, 1]);

  const headC = patterned(P.head, pattern, patternColour, 21, 0);
  add(SPHERE, 0, headY, headZ, 0.38 * flat, 0.35, 0.42, headC, { params: [0.62, 0.1, 0, 1] });
  // Casque: the swept crest at the back of the skull.
  add(BOX, 0, headY + 0.16, headZ + 0.07, 0.04 * flat, 0.17, 0.19,
    patterned(P.crest, pattern, patternColour, 22, 0), { params: [0.5, 0.14, 0, 1] });
  // Snout and jaw.
  add(BOX, 0, headY - 0.03, headZ - 0.15, 0.16 * flat, 0.12, 0.18, shade(headC, 1.06),
    { params: [0.6, 0.1, 0, 1] });
  add(BOX, 0, headY - 0.10, headZ - 0.13, 0.13 * flat, 0.03, 0.17, shade(headC, 0.7),
    { params: [0.45, 0.2, 0, 1] });

  // Eye turrets, each swivelling on its own. The signature of the animal, and
  // what keeps a motionless chameleon from looking like a prop.
  const lookAt = opts.lookAt;
  for (const s of [-1, 1]) {
    const base = { x: s * 0.15 * flat, y: headY + 0.07, z: headZ + 0.02 };
    let eyeYaw, eyePitch;
    if (lookAt) {
      const dx = lookAt.x - base.x, dz = lookAt.z - base.z;
      eyeYaw = clamp(Math.atan2(-dx, -dz), -1.1, 1.1);
      eyePitch = clamp(Math.atan2((lookAt.y || 0) - base.y, Math.hypot(dx, dz)), -0.7, 0.7);
    } else {
      const f = s > 0 ? 0.37 : 0.29;
      const saccade = Math.sin(animT * f * 7.3 + s) > 0.93 ? 0.5 : 0;
      eyeYaw = Math.sin(animT * f + (s > 0 ? 1.7 : 0)) * (0.5 + saccade) * s;
      eyePitch = Math.sin(animT * f * 1.7 + s * 2.1) * 0.28;
    }
    const turret = patterned(P.head, pattern, patternColour, 30 + (s > 0 ? 1 : 0), 0.02);
    add(SPHERE, base.x, base.y, base.z, 0.20 * flat, 0.20, 0.20, shade(turret, 0.94),
      { params: [0.5, 0.16, 0, 1] });
    const px = base.x - Math.sin(eyeYaw) * 0.085;
    const pz = base.z - Math.cos(eyeYaw) * 0.085;
    const py = base.y + Math.sin(eyePitch) * 0.075;
    add(SPHERE, px, py, pz, 0.105, 0.105, 0.105, shade(P.eyes, 2.4), { params: [0.2, 0.3, 0.2, 1] });
    add(SPHERE, px - Math.sin(eyeYaw) * 0.032, py, pz - Math.cos(eyeYaw) * 0.032,
      0.055, 0.055, 0.055, P.eyes, { params: [0.12, 0.4, 0.05, 1] });
  }

  // --------------------------------------------------------------- legs ----
  // Zygodactyl and splayed: hip out to a raised knee, then down to a gripping
  // foot. Diagonal pairs alternate so the walk reads as a lizard, not a dog.
  const legPairs = [
    { z: -bodyLen * 0.26, phase: 0 },
    { z: bodyLen * 0.3, phase: Math.PI },
  ];
  let legIndex = 0;
  for (const pair of legPairs) {
    for (const s of [-1, 1]) {
      const phase = walkPhase + pair.phase + (s > 0 ? Math.PI : 0);
      const swing = opts.moving ? Math.sin(phase) * 0.14 : 0;
      const lifted = opts.moving ? Math.max(0, Math.sin(phase)) * 0.07 : 0;
      const legC = patterned(P.legs, pattern, patternColour, 40 + legIndex, 0.4);

      const hip = [s * bodyW * 0.42, bodyY - bodyH * 0.3, pair.z];
      const kneeOut = (0.13 + 0.05 * S.legSplay) * spread;
      const knee = [
        s * (bodyW * 0.42 + kneeOut),
        bodyY - bodyH * 0.62,
        pair.z + swing * 0.4,
      ];
      const footY = 0.05 + lifted;
      const foot = [s * (bodyW * 0.42 + kneeOut * 0.8), footY, pair.z + swing];

      bone(hip, knee, 0.07, legC, [0.6, 0.14, 0, 1]);
      bone(knee, foot, 0.058, shade(legC, 0.9), [0.6, 0.14, 0, 1]);
      add(BOX, foot[0], footY - 0.012, foot[2], 0.11, 0.045, 0.13, shade(legC, 0.78),
        { params: [0.7, 0.1, 0, 1] });
      for (const toe of [-1, 1]) {
        add(BOX, foot[0] + toe * 0.04, footY - 0.018, foot[2] - toe * 0.075,
          0.032, 0.03, 0.075, shade(legC, 0.64), { yaw: toe * 0.32, params: [0.7, 0.1, 0, 1] });
      }
      legIndex++;
    }
  }

  // --------------------------------------------------------------- tail ----
  // A prehensile curl: walk a point backward from the hips, bending a little
  // more each segment, and lay a tapering bone between successive points.
  const TAIL = 9;
  const curl = S.tailCurl * (still ? 1.0 : 0.72);
  const tailSway = opts.moving ? Math.sin(walkPhase + Math.PI) * 0.1 : Math.sin(animT * 0.8) * 0.035;
  let prev = [0, bodyY + bodyH * 0.05, bodyLen * 0.48];
  let theta = 0.1; // 0 is straight back; growing theta curls it under
  for (let i = 0; i < TAIL; i++) {
    const t = i / (TAIL - 1);
    const len = 0.125 * (1 - t * 0.45);
    theta += curl * (0.14 + t * 0.42);
    const drop = Math.sin(theta) * len * (S.inverted ? -1 : 1);
    const next = [
      prev[0] + tailSway * (0.25 + t * 0.4) * len * 3,
      Math.max(0.06, prev[1] - drop),
      prev[2] + Math.cos(theta) * len,
    ];
    const r = (0.085 - t * 0.055) * Math.min(1, lift + 0.25);
    bone(prev, next, r * flat,
      patterned(P.tail, pattern, patternColour, 50 + i, 0.55 + t * 0.45), [0.66, 0.1, 0, 1]);
    prev = next;
  }

  // ------------------------------------------------------------- extras ----
  if (S.boxy) {
    add(BOX, 0, bodyY + bodyH * 0.4, 0, bodyW * 1.35, bodyH * 0.6, bodyLen * 0.9,
      shade(P.body, 0.94), { params: [0.85, 0.02, 0, 1] });
  }

  if (tagged) {
    for (let i = 0; i < 5; i++) {
      const a = hash01(i * 3 + 1) * Math.PI * 2;
      const r = 0.13 + hash01(i * 5 + 2) * 0.1;
      add(SPHERE,
        Math.cos(a) * bodyW * 0.55, bodyY + Math.sin(a) * bodyH * 0.55,
        -bodyLen * 0.2 + hash01(i * 7 + 3) * bodyLen * 0.7,
        r, r * 0.7, r, splat, { params: [0.35, 0, 0.25, 1] });
    }
  }

  if (opts.emote === 'wave' || opts.emote === 'point') {
    const raise = opts.emote === 'wave' ? Math.sin(animT * 4) * 0.3 + 0.3 : 0.45;
    bone([bodyW * 0.42, bodyY - bodyH * 0.1, -bodyLen * 0.26],
      [bodyW * 0.42 + 0.3, bodyY + 0.12 + raise * 0.3, -bodyLen * 0.26 - 0.08],
      0.055, shade(P.legs, 1.05), [0.6, 0.14, 0, 1]);
  }
  if (opts.emote === 'taunt' || opts.emote === 'dance') {
    // The tongue: the one thing a chameleon does that nothing else does.
    const reach = opts.emote === 'taunt' ? (0.5 + Math.sin(animT * 6) * 0.5) : 0.25;
    bone([0, headY - 0.04, headZ - 0.2], [0, headY - 0.06, headZ - 0.2 - reach * 0.8],
      0.035, [0.95, 0.45, 0.55], [0.35, 0, 0.05, 1]);
  }

  // Whatever pose was asked for, the model has to fit the capsule it is
  // colliding with - squash the whole rig down rather than clip through a
  // ceiling the player can legally stand under.
  let top = 0;
  for (const p of parts) top = Math.max(top, p.off.y + p.size.y * 0.5);
  const ceiling = capsule * 0.94;
  if (top > ceiling) {
    const k = ceiling / top;
    for (const p of parts) { p.off.y *= k; p.size.y *= k; }
  }

  return parts;
}

/** Bounding capsule of a pose, for camera framing and sanity checks. */
export function buildChameleonBounds(pose = 'idle', stance = Stance.STAND) {
  const parts = buildChameleon({}, pose, 0, stance, {});
  let maxY = 0, maxR = 0;
  for (const p of parts) {
    maxY = Math.max(maxY, p.off.y + Math.max(p.size.y, p.size.x, p.size.z) * 0.5);
    maxR = Math.max(maxR, Math.hypot(p.off.x, p.off.z) + Math.max(p.size.x, p.size.z) * 0.5);
  }
  return { height: maxY, radius: maxR };
}
