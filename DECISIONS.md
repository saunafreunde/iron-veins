# Decision log

Every decision that was not spelled out in the specification, with the reason it
was made that way. Newest milestone last.

---

## M0 - foundation (2026-07-27)

### D-001 The trigonometric table is computed, not measured and not checked in

The specification demands a 4096 entry Int32 sine table and forbids `Math.sin`
in the simulation. Building that table _with_ `Math.sin` would reintroduce the
exact engine dependency the rule exists to prevent. It is therefore evaluated at
module load from a Taylor series that uses only `+ - * /`, folded onto
`[0, PI/4]` where the series converges to roughly 2e-14 - nine orders of
magnitude below the Q16.16 quantisation step. Checking in a generated table was
rejected because a data file cannot be reviewed.

### D-002 FNV-1a 64 on two 32 bit halves instead of BigInt

The determinism hash will eventually run over megabytes of tile and vehicle
arrays. BigInt is exact but roughly two orders of magnitude too slow for that,
so the 64 bit multiply is done by hand on hi/lo words. `tests/unit/hash.spec.ts`
cross-checks it against an independent BigInt implementation _and_ the canonical
FNV test vectors, so the optimisation is not taken on trust.

### D-003 `SimWorker.ts` is exempt from the determinism global ban

The scheduler needs `performance.now()` and worker globals; the simulation core
must not have them. Rather than weakening the rule for all of `src/sim`, ESLint
exempts exactly this one file, which holds no simulation state - it only decides
_when_ `World.step()` runs. `tests/unit/lint-rules.spec.ts` asserts both halves
of that arrangement.

### D-004 Speed is control traffic, not a command

If the speed setting travelled as a command it would end up in the replay log
and a session recorded at 20x would not reproduce at 1x. Speed therefore changes
only how often the scheduler calls `step()`. The determinism suite contains an
explicit test that batching 20 ticks per wake-up yields the same state as one
tick per wake-up.

### D-005 Commands still execute while the game is paused

`World.drainCommands()` runs the commands stamped for the current tick without
advancing time, and the scheduler calls it in the paused branch. Renaming the
company or taking a loan while paused is expected behaviour, and it stays
replay-exact because the command is logged with the same tick either way.

### D-006 Snapshot carries numbers only; rare changes go by postMessage

The `SharedArrayBuffer` slot holds a fixed set of Int32/Float64 fields. Strings
(company name) and one-off events (command rejected, fatal error) travel by
`postMessage`, because packing variable length data into the buffer would make
the layout version churn for no gain. Money sits in a Float64 because cent
amounts exceed Int32 and doubles hold integers below 2^53 exactly.

### D-007 The save format was implemented in M0, not later

Failure #11 of the specification is "save without versioning". Beyond that,
section 19.3 requires the determinism suite to include a save/load/continue run
from M0 onwards, which is impossible without serialisation. `SAVE_VERSION` is 1,
the migration registry is empty (correctly - there is no older format), and the
migration runner is tested with an injected registry so the mechanism is proven
before it is first needed.

### D-008 M0 gameplay scope: company identity and loans

The determinism suite needs real state and real commands to be worth anything.
Company name, company colour and the credit line from section 14.2 are the
smallest slice that is genuinely complete (limit formula, step rounding, monthly
interest, annual profit rollover) and that survives unchanged into later
milestones. `fixedAssetsCt` and `lastYearProfitCt` are legitimately 0 for a
company that owns nothing and has earned nothing; they are inputs to the fully
implemented formula, not placeholders.

### D-009 The RNG stream is not consumed yet

Nothing in M0 legitimately needs random numbers - map generation arrives in M1.
The generator is seeded, hashed as part of the world state, and covered by unit
tests including frozen golden digests, so a change to the algorithm cannot slip
through unnoticed.

### D-010 The determinism suite compares runs, not frozen hashes

Every milestone deliberately changes the simulation state, so a checked-in
golden world hash would have to be updated constantly and would stop being a
signal. The suite asserts equality across three in-process runs, across a
save/load boundary, across tick batching and against a replayed command log.
Frozen golden values are used where the value genuinely must never change: the
RNG stream and the FNV test vectors.

### D-011 The HUD read loop uses a timer, not requestAnimationFrame

rAF stops when the window is occluded or minimised, which froze the status bar
while the simulation kept running - reproduced during M0 verification. The HUD
is text and refreshes at ~15 Hz from `setInterval`. The map renderer added in M1
will use rAF, where "no frame" correctly means "nothing to draw".

### D-012 One tsconfig with node and vite types

Project references would keep node globals out of `src/`, at the cost of a
composite build and two config files. Since ESLint already forbids host globals
where it matters (the simulation core), the simpler single config was chosen.

### D-013 Company colour slot 0 is grey, not black

The Okabe-Ito palette is used because it stays distinguishable under all common
forms of colour vision deficiency. Its first entry is black, which disappears
against the dark map background, so slot 0 is a light neutral grey instead.

### D-014 Icons are generated, not drawn

`tools/make-icons.mjs` rasterises the icon from a vector description into PNG
and ICO, with its own PNG encoder and DIB writer. Same reasoning as the sprite
bake step in section 16.2: no binary art enters the repository and the result is
reproducible from code.

### D-015 React components return `ReactElement`, not `JSX.Element`

The global `JSX` namespace exists in the React 18 types but was removed in 19.
Returning `ReactElement` keeps the components compiling if the React version is
ever raised.

### D-016 `noUncheckedIndexedAccess` is paid for with `!` on typed array reads

The specification mandates the flag. It makes every `Int32Array` read
`number | undefined`, which is noise in hot loops; a non-null assertion where the
index is provably in range is the accepted cost. `any` and `@ts-ignore` remain
forbidden and are enforced by ESLint.

### D-017 Cross-origin isolation is configured in both environments, verified in one

`vite.config.ts` sets COOP/COEP for dev and preview; `tauri.conf.json` sets the
same pair under `app.security.headers`. **Verified in both on 2026-07-27**: the
desktop build logs
`startup version=0.1.0 crossOriginIsolated=true sharedArrayBuffer=true`
from inside WebView2.

---

## M1 - world and presentation (2026-07-28)

### D-018 There are no steep slopes

The map keeps the invariant that no two corners of a tile - including the
diagonal pair - differ by more than one height level. That reduces the slope
alphabet from the classic 19 shapes to 16, and removes a special case from
rendering, pathfinding, vehicle physics and the terraform tool at once. With a
height step of 8 m over a 50 m tile the terrain still climbs at 16 %, which is
far steeper than anything a train can use.

### D-019 Rivers do not carve the terrain

Section 6.3 asks rivers to cut one level into the ground. That is structurally
incompatible with D-018: lowering one corner forces every corner exactly one
level above it to follow, and on a uniform hillside that chain runs to the
summit - one river would drop a whole mountain range by a level, two dozen would
flatten the map. Rivers therefore flow through the valleys that erosion already
cut. The result looks the same and the invariant survives.

### D-020 Sinks are filled iteratively, and leftovers become lakes

Instead of a priority-flood with a heap, depressions are raised by repeated
neighbour passes; with 16 height levels that converges in a handful of rounds.
Whatever is still a sink after the pass limit ends the river in a lake, which is
a good map feature rather than a failure.

### D-021 The height field fades out at the map border

Without an edge falloff the terrain runs off the map and there is no ocean at
all, which makes "ocean versus inland lake" meaningless - and that distinction
decides where harbours and offshore industries may go in M7. The outer 12 % of
the map fades into the sea.

### D-022 Unsupplyable factories are removed, not left standing

The generator proves that every processing industry can be reached by a supplier
of each of its inputs on the same land mass. It first tries to add the missing
supplier, and removes the factory when that is impossible. Both phases run to a
fixed point, because an added supplier can need supplying itself and a removed
one can strand a factory that was already checked. A steel mill that can never
receive coal is not a difficulty setting, it is scenery that misleads the player.

### D-023 Place names are generated from syllables

A fixed name list repeats visibly at 140 towns per map and would have to be
maintained per language. Ninety syllables produce over fifty thousand names.
Names are world state, so they are identical in every UI language - a town
cannot be called Eichenfeld in German and something else in English.

### D-024 Two state digests instead of one

`hashWorld` covers the tile layers and is what the determinism suite compares.
`hashWorldLive` skips them and feeds the F3 overlay. Hashing nine megabytes of
map every game day would cost more than the entire simulation, and at 20x speed
a game day passes twice a second.

### D-025 Derived map layers are recomputed on load, not stored

Land mass labels and the ocean mask follow from the terrain, so the save file
does not carry them. That removes 5 MB per 1024 map and, more importantly,
removes the possibility of a save whose labels disagree with its terrain.

### D-026 Save version 2 has no migration from version 1

A version 1 world had no map at all. A migration could only invent one, and
handing the player a world that is not the one they saved is worse than an
honest refusal. Version 1 existed for a single milestone and was never
distributed. From the first released build onwards every bump gets a real
migration - the mechanism itself stays covered by the injected-registry test.

### D-027 The save validator accepts any power-of-two map size

`MAP_SIZES` is the list the start menu offers; the validator's job is to reject
corrupt data, not menu choices. It accepts square power-of-two maps from 64 to
2048, which keeps the fast 128-tile test worlds loadable.

### D-028 Levelling takes a budget instead of being priced afterwards

Flattening a tile is a sequence of single-corner steps whose cost only becomes
known as it goes. Pricing it after the fact would move ground the player cannot
pay for. `levelTile` therefore checks the remaining balance before every
individual step and stops in front of the first one it cannot afford.

### D-029 Vite must not watch src-tauri

The rust build writes into `src-tauri/target` while chokidar is walking it, and
node throws `EBUSY` on the half written executable, which kills the whole dev
command. `server.watch.ignored` excludes the directory; nothing under it can
trigger a front end reload anyway.

### D-030 The shell library is an rlib only

The Tauri template ships `crate-type = ["staticlib", "cdylib", "rlib"]` for
mobile targets. This game is desktop only, and the two extra artefacts cost
about a gigabyte of build output for nothing.

### D-032 The tile layers live in a SharedArrayBuffer

`TileMap` allocates one shared buffer and lays every layer out inside it, so the
renderer reads the map in place instead of receiving a nine megabyte copy on
every change. The worker owns the write side, the main thread only reads, and a
`revision` counter published through the snapshot tells the renderer when to
rebuild its sprites - comparing megabytes of terrain per frame would cost more
than drawing it.

### D-033 The tile artwork is generated at startup, not baked at build time

Section 16.2 asks for procedurally generated sprites and proposes a build step
that writes PNG atlases. The same procedural code runs at startup into one
canvas instead: no PNG encoder, no atlas manifest, no build step to keep in
sync, and the whole set costs about twenty milliseconds. The atlas is drawn at
twice the zoom-1 size because downscaling looks good and upscaling does not. If
load time ever matters the identical function can move to build time.

### D-034 A terraform action may only drag a bounded amount of earth

Because neighbouring corners must stay within one level of each other (D-018),
raising a corner on a hillside drags every corner further down the slope - on a
uniform hillside that chain reaches the bottom of the hill, so one click would
relandscape a valley. `MAX_TERRAFORM_CORNERS` caps it at 60, which still allows
raising a corner four levels out of flat ground (a 7 x 7 cone of 49 corners) and
refuses anything larger with its own message. Every refusal names its actual
cause - height limit, built-up ground, or too much earth - because a single
generic "not possible here" leaves the player guessing (section 17.3).

### D-035 The map view survives being unmounted mid-initialisation

`Application.init` is asynchronous and React's StrictMode unmounts on every
mount, so `dispose()` regularly arrives while the WebGL context is still being
created. Destroying an uninitialised Application throws and took the whole React
tree down. Disposal that arrives early is now recorded and carried out by
`attach` when it finishes. This is not a StrictMode quirk - it would happen on
any remount.

---

## M2 - the first closed economic loop (2026-07-28)

### D-036 Payment happens per leg, from a "paid up to" marker

Every cargo parcel carries the point up to which it has already been paid for.
A delivery pays for the distance from there, and the marker moves along. Feeder
chains therefore add up to exactly what one direct vehicle would have earned -
no double billing, and no penalty for transhipping - and the mechanism is
already in place for the routing over interchange points that arrives in M5.

### D-037 Cargo stacks merge, and are picked up oldest first

Without merging, a busy station accumulates one stack per production slice and
the list grows without bound; stacks merge on (cargo, origin, paid-from point),
which are exactly the fields the payment depends on, so merging cannot change
what anything earns. Loading takes the oldest first, otherwise a station keeps a
permanent residue of ancient cargo that drags its rating down for ever.

### D-038 The balancing scenarios build their own map

A generated map cannot produce "two towns of 1,200 inhabitants exactly 25 tiles
apart". `tests/balance/scenario.ts` builds a flat world with hand-placed towns,
so the measurement is about the economy and not about which seed the test drew.
`World.fromGenerated` exists for this, and is what the M9 tutorial and scenario
loading will use as well.

### D-039 Scenario 1 forced a full recalibration of the cost scale

Measured first, then adjusted - the specification is explicit that the test is
the authority and the tables are starting values. The first run lost 12,700 EUR
a year; the diagnostic showed why, and the diagnostic is now permanent output of
the test, because "out of band" without a reason sends you guessing.

Three findings, in the order they mattered:

1. **Costs were an order of magnitude too high** relative to what a 25 tile bus
   line can earn. Under the specified time scale (1 day = 10 s, 1 tile = 50 m) a
   bus does about 25 round trips per _year_, not per week, so a line's revenue
   is inherently in the low thousands of euro. Road, stop, depot and vehicle
   prices came down accordingly.
2. **Raising passenger output made things worse, not better.** With supply far
   above capacity the queue grew to over a thousand, and since loading takes the
   oldest first, everything carried was near the write-off age and paid the
   floor of 10 %. The fix was capacity, not supply.
3. **The binding constraint is service quality, not demand.** With capacity
   slightly above supply the queues stay short, cargo is picked up fresh and the
   time factor roughly doubles. That is the behaviour the design wants: adding a
   bus helps more than squeezing the timetable.

Final figures: 21,200 EUR invested, about 8,200 EUR profit a year, payback in
game year 3 - the middle of the specified 2 to 4 year band rather than its edge,
so later changes do not immediately push it out.

### D-040 The starting capital is now very generous, and that is unresolved

Because a first bus line costs about 21,000 EUR, the specified 500,000 EUR of
starting capital buys roughly twenty of them. The three figures the
specification fixes - the fare of 950 cent per passenger per 100 tiles, the
2 to 4 year payback for scenario 1, and the 500,000 EUR start - cannot all hold
at once under its own time scale. Two of the three are pinned by mandated tests,
so the third gives.

This is a real balance tension, not an oversight, and it is written down rather
than quietly smoothed over. The milestones that can absorb the headroom are M8
(competitors bidding for the same routes, town councils granting or refusing
building rights) and the difficulty settings. If it still feels wrong then, the
honest lever is the starting capital.

### D-041 Only the buses were recalibrated, not the whole vehicle catalogue

Lorries, tankers and mail vans keep their first-draft prices. They move cargo
that does not exist yet - the production chains arrive in M5 - so calibrating
them now would mean tuning against a guess. They get the same treatment when
scenarios 2 and 3 of section 19.4 are written.

### D-031 The app reports its startup environment to the shell

`startup_report` prints version, `crossOriginIsolated`, SharedArrayBuffer
availability and the WebView user agent to stdout. It is the first thing a bug
report needs, and it is how failure #12 was actually verified rather than
assumed.
