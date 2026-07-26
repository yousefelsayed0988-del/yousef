// Rooms, codes, share links, usernames and invites - everything between
// "opened the page" and "in a match". Also the message router: every inbound
// frame lands here after protocol.decode() has vouched for its shape.

import {
  NET, ANTICHEAT, MAX_PLAYERS, MODES, DEFAULT_MODE, Phase, ROUND, BOT, DIFFICULTY,
} from '../shared/constants.js';
import {
  C2S, S2C, ERR, EV, num, int, bool, str, sanitizeName, sanitizeChat,
  normalizeUsername, VERSION,
} from '../shared/protocol.js';
import { MAP_LIST, MAP_IDS, randomMapId } from '../shared/maps/index.js';
import { createMatch } from './match.js';
import { createStore, levelFromXp } from './persist.js';
import { mulberry32, hashString, shuffle, clamp } from '../shared/math.js';

const BOT_DIFFICULTY = 1; // index into DIFFICULTY, overridable per room

export function createDirectory(opts = {}) {
  const log = opts.log || (() => {});
  const store = opts.store || createStore(undefined, log);
  const rooms = new Map();       // CODE -> Room
  const byUsername = new Map();  // normalised username -> conn
  const conns = new Set();
  let nextConnId = 1;

  const now = () => (opts.now ? opts.now() : Date.now() / 1000);

  // ------------------------------------------------------------ utilities --
  function makeCode() {
    const a = NET.roomCodeAlphabet;
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < NET.roomCodeLength; i++) code += a[Math.floor(Math.random() * a.length)];
      if (!rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  function send(conn, type, payload) {
    if (!conn || conn.closed) return;
    try {
      conn.sock.send(JSON.stringify({ t: type, ...payload }));
    } catch (err) {
      log('send failed', err.message);
    }
  }

  function fail(conn, code, detail) {
    send(conn, S2C.ERROR, { code, detail: detail || '' });
  }

  function roomOf(conn) {
    return conn.roomCode ? rooms.get(conn.roomCode) : null;
  }

  function broadcast(room, type, payload, only) {
    for (const [pid, c] of room.conns) {
      if (only && !only.includes(pid)) continue;
      send(c, type, payload);
    }
  }

  // ------------------------------------------------------------ room model --
  function createRoom(host, options = {}) {
    if (rooms.size >= NET.maxRooms) return null;
    const code = makeCode();
    const mapId = MAP_IDS.includes(options.mapId) ? options.mapId : randomMapId();
    const modeId = MODES[options.modeId] ? options.modeId : DEFAULT_MODE;
    const room = {
      code,
      name: sanitizeName(options.name, `${host?.name || 'Someone'}'s room`),
      isPrivate: !!options.isPrivate,
      hostConnId: host?.id ?? null,
      conns: new Map(),          // playerId -> conn
      nextPlayerId: 1,
      createdAt: now(),
      lastActivity: now(),
      options: {
        mapId, modeId,
        rounds: clamp(int(options.rounds, 1, 15, ROUND.roundsPerMatch), 1, 15),
        bots: clamp(int(options.bots, 0, 15, 3), 0, MAX_PLAYERS - 1),
        difficulty: clamp(int(options.difficulty, 0, 3, BOT_DIFFICULTY), 0, 3),
        maxPlayers: clamp(int(options.maxPlayers, 2, MAX_PLAYERS, MAX_PLAYERS), 2, MAX_PLAYERS),
      },
      match: null,
      botIds: new Set(),
      votes: new Map(),
    };
    room.match = createMatch({
      mapId, modeId,
      rng: mulberry32(hashString(code)),
      now: now(),
      emit: (type, payload, to) => routeMatchMessage(room, type, payload, to),
      log,
      onKick: (player, report) => {
        const c = room.conns.get(player.id);
        log(`anticheat kick ${player.name} in ${room.code}: ${JSON.stringify(report)}`);
        if (c) {
          send(c, S2C.KICKED, { reason: 'anticheat', detail: report });
          store.ban(c.ip, 'anticheat', 30);
          leaveRoom(c);
        }
      },
    });
    room.match.setOptions({ rounds: room.options.rounds });
    rooms.set(code, room);
    log(`room ${code} created (${mapId}/${modeId})`);
    return room;
  }

  function routeMatchMessage(room, type, payload, to) {
    if (to == null) {
      for (const c of room.conns.values()) send(c, type, payload);
    } else if (Array.isArray(to)) {
      for (const pid of to) {
        const c = room.conns.get(pid);
        if (c) send(c, type, payload);
      }
    } else {
      const c = room.conns.get(to);
      if (c) send(c, type, payload);
    }
  }

  function syncBots(room) {
    const humans = room.conns.size;
    const want = clamp(room.options.bots, 0, room.options.maxPlayers - humans);
    // Remove surplus bots first.
    for (const id of [...room.botIds]) {
      if (room.botIds.size <= want) break;
      room.match.removePlayer(id);
      room.botIds.delete(id);
    }
    const used = new Set([...room.match.players.values()].map((p) => p.name));
    while (room.botIds.size < want) {
      const id = room.nextPlayerId++;
      const name = BOT.names.find((n) => !used.has(n)) || `Bot${id}`;
      used.add(name);
      room.match.addPlayer({ id, name, bot: true, difficulty: room.options.difficulty });
      room.botIds.add(id);
    }
  }

  function roomStatePayload(room) {
    const m = room.match;
    return {
      code: room.code,
      name: room.name,
      isPrivate: room.isPrivate,
      host: room.hostConnId,
      options: room.options,
      phase: m.state.phase,
      round: m.state.round,
      maps: MAP_LIST,
      modes: Object.values(MODES).map((x) => ({ id: x.id, name: x.name, short: x.short, desc: x.desc })),
      players: [...m.players.values()].map((p) => {
        const c = room.conns.get(p.id);
        return {
          id: p.id, name: p.name, bot: p.bot, ready: p.ready,
          isHost: c ? c.id === room.hostConnId : false,
          level: p.level, score: Math.round(p.score), paint: p.paint,
          username: p.username || '',
        };
      }),
    };
  }

  function pushRoomState(room) {
    broadcast(room, S2C.ROOM, roomStatePayload(room));
  }

  function joinRoom(conn, room) {
    if (room.conns.size >= room.options.maxPlayers) { fail(conn, ERR.ROOM_FULL); return false; }
    leaveRoom(conn, true);

    const account = conn.username ? store.user(conn.username) : null;
    const id = room.nextPlayerId++;
    const player = room.match.addPlayer({
      id,
      name: conn.name,
      username: conn.username,
      xp: account?.xp || 0,
      level: account ? levelFromXp(account.xp).level : 1,
    });
    player.ready = false;
    conn.roomCode = room.code;
    conn.playerId = id;
    room.conns.set(id, conn);
    if (room.hostConnId == null) room.hostConnId = conn.id;
    room.lastActivity = now();
    syncBots(room);

    send(conn, S2C.ROOM, { ...roomStatePayload(room), you: id, joined: true });
    send(conn, S2C.MATCH, room.match.matchState());
    pushRoomState(room);
    log(`${conn.name} joined ${room.code} (${room.conns.size} humans)`);
    return true;
  }

  function leaveRoom(conn, quiet) {
    const room = roomOf(conn);
    if (!room) return;
    room.conns.delete(conn.playerId);
    room.match.removePlayer(conn.playerId);
    conn.roomCode = null;
    conn.playerId = null;

    if (room.hostConnId === conn.id) {
      const next = [...room.conns.values()][0];
      room.hostConnId = next ? next.id : null;
    }
    if (!room.conns.size) {
      rooms.delete(room.code);
      log(`room ${room.code} closed`);
      return;
    }
    syncBots(room);
    if (!quiet) pushRoomState(room);
  }

  // ------------------------------------------------------- connection API --
  function addConnection(sock, ip) {
    const conn = {
      id: nextConnId++,
      sock,
      ip: ip || 'unknown',
      name: 'Chameleon',
      username: '',
      roomCode: null,
      playerId: null,
      closed: false,
      helloAt: 0,
      buckets: new Map(),
      lastPingAt: now(),
    };
    conns.add(conn);
    if (store.isBanned(conn.ip)) {
      send(conn, S2C.ERROR, { code: ERR.BANNED, detail: 'This address is temporarily banned.' });
      try { sock.close(1008, 'banned'); } catch { /* already gone */ }
      conn.closed = true;
    }
    return conn;
  }

  function dropConnection(conn) {
    if (!conn || conn.closed) return;
    conn.closed = true;
    leaveRoom(conn);
    if (conn.username && byUsername.get(conn.username) === conn) byUsername.delete(conn.username);
    conns.delete(conn);
  }

  /** Simple token bucket per connection per message kind. */
  function allow(conn, kind, perSecond, burst = perSecond * 2) {
    const t = now();
    let b = conn.buckets.get(kind);
    if (!b) { b = { tokens: burst, last: t }; conn.buckets.set(kind, b); }
    b.tokens = Math.min(burst, b.tokens + (t - b.last) * perSecond);
    b.last = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  // --------------------------------------------------------------- router --
  function handle(conn, msg) {
    if (conn.closed) return;
    if (!allow(conn, 'msg', ANTICHEAT.maxMessagesPerSecond, ANTICHEAT.maxMessagesPerSecond)) {
      fail(conn, ERR.RATE_LIMITED, 'Slow down.');
      return;
    }
    if (!conn.helloAt && msg.t !== C2S.HELLO) { fail(conn, ERR.BAD_PAYLOAD, 'say hello first'); return; }

    switch (msg.t) {
      case C2S.HELLO: return onHello(conn, msg);
      case C2S.CREATE_ROOM: return onCreate(conn, msg);
      case C2S.JOIN_ROOM: return onJoin(conn, msg);
      case C2S.QUICK_MATCH: return onQuick(conn);
      case C2S.LEAVE_ROOM: { leaveRoom(conn); send(conn, S2C.ROOM, { left: true }); return; }
      case C2S.LIST_ROOMS: return onList(conn);
      case C2S.SET_OPTIONS: return onOptions(conn, msg);
      case C2S.SET_READY: return onReady(conn, msg);
      case C2S.START_MATCH: return onStart(conn);
      case C2S.INPUT: return onInput(conn, msg);
      case C2S.PAINT: return onGameCommand(conn, 'paint', msg);
      case C2S.POSE: return onGameCommand(conn, 'pose', msg);
      case C2S.EMOTE: return onGameCommand(conn, 'emote', msg);
      case C2S.SHOOT: return onShoot(conn, msg);
      case C2S.RELOAD: return onGameCommand(conn, 'reload', msg);
      case C2S.ABILITY: return onGameCommand(conn, 'ability', msg);
      case C2S.SWITCH_GUN: return onGameCommand(conn, 'gun', msg);
      case C2S.CHAT: return onChat(conn, msg);
      case C2S.INVITE: return onInvite(conn, msg);
      case C2S.INVITE_REPLY: return onInviteReply(conn, msg);
      case C2S.FRIEND: return onFriend(conn, msg);
      case C2S.REPORT: return onReport(conn, msg);
      case C2S.VOTE_KICK: return onVoteKick(conn, msg);
      case C2S.KICK: return onHostKick(conn, msg);
      case C2S.PING: return send(conn, S2C.PONG, { c: num(msg.c, 0, 1e12, 0), s: now() });
      default: return fail(conn, ERR.BAD_PAYLOAD, `unknown ${msg.t}`);
    }
  }

  function onHello(conn, msg) {
    if (int(msg.v, 0, 999, 0) !== VERSION) {
      fail(conn, ERR.BAD_VERSION, `server speaks protocol ${VERSION}`);
      return;
    }
    conn.helloAt = now();
    conn.name = sanitizeName(msg.name, 'Chameleon');

    // Usernames are first-come while online. A returning player keeps their
    // handle as long as nobody else is using it right now.
    let uname = normalizeUsername(msg.username || msg.name || '');
    if (uname) {
      const holder = byUsername.get(uname);
      if (holder && holder !== conn && !holder.closed) {
        uname = `${uname}${Math.floor(Math.random() * 900 + 100)}`;
      }
      conn.username = uname;
      byUsername.set(uname, conn);
    }

    const account = conn.username ? store.user(conn.username) : null;
    const lvl = account ? levelFromXp(account.xp) : { level: 1, into: 0, need: 900 };
    send(conn, S2C.WELCOME, {
      v: VERSION,
      you: conn.id,
      name: conn.name,
      username: conn.username,
      maps: MAP_LIST,
      modes: Object.values(MODES).map((m) => ({
        id: m.id, name: m.name, short: m.short, desc: m.desc, prep: m.prep, hunt: m.hunt,
      })),
      difficulties: DIFFICULTY,
      account: account ? {
        xp: Math.round(account.xp), level: lvl.level, into: Math.round(lvl.into), need: lvl.need,
        matches: account.matches, wins: account.wins, tags: account.tags,
        unlocked: account.unlocked, friends: account.friends,
      } : null,
    });

    // An invite may have been waiting for this handle to come online.
    const pending = pendingInvites.get(conn.username);
    if (pending) {
      pendingInvites.delete(conn.username);
      send(conn, S2C.INVITE, pending);
    }
  }

  function onCreate(conn, msg) {
    if (!allow(conn, 'create', 0.4, 3)) { fail(conn, ERR.RATE_LIMITED); return; }
    const mine = [...rooms.values()].filter((r) => r.hostConnId === conn.id).length;
    if (mine >= NET.maxRoomsPerIp) { fail(conn, ERR.RATE_LIMITED, 'too many rooms'); return; }
    const room = createRoom(conn, {
      name: msg.name,
      isPrivate: bool(msg.isPrivate),
      mapId: str(msg.mapId, 24),
      modeId: str(msg.modeId, 24),
      rounds: msg.rounds,
      bots: msg.bots,
      difficulty: msg.difficulty,
      maxPlayers: msg.maxPlayers,
    });
    if (!room) { fail(conn, ERR.ROOM_FULL, 'server is full'); return; }
    joinRoom(conn, room);
  }

  function onJoin(conn, msg) {
    if (!allow(conn, 'join', 1, 6)) { fail(conn, ERR.RATE_LIMITED); return; }
    const code = str(msg.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const room = rooms.get(code);
    if (!room) { fail(conn, ERR.NO_ROOM, code); return; }
    joinRoom(conn, room);
  }

  function onQuick(conn) {
    if (!allow(conn, 'join', 1, 6)) { fail(conn, ERR.RATE_LIMITED); return; }
    const open = [...rooms.values()]
      .filter((r) => !r.isPrivate && r.conns.size < r.options.maxPlayers)
      .sort((a, b) => b.conns.size - a.conns.size);
    const room = open[0] || createRoom(conn, { isPrivate: false, bots: 4 });
    if (!room) { fail(conn, ERR.ROOM_FULL); return; }
    joinRoom(conn, room);
  }

  function onList(conn) {
    send(conn, S2C.ROOM_LIST, {
      rooms: [...rooms.values()].filter((r) => !r.isPrivate).slice(0, 60).map((r) => ({
        code: r.code, name: r.name, players: r.conns.size, bots: r.botIds.size,
        max: r.options.maxPlayers, mapId: r.options.mapId, modeId: r.options.modeId,
        phase: r.match.state.phase, round: r.match.state.round,
      })),
    });
  }

  function onOptions(conn, msg) {
    const room = roomOf(conn);
    if (!room) return fail(conn, ERR.NO_ROOM);
    if (room.hostConnId !== conn.id) return fail(conn, ERR.NOT_HOST);
    if (room.match.state.phase !== Phase.LOBBY && room.match.state.phase !== Phase.MATCH_END) {
      return fail(conn, ERR.IN_PROGRESS);
    }
    const o = room.options;
    if (MAP_IDS.includes(msg.mapId)) o.mapId = msg.mapId;
    if (MODES[msg.modeId]) o.modeId = msg.modeId;
    if (msg.rounds != null) o.rounds = clamp(int(msg.rounds, 1, 15, o.rounds), 1, 15);
    if (msg.bots != null) o.bots = clamp(int(msg.bots, 0, 15, o.bots), 0, o.maxPlayers - 1);
    if (msg.difficulty != null) o.difficulty = clamp(int(msg.difficulty, 0, 3, o.difficulty), 0, 3);
    if (msg.isPrivate != null) room.isPrivate = bool(msg.isPrivate);
    if (msg.name) room.name = sanitizeName(msg.name, room.name);
    room.match.setOptions({ mapId: o.mapId, modeId: o.modeId, rounds: o.rounds });
    syncBots(room);
    pushRoomState(room);
  }

  function onReady(conn, msg) {
    const room = roomOf(conn);
    if (!room) return;
    const p = room.match.players.get(conn.playerId);
    if (!p) return;
    p.ready = bool(msg.ready);
    pushRoomState(room);
    // Everyone ready and more than one player: start on its own.
    const humansReady = [...room.conns.keys()].every((pid) => room.match.players.get(pid)?.ready);
    if (humansReady && room.conns.size >= 2 && room.match.state.phase === Phase.LOBBY) {
      room.match.startMatch();
    }
  }

  function onStart(conn) {
    const room = roomOf(conn);
    if (!room) return fail(conn, ERR.NO_ROOM);
    if (room.hostConnId !== conn.id) return fail(conn, ERR.NOT_HOST);
    syncBots(room);
    if (room.match.players.size < 2) {
      // Solo practice still needs somebody to hunt you.
      room.options.bots = Math.max(room.options.bots, 3);
      syncBots(room);
    }
    if (!room.match.startMatch()) fail(conn, ERR.IN_PROGRESS);
  }

  function onInput(conn, msg) {
    const room = roomOf(conn);
    if (!room || conn.playerId == null) return;
    const list = Array.isArray(msg.i) ? msg.i : null;
    if (!list) return;
    for (let i = 0; i < Math.min(list.length, 16); i++) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      room.match.queueInput(conn.playerId, {
        seq: int(raw.q, 0, 1e9, 0),
        dt: num(raw.d, 0, 1, 1 / 60),
        mx: num(raw.x, -1, 1, 0),
        mz: num(raw.z, -1, 1, 0),
        yaw: num(raw.y, -100, 100, 0),
        pitch: num(raw.p, -2, 2, 0),
        buttons: int(raw.b, 0, 255, 0),
      });
    }
  }

  function onShoot(conn, msg) {
    const room = roomOf(conn);
    if (!room || conn.playerId == null) return;
    if (!allow(conn, 'shoot', 22, 30)) return; // hard ceiling above any legal cadence
    room.match.command(conn.playerId, 'shoot', {
      dir: Array.isArray(msg.d) ? msg.d.map((v) => num(v, -1, 1, 0)) : null,
      seq: int(msg.q, 0, 1e9, 0),
      target: msg.k == null ? null : int(msg.k, 0, 1e6, 0),
    });
  }

  function onGameCommand(conn, type, msg) {
    const room = roomOf(conn);
    if (!room || conn.playerId == null) return;
    if (!allow(conn, type, 12, 20)) return;
    room.match.command(conn.playerId, type, msg);
  }

  function onChat(conn, msg) {
    const room = roomOf(conn);
    if (!room) return;
    if (!allow(conn, 'chat', ANTICHEAT.maxChatPerSecond, 4)) return;
    const text = sanitizeChat(msg.text);
    if (!text) return;
    broadcast(room, S2C.CHAT, { from: conn.name, id: conn.playerId, text, at: now() });
  }

  const pendingInvites = new Map();

  function onInvite(conn, msg) {
    if (!allow(conn, 'invite', 0.5, 4)) { fail(conn, ERR.RATE_LIMITED); return; }
    let room = roomOf(conn);
    if (!room) {
      room = createRoom(conn, { isPrivate: true, bots: 2 });
      if (!room) return fail(conn, ERR.ROOM_FULL);
      joinRoom(conn, room);
    }
    const target = normalizeUsername(msg.username);
    if (!target) return fail(conn, ERR.BAD_PAYLOAD, 'no username');
    const payload = {
      from: conn.name, fromUser: conn.username, code: room.code,
      mapId: room.options.mapId, modeId: room.options.modeId,
      link: `${opts.publicUrl || ''}/?join=${room.code}`,
    };
    const dest = byUsername.get(target);
    if (dest && !dest.closed) {
      send(dest, S2C.INVITE, payload);
      send(conn, S2C.ERROR, { code: 'ok', detail: `Invite sent to ${target}.` });
    } else {
      // Hold it: if they sign in within the hour they get it on connect.
      pendingInvites.set(target, payload);
      setTimeout(() => pendingInvites.delete(target), 60 * 60 * 1000).unref?.();
      fail(conn, ERR.USER_OFFLINE, `${target} is offline - the invite will be waiting for them.`);
    }
  }

  function onInviteReply(conn, msg) {
    if (!bool(msg.accept)) return;
    const room = rooms.get(str(msg.code, 12).toUpperCase());
    if (!room) return fail(conn, ERR.NO_ROOM);
    joinRoom(conn, room);
  }

  function onFriend(conn, msg) {
    if (!conn.username) return;
    const account = store.user(conn.username);
    const who = normalizeUsername(msg.username);
    const action = str(msg.action, 12);
    if (action === 'add' && who && who !== conn.username && !account.friends.includes(who)) {
      account.friends.push(who);
    } else if (action === 'remove') {
      account.friends = account.friends.filter((f) => f !== who);
    }
    store.save(account);
    send(conn, S2C.FRIENDS, {
      friends: account.friends.map((f) => {
        const c = byUsername.get(f);
        return { username: f, online: !!(c && !c.closed), room: c?.roomCode || null };
      }),
    });
  }

  function onReport(conn, msg) {
    const room = roomOf(conn);
    if (!room) return;
    const targetId = int(msg.id, 0, 1e6, -1);
    const target = room.match.players.get(targetId);
    if (!target || target.id === conn.playerId) return;
    room.match.guard.strike(target, `reported_by_${conn.playerId}`, 1.5, now());
    log(`report: ${conn.name} -> ${target.name} (${str(msg.reason, 40)})`);
    send(conn, S2C.ERROR, { code: 'ok', detail: 'Report filed.' });
  }

  function onVoteKick(conn, msg) {
    const room = roomOf(conn);
    if (!room) return;
    const targetId = int(msg.id, 0, 1e6, -1);
    const target = room.match.players.get(targetId);
    if (!target || target.bot || targetId === conn.playerId) return;
    let votes = room.votes.get(targetId);
    if (!votes) { votes = new Set(); room.votes.set(targetId, votes); }
    votes.add(conn.playerId);
    const needed = Math.max(2, Math.ceil(room.conns.size * 0.6));
    broadcast(room, S2C.EVENT, { e: EV.PHASE, votekick: { id: targetId, votes: votes.size, needed } });
    if (votes.size >= needed) {
      const c = room.conns.get(targetId);
      room.votes.delete(targetId);
      if (c) { send(c, S2C.KICKED, { reason: 'votekick' }); leaveRoom(c); }
    }
  }

  function onHostKick(conn, msg) {
    const room = roomOf(conn);
    if (!room || room.hostConnId !== conn.id) return fail(conn, ERR.NOT_HOST);
    const c = room.conns.get(int(msg.id, 0, 1e6, -1));
    if (!c || c === conn) return;
    send(c, S2C.KICKED, { reason: 'host' });
    leaveRoom(c);
  }

  // ----------------------------------------------------------------- tick --
  let lastTick = now();
  function tick(t) {
    const dt = Math.min(0.25, t - lastTick);
    lastTick = t;
    for (const room of rooms.values()) {
      try {
        room.match.tick(dt, t);
      } catch (err) {
        log(`match tick failed in ${room.code}: ${err.stack}`);
      }
      // Idle rooms with nobody in them get reaped.
      if (!room.conns.size && t - room.lastActivity > 120) {
        rooms.delete(room.code);
      }
    }
  }

  function sendSnapshots() {
    for (const room of rooms.values()) {
      const phase = room.match.state.phase;
      if (phase === Phase.LOBBY) continue;
      for (const [pid, conn] of room.conns) {
        const snap = room.match.snapshotFor(pid);
        if (snap) send(conn, S2C.SNAPSHOT, snap);
      }
    }
  }

  /** Persist progression when a round wraps up. */
  function commitProgress() {
    for (const room of rooms.values()) {
      if (room.match.state.phase !== Phase.MATCH_END || room.committed === room.match.state.round) continue;
      room.committed = room.match.state.round;
      for (const [pid, conn] of room.conns) {
        if (!conn.username) continue;
        const p = room.match.players.get(pid);
        if (!p) continue;
        const acc = store.user(conn.username);
        acc.xp += Math.round(p.xp);
        acc.matches += 1;
        acc.tags += p.tags;
        acc.survived += Math.round(p.survivedFor);
        acc.bestBlend = Math.max(acc.bestBlend, p.blend);
        store.save(acc);
        send(conn, S2C.WELCOME, { account: { xp: Math.round(acc.xp), ...levelFromXp(acc.xp) }, refresh: true });
      }
    }
  }

  return {
    rooms, conns, store,
    addConnection, dropConnection, handle,
    tick, sendSnapshots, commitProgress,
    stats: () => ({ rooms: rooms.size, conns: conns.size, users: byUsername.size }),
  };
}
