// Entities: dropped items, falling blocks, arrows, and mobs.
//
// Everything shares one AABB physics path (the same swept collision the player
// uses) and one damage/knockback contract. Mobs only tick inside the simulation
// distance, which is deliberately smaller than the render distance.

import { WORLD, CONFIG, difficulty, TPS } from '../core/config.js';
import { BLOCKS, blockId, AIR, isSolidCube } from '../core/blocks.js';
import { item, itemByName } from '../core/items.js';
import { mobDrops } from '../core/loot.js';
import { mkStack, sameItem } from '../items/inventory.js';
import { moveBox, setBoxAt, fluidOverlap, boxCollides } from '../player/physics.js';
import { Random } from '../core/rng.js';

const GRAVITY = 0.08;
const DRAG = 0.98;
const WATER = blockId('water');
const LAVA = blockId('lava');

let nextEntityId = 1;

export class Entity {
  constructor(world, x, y, z) {
    this.id = nextEntityId++;
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.px = x; this.py = y; this.pz = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0;
    this.width = 0.6; this.height = 1.8;
    this.onGround = false;
    this.dead = false;
    this.age = 0;
    this.health = 1; this.maxHealth = 1;
    this.hurtTimer = 0;
    this.type = 'entity';
    this.gravity = GRAVITY;
    this.box = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
    this.inWater = false;
  }

  boundingBox() { return setBoxAt(this.box, this.x, this.y, this.z, this.width, this.height); }

  interpolated(alpha, out) {
    out[0] = this.px + (this.x - this.px) * alpha;
    out[1] = this.py + (this.y - this.py) * alpha;
    out[2] = this.pz + (this.z - this.pz) * alpha;
    return out;
  }

  tick() {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    if (this.hurtTimer > 0) this.hurtTimer--;
  }

  physics(friction = 0.91) {
    const w = this.world;
    setBoxAt(this.box, this.x, this.y, this.z, this.width, this.height);
    this.inWater = fluidOverlap(w, this.box, 'water') > 0.01;
    this.inLava = fluidOverlap(w, this.box, 'lava') > 0.01;

    // Same ordering rule as the player: integrate first, then apply gravity for
    // the next tick. Gravity-before-move silently steals a tick of fall from
    // every jump impulse, which is what kept mobs from hopping a single block.
    const res = moveBox(w, this.box, { x: this.vx, y: this.vy, z: this.vz });
    this.x = (this.box.x0 + this.box.x1) / 2;
    this.y = this.box.y0;
    this.z = (this.box.z0 + this.box.z1) / 2;
    this.onGround = res.onGround;
    this.hitWall = res.hitX || res.hitZ;
    if (res.hitX) this.vx = 0;
    if (res.hitZ) this.vz = 0;
    if (res.hitY) this.vy = 0;
    if (this.onGround) { this.vx *= friction; this.vz *= friction; }
    else { this.vx *= 0.96; this.vz *= 0.96; }

    if (this.inWater) { this.vy -= 0.02; this.vy *= 0.8; this.vx *= 0.85; this.vz *= 0.85; }
    else if (this.inLava) { this.vy -= 0.02; this.vy *= 0.5; this.vx *= 0.5; this.vz *= 0.5; }
    else { this.vy -= this.gravity; this.vy *= DRAG; }
    if (this.vy < -3.92) this.vy = -3.92;

    if (this.y < WORLD.MIN_Y - 8) this.remove();
  }

  damage(amount, source) {
    if (this.dead || this.hurtTimer > 0) return false;
    this.health -= amount;
    this.hurtTimer = 10;
    if (this.health <= 0) this.onDeath(source);
    return true;
  }

  knockback(dx, dz, strength) {
    const l = Math.hypot(dx, dz) || 1;
    this.vx += dx / l * strength;
    this.vz += dz / l * strength;
    this.vy = Math.max(this.vy, 0.3);
  }

  onDeath() { this.remove(); }
  remove() { this.dead = true; }
}

// ============================================================= dropped items
export class ItemEntity extends Entity {
  constructor(world, x, y, z, stack, pickupDelay = 10) {
    super(world, x, y, z);
    this.type = 'item';
    this.stack = stack;
    this.width = 0.28; this.height = 0.28;
    this.pickupDelay = pickupDelay;
    this.health = 5;
    this.lifetime = 6000;         // 5 minutes at 20 TPS
  }

  tick() {
    super.tick();
    if (this.pickupDelay > 0) this.pickupDelay--;
    this.physics(0.6);
    if (this.age > this.lifetime) this.remove();
    if (this.age % 20 === 0) this.mergeNearby();
  }

  mergeNearby() {
    for (const e of this.world.entities) {
      if (e === this || e.dead || e.type !== 'item') continue;
      if (!sameItem(e.stack, this.stack)) continue;
      if (Math.abs(e.x - this.x) > 0.75 || Math.abs(e.y - this.y) > 0.75 || Math.abs(e.z - this.z) > 0.75) continue;
      const limit = item(this.stack.id).stack;
      const room = limit - this.stack.count;
      if (room <= 0) continue;
      const move = Math.min(room, e.stack.count);
      this.stack.count += move; e.stack.count -= move;
      if (e.stack.count <= 0) e.remove();
    }
  }
}

// ============================================================ falling blocks
export class FallingBlock extends Entity {
  constructor(world, x, y, z, blockIdValue, state) {
    super(world, x + 0.5, y, z + 0.5);
    this.type = 'falling_block';
    this.blockId = blockIdValue;
    this.state = state;
    this.width = 0.98; this.height = 0.98;
  }
  tick() {
    super.tick();
    this.vx = 0; this.vz = 0;
    this.physics(1);
    if (this.onGround || this.age > 200) this.land();
  }
  land() {
    const w = this.world;
    const x = Math.floor(this.x), y = Math.round(this.y), z = Math.floor(this.z);
    const target = BLOCKS[w.getBlock(x, y, z)];
    if (target && (target.replaceable || target.id === AIR)) {
      w.setBlock(x, y, z, this.blockId, this.state);
    } else {
      w.game.dropItemAt(this.x, this.y, this.z, mkStack(itemByName(BLOCKS[this.blockId].name).id, 1), false);
    }
    this.remove();
  }
}

// ==================================================================== arrows
export class Arrow extends Entity {
  constructor(world, x, y, z, dx, dy, dz, speed, owner) {
    super(world, x, y, z);
    this.type = 'arrow';
    this.width = 0.16; this.height = 0.16;
    this.gravity = 0.035;
    this.owner = owner;
    const l = Math.hypot(dx, dy, dz) || 1;
    this.vx = dx / l * speed; this.vy = dy / l * speed; this.vz = dz / l * speed;
    this.damageAmount = 4 + speed * 1.2;
    this.stuck = false;
    this.lifetime = 1200;
  }

  tick() {
    super.tick();
    if (this.stuck) { if (this.age > this.lifetime) this.remove(); return; }
    const w = this.world;
    const prevX = this.x, prevY = this.y, prevZ = this.z;
    this.vy -= this.gravity;
    this.vy *= 0.99; this.vx *= 0.99; this.vz *= 0.99;

    // substep so fast arrows cannot pass through a block or a mob
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy, this.vz) / 0.25));
    for (let i = 0; i < steps; i++) {
      this.x += this.vx / steps; this.y += this.vy / steps; this.z += this.vz / steps;
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      if (isSolidCube(w.getBlock(bx, by, bz))) {
        this.x -= this.vx / steps; this.y -= this.vy / steps; this.z -= this.vz / steps;
        this.stuck = true; this.age = 0; this.lifetime = 600;
        this.vx = this.vy = this.vz = 0;
        return;
      }
      if (this.checkHit()) return;
    }
    this.yaw = Math.atan2(this.vx, -this.vz);
    if (this.age > this.lifetime) this.remove();
  }

  checkHit() {
    const w = this.world;
    const box = { x0: this.x - 0.2, y0: this.y - 0.2, z0: this.z - 0.2, x1: this.x + 0.2, y1: this.y + 0.2, z1: this.z + 0.2 };
    for (const e of w.entities) {
      if (e === this || e.dead || e === this.owner) continue;
      if (e.type === 'item' || e.type === 'arrow' || e.type === 'falling_block') continue;
      const eb = e.boundingBox();
      if (box.x1 < eb.x0 || box.x0 > eb.x1 || box.y1 < eb.y0 || box.y0 > eb.y1 || box.z1 < eb.z0 || box.z0 > eb.z1) continue;
      e.damage(this.damageAmount, this.owner);
      e.knockback(this.vx, this.vz, 0.4);
      this.remove();
      return true;
    }
    const p = w.game.player;
    if (this.owner !== p && !p.dead) {
      const pb = p.box;
      setBoxAt(pb, p.x, p.y, p.z, 0.6, 1.8);
      if (!(box.x1 < pb.x0 || box.x0 > pb.x1 || box.y1 < pb.y0 || box.y0 > pb.y1 || box.z1 < pb.z0 || box.z0 > pb.z1)) {
        p.damage(this.damageAmount, 'arrow');
        p.knockback(this.vx, this.vz, 0.3);
        this.remove();
        return true;
      }
    }
    return false;
  }
}

// ===================================================================== boats
export class Boat extends Entity {
  constructor(world, x, y, z, wood = 'oak') {
    super(world, x, y, z);
    this.type = 'boat';
    this.wood = wood;
    this.width = 1.4; this.height = 0.55;
    this.health = 4; this.maxHealth = 4;
    this.rider = null;
    this.gravity = 0.04;
  }

  tick() {
    super.tick();
    const w = this.world;
    setBoxAt(this.box, this.x, this.y, this.z, this.width, this.height);
    const submerged = fluidOverlap(w, this.box, 'water');

    if (this.rider) {
      const input = w.game.controls.state;
      const p = this.rider;
      // steering: A/D turn, W/S drive along the boat's heading
      if (input.left) this.yaw -= 0.055;
      if (input.right) this.yaw += 0.055;
      p.yaw += (input.left ? -0.055 : 0) + (input.right ? 0.055 : 0);
      const drive = (input.forward ? 1 : 0) - (input.back ? 0.5 : 0);
      if (drive !== 0 && submerged > 0.01) {
        this.vx += Math.sin(this.yaw) * 0.035 * drive;
        this.vz += -Math.cos(this.yaw) * 0.035 * drive;
      }
      if (input.sneak) this.dismount();
    }

    if (submerged > 0.01) {
      // buoyancy: push up toward the surface, damp hard so it does not bob
      this.vy += 0.055 * submerged;
      this.vy *= 0.6;
      this.vx *= 0.94; this.vz *= 0.94;
    }
    this.physics(0.92);

    const speed = Math.hypot(this.vx, this.vz);
    if (speed > 0.5) { this.vx *= 0.5 / speed; this.vz *= 0.5 / speed; }

    if (this.rider) {
      const p = this.rider;
      p.x = this.x; p.z = this.z;
      p.y = this.y + 0.35;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.vx = 0; p.vy = 0; p.vz = 0;
      p.fallDistance = 0;
      p.onGround = true;
    }
  }

  mount(player) {
    if (this.rider) return false;
    this.rider = player;
    player.riding = this;
    return true;
  }

  dismount() {
    if (!this.rider) return;
    const p = this.rider;
    p.riding = null;
    p.x = this.x + 1.2;
    p.y = this.y + 0.8;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    this.rider = null;
  }

  onDeath() {
    this.dismount();
    const name = `${this.wood}_boat`;
    const it = itemByName(name);
    if (it) this.world.game.dropItemAt(this.x, this.y + 0.3, this.z, mkStack(it.id, 1), false);
    this.remove();
  }
}

// ================================================================ primed TNT
export class PrimedTNT extends Entity {
  constructor(world, x, y, z, fuse = 80) {
    super(world, x + 0.5, y, z + 0.5);
    this.type = 'tnt';
    this.width = 0.98; this.height = 0.98;
    this.fuse = fuse;
    this.vy = 0.2;
    this.vx = (Math.random() - 0.5) * 0.04;
    this.vz = (Math.random() - 0.5) * 0.04;
  }
  tick() {
    super.tick();
    this.physics(0.7);
    this.fuse--;
    if (this.fuse % 4 === 0) this.world.game.spawnParticles(this.x, this.y + 1, this.z, 2, 0xdddddd);
    if (this.fuse <= 0) {
      this.remove();
      this.world.game.explode(this.x, this.y + 0.5, this.z, 4.0);
    }
  }
}

// ===================================================================== mobs
export const MOB_TYPES = {
  cow: { hp: 10, w: 0.9, h: 1.4, speed: 0.10, hostile: false, food: ['wheat'], drops: 'cow' },
  pig: { hp: 10, w: 0.9, h: 0.9, speed: 0.11, hostile: false, food: ['carrot', 'potato'], drops: 'pig' },
  sheep: { hp: 8, w: 0.9, h: 1.3, speed: 0.11, hostile: false, food: ['wheat'], drops: 'sheep', shearable: true },
  chicken: { hp: 4, w: 0.4, h: 0.7, speed: 0.13, hostile: false, food: ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds'], drops: 'chicken' },
  rabbit: { hp: 3, w: 0.4, h: 0.5, speed: 0.16, hostile: false, food: ['carrot', 'dandelion'], drops: 'rabbit', skittish: 8, hops: true },
  wolf: { hp: 8, w: 0.6, h: 0.85, speed: 0.15, hostile: false, food: ['bone'], drops: 'wolf', tameable: 'bone', packHunter: true },
  fox: { hp: 10, w: 0.6, h: 0.7, speed: 0.16, hostile: false, food: ['sweet_berries', 'chicken'], drops: 'fox', skittish: 10, nocturnal: true, hunts: ['chicken', 'rabbit'] },
  horse: { hp: 15, w: 1.3, h: 1.6, speed: 0.14, hostile: false, food: ['wheat', 'apple'], drops: 'horse', tameable: 'apple', rideable: true },
  squid: { hp: 10, w: 0.8, h: 0.8, speed: 0.09, hostile: false, drops: 'squid', aquatic: true },
  bat: { hp: 6, w: 0.5, h: 0.9, speed: 0.13, hostile: false, drops: 'bat', flying: true, nocturnal: true },
  villager: { hp: 20, w: 0.6, h: 1.95, speed: 0.09, hostile: false, drops: 'villager', trades: true, fleesHostiles: true },
  zombie: { hp: 20, w: 0.6, h: 1.95, speed: 0.115, hostile: true, damage: 3, drops: 'zombie', burnsInDay: true, hunts: ['villager'] },
  skeleton: { hp: 20, w: 0.6, h: 1.99, speed: 0.125, hostile: true, damage: 2, ranged: true, drops: 'skeleton', burnsInDay: true },
  creeper: { hp: 20, w: 0.6, h: 1.7, speed: 0.11, hostile: true, damage: 0, explodes: true, drops: 'creeper' },
  spider: { hp: 16, w: 1.4, h: 0.9, speed: 0.15, hostile: true, damage: 2, climbs: true, dayPassive: true, drops: 'spider' },
};

export class Mob extends Entity {
  constructor(world, type, x, y, z) {
    super(world, x, y, z);
    const t = MOB_TYPES[type];
    this.type = type;
    this.def = t;
    this.width = t.w; this.height = t.h;
    this.maxHealth = t.hp; this.health = t.hp;
    this.hostile = t.hostile;
    this.rng = new Random((x * 73856093) ^ (z * 19349663) ^ world.time);
    this.wanderTimer = 0;
    this.targetYaw = this.rng.float() * Math.PI * 2;
    this.yaw = this.targetYaw;
    this.moving = false;
    this.walkPhase = 0;
    this.attackCooldown = 0;
    this.fuse = -1;
    this.loveTimer = 0;
    this.baby = false;
    this.sheared = false;
    this.woolColor = 0;
    this.fireTicks = 0;
    this.jumpCooldown = 0;
    this.persistent = false;
    this.aggro = 0;
    this.tamed = false;
    this.owner = null;
    this.sitting = false;
    this.huntCooldown = 0;
    this.attackTarget = null;
    if (t.trades) {
      const profs = ['farmer', 'librarian', 'blacksmith', 'butcher', 'cleric', 'cartographer'];
      this.profession = profs[this.rng.int(profs.length)];
      this.tradeUses = {};
      this.persistent = true;
    }
  }

  get simDistance2() { return (CONFIG.simulationDistance * 16) ** 2; }

  tick() {
    super.tick();
    const w = this.world;
    const p = w.game.player;
    const dx = p.x - this.x, dz = p.z - this.z;
    const dist2 = dx * dx + dz * dz;

    // despawn far away, and never despawn a named/persistent mob
    if (this.hostile && !this.persistent && dist2 > 128 * 128) { this.remove(); return; }
    if (dist2 > this.simDistance2 * 1.5) return;

    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.loveTimer > 0) this.loveTimer--;

    this.burnInDaylight();
    if (!this.rider) this.ai(p, dx, dz, dist2);
    // flying and swimming mobs cancel gravity themselves; their AI sets vy
    const savedGravity = this.gravity;
    if (this.def.flying) this.gravity = 0;
    if (this.def.aquatic && this.inWater) this.gravity = 0;
    this.physics(this.def.flying ? 0.96 : 0.85);
    this.gravity = savedGravity;

    if (this.inLava) this.damage(4, null);
    if (this.fireTicks > 0) {
      this.fireTicks--;
      if (this.fireTicks % 20 === 0) this.damage(1, null);
      if (this.inWater) this.fireTicks = 0;
    }
    // suffocation / drowning safety valve so mobs never get stuck forever
    if (this.age % 40 === 0 && boxCollides(this.world, setBoxAt(this.box, this.x, this.y + this.height - 0.2, this.z, 0.2, 0.1))) {
      this.damage(1, null);
    }
    if (this.rider) this.tickRidden();
    if (this.moving) this.walkPhase += 0.28;
  }

  /** A tamed, mounted horse steers from the rider's input. */
  tickRidden() {
    const p = this.rider;
    const input = this.world.game.controls.state;
    if (input.sneak) { this.dismountRider(); return; }
    this.yaw = p.yaw;
    const drive = (input.forward ? 1 : 0) - (input.back ? 0.55 : 0);
    if (drive !== 0) {
      const s = this.def.speed * 1.55 * drive;
      this.vx += (Math.sin(this.yaw) * s - this.vx) * 0.4;
      this.vz += (-Math.cos(this.yaw) * s - this.vz) * 0.4;
      this.moving = true;
    } else this.moving = false;
    if (input.jump && this.onGround) this.vy = 0.52;
    p.x = this.x; p.z = this.z;
    p.y = this.y + this.height * 0.72;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.vx = p.vy = p.vz = 0;
    p.fallDistance = 0;
    p.onGround = this.onGround;
  }

  dismountRider() {
    if (!this.rider) return;
    const p = this.rider;
    p.riding = null;
    p.x = this.x + 1.2;
    p.y = this.y + 1.0;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    this.rider = null;
  }

  burnInDaylight() {
    if (!this.def.burnsInDay) return;
    const w = this.world;
    if (w.isNight() || w.isRaining()) return;
    if (w.getSkyLight(Math.floor(this.x), Math.floor(this.y + this.height * 0.5), Math.floor(this.z)) < 15) return;
    if (this.inWater) return;
    if (w.skyLightFactor() < 0.7) return;
    this.fireTicks = Math.max(this.fireTicks, 100);
  }

  ai(p, dx, dz, dist2) {
    const w = this.world;
    const diff = difficulty();
    let chase = false;

    // --- aquatic and flying mobs ignore the walking AI entirely
    if (this.def.aquatic) return this.aiSwim(p, dist2);
    if (this.def.flying) return this.aiFly(p, dist2);

    // --- a tamed wolf follows its owner and fights what attacks them
    if (this.tamed && this.owner) {
      const od2 = (this.owner.x - this.x) ** 2 + (this.owner.z - this.z) ** 2;
      if (this.attackTarget && !this.attackTarget.dead && od2 < 24 * 24) {
        this.pursue(this.attackTarget);
        return;
      }
      if (od2 > 100) { this.faceTowards(this.owner.x, this.owner.z); this.step(1.25); return; }
      if (od2 > 9) { this.faceTowards(this.owner.x, this.owner.z); this.step(0.9); return; }
      this.moving = false;
      return;
    }

    // --- predators hunt smaller animals
    if (this.def.hunts && (!this.huntCooldown || this.huntCooldown <= 0)) {
      // a hostile only turns on other mobs when the player is not right there
      if (!(this.hostile && dist2 < 100)) {
        const prey = this.findPrey();
        if (prey) { this.pursue(prey); return; }
      }
    }
    if (this.huntCooldown > 0) this.huntCooldown--;

    // --- villagers keep away from anything hostile
    if (this.def.fleesHostiles) {
      let threat = null, td = 64;
      for (const e of w.entities) {
        if (e.dead || !(e instanceof Mob) || !e.hostile) continue;
        const d = (e.x - this.x) ** 2 + (e.z - this.z) ** 2;
        if (d < td) { td = d; threat = e; }
      }
      if (threat) {
        this.faceTowards(this.x * 2 - threat.x, this.z * 2 - threat.z);
        this.step(1.3);
        return;
      }
    }

    // --- skittish animals bolt when the player gets close
    if (this.def.skittish && !this.tamed) {
      const r = this.def.skittish;
      if (dist2 < r * r) {
        this.faceTowards(this.x * 2 - p.x, this.z * 2 - p.z);
        this.step(1.35);
        return;
      }
    }

    if (this.hostile && diff.hostiles && !p.dead) {
      const passiveByDay = this.def.dayPassive && !w.isNight() &&
        w.getSkyLight(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z)) > 8 && this.aggro <= 0;
      if (!passiveByDay && dist2 < 24 * 24 && this.canSee(p)) {
        chase = true;
        this.aggro = 200;
      }
    }
    if (this.aggro > 0) { this.aggro--; if (this.aggro > 0 && dist2 < 40 * 40) chase = true; }

    if (chase) this.chaseTarget(p, dx, dz, dist2);
    else this.wander();

    // creeper fuse
    if (this.fuse >= 0) {
      this.fuse++;
      if (this.fuse >= 30) { this.explode(); return; }
    }
  }

  chaseTarget(p, dx, dz, dist2) {
    const dist = Math.sqrt(dist2);
    this.targetYaw = Math.atan2(dx, -dz);
    this.yaw = approachAngle(this.yaw, this.targetYaw, 0.28);

    if (this.def.ranged) {
      // skeletons hold a firing line
      if (dist > 12) this.step(1);
      else if (dist < 5) this.step(-0.7);
      else { this.moving = false; this.strafe(); }
      if (this.attackCooldown <= 0 && dist < 16 && this.canSee(p)) {
        this.attackCooldown = 40;
        const px = p.x - this.x, py = (p.y + 1.2) - (this.y + this.height * 0.85), pz = p.z - this.z;
        this.world.game.spawnArrow(this.x, this.y + this.height * 0.85, this.z, px, py + dist * 0.06, pz, 1.7, this);
      }
      return;
    }

    if (this.def.explodes) {
      if (dist < 3.2) {
        if (this.fuse < 0) { this.fuse = 0; this.world.game.audio.play('fuse'); }
        this.moving = false;
      } else {
        if (this.fuse >= 0 && dist > 6) this.fuse = -1;
        this.step(1);
      }
      return;
    }

    if (dist > 1.4) this.step(1);
    else {
      this.moving = false;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = 20;
        const dmg = this.def.damage;
        if (dmg > 0 && p.damage(dmg, 'mob')) {
          p.knockback(dx, dz, 0.42);
          this.world.game.audio.play('mob_attack');
        }
      }
    }
  }

  /** Turn to face a world position. */
  faceTowards(x, z) {
    this.targetYaw = Math.atan2(x - this.x, -(z - this.z));
    this.yaw = approachAngle(this.yaw, this.targetYaw, 0.3);
  }

  /** Close on a target entity and bite it. */
  pursue(target) {
    const d = Math.hypot(target.x - this.x, target.z - this.z);
    this.faceTowards(target.x, target.z);
    if (d > 1.3) { this.step(1.2); return; }
    this.moving = false;
    if (this.attackCooldown <= 0) {
      this.attackCooldown = 20;
      target.damage(this.def.damage || 3, this);
      target.knockback(target.x - this.x, target.z - this.z, 0.35);
      if (target.dead) { this.attackTarget = null; this.huntCooldown = 400; }
    }
  }

  findPrey() {
    let best = null, bestD = 12 * 12;
    for (const e of this.world.entities) {
      if (e.dead || !(e instanceof Mob)) continue;
      if (!this.def.hunts.includes(e.type)) continue;
      const d = (e.x - this.x) ** 2 + (e.z - this.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** Squid: drifts through water, sinks toward it if beached. */
  aiSwim(p, dist2) {
    const w = this.world;
    if (!this.inWater) {
      this.moving = false;
      this.vy -= 0.01;
      if (this.age % 40 === 0) this.damage(1, null);   // suffocating out of water
      return;
    }
    this.wanderTimer--;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 30 + this.rng.int(70);
      this.targetYaw = this.rng.float() * Math.PI * 2;
      this.swimRise = (this.rng.float() - 0.45) * 0.05;
    }
    this.yaw = approachAngle(this.yaw, this.targetYaw, 0.08);
    const s = this.def.speed;
    this.vx += (Math.sin(this.yaw) * s - this.vx) * 0.12;
    this.vz += (-Math.cos(this.yaw) * s - this.vz) * 0.12;
    this.vy += (this.swimRise || 0) * 0.5;
    // keep clear of the surface and the bed
    const above = w.getBlock(Math.floor(this.x), Math.floor(this.y + 1.2), Math.floor(this.z));
    if (!BLOCKS[above].liquid) this.vy -= 0.02;
    this.moving = true;
  }

  /** Bat: flaps around caves, avoids daylight, never lands for long. */
  aiFly(p, dist2) {
    const w = this.world;
    this.wanderTimer--;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 25 + this.rng.int(50);
      this.targetYaw = this.rng.float() * Math.PI * 2;
      this.flyRise = (this.rng.float() - 0.4) * 0.09;
    }
    this.yaw = approachAngle(this.yaw, this.targetYaw, 0.10);
    const s = this.def.speed;
    this.vx += (Math.sin(this.yaw) * s - this.vx) * 0.15;
    this.vz += (-Math.cos(this.yaw) * s - this.vz) * 0.15;
    // hold altitude: climb off the floor, duck under ceilings
    const below = isSolidCube(w.getBlock(Math.floor(this.x), Math.floor(this.y - 1.5), Math.floor(this.z)));
    const above = isSolidCube(w.getBlock(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z)));
    let rise = this.flyRise || 0;
    if (below) rise += 0.06;
    if (above) rise -= 0.09;
    this.vy += rise;
    this.vy = Math.max(-0.22, Math.min(0.22, this.vy));
    this.moving = true;
    this.wingPhase = (this.wingPhase || 0) + 0.85;
  }

  wander() {
    this.wanderTimer--;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 40 + this.rng.int(120);
      if (this.rng.chance(0.45)) { this.moving = false; return; }
      this.targetYaw = this.rng.float() * Math.PI * 2;
      this.moving = true;
    }
    if (!this.moving) return;
    this.yaw = approachAngle(this.yaw, this.targetYaw, 0.12);
    this.step(0.55);
  }

  strafe() {
    const side = (this.age % 120 < 60) ? 1 : -1;
    const a = this.yaw + Math.PI / 2 * side;
    const s = this.def.speed * 0.5;
    this.vx += Math.sin(a) * s * 0.2;
    this.vz += -Math.cos(a) * s * 0.2;
  }

  step(scale) {
    const speed = this.def.speed * scale * (this.baby ? 1.2 : 1);
    const wx = Math.sin(this.yaw) * speed;
    const wz = -Math.cos(this.yaw) * speed;
    const accel = this.onGround ? 0.45 : 0.09;
    this.vx += (wx - this.vx) * accel;
    this.vz += (wz - this.vz) * accel;
    this.moving = true;

    // rabbits and similar move in hops rather than a glide
    if (this.def.hops && this.onGround && this.jumpCooldown <= 0) {
      this.vy = 0.26;               // ~0.55 blocks: a hop, not a block-clearing jump
      this.jumpCooldown = 10 + this.rng.int(6);
    }

    // obstacle handling: climb (spiders), jump, or avoid a drop
    const ax = Math.sign(wx), az = Math.sign(wz);
    const fx = Math.floor(this.x + ax * (this.width / 2 + 0.25));
    const fz = Math.floor(this.z + az * (this.width / 2 + 0.25));
    const fy = Math.floor(this.y);
    if (this.def.climbs && this.hitWall) { this.vy = Math.max(this.vy, 0.12); return; }
    if (this.onGround && this.jumpCooldown <= 0) {
      const ahead = isSolidCube(this.world.getBlock(fx, fy, fz));
      const aheadUp = isSolidCube(this.world.getBlock(fx, fy + 1, fz));
      if (ahead && !aheadUp) { this.vy = 0.42; this.jumpCooldown = 8; }
    }
    // cliff avoidance for wandering passives
    if (!this.hostile && this.onGround) {
      let drop = 0;
      for (let d = 1; d <= 4; d++) {
        if (isSolidCube(this.world.getBlock(fx, fy - d, fz))) break;
        drop = d;
      }
      if (drop >= 3) { this.vx *= -0.4; this.vz *= -0.4; this.targetYaw += Math.PI; }
    }
  }

  canSee(p) {
    const dx = p.x - this.x, dy = (p.y + 1.5) - (this.y + this.height * 0.85), dz = p.z - this.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return true;
    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(this.x + dx * t);
      const y = Math.floor(this.y + this.height * 0.85 + dy * t);
      const z = Math.floor(this.z + dz * t);
      if (BLOCKS[this.world.getBlock(x, y, z)].opacity >= 15) return false;
    }
    return true;
  }

  damage(amount, source) {
    const ok = super.damage(amount, source);
    if (ok) {
      // a tamed wolf's pack answers whatever hurt its owner
      if (source && source !== this) {
        for (const e of this.world.entities) {
          if (e.dead || !(e instanceof Mob) || !e.tamed || !e.def.packHunter) continue;
          if ((e.x - this.x) ** 2 + (e.z - this.z) ** 2 > 400) continue;
          if (source instanceof Mob) e.attackTarget = source;
        }
      }
      this.aggro = 300;
      this.world.game.audio.play('mob_hurt');
      if (!this.hostile) {
        // passives flee from whatever hit them
        if (source) { this.targetYaw = Math.atan2(this.x - source.x, -(this.z - source.z)); }
        this.wanderTimer = 60; this.moving = true;
      }
    }
    return ok;
  }

  explode() {
    const radius = difficulty().creeperRadius * (this.baby ? 0.5 : 1);
    this.world.game.explode(this.x, this.y + 0.5, this.z, radius);
    this.remove();
  }

  onDeath(source) {
    const drops = mobDrops(this.def.drops, this.rng);
    if (this.type === 'sheep' && !this.sheared) drops.push({ id: itemByName('white_wool').id, count: 1 });
    if (this.fireTicks > 0) {
      for (const d of drops) {
        const it = item(d.id);
        if (!it) continue;
        const cooked = itemByName('cooked_' + it.name);
        if (cooked) d.id = cooked.id;
      }
    }
    for (const d of drops) {
      this.world.game.dropItemAt(this.x, this.y + 0.4, this.z, mkStack(d.id, d.count), false);
    }
    this.world.game.audio.play('mob_death');
    this.remove();
  }

  /** Right-click interaction: feeding, shearing, milking. */
  interact(player) {
    const held = player.held;
    if (!held) return false;
    const it = item(held.id);
    if (!it) return false;

    if (this.type === 'sheep' && it.tool && it.tool.type === 'shears' && !this.sheared) {
      this.sheared = true;
      this.world.game.dropItemAt(this.x, this.y + 0.6, this.z, mkStack(itemByName('white_wool').id, 1 + this.rng.int(3)), false);
      player.inventory.set(player.inventory.selected, held);
      this.world.game.audio.play('shear');
      return true;
    }
    if (this.type === 'cow' && it.name === 'bucket') {
      player.inventory.consumeHeld(1);
      const left = player.inventory.pickUp(mkStack(itemByName('milk_bucket').id, 1));
      if (left) this.world.game.dropItemAt(player.x, player.y + 1, player.z, left, false);
      return true;
    }
    if (this.def.trades) {
      this.world.game.openTrades(this);
      return true;
    }
    // taming: feed the right item until it takes
    if (this.def.tameable && !this.tamed && it.name === this.def.tameable) {
      player.inventory.consumeHeld(1);
      if (this.rng.chance(0.34)) {
        this.tamed = true;
        this.owner = player;
        this.persistent = true;
        this.world.game.spawnParticles(this.x, this.y + this.height, this.z, 12, 0xff5588);
        this.world.game.toast(this.def.rideable ? 'The horse is tamed. Right-click to ride.' : 'Tamed!');
      } else {
        this.world.game.spawnParticles(this.x, this.y + this.height, this.z, 8, 0x888888);
      }
      return true;
    }
    // a tamed horse can be ridden
    if (this.def.rideable && this.tamed && !player.riding) {
      this.rider = player;
      player.riding = this;
      return true;
    }
    if (this.tamed && this.def.packHunter) {
      this.sitting = !this.sitting;
      this.world.game.toast(this.sitting ? 'The wolf sits.' : 'The wolf follows.');
      return true;
    }

    if (this.def.food && this.def.food.includes(it.name) && this.loveTimer <= 0 && !this.baby) {
      player.inventory.consumeHeld(1);
      this.loveTimer = 600;
      this.world.game.spawnParticles(this.x, this.y + this.height * 0.8, this.z, 8, 0xff88bb);
      this.tryBreed();
      return true;
    }
    return false;
  }

  tryBreed() {
    for (const e of this.world.entities) {
      if (e === this || e.dead || e.type !== this.type) continue;
      if (e.loveTimer <= 0 || e.baby) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > 6) continue;
      e.loveTimer = 0; this.loveTimer = 0;
      const baby = new Mob(this.world, this.type, (this.x + e.x) / 2, this.y, (this.z + e.z) / 2);
      baby.baby = true;
      baby.width *= 0.55; baby.height *= 0.55;
      baby.maxHealth = Math.ceil(baby.maxHealth / 2); baby.health = baby.maxHealth;
      baby.persistent = true;
      this.world.entities.push(baby);
      this.world.game.spawnParticles(baby.x, baby.y + 0.5, baby.z, 10, 0xff88bb);
      return;
    }
  }
}

function approachAngle(cur, target, rate) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * rate;
}
