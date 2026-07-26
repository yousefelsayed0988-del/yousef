// The player: movement, survival attributes, mining, and block interaction.
//
// Physics runs on the fixed 20 Hz tick and the renderer interpolates between
// the previous and current tick positions, which is what gives voxel movement
// its characteristic feel while keeping simulation deterministic.

import { WORLD, CONFIG, difficulty, TPS } from '../core/config.js';
import { BLOCKS, blockId, AIR, TIER, isSolidCube } from '../core/blocks.js';
import { item, itemByName, damageItem, TOOL_MATERIALS } from '../core/items.js';
import { blockDrops } from '../core/loot.js';
import { Inventory, mkStack, ARMOR_START, OFFHAND, durabilityFraction } from '../items/inventory.js';
import { moveBox, boxCollides, fluidOverlap, raycast, setBoxAt, selectionBoxes } from './physics.js';
import { Random } from '../core/rng.js';
import { growTree } from '../world/randomtick.js';
import { DIR_VEC } from '../world/world.js';
import { smeltResult } from '../core/recipes.js';

export const PW = 0.6, PH = 1.8, EYE = 1.62, SNEAK_EYE = 1.5;

const WALK = 4.317 / TPS;
const SPRINT = 5.612 / TPS;
const SNEAK = 1.295 / TPS;
const SWIM = 2.2 / TPS;
const GRAVITY = 0.08;
const DRAG = 0.98;
const JUMP = 0.42;
const WATER_GRAVITY = 0.02;
const LAVA_DRAG = 0.5;

const WATER = blockId('water');
const LAVA = blockId('lava');
const FIRE = blockId('fire');
const TORCH = blockId('torch');
const WALL_TORCH = blockId('wall_torch');
const FARMLAND = blockId('farmland');
const DIRT = blockId('dirt');
const GRASS = blockId('grass_block');

export class Player {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.x = 0; this.y = 80; this.z = 0;
    this.px = 0; this.py = 80; this.pz = 0;     // previous tick, for interpolation
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;

    this.health = 20; this.maxHealth = 20;
    this.hunger = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 300; this.maxAir = 300;
    this.inventory = new Inventory();
    this.spawn = { x: 0, y: 80, z: 0 };
    this.bedSpawn = null;

    this.onGround = false;
    this.sprinting = false;
    this.sneaking = false;
    this.inWater = false;
    this.inLava = false;
    this.submerged = false;
    this.swimming = false;
    this.onLadder = false;
    this.fallDistance = 0;
    this.dead = false;
    this.deathMessage = '';

    this.hurtTimer = 0;         // i-frames
    this.hurtFlash = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.airTimer = 0;
    this.attackCooldown = 0;
    this.useCooldown = 0;
    this.eating = 0;
    this.eatingSlot = -1;
    this.shieldRaised = false;
    this.shieldCooldown = 0;
    this.bowCharge = -1;
    this.sleeping = null;
    this.riding = null;

    this.mining = null;          // { x, y, z, progress, stage }
    this.swingTime = 0;
    this.bobPhase = 0;
    this.rng = new Random((world.seed ^ 0x2b71) | 0);
    this.stepSoundTimer = 0;
    this.box = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
  }

  get eyeY() { return this.y + (this.sneaking ? SNEAK_EYE : EYE); }
  get held() { return this.inventory.held; }

  eyePosition(alpha, out) {
    out[0] = this.px + (this.x - this.px) * alpha;
    out[1] = this.py + (this.y - this.py) * alpha + (this.sneaking ? SNEAK_EYE : EYE);
    out[2] = this.pz + (this.z - this.pz) * alpha;
    return out;
  }

  lookVector() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp];
  }

  /** Compass direction as a short label plus the raw facing index. */
  facing() {
    let a = ((this.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const names = ['north', 'east', 'south', 'west'];
    const idx = Math.round(a / 90) % 4;
    return { name: names[idx], index: idx, angle: a };
  }

  // ================================================================== ticking
  tick(input) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    if (this.dead) return;
    if (this.sleeping) { this.tickSleep(); return; }

    this.updateEnvironment();
    if (this.riding && !this.riding.dead) {
      // the vehicle owns position; the player keeps look control and survival
      this.tickSurvival();
      this.tickMining(input);
      this.tickTimers();
      return;
    }
    this.riding = null;
    this.applyInput(input);
    this.applyPhysics();
    this.tickSurvival();
    this.tickMining(input);
    this.tickTimers();
  }

  updateEnvironment() {
    const w = this.world;
    setBoxAt(this.box, this.x, this.y, this.z, PW, PH);
    this.inWater = fluidOverlap(w, this.box, 'water') > 0.001;
    this.inLava = fluidOverlap(w, this.box, 'lava') > 0.001;
    const head = w.getBlock(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
    this.submerged = BLOCKS[head].liquid === 'water';
    this.inFire = w.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) === FIRE;
    const feet = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    this.onLadder = BLOCKS[feet].climbable === true;
  }

  applyInput(input) {
    let fwd = 0, strafe = 0;
    if (input.forward) fwd += 1;
    if (input.back) fwd -= 1;
    if (input.left) strafe -= 1;
    if (input.right) strafe += 1;
    const moving = fwd !== 0 || strafe !== 0;

    this.sneaking = input.sneak && this.onGround && !this.swimming;
    if (!moving || fwd <= 0 || this.hunger <= 6) this.sprinting = false;
    else if (input.sprint) this.sprinting = true;

    let speed = this.sneaking ? SNEAK : (this.sprinting ? SPRINT : WALK);
    if (this.inWater) speed = SWIM * (this.sprinting ? 1.25 : 1);
    if (this.inLava) speed = SWIM * 0.55;
    if (!this.onGround && !this.inWater && !this.inLava) speed *= 1.0;

    // world-space wish direction
    let wx = 0, wz = 0;
    if (moving) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      wx = strafe * c + fwd * s;
      wz = strafe * s - fwd * c;
      const len = Math.hypot(wx, wz) || 1;
      wx = wx / len * speed; wz = wz / len * speed;
    }

    const accel = this.onGround ? 0.42 : (this.inWater || this.inLava ? 0.18 : 0.085);
    this.vx += (wx - this.vx) * accel;
    this.vz += (wz - this.vz) * accel;

    if (input.jump) {
      if (this.onLadder) this.vy = 0.16;
      else if (this.inWater || this.inLava) this.vy = Math.min(this.vy + 0.04, 0.16);
      else if (this.onGround) {
        this.vy = JUMP;
        if (this.sprinting) { this.vx += Math.sin(this.yaw) * 0.16; this.vz += -Math.cos(this.yaw) * 0.16; }
        this.addExhaustion(this.sprinting ? 0.2 : 0.05);
      }
    }
    if (this.onLadder && !input.jump && !this.onGround) {
      this.vy = Math.max(this.vy, input.sneak ? 0 : -0.12);
    }
    this.swimming = this.inWater && this.submerged;
  }

  applyPhysics() {
    const w = this.world;
    if (this.inWater) { this.vy -= WATER_GRAVITY; this.vy *= 0.80; this.vx *= 0.89; this.vz *= 0.89; }
    else if (this.inLava) { this.vy -= WATER_GRAVITY; this.vy *= LAVA_DRAG; this.vx *= LAVA_DRAG; this.vz *= LAVA_DRAG; }
    else { this.vy -= GRAVITY; this.vy *= DRAG; }
    if (this.vy < -3.92) this.vy = -3.92;

    const startX = this.x, startZ = this.z;
    setBoxAt(this.box, this.x, this.y, this.z, PW, PH);

    // sneaking at a ledge: refuse horizontal movement that would leave ground
    let dx = this.vx, dz = this.vz;
    if (this.sneaking && this.onGround) {
      const probe = { ...this.box };
      const supported = (ox, oz) => {
        const b = { x0: probe.x0 + ox, y0: probe.y0 - 0.55, z0: probe.z0 + oz, x1: probe.x1 + ox, y1: probe.y0 - 0.05, z1: probe.z1 + oz };
        return boxCollides(w, b);
      };
      if (dx !== 0 && !supported(dx, 0)) dx = 0;
      if (dz !== 0 && !supported(0, dz)) dz = 0;
      if (dx !== 0 && dz !== 0 && !supported(dx, dz)) { dx = 0; dz = 0; }
    }

    const before = { ...this.box };
    const res = moveBox(w, this.box, { x: dx, y: this.vy, z: dz });

    // auto step-up: retry the blocked horizontal move from a raised position
    const stepH = CONFIG.stepHeight ?? 0.6;
    if ((res.hitX || res.hitZ) && (this.onGround || res.onGround) && this.vy <= 0 && stepH > 0) {
      const trial = { ...before };
      const up = moveBox(w, trial, { x: 0, y: stepH, z: 0 });
      if (up.y > 0.001) {
        const step = moveBox(w, trial, { x: dx, y: 0, z: dz });
        const gained = Math.hypot(step.x, step.z) - Math.hypot(res.x, res.z);
        if (gained > 0.0005) {
          moveBox(w, trial, { x: 0, y: -stepH, z: 0 });
          this.box = trial;
          res.x = this.box.x0 + PW / 2 - startX;
          res.z = this.box.z0 + PW / 2 - startZ;
          res.hitX = false; res.hitZ = false;
        }
      }
    }

    this.x = (this.box.x0 + this.box.x1) / 2;
    this.y = this.box.y0;
    this.z = (this.box.z0 + this.box.z1) / 2;

    if (res.hitX) this.vx = 0;
    if (res.hitZ) this.vz = 0;
    if (res.hitY) {
      if (this.vy < 0) {
        this.onGround = true;
        this.handleFall();
      } else if (this.vy > 0) {
        this.vy = 0;
      }
      if (this.vy < 0) this.vy = 0;
    } else {
      this.onGround = false;
    }
    if (this.onGround && this.vy <= 0) this.fallDistance = 0;
    if (!this.onGround && this.vy < 0) this.fallDistance -= this.vy;
    if (this.inWater || this.inLava || this.onLadder) this.fallDistance = 0;

    // world border + void
    const B = WORLD.BORDER;
    if (this.x > B) { this.x = B; this.vx = 0; }
    if (this.x < -B) { this.x = -B; this.vx = 0; }
    if (this.z > B) { this.z = B; this.vz = 0; }
    if (this.z < -B) { this.z = -B; this.vz = 0; }

    // movement exhaustion
    const dist = Math.hypot(this.x - startX, this.z - startZ);
    if (dist > 0.0001) {
      if (this.sprinting) this.addExhaustion(0.1 * dist);
      else if (this.inWater) this.addExhaustion(0.01 * dist);
      else this.addExhaustion(0.0);
      this.stepSoundTimer += dist;
      if (this.stepSoundTimer > 1.8 && this.onGround) {
        this.stepSoundTimer = 0;
        this.game.audio.footstep(this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z)));
      }
    }
    this.bobPhase += dist * 3.2;
  }

  handleFall() {
    if (this.fallDistance > 3.0) {
      const dmg = Math.floor(this.fallDistance - 3.0);
      if (dmg > 0) {
        this.damage(dmg, 'fall');
        this.game.audio.play('hurt');
      }
    }
    this.fallDistance = 0;
  }

  // ------------------------------------------------------------- survival
  addExhaustion(v) {
    if (!difficulty().hunger) return;
    this.exhaustion += v * difficulty().hungerRate;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  tickSurvival() {
    const diff = difficulty();
    const w = this.world;

    if (!diff.hunger) { this.hunger = 20; this.saturation = Math.max(this.saturation, 5); }

    // regeneration: saturation is spent first, then plain hunger
    if (this.health < this.maxHealth && this.health > 0) {
      if (this.hunger >= 18 && this.saturation > 0) {
        this.regenTimer++;
        if (this.regenTimer >= 10) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.saturation = Math.max(0, this.saturation - 1.5);
          this.addExhaustion(1.5);
        }
      } else if (this.hunger >= 18) {
        this.regenTimer++;
        if (this.regenTimer >= 80) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.addExhaustion(3);
        }
      } else this.regenTimer = 0;
    }

    if (this.hunger <= 0 && diff.hunger) {
      this.starveTimer++;
      if (this.starveTimer >= 80) {
        this.starveTimer = 0;
        const floor = diff.id >= 3 ? 0 : (diff.id === 2 ? 1 : 10);
        if (this.health > floor) this.damage(1, 'starvation');
      }
    } else this.starveTimer = 0;

    // drowning
    if (this.submerged) {
      const helmet = this.inventory.armorSlot(0);
      this.airTimer++;
      if (this.airTimer >= 10) {
        this.airTimer = 0;
        this.air -= 10;
        if (this.air <= 0) { this.air = 0; this.damage(2, 'drowning'); }
      }
    } else if (this.air < this.maxAir) {
      this.air = Math.min(this.maxAir, this.air + 12);
    }

    // environmental damage
    if (this.inLava) { if (this.world.time % 10 === 0) this.damage(4, 'lava'); this.fireTicks = 160; }
    if (this.inFire) { if (this.world.time % 10 === 0) this.damage(1, 'fire'); this.fireTicks = 80; }
    if (this.fireTicks > 0 && !this.inWater) {
      this.fireTicks--;
      if (this.fireTicks % 20 === 0) this.damage(1, 'burning');
    } else if (this.inWater) this.fireTicks = 0;

    if (this.y < WORLD.MIN_Y - 0.5) {
      if (this.world.time % 10 === 0) this.damage(4, 'void');
    }

    // suffocation inside a solid block
    const hx = Math.floor(this.x), hy = Math.floor(this.eyeY), hz = Math.floor(this.z);
    if (isSolidCube(w.getBlock(hx, hy, hz)) && this.world.time % 10 === 0) this.damage(1, 'suffocation');

    // cactus contact
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = w.getBlock(Math.floor(this.x + dx * 0.35), Math.floor(this.y + 0.5), Math.floor(this.z + dz * 0.35));
      if (BLOCKS[id].damage && this.world.time % 10 === 0) this.damage(BLOCKS[id].damage, 'cactus');
    }
  }

  tickTimers() {
    if (this.hurtTimer > 0) this.hurtTimer--;
    if (this.hurtFlash > 0) this.hurtFlash--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.shieldCooldown > 0) this.shieldCooldown--;
    if (this.swingTime > 0) this.swingTime--;
  }

  // ------------------------------------------------------------- damage
  damage(amount, source = 'generic') {
    if (this.dead || amount <= 0) return false;
    if (this.hurtTimer > 0 && source !== 'void' && source !== 'starvation') return false;
    const diff = difficulty();
    if (source === 'mob') amount *= diff.mobDamage;

    // shield blocks frontal melee/projectile damage
    if (this.shieldRaised && (source === 'mob' || source === 'arrow') && this.shieldCooldown === 0) {
      this.shieldCooldown = 20;
      const shield = this.findShield();
      if (shield) damageItem(shield, 1);
      this.game.audio.play('shield');
      return false;
    }

    if (source !== 'starvation' && source !== 'void' && source !== 'drowning') {
      const { defense, toughness } = this.inventory.totalArmor();
      if (defense > 0) {
        const reduction = Math.min(20, defense) * 0.04;
        amount *= (1 - reduction);
        this.damageArmor(Math.max(1, Math.floor(amount / 4)));
      }
    }

    amount = Math.max(0, amount);
    this.health -= amount;
    this.hurtTimer = 10;
    this.hurtFlash = 8;
    this.addExhaustion(0.1);
    this.game.onPlayerHurt(source);
    if (this.health <= 0) { this.health = 0; this.die(source); }
    return true;
  }

  damageArmor(n) {
    for (let i = 0; i < 4; i++) {
      const s = this.inventory.armorSlot(i);
      if (!s) continue;
      if (damageItem(s, n)) this.inventory.set(ARMOR_START + i, null);
    }
  }

  findShield() {
    const off = this.inventory.offhand;
    if (off && item(off.id).tool && item(off.id).tool.type === 'shield') return off;
    const held = this.held;
    if (held && item(held.id).tool && item(held.id).tool.type === 'shield') return held;
    return null;
  }

  knockback(dx, dz, strength = 0.4) {
    const len = Math.hypot(dx, dz) || 1;
    this.vx += dx / len * strength;
    this.vz += dz / len * strength;
    this.vy = Math.max(this.vy, 0.28);
  }

  die(source) {
    this.dead = true;
    this.deathMessage = DEATH_MESSAGES[source] || 'You died.';
    this.mining = null;
    if (!CONFIG.keepInventory) {
      for (let i = 0; i < this.inventory.size; i++) {
        const s = this.inventory.get(i);
        if (!s) continue;
        this.game.dropItemAt(this.x, this.y + 0.8, this.z, s, true);
        this.inventory.set(i, null);
      }
    }
    this.game.onPlayerDeath();
  }

  respawn() {
    const p = this.bedSpawn || this.spawn;
    this.x = p.x; this.y = p.y; this.z = p.z;
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.vx = this.vy = this.vz = 0;
    this.health = this.maxHealth;
    this.hunger = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = this.maxAir;
    this.fallDistance = 0;
    this.fireTicks = 0;
    this.dead = false;
    this.hurtTimer = 20;
  }

  // -------------------------------------------------------------- sleeping
  trySleep(x, y, z) {
    const w = this.world;
    if (!w.isNight() && !w.isThundering()) return 'You can only sleep at night.';
    for (const e of w.entities) {
      if (!e.hostile || e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y, e.z - z) < 8) return 'There are monsters nearby.';
    }
    if (!isSolidCube(w.getBlock(x, y - 1, z))) return 'This bed has no floor beneath it.';
    this.bedSpawn = { x: x + 0.5, y: y + 0.1, z: z + 0.5 };
    this.sleeping = { x, y, z, ticks: 0 };
    this.vx = this.vy = this.vz = 0;
    return null;
  }

  tickSleep() {
    this.sleeping.ticks++;
    const w = this.world;
    if (this.sleeping.ticks > 20) {
      // jump to dawn
      const day = CONFIG.dayLengthTicks;
      const cur = w.time % day;
      w.time += (day - cur) % day;
      w.weather.type = 'clear';
      w.weather.target = 0;
      w.weather.ticks = 6000 + (this.rng.int(6000));
      this.wake();
    }
  }

  wake() {
    if (!this.sleeping) return;
    this.sleeping = null;
    this.riding = null;
    this.health = Math.min(this.maxHealth, this.health + 1);
  }

  // ---------------------------------------------------------------- mining
  /** The block the crosshair is on, or null. */
  target() {
    const [dx, dy, dz] = this.lookVector();
    return raycast(this.world, this.x, this.eyeY, this.z, dx, dy, dz, CONFIG.reach);
  }

  /** Break speed in progress-per-tick for the currently held tool. */
  breakSpeed(def) {
    const held = this.held;
    const it = held ? item(held.id) : null;
    let speed = 1;
    let correct = !def.needsTool;
    if (it && it.tool) {
      if (it.tool.type === def.tool) {
        speed = it.tool.speed;
        correct = it.tool.tier >= def.tier;
      } else if (it.tool.type === 'shears' && (def.leaves || def.name.includes('wool') || def.render === 'cross')) {
        speed = 5; correct = true;
      } else if (it.tool.type === 'sword' && def.web) {
        speed = 15; correct = true;
      }
    }
    if (def.needsTool && it && it.tool && it.tool.type === def.tool) correct = it.tool.tier >= def.tier;
    else if (def.needsTool && (!it || !it.tool || it.tool.type !== def.tool)) correct = false;

    const canHarvest = this.canHarvest(def);
    let time = def.hardness * (canHarvest ? 1.5 : 5.0) / speed;
    if (!this.onGround) time *= 5;
    if (this.submerged) time *= 5;
    return { perTick: time <= 0 ? 1 : 1 / (time * TPS), canHarvest };
  }

  canHarvest(def) {
    if (!def.needsTool) return true;
    const held = this.held;
    const it = held ? item(held.id) : null;
    if (!it || !it.tool) return false;
    if (it.tool.type !== def.tool) return false;
    return it.tool.tier >= def.tier;
  }

  tickMining(input) {
    if (!input.attack || this.game.uiOpen) {
      if (this.mining) { this.mining = null; this.game.onMiningStop(); }
      return;
    }
    const t = this.target();
    if (!t) { this.mining = null; return; }
    const def = BLOCKS[this.world.getBlock(t.x, t.y, t.z)];
    if (!def || def.hardness < 0) { this.mining = null; return; }

    if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z) {
      this.mining = { x: t.x, y: t.y, z: t.z, progress: 0, stage: -1 };
    }
    const { perTick } = this.breakSpeed(def);
    this.mining.progress += perTick;
    this.mining.hitFace = t.face;
    this.mining.hit = [t.px, t.py, t.pz];
    const stage = Math.min(9, Math.floor(this.mining.progress * 10));
    if (stage !== this.mining.stage) {
      this.mining.stage = stage;
      this.game.audio.dig(def, this.mining.progress);
      this.game.onMiningProgress(t, def, this.mining.progress);
    }
    // keep the arm swinging for as long as the button is held
    if (this.swingTime <= 0) this.swingTime = 7;
    if (this.mining.progress >= 1) {
      this.breakBlock(t.x, t.y, t.z);
      this.mining = null;
    }
  }

  breakBlock(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (!def || def.hardness < 0) return;
    const state = w.getState(x, y, z);
    const held = this.held;
    const it = held ? item(held.id) : null;
    const toolType = it && it.tool ? it.tool.type : null;

    const drops = blockDrops(def, state, {
      tool: toolType, rng: this.rng, canHarvest: this.canHarvest(def),
    });

    // doors and beds break as a unit
    if (def.render === 'door') {
      const upper = (state & 1) !== 0;
      w.setBlock(x, upper ? y - 1 : y + 1, z, AIR);
    }
    if (def.name === 'bed') {
      const head = (state & 1) !== 0;
      const d = DIR_VEC[(state >> 1) & 3];
      w.setBlock(head ? x - d[0] : x + d[0], y, head ? z - d[2] : z + d[2], AIR);
    }
    const be = w.getBlockEntity(x, y, z);
    if (be && be.items) {
      for (const s of be.items) if (s) this.game.dropItemAt(x + 0.5, y + 0.5, z + 0.5, s, false);
    }

    w.setBlock(x, y, z, AIR);
    this.game.onBlockBroken(x, y, z, def, drops);

    if (it && it.tool && def.hardness > 0) {
      if (damageItem(held, 1)) {
        this.inventory.set(this.inventory.selected, null);
        this.game.audio.play('break_tool');
      }
    }
    this.addExhaustion(0.005);
    this.swingTime = 6;
  }

  // ------------------------------------------------------------- attacking
  attackEntity(entity) {
    if (this.attackCooldown > 0) return;
    const held = this.held;
    const it = held ? item(held.id) : null;
    let dmg = it ? it.damage : 1;
    if (!it) dmg = 1;
    entity.damage(dmg, this);
    const dx = entity.x - this.x, dz = entity.z - this.z;
    entity.knockback(dx, dz, this.sprinting ? 0.62 : 0.42);
    this.attackCooldown = 10;
    this.swingTime = 6;
    this.addExhaustion(0.1);
    this.game.audio.play('hit');
    if (it && it.tool && (it.tool.type === 'sword' || it.tool.type === 'axe')) {
      if (damageItem(held, it.tool.type === 'sword' ? 1 : 2)) this.inventory.set(this.inventory.selected, null);
    }
  }

  // ------------------------------------------------------------------ using
  /** Right-click. Returns true when the action consumed the click. */
  use(target) {
    if (this.useCooldown > 0) return false;
    const w = this.world;
    const held = this.held;
    const it = held ? item(held.id) : null;

    // 1. interact with the targeted block (unless sneaking with an item)
    if (target) {
      const def = BLOCKS[w.getBlock(target.x, target.y, target.z)];
      if (def && def.interactive && !(this.sneaking && held)) {
        if (this.interactBlock(target, def)) { this.useCooldown = 4; return true; }
      }
      if (def && (def.render === 'door' || def.render === 'gate') && !(this.sneaking && held)) {
        this.toggleDoor(target.x, target.y, target.z, def);
        this.useCooldown = 5;
        return true;
      }
    }

    if (!held || !it) return false;

    // 2. item behaviours
    if (it.boat) return this.placeBoat(target, it);
    if (it.food && this.canEat(it)) { this.startEating(); return true; }
    if (it.tool && it.tool.type === 'shield') { this.shieldRaised = true; return true; }
    if (it.tool && it.tool.type === 'bow') { if (this.bowCharge < 0) this.bowCharge = 0; return true; }
    if (it.fluid) return this.placeFluid(target, it);
    if (it.name === 'bucket') return this.pickUpFluid(target);
    if (it.name === 'bone_meal') return this.useBoneMeal(target);
    if (it.tool && it.tool.type === 'hoe') return this.useHoe(target);
    if (it.tool && it.tool.type === 'igniter') return this.useIgniter(target);
    if (it.tool && it.tool.type === 'shears') return this.useShears(target);
    if (it.placesBed) return this.placeBed(target);
    if (it.block != null) return this.placeBlock(target, it);
    return false;
  }

  interactBlock(target, def) {
    const { x, y, z } = target;
    switch (def.interactive) {
      case 'crafting': this.game.openCrafting(x, y, z); return true;
      case 'furnace': this.game.openFurnace(x, y, z); return true;
      case 'chest': this.game.openChest(x, y, z); return true;
      case 'sign': {
        const be = this.world.getBlockEntity(x, y, z);
        if (be) this.game.openSignEditor(be);
        return true;
      }
      case 'bed': {
        const state = this.world.getState(x, y, z);
        const head = (state & 1) !== 0;
        const d = DIR_VEC[(state >> 1) & 3];
        const hx = head ? x : x + d[0], hz = head ? z : z + d[2];
        const err = this.trySleep(hx, y, hz);
        if (err) this.game.toast(err);
        return true;
      }
      default: return false;
    }
  }

  toggleDoor(x, y, z, def) {
    const w = this.world;
    let state = w.getState(x, y, z);
    if (def.render === 'door') {
      const upper = (state & 1) !== 0;
      const by = upper ? y - 1 : y;
      const lower = w.getState(x, by, z);
      const upperS = w.getState(x, by + 1, z);
      w.setState(x, by, z, lower ^ 2);
      w.setState(x, by + 1, z, upperS ^ 2);
    } else {
      w.setState(x, y, z, state ^ 4);
    }
    this.game.audio.play('door');
  }

  // ------------------------------------------------------------- placement
  placeBlock(target, it) {
    if (!target) return false;
    const w = this.world;
    const def = BLOCKS[it.block];
    let { x, y, z } = target;
    const face = target.face;
    const targetDef = BLOCKS[w.getBlock(x, y, z)];
    // place into the targeted block itself when it is replaceable (grass, water)
    if (!targetDef.replaceable) {
      const n = FACE_OFFSET[face];
      x += n[0]; y += n[1]; z += n[2];
    }
    if (y < WORLD.MIN_Y || y >= WORLD.MAX_Y) return false;
    if (Math.abs(x) > WORLD.BORDER || Math.abs(z) > WORLD.BORDER) {
      this.game.toast('You have reached the edge of the world.');
      return false;
    }
    const existing = BLOCKS[w.getBlock(x, y, z)];
    if (!existing.replaceable) return false;

    const state = this.stateForPlacement(def, x, y, z, face, target);
    if (state < 0) return false;
    // refuse placements that would immediately pop off (torch on sand-less air,
    // sugar cane away from water, crops off farmland)
    if (def.supportNeeded && !w.supportOK(x, y, z, def, state)) return false;

    // never place inside the player or a mob
    if (def.solid) {
      const box = { x0: x, y0: y, z0: z, x1: x + 1, y1: y + 1, z1: z + 1 };
      setBoxAt(this.box, this.x, this.y, this.z, PW, PH);
      if (overlapBox(box, this.box)) return false;
      for (const e of w.entities) {
        if (e.dead || e.type === 'item') continue;
        if (overlapBox(box, e.boundingBox())) return false;
      }
    }

    if (!w.setBlock(x, y, z, def.id, state)) return false;

    // second half of multi-block placements
    if (def.render === 'door') {
      if (!w.setBlock(x, y + 1, z, def.id, state | 1)) { w.setBlock(x, y, z, AIR); return false; }
    }
    if (def.entity) {
      const data = { x, y, z, type: def.entity };
      if (def.entity === 'chest') data.items = new Array(27).fill(null);
      if (def.entity === 'sign') data.lines = ['', '', '', ''];
      if (def.entity === 'furnace') data.input = null, data.fuel = null, data.output = null, data.cook = 0, data.burn = 0, data.burnMax = 0;
      w.setBlockEntity(x, y, z, data);
      if (def.entity === 'sign') this.game.openSignEditor(data);
    }

    this.inventory.consumeHeld(1);
    this.game.audio.place(def);
    this.useCooldown = 4;
    this.swingTime = 6;
    return true;
  }

  stateForPlacement(def, x, y, z, face, target) {
    const w = this.world;
    const f = this.facing().index;                 // 0 N, 1 E, 2 S, 3 W
    const opposite = (f + 2) & 3;
    switch (def.render) {
      case 'pillar': return face === 2 || face === 3 ? 0 : (face === 0 || face === 1 ? 1 : 2);
      case 'facing': return opposite;
      case 'chest': return opposite;
      case 'slab': {
        if (face === 3) return 0;
        if (face === 2) return 1;
        return (target.py - Math.floor(target.py)) > 0.5 ? 1 : 0;
      }
      case 'stairs': {
        const top = face === 2 || (face !== 3 && (target.py - Math.floor(target.py)) > 0.5);
        return f | (top ? 4 : 0);
      }
      case 'door': {
        if (!isSolidCube(w.getBlock(x, y - 1, z)) && BLOCKS[w.getBlock(x, y - 1, z)].render !== 'slab') return -1;
        if (!BLOCKS[w.getBlock(x, y + 1, z)].replaceable) return -1;
        return (f << 2);
      }
      case 'torch': {
        if (face === 3 || face === 2) {
          if (!isSolidCube(w.getBlock(x, y - 1, z))) return -1;
          return 0;
        }
        const attach = face === 4 ? 3 : face === 5 ? 1 : face === 0 ? 2 : 4;
        return attach;
      }
      case 'ladder': {
        if (face === 2 || face === 3) return -1;
        // state = the direction the ladder faces, i.e. away from its wall:
        // hitting a block's -Z face puts the ladder at z-1 facing -Z (dir 0).
        return face === 0 ? 3 : face === 1 ? 1 : face === 4 ? 0 : 2;
      }
      case 'gate': return f;
      case 'sign': return f;
      case 'crop': return 0;
      default: return 0;
    }
  }

  placeBed(target) {
    if (!target) return false;
    const w = this.world;
    const n = FACE_OFFSET[target.face];
    const x = target.x + n[0], y = target.y + n[1], z = target.z + n[2];
    if (!BLOCKS[w.getBlock(x, y, z)].replaceable) return false;
    const f = this.facing().index;
    const d = DIR_VEC[f];
    const hx = x + d[0], hz = z + d[2];
    if (!BLOCKS[w.getBlock(hx, y, hz)].replaceable) return false;
    if (!isSolidCube(w.getBlock(x, y - 1, z)) || !isSolidCube(w.getBlock(hx, y - 1, hz))) return false;
    const bed = blockId('bed');
    w.setBlock(x, y, z, bed, (f << 1));
    w.setBlock(hx, y, hz, bed, (f << 1) | 1);
    this.inventory.consumeHeld(1);
    this.useCooldown = 4;
    return true;
  }

  placeBoat(target, it) {
    if (!target) return false;
    const w = this.world;
    const n = FACE_OFFSET[target.face];
    const x = target.x + n[0], y = target.y + n[1], z = target.z + n[2];
    const on = BLOCKS[w.getBlock(target.x, target.y, target.z)];
    if (!on.liquid && !on.solid) return false;
    this.game.spawnBoat(x + 0.5, y + (on.liquid ? 0.1 : 0), z + 0.5, it.boat);
    this.inventory.consumeHeld(1);
    this.useCooldown = 6;
    this.game.audio.play('splash');
    return true;
  }

  useIgniterOnBlock(target) {
    const w = this.world;
    if (!target) return false;
    if (BLOCKS[w.getBlock(target.x, target.y, target.z)].name !== 'tnt') return false;
    w.setBlock(target.x, target.y, target.z, AIR);
    this.game.primeTNT(target.x, target.y, target.z);
    const held = this.held;
    if (held && item(held.id).tool) { if (damageItem(held, 1)) this.inventory.set(this.inventory.selected, null); }
    this.useCooldown = 8;
    this.game.audio.play('fuse');
    return true;
  }

  placeFluid(target, it) {
    if (!target) return false;
    const w = this.world;
    const n = FACE_OFFSET[target.face];
    let x = target.x, y = target.y, z = target.z;
    if (!BLOCKS[w.getBlock(x, y, z)].replaceable) { x += n[0]; y += n[1]; z += n[2]; }
    if (!BLOCKS[w.getBlock(x, y, z)].replaceable) return false;
    w.setBlock(x, y, z, blockId(it.fluid), 0);
    w.scheduleFluid(x, y, z, 2);
    this.inventory.set(this.inventory.selected, mkStack(itemByName('bucket').id, 1));
    this.useCooldown = 6;
    this.game.audio.play('splash');
    return true;
  }

  pickUpFluid(target) {
    if (!target) return false;
    const w = this.world;
    const [dx, dy, dz] = this.lookVector();
    // buckets need to hit the fluid itself, which the block raycast skips
    const hit = raycastFluid(w, this.x, this.eyeY, this.z, dx, dy, dz, CONFIG.reach);
    if (!hit) return false;
    const id = w.getBlock(hit.x, hit.y, hit.z);
    if (w.getState(hit.x, hit.y, hit.z) !== 0) return false;   // sources only
    const name = id === WATER ? 'water_bucket' : id === LAVA ? 'lava_bucket' : null;
    if (!name) return false;
    w.setBlock(hit.x, hit.y, hit.z, AIR);
    w.scheduleFluidAround(hit.x, hit.y, hit.z);
    this.inventory.consumeHeld(1);
    const left = this.inventory.pickUp(mkStack(itemByName(name).id, 1));
    if (left) this.game.dropItemAt(this.x, this.y + 1, this.z, left, false);
    this.useCooldown = 6;
    return true;
  }

  useHoe(target) {
    if (!target) return false;
    const w = this.world;
    const id = w.getBlock(target.x, target.y, target.z);
    if (id !== GRASS && id !== DIRT && id !== blockId('coarse_dirt')) return false;
    if (BLOCKS[w.getBlock(target.x, target.y + 1, target.z)].opacity >= 15) return false;
    w.setBlock(target.x, target.y, target.z, FARMLAND, 0);
    const held = this.held;
    if (damageItem(held, 1)) this.inventory.set(this.inventory.selected, null);
    this.useCooldown = 6;
    this.game.audio.play('till');
    return true;
  }

  useIgniter(target) {
    if (!target) return false;
    if (this.useIgniterOnBlock(target)) return true;
    const w = this.world;
    const n = FACE_OFFSET[target.face];
    const x = target.x + n[0], y = target.y + n[1], z = target.z + n[2];
    if (!BLOCKS[w.getBlock(x, y, z)].replaceable) return false;
    w.setBlock(x, y, z, FIRE, 0);
    const held = this.held;
    if (damageItem(held, 1)) this.inventory.set(this.inventory.selected, null);
    this.useCooldown = 8;
    this.game.audio.play('ignite');
    return true;
  }

  useShears(target) {
    if (!target) return false;
    const w = this.world;
    const def = BLOCKS[w.getBlock(target.x, target.y, target.z)];
    if (!def.leaves && def.render !== 'cross' && def.render !== 'tall_cross') return false;
    this.breakBlock(target.x, target.y, target.z);
    return true;
  }

  useBoneMeal(target) {
    if (!target) return false;
    const w = this.world;
    const { x, y, z } = target;
    const id = w.getBlock(x, y, z);
    const def = BLOCKS[id];
    let used = false;

    if (def.maxAge !== undefined) {
      const state = w.getState(x, y, z);
      const age = state & 7;
      if (age < def.maxAge) {
        w.setState(x, y, z, (state & ~7) | Math.min(def.maxAge, age + 2 + this.rng.int(3)));
        used = true;
      }
    } else if (def.name.endsWith('_sapling')) {
      const wood = def.name.replace('_sapling', '');
      if (growTree(w, x, y, z, wood, this.rng)) used = true;
    } else if (id === GRASS) {
      // bloom grass and flowers on the surrounding ground
      for (let n = 0; n < 24; n++) {
        const nx = x + this.rng.int(7) - 3, nz = z + this.rng.int(7) - 3;
        const ny = w.topSolid(nx, nz) + 1;
        if (w.getBlock(nx, ny, nz) !== AIR) continue;
        if (w.getBlock(nx, ny - 1, nz) !== GRASS) continue;
        const roll = this.rng.float();
        if (roll < 0.12) w.setBlock(nx, ny, nz, blockId(this.rng.pick(['dandelion', 'poppy', 'cornflower', 'oxeye_daisy', 'azure_bluet'])), 0);
        else w.setBlock(nx, ny, nz, blockId('short_grass'), 0);
        used = true;
      }
    }
    if (used) {
      this.inventory.consumeHeld(1);
      this.game.spawnParticles(x + 0.5, y + 0.7, z + 0.5, 12, 0x88ff88);
      this.useCooldown = 4;
    }
    return used;
  }

  // ------------------------------------------------------------------ food
  canEat(it) {
    if (it.food.milk) return true;
    return this.hunger < 20 || it.name === 'golden_apple';
  }

  startEating() {
    if (this.eating > 0) return;
    this.eating = 32;
    this.eatingSlot = this.inventory.selected;
  }

  tickEating(input) {
    if (this.eating <= 0) return;
    const held = this.held;
    if (!input.use || !held || this.inventory.selected !== this.eatingSlot) { this.eating = 0; return; }
    this.eating--;
    if (this.eating % 4 === 0) this.game.audio.play('eat');
    if (this.eating <= 0) this.finishEating();
  }

  finishEating() {
    const held = this.held;
    if (!held) return;
    const it = item(held.id);
    if (!it || !it.food) return;
    if (!it.food.milk) {
      this.hunger = Math.min(20, this.hunger + it.food.hunger);
      this.saturation = Math.min(this.hunger, this.saturation + it.food.saturation);
    }
    this.inventory.consumeHeld(1);
    if (it.container) {
      const left = this.inventory.pickUp(mkStack(itemByName(it.container).id, 1));
      if (left) this.game.dropItemAt(this.x, this.y + 1, this.z, left, false);
    }
    if (it.name === 'milk_bucket') {
      const left = this.inventory.pickUp(mkStack(itemByName('bucket').id, 1));
      if (left) this.game.dropItemAt(this.x, this.y + 1, this.z, left, false);
    }
    if (it.food.poison && this.rng.chance(0.8)) this.addExhaustion(4);
    this.game.audio.play('burp');
  }

  // ------------------------------------------------------------------- bow
  releaseBow() {
    if (this.bowCharge < 0) return;
    const charge = Math.min(1, this.bowCharge / 20);
    this.bowCharge = -1;
    if (charge < 0.15) return;
    if (!this.inventory.has(itemByName('arrow').id, 1)) return;
    this.inventory.remove(itemByName('arrow').id, 1);
    const [dx, dy, dz] = this.lookVector();
    this.game.spawnArrow(this.x, this.eyeY - 0.1, this.z, dx, dy, dz, 1.6 + charge * 1.6, this);
    const held = this.held;
    if (held && item(held.id).tool) { if (damageItem(held, 1)) this.inventory.set(this.inventory.selected, null); }
    this.game.audio.play('bow');
  }

  toJSON() {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch,
      health: this.health, hunger: this.hunger, saturation: this.saturation,
      exhaustion: this.exhaustion, air: this.air,
      inventory: this.inventory.toJSON(), selected: this.inventory.selected,
      spawn: this.spawn, bedSpawn: this.bedSpawn,
    };
  }
}

const FACE_OFFSET = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

const DEATH_MESSAGES = {
  fall: 'You hit the ground too hard.',
  drowning: 'You drowned.',
  lava: 'You tried to swim in lava.',
  fire: 'You went up in flames.',
  burning: 'You burned to death.',
  starvation: 'You starved to death.',
  void: 'You fell out of the world.',
  suffocation: 'You suffocated in a wall.',
  cactus: 'You were pricked to death.',
  mob: 'You were slain.',
  arrow: 'You were shot.',
  explosion: 'You were blown up.',
  generic: 'You died.',
};

function overlapBox(a, b) {
  return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1 && a.z1 > b.z0 && a.z0 < b.z1;
}

/** Like raycast(), but stops on fluid source blocks (for buckets). */
function raycastFluid(world, ox, oy, oz, dx, dy, dz, maxDist) {
  const step = 0.1;
  for (let t = 0; t < maxDist; t += step) {
    const x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
    const id = world.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (def.liquid) return { x, y, z };
    if (def.solid && def.cube) return null;
  }
  return null;
}
