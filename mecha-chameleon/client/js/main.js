// Boot, wiring and the frame loop. Owns the predicted local player, the
// interpolation buffers for everyone else, and the translation from server
// events into things you can see and hear.

import { createRenderer } from './gl/renderer.js';
import { createInput } from './input.js';
import { createNet } from './net.js';
import { createUI } from './ui.js';
import { createHUD } from './hud.js';
import { createPaintUI, createWheel } from './paintui.js';
import { createAudio } from './audio.js';
import { buildChameleon } from './chameleon.js';

import {
  Phase, Role, Stance, MOVE, MODES, GUNS, POSES, EMOTES, PAINT,
  INTERP_DELAY, TICK_DT,
} from '../../shared/constants.js';
import { C2S, S2C, EV } from '../../shared/protocol.js';
import { createWorld, raycast, groundHeightAt } from '../../shared/collision.js';
import { applyInput, eyeOf } from '../../shared/movement.js';
import { getMap, MAP_LIST } from '../../shared/maps/index.js';
import { computeBlend, autoPaint } from '../../shared/blend.js';
import { clamp, clamp01, lerp, lerpAngle, dirFromAngles, vdist } from '../../shared/math.js';
import { rgbToHex, hexToRgb } from '../../shared/color.js';

const canvas = document.getElementById('scene');
const POSE_BY_INDEX = POSES.map((p) => p.id);
const EMOTE_BY_INDEX = EMOTES.map((e) => e.id);

const store = {
  get(key, dflt) {
    try { return JSON.parse(localStorage.getItem(key)) ?? dflt; } catch { return dflt; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const game = {
  connId: null,
  playerId: null,
  roomCode: null,
  account: null,
  name: store.get('mc.name', ''),
  username: store.get('mc.username', ''),

  mapDef: null,
  world: null,
  phase: Phase.LOBBY,
  modeId: 'normal',
  timeLeft: 0,
  released: false,
  round: 0,
  rounds: 5,

  me: {
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, stance: Stance.STAND, stamina: 100, onGround: true,
    role: Role.SPECTATOR, alive: false, frozen: false, sprinting: false,
    blend: 0, blendTier: 'poor', ammo: 24, ammoMax: 24, gun: 'standard',
    reload: 0, cooldowns: {}, score: 0, speedMul: 1,
  },
  others: new Map(),
  paint: {
    body: [0.93, 0.93, 0.9], head: [0.95, 0.95, 0.92], tail: [0.88, 0.88, 0.85],
    legs: [0.85, 0.85, 0.82], crest: [0.97, 0.97, 0.94], eyes: [0.15, 0.15, 0.18],
    pattern: 'solid', patternColor: [0.75, 0.75, 0.72],
  },
  pose: 'idle',
  thirdPerson: true,
  hiders: 0,
  hunters: 0,
};

let renderer, input, net, ui, hud, paintUI, audio, poseWheel, emoteWheel;
const settings = {
  renderScale: store.get('mc.renderScale', 1),
  showFps: store.get('mc.showFps', false),
  volumes: store.get('mc.volumes', { master: 0.8, sfx: 0.9, music: 0.5 }),
};

// Prediction bookkeeping.
let inputSeq = 0;
const pendingInputs = [];
let outbox = [];
let sendAccum = 0;
const visualOffset = { x: 0, y: 0, z: 0 };

// Transient visual effects.
const tracers = [];
const splashes = [];
const reveals = [];
const decoys = [];
const pings = [];

let animT = 0;
let lastFrame = performance.now() / 1000;
let fpsAccum = 0, fpsFrames = 0, fps = 0;
let previewMode = false;
let greeted = false;
let lastRender = 0;

// ---------------------------------------------------------------- helpers --
function setMap(mapId) {
  if (game.mapDef?.id === mapId) return;
  const def = getMap(mapId);
  game.mapDef = def;
  game.world = createWorld(def);
  renderer.loadMap(def);
  hud.buildMinimap(def);
  paintUI.rebuildPalette();
}

function resize() {
  const scale = clamp(settings.renderScale, 0.4, 2);
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio || 1, 2) * scale);
}

function localEye() {
  return { x: game.me.pos.x, y: game.me.pos.y + MOVE.eye[game.me.stance], z: game.me.pos.z };
}

// ------------------------------------------------------------- networking --
function connect() {
  net = createNet({
    name: () => game.name || 'Chameleon',
    username: () => game.username,
  });

  net.on('status', (s) => {
    ui.netStatus(s.connected, s.rtt);
    if (s.connected) {
      ui.bootStatus('Connected');
    } else if (ui.screen !== 'boot') {
      ui.toast('Lost the connection. Reconnecting…', 'warn');
    }
  });

  net.on(S2C.WELCOME, (msg) => {
    if (msg.refresh) { game.account = { ...game.account, ...msg.account }; return; }
    game.connId = msg.you;
    game.name = msg.name;
    game.username = msg.username;
    game.account = msg.account;
    ui.setIdentity(msg.name, msg.username);
    store.set('mc.name', msg.name);
    store.set('mc.username', msg.username);
    if (!greeted) { greeted = true; afterConnect(); }
  });

  net.on(S2C.ERROR, (msg) => {
    if (msg.code === 'ok') ui.toast(msg.detail, 'good');
    else ui.toast(msg.detail || msg.code, msg.code === 'user_offline' ? 'warn' : 'error');
  });

  net.on(S2C.ROOM, (msg) => {
    if (msg.left) { ui.show('menu'); game.roomCode = null; return; }
    if (msg.you != null) game.playerId = msg.you;
    game.roomCode = msg.code;
    ui.roomState({ ...msg, you: game.playerId });
    setMap(msg.options.mapId);
    game.modeId = msg.options.modeId;
    if (msg.joined) {
      ui.show('lobby');
      history.replaceState(null, '', `?join=${msg.code}`);
      audio.music('menu');
    }
  });

  net.on(S2C.ROOM_LIST, (msg) => ui.roomList(msg.rooms || []));

  net.on(S2C.MATCH, (msg) => onMatchState(msg));
  net.on(S2C.SNAPSHOT, (msg) => onSnapshot(msg));
  net.on(S2C.CORRECTION, (msg) => {
    game.me.pos.x = msg.p[0]; game.me.pos.y = msg.p[1]; game.me.pos.z = msg.p[2];
    game.me.vel.x = game.me.vel.y = game.me.vel.z = 0;
    pendingInputs.length = 0;
  });
  net.on(S2C.EVENT, (msg) => onEvent(msg));
  net.on(S2C.CHAT, (msg) => {
    hud.chat(msg);
    ui.lobbyChat(msg);
  });
  net.on(S2C.SCORES, (msg) => onScores(msg));
  net.on(S2C.INVITE, (msg) => {
    ui.invite(msg);
    audio.play('uiHover');
  });
  net.on(S2C.KICKED, (msg) => {
    ui.toast(msg.reason === 'anticheat'
      ? 'Removed by the anti-cheat.'
      : `You were removed from the room (${msg.reason}).`, 'error', 9000);
    ui.show('menu');
  });
  net.on(S2C.ANTICHEAT, (msg) => ui.toast(msg.detail || 'Anti-cheat warning', 'warn'));

  net.connect();
}

function afterConnect() {
  const join = new URLSearchParams(location.search).get('join');
  if (join) {
    net.send(C2S.JOIN_ROOM, { code: join.toUpperCase() });
    ui.show('menu');
  } else {
    ui.show('menu');
  }
  audio.music('menu');
}

// ------------------------------------------------------------ match state --
function onMatchState(msg) {
  const wasPhase = game.phase;
  game.phase = msg.phase;
  game.timeLeft = msg.endsAt;
  game.round = msg.round;
  game.rounds = msg.rounds;
  game.released = msg.released;
  game.modeId = msg.modeId;
  setMap(msg.mapId);

  for (const p of msg.players || []) {
    if (p.id === game.playerId) {
      game.me.role = p.role;
      game.me.alive = p.alive;
      if (p.paint) game.paint = { ...game.paint, ...p.paint };
      continue;
    }
    const other = ensureOther(p.id);
    other.name = p.name;
    other.role = p.role;
    other.alive = p.alive;
    other.bot = p.bot;
    if (p.paint) other.paint = p.paint;
  }

  if (msg.phase !== wasPhase) onPhaseChange(msg.phase, wasPhase);
  if (msg.phase !== Phase.LOBBY && ui.screen !== 'play' && ui.screen !== 'results') {
    ui.show('play');
    input.requestLock();
  }
}

function onPhaseChange(phase, previous) {
  const isHider = game.me.role === Role.HIDER;
  paintUI.setOpen(false);

  switch (phase) {
    case Phase.INTERMISSION:
      hud.banner('Next round', `Round ${game.round + 1} of ${game.rounds}`);
      hud.objective('Roles are being drawn…');
      audio.music('prep');
      break;
    case Phase.PREP:
      hud.banner(isHider ? 'Hide' : 'Wait', isHider
        ? 'Find a spot, paint yourself, hold still'
        : 'The hiders are getting into position');
      hud.objective(isHider
        ? 'Press Q to paint · F to pose · get out of sight'
        : 'You are held until the hunt begins');
      audio.music('prep');
      audio.play('phasePrep');
      game.thirdPerson = isHider;
      if (isHider) setTimeout(() => paintUI.setOpen(true), 900);
      break;
    case Phase.HUNT:
      hud.banner(isHider ? 'Hunters released' : 'Hunt', isHider
        ? 'Do not move'
        : 'Find every last one of them');
      hud.objective(isHider ? 'Stay still. Movement is what gets you spotted.' : 'Tag every hider before the clock runs out');
      audio.music('hunt');
      audio.play('phaseHunt');
      if (!isHider) game.thirdPerson = false;
      break;
    case Phase.ROUND_END:
      hud.objective('');
      break;
    case Phase.MATCH_END:
      audio.music('menu');
      break;
    case Phase.LOBBY:
      // The match wrapped up and the room went back to the lobby; follow it,
      // otherwise the player is left staring at an empty map.
      hud.objective('');
      input.releaseLock();
      if (ui.screen === 'play') ui.show('lobby');
      audio.music('menu');
      break;
    default:
      break;
  }
  if (previous === Phase.HUNT && phase === Phase.ROUND_END) input.releaseLock();
}

function onScores(msg) {
  const rows = msg.rows || [];
  hud.scoreboard(rows, game.playerId, game.roomCode);
  const title = msg.final ? 'Match over'
    : msg.winner === 'seekers' ? 'Hunters win the round'
      : msg.winner === 'hiders' ? 'Hiders survived'
        : msg.winner === 'survivor' ? 'Last one standing'
          : 'Round over';
  const mine = rows.find((r) => r.id === game.playerId);
  audio.play(msg.winner === 'seekers'
    ? (game.me.role === Role.SEEKER ? 'win' : 'lose')
    : (game.me.role === Role.HIDER ? 'win' : 'lose'));
  ui.show('results', {
    title,
    subtitle: mine ? `You scored ${mine.round || mine.score} this round.` : '',
    rows,
    youId: game.playerId,
  });
  input.releaseLock();
}

function ensureOther(id) {
  let p = game.others.get(id);
  if (!p) {
    p = {
      id, name: '', role: Role.SPECTATOR, alive: true, bot: false,
      paint: { ...game.paint },
      buffer: [],
      render: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      stance: Stance.STAND, pose: 'idle', emote: null, flags: 0, lastSeen: 0,
    };
    game.others.set(id, p);
  }
  return p;
}

// --------------------------------------------------------------- snapshot --
function onSnapshot(snap) {
  const me = snap.me;
  game.timeLeft = snap.t;
  game.hiders = snap.hid;
  game.hunters = snap.sk;
  game.me.role = me.role;
  game.me.alive = !!me.alive;
  game.me.frozen = !!me.frozen;
  game.me.stamina = me.sta;
  game.me.ammo = me.am;
  game.me.reload = me.rl;
  game.me.blend = me.bl;
  game.me.blendTier = me.bt;
  game.me.cooldowns = me.cd || {};
  game.me.score = me.score;

  // Reconcile: rewind to the server's position, then replay everything it has
  // not acknowledged yet. The visual offset hides the snap.
  const before = { ...game.me.pos };
  game.me.pos.x = me.p[0]; game.me.pos.y = me.p[1]; game.me.pos.z = me.p[2];
  game.me.vel.x = me.v[0]; game.me.vel.y = me.v[1]; game.me.vel.z = me.v[2];

  while (pendingInputs.length && pendingInputs[0].seq <= snap.ack) pendingInputs.shift();
  for (const inp of pendingInputs) applyInput(game.world, game.me, inp, inp.dt);

  const dx = before.x - game.me.pos.x, dy = before.y - game.me.pos.y, dz = before.z - game.me.pos.z;
  if (Math.hypot(dx, dy, dz) < 2.5) {
    visualOffset.x = dx; visualOffset.y = dy; visualOffset.z = dz;
  } else {
    visualOffset.x = visualOffset.y = visualOffset.z = 0;
  }

  // Remote players: buffer for interpolation, and forget anyone the server
  // stopped sending (they walked out of our view, which is the point).
  const now = performance.now() / 1000;
  const seen = new Set();
  for (const e of snap.ps || []) {
    const [id, x, y, z, yaw, pitch, stance, flags, poseIdx, emoteIdx] = e;
    seen.add(id);
    const p = ensureOther(id);
    p.buffer.push({ t: now, x, y, z, yaw, pitch });
    while (p.buffer.length > 24) p.buffer.shift();
    p.stance = stance;
    p.flags = flags;
    p.pose = POSE_BY_INDEX[poseIdx] || 'idle';
    p.emote = emoteIdx >= 0 ? EMOTE_BY_INDEX[emoteIdx] : null;
    p.role = flags & 8 ? Role.SEEKER : Role.HIDER;
    p.alive = !(flags & 32);
    p.bot = !!(flags & 16);
    p.lastSeen = now;
  }
  for (const [id, p] of game.others) {
    if (!seen.has(id) && now - p.lastSeen > 1.6) game.others.delete(id);
  }
}

// ----------------------------------------------------------------- events --
function onEvent(msg) {
  switch (msg.e) {
    case EV.SHOT: {
      const from = { x: msg.from[0], y: msg.from[1], z: msg.from[2] };
      const to = msg.to ? { x: msg.to[0], y: msg.to[1], z: msg.to[2] } : null;
      if (to) tracers.push({ from, to, until: performance.now() / 1000 + 0.07, color: hexToRgb(GUNS[msg.gun]?.tracer || '#7cf2c4') });
      audio.play('shot', { pos: from, gun: msg.gun });
      break;
    }
    case EV.TAG: {
      const victim = msg.id === game.playerId ? 'You' : (game.others.get(msg.id)?.name || 'Someone');
      const hunter = msg.by === game.playerId ? 'You' : (game.others.get(msg.by)?.name || 'Someone');
      hud.killfeed(`<b>${hunter}</b> tagged <i>${victim}</i>`);
      audio.play('tag', { pos: { x: msg.p[0], y: msg.p[1], z: msg.p[2] } });
      splashes.push({ p: { x: msg.p[0], y: msg.p[1] + 0.6, z: msg.p[2] }, until: performance.now() / 1000 + 4, color: [1, 0.42, 0.55], size: 0.9 });
      if (msg.by === game.playerId) hud.hitmarker();
      if (msg.id === game.playerId) {
        hud.flash();
        hud.banner('Spotted', `Your camouflage read ${Math.round((msg.blend || 0) * 100)}%`);
        game.thirdPerson = true;
      }
      break;
    }
    case EV.SPLASH:
      splashes.push({
        p: { x: msg.p[0], y: msg.p[1], z: msg.p[2] },
        until: performance.now() / 1000 + 6,
        color: hexToRgb(msg.c || '#7cf2c4'), size: 0.4,
      });
      audio.play('splash', { pos: { x: msg.p[0], y: msg.p[1], z: msg.p[2] } });
      break;
    case EV.FOOTSTEP:
      audio.play('footstep', { pos: { x: msg.p[0], y: msg.p[1], z: msg.p[2] }, stance: msg.st });
      break;
    case EV.REVEAL:
      for (const t of msg.targets || []) {
        reveals.push({ p: { x: t.p[0], y: t.p[1] + 1.1, z: t.p[2] }, until: performance.now() / 1000 + 2.2 });
      }
      break;
    case EV.SCAN:
      pings.push({ p: { x: msg.p[0], y: msg.p[1] + 0.4, z: msg.p[2] }, r: msg.r, until: performance.now() / 1000 + 1.4 });
      audio.play('scan', { pos: { x: msg.p[0], y: msg.p[1], z: msg.p[2] } });
      break;
    case EV.PAINT_CHANGE:
      if (msg.id === game.playerId) game.paint = { ...game.paint, ...msg.paint };
      else ensureOther(msg.id).paint = msg.paint;
      break;
    case EV.EMOTE:
      audio.play('emote');
      break;
    case EV.DECOY:
      decoys.push({
        p: { x: msg.p[0], y: msg.p[1], z: msg.p[2] }, yaw: msg.yaw,
        paint: msg.paint, until: performance.now() / 1000 + 25,
      });
      break;
    case EV.RELOAD:
      audio.play('reload');
      break;
    case EV.ABILITY:
      if (msg.ability === 'dash') audio.play('emote', { pos: { x: msg.at[0], y: msg.at[1], z: msg.at[2] } });
      break;
    case EV.JOIN:
      hud.chat({ sys: true, text: `${msg.name} joined` });
      break;
    case EV.LEAVE:
      hud.chat({ sys: true, text: 'A player left' });
      break;
    default:
      break;
  }
}

// -------------------------------------------------------------- simulation --
function step(dt) {
  if (!game.world) return;

  if (previewMode) {
    // Slow orbit around the middle of the map, purely for screenshots.
    game.me.yaw += dt * 0.22;
    game.me.pitch = -0.14;
    return;
  }

  const canMove = game.me.alive && ui.screen === 'play' && !paintUI.open && !hud.chatOpen;
  const sample = input.sample(dt);
  if (!canMove) { sample.mx = 0; sample.mz = 0; sample.buttons = 0; }

  if (game.me.alive) {
    // A single input may not claim more than MOVE.maxInputDt - the server
    // refuses it, and rightly. On a machine rendering at 5 fps that would
    // silently halve the player's walking speed, so a long frame is split into
    // legal slices instead of being clipped down to one.
    let remaining = Math.min(dt, MOVE.maxInputDt * 6);
    while (remaining > 1e-4) {
      const slice = Math.min(remaining, MOVE.maxInputDt);
      remaining -= slice;
      const raw = { ...sample, dt: slice, seq: ++inputSeq };
      applyInput(game.world, game.me, raw, slice);
      pendingInputs.push(raw);
      outbox.push({
        q: raw.seq, d: Math.round(slice * 1000) / 1000,
        x: Math.round(raw.mx * 100) / 100, z: Math.round(raw.mz * 100) / 100,
        y: Math.round(raw.yaw * 1000) / 1000, p: Math.round(raw.pitch * 1000) / 1000,
        b: raw.buttons,
      });
    }
    while (pendingInputs.length > 240) pendingInputs.shift();
  }

  sendAccum += dt;
  if (sendAccum >= 1 / 20 && outbox.length) {
    sendAccum = 0;
    net.send(C2S.INPUT, { i: outbox.splice(0, 12) });
  }

  // Decay the reconciliation offset so corrections read as a slide, not a jump.
  const decay = Math.exp(-dt * 12);
  visualOffset.x *= decay; visualOffset.y *= decay; visualOffset.z *= decay;

  // Interpolate everyone else INTERP_DELAY in the past.
  const renderTime = performance.now() / 1000 - INTERP_DELAY;
  for (const p of game.others.values()) {
    const buf = p.buffer;
    if (!buf.length) continue;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) { a = buf[i]; b = buf[i + 1]; break; }
    }
    const span = b.t - a.t;
    const t = span > 1e-4 ? clamp01((renderTime - a.t) / span) : 1;
    p.prev = { ...p.render };
    p.render.x = lerp(a.x, b.x, t);
    p.render.y = lerp(a.y, b.y, t);
    p.render.z = lerp(a.z, b.z, t);
    p.render.yaw = lerpAngle(a.yaw, b.yaw, t);
    p.render.pitch = lerp(a.pitch, b.pitch, t);
    const dx = p.render.x - (p.prev.x ?? p.render.x);
    const dz = p.render.z - (p.prev.z ?? p.render.z);
    p.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
  }

  audio.setListener(localEye(), game.me.yaw);
  if (game.phase === Phase.HUNT) {
    audio.setTension(clamp01(1 - game.timeLeft / (MODES[game.modeId]?.hunt || 180)));
  }
}

// ---------------------------------------------------------------- drawing --
function cameraTransform() {
  const eye = localEye();
  eye.x += visualOffset.x; eye.y += visualOffset.y; eye.z += visualOffset.z;
  const fov = (input.settings.fov || 78) * Math.PI / 180;

  if (!game.thirdPerson) return { pos: eye, yaw: game.me.yaw, pitch: game.me.pitch, fov };

  // Third person for hiders: pull back along the view ray, stopping short of
  // whatever the camera would otherwise clip through.
  const dir = dirFromAngles(game.me.yaw, game.me.pitch);
  const back = { x: -dir.x, y: -dir.y, z: -dir.z };
  let dist = 3.1;
  const hit = raycast(game.world, eye, back, dist + 0.4, { opaqueOnly: false });
  if (hit.hit) dist = Math.max(0.55, hit.t - 0.3);
  return {
    pos: { x: eye.x + back.x * dist, y: eye.y + back.y * dist + 0.18, z: eye.z + back.z * dist },
    yaw: game.me.yaw, pitch: game.me.pitch, fov,
  };
}

function drawChameleon(pos, yaw, pitch, paint, pose, stance, opts) {
  const parts = buildChameleon(paint, pose, animT, stance, opts);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (const part of parts) {
    const ox = part.off.x * cy + part.off.z * sy;
    const oz = -part.off.x * sy + part.off.z * cy;
    renderer.drawInstance(
      part.type,
      { x: pos.x + ox, y: pos.y + part.off.y, z: pos.z + oz },
      part.size,
      [yaw + (part.yaw || 0), part.pitch || 0, part.roll || 0],
      part.colour,
      part.params,
    );
  }
}

function render(dt) {
  const now = performance.now() / 1000;
  const cam = cameraTransform();
  renderer.beginFrame(cam, now);

  // Blackout mode hands the hunters a torch and takes everything else away.
  if (MODES[game.modeId]?.blackout && game.me.role === Role.SEEKER) {
    const dir = dirFromAngles(game.me.yaw, game.me.pitch);
    renderer.setTorch({ pos: localEye(), dir, angle: 0.42, color: [1, 0.95, 0.85] });
  } else {
    renderer.setTorch(null);
  }

  for (const p of game.others.values()) {
    if (!p.alive) continue;
    drawChameleon(p.render, p.render.yaw, p.render.pitch, p.paint, p.pose, p.stance, {
      moving: (p.speed || 0) > 0.6,
      speed: p.speed || 0,
      tagged: !!(p.flags & 2),
      emote: p.emote,
    });
  }

  if (game.me.alive && game.thirdPerson) {
    const pos = {
      x: game.me.pos.x + visualOffset.x,
      y: game.me.pos.y + visualOffset.y,
      z: game.me.pos.z + visualOffset.z,
    };
    drawChameleon(pos, game.me.yaw, game.me.pitch, game.paint, game.pose, game.me.stance, {
      moving: Math.hypot(game.me.vel.x, game.me.vel.z) > 0.6,
      speed: Math.hypot(game.me.vel.x, game.me.vel.z),
      local: true,
    });
  }

  for (const d of decoys) {
    if (d.until < now) continue;
    drawChameleon(d.p, d.yaw, 0, d.paint, 'idle', Stance.STAND, { moving: false });
  }

  for (const t of tracers) {
    if (t.until < now) continue;
    renderer.drawTracer(t.from, t.to, t.color, 0.028);
  }
  for (const s of splashes) {
    if (s.until < now) continue;
    const life = clamp01((s.until - now) / 4);
    renderer.drawInstance(2, s.p, { x: s.size, y: s.size * 0.4, z: s.size }, 0, s.color,
      [0.6, 0, 0.6, 0.25 + life * 0.6]);
  }
  for (const r of reveals) {
    if (r.until < now) continue;
    renderer.drawSprite(r.p, 0.7, 0.7, [1, 0.42, 0.55], 1, clamp01((r.until - now) / 2.2));
    renderer.addLight(r.p, [1, 0.4, 0.5], 6, 1.2);
  }
  for (const p of pings) {
    if (p.until < now) continue;
    const t = 1 - (p.until - now) / 1.4;
    renderer.drawSprite(p.p, p.r * t * 2, p.r * t * 2, [0.55, 0.85, 1], 1, (1 - t) * 0.5);
  }
  prune(tracers, now); prune(splashes, now); prune(reveals, now); prune(decoys, now); prune(pings, now);

  renderer.endFrame();
}

function prune(list, now) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].until < now) list.splice(i, 1);
}

// ------------------------------------------------------------------ loop --
function frame() {
  const now = performance.now() / 1000;
  const elapsed = now - lastFrame;
  lastFrame = now;
  // Two different clamps on purpose. The simulation gets the real elapsed time
  // (bounded, so a backgrounded tab does not bank half a minute of movement)
  // and slices it into legal inputs itself; animation gets a tighter clamp so
  // one stutter does not teleport a walk cycle.
  const simDt = clamp(elapsed, 1 / 480, 0.6);
  const dt = clamp(elapsed, 1 / 480, 0.1);
  animT += dt;

  step(simDt);
  // The menu and lobby only show a still scene behind the panels, so there is
  // no reason to redraw them at full rate - it burns a laptop battery for
  // nothing, and on a shared machine it starves whatever else is running.
  const idleScreen = ui.screen !== 'play' && !previewMode;
  const renderDue = !idleScreen || now - lastRender > 0.05;
  if (game.world && renderDue) {
    lastRender = now;
    render(dt);
  }

  hud.update({
    phase: game.phase,
    timeLeft: game.timeLeft,
    hiders: game.hiders,
    hunters: game.hunters,
    myRole: game.me.role,
    alive: game.me.alive,
    stance: game.me.stance,
    stamina: game.me.stamina,
    blend: game.me.blend,
    blendTier: game.me.blendTier,
    blendHint: blendHint(),
    gun: game.me.gun,
    ammo: game.me.ammo,
    ammoMax: game.me.ammoMax,
    reload: game.me.reload,
    cooldowns: game.me.cooldowns,
    thirdPerson: game.thirdPerson,
    roundInfo: game.roomCode ? `Room ${game.roomCode} · Round ${game.round}/${game.rounds}` : '',
    me: game.me,
    others: game.others,
    now,
  }, renderer, dt);

  paintUI.tick();

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) {
    fps = fpsFrames / fpsAccum;
    fpsAccum = 0; fpsFrames = 0;
    if (settings.showFps && net) {
      hud.perf(`${fps.toFixed(0)} fps\n${renderer.stats.draws} draws\n${renderer.stats.instances} instances\n${Math.round(net.state.rtt * 1000)} ms`);
    }
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

function blendHint() {
  if (game.me.role !== Role.HIDER) return '';
  if (!game.world) return '';
  if (game.me.blend >= 0.9) return 'Hold still and you will not be found.';
  if (game.me.blend >= 0.68) return 'Good match. Break your outline with a pose.';
  if (game.me.blend >= 0.42) return 'Get closer to cover, then repaint.';
  return 'Press Q and sample something next to you.';
}

// -------------------------------------------------------------- game API --
Object.assign(game, {
  sendPaint() {
    net.send(C2S.PAINT, { paint: game.paint });
    audio.play('paint');
  },
  sendChat(text) { net.send(C2S.CHAT, { text }); },
  useAbility(id) {
    net.send(C2S.ABILITY, { ability: id });
    if (id === 'mimic' && game.world) {
      // Predict locally so the wheel updates instantly; the server's version
      // arrives a moment later and wins.
      game.paint = { ...game.paint, ...autoPaint(game.world, game.me.pos) };
      paintUI.refresh();
    }
  },
  requestLock() {
    if (ui.screen === 'play' && !paintUI.open) input.requestLock();
  },
  onPaintScreenToggled() { /* hook for future camera changes */ },
});

// ------------------------------------------------------------------ boot --
function wireInput() {
  input.on('fire', () => {
    if (ui.screen !== 'play' || paintUI.open || !game.me.alive) return;
    if (game.me.role !== Role.SEEKER || game.phase !== Phase.HUNT || !game.released) return;
    if (game.me.ammo <= 0 || game.me.reload > 0) { audio.play('uiClick'); return; }
    const dir = dirFromAngles(game.me.yaw, game.me.pitch);
    net.send(C2S.SHOOT, { d: [dir.x, dir.y, dir.z], q: inputSeq });
    // Local muzzle flash; the authoritative tracer comes back as an event.
    const eye = localEye();
    renderer.addLight(eye, [1, 0.9, 0.6], 4, 1.4);
  });

  input.on('key', ({ code, action }) => {
    if (hud.chatOpen) return;
    switch (action) {
      case 'paint':
        if (canPaint()) paintUI.toggle();
        else ui.toast('You can only repaint during prep.', 'warn', 2000);
        break;
      case 'pose':
        if (game.me.role === Role.HIDER && game.me.alive) poseWheel.toggle(game.pose);
        break;
      case 'emote':
        if (game.me.alive) emoteWheel.toggle();
        break;
      case 'reload': net.send(C2S.RELOAD, {}); break;
      case 'scan': net.send(C2S.ABILITY, { ability: game.me.role === Role.SEEKER ? 'scan' : 'mimic' }); break;
      case 'ability': net.send(C2S.ABILITY, { ability: game.me.role === Role.SEEKER ? 'thermal' : 'decoy' }); break;
      case 'pick': game.useAbility('mimic'); break;
      case 'camera':
        if (game.me.role === Role.HIDER || game.phase !== Phase.HUNT) game.thirdPerson = !game.thirdPerson;
        else ui.toast('Hunters are first person only.', 'warn', 1800);
        break;
      case 'map': hud.toggleMinimap(document.getElementById('minimap').classList.contains('hidden')); break;
      case 'scoreboard': hud.toggleScoreboard(true); break;
      case 'chat':
        if (ui.screen === 'play') { hud.openChat(true); input.releaseLock(); }
        break;
      default: break;
    }
    if (code === 'Escape') {
      if (paintUI.open) paintUI.setOpen(false);
      else if (poseWheel.open) poseWheel.setOpen(false);
      else if (emoteWheel.open) emoteWheel.setOpen(false);
      else if (ui.screen === 'play') { input.releaseLock(); ui.show('lobby'); }
    }
    if (/^Digit[1-5]$/.test(code) && game.me.role === Role.SEEKER) {
      const gun = Object.keys(GUNS)[Number(code.slice(5)) - 1];
      if (gun) { net.send(C2S.SWITCH_GUN, { gun }); game.me.gun = gun; }
    }
  });

  input.on('keyup', ({ action }) => {
    if (action === 'scoreboard') hud.toggleScoreboard(false);
  });

  input.on('lock', ({ locked }) => {
    document.body.classList.toggle('playing', locked);
  });

  // Touch buttons.
  for (const b of document.querySelectorAll('[data-touch]')) {
    const kind = b.dataset.touch;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (kind === 'fire') { input.setTouchFire(true); input.on; }
      if (kind === 'paint' && canPaint()) paintUI.toggle();
    }, { passive: false });
    b.addEventListener('touchend', () => { if (kind === 'fire') input.setTouchFire(false); });
  }
}

function canPaint() {
  if (game.me.role !== Role.HIDER || !game.me.alive) return false;
  if (game.phase === Phase.PREP) return true;
  return !!MODES[game.modeId]?.repaintDuringHunt && game.phase === Phase.HUNT;
}

function wireUI() {
  ui.bind({
    onQuickMatch: () => net.send(C2S.QUICK_MATCH, {}),
    onCreateRoom: (opts) => net.send(C2S.CREATE_ROOM, {
      isPrivate: !!opts.isPrivate,
      bots: opts.bots ?? 3,
      name: `${game.name}'s room`,
    }),
    onJoin: (code) => net.send(C2S.JOIN_ROOM, { code }),
    onListRooms: () => net.send(C2S.LIST_ROOMS, {}),
    onSetOption: (patch) => net.send(C2S.SET_OPTIONS, patch),
    onReady: () => {
      const room = ui.room;
      const me = room?.players.find((p) => p.id === game.playerId);
      net.send(C2S.SET_READY, { ready: !me?.ready });
    },
    onStart: () => net.send(C2S.START_MATCH, {}),
    onLeave: () => { net.send(C2S.LEAVE_ROOM, {}); ui.show('menu'); history.replaceState(null, '', '/'); },
    onChat: (text) => net.send(C2S.CHAT, { text }),
    onInvite: (username) => net.send(C2S.INVITE, { username }),
    onAcceptInvite: (code) => net.send(C2S.INVITE_REPLY, { accept: true, code }),
    onIdentity: (name, username) => {
      game.name = name; game.username = username;
      store.set('mc.name', name); store.set('mc.username', username);
      net.send(C2S.HELLO, { v: 3, name, username });
    },
    onSetting: (patch) => {
      if ('renderScale' in patch) { settings.renderScale = patch.renderScale; store.set('mc.renderScale', patch.renderScale); resize(); }
      if ('showFps' in patch) { settings.showFps = patch.showFps; store.set('mc.showFps', patch.showFps); hud.showPerf(patch.showFps); }
      for (const k of ['master', 'sfx', 'music']) {
        if (k in patch) {
          settings.volumes[k] = patch[k];
          store.set('mc.volumes', settings.volumes);
          audio.setVolume(settings.volumes.master, settings.volumes.sfx, settings.volumes.music);
        }
      }
      const passthrough = {};
      for (const k of ['sensitivity', 'fov', 'invertY', 'toggleCrouch']) if (k in patch) passthrough[k] = patch[k];
      if (Object.keys(passthrough).length) input.updateSettings(passthrough);
    },
    onRebind: (action, code) => input.rebind(action, code),
    onResetBinds: () => input.resetBinds(),
    onResultsContinue: () => {
      ui.show(game.phase === Phase.MATCH_END || game.phase === Phase.LOBBY ? 'lobby' : 'play');
      if (ui.screen === 'play') input.requestLock();
    },
  });
}

async function boot() {
  try {
    renderer = createRenderer(canvas);
  } catch (err) {
    document.getElementById('bootStatus').innerHTML =
      `<b style="color:#ff6b6b">${err.message}</b><br>Try Chrome, Edge or Firefox with hardware acceleration on.`;
    return;
  }

  input = createInput(canvas);
  game.input = input;
  audio = createAudio();
  audio.setVolume(settings.volumes.master, settings.volumes.sfx, settings.volumes.music);
  ui = createUI(game);
  hud = createHUD(game);
  paintUI = createPaintUI(game);
  poseWheel = createWheel('poseWheel', POSES, (id) => {
    game.pose = id;
    net.send(C2S.POSE, { pose: id });
  });
  emoteWheel = createWheel('emoteWheel', EMOTES, (id) => net.send(C2S.EMOTE, { emote: id }));

  ui.setIdentity(game.name, game.username);
  ui.syncSettings({ ...input.settings, renderScale: settings.renderScale, showFps: settings.showFps }, settings.volumes);
  hud.showPerf(settings.showFps);

  // Show something behind the menu straight away rather than a black void.
  const params = new URLSearchParams(location.search);
  const preview = params.get('preview');
  setMap(preview && MAP_LIST.some((m) => m.id === preview) ? preview : MAP_LIST[0].id);
  const spawn = game.mapDef.spawns.seekers[0] || [0, 0, 8];
  game.me.pos = { x: spawn[0], y: spawn[1] + 0.1, z: spawn[2] };
  game.me.pos.y = groundHeightAt(game.world, game.me.pos.x, game.me.pos.z, game.me.pos.y + 4) + 0.05;
  game.thirdPerson = true;

  // ?preview=<mapId> flies a slow orbit through a map with no server needed -
  // it is how the map screenshots in tools/e2e.js are taken.
  if (preview) {
    previewMode = true;
    game.me.alive = true;   // render a chameleon so the model gets eyes on it too
    game.me.role = 1;
    ui.show('menu');
    document.getElementById('screens').style.display = 'none';
    document.getElementById('hud').classList.add('hidden');
  }

  wireInput();
  wireUI();
  input.attachTouch(document.body);
  window.addEventListener('resize', resize);
  resize();

  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, () => audio.unlock(), { once: true });
  }

  if (!previewMode) {
    connect();
    ui.bootStatus('Connecting…');
  }

  // Inspection hook: the e2e harness reads it, and it is the fastest way to
  // poke at a live game from the devtools console.
  window.__mcDebug = {
    game,
    pos: () => ({ ...game.me.pos }),
    stats: () => ({ ...renderer.stats }),
    fps: () => fps,
    phase: () => game.phase,
    map: () => game.mapDef?.id,
    others: () => [...game.others.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, ...p.render })),
    blend: () => (game.world ? computeBlend(game.world, game.me.pos, game.paint) : null),
  };

  requestAnimationFrame(frame);
}

boot();
