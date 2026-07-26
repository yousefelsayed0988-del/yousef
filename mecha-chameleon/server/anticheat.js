// Anti-cheat. Pure functions over state - no sockets, no timers - so every
// rule here can be unit-tested headlessly.
//
// The load-bearing idea is that the server never trusts a position or a hit.
// Movement is re-simulated here from inputs; shots are re-cast from the
// server's own view of the world; and, most importantly, a hider is not
// serialised to a hunter that cannot see them, so a rendering cheat has no
// data to work with.
//
// Second principle: a guard that punishes lag is worse than no guard. Where a
// legitimate client could plausibly produce a value, we clamp it and move on.
// Strikes are for things honest play cannot do.

import { ANTICHEAT, MOVE, GUNS, Role } from '../shared/constants.js';
import { capsuleOverlaps, raycast, lineOfSight } from '../shared/collision.js';
import { clamp, DEG } from '../shared/math.js';

/** Token bucket. Returns true when a unit was available. */
export function createRateLimiter(perSecond, burst = perSecond * 2) {
  let tokens = burst;
  let last = -Infinity;
  return {
    take(now, cost = 1) {
      if (last === -Infinity) last = now;
      tokens = Math.min(burst, tokens + (now - last) * perSecond);
      last = now;
      if (tokens < cost) return false;
      tokens -= cost;
      return true;
    },
    get level() { return tokens; },
  };
}

function acState(player, now) {
  if (!player.ac) {
    player.ac = {
      strikes: 0,
      lastStrikeAt: now,
      violations: [],
      // Movement time budget: how much simulated time this player is allowed
      // to claim, refilled from the real clock.
      budget: 0.35,
      budgetAt: now,
      moveWindow: [],
      lastSeq: -1,
      shotBucket: null,
      aimHistory: [],
      aimSnapStreak: 0,
      lastYaw: player.yaw || 0,
      lastPitch: player.pitch || 0,
      pvs: new Map(),
      flags: new Set(),
    };
  }
  return player.ac;
}

export function createGuard(world, opts = {}) {
  const cfg = { ...ANTICHEAT, ...opts };
  let pvsTick = 0;

  // ------------------------------------------------------------ strikes --
  function strike(player, reason, weight = 1, now = 0) {
    const ac = acState(player, now);
    decay(ac, now);
    ac.strikes += weight;
    ac.lastStrikeAt = now;
    ac.flags.add(reason);
    ac.violations.push({ reason, weight, at: now });
    if (ac.violations.length > 40) ac.violations.shift();
    return ac.strikes;
  }

  function decay(ac, now) {
    const dt = Math.max(0, now - ac.lastStrikeAt);
    if (dt > 0 && ac.strikes > 0) {
      ac.strikes = Math.max(0, ac.strikes - dt * cfg.strikeDecayPerSecond);
      ac.lastStrikeAt = now;
    }
  }

  function shouldKick(player, now) {
    const ac = acState(player, now);
    decay(ac, now);
    return ac.strikes >= cfg.kickStrikes;
  }

  function report(player) {
    const ac = player.ac;
    if (!ac) return { strikes: 0, violations: [], flags: [] };
    return {
      strikes: Math.round(ac.strikes * 100) / 100,
      violations: ac.violations.slice(-8),
      flags: [...ac.flags],
    };
  }

  function rateLimit(conn, kind, now, perSecond = 30, burst = perSecond * 2) {
    if (!conn._acBuckets) conn._acBuckets = new Map();
    let bucket = conn._acBuckets.get(kind);
    if (!bucket) {
      bucket = createRateLimiter(perSecond, burst);
      conn._acBuckets.set(kind, bucket);
    }
    return bucket.take(now);
  }

  // -------------------------------------------------------------- inputs --
  function checkInput(player, input, now) {
    const ac = acState(player, now);

    if (!input || typeof input !== 'object') {
      return { ok: false, reason: 'input_shape', strike: 1 };
    }

    const finite = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!finite(input.dt) || !finite(input.yaw) || !finite(input.pitch) ||
      !finite(input.mx) || !finite(input.mz) || !finite(input.seq)) {
      // NaN injection is a classic way to poison a physics step.
      return { ok: false, reason: 'input_nan', strike: 2 };
    }

    const seq = Math.round(input.seq);
    if (seq <= ac.lastSeq) return { ok: false, reason: 'input_replay', strike: 0 };
    if (seq > ac.lastSeq + 2000) {
      // A gigantic jump is either a reconnect or an attempt to skip ahead.
      ac.lastSeq = seq - 1;
    }

    const clamped = {
      seq,
      dt: clamp(input.dt, MOVE.minInputDt, MOVE.maxInputDt),
      yaw: input.yaw,
      pitch: clamp(input.pitch, -89 * DEG, 89 * DEG),
      mx: clamp(input.mx, -1, 1),
      mz: clamp(input.mz, -1, 1),
      buttons: (input.buttons | 0) & 0xff,
    };

    const mag = Math.hypot(clamped.mx, clamped.mz);
    if (mag > 1.0001) {
      // Diagonal-speed hacks send (1,1); normalise instead of rejecting, since
      // a legitimate analogue stick can land a hair over 1.
      clamped.mx /= mag;
      clamped.mz /= mag;
      if (mag > 1.6) strike(player, 'input_move_magnitude', 0.5, now);
    }

    // Time budget - the speedhack / time-warp defence. Inputs may only claim
    // as much simulated time as has actually elapsed, plus a burst for jitter.
    ac.budget = Math.min(cfg.maxInputBudget ?? 0.75, ac.budget + (now - ac.budgetAt));
    ac.budgetAt = now;
    // The slack here has to be far smaller than a frame. At 30 ms it silently
    // granted a free tick to anyone whose budget was merely close, which let a
    // speedhack through at several times real time; jitter only needs epsilon,
    // and a genuine stall is already covered by the 0.75 s burst.
    if (clamped.dt > ac.budget + 0.002) {
      const granted = Math.max(0, ac.budget);
      if (granted < MOVE.minInputDt) {
        strike(player, 'time_warp', 0.75, now);
        return { ok: false, reason: 'time_warp', strike: 0, clamped };
      }
      strike(player, 'time_warp', 0.4, now);
      clamped.dt = granted;
    }
    ac.budget = Math.max(0, ac.budget - clamped.dt);
    ac.lastSeq = seq;

    // Aim-snap heuristic: a human mouse does not teleport every frame. This
    // only ever raises a flag - it is evidence, never grounds for a kick.
    const dYaw = Math.abs(angleDiff(clamped.yaw, ac.lastYaw)) / DEG;
    if (dYaw > cfg.aimSnapDegrees) {
      ac.aimSnapStreak++;
      if (ac.aimSnapStreak >= cfg.aimSnapStreak) {
        ac.flags.add('aim_snap');
        ac.aimSnapStreak = 0;
      }
    } else if (ac.aimSnapStreak > 0) {
      ac.aimSnapStreak--;
    }
    ac.lastYaw = clamped.yaw;
    ac.lastPitch = clamped.pitch;
    ac.aimHistory.push({ t: now, yaw: clamped.yaw, pitch: clamped.pitch });
    while (ac.aimHistory.length && now - ac.aimHistory[0].t > cfg.aimSnapWindow) ac.aimHistory.shift();

    return { ok: true, clamped };
  }

  // ---------------------------------------------------------------- moves --
  /**
   * Called after the server has re-simulated the move itself. `after` is
   * therefore the server's own answer, not a client claim - what this catches
   * is time-warp that slipped past the budget (measured over a window so a
   * single laggy tick cannot trip it), our own physics tunnelling, and any NaN
   * that made it through.
   */
  function afterMove(player, before, after, input, now) {
    const ac = acState(player, now);

    if (!Number.isFinite(after.x) || !Number.isFinite(after.y) || !Number.isFinite(after.z)) {
      return { ok: false, reason: 'position_nan', strike: 3, correct: before };
    }

    const dx = after.x - before.x, dy = after.y - before.y, dz = after.z - before.z;
    const horiz = Math.hypot(dx, dz);
    const dt = Math.max(input.dt, MOVE.minInputDt);

    // Sliding window: honest movement can spike for one tick after a stall,
    // but it cannot hold an illegal average.
    ac.moveWindow.push({ t: now, horiz, vert: Math.abs(dy), dt });
    while (ac.moveWindow.length && now - ac.moveWindow[0].t > 0.6) ac.moveWindow.shift();
    let sumDist = 0, sumTime = 0;
    for (const s of ac.moveWindow) { sumDist += s.horiz; sumTime += s.dt; }

    const cap = MOVE.maxHorizSpeed * cfg.speedTolerance * (player.speedMul || 1);
    if (sumTime > 0.25) {
      const avg = sumDist / sumTime;
      if (avg > cap) {
        strike(player, 'speed', Math.min(3, (avg / cap - 1) * 4), now);
        return {
          ok: false,
          reason: `speed ${avg.toFixed(1)} > ${cap.toFixed(1)} m/s`,
          strike: 0,
          correct: before,
        };
      }
    }

    // Single-tick absurdity: a teleport, or physics that tunnelled.
    if (horiz > cap * dt + 1.2) {
      strike(player, 'teleport', 2, now);
      return { ok: false, reason: `tick jump ${horiz.toFixed(2)}m`, strike: 0, correct: before };
    }
    if (Math.abs(dy) > MOVE.maxVertSpeed * dt + 1.5) {
      strike(player, 'vertical', 1.5, now);
      return { ok: false, reason: `vertical jump ${dy.toFixed(2)}m`, strike: 0, correct: before };
    }

    // Did we end up inside the level? Our own solver should never allow it, so
    // this is a canary on the physics as much as on the player.
    const height = MOVE.height[player.stance ?? 0];
    if (capsuleOverlaps(world, after.x, after.y + 0.02, after.z, MOVE.radius * 0.82, height * 0.9)) {
      return { ok: false, reason: 'inside_geometry', strike: 0.25, correct: before };
    }

    // A move long enough to cross a wall gets a line-of-sight check at hip
    // height. Short moves are skipped: stair treads legitimately break a
    // ground-level sight line.
    if (horiz > 0.9) {
      const a = { x: before.x, y: before.y + 0.9, z: before.z };
      const b = { x: after.x, y: after.y + 0.9, z: after.z };
      if (!lineOfSight(world, a, b, { slack: 0.02 })) {
        strike(player, 'noclip', 2, now);
        return { ok: false, reason: 'moved through geometry', strike: 0, correct: before };
      }
    }

    return { ok: true };
  }

  // ---------------------------------------------------------------- shots --
  /**
   * `opts.canHit(other)` decides who counts as a target - the match owns that
   * rule, because in versus mode everybody is fair game and in the team modes
   * only hiders are.
   */
  function checkShot(player, shot, now, players, opts2 = {}) {
    const canHit = opts2.canHit || ((o) => o.role === Role.HIDER);
    const ac = acState(player, now);
    const gun = GUNS[player.gun] || GUNS.standard;

    if (player.reloadEnd && now < player.reloadEnd) {
      return { ok: false, reason: 'shot_while_reloading', strike: 0.25 };
    }
    if ((player.ammo | 0) <= 0) {
      return { ok: false, reason: 'shot_without_ammo', strike: 0.5 };
    }

    // Fire rate, from the gun's own cadence with a little slack for jitter.
    const interval = (60 / gun.rpm) * cfg.fireRateTolerance;
    if (now - (player.lastShotAt ?? -99) < interval) {
      strike(player, 'fire_rate', 0.6, now);
      return { ok: false, reason: 'fire_rate', strike: 0 };
    }
    if (!ac.shotBucket) ac.shotBucket = createRateLimiter(gun.rpm / 60 + 1, 6);
    if (!ac.shotBucket.take(now)) {
      strike(player, 'fire_rate_burst', 1, now);
      return { ok: false, reason: 'fire_rate_burst', strike: 0 };
    }

    // Where does the SERVER think this player is looking?
    const viewDir = dirFrom(player.yaw, player.pitch);
    let dir = viewDir;
    if (Array.isArray(shot?.dir) && shot.dir.length === 3 && shot.dir.every(Number.isFinite)) {
      const len = Math.hypot(shot.dir[0], shot.dir[1], shot.dir[2]);
      if (len > 0.001) {
        const claimed = { x: shot.dir[0] / len, y: shot.dir[1] / len, z: shot.dir[2] / len };
        const dot = clamp(claimed.x * viewDir.x + claimed.y * viewDir.y + claimed.z * viewDir.z, -1, 1);
        const offBy = Math.acos(dot) / DEG;
        // Beyond this the client is shooting somewhere it is not looking.
        const allowed = 25 + gun.spread;
        if (offBy > allowed) {
          strike(player, 'aim_mismatch', 1.5, now);
          return { ok: false, reason: `aim ${offBy.toFixed(0)} deg off view`, strike: 0 };
        }
        dir = claimed;
      }
    }

    const eye = { x: player.pos.x, y: player.pos.y + MOVE.eye[player.stance ?? 0], z: player.pos.z };

    // The world stops the bullet first.
    const wall = raycast(world, eye, dir, gun.range, { opaqueOnly: false });
    const maxT = wall.hit ? wall.t : gun.range;

    // Then whoever the server itself hits - never the id the client named.
    let hitId = null;
    let hitT = maxT;
    for (const other of players.values()) {
      if (other.id === player.id || !other.alive) continue;
      if (!canHit(other)) continue;
      const h = MOVE.height[other.stance ?? 0];
      const t = rayCapsule(eye, dir, other.pos, h, MOVE.radius + 0.12, hitT);
      if (t != null && t < hitT) { hitT = t; hitId = other.id; }
    }

    const point = { x: eye.x + dir.x * hitT, y: eye.y + dir.y * hitT, z: eye.z + dir.z * hitT };

    // Evidence gathering: a client that keeps naming a victim the server does
    // not hit is worth a flag, though latency alone explains a few.
    if (shot?.target != null && shot.target !== hitId) {
      ac.badTargetClaims = (ac.badTargetClaims || 0) + 1;
      if (ac.badTargetClaims > 12) ac.flags.add('claims_phantom_hits');
    }

    return { ok: true, hitId, point, dist: hitT };
  }

  // ----------------------------------------------------------------- PVS --
  /**
   * Can `seeker` plausibly see `target` right now? This decides whether the
   * target is put in the seeker's snapshot at all, so a false positive is a
   * wallhack and a false negative is an invisible player.
   */
  function visibleTo(seeker, target, now) {
    if (!cfg.pvsEnabled) return true;
    if (!seeker || !target || !target.alive) return false;

    const ac = acState(seeker, now);
    const key = target.id;
    const cached = ac.pvs.get(key);
    if (cached && cached.tick === pvsTick) return cached.value;

    const value = computeVisible(seeker, target, now, cached);
    ac.pvs.set(key, {
      tick: pvsTick,
      value,
      lastTrue: value ? now : (cached?.lastTrue ?? -Infinity),
    });
    return value;
  }

  function computeVisible(seeker, target, now, cached) {
    const eye = { x: seeker.pos.x, y: seeker.pos.y + MOVE.eye[seeker.stance ?? 0], z: seeker.pos.z };
    const dx = target.pos.x - eye.x, dz = target.pos.z - eye.z;
    const flat = Math.hypot(dx, dz);
    const height = MOVE.height[target.stance ?? 0];

    // Point blank: always send, so a hider you are standing on never vanishes.
    if (flat <= cfg.pvsRadius) return true;
    if (flat > 110) return false;

    const view = dirFrom(seeker.yaw, seeker.pitch);
    const toTarget = {
      x: target.pos.x - eye.x,
      y: target.pos.y + height * 0.5 - eye.y,
      z: target.pos.z - eye.z,
    };
    const len = Math.hypot(toTarget.x, toTarget.y, toTarget.z) || 1;
    const dot = (toTarget.x * view.x + toTarget.y * view.y + toTarget.z * view.z) / len;
    const halfFov = Math.cos((cfg.pvsFovDegrees / 2) * DEG);
    const inFov = dot >= halfFov;

    let visible = false;
    if (inFov) {
      // Sample the target's silhouette at a few heights: a head poking over a
      // crate has to be sent, a fully covered body must not be.
      for (const frac of cfg.pvsRayHeights) {
        const point = {
          x: target.pos.x,
          y: target.pos.y + height * frac,
          z: target.pos.z,
        };
        if (lineOfSight(world, eye, point, { slack: 0.12 })) { visible = true; break; }
      }
      // Also try the shoulders, so a hider edging out from behind a pillar is
      // not invisible for the half second before their centre line clears.
      if (!visible) {
        const side = { x: -toTarget.z / len, z: toTarget.x / len };
        for (const s of [-1, 1]) {
          const point = {
            x: target.pos.x + side.x * MOVE.radius * 0.8,
            y: target.pos.y + height * 0.6,
            z: target.pos.z + side.z * MOVE.radius * 0.8,
          };
          if (lineOfSight(world, eye, point, { slack: 0.12 })) { visible = true; break; }
        }
      }
    }

    // Hysteresis: keep feeding a target that was visible a moment ago so it
    // does not strobe at the edge of a doorway.
    if (!visible && cached && now - (cached.lastTrue ?? -Infinity) < cfg.pvsGrace) return true;
    return visible;
  }

  /** Call once per snapshot so the per-pair cache turns over. */
  function beginTick() { pvsTick++; }

  return {
    world,
    beginTick,
    checkInput,
    afterMove,
    checkShot,
    visibleTo,
    rateLimit,
    strike,
    shouldKick,
    report,
    createRateLimiter,
  };
}

// ------------------------------------------------------------------ maths --
function dirFrom(yaw, pitch) {
  const cp = Math.cos(pitch || 0);
  return { x: -Math.sin(yaw || 0) * cp, y: Math.sin(pitch || 0), z: -Math.cos(yaw || 0) * cp };
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Ray against an upright capsule standing on `base`. Returns the ray parameter
 * of the first hit, or null. Closest approach between the ray and the capsule's
 * core segment, plus caps at both ends.
 */
export function rayCapsule(origin, dir, base, height, radius, maxT) {
  const ax = base.x, ay = base.y + radius, az = base.z;
  const by = base.y + Math.max(height - radius, radius);

  // Core segment is vertical, which makes the closest-approach algebra small.
  const ox = origin.x - ax, oy = origin.y - ay, oz = origin.z - az;
  const segLen = by - ay;

  const dxz = dir.x * dir.x + dir.z * dir.z;
  const a = dxz;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;

  let best = null;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0 || t > maxT) continue;
        const y = oy + dir.y * t;
        if (y < 0 || y > segLen) continue;
        best = best == null ? t : Math.min(best, t);
        break;
      }
    }
  }

  // End caps: spheres at both ends of the core segment.
  for (const capY of [0, segLen]) {
    const px = ox, py = oy - capY, pz = oz;
    const bb = 2 * (px * dir.x + py * dir.y + pz * dir.z);
    const cc = px * px + py * py + pz * pz - radius * radius;
    const disc = bb * bb - 4 * cc;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [(-bb - sq) / 2, (-bb + sq) / 2]) {
      if (t < 0 || t > maxT) continue;
      best = best == null ? t : Math.min(best, t);
      break;
    }
  }

  return best;
}
