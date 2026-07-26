// Gradient (Perlin-style) noise, 2D and 3D, plus fBm helpers.
// Permutation tables are built from the world seed, so every worker that gets
// the seed derives byte-identical noise fields.

import { Random } from './rng.js';

const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

export class Noise {
  constructor(seed) {
    const rng = new Random(seed | 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    rng.shuffle(p);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /** 2D gradient noise, output roughly in [-1,1]. */
  noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const g = (h, dx, dy) => {
      const i = (h & 7) * 3;
      return GRAD3[i] * dx + GRAD3[i + 1] * dy;
    };
    const x1 = lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u);
    const x2 = lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.4;
  }

  /** 3D gradient noise, output roughly in [-1,1]. */
  noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y), zf = z - Math.floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const g = (h, dx, dy, dz) => {
      const i = (h % 12) * 3;
      return GRAD3[i] * dx + GRAD3[i + 1] * dy + GRAD3[i + 2] * dz;
    };
    const x1 = lerp(g(p[AA], xf, yf, zf), g(p[BA], xf - 1, yf, zf), u);
    const x2 = lerp(g(p[AB], xf, yf - 1, zf), g(p[BB], xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);
    const x3 = lerp(g(p[AA + 1], xf, yf, zf - 1), g(p[BA + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(g(p[AB + 1], xf, yf - 1, zf - 1), g(p[BB + 1], xf - 1, yf - 1, zf - 1), u);
    const y2 = lerp(x3, x4, v);
    return lerp(y1, y2, w) * 1.15;
  }

  /** Fractal Brownian motion in 2D. */
  fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged noise -- good for mountain spines and cave tunnels. */
  ridged2(x, y, octaves = 4) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }
}

/**
 * Piecewise-linear spline. World generation maps continentalness / erosion /
 * peaks-and-valleys through these, which is far easier to tune than raw noise
 * arithmetic.
 */
export function spline(points, t) {
  if (t <= points[0][0]) return points[0][1];
  const last = points.length - 1;
  if (t >= points[last][0]) return points[last][1];
  for (let i = 0; i < last; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (t <= x1) {
      const f = (t - x0) / (x1 - x0);
      // smoothstep between control points keeps terrain free of hard creases
      const s = f * f * (3 - 2 * f);
      return y0 + (y1 - y0) * s;
    }
  }
  return points[last][1];
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
export function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}
