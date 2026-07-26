// RFC 6455 WebSocket server, no dependencies.
//
// This is the only place hostile bytes reach the process before any of our own
// validation runs, so every limit here is deliberate: a frame that is too big,
// a message that never ends, a client that never reads, or a protocol
// violation all end in a close rather than in memory growth.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { NET } from '../shared/constants.js';

const GUID = '258EAFA5-E914-47DA-95CA-5AB0DC85B11F';

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

const MAX_FRAME = 1 << 20;         // 1 MiB per frame
const MAX_MESSAGE = 1 << 20;       // 1 MiB reassembled
const MAX_INBOUND_BUFFER = 2 << 20; // unparsed bytes we will hold before giving up
const MAX_OUTBOUND_BUFFER = 4 << 20; // a client this far behind is not coming back
const FRAGMENT_SIZE = 64 * 1024;

// Close codes we actually use.
const CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL: 1002,
  UNSUPPORTED: 1003,
  TOO_BIG: 1009,
  INTERNAL: 1011,
};

class WsSocket extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.remoteAddress = socket.remoteAddress || 'unknown';
    this.isAlive = true;
    this.closed = false;

    this._chunks = [];
    this._buffered = 0;
    this._fragments = [];
    this._fragmentLength = 0;
    this._fragmentOpcode = 0;
    this._closing = false;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._finish());
    socket.on('end', () => this._finish());
    socket.on('error', (err) => {
      this.safeEmit('error', err);
      this._finish();
    });
    socket.on('timeout', () => this.destroy());
  }

  /** Handlers are user code; one throwing must not take the server down. */
  safeEmit(event, ...args) {
    try {
      this.emit(event, ...args);
    } catch (err) {
      if (event !== 'error') {
        try { this.emit('error', err); } catch { /* nothing left to do */ }
      }
    }
  }

  // ------------------------------------------------------------- receiving --
  _onData(chunk) {
    if (this.closed) return;
    this._chunks.push(chunk);
    this._buffered += chunk.length;
    if (this._buffered > MAX_INBOUND_BUFFER) {
      this.close(CLOSE.TOO_BIG, 'inbound buffer');
      return;
    }
    try {
      this._parse();
    } catch (err) {
      this.safeEmit('error', err);
      this.close(CLOSE.INTERNAL, 'parse error');
    }
  }

  _peek() {
    if (this._chunks.length > 1) {
      this._chunks = [Buffer.concat(this._chunks, this._buffered)];
    }
    return this._chunks[0] || Buffer.alloc(0);
  }

  _consume(n) {
    const buf = this._chunks[0];
    if (n >= buf.length) {
      this._chunks.shift();
    } else {
      this._chunks[0] = buf.subarray(n);
    }
    this._buffered -= n;
  }

  _parse() {
    for (;;) {
      if (this.closed) return;
      const buf = this._peek();
      if (buf.length < 2) return;

      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const rsv = b0 & 0x70;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      // We negotiate no extensions, so any reserved bit is a protocol error.
      if (rsv) { this.close(CLOSE.PROTOCOL, 'rsv bits set'); return; }

      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) { this.close(CLOSE.TOO_BIG, 'frame too large'); return; }
        len = Number(big);
        offset = 10;
      }

      if (len > MAX_FRAME) { this.close(CLOSE.TOO_BIG, 'frame too large'); return; }

      // Every frame from a client must be masked (RFC 6455 5.1).
      if (!masked) { this.close(CLOSE.PROTOCOL, 'unmasked client frame'); return; }
      const maskOffset = offset;
      offset += 4;

      if (buf.length < offset + len) return; // wait for the rest of the frame

      const mask = buf.subarray(maskOffset, maskOffset + 4);
      const payload = Buffer.allocUnsafe(len);
      const raw = buf.subarray(offset, offset + len);
      for (let i = 0; i < len; i++) payload[i] = raw[i] ^ mask[i & 3];
      this._consume(offset + len);

      const isControl = (opcode & 0x8) !== 0;
      if (isControl) {
        // Control frames are never fragmented and never exceed 125 bytes.
        if (!fin || len > 125) { this.close(CLOSE.PROTOCOL, 'bad control frame'); return; }
        this._handleControl(opcode, payload);
        continue;
      }

      if (opcode === OP.CONT) {
        if (!this._fragments.length) { this.close(CLOSE.PROTOCOL, 'continuation without start'); return; }
      } else if (opcode === OP.TEXT || opcode === OP.BINARY) {
        if (this._fragments.length) { this.close(CLOSE.PROTOCOL, 'interleaved data frame'); return; }
        this._fragmentOpcode = opcode;
      } else {
        this.close(CLOSE.PROTOCOL, `bad opcode ${opcode}`);
        return;
      }

      this._fragmentLength += len;
      if (this._fragmentLength > MAX_MESSAGE) { this.close(CLOSE.TOO_BIG, 'message too large'); return; }
      this._fragments.push(payload);

      if (!fin) continue;

      const body = this._fragments.length === 1
        ? this._fragments[0]
        : Buffer.concat(this._fragments, this._fragmentLength);
      const wasText = this._fragmentOpcode === OP.TEXT;
      this._fragments = [];
      this._fragmentLength = 0;
      this.safeEmit('message', wasText ? body.toString('utf8') : body, !wasText);
    }
  }

  _handleControl(opcode, payload) {
    if (opcode === OP.PING) {
      this._write(encodeFrame(OP.PONG, payload));
      this.safeEmit('ping', payload);
    } else if (opcode === OP.PONG) {
      this.isAlive = true;
      this.safeEmit('pong', payload);
    } else if (opcode === OP.CLOSE) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : CLOSE.NORMAL;
      const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
      if (!this._closing) {
        this._closing = true;
        this._write(encodeFrame(OP.CLOSE, payload.subarray(0, 125)));
      }
      this._finish(code, reason);
      this.socket.end();
    }
  }

  // -------------------------------------------------------------- sending --
  _write(buf) {
    if (this.closed || this.socket.destroyed) return false;
    try {
      // A client that has stopped reading will otherwise grow our heap forever.
      if (this.socket.writableLength > MAX_OUTBOUND_BUFFER) {
        this.destroy();
        return false;
      }
      return this.socket.write(buf);
    } catch {
      this.destroy();
      return false;
    }
  }

  send(data, binary = false) {
    if (this.closed) return false;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const opcode = binary || Buffer.isBuffer(data) ? OP.BINARY : OP.TEXT;
    if (payload.length <= FRAGMENT_SIZE) return this._write(encodeFrame(opcode, payload));

    // Large payloads go out fragmented so one big message cannot monopolise
    // the socket's write buffer in a single chunk.
    let ok = true;
    for (let off = 0; off < payload.length; off += FRAGMENT_SIZE) {
      const slice = payload.subarray(off, Math.min(off + FRAGMENT_SIZE, payload.length));
      const first = off === 0;
      const last = off + FRAGMENT_SIZE >= payload.length;
      ok = this._write(encodeFrame(first ? opcode : OP.CONT, slice, last)) && ok;
    }
    return ok;
  }

  ping(payload = Buffer.alloc(0)) {
    this.isAlive = false;
    return this._write(encodeFrame(OP.PING, payload));
  }

  close(code = CLOSE.NORMAL, reason = '') {
    if (this.closed || this._closing) { this.destroy(); return; }
    this._closing = true;
    const reasonBuf = Buffer.from(String(reason).slice(0, 120), 'utf8');
    const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    this._write(encodeFrame(OP.CLOSE, payload));
    // Give the peer a moment to answer, then drop it regardless.
    this._closeTimer = setTimeout(() => this.destroy(), 1500);
    this._closeTimer.unref?.();
    try { this.socket.end(); } catch { /* already gone */ }
  }

  destroy() {
    try { this.socket.destroy(); } catch { /* already gone */ }
    this._finish(CLOSE.GOING_AWAY, 'destroyed');
  }

  _finish(code = CLOSE.NORMAL, reason = '') {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this._closeTimer);
    this._chunks = [];
    this._buffered = 0;
    this._fragments = [];
    this.safeEmit('close', code, reason);
    this.removeAllListeners();
  }
}

function encodeFrame(opcode, payload, fin = true) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = (fin ? 0x80 : 0) | opcode;
  return Buffer.concat([header, payload], header.length + len);
}

function refuse(socket, status, message) {
  try {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch { /* the peer already left */ }
  try { socket.destroy(); } catch { /* nothing to do */ }
}

/**
 * Attach a WebSocket endpoint to an existing http.Server.
 * opts: { path = '/ws', onConnection(sock, req), verifyOrigin(req) -> bool }
 */
export function attachWebSocket(httpServer, opts = {}) {
  const path = opts.path || '/ws';
  const clients = new Set();

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      if (req.method !== 'GET') return refuse(socket, 405, 'Method Not Allowed');
      if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
        return refuse(socket, 400, 'Bad Request');
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== path) return refuse(socket, 404, 'Not Found');

      const key = req.headers['sec-websocket-key'];
      if (!key || String(req.headers['sec-websocket-version']) !== '13') {
        return refuse(socket, 400, 'Bad Request');
      }
      if (opts.verifyOrigin && !opts.verifyOrigin(req)) {
        return refuse(socket, 403, 'Forbidden');
      }

      const accept = createHash('sha1').update(key + GUID).digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );

      const sock = new WsSocket(socket, req);
      clients.add(sock);
      sock.on('close', () => clients.delete(sock));
      if (head && head.length) sock._onData(head);
      opts.onConnection?.(sock, req);
    } catch (err) {
      refuse(socket, 500, 'Internal Server Error');
      opts.onError?.(err);
    }
  });

  // Heartbeat: anything that has not answered a ping by the next sweep is gone.
  const heartbeat = setInterval(() => {
    for (const sock of clients) {
      if (!sock.isAlive) {
        sock.destroy();
        continue;
      }
      sock.ping();
    }
  }, Math.max(1, NET.heartbeatInterval) * 1000);
  heartbeat.unref?.();

  return {
    clients,
    broadcast(data) {
      for (const sock of clients) sock.send(data);
    },
    close() {
      clearInterval(heartbeat);
      for (const sock of clients) sock.close(CLOSE.GOING_AWAY, 'server shutting down');
      clients.clear();
    },
  };
}

export { CLOSE, OP, encodeFrame };
