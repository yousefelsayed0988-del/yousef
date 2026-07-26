// Entry point: serves the client over HTTP, upgrades /ws to WebSocket, and
// runs the fixed-rate simulation loop for every room on the box.
//
//   node server/index.js [--port 8080] [--host 0.0.0.0] [--verbose]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

import { attachWebSocket } from './ws.js';
import { createDirectory } from './rooms.js';
import { createStore } from './persist.js';
import { decode } from '../shared/protocol.js';
import { NET, TICK_RATE, SNAPSHOT_RATE, PROTOCOL_VERSION } from '../shared/constants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(argOf('port', process.env.PORT || NET.defaultPort));
const HOST = argOf('host', process.env.HOST || '0.0.0.0');
const VERBOSE = argv.includes('--verbose');

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
const vlog = (...args) => { if (VERBOSE) log(...args); };

// ------------------------------------------------------------ static files --
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// Only these subtrees are reachable over HTTP: the server's own source and the
// data store must never be served.
const ALLOWED = ['client', 'shared'];

async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }

  if (urlPath === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, ...directory.stats() }));
    return;
  }

  // "/" and "/?join=CODE" both land on the game shell.
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/client/index.html';

  const rel = normalize(urlPath).replace(/^([/\\])+/, '');
  const top = rel.split(/[/\\]/)[0];
  if (!ALLOWED.includes(top)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  const filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { // paranoia: normalize() should have handled it
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

// ------------------------------------------------------------------- boot --
const store = createStore(undefined, log);
const httpServer = createServer((req, res) => {
  serveStatic(req, res).catch((err) => {
    log('static error', err.message);
    if (!res.headersSent) res.writeHead(500).end('server error');
  });
});

const directory = createDirectory({
  log: vlog,
  store,
  now: () => process.hrtime.bigint ? Number(process.hrtime.bigint() / 1000000n) / 1000 : Date.now() / 1000,
});

attachWebSocket(httpServer, {
  path: '/ws',
  onConnection(sock, req) {
    const ip = clientIp(req, sock);
    const conn = directory.addConnection(sock, ip);
    vlog(`socket open from ${ip}`);

    sock.on('message', (data) => {
      const msg = decode(typeof data === 'string' ? data : String(data));
      if (!msg) {
        vlog(`dropping malformed frame from ${ip}`);
        return;
      }
      try {
        directory.handle(conn, msg);
      } catch (err) {
        log(`handler error (${msg.t}):`, err.stack);
      }
    });

    sock.on('close', () => {
      vlog(`socket closed from ${ip}`);
      directory.dropConnection(conn);
    });
    sock.on('error', (err) => {
      vlog('socket error', err?.message);
      directory.dropConnection(conn);
    });
  },
});

function clientIp(req, sock) {
  const raw = sock.remoteAddress || req.socket?.remoteAddress || 'unknown';
  const local = raw === '127.0.0.1' || raw === '::1' || raw === '::ffff:127.0.0.1';
  if (local) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length < 200) return fwd.split(',')[0].trim();
  }
  return raw;
}

// ------------------------------------------------------------- simulation --
const clock = () => Number(process.hrtime.bigint() / 1000000n) / 1000;
let lastSnapshot = clock();

const tickTimer = setInterval(() => {
  const t = clock();
  try {
    directory.tick(t);
  } catch (err) {
    log('tick error', err.stack);
  }
  if (t - lastSnapshot >= 1 / SNAPSHOT_RATE) {
    lastSnapshot = t;
    try {
      directory.sendSnapshots();
      directory.commitProgress();
    } catch (err) {
      log('snapshot error', err.stack);
    }
  }
}, 1000 / TICK_RATE);

httpServer.listen(PORT, HOST, () => {
  const addrs = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  log(`Mecha Chameleon listening on http://localhost:${PORT}`);
  for (const a of addrs) log(`  on your network: http://${a}:${PORT}`);
  log(`  share a room with http://<host>:${PORT}/?join=CODE`);
});

function shutdown(signal) {
  log(`${signal} - shutting down`);
  clearInterval(tickTimer);
  store.flush();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => log('uncaught', err.stack));
process.on('unhandledRejection', (err) => log('unhandled rejection', err));
