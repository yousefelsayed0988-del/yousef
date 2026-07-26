// The authoritative game. Everything a client sends is a *request*; what
// actually happened is decided here, re-simulated with the same physics the
// client predicted with, and handed back through visibility-filtered snapshots.

import {
  Phase, Role, Stance, MOVE, STAMINA, MODES, ROUND, SCORE, GUNS, PAINT,
  ABILITY, HIDER_ABILITY, POSES, EMOTES, TICK_DT, MAX_INPUTS_PER_PACKET,
} from '../shared/constants.js';
import { createWorld, unstick, groundHeightAt, lineOfSight } from '../shared/collision.js';
import { applyInput, eyeOf, horizSpeed, BTN } from '../shared/movement.js';
import { computeBlend, autoPaint } from '../shared/blend.js';
import { getMap } from '../shared/maps/index.js';
import { S2C, EV } from '../shared/protocol.js';
import { clamp, shuffle, vdist, vdistXZ, dirFromAngles } from '../shared/math.js';
import { createGuard } from './anticheat.js';
import { createBotBrain } from './bots.js';

const POSE_INDEX = new Map(POSES.map((p, i) => [p.id, i]));
const EMOTE_INDEX = new Map(EMOTES.map((e, i) => [e.id, i]));

const WHITE = [0.93, 0.93, 0.9];
const defaultPaint = () => ({
  body: WHITE.slice(), head: WHITE.slice(), tail: WHITE.slice(),
  legs: WHITE.slice(), crest: WHITE.slice(), eyes: [0.15, 0.15, 0.18],
  pattern: 'solid', patternColor: [0.8, 0.8, 0.8],
});

export function createMatch(opts = {}) {
  const emit = opts.emit || (() => {});
  const log = opts.log || (() => {});
  const rng = opts.rng || Math.random;

  let mapDef = opts.mapDef || getMap(opts.mapId || 'mansion');
  let world = createWorld(mapDef);
  let guard = createGuard(world, {});

  const players = new Map();
  let tickCount = 0;
  let clock = opts.now ?? 0;

  const state = {
    phase: Phase.LOBBY,
    phaseEndsAt: 0,
    round: 0,
    roundsTotal: ROUND.roundsPerMatch,
    mapId: mapDef.id,
    modeId: opts.modeId && MODES[opts.modeId] ? opts.modeId : 'normal',
    winner: null,
    huntStartedAt: 0,
    released: false,
  };

  const mode = () => MODES[state.modeId];

  // ------------------------------------------------------------- players --
  function addPlayer(info) {
    const p = {
      id: info.id,
      name: info.name || 'Chameleon',
      username: info.username || '',
      bot: !!info.bot,
      connected: true,
      difficulty: info.difficulty ?? 1,

      role: Role.SPECTATOR,
      alive: false,
      frozen: false,
      tagged: false,

      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0,
      stance: Stance.STAND,
      sprinting: false,
      stamina: STAMINA.max,
      staminaHold: 0,
      onGround: true,
      speedMul: 1,

      paint: defaultPaint(),
      pose: 'idle',
      emote: null,

      gun: 'standard',
      ammo: GUNS.standard.mag,
      reloadEnd: 0,
      lastShotAt: -99,
      cooldowns: {},

      blend: 0,
      blendTier: 'poor',
      score: 0,
      roundScore: 0,
      tags: 0,
      taggedBy: null,
      survivedFor: 0,
      xp: info.xp || 0,
      level: info.level || 1,

      inputs: [],
      lastSeq: -1,
      lastInputAt: clock,
      brain: null,
      spectating: null,
      ready: !!info.bot,
    };
    players.set(p.id, p);
    placeInLobby(p);
    emit(S2C.EVENT, { e: EV.JOIN, id: p.id, name: p.name, bot: p.bot });
    return p;
  }

  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    players.delete(id);
    emit(S2C.EVENT, { e: EV.LEAVE, id });
    if (state.phase === Phase.PREP || state.phase === Phase.HUNT) checkRoundOver();
  }

  function placeInLobby(p) {
    const s = mapDef.spawns.lobby || [0, 0, 0];
    setPos(p, s[0] + (rng() - 0.5) * 4, s[1], s[2] + (rng() - 0.5) * 4);
    p.role = Role.SPECTATOR;
    p.alive = false;
    p.frozen = true;
  }

  function setPos(p, x, y, z) {
    p.pos.x = x; p.pos.z = z;
    p.pos.y = Math.max(y, groundHeightAt(world, x, z, y + 4) + 0.02);
    p.vel.x = p.vel.y = p.vel.z = 0;
    unstick(world, p.pos, MOVE.radius, MOVE.height[Stance.STAND]);
  }

  // --------------------------------------------------------------- inputs --
  function queueInput(id, input) {
    const p = players.get(id);
    if (!p) return;
    if (p.inputs.length > MAX_INPUTS_PER_PACKET * 4) {
      // A client this far ahead is either lagging hard or flooding; drop the
      // backlog rather than letting it bank movement time.
      p.inputs.length = 0;
      guard.strike(p, 'input_backlog', 1, clock);
    }
    p.inputs.push(input);
  }

  function processInputs(p, now) {
    if (!p.inputs.length) return;
    const budget = Math.min(p.inputs.length, MAX_INPUTS_PER_PACKET);
    for (let i = 0; i < budget; i++) {
      const raw = p.inputs.shift();
      const verdict = guard.checkInput(p, raw, now);
      if (!verdict.ok) {
        if (verdict.strike) guard.strike(p, verdict.reason, verdict.strike, now);
        continue;
      }
      const input = verdict.clamped || raw;
      if (input.seq <= p.lastSeq) continue;
      p.lastSeq = input.seq;
      p.lastInputAt = now;

      if (!p.alive) continue;

      const before = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      applyInput(world, p, input, input.dt);
      const after = { x: p.pos.x, y: p.pos.y, z: p.pos.z };

      const move = guard.afterMove(p, before, after, input, now);
      if (!move.ok) {
        if (move.strike) guard.strike(p, move.reason, move.strike, now);
        if (move.correct) {
          p.pos.x = move.correct.x; p.pos.y = move.correct.y; p.pos.z = move.correct.z;
          p.vel.x = p.vel.y = p.vel.z = 0;
          emit(S2C.CORRECTION, { seq: p.lastSeq, p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], hard: 1 }, p.id);
        }
      }

      // Footsteps are an information channel, so the server owns them: a
      // silent-move cheat cannot mute a player for everybody else.
      if (p.onGround && horizSpeed(p) > 1.4 && state.phase === Phase.HUNT) {
        p.stepAccum = (p.stepAccum || 0) + horizSpeed(p) * input.dt;
        const stride = p.stance === Stance.STAND ? (p.sprinting ? 1.5 : 2.0) : 3.4;
        if (p.stepAccum > stride) {
          p.stepAccum = 0;
          emitNear(p.pos, 18, { e: EV.FOOTSTEP, p: pos3(p.pos), st: p.stance, id: p.id }, p.id);
        }
      }
    }
  }

  // ------------------------------------------------------------- commands --
  function command(id, type, payload = {}) {
    const p = players.get(id);
    if (!p) return;
    switch (type) {
      case 'paint': return doPaint(p, payload);
      case 'pose': return doPose(p, payload);
      case 'emote': return doEmote(p, payload);
      case 'shoot': return doShoot(p, payload);
      case 'reload': return doReload(p);
      case 'ability': return doAbility(p, payload);
      case 'gun': return doSwitchGun(p, payload);
      default: break;
    }
  }

  function paintingAllowed(p) {
    if (p.role !== Role.HIDER || !p.alive) return false;
    if (state.phase === Phase.PREP) return true;
    return !!mode().repaintDuringHunt && state.phase === Phase.HUNT;
  }

  function doPaint(p, payload) {
    if (!paintingAllowed(p)) return;
    if (clock - (p.lastPaintAt || 0) < PAINT.repaintCooldown) return;
    p.lastPaintAt = clock;
    const src = payload.paint || payload;
    for (const part of PAINT.parts) {
      const c = src[part];
      if (Array.isArray(c) && c.length >= 3) {
        p.paint[part] = [clamp(+c[0] || 0, 0, 1), clamp(+c[1] || 0, 0, 1), clamp(+c[2] || 0, 0, 1)];
      }
    }
    if (PAINT.patterns.includes(src.pattern)) p.paint.pattern = src.pattern;
    if (Array.isArray(src.patternColor) && src.patternColor.length >= 3) {
      p.paint.patternColor = src.patternColor.map((v) => clamp(+v || 0, 0, 1));
    }
    refreshBlend(p);
    emit(S2C.EVENT, { e: EV.PAINT_CHANGE, id: p.id, paint: p.paint });
  }

  function doPose(p, payload) {
    if (!p.alive) return;
    const pose = POSES.find((x) => x.id === payload.pose);
    if (!pose) return;
    if (p.role === Role.SEEKER && pose.id !== 'idle' && pose.id !== 'crouch') return;
    p.pose = pose.id;
    p.stance = pose.stance;
  }

  function doEmote(p, payload) {
    if (!p.alive) return;
    const e = EMOTES.find((x) => x.id === payload.emote);
    if (!e) return;
    p.emote = { id: e.id, until: e.hold ? Infinity : clock + e.dur };
    emit(S2C.EVENT, { e: EV.EMOTE, id: p.id, emote: e.id });
  }

  function doSwitchGun(p, payload) {
    if (p.role !== Role.SEEKER) return;
    if (state.phase === Phase.HUNT && state.released) return; // lock loadout once released
    const g = GUNS[payload.gun];
    if (!g) return;
    if (mode().gun && mode().gun !== g.id) return;
    p.gun = g.id;
    p.ammo = mode().limitedAmmo ?? g.mag;
    p.reloadEnd = 0;
  }

  function doReload(p) {
    if (p.role !== Role.SEEKER || !p.alive) return;
    const g = GUNS[p.gun];
    const cap = mode().limitedAmmo ?? g.mag;
    if (p.ammo >= cap || clock < p.reloadEnd) return;
    if (mode().limitedAmmo) return; // one-shot mode has no resupply
    p.reloadEnd = clock + g.reload;
    emit(S2C.EVENT, { e: EV.RELOAD, id: p.id, until: p.reloadEnd });
  }

  function doShoot(p, payload) {
    if (p.role !== Role.SEEKER || !p.alive) return;
    if (state.phase !== Phase.HUNT || !state.released) return;

    const verdict = guard.checkShot(p, payload, clock, players);
    if (!verdict.ok) {
      if (verdict.strike) guard.strike(p, verdict.reason, verdict.strike, clock);
      return;
    }

    const g = GUNS[p.gun];
    p.ammo = Math.max(0, p.ammo - 1);
    p.lastShotAt = clock;
    if (p.ammo === 0 && !mode().limitedAmmo) doReload(p);

    const eye = eyeOf(p);
    emit(S2C.EVENT, {
      e: EV.SHOT,
      id: p.id,
      from: pos3(eye),
      to: verdict.point ? pos3(verdict.point) : null,
      gun: p.gun,
    });

    if (verdict.hitId != null) {
      const victim = players.get(verdict.hitId);
      if (victim && victim.alive && victim.role === Role.HIDER) tagPlayer(victim, p);
    } else if (verdict.point) {
      emitNear(verdict.point, 22, { e: EV.SPLASH, p: pos3(verdict.point), c: g.tracer });
    }
  }

  function doAbility(p, payload) {
    if (!p.alive) return;
    const id = payload.ability;
    const now = clock;
    const cd = p.cooldowns[id] || 0;
    if (now < cd) return;

    if (p.role === Role.SEEKER && (id === 'scan' || id === 'thermal')) {
      const a = ABILITY[id];
      p.cooldowns[id] = now + a.cooldown;
      // The reveal is computed server-side: the client is told *which* hiders
      // lit up, so a patched client cannot widen its own radius.
      const found = [];
      for (const h of players.values()) {
        if (h.role !== Role.HIDER || !h.alive) continue;
        const d = vdist(p.pos, h.pos);
        if (d > a.radius) continue;
        if (id === 'scan' && !lineOfSight(world, eyeOf(p), eyeOf(h))) continue;
        found.push({ id: h.id, p: pos3(h.pos), until: now + a.duration });
      }
      emit(S2C.EVENT, { e: EV.ABILITY, id: p.id, ability: id, at: pos3(p.pos), r: a.radius });
      if (found.length) emit(S2C.EVENT, { e: EV.REVEAL, targets: found }, p.id);
      emitNear(p.pos, a.radius * 1.6, { e: EV.SCAN, p: pos3(p.pos), r: a.radius }, p.id);
      return;
    }

    if (p.role === Role.HIDER) {
      if (id === 'mimic') {
        if (!paintingAllowed(p)) return;
        p.cooldowns[id] = now + HIDER_ABILITY.mimic.cooldown;
        const auto = autoPaint(world, p.pos, rng, 1);
        doPaint(p, { paint: auto });
        return;
      }
      if (id === 'decoy') {
        p.cooldowns[id] = now + HIDER_ABILITY.decoy.cooldown;
        emit(S2C.EVENT, {
          e: EV.DECOY, id: p.id, p: pos3(p.pos), yaw: r2(p.yaw),
          paint: p.paint, until: now + HIDER_ABILITY.decoy.life,
        });
        return;
      }
      if (id === 'dash') {
        if (!p.onGround) return;
        p.cooldowns[id] = now + HIDER_ABILITY.dash.cooldown;
        const d = dirFromAngles(p.yaw, 0);
        p.vel.x += d.x * HIDER_ABILITY.dash.impulse;
        p.vel.z += d.z * HIDER_ABILITY.dash.impulse;
        emit(S2C.EVENT, { e: EV.ABILITY, id: p.id, ability: 'dash', at: pos3(p.pos) });
      }
    }
  }

  // ----------------------------------------------------------- tag / score --
  function tagPlayer(victim, hunter) {
    victim.tagged = true;
    victim.taggedBy = hunter?.id ?? null;
    victim.survivedFor = clock - state.huntStartedAt;

    if (hunter) {
      hunter.tags++;
      award(hunter, SCORE.tag);
      if (!state.firstBlood) {
        state.firstBlood = true;
        award(hunter, SCORE.firstBlood);
      }
    }

    emit(S2C.EVENT, {
      e: EV.TAG, id: victim.id, by: hunter?.id ?? null,
      p: pos3(victim.pos), blend: r2(victim.blend),
    });

    if (mode().infection) {
      // Straight to the other side, standing where they were caught.
      victim.tagged = false;
      victim.role = Role.SEEKER;
      victim.alive = true;
      victim.pose = 'idle';
      victim.stance = Stance.STAND;
      victim.gun = mode().gun || 'standard';
      victim.ammo = mode().limitedAmmo ?? GUNS[victim.gun].mag;
      victim.paint = defaultPaint();
      emit(S2C.EVENT, { e: EV.PAINT_CHANGE, id: victim.id, paint: victim.paint });
    } else {
      victim.alive = false;
      victim.role = Role.SPECTATOR;
      victim.spectating = hunter?.id ?? null;
    }
    checkRoundOver();
  }

  function award(p, points) {
    p.roundScore += points;
    p.score += points;
    p.xp += points * SCORE.xpPerScore;
  }

  // --------------------------------------------------------------- phases --
  function setPhase(phase, duration) {
    state.phase = phase;
    state.phaseEndsAt = clock + duration;
    emit(S2C.MATCH, matchState());
    emit(S2C.EVENT, { e: EV.PHASE, phase, endsAt: state.phaseEndsAt });
  }

  function humans() { return [...players.values()].filter((p) => !p.bot); }

  function startMatch() {
    if (state.phase !== Phase.LOBBY && state.phase !== Phase.MATCH_END) return false;
    state.round = 0;
    state.winner = null;
    for (const p of players.values()) { p.score = 0; p.tags = 0; }
    setPhase(Phase.INTERMISSION, ROUND.intermission);
    return true;
  }

  function beginRound() {
    state.round++;
    state.firstBlood = false;
    state.released = false;
    state.winner = null;

    const roster = [...players.values()].filter((p) => p.connected);
    if (!roster.length) { setPhase(Phase.LOBBY, 0); return; }

    // Roles rotate: last round's hunters get to hide.
    const m = mode();
    let seekerCount = m.versus ? 0 : Math.max(1, Math.round(roster.length * m.seekerRatio));
    if (roster.length === 1) seekerCount = 0; // solo practice: hide with nobody hunting
    const prevSeekers = new Set(roster.filter((p) => p.lastRole === Role.SEEKER).map((p) => p.id));
    const pool = shuffle(roster, rng).sort((a, b) => (prevSeekers.has(a.id) ? 1 : 0) - (prevSeekers.has(b.id) ? 1 : 0));

    const hiderSpawns = shuffle(mapDef.spawns.hiders, rng);
    const seekerSpawns = shuffle(mapDef.spawns.seekers, rng);
    let hi = 0, si = 0;

    pool.forEach((p, i) => {
      const isSeeker = i < seekerCount;
      p.role = isSeeker ? Role.SEEKER : Role.HIDER;
      p.lastRole = p.role;
      p.alive = true;
      p.tagged = false;
      p.taggedBy = null;
      p.roundScore = 0;
      p.survivedFor = 0;
      p.stance = Stance.STAND;
      p.pose = 'idle';
      p.emote = null;
      p.stamina = STAMINA.max;
      p.cooldowns = {};
      p.inputs.length = 0;
      p.spectating = null;
      p.paint = defaultPaint();
      p.frozen = isSeeker; // hunters wait out prep
      if (isSeeker) {
        p.gun = m.gun || p.preferredGun || 'standard';
        p.ammo = m.limitedAmmo ?? GUNS[p.gun].mag;
        p.reloadEnd = 0;
        const s = seekerSpawns[si++ % seekerSpawns.length];
        setPos(p, s[0] + (rng() - 0.5) * 1.5, s[1], s[2] + (rng() - 0.5) * 1.5);
      } else {
        const s = hiderSpawns[hi++ % hiderSpawns.length];
        setPos(p, s[0] + (rng() - 0.5) * 1.5, s[1], s[2] + (rng() - 0.5) * 1.5);
      }
      p.yaw = rng() * Math.PI * 2;
      p.pitch = 0;
      if (p.bot) {
        p.brain = createBotBrain({ player: p, world, mapDef, difficulty: p.difficulty, rng });
      }
    });

    refreshAllBlends();
    setPhase(Phase.PREP, m.prep);
  }

  function beginHunt() {
    const m = mode();
    state.huntStartedAt = clock;
    state.released = false;
    if (m.versus) {
      // Everybody flips to hunter at once and hunts each other.
      for (const p of players.values()) {
        if (!p.alive) continue;
        p.role = Role.SEEKER;
        p.gun = m.gun || 'standard';
        p.ammo = m.limitedAmmo ?? GUNS[p.gun].mag;
        p.frozen = false;
      }
    }
    setPhase(Phase.HUNT, m.hunt);
  }

  function releaseSeekers() {
    state.released = true;
    for (const p of players.values()) {
      if (p.role === Role.SEEKER) p.frozen = false;
    }
    emit(S2C.MATCH, matchState());
  }

  function livingHiders() {
    return [...players.values()].filter((p) => p.role === Role.HIDER && p.alive);
  }
  function livingSeekers() {
    return [...players.values()].filter((p) => p.role === Role.SEEKER && p.alive);
  }

  function checkRoundOver() {
    if (state.phase !== Phase.HUNT) return;
    const m = mode();
    if (m.versus) {
      const standing = livingSeekers();
      if (standing.length <= 1) endRound(standing.length === 1 ? 'survivor' : 'nobody');
      return;
    }
    if (!livingHiders().length) endRound('seekers');
    else if (!livingSeekers().length && !m.versus) endRound('hiders');
  }

  function endRound(winner) {
    state.winner = winner;
    const elapsed = clock - state.huntStartedAt;

    for (const p of players.values()) {
      if (p.role === Role.HIDER && p.alive) {
        p.survivedFor = elapsed;
        award(p, SCORE.survive + Math.round(elapsed * SCORE.survivePerSecond));
        if (p.blend >= 0.9) award(p, SCORE.perfectBlend);
      } else if (p.role === Role.HIDER) {
        award(p, Math.round(p.survivedFor * SCORE.survivePerSecond));
      }
      p.frozen = true;
    }
    if (winner === 'survivor') {
      const last = livingSeekers()[0];
      if (last) award(last, SCORE.lastAlive);
    }

    emit(S2C.SCORES, { rows: scoreboard(), winner, round: state.round });
    setPhase(Phase.ROUND_END, ROUND.roundEnd);
  }

  function endMatch() {
    emit(S2C.SCORES, { rows: scoreboard(), winner: 'match', final: true });
    setPhase(Phase.MATCH_END, ROUND.matchEnd);
  }

  // ----------------------------------------------------------------- tick --
  function tick(dt, now) {
    clock = now;
    tickCount++;
    const m = mode();

    for (const p of players.values()) {
      if (p.emote && p.emote.until <= clock) p.emote = null;
      if (p.reloadEnd && clock >= p.reloadEnd) {
        p.ammo = m.limitedAmmo ?? GUNS[p.gun].mag;
        p.reloadEnd = 0;
      }
    }

    // Bots think first so their inputs land in the same tick as human input.
    if (state.phase === Phase.PREP || state.phase === Phase.HUNT) {
      for (const p of players.values()) {
        if (!p.bot || !p.brain || !p.alive) continue;
        try {
          const out = p.brain.think(botContext(p), dt, now);
          if (out?.input) queueInput(p.id, { ...out.input, seq: (p.lastSeq || 0) + 1, dt });
          if (out?.commands) for (const c of out.commands) command(p.id, c.type, c);
        } catch (err) {
          log('bot error', p.name, err.message);
          p.brain = null;
        }
      }
    }

    for (const p of players.values()) processInputs(p, now);

    // Blend is recomputed server-side on a slow rotation: it feeds scoring and
    // the HUD, and a client must never be able to claim its own camouflage.
    blendCursor = (blendCursor + 1) % Math.max(1, players.size);
    const list = [...players.values()];
    const target = list[blendCursor];
    if (target && target.role === Role.HIDER && target.alive) refreshBlend(target);

    if (clock >= state.phaseEndsAt) {
      switch (state.phase) {
        case Phase.INTERMISSION: beginRound(); break;
        case Phase.PREP: beginHunt(); break;
        case Phase.HUNT: endRound(mode().versus ? 'survivor' : 'hiders'); break;
        case Phase.ROUND_END:
          if (state.round >= state.roundsTotal) endMatch();
          else setPhase(Phase.INTERMISSION, ROUND.intermission);
          break;
        case Phase.MATCH_END:
          for (const p of players.values()) placeInLobby(p);
          setPhase(Phase.LOBBY, 0);
          break;
        default: break;
      }
    }

    if (state.phase === Phase.HUNT && !state.released &&
      clock >= state.huntStartedAt + ROUND.seekerReleaseGrace) {
      releaseSeekers();
    }

    // Kick anyone the guard has run out of patience with.
    for (const p of players.values()) {
      if (!p.bot && guard.shouldKick(p, now)) {
        emit(S2C.KICKED, { reason: 'anticheat', detail: guard.report(p) }, p.id);
        opts.onKick?.(p, guard.report(p));
      }
    }
  }

  let blendCursor = 0;
  function refreshBlend(p) {
    const b = computeBlend(world, p.pos, p.paint);
    p.blend = b.score;
    p.blendTier = b.tier;
  }
  function refreshAllBlends() {
    for (const p of players.values()) if (p.role === Role.HIDER) refreshBlend(p);
  }

  // ------------------------------------------------------------ bot vision --
  function botContext(bot) {
    const targets = [];
    for (const other of players.values()) {
      if (other.id === bot.id || !other.alive) continue;
      const sameTeam = other.role === bot.role;
      if (sameTeam && bot.role === Role.SEEKER) {
        targets.push({ id: other.id, pos: other.pos, role: other.role, team: true });
        continue;
      }
      if (!guard.visibleTo(bot, other, clock)) continue;
      targets.push({ id: other.id, pos: other.pos, role: other.role, team: sameTeam });
    }
    return {
      phase: state.phase,
      mode: state.modeId,
      self: bot,
      targets,
      sounds: recentSounds.filter((s) => vdist(s.pos, bot.pos) < 22 && clock - s.at < 3),
      timeLeft: Math.max(0, state.phaseEndsAt - clock),
      released: state.released,
    };
  }

  const recentSounds = [];
  function emitNear(pos, radius, payload, exceptId) {
    recentSounds.push({ pos: { ...pos }, kind: payload.e, at: clock });
    if (recentSounds.length > 64) recentSounds.shift();
    const to = [];
    for (const p of players.values()) {
      if (p.id === exceptId || p.bot) continue;
      if (vdist(p.pos, pos) <= radius) to.push(p.id);
    }
    if (to.length) emit(S2C.EVENT, payload, to);
  }

  // ------------------------------------------------------------ snapshots --
  const r2 = (v) => Math.round(v * 100) / 100;
  const pos3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];

  function flagsFor(p) {
    let f = 0;
    if (horizSpeed(p) > 0.6) f |= 1;
    if (p.tagged) f |= 2;
    if (p.sprinting) f |= 4;
    if (p.role === Role.SEEKER) f |= 8;
    if (p.bot) f |= 16;
    if (!p.alive) f |= 32;
    if (p.frozen) f |= 64;
    return f;
  }

  function entryFor(p) {
    return [
      p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z),
      r2(p.yaw), r2(p.pitch), p.stance, flagsFor(p),
      POSE_INDEX.get(p.pose) ?? 0,
      p.emote ? (EMOTE_INDEX.get(p.emote.id) ?? -1) : -1,
    ];
  }

  /**
   * What one client is allowed to know this tick. Cross-team positions go
   * through the guard's PVS, so a patched client that draws everything it
   * receives still cannot see a hider it has no line of sight to.
   */
  function snapshotFor(id) {
    const me = players.get(id);
    if (!me) return null;

    // A tagged player rides along with whoever caught them rather than
    // free-flying the map, so spectators cannot relay positions to the living.
    const viewer = (!me.alive && me.spectating != null && players.get(me.spectating)) || me;

    const list = [];
    for (const other of players.values()) {
      if (other.id === id) continue;
      if (!other.alive && state.phase === Phase.HUNT) continue;
      const sameTeam = other.role === viewer.role && viewer.role !== Role.SPECTATOR;
      const lobbyish = state.phase === Phase.LOBBY || state.phase === Phase.INTERMISSION ||
        state.phase === Phase.ROUND_END || state.phase === Phase.MATCH_END;
      if (lobbyish || sameTeam || viewer.role === Role.SPECTATOR) {
        list.push(entryFor(other));
        continue;
      }
      if (guard.visibleTo(viewer, other, clock)) list.push(entryFor(other));
    }

    return {
      tk: tickCount,
      ack: me.lastSeq,
      me: {
        p: pos3(me.pos),
        v: [r2(me.vel.x), r2(me.vel.y), r2(me.vel.z)],
        st: me.stance,
        sta: Math.round(me.stamina),
        am: me.ammo,
        rl: me.reloadEnd ? r2(me.reloadEnd - clock) : 0,
        bl: r2(me.blend),
        bt: me.blendTier,
        role: me.role,
        alive: me.alive ? 1 : 0,
        frozen: me.frozen ? 1 : 0,
        cd: me.cooldowns,
        spec: me.spectating,
        score: Math.round(me.score),
      },
      ps: list,
      hid: livingHiders().length,
      sk: livingSeekers().length,
      t: r2(Math.max(0, state.phaseEndsAt - clock)),
    };
  }

  function matchState() {
    return {
      phase: state.phase,
      endsAt: r2(Math.max(0, state.phaseEndsAt - clock)),
      round: state.round,
      rounds: state.roundsTotal,
      mapId: state.mapId,
      modeId: state.modeId,
      released: state.released,
      winner: state.winner,
      players: [...players.values()].map((p) => ({
        id: p.id, name: p.name, bot: p.bot, role: p.role, alive: p.alive,
        paint: p.paint, score: Math.round(p.score), tags: p.tags, level: p.level,
      })),
    };
  }

  function scoreboard() {
    return [...players.values()]
      .map((p) => ({
        id: p.id, name: p.name, bot: p.bot, role: p.role,
        score: Math.round(p.score), round: Math.round(p.roundScore),
        tags: p.tags, survived: Math.round(p.survivedFor),
        blend: r2(p.blend), xp: Math.round(p.xp), level: p.level,
        alive: p.alive,
      }))
      .sort((a, b) => b.score - a.score);
  }

  function setOptions(o = {}) {
    if (state.phase !== Phase.LOBBY && state.phase !== Phase.MATCH_END) return false;
    if (o.mapId) {
      try {
        mapDef = getMap(o.mapId);
        world = createWorld(mapDef);
        guard = createGuard(world, {});
        state.mapId = mapDef.id;
        for (const p of players.values()) placeInLobby(p);
      } catch { /* unknown map id: keep the current one */ }
    }
    if (o.modeId && MODES[o.modeId]) state.modeId = o.modeId;
    if (Number.isFinite(o.rounds)) state.roundsTotal = clamp(Math.round(o.rounds), 1, 15);
    return true;
  }

  return {
    state,
    players,
    get world() { return world; },
    get mapDef() { return mapDef; },
    get guard() { return guard; },
    addPlayer,
    removePlayer,
    queueInput,
    command,
    tick,
    snapshotFor,
    matchState,
    scoreboard,
    setOptions,
    startMatch,
    beginRound,
    tagPlayer,
    livingHiders,
    livingSeekers,
  };
}
