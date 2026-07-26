// Structural + playability check for every map in the roster.
//
//   node tools/validate-maps.js            all maps
//   node tools/validate-maps.js mansion    one map
//
// Beyond the schema check it walks the physics: every spawn and every declared
// hiding spot must be reachable-ish (not buried inside geometry), and the map
// must not be so airtight that a hunter can never see a hider.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateMap } from '../shared/maps/kit.js';
import { createWorld, capsuleOverlaps, unstick, groundHeightAt, lineOfSight } from '../shared/collision.js';
import { MOVE } from '../shared/constants.js';
import { computeBlend } from '../shared/blend.js';

const only = process.argv[2];

// Scan the directory rather than importing the roster index, so a single map
// can be validated while its siblings are still being written.
const mapsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'maps');
const files = readdirSync(mapsDir).filter((f) => f.startsWith('map_') && f.endsWith('.js')).sort();
const mods = [];
for (const f of files) {
  try {
    const mod = await import(join(mapsDir, f));
    if (!mod.meta?.id || typeof mod.build !== 'function') {
      console.error(`FAIL ${f}: must export { meta:{id,...}, build() }`);
      process.exitCode = 1;
      continue;
    }
    mods.push(mod);
  } catch (err) {
    console.error(`FAIL ${f}: ${err.message}`);
    process.exitCode = 1;
  }
}
if (!mods.length) {
  console.error('No map files found.');
  process.exit(1);
}

let failures = 0;
let warnings = 0;
const rows = [];

for (const mod of mods) {
  if (only && mod.meta.id !== only) continue;
  const t0 = Date.now();
  let def;
  try {
    def = mod.build();
  } catch (err) {
    console.error(`FAIL ${mod.meta.id}: build threw ${err.stack}`);
    failures++;
    continue;
  }

  const errs = validateMap(def);
  const warns = [];
  const world = createWorld(def);
  const r = MOVE.radius, h = MOVE.height[0];

  // Spawns must be standable.
  const allSpawns = [...def.spawns.hiders, ...def.spawns.seekers];
  let stuckSpawns = 0;
  for (const s of allSpawns) {
    const ground = groundHeightAt(world, s[0], s[2], s[1] + 3);
    const pos = { x: s[0], y: Math.max(s[1], ground) + 0.05, z: s[2] };
    if (capsuleOverlaps(world, pos.x, pos.y, pos.z, r, h)) {
      if (!unstick(world, pos, r, h)) stuckSpawns++;
      else warns.push(`spawn ${s.map((v) => v.toFixed(1))} needed unsticking`);
    }
  }
  if (stuckSpawns) errs.push(`${stuckSpawns} spawn(s) buried in geometry`);

  // Hiding spots must fit a crouched chameleon and be worth hiding in.
  let badSpots = 0, weakSpots = 0;
  for (const spot of def.hidingSpots) {
    const sh = MOVE.height[spot.stance === 'prone' ? 2 : spot.stance === 'stand' ? 0 : 1];
    const ground = groundHeightAt(world, spot.p[0], spot.p[2], spot.p[1] + 3);
    const pos = { x: spot.p[0], y: Math.max(spot.p[1], ground) + 0.03, z: spot.p[2] };
    if (capsuleOverlaps(world, pos.x, pos.y, pos.z, r * 0.9, sh)) {
      if (!unstick(world, pos, r * 0.9, sh, 8)) badSpots++;
    }
    const blend = computeBlend(world, pos, { body: [0.5, 0.5, 0.5] });
    if (!blend.samples.length) weakSpots++;
  }
  if (badSpots > def.hidingSpots.length * 0.25) errs.push(`${badSpots}/${def.hidingSpots.length} hiding spots are inside solid geometry`);
  else if (badSpots) warns.push(`${badSpots} hiding spot(s) clipped into geometry`);
  if (weakSpots) warns.push(`${weakSpots} hiding spot(s) have nothing nearby to blend with`);

  // Sight lines: a hunter standing at a seeker spawn should see *something*.
  const eye = def.spawns.seekers[0];
  let visible = 0;
  for (const s of def.spawns.hiders) {
    if (lineOfSight(world,
      { x: eye[0], y: eye[1] + MOVE.eye[0], z: eye[2] },
      { x: s[0], y: s[1] + 0.5, z: s[2] })) visible++;
  }
  const openness = def.spawns.hiders.length ? visible / def.spawns.hiders.length : 0;
  if (openness > 0.95) warns.push('every hider spawn is visible from the seeker spawn (too open)');

  const solids = def.props.filter((p) => p.solid).length;
  if (errs.length) failures++;
  warnings += warns.length;

  rows.push({
    id: def.id,
    name: def.name,
    props: def.props.length,
    solids,
    spots: def.hidingSpots.length,
    lights: def.lights.length,
    spawns: `${def.spawns.hiders.length}/${def.spawns.seekers.length}`,
    ms: Date.now() - t0,
    status: errs.length ? 'FAIL' : warns.length ? 'warn' : 'ok',
  });

  for (const e of errs) console.error(`  FAIL ${def.id}: ${e}`);
  for (const w of warns) console.warn(`  warn ${def.id}: ${w}`);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(`${pad('id', 14)}${pad('name', 26)}${pad('props', 7)}${pad('solid', 7)}${pad('spots', 7)}${pad('light', 7)}${pad('spawn', 8)}${pad('ms', 5)}status`);
for (const r of rows) {
  console.log(`${pad(r.id, 14)}${pad(r.name, 26)}${pad(r.props, 7)}${pad(r.solids, 7)}${pad(r.spots, 7)}${pad(r.lights, 7)}${pad(r.spawns, 8)}${pad(r.ms, 5)}${r.status}`);
}
console.log(`\n${rows.length} map(s), ${failures} failing, ${warnings} warning(s).`);
process.exit(failures ? 1 : 0);
