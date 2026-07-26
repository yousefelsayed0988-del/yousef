// Deterministic RNG + integer hashing. Everything the world generator does is
// derived from these so the same seed always produces the same world, on any
// thread, in any order.

/** 32-bit integer avalanche (variant of Murmur3's finalizer). */
export function hash32(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function hash2i(x, y, seed = 0) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  return hash32(h);
}

export function hash3i(x, y, z, seed = 0) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x85ebca6b) ^ Math.imul(seed, 0x9e3779b1);
  return hash32(h);
}

/** Uniform float in [0,1) from an integer coordinate triple. */
export function rand3(x, y, z, seed = 0) {
  return hash3i(x, y, z, seed) / 4294967296;
}

/** Small-state PRNG (sfc32-like). Fast, good enough for gameplay + generation. */
export class Random {
  constructor(seed = 1) {
    this.a = hash32(seed ^ 0x9e3779b9) | 0;
    this.b = hash32(seed + 0x85ebca6b) | 0;
    this.c = hash32(seed ^ 0xc2b2ae35) | 0;
    this.d = 1;
    for (let i = 0; i < 8; i++) this.next();
  }
  next() {
    const t = (this.a + this.b | 0) + this.d | 0;
    this.d = this.d + 1 | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = this.c + (this.c << 3) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = this.c + t | 0;
    return t >>> 0;
  }
  /** float in [0,1) */
  float() { return this.next() / 4294967296; }
  /** integer in [0,n) */
  int(n) { return n <= 0 ? 0 : (this.next() % n) >>> 0; }
  /** integer in [min,max] inclusive */
  range(min, max) { return min + this.int(max - min + 1); }
  chance(p) { return this.float() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  /** Fisher-Yates, in place */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Approximate normal via sum of uniforms. */
  gauss() { return (this.float() + this.float() + this.float() - 1.5) * 1.1547; }
}

/** Derive a stable sub-seed for a named subsystem. */
export function subSeed(seed, label) {
  let h = seed | 0;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  return hash32(h) | 0;
}

/** Deterministic per-chunk RNG so features never depend on generation order. */
export function chunkRandom(seed, cx, cz, label) {
  return new Random(hash3i(cx, cz, subSeed(seed, label), seed) | 0);
}

/** Convert an arbitrary user string into a numeric seed (numeric text is used verbatim). */
export function parseSeed(text) {
  if (text == null) return (Math.random() * 0xffffffff) | 0;
  const s = String(text).trim();
  if (s === '') return (Math.random() * 0xffffffff) | 0;
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n | 0;
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h | 0;
}
