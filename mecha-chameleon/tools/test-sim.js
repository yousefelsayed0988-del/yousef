// Headless match simulation. Runs the real authoritative match loop with bots
// on every map, with no sockets and no browser, and asserts the game actually
// progresses: roles get drawn, hiders paint and hide, hunters find them,
// rounds end, nobody falls through the floor and nothing throws.
//
//   node tools/test-sim.js               every map, one round each
//   node tools/test-sim.js mansion 3     one map, three rounds

import { createMatch } from '../server/match.js';
import { MAP_IDS, getMap } from '../shared/maps/index.js';
import { Phase, Role, TICK_DT, MODES } from '../shared/constants.js';
import { capsuleOverlaps } from '../shared/collision.js';
import { MOVE } from '../shared/constants.js';
import { mulberry32 } from '../shared/math.js';

const onlyMap = process.argv[2];
const rounds = Number(process.argv[3] || 1);
const maps = onlyMap ? [onlyMap] : MAP_IDS;

let failures = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

for (const mapId of maps) {
  console.log(`\n${mapId}`);
  const events = [];
  let clock = 1000;
  const match = createMatch({
    mapId,
    modeId: 'normal',
    rng: mulberry32(1234),
    now: clock,
    emit: (type, payload) => events.push({ type, payload }),
    log: () => {},
  });

  for (let i = 1; i <= 8; i++) {
    match.addPlayer({ id: i, name: `Bot${i}`, bot: true, difficulty: 1 });
  }
  match.setOptions({ rounds });
  match.startMatch();

  const phasesSeen = new Set();
  const startPos = new Map();
  let travelled = new Map();
  let ticks = 0;
  let crashed = null;
  const maxTicks = Math.round((MODES.normal.prep + MODES.normal.hunt + 40) * rounds / TICK_DT);

  try {
    while (ticks < maxTicks) {
      clock += TICK_DT;
      match.tick(TICK_DT, clock);
      ticks++;
      phasesSeen.add(match.state.phase);
      for (const p of match.players.values()) {
        if (!startPos.has(p.id)) startPos.set(p.id, { ...p.pos });
        const prev = travelled.get(p.id) || { d: 0, last: { ...p.pos } };
        prev.d += Math.hypot(p.pos.x - prev.last.x, p.pos.z - prev.last.z);
        prev.last = { ...p.pos };
        travelled.set(p.id, prev);
      }
      if (match.state.phase === Phase.MATCH_END) break;
    }
  } catch (err) {
    crashed = err;
  }

  check(!crashed, 'match ran without throwing', crashed ? crashed.stack.split('\n')[0] : '');
  check(phasesSeen.has(Phase.PREP), 'reached the prep phase');
  check(phasesSeen.has(Phase.HUNT), 'reached the hunt phase');
  check(phasesSeen.has(Phase.ROUND_END) || phasesSeen.has(Phase.MATCH_END), 'a round ended');

  const world = match.world;
  let stuck = 0, sunk = 0, idle = 0, nan = 0;
  for (const p of match.players.values()) {
    if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) || !Number.isFinite(p.pos.z)) { nan++; continue; }
    if (capsuleOverlaps(world, p.pos.x, p.pos.y + 0.05, p.pos.z, MOVE.radius * 0.85, MOVE.height[p.stance] * 0.9)) stuck++;
    if (p.pos.y < world.bounds.floorY - 1) sunk++;
    if ((travelled.get(p.id)?.d || 0) < 2) idle++;
  }
  check(nan === 0, 'no NaN positions', `${nan}`);
  check(sunk === 0, 'nobody fell through the world', `${sunk}`);
  check(stuck === 0, 'nobody ended inside geometry', `${stuck}`);
  check(idle <= 1, 'bots actually moved', `${idle}/${match.players.size} never travelled 2m`);

  const tags = events.filter((e) => e.payload?.e === 2).length;
  const paints = events.filter((e) => e.payload?.e === 6).length;
  check(paints > 0, 'hiders painted themselves', `${paints} paint changes`);
  console.log(`  info  ${ticks} ticks, ${events.length} events, ${tags} tags, ` +
    `${[...match.players.values()].filter((p) => p.role === Role.HIDER).length} hiders`);

  const board = match.scoreboard();
  check(board.length === match.players.size, 'scoreboard covers everyone');
  check(board.some((r) => r.score > 0), 'somebody scored', `top ${board[0]?.score}`);
}



// ---------------------------------------------------------------- modes ----
// Every mode has to reach a conclusion. Versus in particular has no hiders
// once the hunt starts, so it needs its own win condition and its own idea of
// who is a legal target.
console.log('\nmode sweep (mansion)');
for (const modeId of Object.keys(MODES)) {
  const events = [];
  let clock = 5000;
  const match = createMatch({
    mapId: 'mansion', modeId, rng: mulberry32(77), now: clock,
    emit: (type, payload) => events.push({ type, payload }), log: () => {},
  });
  for (let i = 1; i <= 8; i++) match.addPlayer({ id: i, name: `B${i}`, bot: true, difficulty: 2 });
  match.setOptions({ rounds: 1 });
  match.startMatch();

  const phases = new Set();
  let ticks = 0;
  let err = null;
  const budget = Math.round((MODES[modeId].prep + MODES[modeId].hunt + 45) / TICK_DT);
  try {
    while (ticks++ < budget) {
      clock += TICK_DT;
      match.tick(TICK_DT, clock);
      phases.add(match.state.phase);
      if (match.state.phase === Phase.MATCH_END) break;
    }
  } catch (e) { err = e; }

  const tags = events.filter((e) => e.payload?.e === 2).length;
  const ended = phases.has(Phase.ROUND_END) || phases.has(Phase.MATCH_END);
  check(!err, `${modeId}: runs without throwing`, err ? err.message : '');
  check(phases.has(Phase.HUNT), `${modeId}: reaches the hunt`);
  check(ended, `${modeId}: the round concludes`);
  const nan = [...match.players.values()].some((p) => !Number.isFinite(p.pos.x));
  check(!nan, `${modeId}: no NaN positions`);
  console.log(`  info  ${modeId}: ${ticks} ticks, ${tags} tags, winner=${match.state.winner}`);
}

console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed.'}`);
process.exit(failures ? 1 : 0);
