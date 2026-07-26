// Zero-dependency static server. ES module workers and `import` need a real
// http:// origin -- opening index.html from disk will not work.
//
//   node orebound/serve.mjs [port] [--open]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const argPort = process.argv.slice(2).find(a => /^\d+$/.test(a));
const PORT = Number(argPort || process.env.PORT || 8080);
const OPEN = process.argv.includes('--open');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

    const info = await stat(full).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404).end('not found'); return; }

    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

/** Ask the OS to open a URL in the default browser. */
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* opening is a convenience; the printed URL still works */
  }
}

/**
 * Listen, stepping to the next port if one is already taken. Guessing the port
 * from the launcher script and getting it wrong is a worse failure than this.
 */
function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`port ${port} is in use, trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('Could not start the server:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}/`;
    console.log(`\n  Orebound is running at ${url}`);
    console.log('  Leave this window open while you play. Press Ctrl+C to stop.\n');
    if (OPEN) openBrowser(url);
  });
}

listen(PORT, 20);
