// Shared tunables + enums. Imported unmodified by the browser client AND the
// authoritative server, so the two simulate identical physics. Never fork a
// number out of this file: a divergence here shows up as rubber-banding.

export const PROTOCOL_VERSION = 3;

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 15;
export const SNAPSHOT_DT = 1 / SNAPSHOT_RATE;
export const MAX_PLAYERS = 16;
export const MAX_INPUTS_PER_PACKET = 12;
export const INTERP_DELAY = 0.12; // seconds of buffered snapshots on the client

export const Phase = {
  LOBBY: 0,
  INTERMISSION: 1,
  PREP: 2,
  HUNT: 3,
  ROUND_END: 4,
  MATCH_END: 5,
};
export const PhaseName = ['LOBBY', 'INTERMISSION', 'PREP', 'HUNT', 'ROUND_END', 'MATCH_END'];

export const Role = { SPECTATOR: 0, HIDER: 1, SEEKER: 2 };
export const RoleName = ['Spectator', 'Hider', 'Hunter'];

export const Stance = { STAND: 0, CROUCH: 1, PRONE: 2 };
export const StanceName = ['Standing', 'Crouched', 'Prone'];

// ---------------------------------------------------------------- movement --
export const MOVE = {
  radius: 0.34,
  height: [1.62, 1.0, 0.5], // indexed by Stance
  eye: [1.46, 0.86, 0.38],
  speed: [4.35, 1.95, 1.05],
  sprintMul: 1.5,
  seekerMul: 1.06, // hunters walk a touch faster than hiders
  accelGround: 60,
  accelAir: 14,
  friction: 10,
  gravity: 22,
  jumpVel: 6.5,
  stepHeight: 0.45,
  stanceChangeTime: 0.22,
  // Anti-cheat ceilings. The server clamps to these before it ever trusts a
  // client-authored input; they are deliberately a hair above what legal
  // movement can produce so that latency jitter is not read as cheating.
  maxHorizSpeed: 4.35 * 1.5 * 1.06 + 1.6,
  maxVertSpeed: 26,
  maxInputDt: 0.1,
  minInputDt: 1 / 240,
};

export const STAMINA = {
  max: 100,
  drain: 24, // per second while sprinting
  regen: 16,
  regenDelay: 0.9,
  sprintMin: 12, // can't start a sprint below this
};

// ------------------------------------------------------------------- paint --
export const PAINT = {
  parts: ['body', 'head', 'tail', 'legs', 'crest', 'eyes'],
  patterns: ['solid', 'stripes', 'spots', 'scales', 'checker', 'gradient', 'noise'],
  // How close (0..1 in linear rgb distance) the paint must be to nearby
  // surfaces before the blend meter calls it a match.
  blendPerfect: 0.06,
  blendGood: 0.16,
  blendPoor: 0.34,
  sampleRadius: 4.5, // metres the eyedropper / blend meter looks around
  // Painting is only legal while prep is running (or, in chaos mode, always).
  repaintCooldown: 0.08,
};

// -------------------------------------------------------------------- guns --
// One clean hit tags a hider. Guns differ in reach, cadence and forgiveness.
export const GUNS = {
  standard: {
    id: 'standard', name: 'Standard Paintgun', rpm: 160, range: 55, spread: 0.35,
    pellets: 1, mag: 24, reload: 1.5, zoom: 1, tracer: '#7cf2c4', unlock: 0,
    desc: 'Reliable single-shot marker. No surprises.',
  },
  express: {
    id: 'express', name: 'Express Blaster', rpm: 480, range: 30, spread: 1.9,
    pellets: 1, mag: 45, reload: 2.1, zoom: 1, tracer: '#ffd166', unlock: 3,
    desc: 'Fire-hose cadence, short reach. Great in cluttered rooms.',
  },
  scatter: {
    id: 'scatter', name: 'Scatter Duster', rpm: 70, range: 18, spread: 5.5,
    pellets: 7, mag: 10, reload: 2.4, zoom: 1, tracer: '#ff8fab', unlock: 6,
    desc: 'Sprays a cone of paint. Flushes out whole shelves at once.',
  },
  marksman: {
    id: 'marksman', name: 'Marksman Rifle', rpm: 48, range: 120, spread: 0.06,
    pellets: 1, mag: 6, reload: 2.6, zoom: 3.2, tracer: '#9bb8ff', unlock: 10,
    desc: 'Scoped and surgical. Punishes a bad silhouette from across the map.',
  },
  pulse: {
    id: 'pulse', name: 'Pulse Scanner', rpm: 100, range: 40, spread: 0.5,
    pellets: 1, mag: 16, reload: 1.8, zoom: 1.4, tracer: '#c58cff', unlock: 15,
    desc: 'Slower mag, but every shot leaves a lingering reveal splash.',
  },
};
export const GUN_IDS = Object.keys(GUNS);

// Hunter utility abilities (cooldown driven, server validated).
export const ABILITY = {
  scan: { id: 'scan', name: 'Sonar Ping', cooldown: 22, radius: 16, duration: 1.6 },
  thermal: { id: 'thermal', name: 'Heat Sweep', cooldown: 35, radius: 26, duration: 2.4 },
};

// Hider abilities.
export const HIDER_ABILITY = {
  mimic: { id: 'mimic', name: 'Auto-Mimic', cooldown: 18, radius: PAINT.sampleRadius },
  decoy: { id: 'decoy', name: 'Shed Skin', cooldown: 40, life: 25 },
  dash: { id: 'dash', name: 'Tail Dash', cooldown: 12, impulse: 8.5, duration: 0.22 },
};

// ------------------------------------------------------------------- modes --
// prep/hunt are seconds. seekerRatio is the fraction of the lobby that hunts.
export const MODES = {
  normal: {
    id: 'normal', name: 'Normal', short: 'Tagged hiders are out.',
    desc: 'Classic hide and seek. Hunters win by tagging every chameleon before the clock dies.',
    prep: 45, hunt: 180, seekerRatio: 0.25, infection: false, versus: false,
    hidersCanMove: true, freezeBonus: true, blackout: false, gun: null,
  },
  infection: {
    id: 'infection', name: 'Infection', short: 'Tagged hiders switch sides.',
    desc: 'Every hider you tag stands up as a hunter. The lobby flips fast.',
    prep: 40, hunt: 200, seekerRatio: 0.15, infection: true, versus: false,
    hidersCanMove: true, freezeBonus: true, blackout: false, gun: null,
  },
  versus: {
    id: 'versus', name: 'Versus', short: 'Everyone hides, then everyone hunts.',
    desc: 'No teams. Paint up, then the whole lobby is released to hunt each other at once.',
    prep: 50, hunt: 170, seekerRatio: 0, infection: false, versus: true,
    hidersCanMove: true, freezeBonus: false, blackout: false, gun: null,
  },
  chaos: {
    id: 'chaos', name: 'Chaos', short: 'Repaint any time, no freeze bonus.',
    desc: 'Paint stays unlocked during the hunt. Keep moving, keep changing.',
    prep: 30, hunt: 190, seekerRatio: 0.25, infection: false, versus: false,
    hidersCanMove: true, freezeBonus: false, blackout: false, gun: null,
    repaintDuringHunt: true,
  },
  blackout: {
    id: 'blackout', name: 'Blackout', short: 'Lights out, hunters carry torches.',
    desc: 'The map goes dark. Hunters get a flashlight cone and nothing else.',
    prep: 45, hunt: 190, seekerRatio: 0.25, infection: false, versus: false,
    hidersCanMove: true, freezeBonus: true, blackout: true, gun: 'standard',
  },
  marksman: {
    id: 'marksman', name: 'One Shot', short: 'Hunters get six bullets. Total.',
    desc: 'Marksman rifles, tiny magazines, no resupply. Every trigger pull is a commitment.',
    prep: 45, hunt: 200, seekerRatio: 0.3, infection: false, versus: false,
    hidersCanMove: true, freezeBonus: true, blackout: false, gun: 'marksman',
    limitedAmmo: 6,
  },
};
export const MODE_IDS = Object.keys(MODES);
export const DEFAULT_MODE = 'normal';

export const ROUND = {
  intermission: 12,
  roundEnd: 9,
  matchEnd: 20,
  roundsPerMatch: 5,
  minPlayersToStart: 1, // bots pad the lobby below this
  seekerReleaseGrace: 3, // hunters stay frozen this long after PREP ends
};

// ------------------------------------------------------------------ scoring --
export const SCORE = {
  tag: 120,
  survive: 260,
  survivePerSecond: 1.2,
  lastAlive: 180,
  perfectBlend: 90, // awarded when a hider ends the round above blendPerfect
  firstBlood: 60,
  assistReveal: 25,
  xpPerScore: 0.35,
  levelCurve: 900, // xp for level 2, scales ~1.18x per level
};

// ---------------------------------------------------------------- anti-cheat --
export const ANTICHEAT = {
  // Position resync: how far the client may drift from the server before the
  // server hard-snaps it back.
  snapDistance: 0.9,
  softCorrection: 0.06,
  // Strike thresholds. Strikes decay over time; hitting `kickStrikes` in the
  // window ejects the player from the room.
  strikeDecayPerSecond: 0.25,
  kickStrikes: 14,
  reportStrikes: 8,
  // Message flood control (per socket).
  maxMessagesPerSecond: 90,
  maxBytesPerSecond: 96 * 1024,
  maxMessageBytes: 16 * 1024,
  maxChatPerSecond: 1.5,
  maxChatLength: 180,
  maxNameLength: 18,
  // Movement validation.
  positionTolerance: 0.35, // metres of slack per tick before a strike
  speedTolerance: 1.35, // multiplier over the legal cap
  // Shot validation.
  fireRateTolerance: 0.88, // fraction of the nominal interval we accept
  maxPendingShots: 6,
  aimSnapWindow: 0.25, // seconds of aim history kept for snap detection
  aimSnapDegrees: 95, // degrees/frame that reads as a teleporting crosshair
  aimSnapStreak: 5,
  // Network visibility culling (the wallhack defence). A hider's transform is
  // only ever serialised to a hunter that could plausibly see them.
  pvsEnabled: true,
  pvsRadius: 3.5, // always-send bubble, so point-blank contact is never missed
  pvsFovDegrees: 118, // a little wider than any legal client FOV
  pvsGrace: 0.55, // keep sending for this long after visibility drops
  pvsRayHeights: [0.12, 0.5, 0.92], // fractions of hider height to sample
  integrityInterval: 30, // seconds between build-hash challenges
  integrityTimeout: 12,
};

export const NET = {
  defaultPort: 8080,
  heartbeatInterval: 5,
  timeout: 22,
  roomCodeLength: 5,
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // no I/O/0/1
  maxRooms: 500,
  maxRoomsPerIp: 8,
};

export const BOT = {
  names: [
    'Pip', 'Mossy', 'Chroma', 'Gecko', 'Basil', 'Sable', 'Tangerine', 'Juniper',
    'Zizzy', 'Kelp', 'Marbles', 'Pebble', 'Wisp', 'Cricket', 'Nori', 'Ochre',
  ],
  reactionMin: 0.18,
  reactionMax: 0.55,
  aimErrorMin: 0.6, // degrees
  aimErrorMax: 6.0,
};

export const DIFFICULTY = ['Easy', 'Normal', 'Hard', 'Nightmare'];

export const CHAT_COLORS = ['#7cf2c4', '#ffd166', '#ff8fab', '#9bb8ff', '#c58cff', '#8ce99a'];

export const EMOTES = [
  { id: 'wave', name: 'Wave', dur: 1.4 },
  { id: 'dance', name: 'Wiggle', dur: 2.6 },
  { id: 'sit', name: 'Sit', dur: 0, hold: true },
  { id: 'ball', name: 'Curl Up', dur: 0, hold: true },
  { id: 'flat', name: 'Flatten', dur: 0, hold: true },
  { id: 'statue', name: 'Statue', dur: 0, hold: true },
  { id: 'point', name: 'Point', dur: 1.2 },
  { id: 'taunt', name: 'Taunt', dur: 1.8 },
];

export const POSES = [
  { id: 'idle', name: 'Idle', stance: Stance.STAND },
  { id: 'crouch', name: 'Crouch', stance: Stance.CROUCH },
  { id: 'prone', name: 'Lie Flat', stance: Stance.PRONE },
  { id: 'wall', name: 'Wall Cling', stance: Stance.STAND },
  { id: 'ball', name: 'Curl Up', stance: Stance.CROUCH },
  { id: 'stack', name: 'Prop Stack', stance: Stance.CROUCH },
  { id: 'hang', name: 'Ceiling Hang', stance: Stance.STAND },
  { id: 'statue', name: 'Statue', stance: Stance.STAND },
];
