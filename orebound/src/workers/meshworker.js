// Meshing worker. Receives an 18^3 padded snapshot of one sub-chunk and
// returns interleaved vertex/index buffers, transferred rather than copied.

import { meshSection } from '../render/mesher.js';

let tables = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    tables = msg.tables;
    self.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type === 'mesh') {
    if (!tables) { self.postMessage({ type: 'error', key: msg.key, error: 'worker not initialised' }); return; }
    try {
      const t0 = performance.now();
      const res = meshSection(msg, tables);
      const transfer = [];
      if (res.opaque) transfer.push(res.opaque.verts, res.opaque.idx);
      if (res.translucent) transfer.push(res.translucent.verts, res.translucent.idx);
      // hand the scratch snapshot buffers back so the main thread can reuse them
      transfer.push(msg.blocks.buffer, msg.states.buffer, msg.sky.buffer, msg.light.buffer,
        msg.grassTint.buffer, msg.foliageTint.buffer, msg.waterTint.buffer);
      self.postMessage({
        type: 'mesh', key: msg.key, sy: msg.sy, gen: msg.gen,
        opaque: res.opaque, translucent: res.translucent,
        scratch: {
          blocks: msg.blocks, states: msg.states, sky: msg.sky, light: msg.light,
          grassTint: msg.grassTint, foliageTint: msg.foliageTint, waterTint: msg.waterTint,
        },
        ms: performance.now() - t0,
      }, transfer);
    } catch (err) {
      self.postMessage({ type: 'error', key: msg.key, sy: msg.sy, error: String(err && err.stack || err) });
    }
  }
};
