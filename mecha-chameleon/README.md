# Mecha Chameleon

Online hide-and-seek. Hiders paint themselves to match the room and hold a pose;
hunters get paint guns and a timer. Browser client, authoritative Node server,
**zero dependencies** — no npm install, no build step, no assets to download.

```bash
cd mecha-chameleon
node server/index.js
# open http://localhost:8080
```

That is the whole setup. The server prints your LAN address too, so anyone on
the same network can join by opening it.

---

## Playing with other people

**By link.** Create a room and hit *Copy link*. It looks like
`http://yourhost:8080/?join=ABC12`. Anyone who opens it drops straight into your
lobby — no account, no client to install.

**By code.** *Join by Code* on the main menu takes the five-character room code.

**By username.** Set a username on the main menu, then invite someone by handle
from the lobby. If they are online the invite pops up on their screen; if they
are not, it waits for them and fires the moment they connect.

**Solo.** *Solo vs Bots* creates a private room with bots so you can practise
hiding with nobody watching. Bots also pad any lobby that is short of players.

To play with people outside your network, expose the port however you normally
would (`ssh -R`, Tailscale, a tunnel, a VPS). The server is a plain HTTP + WebSocket
listener on one port and does not care where the traffic comes from.

---

## The round

`LOBBY → INTERMISSION → PREP → HUNT → ROUND END → …`

During **prep** the hiders roam free while the hunters are frozen. Hiders pick a
spot, paint their body, and lock a pose. When prep ends the hunters are released
(after a three-second grace) and have to find everyone before the clock dies.
Hiders win if a single one of them is still unfound at zero.

### Modes

| Mode | What changes |
| --- | --- |
| **Normal** | Tagged hiders are out. Hunters must find them all. |
| **Infection** | Every hider you tag stands up as a hunter. |
| **Versus** | Everyone hides, then the whole lobby is released to hunt each other. |
| **Chaos** | Paint stays unlocked during the hunt. Keep moving, keep changing. |
| **Blackout** | Lights out. Hunters get a torch cone and nothing else. |
| **One Shot** | Marksman rifles, six rounds, no resupply. |

### Roles

**Hider** — full colour wheel, per-part painting (body, head, tail, legs, crest,
eyes), seven patterns, eight poses that each break your silhouette differently,
and three abilities: *Auto-Mimic* (paints you from the surfaces around you),
*Shed Skin* (drops a decoy), *Tail Dash*.

**Hunter** — five paint guns from a rapid-fire blaster to a scoped marksman
rifle, plus *Sonar Ping* and *Heat Sweep* for rooms you cannot read. One clean
hit tags a hider.

### The camouflage meter

Your blend score is computed from the actual colours of the surfaces around you,
weighted toward whatever you are closest to — a perfect match against a wall two
rooms away is worth nothing. Standing in the open with nothing to break your
outline caps the score no matter how good the colour is. The server computes it
independently and pays the end-of-round bonus off its own number.

---

## Controls

| | |
| --- | --- |
| Move / sprint | `WASD`, `Shift` |
| Crouch / prone / jump | `Ctrl`, `Z`, `Space` |
| Paint screen | `Q` |
| Pose wheel / emotes | `F` / `G` |
| Auto-Mimic | `T` |
| Abilities | `X`, `C` |
| Fire / reload | Mouse 1, `R` |
| Camera (hiders) | `V` |
| Scoreboard / map / chat | `Tab`, `M`, `Enter` |

Everything is rebindable in Settings. Gamepads and touch controls work too.

---

## Maps

Eighteen hand-built maps, each with its own palette and its own hiding problem:
Hide-and-Seek Mansion, Sewer, Backrooms, Indoor Country, Penguin Hotel, Sugar
Land, Osaka, Toy Room, Supermarket, Art Gallery, Subway, Swimming Pool, Cold
Storage, Viking Hall, Egypt, Museum, Arcade, Greenhouse.

Maps are pure data built by a small authoring DSL, so the client and the server
build byte-identical worlds from a map id — nothing is transferred at join time.

```bash
node tools/validate-maps.js            # schema + physics check on every map
node tools/validate-maps.js mansion    # one map
```

The validator walks the physics: it drops a capsule at every spawn and every
declared hiding spot and fails the map if anything is buried in geometry or
unreachable.

---

## Anti-cheat

The interesting one first:

**Hiders are not sent to hunters who cannot see them.** Every snapshot runs each
hider through a visibility test — distance bubble, FOV cone, then occlusion rays
at three heights, with hysteresis so a hider behind a pillar does not flicker. A
hunter's client is never told about a hider it has no line of sight to, so a
wallhacked client has nothing to draw. This is the only defence that actually
works against rendering cheats, and it costs one raycast per pair per snapshot.

The rest:

- **Server-authoritative movement.** The server re-simulates every input with the
  same physics the client predicted with, and its answer wins. Clients predict
  and reconcile; corrections are smoothed so honest play never rubber-bands.
- **Speedhack / time-warp.** Input batches are metered against real elapsed time
  with a token bucket, so a client cannot bank movement or run its clock fast.
- **Teleport / noclip.** Per-tick distance, final position inside solid geometry,
  and a line-of-sight check between where you were and where you claim to be.
- **Shots.** Fire rate, ammo and reload are server state. The hit ray is cast
  from the server's idea of your eye, against the server's world, and the victim
  is whoever the *server* hits — the client's claimed target is ignored. The
  angle between your claimed aim and your reported view is checked too.
- **Everything else.** Per-connection token buckets on messages, chat, shots and
  joins; payload size, shape and depth limits before parsing; name sanitisation
  that strips zero-width and bidi characters; strikes that decay over time and
  kick on repeat violations; player reports and vote-kick.

Strikes prefer clamping to kicking — a guard that punishes lag is worse than no
guard, so thresholds sit above what latency jitter can produce.

---

## Layout

```
shared/     imported by BOTH the browser and the server — one physics, one
            protocol, one blend metric, one map pack
server/     ws.js (RFC6455 from scratch) · index.js · rooms.js · match.js
            anticheat.js · bots.js · persist.js
client/     index.html · css/ · js/gl (WebGL2 instanced renderer)
            main.js · net.js · input.js · ui.js · hud.js · paintui.js
            chameleon.js · audio.js
tools/      validate-maps.js · e2e.js · test-sim.js
```

`ARCHITECTURE.md` documents every module contract.

The renderer is WebGL2 with four instanced primitives, a directional shadow map,
sixteen point lights and a torch cone — a 600-prop map is four draw calls for the
static world. The chameleon is built from the same primitives, so paint,
patterns and poses cost nothing extra. All audio is synthesised at runtime.

---

## Development

```bash
node server/index.js --verbose     # server with connection logging
node tools/validate-maps.js        # map schema + physics, every map
node tools/test-anticheat.js       # false positives first, then cheats
node tools/test-sim.js             # headless matches on every map and mode
node tools/test-play.js            # one browser, one round, actually played
node tools/e2e.js                  # two browsers: links, invites, chat
node tools/e2e.js --shots          # ...and screenshot every map
node tools/model-shot.js           # render the chameleon in every pose
```

`?preview=<mapId>` opens any map in an orbiting camera with no server needed —
useful when authoring.
