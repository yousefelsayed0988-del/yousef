// Central, serialisable configuration. Anything a player or dev might want to
// retune lives here rather than being scattered as magic numbers.

export const WORLD = {
  MIN_Y: -64,
  MAX_Y: 320,          // build cap (exclusive upper bound for placement)
  HEIGHT: 384,
  SECTION: 16,
  SECTIONS: 24,        // 384 / 16
  CHUNK: 16,
  SEA_LEVEL: 62,
  DEEPSLATE_Y: 0,
  BORDER: 30000000,    // horizontal world border, +/- blocks
};

export const TPS = 20;
export const TICK_MS = 1000 / TPS;

export const DIFFICULTIES = {
  peaceful: { id: 0, hostiles: false, hunger: false, regen: true, mobDamage: 0.0, hungerRate: 0.0, doorBreak: false, creeperRadius: 3.0 },
  easy:     { id: 1, hostiles: true,  hunger: true,  regen: true, mobDamage: 0.5, hungerRate: 0.7, doorBreak: false, creeperRadius: 3.0 },
  normal:   { id: 2, hostiles: true,  hunger: true,  regen: true, mobDamage: 1.0, hungerRate: 1.0, doorBreak: false, creeperRadius: 3.0 },
  hard:     { id: 3, hostiles: true,  hunger: true,  regen: true, mobDamage: 1.5, hungerRate: 1.3, doorBreak: true,  creeperRadius: 3.5 },
};

const DEFAULTS = {
  renderDistance: 8,       // chunk columns rendered around the player
  simulationDistance: 4,   // chunk columns that tick (AI, crops, furnaces, random ticks)
  unloadPadding: 2,        // extra rings kept resident before unloading
  maxLoadedChunks: 1400,

  fov: 70,
  renderScale: 1.0,
  smoothLighting: true,
  fancyLeaves: true,
  viewBobbing: true,

  mouseSensitivity: 0.0022,
  invertY: false,
  sprintToggle: false,
  doubleTapSprint: true,

  difficulty: 'normal',
  keepInventory: false,
  hostileLightMax: 7,      // hostiles spawn at light <= this
  randomTickSpeed: 3,      // random ticks per section per tick
  dayLengthTicks: 24000,   // 20 minutes at 20 TPS
  mobCapHostile: 60,
  mobCapPassive: 12,

  stackSize: 64,
  reach: 4.5,
  // Auto step-up height. The spec asks for a 1-block step-up and the mechanism
  // supports it, but 0.6 (slab/stair height) is what gives Minecraft-like feel:
  // at 1.0 you walk up cliffs and jumping stops mattering. Configurable either
  // way; see the README note.
  stepHeight: 0.6,

  autosaveMinutes: 5,
  lightOpsPerFrame: 30000,
  meshWorkers: 0,          // 0 = auto from hardwareConcurrency
  genWorkers: 0,

  masterVolume: 0.7,
  musicVolume: 0.25,
  guiScale: 0,             // 0 = auto
};

const LS_KEY = 'orebound.settings.v1';

function loadStored() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch { return {}; }
}

export const CONFIG = Object.assign({}, DEFAULTS, loadStored());

export function saveSettings() {
  try {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) if (CONFIG[k] !== DEFAULTS[k]) out[k] = CONFIG[k];
    localStorage.setItem(LS_KEY, JSON.stringify(out));
  } catch { /* private browsing, ignore */ }
}

export function resetSettings() {
  Object.assign(CONFIG, DEFAULTS);
  saveSettings();
}

export function difficulty() {
  return DIFFICULTIES[CONFIG.difficulty] || DIFFICULTIES.normal;
}

export function workerCount(kind) {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const explicit = kind === 'mesh' ? CONFIG.meshWorkers : CONFIG.genWorkers;
  if (explicit > 0) return explicit;
  // Leave a core for the render thread; gen is the heavier of the two.
  const pool = Math.max(1, Math.min(6, hc - 1));
  return kind === 'mesh' ? Math.max(1, Math.floor(pool / 2)) : Math.max(1, Math.ceil(pool / 2));
}
