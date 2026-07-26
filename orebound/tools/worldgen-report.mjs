// Offline world-generation statistics. Runs the real generator in Node.
import { WorldGen } from '../src/world/worldgen.js';
import { BLOCKS } from '../src/core/blocks.js';
import { BIOMES } from '../src/world/biomes.js';

const seed = Number(process.argv[2] || 4242);
const R = Number(process.argv[3] || 4);
const gen = new WorldGen(seed);

const counts = new Map();
const byBand = new Map();          // band -> {air, solid}
const biomeCount = new Map();
let t0 = performance.now();
let chunks = 0;

for (let cz = -R; cz <= R; cz++) {
  for (let cx = -R; cx <= R; cx++) {
    const out = gen.generateChunk(cx, cz);
    chunks++;
    for (const s of out.sections) {
      const baseY = -64 + s.sy * 16;
      if (s.fill !== undefined) {
        const name = BLOCKS[s.fill].name;
        counts.set(name, (counts.get(name) || 0) + 4096);
        band(baseY, name, 4096);
        continue;
      }
      for (let i = 0; i < 4096; i++) {
        const name = BLOCKS[s.blocks[i]].name;
        counts.set(name, (counts.get(name) || 0) + 1);
        band(baseY + (i >> 8), name, 1);
      }
    }
    for (const b of out.biomeMap) biomeCount.set(BIOMES[b].name, (biomeCount.get(BIOMES[b].name) || 0) + 1);
  }
}
function band(y, name, n) {
  const k = Math.floor(y / 16) * 16;
  let e = byBand.get(k);
  if (!e) byBand.set(k, e = { air: 0, solid: 0 });
  if (name === 'air' || name === 'cave_air') e.air += n; else e.solid += n;
}

const ms = performance.now() - t0;
const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`seed ${seed}  ${chunks} chunks in ${ms.toFixed(0)}ms  (${(ms / chunks).toFixed(1)}ms/chunk)`);

console.log('\n-- underground air fraction by 16-block band (y >= -64, below y=56) --');
for (const k of [...byBand.keys()].sort((a, b) => a - b)) {
  if (k > 48) continue;
  const e = byBand.get(k);
  const f = e.air / (e.air + e.solid);
  console.log(`  y ${String(k).padStart(4)}..${String(k + 15).padStart(4)}  air ${(f * 100).toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(f * 50))}`);
}

// "if I dig straight down, do I hit a cave?" -- the metric that actually
// decides whether the underground feels explorable.
{
  let hit = 0, cols = 0, gaps = [];
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      const out = gen.generateChunk(cx, cz);
      const flat = new Uint16Array(16 * 384 * 16);
      for (const s2 of out.sections) {
        const off = s2.sy * 4096;
        if (s2.fill !== undefined) flat.fill(s2.fill, off, off + 4096);
        else flat.set(s2.blocks, off);
      }
      const at = (x, y, z) => flat[((y + 64) << 8) | (z << 4) | x];
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          cols++;
          let run = 0, best = 0, any = false;
          for (let y = -55; y < 45; y++) {
            const n = BLOCKS[at(x, y, z)].name;
            if (n === 'air' || n === 'cave_air') { any = true; run++; if (run > best) best = run; }
            else run = 0;
          }
          if (any) hit++;
          gaps.push(best);
        }
      }
    }
  }
  gaps.sort((a, b) => a - b);
  console.log(`\n-- dig-down: ${(hit / cols * 100).toFixed(1)}% of columns hit open cave between y=-55 and y=45`);
  console.log(`   median largest gap ${gaps[gaps.length >> 1]}  p90 ${gaps[Math.floor(gaps.length * 0.9)]}  max ${gaps[gaps.length - 1]}`);
}

console.log('\n-- ores per chunk --');
const perChunk = n => (n / chunks).toFixed(2);
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  if (!name.includes('_ore')) continue;
  console.log(`  ${name.padEnd(28)} ${perChunk(n).padStart(8)}`);
}

console.log('\n-- top blocks --');
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${name.padEnd(22)} ${(n / total * 100).toFixed(2).padStart(6)}%  ${perChunk(n).padStart(9)}/chunk`);
}

console.log('\n-- biomes --');
for (const [name, n] of [...biomeCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name.padEnd(20)} ${(n / (chunks * 256) * 100).toFixed(1).padStart(5)}%`);
}
