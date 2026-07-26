// Wire protocol. JSON over WebSocket, with hard limits enforced before any
// payload is looked at - a malformed or oversized frame must cost the server
// nothing but a disconnect.

import { ANTICHEAT, PROTOCOL_VERSION } from './constants.js';

// -- client -> server --------------------------------------------------------
export const C2S = {
  HELLO: 'hello',
  CREATE_ROOM: 'create',
  JOIN_ROOM: 'join',
  QUICK_MATCH: 'quick',
  LEAVE_ROOM: 'leave',
  LIST_ROOMS: 'rooms',
  SET_OPTIONS: 'opts',      // host only: map, mode, rounds, bots, privacy
  SET_READY: 'ready',
  START_MATCH: 'start',     // host only
  INPUT: 'in',              // batched movement inputs
  PAINT: 'paint',
  POSE: 'pose',
  EMOTE: 'emote',
  SHOOT: 'shoot',
  RELOAD: 'reload',
  ABILITY: 'abil',
  SWITCH_GUN: 'gun',
  CHAT: 'chat',
  INVITE: 'invite',         // by username
  INVITE_REPLY: 'inviteAck',
  FRIEND: 'friend',         // add/remove/list
  REPORT: 'report',
  VOTE_KICK: 'votekick',
  KICK: 'kick',             // host only
  INTEGRITY: 'integrity',   // response to a challenge
  PING: 'ping',
};

// -- server -> client --------------------------------------------------------
export const S2C = {
  WELCOME: 'welcome',
  ERROR: 'err',
  ROOM: 'room',             // full room/lobby state
  ROOM_LIST: 'roomList',
  MATCH: 'match',           // phase transitions + config
  SNAPSHOT: 'snap',         // per-tick world state (visibility filtered)
  CORRECTION: 'corr',       // authoritative position for the local player
  EVENT: 'evt',             // tags, shots, splashes, sounds, reveals
  CHAT: 'chat',
  INVITE: 'invite',
  FRIENDS: 'friends',
  SCORES: 'scores',
  KICKED: 'kicked',
  INTEGRITY: 'integrity',   // challenge
  PONG: 'pong',
  ANTICHEAT: 'ac',          // warning / strike feedback for the local player
};

// Event ids carried inside S2C.EVENT.
export const EV = {
  SHOT: 1,
  TAG: 2,
  SPLASH: 3,
  FOOTSTEP: 4,
  REVEAL: 5,
  PAINT_CHANGE: 6,
  EMOTE: 7,
  ABILITY: 8,
  JOIN: 9,
  LEAVE: 10,
  PHASE: 11,
  DECOY: 12,
  RELOAD: 13,
  SCAN: 14,
};

export const ERR = {
  BAD_VERSION: 'bad_version',
  ROOM_FULL: 'room_full',
  NO_ROOM: 'no_room',
  IN_PROGRESS: 'in_progress',
  NOT_HOST: 'not_host',
  RATE_LIMITED: 'rate_limited',
  BAD_PAYLOAD: 'bad_payload',
  BANNED: 'banned',
  NAME_TAKEN: 'name_taken',
  USER_OFFLINE: 'user_offline',
};

export function encode(msg) {
  return JSON.stringify(msg);
}

/**
 * Parse an inbound frame. Never throws: returns null for anything that is not
 * a plain object with a string `t`, or that busts the size/shape budget.
 */
export function decode(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.length > ANTICHEAT.maxMessageBytes) return null;
  let msg;
  try { msg = JSON.parse(raw); } catch { return null; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  if (typeof msg.t !== 'string' || msg.t.length > 24) return null;
  if (!withinDepth(msg, 6)) return null;
  return msg;
}

function withinDepth(v, budget) {
  if (budget < 0) return false;
  if (Array.isArray(v)) {
    if (v.length > 256) return false;
    for (const item of v) if (!withinDepth(item, budget - 1)) return false;
    return true;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length > 48) return false;
    for (const k of keys) if (!withinDepth(v[k], budget - 1)) return false;
    return true;
  }
  return true;
}

// -- validators used by the server on every inbound field --------------------
export const num = (v, lo, hi, dflt = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

export const int = (v, lo, hi, dflt = 0) => Math.round(num(v, lo, hi, dflt));

export const bool = (v) => v === true || v === 1;

export function str(v, maxLen, dflt = '') {
  if (typeof v !== 'string') return dflt;
  return v.slice(0, maxLen);
}

// Control characters, zero-width joiners and bidi overrides can all be used to
// forge a name that renders as somebody else's, so strip them before storing.
function stripInvisible(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) continue;   // control
    if (c >= 0x200b && c <= 0x200f) continue;             // zero width + marks
    if (c >= 0x202a && c <= 0x202e) continue;             // bidi overrides
    if (c >= 0x2060 && c <= 0x2064) continue;             // invisible operators
    if (c === 0xfeff) continue;                           // BOM
    out += s[i];
  }
  return out;
}

/** Names: printable, trimmed, no control characters or lookalike padding. */
export function sanitizeName(v, dflt = 'Chameleon') {
  let s = stripInvisible(str(v, ANTICHEAT.maxNameLength * 2, ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > ANTICHEAT.maxNameLength) s = s.slice(0, ANTICHEAT.maxNameLength);
  return s.length >= 2 ? s : dflt;
}

export function sanitizeChat(v) {
  return stripInvisible(str(v, ANTICHEAT.maxChatLength, '')).trim();
}

/** Usernames are the invite key, so they must fold to a unique handle. */
export function normalizeUsername(v) {
  return sanitizeName(v, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/** rgb triple in 0..1, rejecting NaN/out-of-range from a patched client. */
export function sanitizeColor(v, dflt = [1, 1, 1]) {
  if (!Array.isArray(v) || v.length < 3) return dflt.slice();
  return [num(v[0], 0, 1, 1), num(v[1], 0, 1, 1), num(v[2], 0, 1, 1)];
}

export const VERSION = PROTOCOL_VERSION;
