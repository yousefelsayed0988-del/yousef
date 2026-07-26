// Colour utilities. Paint matching is the whole game, so the distance metric
// lives here and both the blend meter and the bot AI use exactly this one.

import { clamp01 } from './math.js';

/** '#rrggbb' | '#rgb' -> [r,g,b] in 0..1 sRGB. */
export function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex.slice(0, 3);
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [1, 0, 1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
  const c = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function toLinear(rgb) {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** Perceptual-ish distance in 0..1. Weighted to match how the eye reads a
 *  silhouette against a wall: luminance errors read louder than hue errors. */
export function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  const rmean = (a[0] + b[0]) * 0.5;
  const wr = 2 + rmean, wg = 4, wb = 3 - rmean;
  return Math.sqrt((wr * dr * dr + wg * dg * dg + wb * db * db) / 9);
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function rgbToHsv(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, max <= 0 ? 0 : d / max, max];
}

export function hsvToRgb(hsv) {
  const [h, s, v] = hsv;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/** Nudge a colour by small hue/value jitter - used to vary prop shades so a
 *  map does not read as flat blocks of one hex. */
export function jitter(rgb, rng, amount = 0.05) {
  const hsv = rgbToHsv(rgb);
  hsv[0] = (hsv[0] + (rng() - 0.5) * amount * 0.5 + 1) % 1;
  hsv[1] = clamp01(hsv[1] + (rng() - 0.5) * amount);
  hsv[2] = clamp01(hsv[2] + (rng() - 0.5) * amount * 1.4);
  return hsvToRgb(hsv);
}
