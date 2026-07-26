// First-person view model: the player's arm and whatever it is holding.
//
// Everything is positioned in *camera space* -- an offset along the camera's
// right/up/forward basis -- and then transformed into world space, so no second
// projection or matrix stack is needed. The depth buffer is cleared first, which
// is what stops the hand poking through a wall when you stand against one.
//
// Block items render as a real textured cube through the terrain shader, so the
// block in your hand is the block you are about to place. Tools and other items
// render as small shaped box assemblies, matching the entity model style.

import { item } from '../core/items.js';
import { BLOCKS } from '../core/blocks.js';
import { CONFIG } from '../core/config.js';

const SKIN = 0xc99b6d;
const SLEEVE = 0x4a7ac0;

const MAT_COLOR = {
  wooden: 0xa9763f, stone: 0x8a8a8a, iron: 0xd8d8d8, golden: 0xf2cf3c,
  diamond: 0x4fd8d0, leather: 0x96613a, wood: 0xa9763f,
};

/** Tool silhouettes, as boxes in a 16-unit local grid: [x0,y0,z0,x1,y1,z1,colorKey] */
const TOOL_SHAPES = {
  pickaxe: [
    [-0.6, -5, -0.6, 0.6, 5, 0.6, 'handle'],
    [-4.5, 4.6, -0.5, 4.5, 6.0, 0.5, 'head'],
    [-4.5, 3.4, -0.5, -3.2, 4.6, 0.5, 'head'],
    [3.2, 3.4, -0.5, 4.5, 4.6, 0.5, 'head'],
  ],
  axe: [
    [-0.6, -5, -0.6, 0.6, 5, 0.6, 'handle'],
    [0.4, 2.2, -0.5, 3.6, 6.2, 0.5, 'head'],
    [3.6, 3.2, -0.5, 4.6, 5.4, 0.5, 'head'],
  ],
  shovel: [
    [-0.6, -5, -0.6, 0.6, 4, 0.6, 'handle'],
    [-1.8, 3.6, -0.5, 1.8, 6.6, 0.5, 'head'],
  ],
  hoe: [
    [-0.6, -5, -0.6, 0.6, 5, 0.6, 'handle'],
    [-0.6, 5.0, -0.5, 4.2, 6.2, 0.5, 'head'],
    [3.2, 3.6, -0.5, 4.2, 5.0, 0.5, 'head'],
  ],
  sword: [
    [-0.7, -5.5, -0.7, 0.7, -2.2, 0.7, 'handle'],
    [-2.2, -2.4, -0.6, 2.2, -1.2, 0.6, 'head'],
    [-0.9, -1.2, -0.4, 0.9, 7.0, 0.4, 'head'],
  ],
  shears: [
    [-1.6, -4, -0.5, -0.4, 4, 0.5, 'head'],
    [0.4, -4, -0.5, 1.6, 4, 0.5, 'head'],
  ],
  bow: [
    [-0.7, -6, -0.7, 0.7, 6, 0.7, 'handle'],
    [-0.5, 5.4, -0.5, 2.6, 6.6, 0.5, 'handle'],
    [-0.5, -6.6, -0.5, 2.6, -5.4, 0.5, 'handle'],
  ],
  shield: [
    [-4.5, -6, -0.8, 4.5, 6, 0.8, 'handle'],
    [-3.2, -4.4, -1.4, 3.2, 4.4, -0.8, 'head'],
  ],
  igniter: [
    [-1.4, -3, -0.5, 1.4, 1.5, 0.5, 'head'],
    [-0.6, 1.5, -0.5, 0.6, 4, 0.5, 'handle'],
  ],
};

/** Generic chunky item for food, materials, and anything unshaped. */
const BLOB = [[-2.6, -2.6, -0.9, 2.6, 2.6, 0.9, 'head']];

export class ViewModel {
  constructor(game) {
    this.game = game;
    this.prevSwing = 0;
    this.swingAnim = 0;
  }

  /**
   * @param {number[]} cam camera position
   * @param {object} env  render environment (for light + fog uniforms)
   */
  draw(renderer, cam, yaw, pitch, env, alpha) {
    const g = this.game;
    const p = g.player;
    if (!p || p.dead) return;

    // ---- camera basis
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = Math.sin(yaw) * cp, fy = sp, fz = -Math.cos(yaw) * cp;
    // right = forward x worldUp, normalised in the XZ plane
    let rx = fz * 0 - 0 * fy, ry = 0, rz = 0;
    rx = Math.cos(yaw); ry = 0; rz = Math.sin(yaw);
    // up = right x forward
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    /** camera-space (right, up, forward) -> world */
    const toWorld = (a, b, c, out) => {
      out[0] = cam[0] + rx * a + ux * b + fx * c;
      out[1] = cam[1] + ry * a + uy * b + fy * c;
      out[2] = cam[2] + rz * a + uz * b + fz * c;
      return out;
    };

    // ---- animation state
    const held = p.held;
    const it = held ? item(held.id) : null;
    const tool = it && it.tool ? it.tool.type : null;

    // swing: a quick out-and-back arc, eased so the strike lands early
    const swing = p.swingTime > 0 ? 1 - (p.swingTime / 7) : 0;
    const swingArc = p.swingTime > 0 ? Math.sin(swing * Math.PI) : 0;
    // continuous mining gets a looping chop rather than a single swipe
    const mining = p.mining && !g.ui.isOpen;
    const chop = mining ? (Math.sin(performance.now() * 0.013) * 0.5 + 0.5) : 0;
    const strike = Math.max(swingArc, chop);

    const bob = CONFIG.viewBobbing ? Math.sin(p.bobPhase) : 0;
    const bobV = CONFIG.viewBobbing ? Math.abs(Math.cos(p.bobPhase)) : 0;

    const eating = p.eating > 0 ? Math.sin((32 - p.eating) * 0.9) * 0.5 + 0.5 : 0;
    const charging = p.bowCharge >= 0 ? Math.min(1, p.bowCharge / 20) : 0;
    const blocking = p.shieldRaised ? 1 : 0;

    // ---- base placement, in camera space (metres)
    let hx = 0.46, hy = -0.44, hz = 0.68;
    let pitchLean = 0;
    hx += bob * 0.022;
    hy += bobV * 0.018;
    // pull the hand back and down through the strike, then punch forward
    hx -= strike * 0.10;
    hy -= strike * 0.13;
    hz += strike * 0.16;
    pitchLean += strike * 1.15;

    if (eating > 0) { hx -= 0.16 * eating; hy += 0.16 * eating; hz -= 0.10 * eating; }
    if (charging > 0) { hx -= 0.16 * charging; hy += 0.05 * charging; hz -= 0.12 * charging; }
    if (blocking) { hx -= 0.20; hy += 0.10; hz -= 0.10; }

    const light = g.lightAt(cam[0], cam[1], cam[2], env.dayLight);
    const handLight = Math.min(1, light * 0.85 + 0.28);

    renderer.clearDepth();

    // ---- arm
    const a = [0, 0, 0], b = [0, 0, 0];
    const armW = 0.052;
    const armBase = [hx + 0.22, hy - 0.30, hz - 0.28];
    const armTip = [hx - 0.01 + pitchLean * 0.015, hy + 0.04, hz + 0.06];
    renderer.beginDyn();
    // sleeve then bare forearm, as two segments along the arm axis
    for (let seg = 0; seg < 2; seg++) {
      const t0 = seg === 0 ? 0.0 : 0.52;
      const t1 = seg === 0 ? 0.55 : 1.0;
      const c0 = lerp3(armBase, armTip, t0), c1 = lerp3(armBase, armTip, t1);
      pushSegment(renderer, toWorld, c0, c1, armW * (seg === 0 ? 1.12 : 1.0),
        seg === 0 ? SLEEVE : SKIN, handLight, a, b);
    }
    // a slightly fatter fist at the tip, so the arm terminates in a hand rather
    // than tapering off into nothing
    const fistA = lerp3(armBase, armTip, 0.90), fistB = lerp3(armBase, armTip, 1.06);
    pushSegment(renderer, toWorld, fistA, fistB, armW * 1.32, SKIN, handLight, a, b);
    renderer.flushDyn(false);

    // ---- held item
    if (!it) return;
    const scale = 0.26;
    const itemPos = [hx - 0.02, hy + 0.08, hz + 0.10];
    const spin = -0.5 - pitchLean * 0.55;

    if (it.block != null && BLOCKS[it.block] && isCubeLike(BLOCKS[it.block])) {
      this._drawBlockCube(renderer, toWorld, itemPos, 0.105, spin, BLOCKS[it.block], handLight, env);
    } else {
      const shape = TOOL_SHAPES[tool] || BLOB;
      const matColor = it.tool && MAT_COLOR[it.tool.material] ? MAT_COLOR[it.tool.material]
        : (it.armor && MAT_COLOR[it.armor.material] ? MAT_COLOR[it.armor.material]
          : g.itemColor(held.id));
      renderer.beginDyn();
      for (const s of shape) {
        const color = s[6] === 'handle' ? 0x8a6234 : matColor;
        pushLocalBox(renderer, toWorld, itemPos, scale / 16, spin, s, color, handLight);
      }
      renderer.flushDyn(false);
    }
  }

  /** Textured cube for block items, drawn through the terrain shader. */
  _drawBlockCube(renderer, toWorld, origin, half, spin, def, light, env) {
    const layers = renderer.atlas.faceLayer;
    const base = def.id * 6;
    const tint = def.tint === 'grass' ? 0x91bd59 : (def.tint === 'foliage' ? 0x77ab2f : 0xffffff);
    const corners = [];
    const cs = Math.cos(spin), sn = Math.sin(spin);
    // slight tilt so you see three faces, like an item in the hand
    const tilt = 0.42;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < 8; i++) {
      let lx = (i & 1) ? half : -half;
      let ly = (i & 2) ? half : -half;
      let lz = (i & 4) ? half : -half;
      // rotate about X (tilt) then Y (spin)
      const y1 = ly * ct - lz * st, z1 = ly * st + lz * ct;
      const x2 = lx * cs + z1 * sn, z2 = -lx * sn + z1 * cs;
      corners.push(toWorld(origin[0] + x2, origin[1] + y1, origin[2] + z2, [0, 0, 0]));
    }
    // faces as corner-index quads: -X, +X, -Y, +Y, -Z, +Z
    const F = [
      [2, 0, 4, 6], [1, 3, 7, 5], [0, 1, 5, 4],
      [3, 2, 6, 7], [3, 1, 0, 2], [6, 4, 5, 7],
    ];
    renderer.beginViewGeo();
    for (let f = 0; f < 6; f++) {
      const q = F[f];
      renderer.pushViewQuad(corners[q[0]], corners[q[1]], corners[q[2]], corners[q[3]],
        layers[base + f], light, f, tint);
    }
    renderer.flushViewGeo(env);
  }
}

function isCubeLike(def) {
  return def.render === 'cube' || def.render === 'pillar' || def.render === 'facing';
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A capsule-ish box between two camera-space points. */
function pushSegment(renderer, toWorld, c0, c1, w, color, light, a, b) {
  const mid = lerp3(c0, c1, 0.5);
  const dx = c1[0] - c0[0], dy = c1[1] - c0[1], dz = c1[2] - c0[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  // build an orthonormal frame along the segment in camera space
  const ax = dx / len, ay = dy / len, az = dz / len;
  let px = -ay, py = ax, pz = 0;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;

  const corners = [];
  for (let i = 0; i < 8; i++) {
    const s = (i & 1) ? 0.5 : -0.5;
    const u = (i & 2) ? w : -w;
    const v = (i & 4) ? w : -w;
    corners.push(toWorld(
      mid[0] + ax * len * s + px * u + qx * v,
      mid[1] + ay * len * s + py * u + qy * v,
      mid[2] + az * len * s + pz * u + qz * v, [0, 0, 0]));
  }
  emitHull(renderer, corners, color, light);
}

/** Box given in a 16-unit local grid, placed at `origin` with a Y spin. */
function pushLocalBox(renderer, toWorld, origin, unit, spin, s, color, light) {
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const lx = ((i & 1) ? s[3] : s[0]) * unit;
    const ly = ((i & 2) ? s[4] : s[1]) * unit;
    const lz = ((i & 4) ? s[5] : s[2]) * unit;
    const x2 = lx * cs + lz * sn, z2 = -lx * sn + lz * cs;
    corners.push(toWorld(origin[0] + x2, origin[1] + ly, origin[2] + z2, [0, 0, 0]));
  }
  emitHull(renderer, corners, color, light);
}

const HULL_FACES = [
  [2, 0, 4, 6, 0.74], [1, 3, 7, 5, 0.74], [0, 1, 5, 4, 0.58],
  [3, 2, 6, 7, 1.0], [3, 1, 0, 2, 0.87], [6, 4, 5, 7, 0.87],
];

function emitHull(renderer, c, color, light) {
  const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
  for (const f of HULL_FACES) {
    const s = f[4] * light;
    renderer.pushQuad(c[f[0]], c[f[1]], c[f[2]], c[f[3]], r * s, g * s, b * s, 1);
  }
}
