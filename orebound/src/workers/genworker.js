// Chunk generation worker. One instance per pool slot; stateless apart from
// the WorldGen it builds from the seed, so any worker can serve any request.

import { WorldGen } from '../world/worldgen.js';

let gen = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    gen = new WorldGen(msg.seed);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type === 'gen') {
    if (!gen) { self.postMessage({ type: 'error', key: msg.key, error: 'worker not initialised' }); return; }
    try {
      const t0 = performance.now();
      const out = gen.generateChunk(msg.cx, msg.cz);
      const transfer = out.transfer;
      delete out.transfer;
      out.type = 'chunk';
      out.key = msg.key;
      out.ms = performance.now() - t0;
      self.postMessage(out, transfer);
    } catch (err) {
      self.postMessage({ type: 'error', key: msg.key, error: String(err && err.stack || err) });
    }
  }
};
