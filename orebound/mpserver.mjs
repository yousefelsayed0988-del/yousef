// Multiplayer server: a minimal WebSocket implementation plus the shared-world
// authority. No dependencies -- the handshake is a SHA-1 and the frame codec is
// about a hundred lines, which is cheaper than taking on `ws` for a game that
// otherwise installs nothing.
//
// What the server owns:
//   * the world seed          (clients generate identical terrain from it)
//   * the block edit log      (authoritative; replayed to every joiner)
//   * time of day and weather (so night falls for everyone at once)
//   * the player roster
//
// What it does not own: mobs, items and physics, which each client simulates
// locally. That is a deliberate v1 boundary -- see the README.

import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP_TEXT = 0x1, OP_CLOSE = 0x8, OP_PING = 0x9, OP_PONG = 0xA;

// --------------------------------------------------------------- framing
function encodeFrame(payload, opcode = OP_TEXT) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

/** Incremental frame parser; handles fragmentation and masking. */
class FrameReader {
  constructor(onMessage, onClose) {
    this.buf = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.fragments = [];
    this.fragOp = 0;
  }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off); off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        const big = this.buf.readBigUInt64BE(off);
        if (big > 8n * 1024n * 1024n) { this.onClose(); return; }   // sanity cap
        len = Number(big); off += 8;
      }
      let mask = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.subarray(off, off + 4); off += 4;
      }
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + len);

      if (opcode === OP_CLOSE) { this.onClose(); return; }
      if (opcode === OP_PING || opcode === OP_PONG) continue;
      if (opcode === 0) this.fragments.push(payload);
      else { this.fragments = [payload]; this.fragOp = opcode; }
      if (fin) {
        const full = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments);
        this.fragments = [];
        if (this.fragOp === OP_TEXT) this.onMessage(full.toString('utf8'));
      }
    }
  }
}

// ============================================================ shared world
export class MultiplayerServer {
  constructor(opts = {}) {
    this.dir = opts.dir || '.';
    this.file = join(this.dir, opts.file || 'world-online.json');
    this.seed = opts.seed ?? ((Math.random() * 0xffffffff) | 0);
    this.time = 1440;                 // just after sunrise
    this.weather = { type: 'clear', intensity: 0, ticks: 12000 };
    this.edits = new Map();           // "x,y,z" -> [blockId, state]
    this.clients = new Set();
    this.nextNum = 1;
    this.dirty = false;
    this.log = opts.log || (() => { });
    this._loaded = this._load();
    // world clock: 20 ticks/second, same as the client simulation
    this.timer = setInterval(() => this._tick(), 50);
    this.saveTimer = setInterval(() => this.save(), 30000);
  }

  async _load() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      this.seed = raw.seed;
      this.time = raw.time || 0;
      if (raw.weather) this.weather = raw.weather;
      for (const [k, v] of raw.edits || []) this.edits.set(k, v);
      this.log(`loaded shared world: seed ${this.seed}, ${this.edits.size} block edits`);
    } catch {
      this.log(`new shared world: seed ${this.seed}`);
    }
  }

  async save() {
    if (!this.dirty) return;
    this.dirty = false;
    const payload = JSON.stringify({
      seed: this.seed, time: this.time, weather: this.weather,
      edits: [...this.edits.entries()],
    });
    try {
      // temp-then-rename, same discipline as the single-player save
      const tmp = this.file + '.tmp';
      await writeFile(tmp, payload);
      await rename(tmp, this.file);
    } catch (e) {
      this.log('could not save the shared world: ' + e.message);
    }
  }

  _tick() {
    this.time++;
    if (this.time % 20 === 0) this.broadcast({ t: 'time', time: this.time, weather: this.weather });
    // weather is decided centrally so it is the same sky for everyone
    if (--this.weather.ticks <= 0) {
      if (this.weather.type === 'clear' && Math.random() < 0.4) {
        this.weather.type = Math.random() < 0.25 ? 'thunder' : 'rain';
        this.weather.intensity = 1;
        this.weather.ticks = 3000 + Math.floor(Math.random() * 9000);
      } else {
        this.weather.type = 'clear';
        this.weather.intensity = 0;
        this.weather.ticks = 6000 + Math.floor(Math.random() * 24000);
      }
      this.dirty = true;
      this.broadcast({ t: 'time', time: this.time, weather: this.weather });
    }
    // player positions at 10 Hz is plenty for smooth remote interpolation
    if (this.time % 2 === 0 && this.clients.size > 1) {
      const players = [...this.clients].filter(c => c.joined).map(c => ({
        id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch,
        sneak: c.sneak, held: c.held, health: c.health,
      }));
      this.broadcast({ t: 'players', players });
    }
  }

  broadcast(msg, except) {
    const frame = encodeFrame(JSON.stringify(msg));
    for (const c of this.clients) {
      if (c === except || !c.socket.writable) continue;
      c.socket.write(frame);
    }
  }

  send(client, msg) {
    if (!client.socket.writable) return;
    client.socket.write(encodeFrame(JSON.stringify(msg)));
  }

  // ----------------------------------------------------------- connection
  async handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    await this._loaded;

    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);

    const client = {
      id: randomUUID().slice(0, 8),
      name: 'Player ' + (this.nextNum++),
      socket, joined: false,
      x: 0, y: 80, z: 0, yaw: 0, pitch: 0, sneak: false, held: 0, health: 20,
    };
    this.clients.add(client);

    const close = () => {
      if (!this.clients.has(client)) return;
      this.clients.delete(client);
      socket.destroy();
      this.log(`${client.name} left (${this.clients.size} online)`);
      this.broadcast({ t: 'leave', id: client.id });
      this.broadcast({ t: 'chat', from: '', text: `${client.name} left the game` });
    };

    const reader = new FrameReader(
      (text) => { try { this._onMessage(client, JSON.parse(text)); } catch { } },
      close);
    socket.on('data', (c) => reader.push(c));
    socket.on('error', close);
    socket.on('close', close);
  }

  _onMessage(client, msg) {
    switch (msg.t) {
      case 'join': {
        if (client.joined) return;
        if (typeof msg.name === 'string' && msg.name.trim()) {
          client.name = msg.name.trim().slice(0, 16);
        }
        client.joined = true;
        this.log(`${client.name} joined (${this.clients.size} online)`);
        this.send(client, {
          t: 'hello',
          id: client.id,
          seed: this.seed,
          time: this.time,
          weather: this.weather,
          edits: [...this.edits.entries()],
          players: [...this.clients].filter(c => c !== client && c.joined)
            .map(c => ({ id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch })),
        });
        this.broadcast({ t: 'chat', from: '', text: `${client.name} joined the game` }, client);
        break;
      }
      case 'move':
        client.x = +msg.x || 0; client.y = +msg.y || 0; client.z = +msg.z || 0;
        client.yaw = +msg.yaw || 0; client.pitch = +msg.pitch || 0;
        client.sneak = !!msg.sneak; client.held = msg.held | 0;
        client.health = +msg.health || 0;
        break;
      case 'edit': {
        // trust but bound: reject anything outside the world box
        const x = msg.x | 0, y = msg.y | 0, z = msg.z | 0;
        if (y < -64 || y >= 320) return;
        if (Math.abs(x) > 30000000 || Math.abs(z) > 30000000) return;
        const key = `${x},${y},${z}`;
        this.edits.set(key, [msg.id | 0, msg.state | 0]);
        this.dirty = true;
        this.broadcast({ t: 'edit', x, y, z, id: msg.id | 0, state: msg.state | 0 }, client);
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 200);
        if (!text.trim()) return;
        this.broadcast({ t: 'chat', from: client.name, text });
        break;
      }
      default: break;
    }
  }

  async close() {
    clearInterval(this.timer);
    clearInterval(this.saveTimer);
    this.dirty = true;
    await this.save();
    for (const c of this.clients) c.socket.destroy();
  }
}
