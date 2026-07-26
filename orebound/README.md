# Orebound

A voxel survival game. You start with nothing, punch a tree, and work your way
from wooden tools to diamond while managing hunger, saturation, and whatever
comes out of the dark.

Survival only — no creative mode, no flying, no free blocks. One persistent
world, single player, no networking.

## Running it

**Windows:** double-click **`PLAY OREBOUND.bat`**.
**macOS / Linux:** run **`./play.sh`**.

Either one starts a small local server and opens the game in your browser.
Nothing is installed and nothing goes over the internet. Leave the console
window open while you play; closing it stops the server.

Or by hand, from inside the `orebound` folder:

```bash
node serve.mjs --open           # or: python3 -m http.server 8080
```

> **Do not open `index.html` by double-clicking it.** The game is built from
> JavaScript modules and runs terrain generation on worker threads, and browsers
> block both over `file://` — you get a black "loading orebound" screen and
> nothing else. The launchers exist precisely to avoid that. If you do open it
> from disk, the page now tells you so instead of hanging.

Requires WebGL2 and module workers: Chrome 91+, Firefox 114+, Safari 16.4+.

---

## Stack, and why

**Vanilla ES modules + raw WebGL2. No runtime dependencies, no build step.**

The spec suggested Three.js. I went lower-level on purpose:

- **The vertex format is the performance story.** Terrain is 95% of what gets
  drawn, and the win comes from packing a vertex into 24 bytes (position,
  UV, texture-array layer, sky/block light, AO, normal index, biome tint) and
  uploading one static buffer per sub-chunk. Going through a general-purpose
  scene graph would mean fighting its attribute layout to get there.
- **Workers need pure modules.** Generation and meshing run off-thread. Keeping
  those paths free of any renderer object made them trivially portable to a
  worker — and to Node, which is how the world generator gets tuned and tested
  offline (`tools/worldgen-report.mjs`).
- **A texture array beats an atlas.** WebGL2's `TEXTURE_2D_ARRAY` gives each
  block texture its own layer, so mipmapping and wrapping cannot bleed between
  neighbours. No atlas padding, no half-texel UV fudging.
- **No assets to infringe.** Every texture, icon, and sound is generated at
  runtime from a seeded RNG. There is not a single image or audio file in this
  project. That is a design constraint the spec asked for, and it is easier to
  honour with direct control over the pipeline.

~12,000 lines across `src/`.

---

## Controls

| Action | Key |
|---|---|
| Move | WASD |
| Jump | Space |
| Sneak | Left Shift |
| Sprint | Left Ctrl / double-tap W |
| Look | Mouse (click to lock the pointer) |
| Mine / attack | Left click (hold to break) |
| Place / use | Right click |
| Open inventory | E |
| Hotbar select | 1–9 / scroll wheel |
| Drop item | Q |
| Debug overlay | F3 |
| Pause | Esc |

Also in-game under **Pause → Controls & Help**.

---

## Architecture

### Threading

Three lanes, and the render thread owns none of the expensive work:

```
 main thread          generation pool          meshing pool
 ───────────          ───────────────          ────────────
 input, physics  ──▶  noise, caves, ores  ──▶  face culling, AO,
 entity ticks         features, structures     light interpolation
 light BFS (budgeted)         │                        │
 GL draw calls  ◀─────────────┴────────────────────────┘
                        (transferable buffers, zero copies)
```

Pool sizes come from `hardwareConcurrency`, biased toward generation (the
heavier of the two). Chunk requests are served **nearest-first** from a sorted
priority queue that is rebuilt when the player crosses a chunk boundary.

Snapshot buffers handed to the meshing workers are *transferred back* on
completion and recycled, so steady-state meshing allocates nothing.

Measured on this machine (software GL, render distance 8, sprinting through
forest): **3.0 ms total main-thread frame time** — 1.1 ms simulation, 0.2 ms
world/chunk management, 1.7 ms issuing draw calls. Generation averages ~17 ms
per chunk column and meshing ~0.9 ms per sub-chunk, both entirely off-thread.

### Chunk storage

The world is 384 blocks tall (y = −64 to 320), which makes naive storage
ruinous: a dense column is ~500 KB, and render distance 8 means ~250 of them.

Two things keep it affordable:

1. **Sections are 16³, and a uniform section stores one value.** Deep stone and
   open sky cost a single integer each — no arrays at all — until something
   writes a differing block, at which point the arrays are materialised. In a
   typical column most sections stay uniform.
2. **Light arrays are allocated separately from block arrays.** A uniform stone
   section being lit does not pay for block storage it does not need.

### Meshing

**One mesh per 16³ sub-chunk**, never per 16×16×384 column — a column-tall mesh
makes frustum culling almost useless, since any column with one visible block
draws all 384 blocks' worth of geometry.

Non-cube blocks (slabs, stairs, fences, panes, doors, torches, beds, cacti,
farmland, snow layers) are all described as small **box lists** in
`render/models.js`. The mesher emits box faces and culls only faces flush with
a block boundary against an opaque neighbour. That single mechanism replaces
what would otherwise be a dozen special cases in the mesher.

Ambient occlusion is per-vertex, computed from the three neighbouring blocks at
each corner, with sky and block light averaged over the four cells touching
that corner.

**Cutout textures get an alpha/mask bleed pass.** Mipmapping averages RGBA
across texels, so a plant whose transparent pixels are black would go grey and
lose its biome tint at distance. Dilating the neighbouring colour and tint mask
outward (leaving alpha at 0) keeps the mip chain honest. This was a visible bug
before it was fixed — grass rendered grey instead of green.

### Lighting

Sky light and block light are separate 4-bit channels, combined and clamped at
shading time. Propagation is a breadth-first flood fill driven from a **bounded
work queue**: at most `lightOpsPerFrame` node expansions run per frame, so
draining an ocean or blowing the roof off a cavern degrades into a visible light
wave rather than a frame hitch or a runaway loop.

Sky light falls straight down without attenuation while it is still at full
strength, which is what makes overhangs and cave mouths shade correctly.

One subtlety worth recording: an unloaded chunk reads as fully lit, so a
neighbour's flood fill stops at the border with no gradient to cross. When a
chunk loads, light is re-seeded from the neighbour's border columns (bounded to
the band around the surface, where sky light actually varies).

### World generation

Deterministic from the seed, and identical on every thread — the same `WorldGen`
class runs in the worker, on the main thread, and in Node.

Per column: continentalness → a height spline, modulated by erosion, with
ridged noise adding mountain relief only where the continent is already high.
Biome comes from temperature/humidity/weirdness plus elevation, and then feeds
back as a height scale, so swamps sit low and mountains stay sharp.

Caves are two sets of spaghetti tunnels at different scales (the intersection of
two thin noise shells, widening with depth), cheese caverns biased deep, and
ravines from a ridged 2D field. Tuned against the metric that actually matters —
*if I dig straight down, do I hit open cave?* — using the offline report:

```bash
node orebound/tools/worldgen-report.mjs <seed> <radius>
```

Trees and structures use a **neighbourhood pass**: a chunk scans candidate
origins in the surrounding chunks and clips whatever lands inside its own
bounds. Nothing depends on a neighbour having been generated first, so there is
no ordering hazard and no "populate later" phase.

### Save format

Only the **delta from generated terrain** is stored. The seed regenerates the
world; per-chunk edit lists replay on top. Exploring a thousand chunks costs
almost nothing; the cost is proportional to what you actually built.

The payload is a packed binary stream (varint block indices), DEFLATE-compressed
via `CompressionStream`, in IndexedDB. A typical world is a few kilobytes.
JSON would be roughly 8× larger and noticeably slower to load.

Block and item ids are written through a **name table**, so the registries can
be reordered between versions without corrupting old saves.

Writes are atomic: the payload goes to a scratch key, then a single IndexedDB
transaction promotes it and clears the scratch — the equivalent of
write-temp-then-rename. An interrupted write cannot destroy the previous save.

Persisted: seed, time, weather, difficulty, chunk deltas, block entities (chest
contents, **furnace input/fuel/output/progress/remaining burn**, sign text,
spawner type), dropped items, mobs, boats, player state, and spawn point.

### Data-driven registries

Blocks, items, recipes, tags, biomes, and loot tables are data. Adding content
is adding a row, not changing engine code.

- `core/blocks.js` — block registry; the wood, stone, ore, and dye families are
  generated programmatically from small tables
- `core/items.js` — block-items derive from the block registry; tools, armour,
  and food are declared as rows
- `core/tags.js` — `#logs`, `#planks`, `#coals`, `#wool`, `#flowers`, … so one
  shaped recipe covers all seven woods
- `core/recipes.js` — shaped (with mirroring) + shapeless, matched by pattern
  and tag; smelting and fuel values
- `core/loot.js` — block drops, mob drops, weighted chest tables
- `world/biomes.js` — climate placement, surface materials, tints, spawn weights

---

## What is in

**World** — 384-block height (−64…320), sea level 62, bedrock floor,
enforced build cap and ±30,000,000 world border, void damage. Deepslate below
y=0 with deepslate ore variants. 17 biomes. Caves, ravines, deep lava.
Dungeons with spawners, mineshafts, surface ruins, buried treasure, all with
weighted loot chests.

**Blocks** — ~230 registered: terrain, seven wood families (log/planks/slab/
stairs/fence/gate/door/sapling/leaves), ores + deepslate variants, 16 wools,
flora, crops, and utility blocks. Multi-block states for doors, beds, and
connecting fences and panes.

**Player** — swept per-axis AABB collision against the block grid, sneak-at-
ledge, auto step-up, ladders, swimming, 4.5-block reach, 10-stage crack overlay,
tool tiers and durability, F3 debug overlay.

**Survival** — health, hunger, hidden saturation with exhaustion accounting,
air/drowning, armour with durability, four difficulty levels, fall/fire/lava/
cactus/suffocation/void/starvation damage, day-night, weather (rain, snow in
cold biomes, thunder), sleeping, death and respawn with item drops.

**Crafting and smelting** — 2×2 and 3×3, ~180 recipes, furnaces with fuel burn
times matching the spec (coal 8 items, plank 1.5, stick 0.5, lava bucket 100),
progress and fuel bars, state persisted.

**Farming** — hoe, farmland hydration and drying, wheat/carrots/potatoes,
melon and pumpkin stems that fruit onto adjacent blocks, bone meal, saplings
growing into full trees, leaf decay, cane and cactus growth, grass spread, fire
spread and rain extinguishing.

**Mobs** — cow, pig, sheep, chicken (breedable, shearable, milkable) and
zombie, skeleton, creeper, spider. Light-based spawn rules (light ≤ 7), category
caps, daylight burning, thunderstorm surface spawns, despawning. Melee with
i-frames and knockback, charged bow with ballistic arrows, shields, creeper
explosions that damage terrain.

**Also** — rideable boats, TNT you can light with flint and steel (and that
chain-detonates), editable signs, item drops that merge and despawn, falling
sand and gravel, fluid flow with the full water/lava interaction rules and
infinite water sources, procedural audio, autosave.

## What is out

Deferred per the spec, with registries shaped to accept them later: Nether/End
and portals, enchanting, anvils, brewing, redstone, villagers and trading,
fishing, maps, beacons, elytra, totems, netherite, crossbows, tridents, shulker
boxes, and **XP/levels — there is deliberately no XP bar**.

Not done, and worth naming rather than hiding:

- **Double chests.** Chests are single 27-slot containers; placing two adjacent
  does not pair them.
- **Silk Touch and Fortune**, which follow enchanting.
- **Sign text is not rendered on the sign in 3D.** It is stored, saved, and
  shown as a readout when you look at the sign.
- **Mineshafts have no rails**, since rails are redstone-adjacent and deferred.

## One deliberate deviation

The spec asks for a **1-block step-up** and also for "Minecraft-like tuning".
Those conflict: at a full block, you walk up cliffs and jumping stops mattering.

The step-up mechanism supports the full block, but the default is **0.6** —
slab and stair height, which is what gives the movement its expected feel. It is
exposed as `CONFIG.stepHeight` and as **Settings → Full-block auto step-up** if
you want the literal reading.

---

## Assets

There are none. Every block texture, item icon, HUD icon, and sound effect is
generated procedurally at load time from a seeded RNG — noise fields, Voronoi
cells for cobblestone, ring patterns for log ends, drawn shapes for item icons,
inline SVG for hearts and drumsticks, and filtered noise bursts and oscillators
for audio. Nothing is copied, sampled, or derived from any existing game.

This is an original work inspired by the voxel-survival genre, using
Minecraft-like tuning constants for feel.

---

## Tooling

All of these drive the real game in headless Chromium.

```bash
node orebound/tools/smoke.mjs             # boot + 34 correctness checks
node orebound/tools/soak.mjs              # 48 checks: long walk, fluids, farming,
                                          #   night, combat, death, save/load,
                                          #   explosions, boats, TNT, world limits
node orebound/tools/scenes.mjs ./shots    # screenshots of world + every UI screen
node orebound/tools/worldgen-report.mjs   # offline terrain/ore/cave statistics
```

`soak.mjs` asserts on outcomes, not on framerate: it runs on SwiftShader, where
rasterisation is not representative, so it measures **main-thread** cost
instead — the part the engine is responsible for.

---

## Layout

```
orebound/
  index.html            canvas, HUD styling, screen layout
  serve.mjs             dependency-free static server
  src/
    core/               config, RNG, noise, math, registries (blocks, items,
                        tags, recipes, loot)
    world/              chunk storage, world manager, generation, biomes,
                        structures, lighting, fluids, random ticks
    render/             WebGL2 renderer, sub-chunk mesher, block models,
                        procedural textures, entity models
    player/             physics (swept AABB + raycast), player, input
    entities/           mobs, items, arrows, boats, TNT, spawning
    items/              inventory, containers, crafting grid
    ui/                 HUD, debug overlay, all screens
    save/               binary reader/writer, save manager
    audio/              procedural synthesis
    workers/            generation and meshing worker entry points
  tools/                headless test + capture harnesses
```
