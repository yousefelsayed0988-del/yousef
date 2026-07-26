// WebSocket client: connect, auto-reconnect with backoff, latency probe, and a
// tiny pub/sub so the rest of the client never touches a raw socket.

import { encode, decode, C2S, S2C, VERSION } from '../../shared/protocol.js';

export function createNet(opts = {}) {
  const handlers = new Map();
  let sock = null;
  let closedByUs = false;
  let backoff = 500;
  let pingTimer = null;
  let rttSamples = [];

  const state = {
    connected: false,
    connecting: false,
    rtt: 0,
    clockOffset: 0,   // serverTime - clientTime, seconds
    lastError: null,
  };

  function url() {
    if (opts.url) return opts.url;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type)?.delete(fn);
  }

  function fire(type, payload) {
    const set = handlers.get(type);
    if (set) for (const fn of set) {
      try { fn(payload); } catch (err) { console.error(`net handler ${type}`, err); }
    }
    const any = handlers.get('*');
    if (any) for (const fn of any) fn(type, payload);
  }

  function connect() {
    if (state.connecting || state.connected) return;
    state.connecting = true;
    closedByUs = false;
    try {
      sock = new WebSocket(url());
    } catch (err) {
      state.connecting = false;
      state.lastError = err.message;
      fire('status', { ...state });
      scheduleReconnect();
      return;
    }

    sock.onopen = () => {
      state.connected = true;
      state.connecting = false;
      state.lastError = null;
      backoff = 500;
      // Hello goes out before anything else hears about the connection: the
      // server rejects every other message until it has one.
      send(C2S.HELLO, {
        v: VERSION,
        name: opts.name?.() || 'Chameleon',
        username: opts.username?.() || '',
      });
      fire('status', { ...state });
      startPing();
    };

    sock.onmessage = (ev) => {
      const msg = decode(typeof ev.data === 'string' ? ev.data : '');
      if (!msg) return;
      if (msg.t === S2C.PONG) {
        const rtt = performance.now() / 1000 - msg.c;
        rttSamples.push(rtt);
        if (rttSamples.length > 8) rttSamples.shift();
        const sorted = [...rttSamples].sort((a, b) => a - b);
        state.rtt = sorted[Math.floor(sorted.length / 2)];
        state.clockOffset = msg.s - (performance.now() / 1000 + state.rtt / 2);
        return;
      }
      fire(msg.t, msg);
    };

    sock.onclose = () => {
      state.connected = false;
      state.connecting = false;
      stopPing();
      fire('status', { ...state });
      if (!closedByUs) scheduleReconnect();
    };

    sock.onerror = () => {
      state.lastError = 'connection error';
    };
  }

  function scheduleReconnect() {
    setTimeout(() => {
      backoff = Math.min(8000, backoff * 1.8);
      connect();
    }, backoff);
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      send(C2S.PING, { c: performance.now() / 1000 });
    }, 2000);
  }
  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function send(type, payload = {}) {
    if (!sock || sock.readyState !== WebSocket.OPEN) return false;
    try {
      sock.send(encode({ t: type, ...payload }));
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    closedByUs = true;
    stopPing();
    try { sock?.close(1000, 'bye'); } catch { /* already gone */ }
    sock = null;
    state.connected = false;
  }

  return { state, connect, close, send, on, get socket() { return sock; } };
}
