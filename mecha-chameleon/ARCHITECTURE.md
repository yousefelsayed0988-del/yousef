# Mecha Chameleon — architecture and module contracts

Hide-and-seek where hiders paint themselves into the scenery and hunters flush
them out with paint guns. Browser client, authoritative Node server, zero
runtime dependencies.

```
mecha-chameleon/
  shared/      imported by BOTH the browser and the server (plain ESM, no DOM, no node APIs)
    constants.js   tunables + enums          math.js      vectors, matrices, rng
    color.js       colour + distance metric  blend.js     camouflage scoring
    collision.js   world, capsule move, raycast, LOS, surroundings
    movement.js    one input step, run identically by client and server
    navgraph.js    walkable graph baked from collision geometry + A*
    protocol.js    opcodes + payload sanitisers
    maps/kit.js    map authoring DSL         maps/index.js  the 18-map roster
    maps/map_*.js  one file per map
  server/
    ws.js        RFC6455 WebSocket server (zero-dep)
    index.js     HTTP static host + socket wiring + tick loop
    rooms.js     room codes, join links, usernames, invites, quick match
    match.js     authoritative game state machine
    anticheat.js validation, PVS culling, strikes
    bots.js      offline/filler AI
  client/
    index.html  css/style.css
    js/main.js  js/net.js  js/input.js  js/audio.js  js/chameleon.js
    js/gl/renderer.js  js/gl/shaders.js  js/gl/meshes.js
    js/ui.js    js/paintui.js  js/hud.js
  tools/       validate-maps.js  test-sim.js  test-anticheat.js
               e2e.js (real browsers)  model-shot.js (pose renders)
```

Movement is the one piece of code that MUST be identical on both ends:
`shared/movement.js` is what the client predicts with, what the server decides
with, and what the anti-cheat compares against. Forking a constant out of it
shows up as rubber-banding and then as false-positive strikes.

Bots need to route around walls, which pure steering cannot do — they park in
the first wall between them and their goal. `shared/navgraph.js` samples
standable ground on a grid (several levels per cell, so balconies and stair
landings are their own nodes), links neighbours a player could actually walk
between (including up a staircase, which climbs far more than a step height
between two grid cells), and A*s over it. It is built once per world and
cached, and a cross-map query costs about 0.03 ms.

**Golden rule:** anything under `shared/` runs in Node *and* the browser. No
`document`, no `require`, no `fs`. Import with explicit `.js` extensions.

---

## 1. Coordinate system and units

Metres. `+Y` is up. Yaw `0` looks down `-Z`; yaw increases counter-clockwise
seen from above. `dirFromAngles(yaw, pitch)` in `math.js` is the only place
that convention is encoded — use it rather than re-deriving sin/cos.

A player is a vertical capsule: `MOVE.radius` (0.34) by
`MOVE.height[stance]` (1.62 / 1.0 / 0.5), with the eye at `MOVE.eye[stance]`.
`pos` is the **feet** position, not the centre.

---

## 2. Map contract (`shared/maps/map_*.js`)

Every map file exports exactly two things:

```js
export const meta = { id, name, theme, tagline, difficulty /* 1..4 */ };
export function build() { /* ... */ return m.finish(); }
```

`build()` is pure and deterministic: the kit's rng is seeded from the map id,
so two calls produce byte-identical output. Never call `Math.random()` in a map
— use `m.rand()`, `m.range(a,b)`, `m.irange(a,b)`, `m.pick(arr)`, `m.chance(p)`.

Read the header of `shared/maps/kit.js` for the full DSL and
`shared/maps/map_mansion.js` for a complete worked example. The essentials:

| call | meaning |
| --- | --- |
| `m.box(x, yBottom, z, w, h, d, colour, opts)` | footprint-centred, floor-seated box |
| `m.boxc(x, yCentre, z, w, h, d, colour, opts)` | centred on all three axes |
| `m.cyl(x, yBottom, z, r, h, colour, opts)` | vertical cylinder |
| `m.sphere(x, yCentre, z, r, colour, opts)` | sphere |
| `m.wedge(...)` | triangular prism, **decorative unless `solid: true`** |
| `m.room({x,z,w,d,h,floor,wall,ceil,openings})` | floor + 4 walls, door/window gaps |
| `m.wall(x1,z1,x2,z2,h,colour,{thickness,y})` | free-standing wall segment |
| `m.perimeter(h, colour)` | outer shell so nobody leaves the level |
| `m.floor / m.ceil / m.stairs / m.fence / m.rug / m.poster / m.pipe` | surfaces |
| `m.table / m.chair / m.shelf / m.sofa / m.bed / m.crate / m.crateStack / m.barrel / m.plant / m.locker / m.pillar` | furniture prefabs, most auto-register a hiding spot |
| `m.light(x,y,z,colour,intensity,range)` / `m.lamp(...)` | point lights (lamp adds an emissive fixture) |
| `m.spawnHider(x,z[,y])` / `m.spawnSeeker(x,z[,y])` / `m.lobbySpawn(x,z)` | spawns |
| `m.spot(x,y,z,{stance,quality,hint})` | curated hiding spot |
| `m.palette([...])` | the paint wheel's suggested swatches |

`opts` accepts `{ yaw /* degrees */, solid, tag, rough, metal, emis, opaque, jitter }`.
`solid: false` = visual only (rugs, posters, foliage). `opaque: false` = does
not block line of sight (glass, water, netting) but still collides.

### Quality bar for a map

* **250–600 props.** Below ~200 the room reads empty and there is nowhere to hide.
* **≥ 18 hiding spots** via `m.spot()`, spread across the whole footprint, with
  a mix of `stance: 'crouch' | 'prone' | 'stand'` and honest `quality` values
  (0.9 = you will not be found without luck; 0.5 = buys you ten seconds).
* **8–14 hider spawns** spread out, **3–5 seeker spawns** clustered away from them.
* **6–20 lights.** Indoor maps need them; the sun alone is flat.
* **A palette of 8–14 colours** drawn from the map's actual surfaces — this is
  what the paint wheel offers, so it must let a hider match real walls.
* **Sight-line variety:** some tight clutter, some open ground. A map that is
  all corridors is unwinnable for hunters; all-open is unwinnable for hiders.
* Colour discipline: pick 4–6 base hexes and shade them (`jitter`) rather than
  using dozens of unrelated colours.
* Verticality where it fits the theme: shelves, catwalks, stair landings.

Validate with `node tools/validate-maps.js <id>` — it builds the map, runs the
schema check, and walks the physics to prove spawns and spots are standable.

---

## 3. Player state (server-authoritative)

`match.js` owns one of these per participant; bots reuse the identical shape.

```js
Player = {
  id, name, username, bot, connected,
  role,            // Role.SPECTATOR | HIDER | SEEKER
  alive, frozen,   // frozen: hunters during prep / release grace
  pos:{x,y,z}, vel:{x,y,z}, yaw, pitch,
  stance,          // Stance.STAND | CROUCH | PRONE
  sprinting, stamina, onGround,
  paint: { body, head, tail, legs, crest, eyes,   // each [r,g,b] 0..1
           pattern, patternColor },               // pattern from PAINT.patterns
  pose,            // POSES[].id
  emote,           // { id, until } | null
  gun, ammo, reloadEnd, lastShotAt,
  cooldowns: { scan, thermal, mimic, decoy, dash },  // absolute seconds
  blend,           // 0..1, refreshed by the server, never trusted from a client
  score, tags, survivedFor, xp,
  lastSeq,         // last accepted input sequence
  ac,              // anti-cheat scratch state (see §6)
}
```

---

## 4. Match contract (`server/match.js`)

```js
import { createMatch } from './match.js';

const match = createMatch({
  mapId, modeId,
  rng,                       // seeded () => number
  now,                       // seconds, monotonic
  emit(type, payload, to),   // to: undefined = everyone, number = one player id,
                             //     number[] = several
});

match.addPlayer({ id, name, username, bot })   -> Player
match.removePlayer(id)
match.queueInput(id, input)      // validated by anticheat before it lands
match.command(id, type, payload) // paint / pose / emote / shoot / reload / ability / gun
match.tick(dt, now)              // fixed TICK_DT steps, drives phases
match.snapshotFor(id)            // visibility-filtered state for one client
match.state                      // { phase, phaseEndsAt, round, mapId, modeId, ... }
match.scoreboard()
```

`input` (one entry of the batched `C2S.INPUT` payload):

```js
{ seq, dt, mx, mz,      // mx/mz: -1..1 movement intent in the player's frame
  yaw, pitch,
  buttons }             // bitfield: 1 jump, 2 sprint, 4 crouch, 8 prone, 16 use
```

Phase machine: `LOBBY → INTERMISSION → PREP → HUNT → ROUND_END → (next round |
MATCH_END) → LOBBY`. Durations come from `MODES[modeId]` and `ROUND`.

---

## 5. Anti-cheat contract (`server/anticheat.js`)

Pure module: no sockets, no timers, no I/O. It is handed state and returns
verdicts, so it can be unit-tested headlessly.

```js
export function createGuard(world, opts) -> Guard

Guard.checkInput(player, input, now)
  -> { ok: boolean, reason?: string, strike?: number, clamped: input }
     // rejects impossible dt, out-of-range look angles, malformed fields;
     // clamps rather than rejecting where a legitimate client could drift.

Guard.afterMove(player, before, after, input, now)
  -> { ok, reason?, strike?, correct?: {x,y,z} }
     // compares the server's own simulation against what the client claimed:
     // speed cap, vertical impossibility, wall penetration, teleport distance.

Guard.checkShot(player, shot, now, players)
  -> { ok, reason?, strike?, hitId?: number|null, point?, dist? }
     // server-side ray from the SERVER's eye position. Validates fire rate,
     // ammo, reload state, range, spread cone against the claimed direction,
     // and line of sight. The client's claimed victim is never trusted.

Guard.visibleTo(seeker, hider, now) -> boolean
     // PVS: distance bubble, FOV cone, then occlusion rays at
     // ANTICHEAT.pvsRayHeights, with ANTICHEAT.pvsGrace hysteresis.
     // Callers use this to DECIDE WHETHER TO SERIALISE a hider at all —
     // this is the wallhack defence, so a false positive leaks a position.

Guard.rateLimit(conn, kind, now) -> boolean   // messages, chat, shots, joins
Guard.strike(player, reason, weight, now)     // accumulate; decays over time
Guard.shouldKick(player, now) -> boolean
Guard.report(player) -> { strikes, violations, flags }
```

Every violation must be *logged with its numbers* (claimed vs. computed) so a
false positive is diagnosable. Prefer clamping to kicking: the kick threshold
exists for repeat, unambiguous violations only.

---

## 6. Bots contract (`server/bots.js`)

```js
export function createBotBrain({ player, world, mapDef, difficulty, rng }) -> Brain

Brain.think(ctx, dt, now) -> { input, commands }
// ctx (assembled by match.js, and deliberately the ONLY window a bot has on
// the world — a bot cannot see anything a human client would not be sent):
//   { phase, mode, self,            // self is the bot's own Player
//     targets: [{ id, pos, role }], // ONLY what the PVS says this bot can see
//     sounds:  [{ pos, kind, at }], // recent audible events near the bot
//     timeLeft }
// input    = the standard input record from §4
// commands = [{ type:'paint'|'pose'|'shoot'|'reload'|'ability'|'emote', ... }]

Brain.onEvent(type, payload)  // shots/tags the bot could perceive
```

Bots go through `match.queueInput()` / `match.command()` exactly like a human —
no privileged access to hider positions, which is why `ctx.targets` is already
visibility-filtered. A hider bot walks to a `hidingSpot`, paints with
`autoPaint()` from `shared/blend.js`, and holds a pose. A hunter bot patrols
between rooms, sweeps its view, and fires only at `ctx.targets`.

---

## 7. Renderer contract (`client/js/gl/renderer.js`)

WebGL2, instanced. The renderer draws *primitive instances*; nothing else.

```js
createRenderer(canvas) -> R
R.loadMap(mapDef)                 // bakes static props into instance buffers
R.beginFrame(camera, env, time)   // camera: {pos, yaw, pitch, fov, aspect}
R.drawInstance(type, pos, size, yaw, colour, params)  // dynamic props/characters
R.drawSprite(...)                 // splashes, markers
R.endFrame()
R.resize(w, h)
```

`type` is `0 box | 1 cylinder | 2 sphere | 3 wedge`, matching the map encoding.
`params` is `[roughness, metal, emissive, alpha]`.

## 8. Character contract (`client/js/chameleon.js`)

Pure geometry description — no GL calls, no DOM. The renderer consumes it.

```js
export function buildChameleon(paint, pose, animT, stance, opts) -> Part[]
// Part = { type, off:{x,y,z}, size:{x,y,z}, yaw, pitch, roll, colour:[r,g,b], params:[..] }
// Offsets are in the character's local frame: +Y up, -Z forward, origin at the feet.
```

Paint parts map to `PAINT.parts`. `pose` is a `POSES[].id`; `animT` is seconds
of animation time; `opts` may carry `{ moving, speed, tagged, emote }`.

## 9. Audio contract (`client/js/audio.js`)

Procedural WebAudio — no asset files, nothing fetched.

```js
export function createAudio() -> A
A.unlock()                                  // call from a user gesture
A.play(name, { pos, volume, rate })         // 3D-panned relative to the listener
A.setListener(pos, yaw)
A.music(trackName | null)
A.setVolume(master, sfx, music)
```

Required cues: `shot`, `reload`, `tag`, `splash`, `footstep`, `land`, `paint`,
`uiClick`, `uiHover`, `countdown`, `phasePrep`, `phaseHunt`, `win`, `lose`,
`scan`, `heartbeat`, `emote`.

## 10. UI contract (`client/js/ui.js`)

```js
export function createUI(game) -> U
U.show(screen, data)   // 'boot' | 'menu' | 'play' | 'lobby' | 'browser' |
                       // 'settings' | 'results' | 'profile' | 'help'
U.toast(text, kind)    // 'info' | 'warn' | 'error' | 'good'
U.setHUD(state)        // phase, timer, role, ammo, blend, alive counts
U.chat(entry) / U.roomState(room) / U.scores(rows)
U.bind(events)         // { onCreateRoom, onJoin, onInvite, onStart, onSetOption, ... }
```

UI never talks to the network directly — it calls the callbacks `game` binds.

---

## 11. Networking

JSON over WebSocket. Opcodes and sanitisers live in `shared/protocol.js`;
`decode()` already enforces size, shape and depth limits, so handlers may
assume they have a plain object with a short string `t` and nothing else.

Client prediction: the client simulates the local player immediately with the
same `moveCapsule`, keeps unacknowledged inputs, and on `S2C.CORRECTION`
rewinds to the server position and replays the pending inputs. Remote players
are interpolated `INTERP_DELAY` seconds in the past.

Joining: a room code (5 chars, `NET.roomCodeAlphabet`) doubles as a share link
`?join=CODE`. Usernames are registered per connection and are the key for
`C2S.INVITE`, so a player can be pulled into a room by handle alone.
