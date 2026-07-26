// Anti-cheat tests. Two halves, and the first matters more:
//
//   1. FALSE POSITIVES. Thousands of ticks of honest play - walking, sprinting,
//      jumping, crouching, stairs, wall-sliding, a lag spike that dumps six
//      inputs at once - must raise zero strikes. A guard that punishes latency
//      is worse than no guard.
//   2. Actual cheats: speedhack, teleport, noclip, rapid fire, shooting through
//      a wall, shooting away from where you claim to look, and a wallhack's
//      view of the world.

import { createGuard } from '../server/anticheat.js';
import { createWorld, lineOfSight } from '../shared/collision.js';
import { applyInput, BTN } from '../shared/movement.js';
import { getMap } from '../shared/maps/index.js';
import { MOVE, Role, Stance, GUNS, ANTICHEAT } from '../shared/constants.js';
import { mulberry32, dirFromAngles } from '../shared/math.js';

const mapDef = getMap('mansion');
const world = createWorld(mapDef);
const rng = mulberry32(99);

let failures = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function makePlayer(over = {}) {
  return {
    id: 1, name: 'T', role: Role.HIDER, alive: true, frozen: false,
    pos: { x: 0, y: 0.1, z: 8 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, stance: Stance.STAND, stamina: 100, staminaHold: 0,
    onGround: true, speedMul: 1, gun: 'standard', ammo: 24, reloadEnd: 0,
    lastShotAt: -99, cooldowns: {}, ...over,
  };
}

/** Run inputs through the same path match.js uses. */
function drive(guard, player, inputs, startNow, dtEach, onTick) {
  let now = startNow;
  let strikes = 0;
  const reasons = [];
  for (const raw of inputs) {
    now += dtEach;
    const v = guard.checkInput(player, raw, now);
    if (!v.ok) {
      strikes += v.strike || 0;
      reasons.push(`input:${v.reason}`);
      continue;
    }
    const input = v.clamped;
    const before = { ...player.pos };
    applyInput(world, player, input, input.dt);
    const after = { ...player.pos };
    const m = guard.afterMove(player, before, after, input, now);
    if (!m.ok) {
      strikes += m.strike || 0;
      reasons.push(m.reason);
      if (m.correct) { player.pos = { ...m.correct }; player.vel = { x: 0, y: 0, z: 0 }; }
    }
    onTick?.(player);
  }
  return { now, strikes, reasons, acStrikes: player.ac?.strikes || 0 };
}

console.log('\nfalse positives (honest play must be silent)');
{
  const guard = createGuard(world);
  const p = makePlayer();
  const dt = 1 / 60;
  const inputs = [];
  let seq = 0;
  // Walk, sprint, strafe, jump, crouch and turn, for 2000 ticks.
  for (let i = 0; i < 2000; i++) {
    const phase = i / 120;
    inputs.push({
      seq: ++seq, dt,
      mx: Math.sin(phase) * 0.9,
      mz: -Math.cos(phase * 0.7),
      yaw: Math.sin(i / 300) * 2.4,
      pitch: Math.sin(i / 190) * 0.4,
      buttons: (i % 240 < 90 ? BTN.SPRINT : 0) | (i % 400 === 0 ? BTN.JUMP : 0) | (i % 500 < 60 ? BTN.CROUCH : 0),
    });
  }
  const r = drive(guard, p, inputs, 1000, dt);
  check(r.acStrikes === 0, '2000 ticks of ordinary movement raise no strikes',
    r.acStrikes ? `${r.acStrikes.toFixed(2)} strikes: ${[...new Set(r.reasons)].join(', ')}` : '0 strikes');
}

{
  // Walking up and down the mansion staircase, which is the geometry most
  // likely to look like a teleport.
  const guard = createGuard(world);
  const p = makePlayer({ pos: { x: 0, y: 0.1, z: -3 } });
  const dt = 1 / 60;
  const inputs = [];
  for (let i = 0; i < 900; i++) {
    inputs.push({ seq: i + 1, dt, mx: 0, mz: i < 450 ? -1 : 1, yaw: 0, pitch: 0, buttons: 0 });
  }
  let peak = 0;
  const r = drive(guard, p, inputs, 2000, dt, (pl) => { peak = Math.max(peak, pl.pos.y); });
  check(r.acStrikes === 0, 'walking up and back down the staircase raises no strikes',
    `${r.acStrikes.toFixed(2)} strikes, peak y=${peak.toFixed(2)}`);
  check(peak > 2.5, 'the staircase was actually climbed', `peak y=${peak.toFixed(2)}`);
}

{
  // A lag spike: six frames of input arrive in one packet after a stall. The
  // budget must absorb it, because the wall clock really did advance.
  const guard = createGuard(world);
  const p = makePlayer();
  let now = 3000;
  guard.checkInput(p, { seq: 1, dt: 1 / 60, mx: 0, mz: -1, yaw: 0, pitch: 0, buttons: 0 }, now);
  now += 0.25; // 250 ms of silence
  let strikes = 0;
  for (let i = 0; i < 6; i++) {
    const v = guard.checkInput(p, { seq: 2 + i, dt: 1 / 30, mx: 0, mz: -1, yaw: 0, pitch: 0, buttons: 0 }, now);
    if (!v.ok) strikes += 1;
  }
  check(strikes === 0 && (p.ac?.strikes || 0) === 0, 'a 250 ms lag spike delivering 6 inputs is accepted',
    `${(p.ac?.strikes || 0).toFixed(2)} strikes`);
}

console.log('\ncheats (these must be caught)');
{
  // Speedhack: claim a full tick of movement every millisecond.
  const guard = createGuard(world);
  const p = makePlayer();
  let now = 4000;
  let rejected = 0;
  for (let i = 0; i < 400; i++) {
    now += 0.001;
    const v = guard.checkInput(p, { seq: i + 1, dt: 1 / 30, mx: 0, mz: -1, yaw: 0, pitch: 0, buttons: 0 }, now);
    if (!v.ok || v.clamped.dt < 1 / 30 - 1e-9) rejected++;
  }
  const granted = 400 - rejected;
  const simulated = granted / 30;   // each accepted input claims 1/30 s
  const real = 0.4;
  check(simulated <= real * 1.3, 'time-warp speedhack is throttled to real time',
    `${rejected}/400 clamped, ${simulated.toFixed(2)}s simulated in ${real}s real`);
  check((p.ac?.strikes || 0) > 1, 'and it accumulates strikes', `${(p.ac?.strikes || 0).toFixed(1)}`);
}

{
  // Teleport straight through the great hall's west wall.
  const guard = createGuard(world);
  const p = makePlayer({ pos: { x: -8, y: 0, z: -8 } });
  const before = { ...p.pos };
  const after = { x: -20, y: 0, z: -8 };
  p.pos = { ...after };
  const r = guard.afterMove(p, before, after, { dt: 1 / 60, seq: 1 }, 5000);
  check(!r.ok, 'a 12 m teleport is rejected', r.reason || '');
  check(!!r.correct, 'and a correction is issued back to the last good position');
}

{
  // Creeping through a wall slowly enough to dodge a per-tick distance check.
  const guard = createGuard(world);
  const p = makePlayer({ pos: { x: -11.4, y: 0, z: 0 } });
  const before = { ...p.pos };
  const after = { x: -12.6, y: 0, z: 0 };
  check(!lineOfSight(world, { x: before.x, y: 0.9, z: before.z }, { x: after.x, y: 0.9, z: after.z }),
    'the test really does straddle a solid wall');
  p.pos = { ...after };
  const r = guard.afterMove(p, before, after, { dt: 1 / 20, seq: 1 }, 5100);
  check(!r.ok, 'a slow phase through a wall is rejected', r.reason || 'ACCEPTED');
}

{
  // Rapid fire far above the gun's cadence.
  const guard = createGuard(world);
  const shooter = makePlayer({ role: Role.SEEKER, pos: { x: 0, y: 0, z: 6 } });
  const players = new Map([[1, shooter]]);
  let now = 6000;
  let ok = 0, blocked = 0;
  for (let i = 0; i < 60; i++) {
    now += 0.001;
    const v = guard.checkShot(shooter, { dir: [0, 0, -1] }, now, players);
    if (v.ok) { ok++; shooter.lastShotAt = now; } else blocked++;
  }
  check(blocked > 50, '1000 Hz trigger is blocked', `${ok} allowed, ${blocked} blocked`);
}

{
  // Claiming to shoot 60 degrees away from where the server sees you looking.
  const guard = createGuard(world);
  const shooter = makePlayer({ role: Role.SEEKER, yaw: 0, pitch: 0 });
  const players = new Map([[1, shooter]]);
  const off = dirFromAngles(Math.PI / 3, 0);
  const v = guard.checkShot(shooter, { dir: [off.x, off.y, off.z] }, 7000, players);
  check(!v.ok, 'a shot 60 degrees off the reported view is rejected', v.reason || 'ACCEPTED');
}

{
  // Shooting a hider through a solid wall: the server's own ray stops first.
  const guard = createGuard(world);
  const shooter = makePlayer({ id: 1, role: Role.SEEKER, pos: { x: -8, y: 0, z: -8 }, yaw: Math.PI / 2 });
  const victim = makePlayer({ id: 2, role: Role.HIDER, pos: { x: -19, y: 0, z: -8 } });
  const players = new Map([[1, shooter], [2, victim]]);
  const d = dirFromAngles(shooter.yaw, 0);
  const blocked = !lineOfSight(world,
    { x: shooter.pos.x, y: shooter.pos.y + MOVE.eye[0], z: shooter.pos.z },
    { x: victim.pos.x, y: victim.pos.y + 0.8, z: victim.pos.z });
  const v = guard.checkShot(shooter, { dir: [d.x, d.y, d.z], target: 2 }, 8000, players);
  check(blocked, 'the test wall really does block line of sight');
  check(v.ok && v.hitId !== 2, 'a hider behind a wall is not hit', `hitId=${v.hitId}`);
}

{
  // A hider in the open, in front of the hunter, must be hittable - the flip
  // side of the test above, and the one that breaks the game if it fails.
  const guard = createGuard(world);
  const shooter = makePlayer({ id: 1, role: Role.SEEKER, pos: { x: 0, y: 0, z: 6 }, yaw: 0 });
  const victim = makePlayer({ id: 2, role: Role.HIDER, pos: { x: 0, y: 0, z: 1 } });
  const players = new Map([[1, shooter], [2, victim]]);
  const eye = { x: 0, y: MOVE.eye[0], z: 6 };
  const target = { x: 0, y: 0.8, z: 1 };
  const d = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const len = Math.hypot(d.x, d.y, d.z);
  shooter.pitch = Math.asin(d.y / len);
  const v = guard.checkShot(shooter, { dir: [d.x / len, d.y / len, d.z / len] }, 9000, players);
  check(v.ok && v.hitId === 2, 'a hider in the open IS hit', `hitId=${v.hitId}`);
}

console.log('\nvisibility culling (the wallhack defence)');
{
  const guard = createGuard(world);
  const seeker = makePlayer({ id: 1, role: Role.SEEKER, pos: { x: 0, y: 0, z: 6 }, yaw: 0 });
  const openHider = makePlayer({ id: 2, role: Role.HIDER, pos: { x: 0, y: 0, z: -2 } });
  const wallHider = makePlayer({ id: 3, role: Role.HIDER, pos: { x: -19, y: 0, z: -8 } });
  const behindHider = makePlayer({ id: 4, role: Role.HIDER, pos: { x: 0, y: 0, z: 11 } });

  guard.beginTick();
  check(guard.visibleTo(seeker, openHider, 100), 'a hider in the open IS sent to the hunter');
  guard.beginTick();
  check(!guard.visibleTo(seeker, wallHider, 100), 'a hider two rooms away is NOT sent');
  guard.beginTick();
  check(!guard.visibleTo(seeker, behindHider, 100), 'a hider directly behind the hunter is NOT sent');

  // Hysteresis: still sent briefly after cover is regained, then dropped.
  guard.beginTick();
  guard.visibleTo(seeker, openHider, 200);
  openHider.pos.x = -19; openHider.pos.z = -8;
  guard.beginTick();
  const during = guard.visibleTo(seeker, openHider, 200.2);
  guard.beginTick();
  const after = guard.visibleTo(seeker, openHider, 200 + ANTICHEAT.pvsGrace + 0.2);
  check(during && !after, 'visibility has hysteresis, then drops', `during=${during} after=${after}`);

  // Point blank always sends, whatever the camera is doing.
  const hugging = makePlayer({ id: 5, role: Role.HIDER, pos: { x: 0.6, y: 0, z: 6.4 } });
  guard.beginTick();
  check(guard.visibleTo(seeker, hugging, 300), 'a hider at point-blank range is always sent');

  // Cost: this runs for every seeker/hider pair, every snapshot.
  const t0 = Date.now();
  for (let i = 0; i < 4000; i++) {
    guard.beginTick();
    guard.visibleTo(seeker, openHider, 400 + i);
  }
  const ms = Date.now() - t0;
  check(ms < 400, 'PVS is cheap enough to run per pair per snapshot', `4000 tests in ${ms}ms`);
}

console.log('\nflood control');
{
  const guard = createGuard(world);
  const conn = {};
  let allowed = 0;
  for (let i = 0; i < 500; i++) if (guard.rateLimit(conn, 'chat', 1000 + i * 0.001, 2, 4)) allowed++;
  check(allowed <= 6, '500 chat messages in a second are throttled', `${allowed} allowed`);
}

console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed.'}`);
process.exit(failures ? 1 : 0);
