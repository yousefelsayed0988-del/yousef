// Tiny JSON-file store for accounts, stats and bans. Debounced writes, atomic
// rename, and it degrades to memory-only if the disk is not writable - losing
// progression must never take the server down.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(HERE, '..', 'data', 'store.json');

export function createStore(filePath = DEFAULT_PATH, log = () => {}) {
  let data = { users: {}, bans: {}, version: 1 };
  let dirty = false;
  let writable = true;
  let timer = null;

  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') data = { users: {}, bans: {}, ...parsed };
    }
  } catch (err) {
    log(`store: could not read ${filePath} (${err.message}), starting empty`);
  }

  function flush() {
    if (!dirty || !writable) return;
    dirty = false;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, filePath);
    } catch (err) {
      writable = false;
      log(`store: writes disabled (${err.message}); progression is memory-only`);
    }
  }

  function touch() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, 2500);
    timer.unref?.();
  }

  return {
    /** Fetch (creating if needed) the record for a normalised username. */
    user(username) {
      if (!username) return null;
      if (!data.users[username]) {
        data.users[username] = {
          username, xp: 0, level: 1, matches: 0, wins: 0, tags: 0,
          survived: 0, bestBlend: 0, unlocked: ['standard'], friends: [],
          created: Date.now(),
        };
        touch();
      }
      return data.users[username];
    },
    save(user) {
      if (!user?.username) return;
      data.users[user.username] = user;
      touch();
    },
    isBanned(key) {
      const b = data.bans[key];
      if (!b) return false;
      if (b.until && b.until < Date.now()) { delete data.bans[key]; touch(); return false; }
      return true;
    },
    ban(key, reason, minutes = 60) {
      data.bans[key] = { reason, until: Date.now() + minutes * 60000, at: Date.now() };
      touch();
    },
    stats() {
      return { users: Object.keys(data.users).length, bans: Object.keys(data.bans).length, writable };
    },
    flush,
  };
}

/** XP curve: each level costs ~18% more than the last. */
export function levelFromXp(xp, base = 900) {
  let level = 1, need = base, acc = 0;
  while (xp >= acc + need && level < 99) {
    acc += need;
    need = Math.round(need * 1.18);
    level++;
  }
  return { level, into: xp - acc, need };
}
