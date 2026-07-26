// How well is a hider actually blending in? One implementation, used by the
// HUD meter, the auto-mimic ability, the bot painter and the end-of-round
// bonus, so what the meter promises is what the scoreboard pays.

import { PAINT } from './constants.js';
import { colorDistance, mixRgb } from './color.js';
import { sampleSurroundings } from './collision.js';
import { clamp01 } from './math.js';

/** Weighted average of the surfaces around a point. */
export function dominantColor(samples, fallback = [0.5, 0.5, 0.5]) {
  if (!samples.length) return fallback.slice();
  let r = 0, g = 0, b = 0, w = 0;
  for (const s of samples) {
    r += s.color[0] * s.weight;
    g += s.color[1] * s.weight;
    b += s.color[2] * s.weight;
    w += s.weight;
  }
  if (w <= 0) return fallback.slice();
  return [r / w, g / w, b / w];
}

/** The colour a hider's silhouette reads as: mostly body, some head/tail. */
export function silhouetteColor(paint) {
  const body = paint.body || [1, 1, 1];
  const head = paint.head || body;
  const tail = paint.tail || body;
  const legs = paint.legs || body;
  return [
    body[0] * 0.56 + head[0] * 0.18 + tail[0] * 0.14 + legs[0] * 0.12,
    body[1] * 0.56 + head[1] * 0.18 + tail[1] * 0.14 + legs[1] * 0.12,
    body[2] * 0.56 + head[2] * 0.18 + tail[2] * 0.14 + legs[2] * 0.12,
  ];
}

/**
 * Score a hider's camouflage at a position.
 * Returns { score, tier, dominant, best, samples }.
 *
 * The score leans on the *closest* surfaces rather than the average, because
 * what busts a hider is the one wall they are actually silhouetted against.
 */
export function computeBlend(world, pos, paint, opts = {}) {
  const radius = opts.radius ?? PAINT.sampleRadius;
  const samples = opts.samples || sampleSurroundings(world, pos, radius, 20);
  const skin = silhouetteColor(paint);
  const dominant = dominantColor(samples, [0.5, 0.5, 0.5]);

  if (!samples.length) {
    return { score: 0.25, tier: 'poor', dominant, best: dominant, samples };
  }

  let bestDist = 1, bestColor = dominant;
  let acc = 0, accW = 0;
  for (const s of samples) {
    const d = colorDistance(skin, s.color);
    if (d < bestDist) { bestDist = d; bestColor = s.color; }
    acc += d * s.weight;
    accW += s.weight;
  }
  const avgDist = accW > 0 ? acc / accW : bestDist;
  // 70% "did you match the nearest thing", 30% "do you fit the room at large".
  const dist = bestDist * 0.7 + avgDist * 0.3;

  let score;
  if (dist <= PAINT.blendPerfect) score = 1 - (dist / PAINT.blendPerfect) * 0.08;
  else if (dist <= PAINT.blendGood) {
    score = 0.92 - ((dist - PAINT.blendPerfect) / (PAINT.blendGood - PAINT.blendPerfect)) * 0.27;
  } else if (dist <= PAINT.blendPoor) {
    score = 0.65 - ((dist - PAINT.blendGood) / (PAINT.blendPoor - PAINT.blendGood)) * 0.35;
  } else {
    score = Math.max(0.02, 0.3 - (dist - PAINT.blendPoor) * 0.5);
  }

  // Standing in the open with nothing to break your outline is its own tell.
  const cover = clamp01(samples.length / 8) * 0.5 + clamp01(1 - (samples[0]?.dist ?? 4) / 3) * 0.5;
  score = clamp01(score * (0.72 + cover * 0.28));

  const tier = score >= 0.9 ? 'perfect' : score >= 0.68 ? 'good' : score >= 0.42 ? 'ok' : 'poor';
  return { score, tier, dominant, best: bestColor, samples };
}

/** Paint a whole body from the surroundings - auto-mimic and bot painting. */
export function autoPaint(world, pos, rng = Math.random, quality = 1) {
  const samples = sampleSurroundings(world, pos, PAINT.sampleRadius, 20);
  const dom = dominantColor(samples);
  const near = samples.length ? samples[0].color : dom;
  const base = mixRgb(dom, near, 0.6);
  // Weak bots (and hurried players) miss by a bit.
  const err = (1 - quality) * 0.28;
  const off = () => (rng() - 0.5) * err;
  const c = [clamp01(base[0] + off()), clamp01(base[1] + off()), clamp01(base[2] + off())];
  const shade = (t) => [clamp01(c[0] * t), clamp01(c[1] * t), clamp01(c[2] * t)];
  return {
    body: c,
    head: shade(1.06),
    tail: shade(0.94),
    legs: shade(0.88),
    crest: shade(1.12),
    eyes: shade(0.8),
    pattern: samples.length > 6 && rng() < 0.5 ? 'scales' : 'solid',
    patternColor: shade(rng() < 0.5 ? 0.82 : 1.18),
  };
}

export const TIER_COLORS = {
  perfect: '#7cf2c4',
  good: '#b8e986',
  ok: '#ffd166',
  poor: '#ff6b6b',
};
