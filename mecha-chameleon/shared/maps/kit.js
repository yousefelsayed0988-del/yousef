// Map authoring kit.
//
// A map is pure data: primitives, lights, spawns, hiding spots and a palette.
// Both the renderer and the physics read the same prop list, so if you can see
// it you can hide behind it.
//
// Conventions every map file follows:
//   * X/Z are the floor plane, +Y is up, one unit is one metre.
//   * A box is placed by its FOOTPRINT CENTRE and its BOTTOM: box(x, yBottom,
//     z, width, height, depth, colour). Furniture therefore sits on the floor
//     at y = 0 without any half-height arithmetic.
//   * yaw is in degrees, counter-clockwise seen from above.
//   * Colours are '#rrggbb' strings or [r,g,b] triples in 0..1.
//
// Typical file:
//
//   import { createMap } from './kit.js';
//   export const meta = { id:'attic', name:'The Attic', theme:'wood',
//                         tagline:'Dust and boxes.', difficulty:2 };
//   export function build() {
//     const m = createMap({ ...meta, size:[40,30], ceiling:4.5,
//                           sky:'#20242e', ambient:'#3a3f4d' });
//     m.room({ x:0, z:0, w:40, d:30, h:4.5, floor:'#6b4f34', wall:'#8a7458' });
//     m.crate(4, 0, -6, 1.2, '#7a5c3a');
//     m.spot(4, 0, -7.4, { stance:'crouch', quality:0.8, hint:'Behind the crate' });
//     m.spawnHider(0, 0); m.spawnSeeker(0, 12);
//     m.palette(['#6b4f34', '#8a7458', '#7a5c3a']);
//     return m.finish();
//   }

import { hexToRgb, jitter } from '../color.js';
import { mulberry32, hashString, clamp } from '../math.js';

const DEG = Math.PI / 180;

export const T_BOX = 0;
export const T_CYL = 1;
export const T_SPHERE = 2;
export const T_WEDGE = 3;

const col = (c, fallback = '#cccccc') => {
  if (c == null) return hexToRgb(fallback);
  const rgb = hexToRgb(c);
  return [clamp(rgb[0], 0, 1), clamp(rgb[1], 0, 1), clamp(rgb[2], 0, 1)];
};

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createMap(cfg = {}) {
  const size = cfg.size || [50, 50];
  const halfW = Math.abs(fin(size[0], 50)) / 2;
  const halfD = Math.abs(fin(size[1], 50)) / 2;
  const ceiling = fin(cfg.ceiling, 5);
  const rng = mulberry32(hashString(String(cfg.id || cfg.name || 'map')) ^ 0x9e3779b9);

  const def = {
    id: cfg.id || 'map',
    name: cfg.name || 'Unnamed',
    theme: cfg.theme || 'generic',
    tagline: cfg.tagline || '',
    difficulty: clamp(fin(cfg.difficulty, 2), 1, 4),
    env: {
      sky: col(cfg.sky, '#8fb7d9'),
      ambient: col(cfg.ambient, '#5a6472'),
      sunDir: cfg.sunDir || [-0.42, -0.82, -0.38],
      sunColor: col(cfg.sunColor, '#fff2dd'),
      sunIntensity: fin(cfg.sunIntensity, 1.0),
      fogColor: col(cfg.fog || cfg.sky, '#8fb7d9'),
      fogDensity: fin(cfg.fogDensity, 0.012),
      exposure: fin(cfg.exposure, 1.0),
      indoor: cfg.indoor !== false,
    },
    bounds: {
      minX: -halfW, maxX: halfW,
      minZ: -halfD, maxZ: halfD,
      maxY: ceiling + 8,
      floorY: fin(cfg.floorY, 0),
    },
    props: [],
    lights: [],
    spawns: { hiders: [], seekers: [], lobby: [0, 0, 0] },
    hidingSpots: [],
    palette: [],
    ceiling,
  };

  const push = (t, x, y, z, sx, sy, sz, c, o = {}) => {
    const prop = {
      t,
      p: [fin(x), fin(y), fin(z)],
      s: [Math.abs(fin(sx, 0.1)) || 0.001, Math.abs(fin(sy, 0.1)) || 0.001, Math.abs(fin(sz, 0.1)) || 0.001],
      yaw: fin(o.yaw, 0) * DEG,
      c: o.jitter ? jitter(col(c), rng, o.jitter) : col(c),
      solid: o.solid !== false,
      tag: o.tag || '',
      rough: clamp(fin(o.rough, 0.85), 0, 1),
      metal: clamp(fin(o.metal, 0), 0, 1),
      emis: clamp(fin(o.emis, 0), 0, 4),
      opaque: o.opaque !== false,
    };
    def.props.push(prop);
    return prop;
  };

  const m = {
    def,
    rand: rng,
    /** Uniform float in [a, b). */
    range: (a, b) => a + rng() * (b - a),
    /** Random integer in [a, b]. */
    irange: (a, b) => Math.floor(a + rng() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(rng() * arr.length) % arr.length],
    chance: (p) => rng() < p,
    repeat(n, fn) { for (let i = 0; i < n; i++) fn(i, n); return m; },

    // ---------------------------------------------------------- primitives --
    /** box(centreX, bottomY, centreZ, width, height, depth, colour, opts) */
    box(x, y, z, w, h, d, c, o = {}) {
      return push(T_BOX, x, y + h / 2, z, w / 2, h / 2, d / 2, c, o);
    },
    /** Same as box() but positioned by its centre on all three axes. */
    boxc(x, y, z, w, h, d, c, o = {}) {
      return push(T_BOX, x, y, z, w / 2, h / 2, d / 2, c, o);
    },
    /** cyl(centreX, bottomY, centreZ, radius, height, colour, opts) */
    cyl(x, y, z, r, h, c, o = {}) {
      return push(T_CYL, x, y + h / 2, z, r, h / 2, r, c, o);
    },
    /** sphere(centreX, centreY, centreZ, radius, colour, opts) */
    sphere(x, y, z, r, c, o = {}) {
      return push(T_SPHERE, x, y, z, r, r, r, c, o);
    },
    /** Triangular prism: a ramp/roof face. Decorative unless opts.solid. */
    wedge(x, y, z, w, h, d, c, o = {}) {
      return push(T_WEDGE, x, y + h / 2, z, w / 2, h / 2, d / 2, c, { solid: false, ...o });
    },

    // ------------------------------------------------------------- surfaces --
    floor(x, z, w, d, c, y = 0, thickness = 0.4) {
      return m.box(x, y - thickness, z, w, thickness, d, c, { tag: 'floor', rough: 0.95 });
    },
    ceil(x, z, w, d, c, y, thickness = 0.35) {
      return m.box(x, y, z, w, thickness, d, c, { tag: 'ceiling' });
    },
    /** Wall running from (x1,z1) to (x2,z2). */
    wall(x1, z1, x2, z2, h, c, o = {}) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) return null;
      const yaw = Math.atan2(dz, dx) / DEG;
      return m.box((x1 + x2) / 2, o.y ?? 0, (z1 + z2) / 2, len, h, o.thickness ?? 0.3, c,
        { yaw: -yaw, tag: o.tag || 'wall', ...o, y: undefined });
    },
    /**
     * A rectangular room: floor, four walls, optional ceiling.
     * openings: [{ side:'n'|'s'|'e'|'w', at: <offset from centre>, width, height }]
     */
    room(opt) {
      const { x = 0, z = 0, w = 20, d = 20, h = 4 } = opt;
      const th = opt.thickness ?? 0.35;
      const wallC = opt.wall || '#9aa0aa';
      if (opt.floor !== false) m.floor(x, z, w, d, opt.floor || '#6d6f77', opt.y ?? 0);
      if (opt.ceil) m.ceil(x, z, w, d, opt.ceil, (opt.y ?? 0) + h);
      const openings = opt.openings || [];
      const sides = [
        { k: 'n', cx: x, cz: z - d / 2, len: w, horiz: true },
        { k: 's', cx: x, cz: z + d / 2, len: w, horiz: true },
        { k: 'w', cx: x - w / 2, cz: z, len: d, horiz: false },
        { k: 'e', cx: x + w / 2, cz: z, len: d, horiz: false },
      ];
      for (const s of sides) {
        const gaps = openings.filter((o) => o.side === s.k)
          .map((o) => ({ a: (o.at ?? 0) - (o.width ?? 2.2) / 2, b: (o.at ?? 0) + (o.width ?? 2.2) / 2, h: o.height ?? h }))
          .sort((p, q) => p.a - q.a);
        let cursor = -s.len / 2;
        const segs = [];
        for (const g of gaps) {
          const a = clamp(g.a, -s.len / 2, s.len / 2);
          const b = clamp(g.b, -s.len / 2, s.len / 2);
          if (a > cursor) segs.push([cursor, a]);
          if (g.h < h) segs.push([a, b, g.h, h - g.h]); // lintel above the door
          cursor = Math.max(cursor, b);
        }
        if (cursor < s.len / 2) segs.push([cursor, s.len / 2]);
        for (const seg of segs) {
          const len = seg[1] - seg[0];
          if (len <= 0.01) continue;
          const mid = (seg[0] + seg[1]) / 2;
          const yBase = seg.length > 2 ? (opt.y ?? 0) + seg[2] : (opt.y ?? 0);
          const hh = seg.length > 2 ? seg[3] : h;
          if (s.horiz) m.box(s.cx + mid, yBase, s.cz, len, hh, th, wallC, { tag: 'wall' });
          else m.box(s.cx, yBase, s.cz + mid, th, hh, len, wallC, { tag: 'wall' });
        }
      }
      return m;
    },
    /** Solid outer shell so nobody walks off the level. */
    perimeter(h = 8, c = '#3a3f48') {
      const { minX, maxX, minZ, maxZ } = def.bounds;
      const t = 1;
      m.box((minX + maxX) / 2, 0, minZ - t / 2, maxX - minX + t * 2, h, t, c, { tag: 'bound' });
      m.box((minX + maxX) / 2, 0, maxZ + t / 2, maxX - minX + t * 2, h, t, c, { tag: 'bound' });
      m.box(minX - t / 2, 0, (minZ + maxZ) / 2, t, h, maxZ - minZ + t * 2, c, { tag: 'bound' });
      m.box(maxX + t / 2, 0, (minZ + maxZ) / 2, t, h, maxZ - minZ + t * 2, c, { tag: 'bound' });
      return m;
    },

    // ------------------------------------------------------------ furniture --
    pillar(x, z, r, h, c, o = {}) { return m.cyl(x, o.y ?? 0, z, r, h, c, { tag: 'pillar', ...o }); },

    crate(x, y, z, size, c, o = {}) {
      const s = size ?? 1;
      m.box(x, y, z, s, s, s, c, { tag: 'crate', jitter: 0.05, ...o });
      return m;
    },
    crateStack(x, z, c, n = 3, size = 1, o = {}) {
      let y = o.y ?? 0;
      for (let i = 0; i < n; i++) {
        const s = size * (1 - i * 0.06);
        m.crate(x + (rng() - 0.5) * 0.14, y, z + (rng() - 0.5) * 0.14, s, c, { yaw: (rng() - 0.5) * 14 });
        y += s;
      }
      if (o.spot !== false) m.spot(x, o.y ?? 0, z + size * 0.9, { stance: 'crouch', quality: 0.72, hint: 'Tucked beside the crates' });
      return m;
    },
    table(x, z, w, d, h, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0;
      const top = o.legColor || c;
      m.box(x, y + h - 0.08, z, w, 0.08, d, c, { yaw, tag: 'table' });
      const lx = w / 2 - 0.12, lz = d / 2 - 0.12;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const a = yaw * DEG;
        const ox = sx * lx * Math.cos(a) - sz * lz * Math.sin(a);
        const oz = sx * lx * Math.sin(a) + sz * lz * Math.cos(a);
        m.box(x + ox, y, z + oz, 0.12, h - 0.08, 0.12, top, { tag: 'leg' });
      }
      if (o.spot !== false) m.spot(x, y, z, { stance: 'prone', quality: 0.78, hint: 'Flat under the table' });
      return m;
    },
    chair(x, z, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0;
      m.box(x, y + 0.44, z, 0.46, 0.07, 0.46, c, { yaw });
      const a = yaw * DEG;
      const bx = -Math.sin(a) * 0.2, bz = -Math.cos(a) * 0.2;
      m.box(x + bx, y + 0.5, z + bz, 0.46, 0.52, 0.08, c, { yaw });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const ox = sx * 0.18 * Math.cos(a) - sz * 0.18 * Math.sin(a);
        const oz = sx * 0.18 * Math.sin(a) + sz * 0.18 * Math.cos(a);
        m.box(x + ox, y, z + oz, 0.07, 0.44, 0.07, c);
      }
      return m;
    },
    shelf(x, z, w, h, d, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0;
      const levels = o.levels ?? 4;
      m.box(x, y, z, w, h, 0.1, c, { yaw, tag: 'shelfBack', offsetBack: true });
      const a = yaw * DEG;
      const sideOff = w / 2 - 0.05;
      for (const s of [-1, 1]) {
        m.box(x + s * sideOff * Math.cos(a), y, z + s * sideOff * Math.sin(a), 0.1, h, d, c, { yaw });
      }
      for (let i = 0; i <= levels; i++) {
        const ly = y + (h / levels) * i;
        if (i === levels) break;
        m.box(x, ly, z, w, 0.07, d, c, { yaw, tag: 'shelf' });
      }
      if (o.spot !== false) {
        m.spot(x, y, z, { stance: 'prone', quality: 0.8, hint: 'On the bottom shelf' });
      }
      return m;
    },
    barrel(x, z, c, o = {}) {
      const y = o.y ?? 0, h = o.h ?? 0.95, r = o.r ?? 0.35;
      m.cyl(x, y, z, r, h, c, { tag: 'barrel', jitter: 0.04 });
      m.cyl(x, y + h * 0.28, z, r * 1.06, 0.06, c, { solid: false });
      m.cyl(x, y + h * 0.68, z, r * 1.06, 0.06, c, { solid: false });
      return m;
    },
    plant(x, z, scale = 1, potC = '#8a5a3a', leafC = '#3f7a3a', o = {}) {
      const y = o.y ?? 0;
      m.cyl(x, y, z, 0.28 * scale, 0.34 * scale, potC, { tag: 'pot' });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rng();
        m.sphere(x + Math.cos(a) * 0.22 * scale, y + (0.6 + rng() * 0.5) * scale, z + Math.sin(a) * 0.22 * scale,
          (0.24 + rng() * 0.12) * scale, leafC, { solid: false, jitter: 0.09 });
      }
      m.sphere(x, y + 0.75 * scale, z, 0.34 * scale, leafC, { jitter: 0.06 });
      return m;
    },
    sofa(x, z, w, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0, d = o.d ?? 0.9;
      const a = yaw * DEG;
      m.box(x, y, z, w, 0.42, d, c, { yaw, tag: 'sofa' });
      m.box(x - Math.sin(a) * (d / 2 - 0.12), y + 0.42, z - Math.cos(a) * (d / 2 - 0.12), w, 0.5, 0.24, c, { yaw });
      for (const s of [-1, 1]) {
        m.box(x + s * (w / 2 - 0.1) * Math.cos(a), y + 0.42, z + s * (w / 2 - 0.1) * Math.sin(a), 0.2, 0.28, d, c, { yaw });
      }
      if (o.spot !== false) m.spot(x - Math.sin(a) * (d / 2 + 0.5), y, z - Math.cos(a) * (d / 2 + 0.5),
        { stance: 'prone', quality: 0.74, hint: 'Behind the sofa' });
      return m;
    },
    bed(x, z, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0, w = o.w ?? 1.4, d = o.d ?? 2.0;
      m.box(x, y, z, w, 0.34, d, o.frame || '#6b4f34', { yaw });
      m.box(x, y + 0.34, z, w - 0.06, 0.22, d - 0.1, c, { yaw, tag: 'mattress' });
      const a = yaw * DEG;
      m.box(x + Math.sin(a) * (d / 2 - 0.05), y + 0.34, z + Math.cos(a) * (d / 2 - 0.05), w, 0.7, 0.1, o.frame || '#6b4f34', { yaw });
      if (o.spot !== false) m.spot(x, y, z, { stance: 'prone', quality: 0.82, hint: 'Under the bed' });
      return m;
    },
    stairs(x, z, w, steps, rise, run, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0;
      const a = yaw * DEG;
      for (let i = 0; i < steps; i++) {
        const off = (i + 0.5) * run;
        m.box(x + Math.sin(a) * off, y, z + Math.cos(a) * off, w, rise * (i + 1), run, c, { yaw, tag: 'stair' });
      }
      return m;
    },
    fence(x1, z1, x2, z2, h, c, o = {}) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.round(len / (o.spacing ?? 1.6)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        m.box(x1 + dx * t, o.y ?? 0, z1 + dz * t, 0.12, h, 0.12, c, { tag: 'post' });
      }
      const yaw = -Math.atan2(dz, dx) / DEG;
      for (const ry of [h * 0.35, h * 0.8]) {
        m.box((x1 + x2) / 2, (o.y ?? 0) + ry, (z1 + z2) / 2, len, 0.09, 0.07, c, { yaw, tag: 'rail' });
      }
      return m;
    },
    rug(x, z, w, d, c, o = {}) {
      return m.box(x, (o.y ?? 0) + 0.005, z, w, 0.02, d, c, { solid: false, yaw: o.yaw ?? 0, tag: 'rug' });
    },
    poster(x, y, z, w, h, c, o = {}) {
      return m.box(x, y, z, w, h, 0.04, c, { solid: false, yaw: o.yaw ?? 0, tag: 'poster', emis: o.emis ?? 0.05 });
    },
    pipe(x1, y, z1, x2, z2, r, c, o = {}) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const yaw = -Math.atan2(dz, dx) / DEG;
      return m.box((x1 + x2) / 2, y, (z1 + z2) / 2, len, r * 2, r * 2, c, { yaw, tag: 'pipe', ...o });
    },
    /** A hollow box you can actually stand inside - locker, cabinet, dumpster. */
    locker(x, z, w, h, d, c, o = {}) {
      const yaw = o.yaw ?? 0, y = o.y ?? 0, t = 0.08;
      const a = yaw * DEG;
      const sx = Math.cos(a), sz = Math.sin(a);
      m.box(x - sz * (d / 2 - t / 2), y, z - sx * (d / 2 - t / 2) * -1, w, h, t, c, { yaw });
      for (const s of [-1, 1]) {
        m.box(x + s * (w / 2 - t / 2) * sx, y, z + s * (w / 2 - t / 2) * sz, t, h, d, c, { yaw });
      }
      m.box(x, y + h - t, z, w, t, d, c, { yaw });
      if (o.spot !== false) m.spot(x, y, z, { stance: 'stand', quality: 0.85, hint: 'Inside the locker' });
      return m;
    },

    // ---------------------------------------------------------------- misc --
    light(x, y, z, c, intensity = 1, range = 12) {
      def.lights.push({ p: [fin(x), fin(y), fin(z)], c: col(c, '#ffffff'), i: fin(intensity, 1), r: fin(range, 12) });
      return m;
    },
    /** Ceiling lamp: emissive prop plus the light itself. */
    lamp(x, y, z, c = '#ffe9c4', intensity = 1.2, range = 14) {
      m.box(x, y, z, 0.7, 0.12, 0.7, c, { solid: false, emis: 2.2, tag: 'lampGlow' });
      m.light(x, y - 0.2, z, c, intensity, range);
      return m;
    },

    spawnHider(x, z, y = 0) { def.spawns.hiders.push([fin(x), fin(y), fin(z)]); return m; },
    spawnSeeker(x, z, y = 0) { def.spawns.seekers.push([fin(x), fin(y), fin(z)]); return m; },
    lobbySpawn(x, z, y = 0) { def.spawns.lobby = [fin(x), fin(y), fin(z)]; return m; },

    /** Register a curated hiding spot (used by bots, tutorials and the map card). */
    spot(x, y, z, o = {}) {
      def.hidingSpots.push({
        p: [fin(x), fin(y), fin(z)],
        stance: o.stance || 'crouch',
        quality: clamp(fin(o.quality, 0.6), 0, 1),
        hint: o.hint || '',
      });
      return m;
    },

    palette(list) {
      for (const c of list) def.palette.push(col(c));
      return m;
    },

    finish() {
      if (!def.spawns.hiders.length) def.spawns.hiders.push([0, 0, 0]);
      if (!def.spawns.seekers.length) def.spawns.seekers.push([0, 0, Math.min(halfD - 2, 8)]);
      if (!def.palette.length) {
        // Fall back to the most common prop colours so the paint wheel is
        // never empty on a map that forgot to declare a palette.
        const counts = new Map();
        for (const p of def.props) {
          const k = p.c.map((v) => Math.round(v * 12)).join(',');
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k]) => {
          def.palette.push(k.split(',').map((v) => Number(v) / 12));
        });
      }
      def.propCount = def.props.length;
      def.spotCount = def.hidingSpots.length;
      return def;
    },
  };

  return m;
}

/** Structural check used by tools/validate-maps.js and the server on load. */
export function validateMap(def) {
  const errs = [];
  if (!def || typeof def !== 'object') return ['not an object'];
  if (!def.id) errs.push('missing id');
  if (!Array.isArray(def.props) || def.props.length < 20) errs.push('needs at least 20 props');
  for (let i = 0; i < (def.props || []).length; i++) {
    const p = def.props[i];
    if (!p.p || p.p.length !== 3 || p.p.some((v) => !Number.isFinite(v))) { errs.push(`prop ${i}: bad position`); break; }
    if (!p.s || p.s.length !== 3 || p.s.some((v) => !Number.isFinite(v) || v <= 0)) { errs.push(`prop ${i}: bad size`); break; }
    if (!p.c || p.c.length !== 3 || p.c.some((v) => !Number.isFinite(v))) { errs.push(`prop ${i}: bad colour`); break; }
  }
  if (!def.spawns?.hiders?.length) errs.push('no hider spawns');
  if (!def.spawns?.seekers?.length) errs.push('no seeker spawns');
  if ((def.hidingSpots || []).length < 8) errs.push('needs at least 8 hiding spots');
  const b = def.bounds;
  if (!b || !Number.isFinite(b.minX) || !Number.isFinite(b.maxX)) errs.push('bad bounds');
  for (const list of [def.spawns?.hiders || [], def.spawns?.seekers || []]) {
    for (const s of list) {
      if (s[0] < b.minX || s[0] > b.maxX || s[2] < b.minZ || s[2] > b.maxZ) {
        errs.push(`spawn ${s} outside bounds`);
        break;
      }
    }
  }
  return errs;
}
