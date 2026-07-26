// The chameleon, as pure geometry. No GL calls, no DOM - it returns a list of
// primitive parts and the renderer instances them.
//
// Local frame: +Y up, -Z forward, origin at the FEET. Sizes are full extents.
// Everything is deterministic: the same (paint, pose, animT, stance, opts) must
// always produce the same parts, because two clients drawing the same hider
// differently is a fairness problem, not a cosmetic one.

import { MOVE, Stance, PAINT } from '../../shared/constants.js';
import { clamp, clamp01, hashString } from '../../shared/math.js';

const BOX = 0, CYL = 1, SPHERE = 2;

export const PART_COUNT = 72;

// Pose shaping. Each entry warps the base rig instead of redefining it, so a
// new pose is a handful of numbers rather than a new model.
const POSE_SHAPES = {
  idle: { lift: 1.0, crouch: 0, squash: 1.0, spread: 1.0, tailCurl: 0.55, headDrop: 0, flatten: 1.0, roll: 0 },
  crouch: { lift: 0.58, crouch: 0.5, squash: 0.92, spread: 1.22, tailCurl: 0.8, headDrop: 0.06, flatten: 1.0, roll: 0 },
  prone: { lift: 0.24, crouch: 1.0, squash: 0.72, spread: 1.55, tailCurl: 0.35, headDrop: 0.1, flatten: 1.0, roll: 0 },
  wall: { lift: 0.86, crouch: 0.2, squash: 1.05, spread: 1.5, tailCurl: 0.9, headDrop: 0, flatten: 0.42, roll: 0 },
  ball: { lift: 0.5, crouch: 0.7, squash: 0.78, spread: 0.55, tailCurl: 1.6, headDrop: 0.22, flatten: 1.0, roll: 0 },
  stack: { lift: 0.66, crouch: 0.45, squash: 0.86, spread: 0.7, tailCurl: 1.2, headDrop: 0.14, flatten: 1.0, roll: 0, boxy: 1 },
  hang: { lift: 0.94, crouch: 0.1, squash: 1.0, spread: 1.35, tailCurl: 1.1, headDrop: -0.1, flatten: 1.0, roll: Math.PI, inverted: 1 },
  statue: { lift: 0.92, crouch: 0.08, squash: 1.0, spread: 0.82, tailCurl: 0.7, headDrop: 0, flatten: 1.0, roll: 0, still: 1 },
};

const EMOTE_SHAPES = {
  sit: 'crouch', ball: 'ball', flat: 'prone', statue: 'statue',
};

/** Deterministic 0..1 from an integer, for the noise pattern. */
function hash01(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Blend a part's base colour toward the pattern colour according to the
 * pattern rule. `t` is 0..1 front-to-back along the body.
 */
function patterned(base, pattern, patternColour, index, t) {
  if (!pattern || pattern === 'solid' || !patternColour) return base;
  let mix = 0;
  switch (pattern) {
    case 'stripes': mix = (Math.sin(t * Math.PI * 7) > 0 ? 0.85 : 0); break;
    case 'spots': mix = (index % 3 === 0 ? 0.75 : 0); break;
    case 'scales': mix = ((index % 2) ^ (Math.floor(t * 6) % 2)) ? 0.5 : 0; break;
    case 'checker': mix = (index % 2 === 0 ? 0.8 : 0); break;
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

/**
 * @param paint  { body, head, tail, legs, crest, eyes, pattern, patternColor }
 * @param pose   one of POSES[].id
 * @param animT  seconds of animation time
 * @param stance Stance.STAND | CROUCH | PRONE
 * @param opts   { moving, speed, tagged, emote, lookAt, local }
 */
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

  // An emote that holds a shape wins over the chosen pose.
  const emoteShape = opts.emote && EMOTE_SHAPES[opts.emote];
  const shapeKey = emoteShape || (POSE_SHAPES[pose] ? pose : 'idle');
  const S = POSE_SHAPES[shapeKey];

  // Everything is scaled to fit inside the capsule for the current stance -
  // a model taller than its own collider is a model that pokes through walls.
  const capsule = MOVE.height[clamp(stance | 0, 0, 2)];
  const nominal = MOVE.height[Stance.STAND];
  const fit = capsule / nominal;
  const lift = S.lift * fit;
  const squash = S.squash;
  const spread = S.spread;
  const flat = S.flatten;

  const still = S.still || opts.tagged || !opts.moving;
  const speed = clamp(opts.speed || 0, 0, 8);
  const walkPhase = opts.moving ? animT * (5.5 + speed * 0.8) : 0;
  const breathe = still ? Math.sin(animT * 1.6) * 0.012 : Math.sin(animT * 3.2) * 0.02;
  const sway = opts.moving ? Math.sin(walkPhase) * 0.05 : 0;
  const bob = opts.moving ? Math.abs(Math.sin(walkPhase)) * 0.035 : 0;

  const bodyY = 0.52 * lift + bob + breathe;
  const bodyLen = 0.86;
  const bodyW = 0.40 * spread * flat;
  const bodyH = 0.40 * squash * lift;

  const add = (type, x, y, z, sx, sy, sz, colour, extra = {}) => {
    parts.push({
      type,
      off: { x, y, z },
      size: { x: Math.max(0.008, sx), y: Math.max(0.008, sy), z: Math.max(0.008, sz) },
      yaw: extra.yaw || 0,
      pitch: extra.pitch || 0,
      roll: (extra.roll || 0) + (S.roll || 0) * 0,
      colour,
      params: extra.params || [0.72, 0.06, 0, 1],
    });
  };

  const tagged = !!opts.tagged;
  const splat = [1, 0.34, 0.48];

  // ------------------------------------------------------------- torso ----
  const SEGMENTS = 5;
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / (SEGMENTS - 1);
    const z = -bodyLen * 0.45 + t * bodyLen;          // -Z is forward
    const taper = 0.72 + Math.sin((1 - t) * Math.PI) * 0.42;
    const w = bodyW * taper;
    const h = bodyH * taper;
    const colour = patterned(P.body, pattern, patternColour, i, t);
    add(BOX, sway * (1 - t) * 0.4, bodyY + Math.sin(t * Math.PI) * 0.02, z,
      w, h, bodyLen / SEGMENTS * 1.35, tagged && i % 2 ? splat : colour,
      { params: [0.7, 0.05, 0, 1] });

    // Dorsal crest: the ridge that says "chameleon" from any angle.
    const crestH = (0.10 + Math.sin(t * Math.PI) * 0.09) * lift * squash;
    add(BOX, 0, bodyY + h * 0.5 + crestH * 0.42, z,
      0.035 * flat, crestH, bodyLen / SEGMENTS * 1.1,
      patterned(P.crest, pattern, patternColour, i + 11, t),
      { params: [0.55, 0.1, 0, 1] });
  }

  // Chest plate and shoulder vents: the mecha half of the animal.
  const plateC = shade(P.body, 1.18);
  add(BOX, 0, bodyY - bodyH * 0.18, -bodyLen * 0.34, bodyW * 0.76, bodyH * 0.5, 0.2, plateC,
    { params: [0.34, 0.62, 0, 1] });
  for (const s of [-1, 1]) {
    add(BOX, s * bodyW * 0.5, bodyY + bodyH * 0.22, -bodyLen * 0.22,
      0.06, 0.11, 0.22, shade(P.body, 0.72), { params: [0.3, 0.7, 0, 1] });
    // Panel line down the flank.
    add(BOX, s * bodyW * 0.52, bodyY, bodyLen * 0.05,
      0.02, bodyH * 0.42, bodyLen * 0.6, shade(P.body, 0.6), { params: [0.4, 0.5, 0, 1] });
  }

  // --------------------------------------------------------------- head ----
  const neckZ = -bodyLen * 0.52;
  const headZ = neckZ - 0.22;
  const headY = bodyY + (0.12 - S.headDrop) * lift;
  add(CYL, 0, headY - 0.02, neckZ - 0.06, 0.17 * flat, 0.16, 0.17,
    patterned(P.head, pattern, patternColour, 20, 0.05),
    { pitch: Math.PI / 2, params: [0.68, 0.08, 0, 1] });

  const headC = patterned(P.head, pattern, patternColour, 21, 0);
  add(SPHERE, 0, headY + 0.02, headZ, 0.30 * flat, 0.27, 0.34, headC, { params: [0.62, 0.1, 0, 1] });
  // Casque: the swept crest at the back of a chameleon's skull.
  add(BOX, 0, headY + 0.17, headZ + 0.09, 0.05 * flat, 0.19, 0.22,
    patterned(P.crest, pattern, patternColour, 22, 0), { params: [0.5, 0.14, 0, 1] });
  // Snout and jaw line.
  add(BOX, 0, headY - 0.03, headZ - 0.16, 0.16 * flat, 0.11, 0.16, shade(headC, 1.06),
    { params: [0.6, 0.1, 0, 1] });
  add(BOX, 0, headY - 0.09, headZ - 0.13, 0.14 * flat, 0.03, 0.18, shade(headC, 0.72),
    { params: [0.45, 0.2, 0, 1] });

  // Eye turrets. Each swivels on its own - the signature of the animal, and
  // the thing that makes a still chameleon still feel alive.
  const lookAt = opts.lookAt;
  for (const s of [-1, 1]) {
    const base = { x: s * 0.16 * flat, y: headY + 0.06, z: headZ + 0.01 };
    let eyeYaw, eyePitch;
    if (lookAt) {
      // Both eyes converge when there is something to watch.
      const dx = lookAt.x - base.x, dz = lookAt.z - base.z;
      eyeYaw = clamp(Math.atan2(-dx, -dz), -1.1, 1.1);
      eyePitch = clamp(Math.atan2((lookAt.y || 0) - base.y, Math.hypot(dx, dz)), -0.7, 0.7);
    } else {
      // Independent lazy scanning, with the odd saccade.
      const f = s > 0 ? 0.37 : 0.29;
      const sac = Math.sin(animT * f * 7.3 + s) > 0.93 ? 0.5 : 0;
      eyeYaw = Math.sin(animT * f + (s > 0 ? 1.7 : 0)) * (0.55 + sac) * s;
      eyePitch = Math.sin(animT * f * 1.7 + s * 2.1) * 0.3;
    }
    const turret = patterned(P.head, pattern, patternColour, 30 + (s > 0 ? 1 : 0), 0.02);
    add(SPHERE, base.x, base.y, base.z, 0.19 * flat, 0.19, 0.19, shade(turret, 0.94),
      { params: [0.5, 0.16, 0, 1] });
    // Iris cone and pupil, pointed wherever the turret is aimed.
    const px = base.x - Math.sin(eyeYaw) * 0.08;
    const pz = base.z - Math.cos(eyeYaw) * 0.08;
    const py = base.y + Math.sin(eyePitch) * 0.07;
    add(SPHERE, px, py, pz, 0.10, 0.10, 0.10, shade(P.eyes, 2.2),
      { params: [0.2, 0.3, 0.15, 1] });
    add(SPHERE, px - Math.sin(eyeYaw) * 0.03, py, pz - Math.cos(eyeYaw) * 0.03,
      0.055, 0.055, 0.055, P.eyes, { params: [0.12, 0.4, 0.05, 1] });
  }

  // --------------------------------------------------------------- legs ----
  // Zygodactyl: two toes in, two toes out, splayed wide for grip.
  const legPairs = [
    { z: -bodyLen * 0.3, phase: 0 },
    { z: bodyLen * 0.32, phase: Math.PI },
  ];
  let legIndex = 0;
  for (const pair of legPairs) {
    for (const s of [-1, 1]) {
      const phase = walkPhase + pair.phase + (s > 0 ? Math.PI : 0);
      const swing = opts.moving ? Math.sin(phase) * 0.16 : 0;
      const lifted = opts.moving ? Math.max(0, Math.sin(phase)) * 0.09 : 0;
      const hipX = s * bodyW * 0.52;
      const hipY = bodyY - bodyH * 0.32;
      const kneeOut = 0.16 * spread;
      const legC = patterned(P.legs, pattern, patternColour, 40 + legIndex, 0.4);

      // Upper limb, angled outward; lower limb, angled back down.
      add(CYL, hipX + s * kneeOut * 0.45, hipY - hipY * 0.22, pair.z + swing * 0.5,
        0.085, hipY * 0.5, 0.085, legC,
        { roll: s * 0.55, params: [0.6, 0.14, 0, 1] });
      const footY = 0.055 + lifted;
      add(CYL, hipX + s * kneeOut, (hipY * 0.42 + footY) / 2 + lifted * 0.3, pair.z + swing,
        0.07, Math.max(0.06, hipY * 0.42 - footY), 0.07, shade(legC, 0.9),
        { roll: -s * 0.18, params: [0.6, 0.14, 0, 1] });
      // Foot pad plus opposed toes.
      add(BOX, hipX + s * kneeOut, footY, pair.z + swing * 1.1,
        0.12, 0.055, 0.15, shade(legC, 0.78), { params: [0.7, 0.1, 0, 1] });
      for (const toe of [-1, 1]) {
        add(BOX, hipX + s * kneeOut + toe * 0.045, footY - 0.005, pair.z + swing * 1.1 - toe * 0.09,
          0.035, 0.035, 0.08, shade(legC, 0.66), { yaw: toe * 0.3, params: [0.7, 0.1, 0, 1] });
      }
      legIndex++;
    }
  }

  // --------------------------------------------------------------- tail ----
  // A prehensile spiral: each segment inherits the last one's angle, so the
  // curl tightens naturally instead of looking like a bent stick.
  const TAIL = 9;
  let tx = 0;
  let ty = bodyY;
  let tz = bodyLen * 0.5;
  let angle = 0;
  const curl = S.tailCurl * (still ? 1.15 : 0.8);
  const tailSway = opts.moving ? Math.sin(walkPhase + Math.PI) * 0.12 : Math.sin(animT * 0.9) * 0.04;
  for (let i = 0; i < TAIL; i++) {
    const t = i / (TAIL - 1);
    const len = 0.15 * (1 - t * 0.55);
    const r = (0.13 - t * 0.085) * lift;
    angle += curl * (0.16 + t * 0.36);
    const pitch = -angle * 0.55;
    tz += Math.cos(angle) * len;
    ty += Math.sin(angle) * len * 0.85 * (S.inverted ? -1 : 1);
    tx += tailSway * (t * 0.3);
    add(CYL, tx, ty, tz, r * 2 * flat, len * 1.25, r * 2,
      patterned(P.tail, pattern, patternColour, 50 + i, 0.55 + t * 0.45),
      { pitch: Math.PI / 2 + pitch, params: [0.66, 0.1, 0, 1] });
  }

  // ------------------------------------------------------------- extras ----
  if (S.boxy) {
    // "Prop stack": a squared-off shell that reads as cargo at a glance.
    add(BOX, 0, bodyY + bodyH * 0.55, 0, bodyW * 1.5, bodyH * 0.9, bodyLen * 0.95,
      shade(P.body, 0.94), { params: [0.85, 0.02, 0, 1] });
  }

  if (tagged) {
    // Paint splatter, so a tagged hider is unmistakable to everyone.
    for (let i = 0; i < 5; i++) {
      const a = hash01(i * 3 + 1) * Math.PI * 2;
      const r = 0.16 + hash01(i * 5 + 2) * 0.12;
      add(SPHERE,
        Math.cos(a) * bodyW * 0.6, bodyY + Math.sin(a) * bodyH * 0.6,
        -bodyLen * 0.2 + hash01(i * 7 + 3) * bodyLen * 0.7,
        r, r * 0.7, r, splat, { params: [0.35, 0, 0.25, 1] });
    }
  }

  if (opts.emote === 'wave' || opts.emote === 'point') {
    const t = (animT * 4) % (Math.PI * 2);
    const raise = opts.emote === 'wave' ? Math.sin(t) * 0.3 : 0.4;
    add(CYL, bodyW * 0.75, bodyY + 0.2 + raise * 0.2, -bodyLen * 0.28,
      0.09, 0.34, 0.09, shade(P.legs, 1.05),
      { roll: 1.1 + raise, params: [0.6, 0.14, 0, 1] });
  }
  if (opts.emote === 'taunt' || opts.emote === 'dance') {
    // Tongue: the one thing a chameleon does that nothing else does.
    const reach = opts.emote === 'taunt' ? (0.5 + Math.sin(animT * 6) * 0.5) : 0.25;
    add(CYL, 0, headY - 0.05, headZ - 0.18 - reach * 0.35,
      0.045, 0.7 * reach + 0.06, 0.045, [0.95, 0.45, 0.55],
      { pitch: Math.PI / 2, params: [0.35, 0, 0.05, 1] });
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
