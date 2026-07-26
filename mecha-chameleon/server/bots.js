// Bot brains. They fill short lobbies and carry solo play, so a bad bot is
// somebody's whole first impression of the game.
//
// Bots get exactly the same window on the world a human client does: `ctx` is
// assembled by match.js and its `targets` are already visibility-filtered, so a
// bot literally cannot see through a wall. Everything they do goes out as an
// input record and commands, through the same validation as a human.

import { MOVE, Stance, Role, Phase, BOT, GUNS, PAINT } from '../shared/constants.js';
import { BTN } from '../shared/movement.js';
import { raycast, lineOfSight, groundHeightAt } from '../shared/collision.js';
import { getNavGraph, findPath, walkable } from '../shared/navgraph.js';
import { autoPaint, computeBlend } from '../shared/blend.js';
import { clamp, clamp01, angleDelta, dirFromAngles } from '../shared/math.js';

const SKILL = [
  // Easy -> Nightmare. Everything a bot is good or bad at hangs off these.
  { aim: 0.25, react: 1.0, paint: 0.55, nerve: 0.3, patrol: 0.5, spotQuality: 0.4 },
  { aim: 0.5, react: 0.7, paint: 0.75, nerve: 0.55, patrol: 0.7, spotQuality: 0.65 },
  { aim: 0.75, react: 0.45, paint: 0.9, nerve: 0.75, patrol: 0.85, spotQuality: 0.85 },
  { aim: 0.95, react: 0.25, paint: 1.0, nerve: 0.95, patrol: 1.0, spotQuality: 1.0 },
];

export function createBotBrain({ player, world, mapDef, difficulty = 1, rng = Math.random }) {
  const skill = SKILL[clamp(difficulty | 0, 0, 3)];

  const state = {
    goal: null,            // {x, y, z}
    path: null,            // planned waypoints from the nav graph
    pathIndex: 0,
    spot: null,            // the hiding spot we picked
    arrived: false,
    painted: false,
    lookYaw: player.yaw || rng() * Math.PI * 2,
    lookPitch: 0,
    sweepPhase: rng() * Math.PI * 2,
    stuckFor: 0,
    lastPos: { x: player.pos.x, z: player.pos.z },
    repathIn: 0,
    target: null,          // {id, pos}
    targetSince: 0,
    reaction: 0,
    fireCooldown: 0,
    patrolIndex: Math.floor(rng() * 64),
    investigating: null,
    panicUntil: 0,
    jumpCooldown: 0,
    lastPhase: -1,
  };

  // Patrol route: the map's own hiding spots make a good tour, because that is
  // exactly where the hiders are. Shuffle per bot so two hunters diverge.
  const patrol = (mapDef.hidingSpots || []).map((s) => ({ x: s.p[0], y: s.p[1], z: s.p[2] }));
  for (let i = patrol.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [patrol[i], patrol[j]] = [patrol[j], patrol[i]];
  }
  if (!patrol.length) {
    for (const s of mapDef.spawns.hiders) patrol.push({ x: s[0], y: s[1], z: s[2] });
  }

  function pickHidingSpot() {
    const spots = mapDef.hidingSpots || [];
    if (!spots.length) return null;
    const seekerSpawns = mapDef.spawns.seekers || [];
    let best = null, bestScore = -Infinity;
    // Sample rather than sort: two bots with the same rng stream should not
    // converge on the same crate.
    for (let i = 0; i < Math.min(spots.length, 26); i++) {
      const s = spots[Math.floor(rng() * spots.length)];
      const from = Math.hypot(s.p[0] - player.pos.x, s.p[2] - player.pos.z);
      let awayFromSeekers = 0;
      for (const sp of seekerSpawns) {
        awayFromSeekers += Math.min(30, Math.hypot(s.p[0] - sp[0], s.p[2] - sp[2]));
      }
      awayFromSeekers /= Math.max(1, seekerSpawns.length);
      const score = s.quality * (0.4 + skill.spotQuality)
        + awayFromSeekers * 0.02
        - from * 0.012
        + rng() * (1 - skill.spotQuality) * 0.6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /** World-space direction -> movement intent in the player's own frame. */
  function intent(wx, wz, yaw) {
    const len = Math.hypot(wx, wz);
    if (len < 1e-4) return { mx: 0, mz: 0 };
    const nx = wx / len, nz = wz / len;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return { mx: nx * cos - nz * sin, mz: nx * sin + nz * cos };
  }

  // The graph is built once per world and shared, so only the first bot on a
  // map pays for it.
  const nav = getNavGraph(world, mapDef);

  /** Plan a route. Falls back to a straight line when the graph has no answer. */
  function setGoal(goal) {
    if (!goal) { state.goal = null; state.path = null; return; }
    const same = state.goal &&
      Math.hypot(state.goal.x - goal.x, state.goal.z - goal.z) < 0.4 &&
      state.path && state.pathIndex < state.path.length;
    if (same) return;
    state.goal = { x: goal.x, y: goal.y ?? player.pos.y, z: goal.z };
    state.path = findPath(nav, player.pos, state.goal);
    state.pathIndex = 0;
    state.repathIn = 3 + rng() * 2;
    // String-pull: skip waypoints we can walk to directly, so bots cut corners
    // instead of touring every grid centre.
    if (state.path && state.path.length > 1) {
      const pulled = [];
      let from = { ...player.pos };
      for (let i = 0; i < state.path.length; i++) {
        const next = state.path[i + 1];
        if (next && walkable(world, from, next)) continue;
        pulled.push(state.path[i]);
        from = state.path[i];
      }
      state.path = pulled;
    }
  }

  /**
   * Follow the planned route, with a short-range probe fan on top so bots slide
   * around each other and around anything the graph did not know about.
   */
  function navigate(dt) {
    const goal = state.goal;
    if (!goal) return { wx: 0, wz: 0, dist: 0 };

    const goalDist = Math.hypot(goal.x - player.pos.x, goal.z - player.pos.z);

    state.repathIn -= dt;
    if (state.repathIn <= 0 && state.path && goalDist > 1.5) {
      state.path = findPath(nav, player.pos, goal) || state.path;
      state.pathIndex = 0;
      state.repathIn = 4 + rng() * 3;
    }

    // Pick the current waypoint, advancing past any we have already reached.
    let target = goal;
    if (state.path && state.path.length) {
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex];
        const d = Math.hypot(wp.x - player.pos.x, wp.z - player.pos.z);
        if (d < 0.9 && Math.abs(wp.y - player.pos.y) < 1.6) { state.pathIndex++; continue; }
        target = wp;
        break;
      }
      if (state.pathIndex >= state.path.length) target = goal;
    }

    const dx = target.x - player.pos.x;
    const dz = target.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return { wx: 0, wz: 0, dist: goalDist };

    let dirX = dx / dist, dirZ = dz / dist;

    // Local avoidance: only deviate when something is genuinely in the way.
    const eye = { x: player.pos.x, y: player.pos.y + 0.55, z: player.pos.z };
    const probe = (ax, az, reach = 1.6) => {
      const hit = raycast(world, eye, { x: ax, y: 0, z: az }, reach, {});
      return hit.hit ? hit.t : reach;
    };
    if (probe(dirX, dirZ) < 1.2) {
      let bestScore = -Infinity, bestX = dirX, bestZ = dirZ;
      for (const deg of [30, -30, 60, -60, 90, -90]) {
        const a = Math.atan2(dirZ, dirX) + deg * Math.PI / 180;
        const ax = Math.cos(a), az = Math.sin(a);
        const score = probe(ax, az) + (ax * dirX + az * dirZ) * 1.2;
        if (score > bestScore) { bestScore = score; bestX = ax; bestZ = az; }
      }
      dirX = bestX; dirZ = bestZ;
    }

    return { wx: dirX, wz: dirZ, dist: goalDist };
  }

  function trackStuck(dt) {
    const moved = Math.hypot(player.pos.x - state.lastPos.x, player.pos.z - state.lastPos.z);
    state.lastPos.x = player.pos.x;
    state.lastPos.z = player.pos.z;
    if (moved < 0.02 * Math.max(dt / (1 / 30), 0.5)) state.stuckFor += dt;
    else state.stuckFor = Math.max(0, state.stuckFor - dt * 2);
    return state.stuckFor;
  }

  // -------------------------------------------------------------- hiding --
  function thinkHider(ctx, dt, now) {
    const commands = [];
    let buttons = 0;
    let mx = 0, mz = 0;

    if (!state.spot || (ctx.phase !== state.lastPhase && ctx.phase === Phase.PREP)) {
      state.spot = pickHidingSpot();
      setGoal(state.spot ? { x: state.spot.p[0], y: state.spot.p[1], z: state.spot.p[2] } : null);
      state.arrived = false;
      state.painted = false;
    }

    // A hunter close enough to matter, in a mode where we may still move.
    const threat = ctx.targets.find((t) => t.role === Role.SEEKER);
    const threatDist = threat ? Math.hypot(threat.pos.x - player.pos.x, threat.pos.z - player.pos.z) : Infinity;

    if (ctx.phase === Phase.HUNT && threat && threatDist < 7 && now > state.panicUntil) {
      // Nerve: a good bot sits still and trusts its paint; a bad one bolts.
      if (rng() > skill.nerve) {
        state.panicUntil = now + 2.5;
        state.spot = pickHidingSpot();
        setGoal(state.spot ? { x: state.spot.p[0], y: state.spot.p[1], z: state.spot.p[2] } : null);
        state.arrived = false;
      } else {
        state.panicUntil = now + 1.5; // hold still and re-check shortly
      }
    }

    if (state.goal && !state.arrived) {
      const { wx, wz, dist } = navigate(dt);
      if (dist < 0.55) {
        state.arrived = true;
      } else {
        state.lookYaw = Math.atan2(-wx, -wz);
        const i = intent(wx, wz, state.lookYaw);
        mx = i.mx; mz = i.mz;
        if (dist > 6 && ctx.phase === Phase.PREP) buttons |= BTN.SPRINT;
        if (trackStuck(dt) > 1.2) {
          // Try a hop, then give up on this spot and choose another.
          if (state.jumpCooldown <= 0) { buttons |= BTN.JUMP; state.jumpCooldown = 1.2; }
          if (state.stuckFor > 3) {
            state.spot = pickHidingSpot();
            setGoal(state.spot ? { x: state.spot.p[0], y: state.spot.p[1], z: state.spot.p[2] } : null);
            state.stuckFor = 0;
          }
        }
      }
    }

    // Paint on arrival, and touch it up if the match says we still stand out.
    if (ctx.phase === Phase.PREP && state.arrived && !state.painted) {
      const paint = autoPaint(world, player.pos, rng, skill.paint);
      commands.push({ type: 'paint', paint });
      state.painted = true;
      const stance = state.spot?.stance || 'crouch';
      commands.push({ type: 'pose', pose: stance === 'prone' ? 'prone' : stance === 'stand' ? 'statue' : 'crouch' });
    } else if (ctx.phase === Phase.PREP && state.painted && state.arrived && rng() < 0.004) {
      const blend = computeBlend(world, player.pos, player.paint);
      if (blend.score < 0.55 + skill.paint * 0.3) {
        commands.push({ type: 'paint', paint: autoPaint(world, player.pos, rng, skill.paint) });
      }
    }

    if (state.arrived) {
      // Settle: face away from the nearest wall so the flat back is what shows.
      const stance = state.spot?.stance || 'crouch';
      if (stance === 'prone') buttons |= BTN.PRONE;
      else if (stance !== 'stand') buttons |= BTN.CROUCH;
      // Small idle look drift so a frozen bot is not obviously a statue.
      state.lookYaw += Math.sin(now * 0.3 + state.sweepPhase) * 0.004;
    }

    state.jumpCooldown = Math.max(0, state.jumpCooldown - dt);
    state.lastPhase = ctx.phase;
    return {
      input: { mx, mz, yaw: state.lookYaw, pitch: state.lookPitch, buttons },
      commands,
    };
  }

  // ------------------------------------------------------------- hunting --
  function thinkHunter(ctx, dt, now) {
    const commands = [];
    let buttons = 0;
    let mx = 0, mz = 0;

    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.jumpCooldown = Math.max(0, state.jumpCooldown - dt);

    // Only hiders are worth shooting at, and only ones ctx actually gave us.
    const visible = ctx.targets.filter((t) => t.role === Role.HIDER && !t.team);
    let best = null, bestDist = Infinity;
    for (const t of visible) {
      const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      if (d < bestDist) { bestDist = d; best = t; }
    }

    if (best) {
      if (!state.target || state.target.id !== best.id) {
        state.target = best;
        state.targetSince = now;
        // Humans do not snap. Better bots just blink faster.
        state.reaction = BOT.reactionMin + (BOT.reactionMax - BOT.reactionMin) * skill.react * (0.7 + rng() * 0.6);
      } else {
        state.target = best;
      }
    } else if (state.target && now - state.targetSince > 1.2) {
      // Lost them: go and look where they were.
      state.investigating = { ...state.target.pos, until: now + 6 };
      state.target = null;
    }

    if (state.target) {
      const t = state.target;
      const eyeY = player.pos.y + MOVE.eye[player.stance ?? 0];
      const dx = t.pos.x - player.pos.x;
      const dz = t.pos.z - player.pos.z;
      const dy = (t.pos.y + 0.6) - eyeY;
      const flat = Math.hypot(dx, dz) || 0.001;

      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, flat);
      // Aim error shrinks with skill and with how long we have been tracking.
      const settle = clamp01((now - state.targetSince) / 0.8);
      const errDeg = (BOT.aimErrorMax - (BOT.aimErrorMax - BOT.aimErrorMin) * skill.aim) * (1.2 - settle * 0.7);
      const err = errDeg * Math.PI / 180;
      const turn = clamp(6 + skill.aim * 10, 3, 16) * dt;
      state.lookYaw += clamp(angleDelta(state.lookYaw, wantYaw + (rng() - 0.5) * err), -turn, turn);
      state.lookPitch += clamp((wantPitch + (rng() - 0.5) * err) - state.lookPitch, -turn, turn);

      // Close the distance a little, but do not walk into their face.
      if (bestDist > 6) {
        setGoal(t.pos);
        const { wx, wz } = navigate(dt);
        const i = intent(wx, wz, state.lookYaw);
        mx = i.mx; mz = i.mz;
      }

      const aimed = Math.abs(angleDelta(state.lookYaw, wantYaw)) < 0.12 + (1 - skill.aim) * 0.18;
      const gun = GUNS[player.gun] || GUNS.standard;
      if (ctx.phase === Phase.HUNT && ctx.released && aimed &&
        now - state.targetSince > state.reaction &&
        state.fireCooldown <= 0 && player.ammo > 0 && !player.reloadEnd &&
        bestDist < gun.range) {
        const d = dirFromAngles(state.lookYaw, state.lookPitch);
        commands.push({ type: 'shoot', dir: [d.x, d.y, d.z] });
        state.fireCooldown = (60 / gun.rpm) * (1.05 + rng() * 0.3);
      }
      if (player.ammo <= 0 && !player.reloadEnd) commands.push({ type: 'reload' });

      return { input: { mx, mz, yaw: state.lookYaw, pitch: state.lookPitch, buttons }, commands };
    }

    // Nothing in sight: investigate the last sound, otherwise patrol.
    let goal = null;
    if (state.investigating && now < state.investigating.until) {
      goal = state.investigating;
    } else {
      const heard = ctx.sounds?.[ctx.sounds.length - 1];
      if (heard && rng() < 0.02 + skill.patrol * 0.05) {
        state.investigating = { x: heard.pos.x, y: heard.pos.y, z: heard.pos.z, until: now + 7 };
        goal = state.investigating;
      }
    }
    if (!goal) {
      goal = patrol[state.patrolIndex % patrol.length];
      const d = Math.hypot(goal.x - player.pos.x, goal.z - player.pos.z);
      if (d < 2.2) state.patrolIndex++;
    }

    setGoal(goal);
    const { wx, wz } = navigate(dt);
    const travelYaw = Math.atan2(-wx, -wz);
    // Sweep the view while walking rather than staring at our own feet - this
    // is what makes a hunter bot feel like it is searching.
    state.sweepPhase += dt * (0.7 + skill.patrol * 0.5);
    const sweep = Math.sin(state.sweepPhase) * (0.55 + skill.patrol * 0.35);
    state.lookYaw += clamp(angleDelta(state.lookYaw, travelYaw + sweep), -4 * dt, 4 * dt);
    state.lookPitch += clamp((Math.sin(state.sweepPhase * 0.6) * 0.12) - state.lookPitch, -1.5 * dt, 1.5 * dt);

    const i = intent(wx, wz, state.lookYaw);
    mx = i.mx; mz = i.mz;
    if (ctx.phase === Phase.HUNT && ctx.released) buttons |= BTN.SPRINT;

    if (trackStuck(dt) > 1.0) {
      if (state.jumpCooldown <= 0) { buttons |= BTN.JUMP; state.jumpCooldown = 1.4; }
      if (state.stuckFor > 2.5) {
        state.patrolIndex += 1 + Math.floor(rng() * 3);
        state.investigating = null;
        state.stuckFor = 0;
      }
    }

    if (player.ammo <= 0 && !player.reloadEnd) commands.push({ type: 'reload' });
    return { input: { mx, mz, yaw: state.lookYaw, pitch: state.lookPitch, buttons }, commands };
  }

  return {
    get state() { return state; },

    think(ctx, dt, now) {
      if (!ctx || !ctx.self) return { input: idleInput(state), commands: [] };
      if (ctx.phase === Phase.LOBBY || ctx.phase === Phase.INTERMISSION ||
        ctx.phase === Phase.ROUND_END || ctx.phase === Phase.MATCH_END) {
        return { input: idleInput(state), commands: [] };
      }
      const out = player.role === Role.SEEKER ? thinkHunter(ctx, dt, now) : thinkHider(ctx, dt, now);
      // Normalise so a bot can never out-run a human through a rounding slip.
      const mag = Math.hypot(out.input.mx, out.input.mz);
      if (mag > 1) { out.input.mx /= mag; out.input.mz /= mag; }
      out.input.pitch = clamp(out.input.pitch, -1.4, 1.4);
      return out;
    },

    onEvent(type, payload) {
      // Shots and tags are the loudest thing in the game; a hunter should look.
      if (!payload) return;
      if (payload.p && player.role === Role.SEEKER) {
        const d = Math.hypot(payload.p[0] - player.pos.x, payload.p[2] - player.pos.z);
        if (d < 30) state.investigating = { x: payload.p[0], y: payload.p[1], z: payload.p[2], until: (payload.at || 0) + 6 };
      }
    },
  };
}

function idleInput(state) {
  return { mx: 0, mz: 0, yaw: state.lookYaw, pitch: 0, buttons: 0 };
}
