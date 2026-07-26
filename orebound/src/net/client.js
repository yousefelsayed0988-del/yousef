// Multiplayer client.
//
// The server is authoritative over the seed, the block edit log, and the world
// clock; terrain itself is never sent, because every client regenerates it
// identically from the shared seed. That keeps the wire traffic proportional to
// what players have *changed* rather than to how far they have explored.
//
// Remote players are interpolated between the 10 Hz position snapshots so they
// move smoothly regardless of the update rate.

export class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.players = new Map();     // id -> { name, x,y,z, yaw, pitch, prev..., t }
    this.chat = [];
    this.pending = [];            // edits made before the socket opened
    this.suppress = false;        // true while applying a remote edit
    this.lastSent = 0;
    this.onReady = null;
    this.onError = null;
  }

  get url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/net`;
  }

  connect(name) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        reject(new Error(msg));
      };
      const timer = setTimeout(() => { fail('the server did not respond'); ws.close(); }, 12000);

      ws.onopen = () => this.send({ t: 'join', name });
      ws.onerror = () => { clearTimeout(timer); fail('could not reach the server'); };
      ws.onclose = () => {
        clearTimeout(timer);
        this.connected = false;
        fail('the connection closed before the world arrived');
        if (this.game.started && this.game.online) {
          this.game.toast('Disconnected from the server.');
          this.game.online = false;
        }
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'hello') {
          clearTimeout(timer);
          this.id = msg.id;
          this.connected = true;
          settled = true;
          resolve(msg);
          return;
        }
        this.handle(msg);
      };
    });
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  disconnect() {
    this.connected = false;
    if (this.ws) { try { this.ws.close(); } catch { } this.ws = null; }
    this.players.clear();
  }

  // ------------------------------------------------------------- incoming
  handle(msg) {
    const g = this.game;
    switch (msg.t) {
      case 'edit': {
        // apply without echoing it straight back to the server
        this.suppress = true;
        g.world.setBlock(msg.x, msg.y, msg.z, msg.id, msg.state, { record: true });
        this.suppress = false;
        break;
      }
      case 'time':
        if (g.world) {
          g.world.time = msg.time;
          if (msg.weather) {
            g.world.weather.type = msg.weather.type;
            g.world.weather.target = msg.weather.type === 'clear' ? 0 : 1;
          }
        }
        break;
      case 'players': {
        const seen = new Set();
        for (const p of msg.players) {
          if (p.id === this.id) continue;
          seen.add(p.id);
          let r = this.players.get(p.id);
          if (!r) {
            r = { name: p.name, x: p.x, y: p.y, z: p.z, px: p.x, py: p.y, pz: p.z, yaw: p.yaw, pitch: p.pitch, t: 0 };
            this.players.set(p.id, r);
          }
          // keep the previous sample as the interpolation source
          r.px = r.x; r.py = r.y; r.pz = r.z;
          r.x = p.x; r.y = p.y; r.z = p.z;
          r.yaw = p.yaw; r.pitch = p.pitch;
          r.name = p.name; r.sneak = p.sneak; r.held = p.held; r.health = p.health;
          r.t = 0;
        }
        for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
        break;
      }
      case 'leave':
        this.players.delete(msg.id);
        break;
      case 'chat':
        this.pushChat(msg.from, msg.text);
        break;
      default: break;
    }
  }

  pushChat(from, text) {
    this.chat.push({ from, text, at: performance.now() });
    if (this.chat.length > 60) this.chat.shift();
    this.game.ui.pushChat(from, text);
  }

  // ------------------------------------------------------------- outgoing
  /** Called by World.setBlock for every local edit. */
  reportEdit(x, y, z, id, state) {
    if (this.suppress) return;
    if (!this.connected) { this.pending.push({ x, y, z, id, state }); return; }
    this.send({ t: 'edit', x, y, z, id, state });
  }

  flushPending() {
    for (const e of this.pending) this.send({ t: 'edit', ...e });
    this.pending.length = 0;
  }

  /** Position updates at 10 Hz; the server relays them at the same rate. */
  tick() {
    if (!this.connected) return;
    const p = this.game.player;
    const now = performance.now();
    if (now - this.lastSent < 90) return;
    this.lastSent = now;
    this.send({
      t: 'move',
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
      sneak: p.sneaking, held: p.held ? p.held.id : 0, health: p.health,
    });
    for (const r of this.players.values()) r.t = Math.min(1, r.t + 0.18);
  }

  sendChat(text) { this.send({ t: 'chat', text }); }

  /** Interpolated position for rendering. */
  interpolate(r, out) {
    const t = Math.min(1, r.t);
    out[0] = r.px + (r.x - r.px) * t;
    out[1] = r.py + (r.y - r.py) * t;
    out[2] = r.pz + (r.z - r.pz) * t;
    return out;
  }
}
