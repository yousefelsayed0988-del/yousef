// Generated structures + their loot chests.
//
// Every structure is generated from a deterministic per-origin RNG and then
// clipped into whichever chunk is currently being built. A chunk therefore
// scans a small neighbourhood of candidate origins rather than depending on
// its neighbours having been generated first -- no ordering hazards, no
// "populate later" pass.

import { WORLD } from '../core/config.js';
import { Random, hash2i, hash3i, subSeed } from '../core/rng.js';
import { blockId } from '../core/blocks.js';
import { fillChest } from '../core/loot.js';
import { BIOMES, BEACH, SNOWY_BEACH, OCEAN } from './biomes.js';

const { MIN_Y, SEA_LEVEL } = WORLD;

const S = {
  air: blockId('air'),
  cobble: blockId('cobblestone'),
  mossy: blockId('mossy_cobblestone'),
  stone_bricks: blockId('stone_bricks'),
  chest: blockId('chest'),
  spawner: blockId('spawner'),
  torch: blockId('torch'),
  oak_planks: blockId('oak_planks'),
  oak_fence: blockId('oak_fence'),
  oak_log: blockId('oak_log'),
  rail_placeholder: blockId('oak_slab'),
  sand: blockId('sand'),
  gravel: blockId('gravel'),
  cobweb: blockId('cobweb'),
};

const SPAWNER_MOBS = ['zombie', 'skeleton', 'spider'];

/** True when (x,z) is inside the chunk currently being generated. */
function inside(x, z, ox, oz) { return x >= ox && x < ox + 16 && z >= oz && z < oz + 16; }

export function generateStructures(gen, cx, cz, ctx) {
  const ox = cx << 4, oz = cz << 4;
  const seed = gen.seed;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      dungeon(gen, cx + dx, cz + dz, ctx, ox, oz, seed);
      ruins(gen, cx + dx, cz + dz, ctx, ox, oz, seed);
      buriedTreasure(gen, cx + dx, cz + dz, ctx, ox, oz, seed);
    }
  }
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      mineshaft(gen, cx + dx, cz + dz, ctx, ox, oz, seed);
      village(gen, cx + dx, cz + dz, ctx, ox, oz, seed);
    }
  }
}

// ------------------------------------------------------------------ village
// A handful of houses around a well, plus tilled fields and lamp posts. Each
// building is placed on its own levelled pad so the village survives uneven
// ground, and each house registers a villager for the spawner to fill in.
const VILLAGE_WOODS = ['oak', 'spruce', 'birch', 'acacia'];

function village(gen, scx, scz, ctx, ox, oz, seed) {
  const h = hash2i(scx, scz, subSeed(seed, 'village')) / 4294967296;
  if (h > 0.006) return;
  const rng = originRng(seed, scx, scz, 'village');
  const cxw = (scx << 4) + 8, czw = (scz << 4) + 8;

  const centreBiome = BIOMES[gen.biomeAt(cxw, czw)];
  if (centreBiome.name === 'ocean' || centreBiome.name === 'swamp' ||
      centreBiome.name === 'stony_peaks' || centreBiome.name === 'jungle') return;
  const baseY = gen.heightAt(cxw, czw);
  if (baseY < SEA_LEVEL + 2 || baseY > 110) return;

  // reject strongly sloped ground rather than carving a terrace into a cliff
  let lo = 999, hi = -999;
  for (let dx = -22; dx <= 22; dx += 6) {
    for (let dz = -22; dz <= 22; dz += 6) {
      const y = gen.heightAt(cxw + dx, czw + dz);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  if (hi - lo > 7) return;

  const { put, putSoft, blockEntities } = ctx;
  const wood = VILLAGE_WOODS[rng.int(VILLAGE_WOODS.length)];
  const planks = blockId(`${wood}_planks`);
  const logB = blockId(`${wood}_log`);
  const doorB = blockId(`${wood}_door`);
  const stairsB = blockId(`${wood}_stairs`);
  const path = blockId('gravel');

  // --- well at the centre
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      put(cxw + dx, baseY, czw + dz, edge ? S.cobble : blockId('water'));
      if (!edge) { put(cxw + dx, baseY - 1, czw + dz, blockId('water')); put(cxw + dx, baseY - 2, czw + dz, S.cobble); }
      if (edge) put(cxw + dx, baseY + 1, czw + dz, Math.abs(dx) === 2 && Math.abs(dz) === 2 ? S.cobble : S.air);
      for (let dy = 2; dy <= 4; dy++) put(cxw + dx, baseY + dy, czw + dz, S.air);
    }
  }
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    for (let dy = 1; dy <= 3; dy++) put(cxw + px, baseY + dy, czw + pz, logB);
  }
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) put(cxw + dx, baseY + 4, czw + dz, planks);

  // --- houses on a loose ring
  const count = 4 + rng.int(3);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.float() * 0.5;
    const dist = 9 + rng.int(9);
    const hx = cxw + Math.round(Math.cos(ang) * dist);
    const hz = czw + Math.round(Math.sin(ang) * dist);
    const hy = gen.heightAt(hx, hz);
    if (Math.abs(hy - baseY) > 5) continue;
    if (rng.chance(0.28)) farmPlot(gen, hx, hy, hz, rng, put, putSoft);
    else house(gen, hx, hy, hz, rng, put, putSoft, blockEntities, ox, oz, seed,
      { planks, logB, doorB, stairsB });
    // a gravel path back to the well
    const steps = Math.max(1, Math.round(dist));
    for (let k = 3; k < steps; k++) {
      const px = cxw + Math.round(Math.cos(ang) * k);
      const pz = czw + Math.round(Math.sin(ang) * k);
      const py = gen.heightAt(px, pz);
      put(px, py, pz, path);
      for (let dy = 1; dy <= 2; dy++) put(px, py + dy, pz, S.air);
    }
  }

  // --- lamp posts
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    const lx = cxw + Math.round(Math.cos(ang) * 7);
    const lz = czw + Math.round(Math.sin(ang) * 7);
    const ly = gen.heightAt(lx, lz);
    for (let dy = 1; dy <= 3; dy++) put(lx, ly + dy, lz, logB);
    put(lx, ly + 4, lz, S.torch);
  }
}

function house(gen, hx, hy, hz, rng, put, putSoft, blockEntities, ox, oz, seed, mat) {
  const w = 2 + rng.int(2), d = 2 + rng.int(2), tall = 3;
  const facing = rng.int(4);

  for (let dx = -w - 1; dx <= w + 1; dx++) {
    for (let dz = -d - 1; dz <= d + 1; dz++) {
      // levelled foundation so the house is never half-buried
      put(hx + dx, hy, hz + dz, mat.planks);
      for (let k = 1; k <= 3; k++) put(hx + dx, hy - k, hz + dz, S.cobble);
      const wall = Math.abs(dx) === w + 1 || Math.abs(dz) === d + 1;
      for (let dy = 1; dy <= tall; dy++) {
        if (!wall) { put(hx + dx, hy + dy, hz + dz, S.air); continue; }
        const corner = Math.abs(dx) === w + 1 && Math.abs(dz) === d + 1;
        // a window band at head height
        const window = !corner && dy === 2 && ((dx + dz) % 2 === 0);
        put(hx + dx, hy + dy, hz + dz, corner ? mat.logB : (window ? blockId('glass_pane') : mat.planks));
      }
      put(hx + dx, hy + tall + 1, hz + dz, mat.planks);
    }
  }
  // door in the middle of one wall
  const dv = [[0, -d - 1], [w + 1, 0], [0, d + 1], [-w - 1, 0]][facing];
  const dx0 = hx + dv[0], dz0 = hz + dv[1];
  put(dx0, hy + 1, dz0, mat.doorB, (facing << 2));
  put(dx0, hy + 2, dz0, mat.doorB, (facing << 2) | 1);
  put(dx0, hy + 3, dz0, mat.planks);

  // furnishings
  put(hx - w, hy + 1, hz - d, blockId('crafting_table'));
  put(hx + w, hy + 1, hz - d, blockId('furnace'), 2);
  putSoft(hx, hy + tall, hz, S.torch);
  const cx2 = hx + w, cz2 = hz + d;
  put(cx2, hy + 1, cz2, S.chest, rng.int(4));
  if (inside(cx2, cz2, ox, oz)) {
    const lr = new Random(hash3i(cx2, hy, cz2, subSeed(seed, 'village_loot')));
    blockEntities.push({ x: cx2, y: hy + 1, z: cz2, type: 'chest', items: fillChest('ruins', lr) });
  }
  // register a resident; the spawner turns these into villagers on load
  if (inside(hx, hz, ox, oz)) {
    blockEntities.push({ x: hx, y: hy + 1, z: hz, type: 'villager_spawn' });
  }
}

function farmPlot(gen, fx, fy, fz, rng, put, putSoft) {
  const crops = ['wheat', 'carrots', 'potatoes'];
  const crop = blockId(crops[rng.int(crops.length)]);
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 2;
      const y = fy;
      if (edge) { put(fx + dx, y, fz + dz, blockId('oak_log')); continue; }
      if (dx === 0) { put(fx + dx, y, fz + dz, blockId('water')); continue; }
      put(fx + dx, y, fz + dz, blockId('farmland'), 7);
      put(fx + dx, y + 1, fz + dz, crop, rng.int(8));
    }
  }
  for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (let dy = 2; dy <= 3; dy++) put(fx + dx, fy + dy, fz + dz, S.air);
  }
}

function originRng(seed, cx, cz, label) {
  return new Random(hash3i(cx, cz, subSeed(seed, label), seed));
}

// ------------------------------------------------------------------ dungeon
// 7x7 room, cobble/mossy floor, spawner in the middle, 1-2 loot chests.
function dungeon(gen, scx, scz, ctx, ox, oz, seed) {
  const h = hash2i(scx, scz, subSeed(seed, 'dungeon')) / 4294967296;
  if (h > 0.10) return;
  const rng = originRng(seed, scx, scz, 'dungeon');
  const bx = (scx << 4) + 4 + rng.int(8);
  const bz = (scz << 4) + 4 + rng.int(8);
  const surf = gen.heightAt(bx, bz);
  const top = Math.min(surf - 12, 34);
  if (top < MIN_Y + 12) return;
  const y = MIN_Y + 8 + rng.int(Math.max(1, top - MIN_Y - 8));

  const rx = 3 + rng.int(2), rz = 3 + rng.int(2);
  const { put, putSoft, blockEntities } = ctx;

  for (let dz = -rz - 1; dz <= rz + 1; dz++) {
    for (let dx = -rx - 1; dx <= rx + 1; dx++) {
      const wall = Math.abs(dx) > rx || Math.abs(dz) > rz;
      for (let dy = -1; dy <= 4; dy++) {
        const x = bx + dx, z = bz + dz, wy = y + dy;
        if (dy === -1 || dy === 4 || wall) {
          put(x, wy, z, rng.chance(0.28) ? S.mossy : S.cobble);
        } else {
          put(x, wy, z, S.air);
        }
      }
    }
  }
  // spawner
  put(bx, y, bz, S.spawner);
  if (inside(bx, bz, ox, oz)) {
    blockEntities.push({ x: bx, y, z: bz, type: 'spawner', mob: SPAWNER_MOBS[rng.int(SPAWNER_MOBS.length)], delay: 200 });
  }
  // chests in corners
  const spots = [[-rx, -rz], [rx, rz], [-rx, rz], [rx, -rz]];
  rng.shuffle(spots);
  const n = 1 + rng.int(2);
  for (let i = 0; i < n; i++) {
    const x = bx + spots[i][0], z = bz + spots[i][1];
    put(x, y, z, S.chest, rng.int(4));
    if (inside(x, z, ox, oz)) {
      const lr = new Random(hash3i(x, y, z, subSeed(seed, 'dungeon_loot')));
      blockEntities.push({ x, y, z: z, type: 'chest', items: fillChest('dungeon', lr) });
    }
  }
}

// ---------------------------------------------------------------- mineshaft
// A short network of 3-wide corridors with plank supports, cobwebs and the
// occasional chest. Corridors are capped so the scan radius stays small.
function mineshaft(gen, scx, scz, ctx, ox, oz, seed) {
  const h = hash2i(scx, scz, subSeed(seed, 'mineshaft')) / 4294967296;
  if (h > 0.011) return;
  const rng = originRng(seed, scx, scz, 'mineshaft');
  const startX = (scx << 4) + 8, startZ = (scz << 4) + 8;
  const surf = gen.heightAt(startX, startZ);
  if (surf < SEA_LEVEL - 2) return;
  let y = Math.max(MIN_Y + 10, Math.min(24, surf - 30));

  const { put, putSoft, blockEntities } = ctx;
  const corridors = [];
  const branches = 3 + rng.int(3);
  for (let i = 0; i < branches; i++) {
    const dir = rng.int(4);
    corridors.push({ x: startX, z: startZ, y, dir, len: 14 + rng.int(26) });
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const c of corridors) {
    let x = c.x, z = c.z, cy = c.y;
    const [dx, dz] = DIRS[c.dir];
    for (let step = 0; step < c.len; step++) {
      x += dx; z += dz;
      if (rng.chance(0.10)) cy += rng.chance(0.5) ? 1 : -1;
      if (cy < MIN_Y + 6) cy = MIN_Y + 6;
      // carve a 3 wide x 3 tall corridor
      for (let w = -1; w <= 1; w++) {
        const px = x + (dx === 0 ? w : 0);
        const pz = z + (dz === 0 ? w : 0);
        for (let dy = 0; dy < 3; dy++) put(px, cy + dy, pz, S.air);
        put(px, cy - 1, pz, S.oak_planks);
      }
      // supports every few blocks
      if (step % 5 === 0) {
        for (let w = -1; w <= 1; w += 2) {
          const px = x + (dx === 0 ? w : 0);
          const pz = z + (dz === 0 ? w : 0);
          put(px, cy, pz, S.oak_fence);
          put(px, cy + 1, pz, S.oak_fence);
        }
        for (let w = -1; w <= 1; w++) {
          const px = x + (dx === 0 ? w : 0);
          const pz = z + (dz === 0 ? w : 0);
          put(px, cy + 2, pz, S.oak_log);
        }
        if (rng.chance(0.30)) putSoft(x, cy + 1, z, S.torch);
      }
      if (rng.chance(0.05)) putSoft(x, cy, z, S.cobweb);
      if (rng.chance(0.035)) {
        put(x, cy, z, S.chest, rng.int(4));
        if (inside(x, z, ox, oz)) {
          const lr = new Random(hash3i(x, cy, z, subSeed(seed, 'mineshaft_loot')));
          blockEntities.push({ x, y: cy, z, type: 'chest', items: fillChest('mineshaft', lr) });
        }
      }
    }
  }
}

// -------------------------------------------------------------------- ruins
// A weathered surface shell: broken walls, a chest, sometimes a torch.
function ruins(gen, scx, scz, ctx, ox, oz, seed) {
  const h = hash2i(scx, scz, subSeed(seed, 'ruins')) / 4294967296;
  if (h > 0.018) return;
  const rng = originRng(seed, scx, scz, 'ruins');
  const bx = (scx << 4) + 4 + rng.int(8);
  const bz = (scz << 4) + 4 + rng.int(8);
  const bid = gen.biomeAt(bx, bz);
  if (bid === OCEAN) return;
  const gy = gen.heightAt(bx, bz);
  if (gy < SEA_LEVEL + 1) return;

  const { put, putSoft, blockEntities } = ctx;
  const w = 3 + rng.int(3), d = 3 + rng.int(3), tall = 2 + rng.int(3);

  for (let dz = -d; dz <= d; dz++) {
    for (let dx = -w; dx <= w; dx++) {
      const x = bx + dx, z = bz + dz;
      const gh = gen.heightAt(x, z);
      // floor
      put(x, gh, z, rng.chance(0.3) ? S.mossy : S.stone_bricks);
      const edge = Math.abs(dx) === w || Math.abs(dz) === d;
      if (!edge) { for (let k = 1; k <= tall; k++) put(x, gh + k, z, S.air); continue; }
      const height = Math.max(0, tall - rng.int(tall + 1));
      for (let k = 1; k <= tall; k++) {
        if (k <= height) put(x, gh + k, z, rng.chance(0.35) ? S.mossy : S.stone_bricks);
        else put(x, gh + k, z, S.air);
      }
    }
  }
  const cxp = bx + rng.int(3) - 1, czp = bz + rng.int(3) - 1;
  const cy = gen.heightAt(cxp, czp) + 1;
  put(cxp, cy, czp, S.chest, rng.int(4));
  if (inside(cxp, czp, ox, oz)) {
    const lr = new Random(hash3i(cxp, cy, czp, subSeed(seed, 'ruins_loot')));
    blockEntities.push({ x: cxp, y: cy, z: czp, type: 'chest', items: fillChest('ruins', lr) });
  }
}

// -------------------------------------------------------- buried treasure
function buriedTreasure(gen, scx, scz, ctx, ox, oz, seed) {
  const h = hash2i(scx, scz, subSeed(seed, 'treasure')) / 4294967296;
  if (h > 0.02) return;
  const rng = originRng(seed, scx, scz, 'treasure');
  const bx = (scx << 4) + 4 + rng.int(8);
  const bz = (scz << 4) + 4 + rng.int(8);
  const bid = gen.biomeAt(bx, bz);
  if (bid !== BEACH && bid !== SNOWY_BEACH) return;
  const gy = gen.heightAt(bx, bz);
  const y = gy - 2 - rng.int(2);
  const { put, blockEntities } = ctx;
  put(bx, y, bz, S.chest, rng.int(4));
  if (inside(bx, bz, ox, oz)) {
    const lr = new Random(hash3i(bx, y, bz, subSeed(seed, 'treasure_loot')));
    blockEntities.push({ x: bx, y, z: bz, type: 'chest', items: fillChest('buried_treasure', lr) });
  }
}
