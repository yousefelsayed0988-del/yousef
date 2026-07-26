// Mob spawning.
//
// Hostiles need light <= CONFIG.hostileLightMax (default 7, the classic "dark
// cave" rule), a solid opaque floor, headroom, and a minimum distance from the
// player. Passives need daylight and grass. Both obey per-category caps, spawn
// only inside the simulation distance, and despawn beyond it.

import { CONFIG, difficulty } from '../core/config.js';
import { BLOCKS, blockId, AIR, isSolidCube } from '../core/blocks.js';
import { Random } from '../core/rng.js';
import { Mob, MOB_TYPES } from './entities.js';
import { setBoxAt, boxCollides } from '../player/physics.js';
import { WORLD } from '../core/config.js';

const HOSTILES = ['zombie', 'skeleton', 'creeper', 'spider'];
const GRASS = blockId('grass_block');

export class MobSpawner {
  constructor(world) {
    this.world = world;
    this.rng = new Random((world.seed ^ 0x9f2b) | 0);
    this.hostileTimer = 0;
    this.passiveTimer = 0;
  }

  tick(player) {
    const diff = difficulty();
    if (--this.hostileTimer <= 0) {
      this.hostileTimer = 20;
      if (diff.hostiles) this.spawnWave(player, true);
    }
    if (--this.passiveTimer <= 0) {
      this.passiveTimer = 400;
      this.spawnWave(player, false);
    }
  }

  countCategory(hostile) {
    let n = 0;
    for (const e of this.world.entities) {
      if (e.dead || !(e instanceof Mob)) continue;
      if (!!e.hostile === hostile) n++;
    }
    return n;
  }

  spawnWave(player, hostile) {
    const w = this.world;
    const cap = hostile ? CONFIG.mobCapHostile : CONFIG.mobCapPassive;
    if (this.countCategory(hostile) >= cap) return;

    const sim = CONFIG.simulationDistance;
    const attempts = hostile ? 24 : 10;
    for (let i = 0; i < attempts; i++) {
      const cx = (Math.floor(player.x) >> 4) + this.rng.int(sim * 2 + 1) - sim;
      const cz = (Math.floor(player.z) >> 4) + this.rng.int(sim * 2 + 1) - sim;
      const c = w.getChunk(cx, cz);
      if (!c || !c.generated) continue;
      const x = (cx << 4) + this.rng.int(16);
      const z = (cz << 4) + this.rng.int(16);

      let y;
      if (hostile) {
        // pick anywhere in the column so caves get populated too
        const top = w.topSolid(x, z);
        y = WORLD.MIN_Y + 4 + this.rng.int(Math.max(1, top - WORLD.MIN_Y));
      } else {
        y = w.topSolid(x, z) + 1;
      }
      if (this.trySpawn(player, x, y, z, hostile)) return;
    }
  }

  trySpawn(player, x, y, z, hostile) {
    const w = this.world;
    const dx = x - player.x, dz = z - player.z, dy = y - player.y;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (hostile && dist2 < 24 * 24) return false;
    if (dist2 > (CONFIG.simulationDistance * 16) ** 2) return false;

    const floor = w.getBlock(x, y - 1, z);
    if (!isSolidCube(floor)) return false;
    if (BLOCKS[floor].opacity < 15) return false;
    if (w.getBlock(x, y, z) !== AIR || w.getBlock(x, y + 1, z) !== AIR) return false;

    const light = w.lightLevel(x, y, z);
    const biome = w.biomeAt(x, z);

    let type;
    if (hostile) {
      const surface = w.getSkyLight(x, y, z) > 0;
      const stormSpawn = surface && w.isThundering();
      if (!stormSpawn) {
        if (light > CONFIG.hostileLightMax) return false;
        if (surface && !w.isNight()) return false;
      }
      type = HOSTILES[this.rng.int(HOSTILES.length)];
      if (type === 'spider' && !this.hasRoom(x, y, z, 1.4, 0.9)) type = 'zombie';
    } else {
      if (floor !== GRASS) return false;
      if (light < 9) return false;
      const weights = biome.mobs || {};
      const entries = Object.entries(weights);
      if (entries.length === 0) return false;
      let total = 0;
      for (const [, wgt] of entries) total += wgt;
      let r = this.rng.float() * total;
      for (const [name, wgt] of entries) { r -= wgt; if (r <= 0) { type = name; break; } }
      if (!type) return false;
    }

    const def = MOB_TYPES[type];
    if (!def) return false;
    if (!this.hasRoom(x, y, z, def.w, def.h)) return false;

    const mob = new Mob(w, type, x + 0.5, y, z + 0.5);
    if (type === 'sheep') mob.woolColor = this.rng.int(16);
    // small packs feel more natural than lone wanderers
    w.entities.push(mob);
    const pack = hostile ? this.rng.int(3) : 1 + this.rng.int(3);
    for (let i = 0; i < pack; i++) {
      const ox = x + this.rng.int(5) - 2, oz = z + this.rng.int(5) - 2;
      const oy = w.topSolid(ox, oz) + 1;
      if (hostile && Math.abs(oy - y) > 2) continue;
      const py = hostile ? y : oy;
      if (!this.hasRoom(ox, py, oz, def.w, def.h)) continue;
      if (!isSolidCube(w.getBlock(ox, py - 1, oz))) continue;
      const extra = new Mob(w, type, ox + 0.5, py, oz + 0.5);
      if (type === 'sheep') extra.woolColor = mob.woolColor;
      w.entities.push(extra);
    }
    return true;
  }

  hasRoom(x, y, z, width, height) {
    const box = setBoxAt({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }, x + 0.5, y, z + 0.5, width, height);
    return !boxCollides(this.world, box);
  }
}

/** Block-entity mob spawners found in dungeons. */
export function tickSpawnerBlocks(world, player) {
  const sim = CONFIG.simulationDistance * 16;
  if (!difficulty().hostiles) return;
  const pcx = Math.floor(player.x) >> 4, pcz = Math.floor(player.z) >> 4;
  const r = CONFIG.simulationDistance;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const c = world.getChunk(pcx + dx, pcz + dz);
      if (!c) continue;
      for (const be of c.blockEntities.values()) {
        if (be.type !== 'spawner') continue;
        const d = Math.hypot(be.x - player.x, be.y - player.y, be.z - player.z);
        if (d > 16) continue;
        be.delay = (be.delay ?? 200) - 1;
        if (be.delay > 0) continue;
        be.delay = 200 + Math.floor(Math.random() * 400);
        let nearby = 0;
        for (const e of world.entities) {
          if (e.dead || !(e instanceof Mob)) continue;
          if (Math.hypot(e.x - be.x, e.y - be.y, e.z - be.z) < 8) nearby++;
        }
        if (nearby >= 6) continue;
        const def = MOB_TYPES[be.mob];
        if (!def) continue;
        for (let i = 0; i < 3; i++) {
          const sx = be.x + Math.floor(Math.random() * 7) - 3;
          const sy = be.y + Math.floor(Math.random() * 3) - 1;
          const sz = be.z + Math.floor(Math.random() * 7) - 3;
          if (!isSolidCube(world.getBlock(sx, sy - 1, sz))) continue;
          const box = setBoxAt({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }, sx + 0.5, sy, sz + 0.5, def.w, def.h);
          if (boxCollides(world, box)) continue;
          world.entities.push(new Mob(world, be.mob, sx + 0.5, sy, sz + 0.5));
          world.game.spawnParticles(sx + 0.5, sy + 0.5, sz + 0.5, 8, 0x552266);
          break;
        }
      }
    }
  }
}
