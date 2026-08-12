# Decision log

Every decision that was not spelled out in the specification, with the reason it
was made that way. Newest milestone last.

## Register - topic to decisions (SPEC2 M10)

Hand-maintained: every new entry adds its D-number to at least one topic line
here, and `tests/unit/decisionsRegister.spec.ts` fails the build when a logged
decision is missing from this register or the register cites a number that has
no entry below. A number may appear under several topics.

- **Determinism, RNG & hashing:** D-001, D-002, D-003, D-004, D-009, D-010,
  D-024, D-093, D-106, D-128, D-137, D-142, D-145, D-146, D-149, D-153, D-178,
  D-181, D-184, D-185, D-188, D-189, D-190, D-191, D-193, D-194, D-195,
  D-196, D-200, D-201, D-202, D-204, D-232, D-233, D-236, D-240
- **Commands, snapshot & worker boundary:** D-004, D-005, D-006, D-011, D-032,
  D-100, D-111, D-145, D-146, D-148, D-162, D-174, D-176, D-179, D-187, D-189,
  D-192, D-193, D-196, D-200, D-202, D-218, D-240, D-241
- **Lines & timetables:** D-145, D-146, D-147, D-148, D-149, D-150, D-151,
  D-152, D-155, D-159
- **Map generation & terrain:** D-018, D-019, D-020, D-021, D-022, D-023,
  D-025, D-027, D-197, D-198, D-199, D-216, D-231, D-234, D-240
- **Terraforming & structures:** D-028, D-034, D-050, D-051, D-052, D-124,
  D-141, D-240
- **Save format, migrations & replays:** D-007, D-025, D-026, D-027, D-048,
  D-111, D-130, D-131, D-134, D-142, D-144, D-145, D-146, D-147, D-153, D-178,
  D-181, D-184, D-185, D-188, D-189, D-190, D-191, D-192, D-193, D-194,
  D-197, D-198, D-200, D-207, D-213, D-231, D-232, D-233, D-236, D-238,
  D-239, D-240, D-241
- **Rail & track:** D-042, D-043, D-044, D-045, D-046, D-047, D-053, D-141,
  D-153, D-157, D-184, D-230
- **Signals & reservations:** D-054, D-055, D-056, D-057, D-058, D-059, D-060,
  D-061, D-073, D-080, D-081, D-082, D-083, D-157, D-173, D-184, D-185, D-186,
  D-232
- **Stations & catchment:** D-049, D-080, D-095, D-150, D-159, D-178, D-179,
  D-208, D-210, D-230, D-231, D-237
- **Cargo, payment & routing:** D-036, D-037, D-065, D-067, D-075, D-077,
  D-078, D-118, D-142, D-151, D-176, D-178, D-187, D-207, D-211, D-213,
  D-215, D-233, D-237
- **Industry & production:** D-022, D-062, D-063, D-064, D-069, D-071, D-079,
  D-085, D-086, D-174, D-201, D-202, D-205, D-225, D-232, D-239
- **Towns, council & ownership:** D-101, D-102, D-103, D-104, D-205, D-207,
  D-206, D-213, D-216, D-217, D-231, D-232, D-233, D-234, D-235
- **Economy, finance & emissions:** D-008, D-090, D-091, D-092, D-105, D-154,
  D-180, D-193, D-196, D-228, D-229, D-236, D-237, D-238, D-239
- **Balancing & scenarios:** D-038, D-039, D-040, D-041, D-066, D-087, D-088,
  D-116, D-151, D-152, D-156, D-158, D-159, D-187, D-190, D-194, D-195,
  D-196, D-197, D-198, D-199, D-200, D-203, D-204, D-207, D-211, D-213,
  D-215, D-216, D-220, D-221, D-222, D-224, D-225, D-226, D-228, D-229,
  D-232, D-233, D-234, D-235, D-236, D-237, D-238, D-239
- **Vehicles & fleet:** D-043, D-044, D-045, D-068, D-076, D-089, D-093,
  D-096, D-142, D-143, D-145, D-146, D-155, D-157, D-171, D-174, D-181, D-185,
  D-201, D-207
- **Water & air:** D-094, D-095, D-096, D-097, D-098, D-099, D-237
- **Competitors, AI & tenders:** D-107, D-108, D-109, D-115, D-116, D-121,
  D-122, D-147, D-152, D-153, D-154, D-155, D-156, D-158, D-216, D-218,
  D-219, D-220, D-221, D-222, D-223, D-224, D-225, D-226, D-228, D-229,
  D-230, D-238
- **Rendering & art:** D-013, D-014, D-033, D-035, D-112, D-117, D-125, D-127,
  D-136, D-140, D-160, D-161, D-162, D-163, D-164, D-165, D-166, D-169, D-170,
  D-171, D-172, D-173, D-174, D-175, D-177, D-179, D-186, D-202, D-205, D-206,
  D-208, D-209, D-212, D-214, D-217, D-241
- **UI & input:** D-011, D-013, D-015, D-035, D-110, D-113, D-114, D-119,
  D-126, D-148, D-165, D-166, D-177, D-179, D-180, D-181, D-182, D-183, D-184,
  D-186, D-187, D-189, D-191, D-192, D-193, D-194, D-195, D-196, D-200, D-202,
  D-210, D-241
- **Performance & measurement:** D-002, D-120, D-135, D-136, D-161, D-162,
  D-163, D-164, D-167, D-170, D-171, D-172, D-173, D-174, D-176, D-177, D-184,
  D-185, D-186, D-187, D-191, D-192, D-193, D-196, D-200, D-201, D-202, D-205,
  D-206, D-209, D-214, D-231, D-234, D-235, D-241
- **Platform, tooling & build:** D-012, D-014, D-015, D-016, D-017, D-029,
  D-030, D-031, D-160, D-168, D-169, D-170, D-172, D-175, D-192, D-206, D-208,
  D-227
- **Crash safety:** D-132, D-139, D-190
- **Testing method & fixtures:** D-010, D-038, D-072, D-074, D-084, D-133,
  D-167, D-183, D-186, D-188, D-189, D-190, D-191, D-192, D-193, D-194,
  D-195, D-196, D-197, D-198, D-199, D-200, D-201, D-202, D-203, D-204,
  D-205, D-207, D-206, D-208, D-209, D-210, D-212, D-213, D-215, D-216,
  D-217, D-219, D-220, D-221, D-222, D-228, D-229, D-230, D-231, D-233,
  D-234, D-235, D-236, D-241
- **Process & specification:** D-070, D-123, D-129, D-133, D-138, D-140,
  D-185, D-191, D-197, D-198, D-199, D-203, D-204, D-205, D-206, D-215,
  D-222, D-225, D-226, D-227, D-228, D-229, D-235

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

### D-042 Gradients are measured over a stretch of line, not from tile to tile

This is the correction that made rail work at all, and it is worth stating
plainly because the bug was invisible until a train tried to climb something.

The ground is sampled in whole height levels of 8 m on a 50 m grid. The smallest
height change the terrain can express is therefore 8 m over 50 m: 160 per mille.
Compared literally against the type limits of section 8.1 - 30 per mille for
plain track, 60 for narrow gauge, 12.5 for high speed - *no rail type could ever
climb anything*. Every railway in the game would have been confined to perfectly
flat ground, and the whole gradient system would have been decoration.

That is a measuring error, not a fact about railways. Track has its own vertical
alignment: it leaves the ground on an embankment, climbs steadily, and meets the
ground again further along. What matters is the height gained over a stretch of
line, not the difference between two samples of the ground.

So the gradient is measured over a window, and the window is the length over
which one height level sits exactly at the type's limit:

| rail type          | limit         | window   | reads as                  |
| ------------------ | ------------- | -------- | ------------------------- |
| plain, electrified | 30 per mille  | 6 tiles  | one level per 300 m       |
| narrow gauge       | 60 per mille  | 3 tiles  | one level per 150 m       |
| high speed         | 12.5 per mille| 13 tiles | one level per 650 m       |

Three places use the same measure and must keep using it: the route assistant
walks back along the alignment it has already found, `measureRoute` does the same
over the finished tile list, and the longitudinal solver does it along the route
a train is driving. If they ever disagree, the assistant will plan alignments
that the preview refuses, or trains will stall on lines they were sold as able
to climb.

The run length is floored at the window: a route that starts halfway up a slope
is judged no more harshly than the middle of one, because the track it connects
to has already been climbing.

### D-043 One accumulator for the distance to go, not two

A vehicle needs to know how far it still has to drive, to decide when to brake.
The obvious implementation - a countdown decremented by the same distance that
`progressM` is incremented by - is wrong, and wrong in a way that only shows up
after twenty minutes of play.

Two floating point accumulators fed the same numbers drift apart in the last
decimal. The one place that matters is the boundary of the final tile: if the
countdown reaches zero a hair before `progressM` crosses the last tile edge, the
vehicle brakes for a route end it has not arrived at, its traction is cut, it
stops, and `progressM` freezes one tile short of its platform. For ever. That is
exactly what happened - a train stood at x=39 of a line ending at x=40 for the
rest of the test.

`routeRemainingM` therefore holds the distance from the START of the current
tile to the end of the route, and is updated only when a tile is completed, by
the very step length the tile advance uses. The distance actually left is that
minus `progressM`. The two quantities are now the same arithmetic and cannot
disagree.

### D-044 A train is one entity, its composition is data

A train is one slot in the vehicle store, not one slot per vehicle. Its
composition is a list of catalogue ids in a parallel reference array, and
everything the solver needs - mass, tractive effort, power, top speed, length,
braking, capacity, whether it needs catenary - is aggregated into cached typed
arrays whenever the train or its load changes.

The alternative, an entity per wagon coupled by references, would put object
references into serialisable state (against law #9), make the tick loop chase
pointers, and turn every coupling operation into a consistency problem. Orders,
cargo and revenue belong to the train anyway; a wagon on its own has no
behaviour at all.

The cache is derived and never saved. A save that stored the aggregate would go
stale the first time the catalogue is rebalanced.

### D-045 Rail payload adds mass, road payload does not

Rail wagon masses in the catalogue are TARE masses and the load is added on top;
road vehicle masses are laden figures and no load is added.

This looks inconsistent and is deliberate. A freight wagon's payload weighs two
to three times what the wagon does, and a full coal train crawling up a gradient
that it flew down empty is the single most characteristic thing about railway
operation - the mechanic that makes a second locomotive worth buying. A bus with
150 passengers gains 12 t on a 9 t vehicle; modelling that would have been just
as correct, but the road figures were calibrated as laden masses against
balancing scenario 1, and quietly doubling every bus mass now would push the one
scenario that is in band straight out of it.

The tonnages live in `CARGO_TONNES_PER_UNIT`.

### D-046 Gauge separation was not modelled

Narrow gauge is a cheap, slow, steep-climbing track type that every train can
use, not a separate network. Modelling it properly needs a second locomotive
catalogue and a rule that keeps standard gauge stock off it, for a mechanic that
in play reads as "cheap slow track". The rail types that do carry a hard rule
are the electrified ones, where an electric locomotive genuinely cannot path
over unwired track - that constraint is implemented and tested.

### D-047 Track can be converted, and the conversion is priced separately

Laying track along a line that already carries track of another type converts
it. Without this there would be no way to electrify a line built before electric
traction arrived, which is the single most common thing a railway does over a
hundred years of play.

A conversion costs the difference between the two build prices, floored at a
quarter of the new type's price so that it is never free - the old track still
has to come up. Yearly upkeep moves by the difference between the two types, not
by the new type's full figure.

### D-048 The missing save migrations were written

`SAVE_VERSION` had reached 4 with an empty migration registry, which meant every
save from an older milestone was unloadable and the rule in section 19.1 was
being honoured in the comment only. Migrations 2 -> 3 (stations and vehicles),
3 -> 4 (the two rail tile layers) and 4 -> 5 (train composition and the running
distance-to-go) are now registered and tested. Each of them adds exactly what
that world genuinely contained: nothing.

There is still deliberately no 1 -> 2 (D-026).

While in that file: `parseCommand` only understood six of the sixteen commands,
so any save whose command log contained a road being built refused to load. All
of them are parsed now.

### D-049 Depot modules do not serve as station stops

A depot built next to a stop joins its station, and the access tile used to be
whichever module happened to be first in the list. A vehicle could therefore
serve a station from inside the depot. The access tile is now the first module
of the right kind for the mode - a platform for a train, a stop or bay for a
road vehicle - and a station that offers none for that mode reports no route
rather than silently sending the vehicle somewhere odd.

### D-050 Bridges and tunnels are the same idea, and the assistant proposes them

Both are a stretch of line that keeps its height while the ground does not: a
bridge holds the height up over water or a valley, a tunnel holds it down
through a hill. Only the tiles BETWEEN the two ends carry the structure; the
ends are ordinary track, which is why a train can path over one without the
pathfinder knowing that structures exist at all.

Neither can bend. A curved viaduct is a modelling problem out of all proportion
to what it adds, and keeping structures straight is what makes every route the
assistant proposes explicable.

The assistant reaches for one only when the plain step is impossible - water or
ground too low ahead gives a bridge, ground too high gives a tunnel - and then
takes the shortest legal span. It never builds one merely because it could. The
two penalties, 450 m of detour per tile of bridge and 800 m per tile of tunnel,
are the two terms section 8.2 asks for; the price also rises with the square of
the span, so crossing a river at the narrows beats a viaduct across the bay.

Manual mode still refuses water. It lays exactly the line the player drew, and
silently inserting a bridge into that would be the opposite of what it is for.

### D-051 Water is always bridgeable, whatever the height grid says

A watercourse is below its banks by definition. The height grid samples in whole
8 m levels and rivers do not carve (D-019), so a river tile reads as exactly
level with the bank beside it - and a clearance rule of "the ground must be
lower than the deck" would make every river in the game uncrossable.

Water tiles are therefore spannable regardless of their corner heights. Dry
ground still needs real clearance, or a bridge over a flat field would be a
cutting.

### D-052 A tunnel forbids everything else on the tile above it

Strictly, a house on a hill and a bore beneath it can coexist. Drawing that
convincingly, and keeping it consistent when the ground is later terraformed,
is work for a milestone that has a reason to do it. Tunnels go through hills,
and hills do not have houses on them, so the restriction costs nothing in play.

### D-053 Track height is `railHeight`, never `baseHeight`

Everything that asks how high the track is - the gradient window, the
longitudinal solver, the renderer, the vehicle sprites - has to ask
`TileMap.railHeight`, which returns the deck or bore where there is one and the
ground where there is not. Asking `baseHeight` on a bridge tile measures the
river bed, which reads as a cliff down and back up: the route would be refused
as too steep, and a train that did cross would be dragged into the water.

## M4 - signals

### D-054 Reservations are keyed by tile, and the table is derived

A train claims a contiguous run of its own route and holds it until its tail is
clear. The table that records this is one entry per map tile holding the id of
the owning train, or -1. No block graph, no flood fill, no node numbering.

Keying by TILE INDEX is the whole reason this is cheap to own. A key derived
from anything else - a dense track-node id, a block id - would have to be
rebuilt every time `map.revision` moves, which is every time a player lays a
single road tile, and a renumbering would silently retarget live reservations.
A tile index survives every one of those untouched.

The table is a pure function of each train's two saved reservation indices plus
its saved route, so it is neither serialised nor hashed; it is rebuilt in
`World.fromData`, exactly as `landmassId` and `oceanMask` are (D-025). Two
trains claiming one tile is not a state the simulation can produce, so meeting
it during that rebuild means the file is corrupt and it is refused.

### D-055 A signal stands on plain line, and that is why there are no pre-signals

A signal may only go on a tile with exactly two track connections. A train held
at a signal stands still on the tile before it; if signals could stand in a
junction, a waiting train would block the throat of that junction for every
other route through it. The genre's answer to that is pre-signals and combo
signals - a second and third signal type, each with rules the player has to
learn before their first junction works.

Refusing the placement removes the case instead of modelling it. A player who
wants to protect a junction signals its approaches, which is what real
signalling does anyway.

### D-056 One signal type, two-way, and one-way deferred

The signal is a property of the TILE, not of a direction. It therefore faces
both ways: it needs no mirrored bit when the track under it comes up, it needs
no direction on the command, and the build tool is a single click.

One-way signals would buy tidier double-track working, and `SignalKind` is
numbered so they can be added without touching the tile layer. They are not in
M4 because they change what the pathfinder may plan, and a route that worked in
M3 turning into "no route" is a far worse first impression than a train taking
a passing loop the long way round.

### D-057 The claim is a range of route indices, not a list of tiles

`reservedFromIndex` and `reservedToIndex` per vehicle, both -1 when the train
holds nothing. A contiguous claim needs nothing more, it is two integers in the
save instead of a variable-length list, and it is what makes the reservation
table itself derived rather than saved.

The claim is all-or-nothing: the whole range is tested before a single tile is
written. A partial claim that then fails leaves tiles owned by a train that
never entered them - a deadlock nobody can reproduce and nothing detects. And
because the range always covers the train's own body as well as the run ahead,
two trains can never hold the same tile even transiently, which is what makes
the load-time rebuild a sound check rather than a guess.

### D-058 A train under-claims its own tail for a moment after a repath

`routeTo` resets the route index to 0, so the tiles a 400 m train's body still
stands on lie behind the start of the new route and no route index can reach
them. The backward walk clamps to 0 and the train briefly holds less than it
occupies.

This is accepted rather than fixed. A train is always standing still when it is
given a new route - at a stop, in a depot, or retrying after "no route" - and M3
already let a following train drive through a standing one. Fixing it properly
means an explicit list of occupied tiles: three more fields to save, hash and
migrate, for a case that is no worse than the status quo.

### D-059 Deadlock is avoided by construction for following trains, not proven impossible

Two trains running the SAME way down a signalled line cannot collide and cannot
deadlock: claims are all-or-nothing and the follower simply waits. That is the
acceptance case and it is tested.

Two trains meeting NOSE TO NOSE on single track will deadlock. The pathfinder is
deliberately blind to occupancy - giving `stepSeconds` a fourth impassable case
would drop trains into "no route" the moment a line got busy, and that state
retries only every five real seconds. A passing loop does not help either,
because nothing makes a train prefer the loop. The honest statement is that M4
delivers block safety, not traffic management; scheduling and occupancy-aware
routing belong with the order system.

### D-060 The claim is attempted from where the train is, not where it is about to be

This is the bug the tests caught, and it is worth writing down because the
mechanism reads correctly right up until it deadlocks.

The braking term brings a train to a stand a few metres short of a red signal.
Once stopped, its wheels never cross a tile boundary again - so a claim
attempted at the boundary, inside the tile-advance loop, would never be
attempted again. The train would wait for ever at a signal that went green
seconds later.

So the claim runs every tick a train is driving, from its current position, and
looks only as far ahead as it could brake from. The gate in the tile advance
remains as a backstop for the case where the signal was beyond the lookahead,
but it is not the primary mechanism.

### D-061 Lowest id wins a contended section, permanently

`updateVehicles` iterates in ascending id order and a claim is written
immediately, which gives a total and reproducible arbitration for free. It also
gives a permanent priority: at a busy junction a high-id train can be starved by
a low-id one.

Determinism is not negotiable. Fairness would need a deferred resolution phase
with a total comparator of its own, which is a different design rather than a
tweak. Named here so that it is a known property rather than a bug report about
favouritism.

## M5 - industry chains

### D-062 Industry production state is flat scalars on the industry object

Four stock slots, a level, two monthly counters and a hysteresis clock, all as
plain fields. Not a struct of arrays: the whole catalogue tops out at two inputs
and two outputs, there are a couple of hundred industries on a large map against
four thousand vehicles, and the passes run once a game day rather than once a
tick. `World.toData` already spreads the object.

The two-slot cap is a real constraint, so it is a test: adding a three-input
factory fails `tests/unit/industry.spec.ts` rather than being silently
truncated.

### D-063 The collection gate divides by the footprint, not by tiles covered

An industry hands over `min(1, sum of station weights)` of its output, where a
station's weight is its rating times the SHARE of the industry's footprint it
covers. The share is what makes the rating matter: with a tile count, a station
covering two tiles of a two-by-two mine already had weight 1 and the gate
saturated, so a rating of 25 shipped exactly as much as a rating of 100.

This is the difference from town production, where the same expression is
normalised so that the shares sum to one and the rating only redistributes.
Here it CAPS. What does not leave stays in the yard, where the player can see it.

### D-064 The growth ratio divides by ungated production

`collectedThisMonth / producedThisMonth`, where the denominator is what the
industry made before the gate took its cut. An industry served by a station
rated 50 therefore cannot exceed a ratio of 0.5 and can never reach the growth
threshold, however long it waits.

That one choice is the death spiral of section 10.1 applied to freight, and it
is what makes a second train or an extra platform pay for itself in tonnage
rather than only in trips.

### D-065 Delivered cargo never enters the station's waiting pile

Accepted cargo goes straight into the consuming industries' input stock, in
ascending industry id, and then into the town's goods and food counters. It is
never added to `station.waiting`.

The station capacity is checked against the sum over every stack, so inbound
coal would push a town's passengers into overflow and, through the overflow
penalty, drag down the rating of a station that is working perfectly well.

Cargo nobody at the station wants is REFUSED, not discounted: it stays on the
vehicle. A discount is an invisible money leak that no balance test can see,
whereas a lorry circling still loaded is visible in the fleet list.

Passengers and mail are accepted everywhere. Making them conditional on houses
would stop a mine's station carrying its own workers, and it would change what
M2's bus line is worth - which is calibrated and in band.

### D-066 The freight tariffs were four times too low, and nothing would have caught it

Written down because the size of the error is the point.

A vehicle's ceiling revenue per year is `capacity x rate x speed x constant` -
the line length cancels out, so it can be computed in closed form. Measured
against upkeep, the first-draft catalogue read:

| vehicle              | ceiling / upkeep |
| -------------------- | ---------------- |
| Type O-1 bus         | 39               |
| Type S-1 bulk lorry  | 0.06             |
| Type C-1 container   | 0.05             |

No freight vehicle in the game could cover its own upkeep on a line of ANY
length, and no test in the repository would have noticed, because the only
balancing scenario that exists is a bus line. A bus carried 150 passengers at
950 a head while a lorry carried 14 tonnes of coal at 210.

The passenger side is the one that is calibrated and in band, so freight moved:
rates fourfold, road freight and mail capacities doubled, their upkeep cut to a
third. Containers were priced as if a twenty-foot box held one tonne rather than
the fourteen `CARGO_TONNES_PER_UNIT` says it holds.

The result is deliberately asymmetric and is now a test: rail freight clears the
ceiling floor of four, road freight sits between 1.4 and 4. A lorry is a feeder
that pays on a short, well served haul; tonnage pays on rails. Making them equal
would have made half the game optional.

These are still first-draft figures. The chain scenarios of section 19.4 own the
final numbers, and `tests/balance/tariff.spec.ts` is the diagnostic that will
say so in one line rather than after an hour of play.

### D-067 Cargo expires as a share, not all at once

`expireStaleCargo` used to zero a whole stack past the grace period. Cargo merges
into one stack per origin, so an over-supplied station at capacity lost two
thousand units in a single tick. No passenger station reaches that; under M5 it
is the steady state of every mine nobody collects from, and it would have read as
cargo teleporting away. A tenth of the pile a day, with the age marker moved
along so the write-off is monotone.

### D-068 A vehicle can be converted, and until M5 it could not

`refitCargo` was written once, when the vehicle was bought, and no command ever
changed it - so an open wagon was coal for life and most of the catalogue was
unreachable. `RefitVehicle` costs a share of the purchase price and is allowed
only in a depot, only while empty, and only to a cargo the vehicle can actually
hold.

### D-069 Runtime opening and closure of industries was cut

An industry that nobody serves runs down to a quarter of its output and stays
there. It does not close, and no new ones appear.

Closure needs the placement search exported, a draw from the gameplay RNG (which
shifts every later draw and perturbs the determinism fixture), intro and retire
years, tombstone-versus-splice discipline in an array indexed by id, and a fix
for the release path resetting terrain to grass and leaving scars in forests.
Five independent risks, none of which the chain loop needs.


### D-070 The specification is in the repository, and M4/M5 are measured against it

`SPEC.md` holds the original brief verbatim. It arrived after M4 and M5 were
built, so both were made from the repository's own record plus genre convention.

Measured against the text, both are **partial**, and the gap list is in
`CLAUDE.md` rather than buried here because a future session has to see it
before it believes the milestone status. The two that matter most:

* **M4 has one signal type of four.** Path signalling is the one the spec needs
  for a station throat worked by two trains, and the acceptance test - twenty
  trains on a hand-built network for five thousand ticks - does not exist. M4 is
  not signed off.
* **M5 cargo has no destination.** Section 7.4 is the heart of that milestone:
  cargo carries a target station, stations keep connection tables, and waiting
  cargo picks the vehicle that will get it there soonest, transfers included.
  What is built is production, the service gate and acceptance - the supply
  side. The routing side is absent, and with it the milestone's own acceptance
  case.

Also on the record: the freight recalibration of D-066 rests on a diagnostic
test written for the purpose, not on balancing scenario 2 of section 19.4, which
the specification names as the authority over precisely those numbers. The
figures stand until that scenario says otherwise.

### D-071 Industry production runs in thirty daily slices, not once a month

Section 7.3 books production once per game month. This implementation books a
thirtieth of it each game day, which is the same shape the town production
already had.

The reason the spec gives for "monthly" is failure #10 - production per TICK is
twenty times too much cargo and pointless CPU load. A daily slice is 1/200th of
the tick rate and costs nothing measurable, while it removes a step function
that would otherwise dump a month of output into a station in one tick and
immediately trip the overflow penalty on the station rating.

The recipe minimum is evaluated per slice, which is strictly better than monthly:
a mill whose coal arrives on the twenty-ninth can still use it that month.

### D-072 The regression network is built with commands, not loaded from a file

Section 19.5 asks for `tests/fixtures/net-complex.json`. The network is built
with the ordinary build commands instead: a hand-authored file would describe a
network no player could build, and going through the commands exercises the
placement rules on the way in - which is how the passing-loop signalling defect
below was found in the first place.

It is a ring signalled ONE WAY throughout, carrying a passing loop, a crossing
spur and a two-platform station. One-way is what turns twenty trains on one line
into a test of following rather than of the head-on case, which signals are not
supposed to solve (D-059).

Two things the network taught immediately, both of them the mechanic working
rather than failing:

* A passing loop with no signals of its own joins the ring section before it to
  the one after it into a single block, so one block signal claims a third of
  the ring. That is what block signalling *is*, and it is why the loop needs
  signals at both ends.
* Twenty trains leaving one depot tile in the same tick is a queue that takes
  longer to drain than the test runs. They are released in sequence, which is
  what an operator would do.

### D-073 Two trains can still stack on unsignalled track, and then neither can move

**This is an open defect and M4 is not signed off.** It is written down in full
because the symptom points at the wrong place.

Only signalled sections are exclusive. Nothing stops a train rolling forward
onto a tile another train is standing on, which is what M3 did and what the M3
parity property preserved. Under signalling that becomes a trap: a train held at
a red owns nothing it has not been granted, so the train behind is blind to it
and rolls onto the same tiles. Once two trains are stacked, NEITHER can ever
claim again - each one's own body is held by the other - and they wait for each
other for ever. It presents as a signalling deadlock; it is a collision that was
allowed to happen earlier.

Half of it is fixed: a train whose claim is refused now holds the ground it is
standing on, so it is no longer invisible to the train behind. That reduces the
case but does not remove it, because the stacking can still happen before the
first refusal - most reliably at a depot, where several trains legitimately sit
on one tile.

The real fix is that a train's body is exclusive at ALL times, signals or no
signals. That is the correct railway model and it is what "zero collisions" in
section 19.5 actually means. It is not done here because it changes how
unsignalled track behaves for every existing test, and because a depot holding
several trains on one tile is a legitimate state that the exclusivity rule has
to be taught about. Doing half of that would be worse than doing none.

The regression network runs, asserts what does hold - no tile ever owned by two
trains, nothing in "no route", bit-identical across three runs - and says in its
own comment which half of the criterion it is not yet checking.


### D-073 addendum - a train's body is exclusive at all times, and it fixed half of it

The fix is in: a train owns the ground under itself whether or not a signal has
granted it anything, and no train may enter a tile another train holds. Signals
decide who may enter a SECTION; this decides who may occupy a TILE.

A stopped train and a train in a depot hold nothing, because several trains
sharing one depot tile is a legitimate state that the rule must not forbid. A
train takes its body the moment it starts moving, and if it cannot - because the
train it was parked behind has not pulled out yet - it waits, which is what it
would have done anyway.

Measured on the regression network, the longest unbroken wait fell from 8_391
ticks to 5_488. The stacking deadlock is gone.

Two existing assertions changed with it, and both are now stating something
truer than before:

* "claims nothing on a line without signals" became "never HOLDS UP a train on a
  line without signals". The internal sentinel was never the point; the point is
  that an unsignalled line still runs exactly as it did in M3.
* The held train no longer stops on the tile before the signal but wherever the
  train ahead leaves room. Standing clear of the train in front is the correct
  behaviour; standing on a fixed tile was an artefact of trains being able to
  drive through each other.

### D-074 What is left on the regression network is capacity, not signalling

Twenty trains on a single-track ring with four stations, each of which halts the
through line while it loads, is over capacity. Add the permanent priority of
D-061 - the lowest id always wins a contested section - and the last trains
starve rather than deadlock: they are waiting for a section that is genuinely
busy, and a lower id keeps taking it.

That is a scheduling problem and it has scheduling answers, all of which belong
to the order system rather than to signals: a station on a passing siding so a
loading train does not block the line, per-train platform selection so a station
with two platforms uses both (the D-049 limitation), and an arbitration that
does not permanently favour a low id.

The test asserts a 6_000 tick bound so the number stays visible and cannot
regress, and says in its own comment which half of section 19.5 it is checking.
Calling this "M4 done" would be false; calling it a signalling defect would be
equally false.

### D-075 The connection table is one graph, not a table per station

Section 7.4 words it as a table kept BY each station: which destinations are
reachable over which line, in how many ticks. It is implemented as a single
graph indexed by station (`cargo/linkGraph.ts`), and that is a departure worth
stating.

The reason is that a station cannot answer the question on its own. "How long
to the sawmill" is only knowable to a stop whose lorries never go there if
something holds the whole network at once - the sawmill is two lines and one
transfer away, and neither line knows about the other. A per-station table would
either have to duplicate the same all-pairs computation n times or gossip
between stations, and gossip has no deterministic fixed point.

So: legs come from the vehicles' orders, each leg carries the mean of its last
eight trips, and one backwards Dijkstra per destination fills an all-pairs table
of expected times. The table IS the per-station table of the spec; it is just
stored once. Reading `expectedTicks(station, destination)` is the operation the
spec describes.

Rebuild cadence: whenever the set of legs changes (an order edited, a vehicle
bought or stopped), and otherwise once per game day to fold in new measurements.
A rebuild on every arrival would be one search per vehicle per stop.

### D-076 refitVehicle could never convert a vehicle that had just been bought

Found while writing the M5 acceptance case, which needs a lorry and a wagon
converted to timber. `refitVehicle` required `state === InDepot`, and a vehicle
that has just been bought is `Stopped` on the depot tile it was built at - it
has never left, so nothing ever set InDepot. The command had no test.

A player would have had to send a brand new lorry away and order it back before
they could choose what it carries. Fixed by asking the question that was meant:
is this vehicle standing still in a shed of its own mode? Both states answer yes.

### D-077 How a parcel's destination is chosen, which the spec does not say

Section 7.4 gives `CargoStack` a `zielStationId` and says nothing about where it
comes from. The rule is: candidates are the stations that ACCEPT this cargo and
that the network can reach from here; the batch is split between the best three,
weighted by the reciprocal of the expected journey.

One destination would have been simpler and is wrong for passengers - every
passenger a town makes would queue for the single nearest stop, which is not a
network. Three is enough to fan out and few enough to stay legible in a station
panel. Freight normally has one candidate anyway: there is usually one works in
range that takes iron ore.

Two supporting decisions fall out of it:

* A leg nobody has driven yet is credited with a straight line at 54 km/h. Some
  number is required or the first cargo ever produced would find no route and
  expire while the line it needs is being driven for the first time. The first
  completed trip replaces the estimate outright.
* A leg is measured ARRIVAL to ARRIVAL, not departure to arrival. That includes
  the loading stop at the near end, which is time the cargo standing on that
  platform genuinely waits through. A trip that straddles a stop, a sale or an
  order change is thrown away rather than averaged in.

### D-078 A vehicle takes a parcel only if it carries it closer - with no detour allowance

A vehicle may load a parcel when its own next stop lies on a shortest route to
that parcel's destination, and it sets the parcel down again the moment that
stops being true. Feeder chains are not modelled anywhere; they are what those
two rules produce.

The tolerance on that comparison is one tick, and it exists to absorb floating
point noise - the expected time IS the minimum over exactly these sums, so the
comparison would be exact but for rounding. It is deliberately NOT a detour
allowance, and the reason is an exploit: payment is measured from the point a
parcel was last paid up to, which is a POSITION. A parcel allowed to accept a
five percent detour can be carried out and back along the same line, and both
legs would be paid. A strict comparison makes that unreachable.

Consequences worth knowing:

* Cargo with no destination is never loaded. Nobody knows where to take it.
* A parcel set down at a station that is full is not set down at all - it rides
  on. Destroying cargo that has already been carried and paid for would be worse
  than carrying it round once more.
* Routeless cargo is written off WHOLE after thirty days and charged to the
  station as overflow, which is the rating penalty section 7.4 asks for. Cargo
  that has a route but is slow to move keeps the old ten percent a day decay and
  no penalty: a station nobody serves is a different failure from a station
  nobody could ever serve.

### D-079 The twelve month service window is one number, not a ring of twelve

Section 7.3 expands an industry that had "at least 80 % collected over twelve
months". The literal implementation is a ring of twelve monthly ratios per
industry; what is built is a running average of the same window, kept as one
number, because that is all the rule ever asks it.

The one thing that needed care: while the window is still filling, the average
is a TRUE mean of the months so far, and only afterwards a rolling one. Started
in its rolling form from zero, twelve perfect months average 0.65 - so an
industry served faultlessly from the day it opened could not expand for two
game years, and the rule would have looked broken while being implemented
exactly as written.

### D-080 A train picks a platform, rather than every train being sent to the first

D-049 recorded that a station always sends every train to its first platform
tile, and that a second platform therefore bought nothing. It does now: a train
heads for the first platform no other train holds, and falls back to the first
of them when they are all busy.

It waits either way, but it waits in the right place, and a station with two
platforms genuinely works two trains. The choice is deterministic - the modules
are in build order and the reservation table is a pure function of state.

### D-081 Whoever has waited longest asks for a section first

The tick loop ran vehicles in id order, so a contested section always went to
the lowest id - not by design but because that is the order the loop happened
to take. On a busy line the trains at the back of a queue starve.

Trains held at a signal are now stepped first, longest wait first, and the rest
follow in id order. The ordering is a pure function of state, so determinism is
untouched. It is a fairness fix and not a throughput one: measured on the
regression network it was worth about eight ticks, and what actually mattered
was the network's shape (D-082).

### D-082 What the regression network needed was a better railway, not better signals

Three attempts, and only the third was the real answer.

**A priority reservation, tried and REVERTED.** A train past a fairness
threshold marked the tile it needed and nobody else could claim it. It made
things strictly worse - 3_540 ticks became 8_341 - because priority marks
compose into cycles: A is owed a tile held by B, B is owed a tile behind A, and
now neither may be granted. It is out of the tree; the mechanism is recorded
here so nobody rebuilds it.

**What was actually wrong was the fixture.** Two shapes in it were things no
player would build, and both were mine:

* every platform stood on the through line, so a train loading stopped every
  train behind it. Stations now sit on passing loops and the ring stays clear;
* twenty trains shared one shed on a spur that CROSSED the ring. A train
  crossing a saturated one-way line never gets a gap at all, and a queue twenty
  deep at a single merge never drains. There are four sheds now, one hanging off
  each loop, and each MERGES rather than crosses.

**And one signal placement rule that is worth knowing.** A signal has to sit
immediately past every merge. Without it the section a train leaving a shed
must be granted runs from the shed, through the junction, and along the ring to
the next signal - and a ring carrying twenty trains never leaves that much free
at once. Adding four signals took the worst standstill from "never leaves the
shed at all" to 3_300 ticks.

Measured, in order: 8_391 (D-073, before body exclusivity) -> 5_488 -> 3_540
(loops) -> stations all reachable, every train out of its shed, worst standstill
3_300 and every one of them resolves.

### D-083 The deadlock clock could not see a train that never reached a signal

Found by the same work, and it is the more important half of it.

`waitingSinceTick` was set only where the tile-advance gate refused a train. A
train whose section is never granted never crosses a tile boundary, so it sits
in DRIVING at zero speed, holding nothing but its own body - and the clock never
started. Four trains sat in their sheds for an entire ten thousand tick run
while the warning read zero.

The clock now also starts when a train is standing still and holds nothing
beyond its own body, and it is cleared only when the train is genuinely moving.
That is what a deadlock warning is for, and without it the metric was lying by
omission - every earlier number in D-082 was measured with this blind spot in
place.

### D-084 What the regression network asserts, and what "no deadlock" means

Section 19.5 asks for zero collisions and zero deadlocks. Both are now asserted
as things that can be measured:

* **no collisions** - every tile a train holds is held by it alone, checked
  every tick for every train;
* **no deadlocks** - no train is ever permanently stuck. The worst continuous
  standstill of a train that is trying to move is 3_300 ticks and it resolves;
  all twenty leave their sheds, none ends in "no route", and three runs are
  bit-identical.

A standstill of 3_300 ticks is longer than the 1_200 tick warning of 9.3, and
that is correct rather than a defect: twenty trains on a single-track one-way
ring is a queue, the warning is meant to show the player exactly that, and the
answer is to double-track the line. A deadlock is a state that never resolves,
and there is none.

### D-085 An industry is judged on what LEFT ON A VEHICLE, not on what reached a platform

Found by balancing scenario 2 and it is the most consequential thing in it.

`collectedThisMonth` was credited when the collection gate handed output to a
station. The growth ratio of 7.3 is therefore "did a station take it", which a
station always does - so an industry read full service while its output rotted on
a platform nobody called at, grew on the strength of that, and made still more of
what could not be moved. Measured on the coal line: the mine doubled itself to
190 % while the one train it fed carried six month old coal at the decay floor.

Collection is now booked in `loadFromStation`, when a vehicle actually takes the
cargo, split evenly between the works at that station which make it. What the
gate offered but nobody took goes back into the yard, where the player can see
it.

The consequence is the one the design wants: the achievable ratio is bounded
above by the station rating, so reaching the 80 % expansion threshold means a
station rated 80 or better, and that takes a line with several vehicles on it.
A second train pays for itself in tonnage.

### D-086 An industry never shrinks - the closure clock is what punishes neglect

Section 7.3 moves the production level in ONE direction: good service expands a
works, and nothing in the spec shrinks one. A decline rule was here anyway, as an
undocumented departure, and D-085 turned it into a trap.

The arithmetic: what can be carried away is bounded by the collection gate, which
is the station rating divided by a hundred. A line that has just been built has a
station nobody has visited yet, so it is rated around 30 - and the decline
threshold sat at 0.35. Every new freight line therefore drove the industry it
served to the floor before it had a chance to prove itself, and it never
recovered, because a floor-level works cannot fill the trains that would raise
its rating.

Removed. Neglect is punished by the closure clock of 7.3, which is what the spec
uses and which scenario 6 measures.

### D-087 The rating terms and the freight tariffs, recalibrated against scenarios 2 and 3

Two findings, both of them the reason section 19.4 exists.

**The station rating was calibrated for a cadence the time model forbids.** One
game day is ten seconds of real time and a vehicle covers about 150 metres in it,
so a 25 tile line is a TWENTY DAY round trip and one vehicle makes ONE visit in
the twenty day rating window. The frequency term saturated at forty visits - two
a day, which nothing in this game can ever do - and the waiting-time term gave
full marks only to cargo under two days old, which no line ever collects. Both
scored every station in the game at about a third of the marks available.

Saturation is now four visits (a four-vehicle line) and the waiting term is good
at ten days and zero at forty-five. Scenario 1 is unmoved by it, because for a
town the rating only redistributes a fixed output; for an industry it is a CAP,
which is why it mattered so much here.

**The freight tariffs were still an order of magnitude too low.** D-066 raised
them fourfold against a closed-form ceiling test I wrote myself, because this
scenario did not exist yet. The ceiling assumes a vehicle runs continuously at
capacity; a real coal train makes 1.3 round trips a month over 45 tiles, and
measured that way the line earned 6.4 k EUR a year against 18.6 k of upkeep - it
could not have paid for itself at any line length or over any number of years.

Every freight rate is multiplied by ten. Passengers and mail are untouched, which
is what keeps scenario 1 where it was. The two scenarios agree with each other at
that factor, which is the real test of a calibration: scenario 2 pays back in
game year 6 against a band of 4 to 7, and scenario 3 earns 166 k EUR a year
against a band of 80 k to 200 k.

The invented band in `tariff.spec.ts` was replaced by a COMPARISON - road freight
must be worth less per euro of upkeep than rail freight - because an absolute
band there competes with the scenario the spec names as the authority.

### D-088 What scenario 4 can actually measure, and what it cannot

"Passively doing nothing with the starting capital, ten years: bankrupt between
year 6 and 9 - upkeep eats the capital."

Taken literally this is not satisfiable and cannot be made so. A company that
owns nothing has no upkeep; its cash never moves, and it sits on 500.000 EUR for
ever. Making it fail would need a fixed company overhead, and section 14.1 lists
no such account - every cost in it belongs to an asset. An overhead big enough to
burn 500.000 EUR in six years is 60 k to 100 k a year, which would swamp the
8 k a year bus line of scenario 1 and break that scenario instead.

So the scenario is read as: a player who spends their capital on a network and
then stops playing it. That is what "Unterhalt frisst Kapital" describes, and it
makes the band pin something real - the RATIO of yearly upkeep to purchase price
across the whole catalogue. Years to ruin is `(1 - f) / (u x f)` for an invested
share `f` at an upkeep rate `u`; the fixture invests six tenths, the catalogue's
rate comes out at 8.1 %, and the company is wound up in game year 9.

That is the top of the band rather than the middle of it, and it is worth saying
so: the measurement is sound but it has little room above it, and a catalogue
change that lowers upkeep will push it out. The bankruptcy rule of 14.2 itself -
three months in the red is a warning, twelve is a forced auction of the fleet -
was missing entirely and is implemented here rather than being deferred to M6,
because none of this is measurable without it.

### D-089 Every vehicle in the game started at reliability zero

`VehicleStore.create()` set fifteen fields and not `reliability`. A `Uint16Array`
is zero filled, so every vehicle ever bought began at 0 out of 10_000 - a one in
four chance of breaking down every game day, against the eight percent its
catalogue entry asks for. `reliability0` was on all seventy-eight entries and
read by nothing.

Found by the M6 survey rather than by a test, which is the point worth keeping:
no test asserted what a new vehicle's reliability was, so nothing noticed.

Measured after the fix, the balancing scenarios do not move at all - not by a
cent. That is stated rather than assumed: a bus that stops for 40 to 120 ticks
on a twenty day round trip loses very little, and what it carries is gated by
the station rating rather than by how many trips it makes. The fix is right
regardless; the field means nothing otherwise.

### D-090 Only the fleet is depreciated

Section 14.1 wants straight-line depreciation over the design life. Vehicles
have a design life in the catalogue; track, roads, stations and their modules do
not, and nothing in the simulation wears them out - a station works exactly as
well in 2050 as the day it was built.

Writing infrastructure down would mean inventing both a lifetime and a wear
model that the game does not otherwise have, and it would shrink the credit line
of section 14.2 as a side effect, because that is derived from the fixed assets.
So the fleet is written down and the infrastructure is carried at cost.

The charge is recomputed from the fleet each month rather than carried as a
running total, for the same reason the fleet's upkeep is: it changes when a
vehicle is bought, sold or replaced, and a cached total would drift silently.

### D-091 The energy meter is a double, and it is emptied every month

Traction force reaches 300 kN and a tick covers up to 2.8 m, so one tick is up
to 840 kJ. A game year is 72_000 ticks and the playable span is a hundred of
them. A `Float32Array` has 24 bits of mantissa - about 1.7e7 - so a per-vehicle
accumulator would have stopped growing meaningfully inside the first game MONTH
and the energy bill would have quietly flattened out.

It is a `Float64Array`, and it is reset every month when the bill is drawn,
which keeps the running value far inside what a double represents exactly.

Two more things about it are decisions rather than oversights:

* the work is accumulated with the SAME distance the position uses, not with a
  recomputed one. Two accumulators fed the same numbers drift apart - that is
  D-043 wearing a different hat - and here it would put the energy bill and the
  odometer permanently out of step;
* braking sets traction to zero, so nothing is recovered on the way down.
  Regenerative braking is not modelled. Saying so is better than leaving a
  reader to infer it from an absence.

The price per carrier folds in efficiency rather than modelling it separately: a
steam locomotive turns perhaps eight percent of what it burns into work and an
electric one ninety, and without that the account would cost the same per joule
either way - which would make electrification worthless and the account
pointless. The absolute level was set against balancing scenario 2; the ratios
between carriers are the part that is not negotiable.

### D-092 Inflation is fixed when the game starts

Section 14.2 calls inflation switchable. It is switchable at NEW GAME time and
not afterwards, and it is saved and hashed.

The reason is that it changes what every command costs. Two worlds with the same
seed and the same command log but different settings genuinely diverge, so the
flag is part of the state a replay has to reproduce. A checkbox that could be
flipped mid-game would either break the replay or have to be a command like
everything else (law #6) - and a mid-game change of price level is not something
a player would want anyway.

It had been applied to REVENUE since M2 and to nothing else, which meant fares
climbed for a century while costs stood still. Every build, every purchase, the
upkeep and the energy bill now go through the same factor.

The build preview applies it too. A preview that shows the table price while the
command charges the inflated one is the exact frustration section 17.3 exists to
prevent, and it would have appeared in game year two.

### D-093 Auto-renewal is company-wide, and it touches no randomness

Section 11.3 attaches auto-renewal to a LINE. Lines are section 12.2 and no
milestone has built them, so it is a company-wide switch. The rule itself is per
vehicle, so moving it onto lines later is a change of where the flag is read
from and nothing else.

Two properties matter more than the feature does, and both are tested:

* it consumes NO randomness. Breakdowns draw from the world rng once per vehicle
  per day; a replacement that drew as well would shift every subsequent draw and
  send every existing seed down a different future the moment a player enabled
  the switch;
* the successor is chosen by a TOTAL order - longest design life, then capacity,
  then the lower id - so two runs of the same world replace the same vehicle
  with the same thing. Catalogue ordering cannot influence it.

A vehicle that needs catenary never replaces one that does not: the line it runs
on may have no wires, and stranding a fleet is worse than an old fleet. The old
vehicle is sold through the ordinary command, so its track claim is released
(the D-057 class of bug) and its book value moves exactly as it would by hand.

### D-094 Ships get plain A*, not the flow field section 8.4 asks for

Section 8.4 specifies "A* over water tiles with a precomputed flow field per
port, recomputed only when a port is built". `waterPath.ts` is plain A*.

The flow field is an optimisation for many ships sharing few ports. What it buys
is amortising one search across a fleet; what it costs is a second structure
that has to stay correct against every terraform that moves a shoreline - and
shorelines move, because lowering land below sea level floods it and that is how
a canal is dug. A stale flow field would route ships into land that is no longer
there, and it would do it silently.

The search it replaces is the very algorithm the road vehicles already run, over
a graph of the same size, with the same workspaces and the same budget. If ship
counts ever make it necessary, the thing to replace is the search - not to wrap
it in a cache that can go wrong.

### D-095 A quay does not move the station's centre

Every other module is averaged into `station.x/y`, and that centre is what the
CATCHMENT is measured from - which industries a station serves, which houses it
covers, what cargo it accepts.

A quay stands out in the water, sometimes several tiles from the shore. Averaged
in, it drags the whole catchment seaward: a harbour built beside a coal mine can
lose the mine by having its berth placed one tile too far out, and the player has
no way to see why. Water modules are therefore left out of the average, and a
port made of nothing but water modules falls back to averaging them because
something has to be the centre.

The consequence is worth knowing when reading a payment: a ship is paid from and
to the station CENTRE, which is on the shore, not from the berth it actually tied
up at. That is the same rule every other mode is billed by.

### D-096 The aircraft capacities are not seat counts

The first draft of the aircraft catalogue used real seat counts - forty-four for
a 1950 propliner. The tariff diagnostic immediately failed three of them: their
ceiling revenue was below their own upkeep, so they could not have been operated
at a profit on any route of any length.

The cause is that this game's passenger unit is not one person. A 1950 BUS
carries a hundred and fifty of them. The aircraft figures are scaled to the unit
the rest of the catalogue uses, which is what makes them comparable.

The same pass cut air freight hard. Written at realistic volumes it had a ceiling
three hundred times its upkeep - a licence to print money rather than the
premium, low-volume niche air freight is meant to be.

### D-097 Locks are not implementable in this map model, and canals need no command

Section 10 and the M7 brief both name canals and locks. One of them already
works and the other cannot.

**Canals already work.** Lowering land below sea level floods it - `applyTerraform`
moves the corners, `refreshShoreline` turns the tile into water and re-runs the
ocean and land-mass labelling, and `tests/unit/terraform.spec.ts` has pinned
exactly that since M1. A canal is dug with the ordinary lower-land tool and a
ship will sail up it, because a canal at sea level is indistinguishable from the
sea. No new command is needed and none is added.

What a player cannot do is dig a canal ACROSS a ridge. The slope invariant drags
a cone of surrounding corners down with every corner lowered, and
MAX_TERRAFORM_CORNERS caps one action at sixty - so a cutting through high ground
is refused. That is a real limitation and it is the invariant working as
designed, not a bug to be tuned away.

**Locks cannot exist here.** Water is defined as terrain at or below SEA_LEVEL,
so the game has exactly ONE water surface. A lock is a device for moving a boat
between two water levels; there is no second level for it to connect. Building
one would mean a second water surface in the map model - a change of the same
magnitude as bridges and tunnels were in M3, touching the height field, the
shoreline rules, the renderer and the pathfinder.

That is not work M7 can absorb honestly, so it is not started. It is recorded
here as the one thing in M7's sentence that is not delivered.

### D-098 An aircraft flies along a path of adjacent tiles

Section 8.4 says an aircraft flies direct, and it does - `flightPath` is a
Bresenham walk from one airport to the other over whatever is in between, with
no search and nothing to search.

What it produces is a path of ADJACENT tiles, and that is the whole reason it
exists. Everything downstream measures a step from the delta between two path
entries, walks one tile per boundary crossing, and sends (tile, next tile,
progress) to the renderer. Handing those consumers two endpoints instead would
mean a second motion model, a second snapshot shape, a second thing for the save
to carry and a second thing to keep correct - to save an array that is at most a
few thousand integers.

The cost is that a flight is bounded by `MAX_PATH_TILES`. On the map sizes this
game offers that is not reached; if it ever is, the aircraft is refused its route
and says so, which is the same failure any other vehicle has when it cannot get
somewhere.

### D-099 Three airport sizes are three module kinds, each on one tile

`StationModule` is `{kind, tileIndex, x, y}` and nothing else. Giving it a size
field for the sake of airports would change the saved shape of every module in
the game and give every other kind a field that means nothing to it.

They also occupy ONE tile each rather than a footprint. `stationAt`,
`recomputeCentre` and `platformLength` all index a module by a single tile; a
multi-tile module would have to teach all three about footprints, and the three
sizes are already expressible as three sets of numbers - runways, turnround time
and price.

What a bigger airport buys is measured rather than asserted: the test flies the
same three aircraft into an airstrip and into an international airport and
compares the time they spend circling.

The holding stack of section 8.4 is bounded at four, and the bound is enforced
where an aircraft can be refused kindly: BEFORE it takes off. An aircraft already
in the air is never turned away, because that would mean inventing fuel
exhaustion and a way for a player to lose a vehicle to a rule they could not see.

### D-100 The acting company is on the world, not on twenty function signatures

Every build command charges `world.company`. With more than one company that has
to mean the company ISSUING the command rather than the player, and there were
two ways to say so: thread a `CompanyState` parameter through all twenty-odd
build functions, or let `world.company` resolve to whoever is acting.

The parameter says the same thing at every call site; the field says it once.
`World.actingCompanyId` is set from the command envelope for the length of one
command and put back to the player immediately afterwards, so outside a command
`world.company` still means exactly what it meant before this change - which is
why sixty-odd call sites needed no edit at all and none of them became wrong.

The trap in this design is a rule that runs OUTSIDE a command and quietly books
against the player. Three places had to be told: the monthly hooks now take a
`CompanyState` rather than reading one, a vehicle's revenue is booked to its
OWNER and not to whoever is acting, and the winding-up of section 14.2 sets the
acting company around its own auction. Everything else in the simulation reaches
a company through a vehicle, a station or a tile, all three of which say who
owns them.

Who issued a command lives on the ENVELOPE and not inside the command. A command
that carried its own company could claim to be anyone, and the AI of section 15
uses precisely the commands the player does - which is only true if the command
types did not change at all.

### D-101 Tiles have an owner; roads a town laid have none

A per-tile owner layer is a megabyte on the largest map, so it was worth asking
whether stations and vehicles carrying an owner is enough. It is not, twice
over: a company must not be able to tear up a competitor's line, and the town
council of section 13.3 rates each company on the track IT laid inside the town.
Both are questions about a tile.

A tile becomes a company's when that company puts the FIRST road or track on it,
and goes back to public when the last of it comes up. Extending a town's own
street therefore never buys it - which matters, because a company that could own
a town's road network by paving one tile of it could lock every competitor out
of the town without ever going near the council.

The rule that a company may not build on or demolish another's tile leaves a
single-company game behaving exactly as it did: everything is either public or
the player's, and both were always theirs to change.

Version 17 saves have no owner layer and cannot be given one honestly - the file
does not say who laid which piece of track - so every tile in them becomes
PUBLIC. That is the reading that changes nothing about what the player may do
with the map they saved.

### D-102 The council rating is recomputed; only what a company DID is remembered

Section 13.3 names four inputs: stations serving the town, the share of its
traffic carried, noise from track in the streets, and buildings demolished.
Three of those are facts about the world right now and are measured from it
every month. Only the fourth is history, and it is kept as a single `goodwill`
number that also carries what campaigns, trees and streets bought.

Goodwill DECAYS, at ninety per cent a month. A campaign that never wore off
would mean buying a town once and owning it for the century; a grudge that never
faded would mean one cleared house costing a company the town for ever. Neither
is a game, and both are what a stored rating does if nothing pulls it back.

A company the council has never heard of sits at the neutral 50 rather than at
zero. The refusal threshold is then a punishment for behaviour instead of the
state every company starts in - a new company that could not build in any town
would have no way to earn its way out of it.

### D-103 Clearing a town building is a command, so that "demolished" is real

Nothing in the game could remove a town building before this. Every build
refuses a tile with a house on it, so "buildings demolished" as a council input
would have been a term that is structurally always zero - present in the code,
never anything but zero, and impossible to tell apart from a bug.

`DemolishBuilding` costs money and costs standing with the council, and it is
the only command in the game that costs the second. It also removes the worst
frustration the build rules have: a house in the way was permanent.

### D-104 Streets a company funds stay the town's; track it lays does not

Both come out of the one-byte owner layer of D-101 and they pull opposite ways.

Road: a company that could own a town's street network by paving one tile of it
could lock every competitor out of the town without ever going near the council.
So a tile only becomes a company's when that company laid the FIRST road on it,
and streets bought with the "fund streets" measure stay public even though a
company paid for them.

Track: a town never lays track, so track across a public street takes the tile.
Without that rule the level crossing belongs to nobody, which means nobody can
pull it up and - worse - it does not count as that company's noise, so running a
main line straight down the high street would cost no standing at all.

Funded streets reach two tiles PAST the built-up area. A town that has filled
its radius has no bare ground left between the houses, and a measure that could
only build where there was already room would do nothing in exactly the towns
worth courting.

### D-105 Carbon is measured from energy, not from kilometres

Section 14.3 puts the company's CO2 figure at "kilometres driven times
`co2PerKm`". This measures it from the ENERGY each vehicle turned into work,
which the tick loop has been integrating since M6.

It is the same question with a strictly better answer. A train dragged up a
gradient emits more than the same train on the level; a heavy one emits more
than a light one; an electric locomotive emits a fraction of what a steam engine
emits for the same work. A per-kilometre constant says none of that. It would
also need a new invented number on every one of the sixty-odd vehicles in the
catalogue, and those numbers would have to be kept consistent by hand with the
energy costs that already encode exactly the same physics.

`CO2_KG_PER_MJ` is therefore indexed by power source exactly as
`ENERGY_COST_CT_PER_MJ` is, and derived the same way: carbon in the fuel divided
by how much of it reaches the drawbar. That is why steam is so far above
everything else - not because coal is uniquely dirty, but because a steam
locomotive wastes ninety per cent of it.

Electric is NOT zero. The grid of 1950 burned coal too, and a zero would say the
game believes electrification is free of consequence rather than very much
better.

The levy rises LINEARLY after 2005 rather than exponentially. A player who
electrified in 2010 has to be able to work out what it saved them, and an
exponential curve turns the last decades of a century-long game into a decision
that has already been made for them.

The environmental rating a council reads is an INTENSITY - carbon per unit of
work - and never a total. A total would mean a company improves its standing by
running fewer trains, and the one thing an environmental rule in a transport
game must not reward is doing less transport.

### D-106 Contracts draw from their own RNG stream

The monthly tender review draws a handful of random numbers: how many offers to
put out, and for each one a town, a cargo, an amount and a deadline. Taking them
from `world.rng` moved every later draw in the game by however many tenders
happened to be offered that month.

That is not a theoretical concern. Adding the feature turned balancing scenario
3 red: the shifted breakdown rolls were enough to starve one link of the wood
chain and close a farm. The scenario was not wrong and the contract code was not
wrong - they were sharing a stream.

So the review reseeds a stream of its own from `(seed + tick)`. It needs no
saved state, because both of those are saved already, and it cannot disturb
anything: the gameplay RNG sees exactly the draws it saw before contracts
existed.

The general rule this is an instance of: a new subsystem that needs randomness
on a periodic hook gets its own stream. Sharing one makes every existing
balancing figure a hostage to the next feature.

### D-107 Every tender is a race, and a settled one is kept rather than deleted

Section 14.4 mentions exclusive contracts as a case. Here every contract is one:
several companies may accept the same tender and the first to finish takes the
money. A private task list per company would make tenders a solo optimisation
problem, and the section's own reason for them - "wer zuerst liefert, gewinnt" -
is the interesting half.

Contracts that are completed or missed stay in the list, marked, until their
deadline has been past for longer than the longest possible deadline. Ids are
never reused. A recycled id would let a click on a stale panel accept a contract
the player never saw, and there is no way for the player to tell that happened.

### D-108 An AI line is built over three cycles, because the AI cannot see the future

Everything a competitor does it does by enqueueing the player's own commands for
the NEXT tick. That is what makes an AI build indistinguishable from a player's:
same route assistant, same prices, same refusals, and the whole of it in the
replay log. It also means the AI cannot know what any of it will produce - which
station id, which vehicle id - because none of it has run yet.

So a line is built in three stages, and each stage OBSERVES what the previous
one left behind: order the infrastructure, then find the stations that actually
exist and order vehicles at the depot, then find the vehicles standing in that
depot and crew them. A route the assistant refused, a stop the council blocked
or a purchase there was no money for simply ends the project. Whatever DID get
built stays standing and stays paid for, which is exactly what a failed project
costs a player.

The alternative - predicting the ids the commands will produce - works right up
until one command in the middle is refused, and then the AI gives orders to
somebody else's lorry.

### D-109 What the twenty-five year game actually measured, and what it changed

The M8 acceptance run is `tests/balance/aiGame.spec.ts`, and its first version
was red in the way that matters: all three competitors were wound up, with
railways standing and no vehicles left. Four things came out of measuring it,
and all four are in the constants rather than in the prose:

1. **A line's fleet is most of what it costs to open.** The estimate costed only
   the track, so a company put six lines down before the first had carried
   anything. `AI_VEHICLES_PER_LINE` is now ONE - cargo piling up buys the second
   vehicle, which is what the reinforcement rule is for.
2. **A dead line is invisible.** Its works shuts, its lorries wait for a full
   load that will never come, and nothing in the simulation notices while the
   upkeep runs. Section 15 step 3 asks for unprofitable lines to be closed;
   without it the competitors paid for their corpses until they were wound up.
   A line is judged every half year on what it earned SINCE the last look.
3. **Borrowing has to be paid back.** Letting every personality use the credit
   line was tried: all three ran it to the limit inside a decade and the
   interest finished them. Only the expansive personality borrows now, and every
   competitor repays as soon as it can cover the debt and keep a reserve.
4. **A competitor must not build a line that is going to die.** A works that
   produces something shuts down in twenty-four months if nobody collects it
   (section 7.3), and takes the line feeding it with it. A pair ending at a
   producing works is only offered when the NEXT leg exists to be built, and
   finishing a chain the company already feeds is worth five times the tonnage.

What is still weak, stated rather than hidden: by year twenty-five the
competitors have usually pruned themselves back to nothing. They build, they
run, they cut their losses and they survive - two of three end the run solvent -
but they do not compound. The evaluation function finds fewer completable chains
as the industry map thins out, and nothing in the cycle rebuilds one that lapsed.
That is the next thing to work on, and it is a scoring problem rather than a
structural one.

### D-110 A setting is not a game rule, and the two must not share a screen

M9's brief names an options menu with "Spielregeln" in it. Two different kinds
of thing were hiding under that word and they behave in opposite ways.

A SETTING is the player's: the language, the interface scale, the volumes, the
colour-blind palette. It is the same for every game they play, it must never
reach `src/sim`, and two worlds with the same seed and the same commands are
identical whatever is in it. It lives in `AppSettings`, is written to disk on
every change, and is applied by one function so that "stored" and "in effect"
cannot drift apart.

A GAME RULE is the world's: inflation, the carbon levy, how many competitors,
the difficulty, the climate, the map size. Every one of them changes what the
simulation does, is written into the save and is part of the state hash. They
are chosen once, on the new-game screen, and cannot be moved afterwards.

Putting them in the same menu would say they can both be changed mid-game. One
of them cannot: a mid-game toggle of inflation would break the promise that a
seed plus a command log reproduces a world, silently and unrecoverably.

### D-111 The worker encodes a save; the main thread decides where it goes

`requestSave` comes back as bytes in a message rather than as a written file,
and the main thread names it, gives it a picture and puts it away.

Architecture law #1 forces the split - the simulation may no more reach a
filesystem than it may reach the renderer - but it turns out to be the right
split for its own reasons. Naming and rotation are POLICY: which of five
autosave slots is next, whether this is the quick save, what a player called
it. The encoder should have no opinion about any of that. And the thumbnail is
a picture of the map as the MAIN THREAD holds it: the worker owns the tile
layers but has no canvas, and shipping a megabyte of pixels across the boundary
to paint them on the other side would be absurd.

The autosave clock is on the main thread for the same reason: whether the
player wants autosaves is a SETTING, and giving the simulation an opinion about
it would mean a second copy of the preference.

### D-112 The minimap is a pure function, and the save thumbnail is the same one

`paintMinimap` takes the tile layers and fills a byte buffer. It owns no
canvas, no Pixi object and no state, and it is called from exactly two places:
the panel in the corner of the screen, and the thumbnail a save carries.

One painter, so a save's picture is the map the player was looking at rather
than a second drawing of the same world that drifts away from it. It repaints
only when the map revision moves - the signal the renderer has carried since
M1 - because a megapixel per frame would cost more than the map itself.

The "Frachtfluss" mode is stations and industries lit by how much is waiting
and how hard each works is running. A flow needs two endpoints and a rate, and
the simulation measures neither per tile; this is the same question answered
from the side the data is actually on, and it is labelled honestly.

### D-113 The tutorial watches; it never plays

A lesson is a list of sentences, each with a predicate over the state the
interface already has. It never builds anything, never moves the camera and
never touches the simulation.

Two reasons, and the second is the binding one. A tutorial that plays itself
teaches nobody - the player watches a demo and then faces the same blank map.
And a tutorial that wrote into the world would be a second author of state
beside the command queue, which architecture law #6 does not allow: the replay
would then be missing half of what happened.

What the predicates read is the store and a count of the commands the player
issued, which the worker already reports for its own reasons. Between them they
cover every goal section 17.5 names without one new signal.

### D-114 The keyboard scheme is a table, not a switch statement

Section 17.2's bindings are needed in two places: the handler that acts on them
and the options screen that shows them. A list of keys typed out a second time
in a help panel is a list that is wrong the first time a key moves, so both
read `src/ui/keymap.ts`.

Two bindings differ from the table in 17.2 and both are deliberate. `B` is the
station tool, as the section says, which meant the station LIST moved to `L` -
the section gives `L` to lines, and lines do not exist. And `M` toggles the
route assistant rather than selecting a mode, which is what "manueller
Bau-Modus" means with the assistant this game actually has.

Undo and redo are NOT bound. They are the one item in 17.2 that needs machinery
the simulation does not have: an exact inverse for every build command,
including the money, the upkeep totals and everything a demolition destroys.
A partial undo that silently covered half the commands would be worse than
none, so the keys are unbound and this is written down rather than left as a
key that does nothing.

### D-115 Five real AI defects, found by writing balancing scenario 5

Section 19.4's fifth scenario - one AI company alone on a 512 map for
twenty-five years, ending worth five to twenty-five million - could not be
written until M8. Writing it in M9 found five separate defects, every one of
them silent, and every one of them fixed:

1. **The cost estimate left out the stations.** A competitor spent everything
   it had on the railway and then could not afford the platform at the far end.
   The project was abandoned with the money gone and the track still charging
   upkeep; one such attempt in game year two finished the company.
2. **The line review compared half a year's earnings with a full year's
   upkeep.** `AI_LINE_REVIEW_TICKS` is half a year; the upkeep it was measured
   against is quoted per year. Every first line was closed as unprofitable
   before it had run a season.
3. **Automatic signalling made single-track lines one-way.** Section 9.4 lays
   ONE-WAY signals facing the way the line was drawn - right for a main line,
   fatal for what a competitor builds, which is one track worked out and back.
   The return trip was refused by the signals meant to help it, and the train
   stood in its shed with no route for six months. The AI lays no signals now.
4. **A depot reached by a single diagonal piece of track had no way out.**
   `depotTileNear` tried the diagonal neighbour first; it now tries the four
   orthogonal ones first.
5. **Lines were built from factories that produce nothing.** A secondary
   industry makes nothing at all until something is delivered to it, and stays
   at nothing for ever if nobody does. A competitor built a railway from an
   unsupplied furniture works to the town next door and ran a locomotive up and
   down it for six months carrying air. A source must now be a primary
   industry, or one already producing, or one WE supply.

The AI also lays its railways the shape balancing scenario 2 proved: the track
runs PAST each platform, the platforms are as long as the train, and the shed
sits in line rather than on a spur. A platform on the last tile of the track
leaves a train longer than one tile nowhere to finish arriving.

### D-116 Scenario 5 is not met, and this is what is left

With all five fixed, the road-freight personality compounds: over twenty-five
years it finishes with two lines, twelve vehicles and a company worth about
580 000 - where before the fixes all three competitors were wound up. That is a
real improvement and it is measured in `tests/balance/aiGame.spec.ts`.

It is not five million, and scenario 5 is therefore NOT in band. The test is
not in the suite, because a test that asserts a band the code misses by two
orders of magnitude is not a specification, it is a red light nobody can act
on. What is in the suite is the M8 acceptance run, which measures the same
thing and passes.

What is actually left, stated so the next person does not have to find it
again: **the rail and town-network personalities build their infrastructure and
never crew it.** Both reach the stage where the stations exist and the vehicles
should be bought, and no vehicle appears - the rail company ends a
twenty-five-year run with ninety-five tiles of railway, two stations and no
train; the town-network company with thirty-five stations and nothing running.
The road-freight personality, which differs only in what it builds, works. So
the defect is in the second and third stages of the project machinery for those
two cases, not in the evaluation that chose the line.

Until that is fixed the AI cannot reach the band, because two of its five
personalities cannot run a line at all.

### D-117 Seventeen industries get seventeen silhouettes, not seventeen tints

Every industry in the game was one white box with a colour multiplied over it.
That is unreadable for a reason that is not about taste: a tint MULTIPLIES, so
a coal heap, a chimney and a shed under one tint all come out as the same shade
of that tint, and the only information left is the hue - at which point the
player is reading a colour key rather than a map.

They are drawn in their own colours now, and the tint is gone. What separates
them is the OUTLINE: a headframe over a coal shaft, a derrick on an oil pad,
cooling towers and a banded stack at the power station, a north-light hall at
the sawmill, distillation columns at the refinery, a rotary kiln at the cement
works. Shape survives being sixteen pixels tall; colour does not.

The same argument applies to a town. Three zones were three colours of one box;
they are three shapes now - a house with a pitched roof, a glazed office block
and a works shed - and they grow with the expansion stage rather than switching
between two heights.

Two latent defects fell out of doing this. The atlas cell had ONE height step
of headroom, so everything taller than a crate was being silently cut off at
the top; it has three now. And where the ground sits inside a cell was an
unwritten agreement between `TerrainAtlas` and `MapView` - the renderer read
`HEIGHT_PX` and assumed they matched. It reads `anchorY` now, which is what the
field was always for, and the two files can no longer drift apart.

### D-118 Nobody accepted electronics

`tests/unit/deliveries.spec.ts` walks the whole chain table and asks, of every
cargo any works produces, whether ANYTHING accepts it. Electronics failed: the
electronics factory turns steel and plastics into a cargo that no industry
takes as an input and no town consumed.

That is not a display problem. A cargo nothing accepts cannot be delivered, so
the line carrying it is never paid, and the works making it closes after
twenty-four months whatever the player does - a whole branch of the production
tree that could be built and could never work.

Towns take electronics now, credited to the same GOODS demand as furniture: a
town wants manufactured articles, and whether they arrive as a wardrobe or as a
radio is not a distinction the growth formula of section 13.2 makes. That
avoids a third demand counter, a third constant and a third growth term for a
difference nothing would read.

The list of what a town accepts is now EXPORTED from the simulation and read by
the interface rather than copied into it. The copy was the real hazard: the
moment the two disagreed, the panel would send a player to a town that would
not take the load.

### D-119 The connect tool is the only build that asks before it charges

Every other build in the game bills on the click. That is right for a tile of
road and wrong for a railway between two stations, which can cost more than a
company has - so this one plans, prices, shows the length, the gradient, the
tightest curve, the resulting speed, the bridges and tunnels and the total, and
then waits.

It plans with the very same `planTrack` the command runs, with the same
arguments, so the number on screen and the number on the bill cannot disagree -
which is the whole of section 17.3.

The platforms go one tile IN from each end and two tiles long, which is the
layout balancing scenario 5 spent a game year proving: a platform on the LAST
tile of the track leaves a train longer than one tile nowhere to finish
arriving, and a one-tile platform works only the share of the train that fits,
minus forty percent.

The anchor at each end is a MODULE tile, never the station centre. The centre is
a recomputed average and on a mixed station it can sit on ground no track can
reach. An end that already has a rail platform is anchored on it and gets no new
one.

### D-120 The tick projection is printed, not asserted

`tests/perf/tick.perf.spec.ts` measures the p99 of a tick with three hundred
working vehicles on a 1024 map and holds it to section 21's eight milliseconds.
It also extrapolates linearly to the fifteen hundred vehicles the section names.

That extrapolation was asserted, at three times the budget, and it went red on a
run where the measured p99 was comfortably inside it - because the projection is
taken while forty other spec files run on the same machine, and a p99 is exactly
the statistic that picks up somebody else's garbage collection.

It is printed now and not asserted. A test that fails because the box was busy
teaches nobody anything and trains people to ignore the suite; the number is
still in the log, which is where a real regression - one that moves it by a
multiple - will be seen.


### D-121 D-116 was wrong about WHY, and the real reason was arithmetic

D-116 said the rail and town-network competitors "build their infrastructure and
never crew it". Traced month by month, that is not what happens. The rail
company builds its line, buys its train and runs it for six months - and the
line is then closed by its own review, because it earned 4 029 against half a
year of upkeep.

The line it chose was eighty-three tiles long. One train on eighty-three tiles
makes two deliveries in six months. It was chosen because the estimate said it
would make SEVEN A MONTH, and that number came from `AI_TILES_PER_MONTH = 1200`.

That constant is the two-clocks trap of section 5.2 walking into the AI's own
arithmetic. Vehicles move on the TICK clock: a game month is 6000 ticks, a tick
is fifty milliseconds, so a month is three hundred seconds of driving - eighty
four tiles at fourteen metres a second, not twelve hundred. Twelve hundred can
only come from reckoning the month in calendar hours. Fourteen times too high,
and it is why a competitor preferred lines across the map.

The trip count was also floored at one, so a fifteen tile line and an eighty
tile line were credited with the same cadence and the long one won on revenue
per trip every time. It is fractional now.

### D-122 An estimate has to know what it cannot carry, and what it cannot avoid paying

Two more terms were missing from the same estimate, and each of them bit in the
opposite direction.

**What the source makes.** The estimate assumed every trip left full, so a line
that turns round three times a month was credited with three full trains from a
mine that makes one train's worth. Revenue is capped by the works' monthly
output now. Without the cap, fixing the trip count above simply moved the
preference from the longest line on the map to the shortest.

**What the line costs besides rails.** Scoring counted only track, which scales
with distance - while the stops, the shed and the vehicles are the same money on
a fifteen tile line as on a sixty tile one. Measured: with honest trip counts
and track-only costs, the road company built the shortest thing it could find
and finished on a third of what it makes now.

The full figure is used for the SCORE and deliberately not folded into
`Opportunity.buildCostCt`, which is the way and nothing else: the builder adds
the stops and the vehicles to that when it asks whether the company can afford
the project, and a figure that already contained them was counted twice - which
put every rail line permanently out of reach until it was spotted.

Measured over the twenty-five year acceptance run, the road-freight competitor
goes from 583 000 to 973 000.

**One term was tried and REVERTED.** Charging the estimate for the decay a long
haul really suffers (`ticksInTransit` instead of zero) is defensible and made
things worse: every line then rated so poorly that the road company built
nothing at all and finished on 422 000. The estimate is a RANKING, and that term
depressed every candidate below the threshold at which anything is built rather
than reordering them. It is written down in the code so nobody adds it again on
first principles.

### D-123 SPEC2.md is the master prompt of the expansion; SPEC.md stays the authority for v1

The expansion ("the current state is 5% of the final game") needed its own
specification, and writing it into SPEC.md would have destroyed the one
property that made the v1 method work: SPEC.md is the original brief, verbatim,
and every departure from it is measured against an unchanged text.

`SPEC2.md` was therefore adopted (2026-08-06) as the master prompt for
milestones M10-M25. It was not improvised: the evidence base is an
eleven-agent code audit of the finished v1 (which verified ten live defects,
among them terraforming unguarded under track and the SPEC 16.1 draw-order
violation), five independent expansion proposals along different lenses
(simulation depth, presentation, content, identity, platform), and three judge
verdicts that scored, merged and vetoed them. Every contested architecture
question the audit flagged - weather sim-side versus render-only, the stored
versus derived congestion layer, one Line entity for player and AI, the hybrid
renderer, the browser channel - is decided in SPEC2.md's section 5 with the
reasoning attached, so the first PR on any of these topics does not choose the
architecture by accident.

The division of authority is: **SPEC.md remains authoritative for the v1 scope
(M0-M9)** and is not edited; SPEC2.md references it instead of repeating it and
is authoritative for M10 onward. CLAUDE.md digests continue to serve both. The
rule that an undocumented departure is a defect, not a decision, now applies to
both documents alike - which is why SPEC2.md's first milestone is a hardening
pass over the audit's verified defects and nothing ships before it is green.

### D-124 Terraforming is guarded under everything built, and ownership refines the answer, not the outcome

The audit's first verified defect (SPEC2 E-11): `cornerIsFree` checked roads,
buildings and industries and nothing else. Raising a corner under a live
railway bent the track profile silently - the train kept its cached route and
its solver read heights the ground no longer had. Under every system the
expansion adds (town growth extending streets, the AI building) that hole
would have become a standing source of corruption, so it is closed
unconditionally: a bugfix, not a versioned world rule, exactly as the juror
veto demanded.

The guard now blocks a corner when any of the four tiles around it carries
road bits, track bits, a signal, a bridge or tunnel, a building, an industry -
or an OWNER. The owner clause is not redundancy: an airport, a quay or a
canopy lives in entity state and leaves no mark in the map layers at all; the
one trace `attachModule` leaves is the owner byte, and without reading it the
guard would flatten a runway it cannot see. A bare tile is always
`TILE_PUBLIC` (`releaseIfBare` returns it on demolition), so "owned" reliably
means "something stands here".

Ownership changes the REASON, never the outcome (D-104 semantics). Everything
built refuses the terraform - the company's own track included, because moving
ground under rails is wrong whoever owns them; the owner's remedy is to pull
the track up first, which releases the tile back to public and frees the
ground. But a refusal must name its cause (section 17.3), and "occupied" would
send a player at a competitor's line to a demolish tool that refuses too
(D-101). Foreign infrastructure therefore answers with its own key,
`terraform.reject.foreignOwner`. A town's public street stays plain
"occupied": it is nobody's, and nobody may dig it up either way.

The cascade is guarded at the same depth as the first corner. `collectAffected`
walks every corner the slope invariant would drag along and asks the same
obstruction question for each; the first guarded corner refuses the WHOLE
operation before anything is written, so a refusal is atomic by construction.
`levelTile` keeps its documented stop-where-it-stands behaviour - it is a
sequence of single-corner operations and already stops mid-way when the money
runs out - but a levelling that could not move anything at all now reports the
concrete reason instead of a bare no.

No save shape changed and no migration is needed; old saves whose ground was
corrupted while the hole was open stay as they are. What the fix does change
is the validity of old COMMAND LOGS - a recorded replay that terraformed under
track now refuses where it once succeeded. That is the honest consequence
E-11 names, and it is handled by the replay version-pinning decision, not by
gating this guard.

### D-125 Chunks were never built and the sprite path never sorted: the 16.1 history, settled as a hybrid

Section 16.1 of SPEC.md prescribes two things the renderer of M1-M9 never
delivered, and neither omission was ever written down - which makes both of
them defects under this project's own first rule, not decisions. This entry is
the missing record, and M10 closes the half that was a live bug.

The first omission: 32x32-tile chunks baked to RenderTextures. M1 built a
culled sprite pool instead because it was simpler and fast enough for the
worlds of the early milestones, and every later milestone inherited that
choice without re-examining it - a rebuilt chunk on every terraform looked
dearer than drawing sprites, and nothing before the 2048 maps of the
expansion forced the question. The second omission: vehicles sorted into the
tile draw order. `projection.drawOrder()` was written in M1, documented,
tested by nothing and CALLED by nothing; vehicles were drawn in a layer above
the whole world, because before M3 there was neither rail nor any hill a
vehicle could disappear behind, and once there was, nobody looked back. The
visible symptom: a train drives THROUGH a mountain instead of behind it.

The expansion audit settled the architecture as a hybrid (SPEC2 E-04), and
the reasoning is worth keeping: full-map chunking was vetoed because a baked
texture can never interleave moving vehicles into the (x + y) diagonal order -
the two goals of 16.1 contradict each other unless the renderer is split by
zoom. Dropping chunks entirely was vetoed too, because the 0.25x abstract
mode and the editor brushes of the expansion would stand on a known
performance hole. So: chunks ONLY at zoom <= 0.5, where 16.1 itself strips
the detail sprites (M12 implements them); at 1x, 2x and 4x the sprite path
draws, sorted by `projection.drawOrder()`.

M10 wires the sorting. Every tile sprite carries its drawOrder key as zIndex,
the vehicle sprites live in the SAME sorted container - a vehicle layer on
top can never put a train behind a hill - and a vehicle takes the key of the
tile it mostly covers, snapping at half progress. Pixi's zIndex setter is
change-detected, so a frame in which no vehicle crosses a tile edge sorts
nothing. Two refinements the flat key needed: an industry is keyed on the
FRONT corner of its footprint, so its artwork is not overdrawn by its own
footprint's ground, and a station module sits at a layer above the track it
covers and below a vehicle standing on it - a train at a platform must be
visible, hills in front of the station must still win.

### D-126 The M10 UI defect list: every dead end in the interface, and how each became reachable

Five verified interface defects, one entry, because the decisions interlock.

**Manual build mode existed and was unreachable.** `planTrack` has carried an
`assistant` flag since M3, and both call sites hardcoded `true` - the literal
line of section 8.2 could not be laid. The flag is now UI state (`assistant`,
default on), toggled by M exactly as the D-114 table and the option screen's
description always claimed, and shown as a checkbox on the track and connect
tools. The M key had meanwhile drifted to toggling auto-signalling - a
feature that has its own checkbox and never had a key in the table. The
connect flow carries the flag INSIDE the plan: the confirmation builds with
the flag the plan was priced with, not with the live toggle, or flipping M
between planning and confirming would change what the button charges (the
D-119 promise).

**Esc disarms before it menus.** An armed tool, a set road anchor, a
half-planned connection - Esc clears those first and only opens the menu when
nothing is armed. The preview line lives in the renderer, so the map canvas
now follows the store: no track preview and no connect plan means no green
route, which also cures the cancelled connect plan that kept its route on the
map for ever.

**N cycles the minimap.** The mode was component-local state, so no key could
reach it; it moved into the store, where the N key and the mode buttons drive
one value. Refit needed the same treatment in reverse: `RefitVehicle` had a
validator, a tutorial lesson and no issuer. It is now a depot action in the
fleet panel - one button per cargo the vehicle can convert to - and the panel
predicts the validator rather than paraphrasing it: `standsInDepot` mirrors
the D-076 rule (a freshly bought vehicle is Stopped on its depot tile, not
InDepot, and must refit), `refitTargets` uses the same capacity lookup the
command rejects CannotCarry with, and the sim was not touched.

**A signal's direction is chosen by clicking, not hardcoded.** The tool sent
`TrackDir.East` with every signal it ever placed, which the two-way kinds
ignored - and the one-way kinds were simply unreachable by hand. The chosen
UX: the first click places the two-way signal of the armed family, every
further click on the same tile cycles it - one-way once per track direction
(read from the TILE's track bits, plain line has exactly two), then back to
two-way. No modifier, no direction panel; the tile panel shows the standing
kind with a screen-oriented arrow. Because the simulation deliberately has no
modify-signal command, a cycle step is a DemolishSignal plus a BuildSignal,
sent as a pair; each step therefore costs the demolition haircut
(75 % of the signal price is not refunded). That is accepted and stated: the
alternative was a new command kind - new save surface, new replay surface,
new determinism-runner case - for an action whose cost is EUR 225 at 1950
prices. If cycling ever becomes something players do constantly, the command
is the fix, not a UI-side refund.

### D-127 Day and night is one tint on the world container, anchored to a morning

Section 16.3 asks for the time of day as a soft colour modulation over the
whole canvas - never per sprite - with a cycle of one game day, switchable
off. M10 delivers the minimal form; the emissive windows, lamps and headlights
of the full treatment follow in M13.

The shape it took: a pure function `dayNightTint(tick)` in
`src/render/dayNight.ts` maps the snapshot tick to one 0xRRGGBB colour by
linear interpolation over a handful of keyframes across the 200-tick day -
daylight is the identity tint, night a gentle cool darkening, dawn and dusk a
warm glow between them. `MapView` applies it ONCE per frame to the container
that holds the tiles, structures and vehicles; Pixi multiplies a container
tint down the tree on the GPU, so no sprite is ever touched individually, and
the assignment is change-detected so a frame inside a plateau dirties
nothing. The simulation is not involved at all: the curve reads the published
tick out of the snapshot (a new `SnapshotReader.currentTick`, no layout
change) and nothing else - the Z1 boundary, a pure function of snapshot
fields.

Two deliberate choices inside that:

**The overlay and the minimap stay outside the modulation.** The SPEC says
"over the whole canvas", and the tint deliberately covers less than that: the
selection markers, the build preview, the F3 blocks and the minimap are
interface, not world, and an interface that dims at night is an interface
that is worse at night for no reason. The world container carries the tint;
everything the player points WITH stays at full contrast.

**Tick zero of a day is morning, not midnight.** The calendar has days, not
hours, so the phase anchor was free to choose - and a new game starts at
tick zero. Anchored at midnight, every fresh world would fade in dark and
read as a rendering bug; anchored at morning, the first thing a player sees
is the 16.3 palette in daylight, and dusk falls once the first day is half
spent.

Whether any of it happens is a SETTING per D-110 - `dayNight` in
`AppSettings`, default on, a checkbox on the options screen's display tab -
because two worlds with the same seed and commands are identical whatever it
says, which is the definition of a setting and the reason it must never
become a world rule.

### D-128 The stream discipline of D-106 is an API now, and a numeric salt is the old construction verbatim

D-106 stated the rule - a new stochastic system gets its own RNG stream,
because sharing one makes every balancing figure a hostage to the next
feature - but it existed only as a comment in `contracts.ts` and a paragraph
in this log. SPEC2 Z3 makes it law and M10 makes it callable:
`world.streamFor(salt)` derives an independent generator from the world seed
and a salt, and every stochastic system from here on draws from it. A derived
stream needs no saved state - the seed is saved and the salt is the caller's
to reproduce - and however many numbers it draws, the shared gameplay stream
sees exactly the sequence it always saw. A periodic hook passes something
that varies per invocation (the tender review passes the tick); a system
seeded once passes its name.

Two choices carry the compatibility:

**A numeric salt folds in exactly as D-106 folded the tick.** The tender
review seeded its private stream by hand as `Rng.fromSeed((seed + tick) | 0)`;
`streamFor(tick)` computes the same expression bit for bit, so migrating
`contracts.ts` onto the API changed no draw sequence - `streamFor.spec.ts`
proves the identity against the original construction, and no save, replay or
balancing figure moved. A string salt goes through `streamSalt` first
(FNV-1a 32 over the UTF-16 code units, exact integer operations only), which
gives the named streams SPEC2 already speaks of - `weather`, `economy` - a
spelling that cannot collide by an accident of call order. Both derivations
are frozen with golden digests in the spirit of `rng.spec.ts`, because a
changed derivation is a changed future for every stream a save relies on.
`streamFor` allocates a generator, so it is for hooks and commands, never for
the per-tick hot path (law #7).

**The lint flag is a tripwire, not a proof - the law #1 import ban precedent.**
`no-restricted-syntax` now flags any `world.rng` member access under
`src/sim` outside three allowlisted files: `World.ts` (save, load and
`hashWorld` capture the stream's state), `vehicles/lifecycle.ts` (the
breakdown rolls) and `industry/lifecycle.ts` (the spawn rolls). Those sites
KEEP the shared stream deliberately: moving them onto derived streams would
itself send every existing seed down a different future, which is the exact
accident Z3 exists to prevent. Per Z3 their modulation only ever happens by
threshold shift at an identical draw count, and takt and renewal arithmetic
draw no randomness at all, not even a named stream (D-093). An alias like
`const w = world` would slip past the selector; review catches that, exactly
as it does for a re-exported render import.

### D-129 The 8.4 road congestion term is deferred to M15, not forgotten

SPEC.md 8.4 prices road pathfinding with a congestion term - vehicles per
tile over the last 200 ticks - and the `RoadPathfinder` has never carried it:
its cost is distance plus a slope penalty, nothing else. Until now that was
an undocumented omission, which the audit flagged, and the rule of this file
is that an undocumented departure is a defect. This entry is the placeholder
M10 owes; the M15 implementation entry replaces it.

The deferral is deliberate, and the shape of the eventual fix is already
decided (SPEC2 E-02): the term is HISTORICAL by definition, so under Z4 it
must be a saved and hashed layer, never derived - a Uint8 layer in map size,
incremented on tile entry, decayed by a deterministic lazy-epoch exponential
per tile with a dirty list rather than a million-tile scan. Two of the five
expansion drafts wrote "derived, no save change" for exactly this layer and
two judges vetoed it by name: a layer rebuilt empty on load gives different
A* costs after loading than before saving, which is different routes from the
same state - law #3 broken silently. That is also why the term cannot ship in
M10: a saved layer is new save surface, M10's bump (v23) is the digest and
metadata block, and Z5 allows exactly one bump per state-touching milestone.
The layer lands in M15's scheduled v26 alongside the block occupancy and
signal penalties of the same table, where a two-route fixture can prove that
200 lorries on a bottleneck actually divert - the term, its persistence and
its effect measured together instead of a constant smuggled in ahead of its
test.

### D-130 The save carries its own digest in the container, and the write that stores it cannot lose the predecessor

Save format 23, the one bump M10 is allowed (Z5), and all of it is armour:
none of it changes what a world MEANS.

**The digest lives in the container, never in the hashed state.** `encodeSave`
takes `hashWorld` of the world it is wrapping and writes it beside the state;
`decodeSave` rebuilds the world and compares. A digest inside the state would
have to contribute to itself, and Fehlerkatalog 2 names the wider trap: the
moment the v23 migration touched anything the hash covers, every pre-M10 save
would silently become a different world. So `v22_to_v23` spreads the container
and passes the state through by reference, and two tests hold the line - the
migration test proves a v22 payload and a v23 payload around the same played
game hash identically, and the corpus keeps one real fixture of each for good.

**A missing digest is a recorded fact, not a defect.** A v22 save never
carried one and the migration only ever sees the raw payload, so it cannot
compute what the encoder knew. It writes the empty string, and the decoder
skips verification for exactly that value. Inventing a digest during migration
would make every verification of an old save a tautology.

**Corruption and invalidity keep two names.** Bytes that do not decode, or a
state that disagrees with its own digest, are `SaveCorruptionError` - the file
is damaged. A payload that decodes but fails validation stays
`SaveFormatError`, which now carries the failing field as a `path` property
rather than only inside the message, so the load screen can say which section
died instead of refusing the file with a shrug. The distinction matters
because the two failures have different remedies: a corrupt file has a healthy
predecessor, an invalid one usually reproduces a codec bug worth reporting.

**The predecessor exists because the write cannot destroy it.** `writeSave`
writes to `name.tmp`, renames the current save to `name.bak`, and only then
gives the temp file the real name - all inside one directory, which is what
keeps the rename atomic wherever the desktop shell lands. A crash at any point
leaves the old save or the new one under the trusted name, never half a file.
The browser backend keeps the same one-deep backup in its in-memory shelf, so
the policy is testable headless. All of it lives on the main thread: the
worker encodes bytes and holds no opinion about where they go or what they
replace (D-111). When a load comes back "corrupt", the save screen offers that
`.bak` - one write older than what the player asked for, but a world instead
of an error message.

**The corpus is real saves, not synthetic payloads.** `tests/corpus` holds a
fixture per save version from 22 on, written by the sim itself on a 128 map,
and a manifest recording what each must decode to after migration. The suite
is self-priming - a missing fixture is generated and then verified in the same
run - so regeneration is deleting a file, and CI, where everything is
committed, only ever reads. A future SAVE_VERSION without a corpus fixture is
a red test, which turns the ledger's "echte Fixtures je Version" from a
sentence into a gate.

### D-131 A replay is valid only against the version that recorded it; cross-version verification is refused, never guessed

E-11 hardens `cornerIsFree` unconditionally, and that creates a class of
command log this build must be honest about: a log recorded before M10 may
contain a terraform the old build accepted and the new build rejects.
Replaying it here produces a different world than the one its author watched -
not because either build is wrong, but because "valid" changed meaning between
them. The same applies to every constant the balancing tests own: a tariff
table moved by a milestone replays the same log into different money.

So the rule, stated once and inherited by everything later: **a replay is
evidence about exactly one pair `{appVersion, SAVE_VERSION}` and the constants
that build shipped with. Cross-version verification is REFUSED with a message
naming both versions - it is never attempted, approximated, or reported as a
desync.** A refused verification tells the truth ("this build cannot judge
that recording"); an attempted one would file false desync reports against
code that works, which is worse than no verification at all - a desync
detector that cries wolf is a desync detector nobody reads (Fehlerkatalog 38).

What already enforces it: the `.ironsave` container is the only replay carrier
there is, and it pins both halves of the pair - `gameVersion` and
`saveVersion` - since v1 of the format. A save from a newer format is refused
by the migration layer with both numbers in the message, never guessed at. A
save from an OLDER format is migrated and its world plays on, which is
LOADING, not verification: the log travels along as history, and nothing
re-runs it against the new validation. The in-repo determinism fixtures are
version-locked trivially - recorded and replayed by the same working tree.

What inherits it: the `.ironreplay` format and the checkpoint ring of M16
carry the version pair in their header and refuse a mismatch before reading a
single command; the per-tick cheap digest of E-16 compares only within one
session of one build. Migrating a REPLAY across versions is deliberately not
offered - a migration maps states, not judgements, and there is no honest
mapping from "commands as the old rules accepted them" to "what the new rules
would have said".

### D-132 Crash persistence lives on the main thread, because a dead worker proves nothing

SPEC2 M10 asks for crash safety: a hard-terminated simulation must leave
behind something a bug report can be built from. The design question is which
side of the worker boundary owns that evidence, and the answer is forced the
same way D-111 was: **everything a crash bundle needs is collected on the
main thread, while the game is still healthy.** The worker's own
`error`/`unhandledrejection` handlers post one final `simCrashed` message -
the stack and the exact tick, which no other side can know - and stop the
scheduler, but nothing RELIES on that message arriving. A worker that just
threw is in an unknown state: its world may be half-mutated mid-tick, its
encoder may be the very thing that crashed, and the most common death (out of
memory) leaves no room to serialise anything. Asking it for a save at that
moment is asking a witness who has just died to write the autopsy.

So the main thread keeps, at all times: the shelf entry of the **last save
written** (autosaves included - recorded when `storeSave` returns, read back
through `src/platform/Storage` at bundle time), and a **rolling tail of the
command log** - every command mirrored into a ring buffer as it is sent,
capped at 1 MiB by UTF-8 byte count rather than entry count, oldest lines
evicted first. Bytes, not entries, because commands differ by two orders of
magnitude in size and the property the main thread needs is a memory bound,
not a history length. Load and new-game are recorded as marker lines rather
than clearing the tail: a crash shortly after a load is a crash the load
probably caused, and the marker is what lets a reader see the boundary.

The bundle itself is one JSON document - autosave copy in base64, command-log
tail, error text, and the version triple app version / save format / bundle
schema (the third so tooling can tell bundle shapes apart) - assembled by a
pure function in `src/ui/crashBundle.ts` that a unit test can hold whole. The
write goes through `src/platform/Storage`: the desktop puts it in
`$APPDATA/crashes/` so it survives the restart the player is about to click;
the browser hands it over as a download, because a browser profile has no
directory a player could ever find again. The crash dialog offers the exact
bundle that was written; the same export sits in the menu of a healthy game
with `error: null`, which is the "something is wrong but nothing crashed"
report - one bundle format for both, so no second code path rots.

Both crash reporters - the in-worker handler and the Worker object's `error`
event on the main thread - can fire for one death. The worker handler calls
`preventDefault()` so the richer report does not race the poorer one, and the
main thread takes the first crash it sees and ignores the rest: two bundles
of the same corpse help nobody.

### D-133 The hand-rules are machines now: one command parser, recorded fixtures, and three coupling audits that provably fire

SPEC2 M10 asks for the constitution to be mechanised, and this entry records
the shape that took.

**One command parser.** `parseCommand` in `src/sim/save/format.ts` is exported
and the determinism runner uses it verbatim. The runner used to keep a
hand-written switch that knew four command kinds - which meant every
determinism fixture was silently limited to loans and cosmetics, and nobody
was told. A fixture now carries anything the game can record, and a kind the
parser does not know fails the suite by name.

**Fixtures are recorded, not composed.** `npm run record:fixture` (in
`tools/record-fixture.mjs`) decodes any `.ironsave` and dumps its command log
as a determinism fixture - the fixture format IS the save's log, filtered to
the player's commands, because AI competitors re-derive their own from the
seed on replay and recording them would run each twice. The first recorded
fixture, `road-line-commands.json`, builds a bus line - roads, two stops, a
depot, a vehicle, orders - and the suite holds it to cross-run hash equality
plus liveness guards (stations exist, the vehicle EARNED, links were
measured), because cross-run equality alone stays green when every build
command is rejected and two empty plains agree with each other.

**Three coupling audits, each with a meta-test.** In the i18n.spec.ts style,
the audits walk the real tables - `CommandKind`, the interface sources, an
encoded payload - and each has a test that plants a violation and watches the
audit catch it, because an audit that cannot fail is a comment:

- CommandKind <-> UI issuer (`commandCoupling.spec.ts`): every kind must be
  constructed somewhere under `src/ui`, or sit on a documented allowlist.
  The allowlist is EMPTY, and the audit found two real defects on its first
  run: the demolish tool sent `DemolishRoad` regardless of the tile, so
  `DemolishTrack` and `DemolishBuilding` were unreachable by a player - track
  laid could never be torn up from the map view. The tool now routes by what
  stands on the tile (signal, then track, then building, then road).
- CommandKind <-> parser (`commandCoupling.spec.ts`): a complete sample table,
  typed `Record<keyof typeof CommandKind, Command>` so a new kind is a compile
  error until its sample exists, and every sample must survive
  JSON -> parseCommand -> deep equality.
- Save field <-> hashWorld <-> parser (`saveFieldCoupling.spec.ts`): see
  D-134.

### D-134 The field audit is behavioural, and it forced the digest to cover what it had silently skipped

The Z2 coupling test (save field <-> `hashWorld` <-> parser) does not compare
lists of field names - a list would itself be a second hand-maintained table,
falling behind like the runner's switch did. Instead the audit takes a REAL
encoded payload from a played game, enumerates every leaf it actually
contains, and probes behaviour: delete an object field and the parser must
refuse the save; change any value and either the validator throws or the
reloaded world must hash differently. A field that survives both probes is
state the determinism suite cannot see, and the build goes red unless the
field sits on an allowlist entry that names its reason. A stale entry fails
the audit too. Sections the recorded game had not produced by the audit tick
(a tender, an AI plan, cargo aboard) are given synthetic representatives,
because a section with no representative is a section the audit does not see.

Running it the first time found that `hashWorld` had quietly never covered a
band of serialised state: a vehicle's OWNER, its ORDERS, the tiles of its
PATH (only the length was hashed), its built tick, refit cargo and home
depot; a station's id, name, owner and runway occupancy; a company's
running month revenue and expenses; town and industry ids; module
coordinates; news parameters. Orders alone decide everything a vehicle does -
a save whose order list was corrupted hashed identically to the recorded
game. All of it is hashed now.

Extending the digest changes every world hash, which is a designed-for event
with a written protocol (D-130): the corpus manifest was re-recorded, and the
v23 corpus fixture re-encoded so its embedded digest matches - legitimate
because the regeneration first proved the replayed corpus game bit-identical
to the frozen v22 fixture, and because no released build has ever written a
v23 save (v23 exists only inside this milestone; the shipped M9 installer
writes v22, whose saves carry no digest and are exempt from verification).
The same change on a RELEASED format would instead have been a
`SAVE_VERSION` bump with the old version's digests recorded as unverifiable.

What stays deliberately outside the digest, each with its reason in the
audit's allowlists: the two derived station fields the decoder overwrites
(`acceptedCargo`, `servedIndustries`), the news params RECORD's open key set
on the parser side (the values are hashed), `gameVersion` (container
metadata, D-131), and the command log with its `commandsExecuted` cursor -
history, not state; replay verification judges it, and a digest cannot cover
the log without hashing the past instead of the world.

### D-135 The 1,500-vehicle world is measured, and the ledger's baseline is a number

Every tick-millisecond promise in SPEC2's shared-resource ledger is priced
against "the M10 baseline", and until now that baseline was a linear
projection printed by a 300-bus fixture (D-120). SPEC2's Z6 is explicit that a
promise against an extrapolation is not a promise, so the world section 21
actually names was built and timed: 1024^2 map, 120 towns, 300 industries,
1,500 vehicles - 1,350 buses on 60 town-to-town lines and 150 coal trains (a
locomotive and eight wagons, refitted) on 150 signalled mine-to-plant lines,
in `tests/perf/fixture1500.ts`.

Three things about the method are the decision:

- **Everything is built through commands and every rejection throws** (D-072).
  The map is hand-laid flat grassland in the balance suite's manner (D-038),
  because no generated seed yields 210 working lines and the measurement is
  about the simulation's cost, not the generator's mood.
- **The fixture proves the fleet is WORKING before a single tick is timed**:
  exactly 1,500 alive, zero parked, zero routeless, at most ten stragglers
  still leaving a shed - the parked-fleet trap by assertion instead of by
  comment. In the measured run all 1,500 were out (1,427 driving, 8 braking,
  5 loading, 60 broken down mid-journey - the breakdown rolls are part of the
  cost being measured).
- **The sample window is 6,500 ticks, deliberately longer than a game month**,
  so the daily collection gate fires thirty-two times and the monthly
  production, town and finance hooks at least once inside the percentile.
  2,000 ticks - the old window - can fall entirely between the expensive
  ticks.

Measured on a Ryzen 5 7520U (4 cores/8 threads, 16 GB, Windows 11, Node 24 -
deliberately no stronger than section 21's reference system): **p50 1.452 ms,
p99 3.262 ms, max 39.4 ms** against the 8 ms budget. The save of that world
(0.16 MB compressed - flat terrain compresses absurdly well) writes in 506 ms
and reads back in 596 ms against the 3,000 ms budget; a full game day runs in
325 ms, about a 31x sustained speed multiple.

Consequences: the baseline sits UNDER the ~3-4 ms linear extrapolation, so
the Z6 escalation path (an edge-graph milestone before M14) is NOT triggered
and the ledger's delta budgets stand as written - recorded in SPEC2 6.1.1,
the living acceptance table. The p99 is now ASSERTED at 8 ms (what D-120
refused was asserting the projection; the measurement is exactly what it said
should be held instead). And the old "one day under 500 ms" check - a 20x
promise only a 300-vehicle world could make - is reframed to what section 21
implies at full load: 200 ticks inside the tick budget, with the sustained
multiple in the log.

Asserting the p99 immediately reproduced the D-120 failure mode: inside a
fully parallel `vitest run` on the four-core reference box, the same world
measured p99 8.56 ms - the twenty-five-year AI game and the determinism
replays were running on the neighbouring threads, and a p99 is exactly the
statistic that picks up their scheduling. The simulation was inside its
budget; the MEASUREMENT was not. So `npm test` now runs the perf files after
everything else, serialized (`--no-file-parallelism`), which is measurement
isolation and not a relaxation: the budget stays at section 21's eight
milliseconds, on the fixture, on every full run - it is just no longer asked
to absorb the rest of the suite as noise.

### D-136 The render tripwire is a CPU proxy with generous thresholds, not a frame-rate promise

Section 21's two frame-rate budgets need a GPU and a compositor, and M9
deliberately refused a browser test runner because it would pull PixiJS into
the simulation's test runs. But M12 and M13 are about to spend heavily on the
render path, and a CPU-side render regression - an accidental per-frame
rebuild, a quadratic layer scan - would otherwise surface as "feels slow" on
a machine with a compositor, months after the commit that caused it.

`tests/perf/render.perf.spec.ts` therefore benchmarks the CPU HALF of a
frame, stated openly as a proxy: it replays `MapView.rebuild`'s diagonal
iteration, layer decisions, string frame-cache lookups and draw-order keys,
and `MapView.drawVehicles`' stride reads, height lookups, interpolation and
sort keys - writing into flat arrays where the real code touches Pixi
sprites. What it cannot see (Pixi-internal sprite churn, GPU cost) it does
not claim to guard.

Baseline on the reference machine: a 64x64-tile viewport (roughly a 4K screen
at zoom 1, 7,101 sprites) rebuilds at p99 4.3 ms; a full 1,500-vehicle
snapshot block preps at p99 0.41 ms. The tripwires are set at 25 ms and 5 ms
- six and twelve times the measurement - because a proxy that fails on a busy
CI box teaches people to ignore it (the D-120 lesson), while a regression of
multiples, which is the kind an architecture mistake produces, still trips
them reliably.

### D-137 Cross-OS determinism is a pinned hash, because two machines cannot compare in one process

SPEC2 6.3 requires the determinism job to run on ubuntu as well as windows
from M10 - the first hard evidence that law #4's float discipline is
bit-exact across platforms, not just across runs. The in-process suite cannot
provide that: it compares a run against another run on the SAME box.

The comparison medium is a committed pin, `tests/determinism/fixtures/
canonical-hash.json`: seed 424,242 replaying the recorded road-line fixture
to tick 10,000, world hash `63ae5fd6b5d01190`, recorded under save version 23
on win32/x64. CI runs `npm run test:determinism` on both OSes and both assert
the same pin (`tests/determinism/crossPlatform.spec.ts`); locally,
`npm run test:determinism:cross` is the same comparison on whatever OS it is
invoked on.

D-010 rejected frozen hashes because every milestone legitimately moves them,
and that reasoning stands. This pin is not a golden signal of correctness -
the run-versus-run suite remains that - but a transport medium, maintained
under the corpus-manifest protocol (D-134's precedent): a legitimate sim
change fails the test by name, and deleting the pin, re-running and
committing is the conscious act that approves the new hash. The failure
message distinguishes the two cases explicitly, because the wrong reflex -
re-pinning on a hash that diverged BETWEEN platforms - would delete the one
piece of evidence the job exists to produce.

### D-138 The ledger is an acceptance protocol, and the decision log carries its own index

SPEC2 orders two process artifacts in M10: the shared-resource ledger "led
like the balance-band table", and an indexed register over this file.

The ledger's budgets stay untouched in SPEC2 6.1 - they are commitments, and
editing measurements into a commitment table blurs who promised what. What
was appended is 6.1.1, the acceptance protocol: one row per ACCEPTED
milestone with its measured numbers, date and DECISIONS citation, M10's
baseline row first. The v1 precedent is the balance-band table, whose bands
live in SPEC.md and whose measured column lives with the working notes; a
milestone whose 6.1 row has no 6.1.1 row is not accepted.

The register at the head of this file maps topics to D-numbers and is
hand-maintained - after 138 entries, assigning a topic is judgment, not
parsing. What keeps a hand-maintained index honest is the same device that
keeps the command parser and the i18n files honest: a coupling test.
`tests/unit/decisionsRegister.spec.ts` parses both directions and fails the
build when an entry is missing from the register or the register cites a
number with no entry - so the index can rot in neither direction without
turning the suite red.

### D-139 The crash shelf is scanned at boot, and both actions of the offer retire the bundle

The M10 acceptance sentence asks for one thing D-132 had not yet delivered: a
hard-terminated worker must offer a loadable crash bundle ON THE NEXT START.
The bundle was written to `$APPDATA/crashes/` at crash time and the crash
dialog showed it at crash time - but nothing ever looked at that directory
again, so a player who clicked "restart" without exporting carried the
evidence around invisibly forever.

Now the boot sequence scans the crash shelf once, after the settings load
(language first - the notice is user-visible text). The scan
(`scanStoredCrashBundles` in `src/ui/crashReporter.ts`) is policy over pure
parts in `src/ui/crashBundle.ts` a unit test can hold whole:

- **Newest first comes from the file NAME.** `bugReportFileName` embeds the
  flattened ISO stamp behind a constant prefix and `toISOString` is
  fixed-width, so reverse-lexicographic IS reverse-chronological - no second
  timestamp store to fall out of sync with the bundle's own `writtenAt`.
- **The shelf is pruned to the five newest** (`MAX_STORED_CRASH_BUNDLES`) on
  every scan. Every crash writes a bundle and nothing else deletes them; a
  crash loop without a cap fills a disk with copies of the same autosave.
  Files in the directory that are not crash bundles are neither offered nor
  pruned - they are not ours to delete.
- **A bundle that does not parse is discarded, not offered.** The clause
  promises a LOADABLE bundle; an unparseable file at the head of the shelf
  would otherwise nag on every start while offering nothing. The scan walks
  on to the next-newest bundle that does parse.

The offer itself is a corner card, never a blocker: the crash had its
full-screen moment, and a player who just restarted wants their game back. It
names the crash date and the bundle's version triple, and carries two
actions - the existing export path (`exportCrashBundle`, the same door every
bug report leaves through) and discard. **Both retire the stored file**, which
is what makes "never nags twice for the same crash" structural rather than a
flag to maintain: the next scan cannot re-offer what no longer exists. The
one exception is a CANCELLED export dialog, which keeps both the file and the
offer - cancelling is not answering. Dismissing the newest crash lets the
next-newest surface on a later start: each crash gets exactly one offer,
ever, drained newest first.

The browser is asymmetric by construction and documented as such in
`listCrashBundles`: `writeCrashBundle` hands the bundle over as a download at
crash time because a browser profile has no directory a player could ever
find again (D-132), so there is nothing stored, the scan finds nothing, and
the notice never renders. The offer-on-next-start flow is a desktop feature
not because anything gates it, but because only the desktop keeps anything to
offer.

### D-140 The art source is Kenney's CC0 kits, baked at build time; procedural stays the terrain law and the fallback

An owner directive (2026-08-06, "nutzt kenney.nl für die 3d grafiken")
revises E-14, which until then confirmed pure procedural art. The directive
outranks the document - that is exactly what this file is for - and the
revised E-14 in SPEC2.md section 5 carries the full integration design. The
short form:

- **Source:** Kenney's CC0 3D kits (Train, Car, Watercraft, Pirate, the four
  City kits, Factory, Building, Modular Buildings, Nature). CC0 needs no
  attribution; credits go into README and the credits screen anyway.
- **Mechanism:** the build-time bake SPEC.md 16.2 always described, fed with
  Kenney geometry instead of declarative text. A checked-in TEXT manifest
  (pack URLs, SHA-256, model-to-catalogue mapping, anchor metadata) drives
  `assets:fetch` into a gitignored cache; `assets:bake` rasterises the GLB
  models with a small software rasteriser through the exact dimetric 64x32
  camera into atlas PNGs + JSON per zoom level, eight facings per vehicle,
  company colour via material-named recolour zones. Output is a build
  artifact, never a commit - the no-binary-art-in-git rule and its glob test
  stand unchanged, and the game stays fully offline (fetch is a developer
  step, never game runtime). Determinism is untouched: render assets never
  reach the sim.
- **What stays procedural, permanently:** terrain, track, roads and water
  (they need the season/era REGENERATION of M18/M23 and the sixteen-slope
  corner geometry no kit models), and as gap fillers: aircraft (no Kenney 3D
  aircraft kit exists), industry specials the kits lack (headframe, derrick),
  early-era architecture 1850-1920 where the City kits run out. Every dev
  build without a filled cache starts with procedural art and a warning -
  the game must never refuse to start over a missing download.
- **Explicitly still excluded:** the owner's fal.ai pipeline for the core
  game, in any form.

Lands as stage 0 of M12 (the pipeline) and throughout M13 (vehicles,
buildings, industries). SPEC2.md's M12/M13 sections were amended in the same
commit as this entry.

## M11 - the line backbone, stage A: the order grammar (2026-08-07)

### D-141 A waypoint is a tile layer, not an entity - and it wears a signal post

Section 12.1 gives an order target `{kind:'waypoint', id}`. The id is a TILE
INDEX and the waypoint itself is one byte in a new map layer
(`TileMap.waypoint`, saved and hashed), for three reasons that pull the same
way. Depot orders have addressed their shed by tile index since M2, so the
grammar stays one integer either way and no id counter joins the save. Every
guard that protects built things - the E-11 terraform guard, the demolish
tools, the build validators - already reads the map layers, so a layer is
protected by adding one clause where an entity list would need each guard
taught to scan it. And the interface can enumerate markers from the shared
map buffer it already reads, so no new marker channel is needed.

What a marker becomes is what its tile carries - track wins over road,
because a level crossing is the railway's tile (D-101): a marker post on
rail, a buoy on water, a roadside sign on a road. A buoy CLAIMS its
open-water tile exactly as a station module claims ground; that claim is
what the terraform guard and competing builders read, and demolition hands
the tile back. A marker may stand in a junction where a signal may not:
D-055 is about where a train STOPS, and nothing stops at a marker. A signal
and a marker refuse each other's tile, and the marker falls - with its
refund - when the way under it is pulled up.

One thing a waypoint does NOT do: interrupt the leg measurement. The
arrival-to-arrival clock of D-077 runs across it, so a line detoured through
a marker measures honestly slower, which is the point of forcing the route.
A vehicle DOES brake to a stand at its marker - passing through at speed
would need route legs concatenated across orders, and a two-second pause is
not worth a second routing model. Drawn as the existing signal post under a
per-mode tint, because M11's atlas budget in the SPEC2 6.2 ledger is zero
cells and a tint costs none.

### D-142 The order grammar: conditions guard the order they sit on, at stops only

Section 12.1 says "wenn <X> <Vergleich> <Wert> dann springe zu Auftrag N"
and no more. The reading implemented: a condition is evaluated when its
order is about to BECOME current, at a stop - never per tick (hot-path law).
An order whose condition holds is not run; the vehicle jumps to the target
instead, asks the landed-on order the same question, and a chain of true
conditions is cut at `MAX_ORDER_JUMPS_PER_STOP`, after which the vehicle
simply runs the order it stands on. This makes both of the section's own
examples one order each: a depot with "reliability > 60 jump past me" is a
round trip that self-schedules, and a stop with "load < 50 jump to the
short loop" is a peak-hour diversion. Jump targets are range-checked when
the orders are SET (`BadJumpTarget`), so the runtime modulo is belt and
braces, not policy.

The five measures and their units, spelled once: load as a share of
capacity (0..100), reliability in percent (0..100), age in whole game
years, waiting time in whole game days since arrival at the current stop,
and the calendar year. Whole units for the calendar-ish three because an
equality comparator against fractional years could never fire.

The rest of the grammar, and the rules under it:

* **`waitTicks`** stretches a stop, never shortens it: the dwell is
  `max(minimum stop, loading time, waitTicks)`, and it holds at waypoints
  and depots too.
* **`refitTo`** runs between unloading and loading, only when the vehicle is
  genuinely empty, through the same capacity-and-price arithmetic as the
  depot command - `vehicles/refit.ts` is that arithmetic said once, and the
  order validator refuses at SET time a cargo the vehicle can never carry.
  A refit the owner cannot afford is skipped silently and the schedule runs
  on: a stranded vehicle would be a worse answer than an old cargo, the
  D-093 posture. Booked to the OWNER, not the acting company - this runs in
  the tick, outside any command (the D-100 trap, avoided).
* **`nur_transfer`** puts EVERYTHING down as a transfer, a parcel at its own
  destination included - the feeder mode. **`erzwungen`** delivers what
  belongs here and dumps the rest. Both override the D-078 disposition, and
  neither can be ridden for money: the LOADING rule is untouched, so
  nothing gets aboard that is not being carried closer, and a forced
  set-down pays only the leg genuinely ridden.
* **`voll_beliebig`** waits exactly as `voll` does, stated openly: a vehicle
  in this game carries one cargo at a time, so "full of anything" and
  "full" are the same condition until multi-cargo consists exist. The mode
  is real in the grammar, the save and the editor, so the player's intent
  survives; only the waiting rule collapses.

Every new field is hashed, which moved every world hash: the canonical
cross-OS pin was re-recorded under the D-137 protocol (v24, seed 424,242,
tick 10,000: `822b75d3abbd41d0`), and the corpus manifest under the D-130
protocol - where the regeneration itself proved the v22, v23 and v24
fixtures decode to ONE identical hash, which is the migration shown to be
defaults-only. Determinism fixtures exercise every option:
`order-grammar-commands.json` runs both waypoint commands, all four load
and unload modes, a per-order refit, a dwell and one jump of every
condition kind through the shared parser.

### D-143 A depot order is a service call, not a terminus

Until M11 a vehicle reaching a depot order went `InDepot` and stayed there
until the player restarted it - the state was terminal, and the depot round
trips section 12.1 builds its conditional jumps for could not exist. Now a
vehicle in a shed dwells and runs on to its next order; the service of
section 11.3 happens on arrival exactly as before. Two deliberate edges:
a vehicle whose ONLY order is the depot still parks, because there is
nowhere to run on to and "park in the shed" is a thing players do on
purpose; and stopping a vehicle by command still parks it wherever it is.
This changes what an old save's schedule does - a vehicle standing InDepot
with more orders leaves on load - and that is the feature, not a casualty:
the order list was always a cycle, and a cycle with a permanent stop in it
was the defect.

### D-144 A migrated save's digest is recorded, never judged

Found by the corpus the moment v24 existed: the v23 fixture carries a
digest computed by the v23 build's `hashWorld` over the v23 state, and
decodeSave verified it against TODAY'S hash of the MIGRATED world - so the
first migration that touched hashed state (M11's) would have refused every
healthy digest-carrying old save as corrupt, for ever, on every future
milestone. The fix is D-131's version-pinning argument applied to the
digest: a fingerprint is evidence about the exact bytes the writing build
hashed, under that build's hash function, and a migrated save has neither
any more. Verification therefore runs only when the save's format version
IS the current one; an older save's digest rides along unverified - exactly
the standing of the v22 empty string - and the next write records a fresh
one. Re-hashing at migration time was rejected in D-130 already: a digest
the migration invented would make every later verification a tautology.
What is genuinely given up is bit-rot detection on old-format files; what
is kept is every corruption check on the format the game actually writes,
which is the case the `.bak` machinery exists for.

## M11 - the line backbone, stage B: the line entity (2026-08-07)

### D-145 A line is a shared order list a vehicle points at, and nothing else

Section 12.2 says vehicles are assigned to lines, a line edit reaches all of
them, and the line overview shows statistics. The entity built for that is
deliberately minimal: `LineStore` (struct of arrays, `MAX_LINES` in
constants.ts) holds per line an owner, the auto-renewal flag and the shared
order list - and NO vehicle list and NO statistics. Which vehicles run a
line is answered by scanning the fleet for `lineId`, and every figure the
panel shows is recomputed from the stores when asked (`lines/metrics.ts`) -
the M6 rule, chosen here for the same reason as there: a cached membership
list would need correcting from every sell, renewal and winding-up, and any
drift would be invisible until a save was reloaded.

The mechanism that makes "an edit reaches every vehicle in the same tick"
true is that there is no mechanism: `scheduleOf(world, id)` returns the
LINE's array for an assigned vehicle and the private one otherwise, and it
is the single read path for schedules - the state machine, the routing rule
of D-078, the link graph, the renewal, the AI and the fleet markers all go
through it. The moment `SetLineOrders` replaces the array, every reader is
already looking at the new list; nothing propagates because nothing is
copied. Three consequences are the semantics, each tested:

* **Re-anchoring.** A vehicle whose schedule is replaced under it anchors on
  the entry of the NEW list whose target lies nearest to where it stands
  (straight line over tile coordinates, a station measured at its centre),
  ties to the LOWER index - a total order. Its route, claims and the leg in
  progress are dropped (the time either side of an edit measures nothing,
  D-077), and it repaths exactly as an edited private schedule always has.
* **Release copies.** A released vehicle - and every vehicle of a deleted
  line - keeps a private COPY of the list and its position in it, so nothing
  about its journey changes; the next edit simply no longer reaches it.
* **A private edit detaches.** `SetVehicleOrders` on an assigned vehicle
  takes it off its line first. Two authors of one schedule would mean asking
  which list wins at every stop; the explicit edit is the answer.

Save and hash: only the LIVING lines travel, with their ids, and the store
reuses the LOWEST dead slot rather than a first-freed queue - that makes the
next id a pure function of the alive bitmap, so a reloaded world allocates
exactly the id the unsaved one would have without serialising a free list.
(The vehicle store's FIFO free list does not have this property; its holes
are not reconstructed on load either, which is a pre-existing latent hazard
noted here and left alone.) Every new field is hashed - the line section,
`lineId` per vehicle, and the D-134 audit holds all of it via a synthetic
line representative. The hash change re-recorded the canonical cross-OS pin
under the D-137 protocol (v24, seed 424,242, tick 10,000:
`9e282ad7b7244c75`) and the corpus manifest under D-130 - the regeneration
proving again that the v22, v23 and v24 fixtures decode to ONE identical
hash (`7abe526eb9e027f8`), i.e. the extended migration stays defaults-only
for a lineless save. Determinism fixture `line-commands.json` replays all
five line commands through the shared parser, edits the list mid-drive and
releases a vehicle, across a mid-run save/load.

### D-146 Auto-renewal moved onto the line, and the old command still parses

D-093 parked section 11.3's per-line renewal switch on the company because
lines did not exist; M11 stage B ends the loan. `CompanyState.autoRenew` is
gone - from the type, the save, the hash and the finance report - and the
flag lives on the line, where `renewFleet` reads it: a vehicle that runs no
line is never renewed automatically, because there is no flag anywhere that
could say so. Still zero randomness, still the total-order successor.

`SetAutoRenew` keeps its command KIND and gains a `lineId`, absent on the
wire in every pre-M11 log. Absent parses to -1, and -1 means "every line the
acting company owns" - a bulk setter that is a quiet success even with zero
lines. That reading is what keeps two constitutional promises at once: an
old save's command log still PARSES (a deleted kind would make the file
unloadable), and the recorded road-line fixture still replays its
`SetAutoRenew` without a rejection. The migration maps the old company flag
onto the lines it migrates for that company (an AI's, see D-147); a PLAYER's
flag lapses, because a player could not have lines and there is nothing to
attach it to - stated here as the honest reading rather than hidden: the
switch reappears per line the moment vehicles run one.

Rewriting `renewFleet` surfaced a real bug worth its own sentence: the old
code addressed the replacement as `vehicles.count - 1`, but the store reuses
freed slots FIFO, so the fresh vehicle usually lands exactly in the slot the
sold one vacated - `count - 1` was only ever right for the newest vehicle of
a company, which the single-vehicle renewal test happened to be. In a
multi-vehicle fleet the orders and refit went to an unrelated vehicle. The
replacement is now found as the vehicle BUILT THIS TICK at that shed, and it
inherits the line assignment, anchored at the depot it stands in.

### D-147 The AI runs real lines now, and remembers only its judgement

E-06 executed: `AiState.lines` is deleted - the acceptance grep finds zero
hits - and a competitor's line is the Line entity of section 12.2, opened
with `CreateLine`, scheduled with `SetLineOrders`, crewed with
`AssignVehicleToLine` and closed with `DeleteLine`: the exact commands the
player's panel sends, through the same queue, refused for the same reasons.

The project machinery gained one cycle (four instead of D-108's three): the
line id a `CreateLine` will produce cannot be known while the command is
queued, so the cycle after the vehicles arrive opens the line, and the cycle
after that OBSERVES it - the one empty line this company owns, lowest id -
and gives it the schedule and the crew. Reinforcements and reviews read the
line's composition back off the fleet that runs it (first vehicle's consist,
cargo and home depot - the M6 rule applied to the AI's own memory), so the
old `AiLine` fields describing the fleet are simply gone.

What could NOT be recomputed is the review baseline - "what had this line
earned when I last looked" is a historical input to a sim decision and
therefore save state (Z4). It survives as `AiState.reviews`, a list of
`{lineId, reviewTick, earnedAtReviewCt}` referencing the entity by id
(law #9). That is deliberately not a second line entity: it describes the
AI's opinion, not the line. The migration turns each old `AiLine` into a
real entity (order list taken from its first vehicle, vehicles assigned,
review carried over, a reinforcement project's index translated to the
entity id) so a mid-project old save resumes exactly where it was.

Measured on the M8 acceptance run (25 years, seed 4,711): the suite stays
green end to end - the road personality finishes with 3 lines, 5 vehicles
and about 522,000 company value. That is below the 973,000 D-122 recorded,
and the difference predates this stage only in part: stage A's D-143 (depot
orders run on) and this stage's honest per-vehicle upkeep in the line
review both moved it. The number is stage C's problem by design - E-06's
fleet-sizing formula is what makes scenario 5 reachable, and it lands there.

### D-148 L opens the line list, the station list moves to H, and an estimate says so

Section 17.2 always gave L to the lines; D-114 lent it to the station list
"because lines do not exist". They do now, so L opens the line list (the
generic ListPanel with utilisation, profit per year and mean round time as
sortable columns) and the station list moves to H - the nearest free letter
with a mnemonic in German ("Haltestellen"), recorded in the one keymap table
both the handler and the options screen read.

The line detail shows stops with waiting cargo, the crew, the per-line
renewal switch, and the shared order editor - the SAME editor component the
fleet panel uses for private schedules, so the two grammars cannot drift; a
vehicle on a line shows its membership instead of an editor, because its
schedule is the line's. The mean round time is the sum of the D-077 leg
means around the cycle - THE single round-time source, no second
measurement - and while any leg is still the straight-line 54 km/h seed the
figure is prefixed `~` with a sentence naming it an estimate: a guess
wearing a measurement's face would be the panel lying about the one number
takt planning (stage C) will hang off. The snapshot gained `lineId` per
vehicle - M11's one layout bump (version 6) - so map-side highlighting of a
line's vehicles never needs a marker round trip.

## M11 - the line backbone, stage C1: takt and connection protection (2026-08-07)

### D-149 A line has ONE takt point - its first station order - and the grid is pure arithmetic

Section 12.3 gives a line a takt and a start offset, and has vehicles wait
"an definierten Taktpunkten bis zur Sollabfahrt". What defines the takt
point here is the SCHEDULE: it is the line's first station order - its
Startbahnhof - and only that stop, deliberately. A grid enforced at every
stop quantises every LEG up to a whole takt: measured on the two-train
fixture, legs of 19 and 27 days against a 22-day takt need 1 + 2 = three
takts per round, and the stations then see service at alternating [T, 2T]
gaps - the timetable making regularity WORSE. Anchored once, the round
rounds up once, departures leave the anchor every takt, and every later
stop inherits that spacing shifted by the measured legs - which is what a
clock-face timetable is. Waypoints, depots and open line are never takt
points (E-07: a vehicle waits standing at its platform, or not at all).

The mechanics, and the three rules under them:

* **The slot is latched at ARRIVAL, by integer arithmetic, zero randomness**
  (E-07): the first grid point `offset + n*takt` at or after the arrival
  tick that no other vehicle of the line standing at the station has
  latched. That skip rule is the de-bunching: a bunched pair's second
  arrival finds the slot taken and is pushed one takt out, and from then on
  the two run half a cycle apart. Slot arithmetic runs at the stop event
  only; the per-tick share of a wait is one integer compare in its state
  case (`WaitingForSlot`, hot-path law #7).
* **A late vehicle slips to the next free slot rather than bolting
  off-grid.** Departing immediately was tried first and produced exactly
  the irregularity the takt exists to remove: phases only re-sort when two
  vehicles stand at the anchor together, so one late round pushed the pair
  into [10, 42]-day gaps that never re-converged. The recorded delay - what
  the line panel shows as "Verspätung in Spieltagen" per vehicle - is the
  slip to the slot actually taken, in whole takts; a vehicle that made its
  slot shows zero.
* **The takt is LINE data, not a world rule.** `SetLineTakt` validates and
  writes it exactly as `SetLineOrders` writes the order list; switching a
  takt off releases every waiting vehicle within a tick, because the wait
  states re-read the line every tick rather than trusting the latch.

Saved state (Z4): `taktTicks`/`taktOffsetTicks` per line, and per vehicle
the latched `taktDueTick`, the `connectionDeadlineTick` of D-150 and the
displayed `taktDelayTicks` - all serialised, all hashed, all covered by the
D-134 field audit, with `WaitingForSlot`/`WaitingForConnection` as saved
states of the 11.4 automaton. The v24 migration (same bump, Z5) defaults
them to "no takt, nothing latched, not late", which is provably inert: the
corpus regeneration decoded the v22, v23 and v24 fixtures to ONE identical
hash again (`7abe526eb9e027f8`). The hash change re-recorded the canonical
cross-OS pin under the D-137 protocol (v24, seed 424,242, tick 10,000:
`62776cfa408a92bc`). The fleet advisor formula of 12.3 -
`ceil(round / takt)`, with the leftover as headroom - lives ONCE, in
`lines/metrics.ts` (`adviseFleet`); the panel displays it and stage C2's AI
will call the same function (E-06).

### D-150 The transfer node is a station mark; the waiting graph is derived, and a waiter provably never blocks its connector

Section 12.3, verbatim: "An als 'Umsteigeknoten' markierten STATIONEN
wartet ein Fahrzeug bis zu X Ticks auf ein anderes derselben Gruppe." The
mark is therefore per STATION - `SetTransferNode`, owner only, saved and
hashed - not per line stop: the section marks places where lines meet, and
one flag serves every line calling there. What the section leaves open is
answered as follows, in the per-line spirit of 12.3:

* **The group** is the same owner's OTHER lines: a departure holds for a
  vehicle that is assigned to a different line of the same company and is
  genuinely INBOUND - under way with this station as its current order.
  Private schedules connect to nothing: the group notion of 12.3 is a line
  notion.
* **The hold is part of the line's timetable feature**: a vehicle holds for
  connections only while its line runs a takt, because every clause of 12.3
  is "optional pro Linie aktivierbar" and the takt IS that switch.
* **The hard cap** is `CONNECTION_WAIT_MAX_TICKS` (two game days), latched
  as a deadline at the stop; an arriving connector of the group expires the
  deadline early, so the waiter runs its ordinary departure - slot wait
  included - on its next step. Release-by-expiry rather than a state
  rewrite keeps the arrival handler free of second-hand state machines.

The waiting graph is DERIVED (D-054 pattern): an edge "A waits for B"
exists only as a function of current state - A holding at a marked station,
B inbound to it - and is rebuilt wherever it is asked, never saved. It is
acyclic BY CONSTRUCTION: only a standing vehicle waits, only a moving one
is waited for, and a moving vehicle waits for nobody - so every edge points
from standing to moving and no walk returns. The cycle guard demanded by
the section exists anyway (`reachesSelf`, iterative with an explicit stack,
law #8), runs before any hold begins, and a planted cyclic adjacency in the
unit test proves it fires - because the acyclicity argument holds only
until somebody widens what "inbound" means, and a guard that cannot be
exercised is a comment.

The Fertig-wenn property - a waiting vehicle never blocks the vehicle it
waits for - is structural: a vehicle standing at a station holds NO track
reservations (its route ended, `releaseAll` ran), so nothing it does can
exclude an arriving train even from the single platform it is standing on.
The test named by the milestone builds that exact worst case - a one-
platform transfer station, the waiter's train standing on it - and watches
the connector arrive, serve, and release the hold before the cap; two
companion tests hold the cap when no connector ever comes and the refusal
to hold when nothing is inbound.

### D-151 What the takt band measured, what it caught, and the honest residue

SPEC2 M11's band: a takted two-train line earns within +-10 % of an
untakted identical line and HALVES the station-rating variance. Building
the measurement (`tests/balance/taktLine.spec.ts`) surfaced three real
defects and one design truth, in that order:

* **`LINK_SAMPLE_MAX_TICKS` silently made every leg beyond ~25 tiles
  unmeasurable.** The M5 outlier guard stood at ten game days, and a leg
  sample above it was discarded - so scenario 2's own coal line ran on the
  54 km/h straight-line seed for ever, `roundMeasured` never came true, and
  the "gemessene Umlaufzeit" the 12.3 advisor divides by could not exist.
  Raised to a quarter game year: the interruption filter (D-077's cleared
  arrival clock) already handles stops and order changes, and a leg slower
  than three times the cargo-expiry horizon needs a different line, not an
  honest mean.
* **A naive single-track two-train fixture measures standoffs, not
  timetables.** Two trains meeting head-on spent 38 % of the run in
  `WaitingForPath`; that noise dominated every rating statistic in both
  runs. The fixture became the railway a two-train line actually needs -
  a one-way oval laid by the 9.4 auto-signalling - the D-082 lesson
  verbatim.
* **Off-grid late departures churn the phase lock** - fixed in the
  mechanics themselves (the slip rule of D-149).

The design truth: takt slack spent at the LOADING end rides aboard - the
cargo ages a whole slot-wait before it departs, which alone measured a
-14.5 % earnings drift. Anchoring the takt at the DELIVERY terminus, where
the train waits empty, restored the band; the fixture pins that playbook
("Startbahnhof = leerer Endbahnhof") and the handbook owes it a sentence.

Measured and banded (four years, headroom three days - below the round's
own +-3-day jitter the phase lock churns, above it the cadence loss eats
the earnings band): earnings -8.3 % (band +-10 %), takt-point departure-gap
variance 0.46 of untakted (band <= 0.5), delivery-station rating variance
0.57 (band <= 0.6), origin station 1.06 (band <= 1.1). Two deviations from
the SPEC2 sentence, stated rather than papered over: the delivery station
reaches 0.57, not 0.5 - the residue is the phase disturbance the round's
own jitter forces through any finite slack - and the ORIGIN station's
variance is its cargo-age sawtooth, which is set by visit CADENCE; a
timetable on a FIXED fleet cannot shorten a cadence, only a bigger fleet
can, so "halved" is not reachable there by any takt at all. If a later
milestone wants the full halving, the levers are known: per-stop offsets
instead of one anchor, or a stop model that loads at departure instead of
arrival - both real redesigns of 11.4/12.1 machinery, neither smuggled in
here.

## M11 - the line backbone, stage C2: the AI fleet and the honest scenario-5 verdict (2026-08-07)

### D-152 The AI sizes its fleet with the advisor, and the takt is for de-bunching trains - never for pacing roads

E-06 executed: `AI_VEHICLES_PER_LINE = 1` is gone, and a competitor sizes
every new fleet with literally the exported `adviseFleet` of 12.3. The
call feeds the DEMAND interval (how often a departure planned
`AI_TAKT_UTILISATION` full must leave to lift what the source makes in a
month, floored at one a day, `AI_SERVICE_INTERVAL_MIN_TICKS`), which is
what sizes the fleet; the divisor is the REAL round, estimated as the
nominal straight-line round over `AI_LIFT_REAL_SHARE` = 0.5, the measured
ratio between the two (14 nominal days against 27-29 driven on a 25-tile
line). Each later stage re-derives the figure from what actually exists
(D-108): the stations' real distance, their catchments' real monthly
output, the railway that was really laid.

What the month-by-month trace (D-109/D-121's method - this stage's
plausible first diagnoses were wrong too) then established about the takt:

* **The takt must be the fleet's own spacing, `realRound / crew`, never
  the demand interval.** The demand interval was fed to `SetLineTakt`
  first, and it strangled every small line: a thirty-day takt on a fleet
  whose natural cadence was eighteen days THROTTLED it to one departure a
  month, the pile never aged below a month, and oldest-first loading
  served every passenger at the 10 % decay floor - 255 EUR in five
  months, closed by its own review.
* **Only a RAILWAY with two trains gets a takt at all.** The two-train
  oval is the shape the takt fixture proved, and the grid is what holds
  the second train half a cycle behind the first. On ROAD lines the slot
  idle costs more than the bunching it removes at every fleet size the
  cap allows: with a takt, every measured bus line had one to four
  vehicles in WaitingForSlot at any moment and earned five to ten percent
  of scenario 1's own untakted per-vehicle rate on the same shape. The
  road de-buncher is the D-074 stop queue itself. A lone vehicle never
  gets a takt - it has nothing to de-bunch, and a grid built from the
  ESTIMATED round only makes it stand out the estimate's error at the
  anchor every lap.

Three gates keep the sizing from being fed nonsense, all measured on the
scenario-5 trace (512 map, seed 4711):

* **A pair is offered only if a FRESH load survives the drive**
  (`AI_MIN_ARRIVAL_FACTOR` - a feasibility gate, NOT the D-122 pricing
  term that was tried and reverted; that verdict stands). The old top
  road candidate was a 123-tile grain haul arriving at 0.46 of its value.
* **A decaying source must be OUT-lifted, not matched**
  (`AI_DRAIN_MARGIN`): a six-bus line whose real lift sat two percent
  over the town's deposits ran for ever against a pile pinned at thirty
  days of age. The rot gate's lift figure uses the REAL capacity of the
  vehicle the builder will pick and the real-round share - and no
  utilisation discount: utilisation is a sizing headroom, and multiplying
  it into the gate priced the largest fleet at a quarter of its physical
  lift and left the road company two candidate pairs on a forty-town map.
* **A pair with own stations at BOTH ends is never a new line.** Living
  stations mean reinforcement's job; DEAD stations are the graveyard of a
  line the review closed, and they are deliberately the AI's "do not
  return" memory - scanning only living lines' stations was tried, and
  the review-close/rebuild loop it opened burned about 20,000 EUR per
  cycle on the same doomed pair for ever. The standing stations cost
  nothing extra to remember (Z4 satisfied by the map itself).

The road personality also collects TOWN pairs now (section 15 step 1 says
"alle Paare"; the 1950 lorry catalogue carries only bulk, and industry
pairs alone left it ONE candidate on the whole map), its passenger output
expectation is the honest `AI_TOWN_OUTPUT_SHARE` = 0.18 derived from the
real deposit constants rather than the old generous 0.5, and a new line's
schedule is SYMMETRIC (both stops load partial, both unload all) with the
DELIVERY end as the first station order - the D-151 playbook applied to
the AI's own lines. A failed scan now also arms the `AI_RETRY_TICKS`
backoff: the scan dry-plans up to sixty candidates with the real route
search, and without the backoff it ran every four hundred ticks for
twenty-five game years and tripled the acceptance run's wall time.

### D-153 The AI railway is an oval where the terrain allows one, single track with ONE train everywhere else - and the shape is save state

Stage C2's mandate was D-082-shaped AI railways, and the shape exists:
`planRailOval` lays the takt fixture's railway verbatim - two straight
parallel one-way rows joined at both ends, platforms on the outbound row,
the shed on a stub off the return row that MERGES rather than crosses,
one-way signals along the direction of travel every `AI_SIGNAL_SPACING`
tiles, connectors and stub left unsignalled (D-055). Two trains circulate
and never meet head on.

Measured on real generated terrain, the oval almost never fits, for three
separate reasons the debug trace itemised per tile: the corridor rows
through the stop anchors cross the INDUSTRY FOOTPRINTS themselves; a
dead-straight row violates the D-042 gradient window on almost any relief
(`planTrack ok false/false` on every cleared candidate row); and a
diagonal pair cannot be served by any straight corridor at all, because
no row lies within catchment reach of both ends. L-shaped and free-form
ovals were tried in an earlier iteration and refused every candidate too.
An oval-only rail branch therefore built NOTHING - the rail personality
never laid a tile in twenty-five years - which is strictly worse than the
D-115 single line it replaced.

So the fallback IS the D-115 shape: the assistant-planned single line
(hills routed around, not refused), platforms one tile in from each end,
the shed in line on the first tile, no signals - and exactly ONE train,
because a second on single track meets the first nose to nose and
deadlocks (D-059). Which shape got built cannot be recomputed from the
map once the tracks are down, and the stage that buys runs a cycle later
- a historical input to a sim decision, so it is save state (Z4):
`AiProject.railTrains`, absent in every pre-C2 save and parsed to 1 (the
D-146 wire pattern), hashed in `hashWorld`, covered by the D-134 audit's
synthetic project representative. The v24 pins did NOT move: the
canonical cross-OS world (D-137) and the corpus game (D-130) both run
without AI companies, so neither hash contains an `AiProject` - verified
by the green determinism and corpus suites, not asserted from the
armchair. A railway is also never REINFORCED: the safe cap for a shape
the optimiser can no longer see is the fleet that was sized at build
time.

### D-154 A build plan is proven before any money moves, and a borrower builds in the same command batch

Two funding defects, both found because the rail personality finally had
plans expensive enough to trip them:

* **The loan-churn deadlock.** "Borrow now, build next cycle" composed
  with D-109's repayment rule ("repay as soon as the debt is covered with
  a reserve to spare") into a perfect standstill: the borrowed cash lay
  idle at the very next decision, the repayment rule paid it straight
  back, and the retry backoff then allowed the next loan. Measured on
  seed 3: the rail company borrowed and repaid three hundred thousand
  every six thousand ticks for twenty-five game years and never laid a
  tile. A borrowing competitor now enqueues the loan and the whole build
  in ONE command batch - the loan is first in the queue, so the money has
  landed by the time the first build command bills, and by the next
  decision the cash is in rails, where the repayment rule cannot reach
  it.
* **The road the AI orders is now FOUND first.** `BuildRoad` lays an L
  and rejects the whole command on the first blocked tile - right for a
  player who sees the lake, fatal for an AI that does not: every
  town-to-town road of the measured road company was refused, the stops
  and buses were bought anyway, and six lines in a row sat in KEIN_WEG
  through their whole review period. `planRoadRuns` walks a breadth-first
  search (iterative, fixed neighbour order, law #8) over passable tiles
  inside the corridor box inflated by `AI_ROAD_DETOUR_MARGIN` and returns
  maximal straight runs, each of which one BuildRoad lays exactly. The
  whole plan - rail or road - is additionally dry-planned into a scratch
  queue before the affordability check, so a loan is never taken for a
  line that cannot exist.

### D-155 A renewed fleet is not a failing line: the successor finder takes each replacement once, and the review re-anchors on turnover

Stage C2 turns per-line auto-renewal ON for every AI line at creation
(section 11.3, D-146) - the audit finding this closes is an AI fleet
ageing into doubled upkeep for ever, because nobody at an AI company ever
pressed the switch the player has. Enabling it exposed two defects,
measured at month 252 of the twenty-five-year road run, where the best
line of the game - six lorries, 5,000 EUR a month - hit its design life:

* **All six renewals adopted the SAME successor.** A fleet bought in one
  tick renews in one tick, and the fresh-vehicle finder ("built this tick
  at that shed", D-146) found the first replacement again for every
  renewal after the first: six successors paid for, one crewed, five
  standing orphaned in the shed. The finder now skips a candidate that
  already runs a line; `renewal.spec.ts` renews a three-vehicle fleet in
  one tick and asserts every successor is on the line.
* **The review then closed the thriving line.** Section 15's judgement is
  "earned SINCE the last look", and the lifetime meters of a replaced
  fleet restart at zero - so the gained figure went hugely negative and
  the verdict was "unprofitable" one month after a renewal that had
  drained the pile and pushed the station to rating 86. A negative gain
  is impossible for a stable fleet (earnings only accumulate), so it now
  RELIABLY means turnover: the baseline is re-anchored on the new fleet
  and the verdict waits one review period, exactly as for a new line.

With both fixes the renewed line runs straight through: the measured run
compounds through its year-twenty renewal instead of crashing forty
percent of the company's value in two months.

### D-156 Scenario 5 stays out of the suite, measured at a fifth of the band floor, and the next bottleneck has a name

The stage's mandate was to put balancing scenario 5 into the suite at
5-25 million; the honest measured verdict is that it cannot be, and this
entry extends D-116's reasoning: a red band nobody can act on is not a
specification. What twenty-five simulated years on the 512 map now
measure, month by month, per personality:

* **Road (seed 4711): 1,120,000 EUR, solvent, compounding** - from
  433,000 and stalled before this stage's fixes. It builds sized fleets,
  runs them untakted, survives its year-twenty renewal, and is still
  growing at year twenty-five (about +110,000 EUR a year). A fifth of
  the band floor.
* **Rail (seed 3) and Expansive (seed 2): wound up** in 1959 and 1967.
  Not for want of building - the rail company now borrows, lays its
  26-tile line, and earns 10,000 EUR in its first two months, ON PACE
  for the band - but its train then breaks down on the final approach
  and never arrives again.

The bottleneck has a precise signature, watched tick by tick: a train
forced to a dead stop with its nose at the last path boundary
(`routeRemainingM - progressM = 0`, `pathIndex` two short of
`pathLength`) oscillates Braking/Driving at speed ~0 for ever - arrival
requires crossing the boundary, the brake curve targets exactly it, and
a train that stopped ON the target (a mid-brake breakdown does this
reliably) creeps past it by nothing. Every single-train railway dies of
it within months; it is a vehicles/update.ts state-machine defect, not
an AI defect, it predates this stage (D-121's "two deliveries in six
months" carries the same signature), and it is the named next step -
along with the second observation that a passenger pile a fleet merely
matches pays the decay floor for ever, which is what keeps even healthy
bus lines an order of magnitude below what the band assumes.

`aiGame.spec.ts` is hardened as far as the measured state honestly
allows: the solvent count and per-personality value floors are ASSERTED
instead of narrated (measured on the 256 map, seed 4711: road solvent at
545,000 EUR with a six-vehicle line, rail alive at -15,000 EUR, the town
network wound up at 97,000 EUR), pinned under the measured run so a
regression of the kind this stage fixed - a personality that stops
building, a renewal that eats a company - goes red by name. The 25-year
world is built once and shared across the file, which with the D-152
scan backoff takes the file from ten minutes back to about seventy
seconds.

## M11 - the arrival-gate freeze (2026-08-07)

### D-157 The last path boundary is where the remaining-distance accumulator runs out, not where a recomputed step says it is

D-156's named bottleneck, reproduced, mechanised and fixed. The
reproduction first (the method of D-109/D-121 - this file's history holds
two plausible diagnoses that were wrong, so the signature was measured
before any code moved): a railbus on a 31-node route whose last ten steps
are diagonal, a breakdown written mid-brake exactly as `rollBreakdowns`
writes it, scanned over 300 breakdown timings. One offset froze for ever
and carried D-156's signature to the digit: state Braking, speed 0,
`routeRemainingM - progressM` printing as 0 (actually -3.05e-5),
`pathIndex` 29 of 31 - two short of `pathLength`, for ever.

The mechanism is D-043's twin, one storage class down. `routeRemainingM`
is a Float32 fed by repeated subtraction of float64 step lengths, so on
any route that mixes 50 m and 70.71 m steps it drifts a few float ulps
per tile crossed - measured 6.1e-5 m short of the exact final step on the
31-node bench, and the drift grows with route length (centimetres on the
eighty-tile lines of D-121). The arrival brake targets exactly
`routeRemainingM - progressM = 0`; the tile-advance gate compared
`progressM` against the freshly recomputed float64 `pathStepM`. Between
the two numbers lies a sliver, and a vehicle at a dead stop inside it has
`remaining <= 0` - so the state machine holds it in Braking, Braking cuts
traction, speed stays zero, and nothing ever moves again. D-043's promise
that "the two quantities are the same arithmetic and cannot disagree"
held in float64 and was broken by the Float32 store. The mid-brake
breakdown produces the landing reliably because the post-repair approach
ends in a creep that crosses the target in accel*dt^2-sized quanta -
millimetres for a railbus, and the heavier the train the smaller the
quantum and the surer the landing; every arrival without a breakdown
samples the same sliver at rolling speed and mostly clears it, which is
why the defect presented as months-scale attrition rather than a red
test.

The fix makes the two numbers one: in the tile-advance loop the FINAL
step's crossing threshold - and the amount subtracted on crossing - is
`routeRemainingM` itself. The brake target and the arrival gate are now
the same Float32 by construction, the sliver cannot exist, and
`routeRemainingM` ends the route at exactly zero. Intermediate boundaries
keep the recomputed step: nothing brakes to a target ON them (a signal
stop stands `SIGNAL_STOP_OFFSET_M` short), and their thresholds must stay
in step with the same `pathStepM` the reservations walk. The gate is in
the mode-shared Driving/Braking case, so rail, road, water and air are
all covered by the one change; roads alone cannot drift (4-directional,
every step exactly 50 m, float-exact in a Float32) and get the contract
test anyway. No state shape changed and no SAVE_VERSION moved (Z5): a
save frozen mid-defect heals on its first tick after loading.

The deadlock clock was blind to the frozen train, and that is the D-083
lesson finishing its arc: the freeze stands at speed zero HOLDING its
whole approach - `reservedToIndex` ahead of `pathIndex` - so the "holds
nothing beyond its own body" test read it as fine, exactly as the
boundary-only test of D-083 once read four shedbound trains as fine. The
stall test is now "standing still mid-route, whatever it holds"; the
end-of-route rollout is excluded, so the tick a train slows into its
arrival is the tick the clock clears rather than the start of a false
count through the station dwell (the old test could leave a stale clock
set on the arrival tick, which a long full-load wait would eventually
have turned into a phantom "train stuck" alarm).

The v24 pins did NOT move, verified by the green suites rather than
asserted from the armchair: the canonical cross-OS world (D-137) replays
the ROAD fixture - no trains, float-exact 50 m steps, bit-identical
behaviour before and after - and the corpus manifest (D-130) re-verified
unchanged. The determinism fixtures assert cross-run and save/load
equality, which the fix preserves; had a pinned hash contained a train
mid-approach, re-recording under the documented protocol would have been
the correct and expected act.

`tests/unit/finalApproach.spec.ts` pins all of it: the dead stop exactly
ON the brake target for a train and for an aircraft, the measured
freezing breakdown offset, the widened clock, and the bus contract run -
four of the five fail on the unfixed code. This closes the FIRST of
D-156's two named walls; the second (a passenger pile a fleet merely
matches pays the decay floor for ever) stands, and scenario 5 stays out
of the suite until the AI runs are measured again against the band.

## M11 - closure: scenario 5 on the measured band, the takt's variance floor (2026-08-07)

### D-158 Scenario 5 enters the suite on the band the economy pays, because five million was never on the map

The mandate after D-157: re-measure the twenty-five-year 512-map runs,
establish by construction what the map physically pays, and settle the
band on that evidence. Three measurements, in order.

**The AI, re-measured** (the D-156 setup, month by month, post-D-157):

* **Road (seed 4711): 1,119,720 EUR, solvent, compounding** - the same
  figure as before the freeze fix, because the road personality never
  froze. The trace confirms D-155 end to end on the big map: the
  year-twenty-one renewal dips the value 439,000 in one month (614,780
  at month 252) and the renewed fleet then grows the company at about
  +130,000 EUR a year - its best pace of the whole run, on a station
  rated 86.
* **Rail (seed 3): alive at 90,230 EUR** - where D-156 measured it wound
  up in 1959. Its 26-tile line now RUNS: two and a half years of rising
  value (+9,000 EUR a year net of everything), then the line's economics
  sag, its own review honestly closes it in year three, and the
  personality never recovers: twenty years of backoff against a thin
  offer, then a retry at month 281 that borrowed 300,000, built its two
  stations - and could not afford the train, leaving the loan's interest
  to drain the company.
* **Expansive (seed 2): alive at 121,328 EUR** - was wound up in 1967.
  It holds one one-vehicle line for twenty-four years while the 300,000
  loan it never repays eats about 15,000 a year.

The D-157 fix turned "wound up" into "alive but stagnant" for both rail
personalities; it did not - could not - make the map pay more.

**The achievability probe** (a hand-built competent-player network on
the seed-4711 offer, mirrored flat at the real distances and
populations, built the way the balancing scenarios build worlds). What
the offer IS was measured first: 40 towns, 34 industries, 13
source-to-sink pairs in the AI's range - and almost all of it dead on
arrival, because steel, planks, chemicals and plastics have NO acceptor
anywhere on this map (no machine, furniture or electronics works
exists), and cement is uncarriable before 1966 while a
fed-but-uncollected works closes in 24 months, so the gravel chain can
never exist on the 1950 timeline. What survives: ONE coal haul to the
map's one power plant (nearest mine 183 tiles - beyond the AI's
120-tile cap, inside a player's), the farm-to-food chain, and eight
town pairs within 15-40 tiles. The probe built all of it with SIX
MILLION of free capital - D-082 ovals, a three-platform food line, a
four-train coal line, sized bus fleets plus mail vans, auto-renewal
everywhere; capex 3,248,885. Measured over twenty-five years:

* Peak value +837,738 over the post-build start (month 171); final
  3,616,598 after the rail fleet's design-life renewal took back 2.4
  million across months 279-291. The renewal tax is real for every
  twenty-five-year company.
* The coal line is the map's ONE earner: 1,812,825 lifetime revenue on
  four trains. The eight bus-and-mail lines together grossed 717,200 -
  roughly their own upkeep: every town of 2,500 and up pins its pile at
  the 2,000-unit station cap and pays the decay floor (D-156's second
  wall, re-measured; ratings 51-67), and the 400-population towns stay
  drained but produce next to nothing.
* The farm-to-food chain is a measured TRAP, not an opportunity: over
  the 100-tile haul livestock (grace 6 days, 5.5 %/day decay) arrives
  at the floor, the factory cannot batch without it, the grain leg's
  deliveries jam against a full input store, and four trains earned
  24,853 EUR in twenty-five years. The AI's own candidate list contains
  this pair; its arrival gate checks the cargo it SCORES (grain), and
  the chain's co-input is what kills it - a bottleneck for a later
  stage, named here.

The probe covers the genesis offer; industries spawned at runtime add
pairs of the same classes, and the road AI - which rescans monthly and
therefore does chase spawns - compounds at the same order (+110,000 to
+130,000 a year) as the probe's best years. Nothing on this economy
turns 500,000 into five million in twenty-five years; the SPEC.md 19.4
figure describes an economy this game does not have (the rates are what
scenarios 1-4 recalibrated them to be - D-039, D-066, D-087 - and those
scenarios own them).

**The band, recalibrated** (`tests/balance/aiCompany.spec.ts`, closes
D-116; SPEC.md stays untouched per D-123, SPEC2's M11 text carries the
bracketed amendment): per personality, because the evidence is.

* Road, seed 4711: company value in **0.8 - 3.2 million** after
  twenty-five years, PLUS value at year 25 above value at year 15 - the
  compounding-through-renewal assertion. The floor is the stall
  detector (the pre-C2 stall states measured 433,000 and 580,000); the
  ceiling is the economy-breakage detector, anchored above the probe's
  free-capital growth so only a broken tariff or gate can reach it.
* Rail seed 3 and Expansive seed 2: ALIVE with standing networks and
  positive value - the D-157 gain, asserted so it cannot regress. Their
  stagnation is deliberately NOT blessed with a growth band: it is the
  named open bottleneck - the rail review closes a line whose decline
  is real but whose company then never rebuilds (thin offer, the
  graveyard rule, and a retry that could not afford its train), and the
  pax-pile wall stands for every large pair. Those are the next stage's
  targets, with this trace as the baseline.

### D-159 The takt cannot halve the delivery-rating variance, and the floor has two mechanisms - neither is a knob

D-151 measured 0.57 against the SPEC2 sentence's 0.5 and banded at 0.6.
The mandate was to genuinely attempt the half and settle where the
residue lives. The rating inputs were decomposed - daily samples of
every term of `stationRating` at the delivery station, takted and
untakted:

* The delivery station's variance IS its frequency term: 11.05 of 11.38
  untakted, 6.31 of 6.49 takted. The wait term is constant (no cargo
  waits at a delivery-only station) and reliability contributes 0.20.
* The frequency term counts visits inside `RATING_FREQUENCY_WINDOW_DAYS`
  = 20 days, and a two-train line's service period is 23-27 days (half
  its ~42-day round plus the slack the phase lock needs, D-151). The
  window therefore holds 0 OR 1 visits (mean 0.73-0.86 measured) - a
  square wave whose variance is ALIASING of period against window, not
  irregularity: a mathematically perfect 24-day grid still measures
  25 * (5/6) * (1/6) = 3.5, which is 0.31 of the untakted variance on
  its own.
* The rest of the takted variance (6.31 against the 3.5 floor) is the
  round's own breakdown-and-loading jitter arriving at the plant - the
  takt grids DEPARTURES at the anchor, the rating counts ARRIVALS - plus
  the doubled slots the D-149 slip rule produces when a slow round
  misses its slot (7 of 52 measured gaps at the fixture's slack).

The genuine attempt, a slack sweep at 2/3/4/5/6 days: variance ratios
0.690 / 0.571 / 0.652 / 0.695 / 0.615, earnings drift -9.2 / -8.3 /
-9.3 / -10.3 / -7.1 %. No setting reaches 0.5; slack 5 breaks the
+-10 % earnings band outright; the fixture's slack 3 IS the measured
optimum. More slack trades slip-doubling against window duty and
cadence, and the two effects cross - there is no takt parameter left to
turn.

The floor is structural for a two-train line: its takt cannot go below
half its round, so its service period is pinned ABOVE the 20-day rating
window by the shape of the line itself, and the aliasing plus arrival
jitter cannot be removed by anything that only times departures. What
COULD reach 0.5 is known and out of scope by earlier verdicts: per-stop
offsets or load-at-departure (the 11.4/12.1 redesigns D-151 already
declined to smuggle in), or widening the rating's frequency window -
a section-10.1 constant that every station on the map reads and
scenarios 1-4 own, not a knob a takt band may turn. The 0.6 band stands
with this entry as its justification; SPEC2's "halbierte Varianz"
carries the bracketed amendment.

## M12 - the stage, stage 0: the Kenney bake pipeline (2026-08-07)

### D-160 The bake is a pure function from pinned kits to bit-identical atlases, and every gap falls back to procedural art

E-14 as revised by the owner directive (D-140) ordered the mechanism; this
entry records the shape it took and the four choices inside it that were not
in the order.

**The pipeline is fetch, then bake, and only the text manifest is committed.**
`tools/assets-manifest.json` pins all twelve packs by kenney.nl URL AND
SHA-256 - the URLs embed a CMS media hash, so an upstream re-upload changes
both together and a stale pin fails loudly instead of baking unvetted
geometry. `npm run assets:fetch` downloads, verifies and unpacks into
`assets-cache/` (gitignored); a checksum mismatch is a hard error. `npm run
assets:bake` rasterises the mapped GLB models into `public/assets-baked/`
(gitignored, served statically by vite so the M13 renderer can fetch it) and
is deliberately soft in the other direction: no cache means a warning and a
clean exit, because E-14's floor is that the game always starts, on
procedural art if it must. The E-14 glob test is real now:
`tests/unit/repoAssets.spec.ts` walks the actual git index and fails on any
binary extension outside `src-tauri/icons/` (committed because the Tauri
bundler reads them from disk, still regenerable via `npm run icons`), and
proves both pipeline directories are ignored by construction.

**The rasteriser is ~400 lines of own code and shares its light and camera
with the live renderer by coupling test.** GLB parsing (JSON + BIN chunk,
accessors, node TRS/matrix composition), an own PNG codec, and a
z-buffered triangle rasteriser through EXACTLY the 16.1 projection - the
constants are restated in `tools/bake-lib.ts` because Node's type-stripping
runtime cannot resolve the extensionless imports inside `src/` (that is also
why `allowImportingTsExtensions` is now on: the tools import each other by
real file name and run under plain `node`), and
`tests/unit/assetsBake.spec.ts` asserts them equal to `projection.ts`,
`constants.ts` and the `shapes.ts` face factors, the same device that keeps
TerrainAtlas and MapView in step. Flat shading solves one linear light from
the three box-face factors (base 0.44 + 0.08 x + 0.30 y + 0.62 up
reproduces FACE_RIGHT/FACE_LEFT/FACE_TOP exactly), so a baked cell sits in
the same NW light as every procedural cell beside it. Depth runs along the
projection's null direction (1, 1, 0.32 in metres), which makes the
z-buffer agree with `drawOrder()`'s painter ordering by construction.
Vehicles bake eight facings in the FACING_DELTAS order the manifest also
documents; zooms 1, 2 and 4 bake as separate pages (16.2's per-zoom
atlases).

**The PNG writer is fflate, not node:zlib, and not a new dependency.** The
icon generator's node:zlib precedent was rejected for the atlases because
native zlib output can legitimately differ between Node builds; fflate is
pure JS, already a runtime dependency for saves, and makes "bake twice,
bit-identical" hold across machines, not just across runs. The
reproducibility test hashes a full synthetic bake twice; the same double
bake was verified byte-identical on the real twelve kits.

**Company colour is a hue-band tint zone rendered as two cells.** The recent
kits carry one "colormap" material and paint a livery as a RAMP of shades
around one hue inside a shared palette texture, so exact-colour lists fray;
the manifest marks hue bands (min/max degrees, minimum saturation), older
kits with named materials (Nature Kit) can mark material names instead. A
zone face renders neutral grey in the base cell and opaque grey in the mask
cell with the NW shading carried in the mask's grey VALUE - tinting the
mask with a company colour therefore multiplies to a shaded livery, and an
untinted draw shows an honest unliveried vehicle. Face colours come from
one nearest-neighbour sample at the UV centroid, which is exact for
palette-atlas art where every face maps inside one flat patch.

**The M12 subset is representative and its gaps are named.** 43 mappings:
11 rail vehicles, 8 road, 4 ships, 11 town buildings (zone x stage with
variants), 5 industry structures with chimney anchor metadata, 4 trees.
M13 completes the catalogue. Known gaps recorded in the manifest itself: no
bus exists in the Car Kit (the van stands in), no Kenney 3D aircraft kit
exists at all, coal-mine headframe and oil derrick have no kit equivalent -
all stay procedural per E-14 - and `ship-large.glb` turned out to be a
sailing galleon, filed for the pre-1920 eras rather than the 1950 bulker.
The game consumes nothing yet: `src/render/bakedAtlas.ts` is the loader
stub behind the feature check (`atlasSourceFor` - only a validated,
non-empty manifest earns the baked path; absence, damage or an unknown
version all mean procedural, decided by a pure function under unit test),
and MapView switches over in M13.

## M12 - the stage, stage 1: the hybrid renderer (2026-08-07)

### D-161 The chunk is a checksum with a texture, and the overview finally shows the network

E-04 settled the architecture and D-125 recorded why; this entry records the
shape M12 gave it and the five choices inside that shape. The split itself is
as ordered: at 1x, 2x and 4x the M10 drawOrder sprite path is untouched; at
0.5x and below the static world comes out of 32x32-tile RenderTexture chunks
with camera-AABB culling; at 0.25x the map is the abstract overview of
SPEC.md 16.1 - terrain chunks, network polylines, vehicle dots.

**A per-chunk checksum is what makes "only touched chunks" true.** The map
revision is ONE counter for the whole world, so the revision alone can only
say "something changed somewhere" - acting on that would rebake every cached
chunk on every terraform. Each cached chunk therefore remembers an FNV-1a 32
digest of the static layers it drew (corners one past the tile range, because
seam corners are shared: an edit to one dirties every chunk that draws a
slope from it), and a revision change recomputes digests over the CACHED
chunks only - both zoom profiles and the polyline cache, so the profile
currently hidden cannot come back stale after a zoom flip. Rail type is
folded in although today's track art ignores it: M13 draws catenary from it,
and a checksum that lags the art by a milestone is a stale-chunk bug on a
timer. The digest walk is bounded by the cache, not the map; the pure parts
(`chunkChecksum`, `computeDirtySet`, `visibleChunks`, `chunkAabb`,
`extractNetworkSegments`) live in `src/render/chunks.ts` under
`tests/unit/chunks.spec.ts`.

**What a chunk holds is decided by what can go stale against it.** Baked:
terrain, roads, track, bridges, signals, waypoints, buildings - tile layers
that move ONLY with the revision the checksum watches. Not baked, ever:
industry blocks (their marker list travels on its own channel - founding,
closure - and a baked copy would drift against it) and station modules (they
carry the company tint, and recolouring a company must not rebake the map).
Both stay live sprites above the chunks at 0.5x, drawn by the same placement
code as the detail path, so the boundary zoom loses no marker. Vehicles stay
live sprites too; that they can no longer duck behind baked hills at
overview zooms is the compromise E-04 priced in ("wo 16.1 selbst Details
streicht") and D-125 explains.

**Chunk-granular painter order is pixel-exact, and here is the argument.**
Chunk sprites sort by their diagonal (chunkX + chunkY). A wrongly-ordered
pair would need a tile in an earlier-drawn chunk that overlaps a
farther-diagonal tile in a later-drawn one; overlap needs their screen
columns within one tile of each other, but crossing a chunk border in x or y
while LOWERING the diagonal forces the columns at least two tiles apart -
the cases exclude each other, so no pixel ever has a wrong winner. Within a
chunk the bake root sorts by the exact drawOrder keys of the live path.

**Textures are baked at the zoom they are shown at and never resampled.**
One texture pixel is one screen pixel (1024x664 at 0.5x, 512x332 at 0.25x),
and the AABB deliberately ignores the map edge so every chunk of a profile
has the same footprint: an evicted texture is recycled for any other chunk
instead of reallocated. Eviction is least-recently-used over caps sized in
`MapView.ts` (32 full / 96 terrain), with the current frame's chunks exempt -
a huge viewport degrades to a bigger cache, never to thrashing.

**The abstract network is polylines because sprites are why it vanished.**
Below 0.5x the detail sprites are stripped, which until now deleted the
network from exactly the zoom made for looking at networks. Each tile emits
half-segments from its centre towards every connected edge (roads) or corner
(diagonal rail), so neighbours meet without double-drawing; the renderer
projects them at the tile's display height (rail rides its bridge deck),
strokes roads in 16.3's asphalt and rail in 16.3's BALLAST tone - the rail
tone itself is too dark on dark terrain at map scale - at screen-constant
width, cached per chunk under the full checksum, and redrawn only when the
visible chunk set or the map moves, never on a pan inside the set. Vehicles
become one dot per vehicle, batched into one fill per company, writing the
same hit-test arrays as the sprite path - a dot is clickable. Stations and
industries are deliberately absent at 0.25x: 16.1 names terrain, network
and vehicle dots, and the network lines pass through every platform anyway.

**Day and night modulates both paths through one container.** `MapView.art`
now holds chunks, network, tiles and dots, and the D-127 tint lands on IT -
still a single change-detected assignment, and a baked chunk darkens exactly
like the sprites it replaced. The overlay stays a sibling outside the tint:
interface does not dim at night.

The chunk-bake tripwire joined the D-136 suite with one deliberate
difference: its 4 ms threshold is NOT a generous multiple but the M12
acceptance number itself ("Chunk-Rebake gemessen <= 4 ms"), so the CI
measurement doubles as the Fertig-wenn evidence. The proxy replays the
digest, the full placement loop and the polyline extraction for the busy
fixture chunk: measured p50 0.29 ms, p99 1.30 ms on the reference machine -
a third of the budget, with the GPU pass outside what a proxy can see
(stated, as D-136 demands). The atlas cell's headroom and skirt are exported
constants now (`CELL_HEADROOM_STEPS`, `CELL_SKIRT_STEPS` in TerrainAtlas),
because the chunk AABB must enclose everything a cell can draw and a margin
that drifted from the cell would clip every tall building at a chunk edge -
the D-117 anchorY lesson applied before it could happen a second time.

## M12 - the stage, stage 2: true 60 Hz motion (2026-08-07)

### D-162 The renderer draws one tick behind and glides towards the newest, and the wall clock decides only the blend

E-05 ordered the mechanism - a reader-side copy of the previous generation's
vehicle block, a wall-clock alpha lerp, a clamp at discontinuities, no third
SharedArrayBuffer, no stride change - and this entry records the shape it
took and the five choices inside it.

**The interpolator renders the PAST, never a prediction.**
`SnapshotInterpolator` (`src/render/interpolation.ts`) keeps preallocated
copies of the two newest published generations and MapView draws every
vehicle at `prev + (curr - prev) * alpha` - one tick behind the simulation,
gliding towards the newest published truth. The alternative, extrapolating
FORWARD from the newest tick, was rejected because an extrapolated vehicle
overshoots every stop and every signal halt and then visibly rebounds; a
50 ms display lag is imperceptible, an overshoot at a red signal is a lie
about the one thing this game promises to draw honestly. The alpha is
clamped to [0, 1] at both ends - clock skew shows the previous positions,
a pause or stall parks every sprite at its current published position, and
nothing ever moves that the simulation did not publish. The copies are
taken only when the generation counter moved (20 Hz, never per frame), the
per-frame path allocates nothing, and the within-tile projection moved into
allocation-free pure functions (`sampleWorldX`/`sampleWorldY`, asserted
equal to `tileToWorld` by test) so the lerp can run it twice per vehicle.

**Rows are paired by vehicle id, because the block is compacted.** A row's
position says nothing about which vehicle it holds (the D-126-era snapshot
lesson), so the previous copy is indexed by `VehicleId` into a preallocated
`Int32Array(MAX_VEHICLES)` at generation-swap time. A vehicle with no
previous row - a fresh spawn, a vehicle that entered the block's cap - draws
at its current position outright: there is nothing to glide from.

**The clamp has two triggers, and both cut to the CURRENT position.** A
tile-space jump past three tiles between generations is a teleport (depot
recall, path reset, a loaded world - a vehicle moves at most one tile per
tick, so even a doubled generation gap under fast-forward stays within two),
and a state transition into or out of Loading, BrokenDown or InDepot snaps
too: a lorry must not slide INTO the bay it is already loading at, a
breakdown must not drift to its standstill, a shed must not swallow a sprite
mid-glide. Braking, signal waits and takt waits keep gliding - the physics
already smooths those, and the published positions describe the honest
deceleration. The three state values are duplicated as a bit mask to keep
render free of sim enums (the MapView pattern);
`tests/unit/interpolation.spec.ts` pins them against `VehicleState`.

**The lerp window comes from the measured rate, not the nominal step.** The
snapshot already publishes `SimRateCentiHz`; 100 000 / rate is the true
cadence at every speed setting, so fast-forward shortens the glide instead
of lagging it, and a genuinely slow sim is lerped over its genuine interval.
Capped at 250 ms: past that the sim is stalling, and a sprite a quarter
second behind its own truth reads as lag, not smoothness. The channel
carries the tag as `currentVehicleFrame()` - generation, tick and rate read
in ONE call so a publish cannot slip between the block and its label; the
superseded untagged `currentVehicles()` was deleted rather than left as a
second way to read the same slot.

**The day/night phase glides on the same alpha.** D-127's curve now receives
`prevTick + (currTick - prevTick) * alpha` instead of the integer tick, so
dawn stops stepping once per tick at the same moment the vehicles stop
stepping. Fehlerkatalog 39 is honoured, not bent: the wall clock chooses
where BETWEEN two published counters the frame sits - the phase is bounded
by the two ticks, it never invents a counter value, and world animation
(water, later particles) stays keyed to deterministic counters. Stated
openly: two screenshots of the same tick can differ sub-tick in vehicle
positions and tint - that is what E-05 bought, the sim hash and every
replay are untouched, and the determinism suite never looks at pixels.

The draw-prep tripwire (D-136) now prices the lerp: the proxy replays the
previous-row lookup, the snap check, both samples and the blend at alpha
one half - the worst frame, since a settled frame skips the branch
wholesale. Measured p99 1.26 ms for the full 1,500-vehicle block against
the unchanged 5 ms tripwire (was 0.41 ms before the lerp; the cost is the
second sample and the pairing, roughly threefold, still a quarter of the
budget).

## M12 - the stage, stage 3: the 4x detail atlas page (2026-08-07)

### D-163 The top zoom gets its own atlas page, packed by headroom, and every frame carries its own ground line

Zoom 4x was a nearest-neighbour upscale of the 2x atlas - the one zoom
level 16.2's per-zoom atlases exist for drew at a quarter of its own
resolution. M12 orders the missing page; this entry records the shape it
took and the three choices inside it.

**The page cannot repeat the base grid, so it packs by headroom.** The base
page's uniform cell (one tile wide, three height steps of D-117 headroom,
one of skirt) redrawn at 4x makes 17 columns of 256 px and 14 rows of
384 px - 4352 x 5376, over the 4096 px GPU guarantee in BOTH directions,
and over it by area, so no reflow of uniform cells fits either. What fits
is the observation that most of the atlas never uses the headroom: terrain
rises at most one step above its ground line (a raised corner), roads and
track none at all. The detail page therefore packs SHORT rows (one step of
headroom) for terrain, road and track, and TALL rows (the full D-117
headroom) for buildings, industries and the statics - 4096 x 3840 of 4096,
booked in SPEC2 6.2, with the layout maths pure under
`tests/unit/terrainAtlas.spec.ts` so the guard that used to be a runtime
throw on somebody else's machine is a headless test on this one.

**Two row heights mean two ground lines, so `anchorY` moved onto the
frame.** The page-level anchor was the D-117 fix for one unwritten
agreement; a packed page would have re-created the same agreement one
level down ("short rows sit one step under their edge, tall rows three"),
so every `AtlasFrame` now states where its own ground line is and
`MapView.place` reads nothing else. The one consumer with a FIXED offset -
the vehicle path, calibrated against the base cell's geometry - is served
by construction instead: the tall cells are world-identical to the base
page's cells (same tile width, same headroom and skirt in world pixels),
and the test pins that equality, so the vehicle draw code still does not
know which page it holds. The bake path is pinned to the BASE page
explicitly: chunks exist only at zooms the base page serves, and a bake
must not depend on the live zoom.

**The cells are the base drawing code under a 2x transform, which IS a
native 4x render.** Every coordinate and line width in the atlas drawing
routines is linear in the page scale, so scaling the canvas context by
DETAIL_ATLAS_SCALE / ATLAS_SCALE and replaying the same vector calls
rasterises the identical artwork at the detail resolution - no second
drawing to keep in sync, no resampling anywhere. Each cell is clipped to
its frame, because anything painted past a packed frame's edge lands in
ANOTHER frame's texture. Which page a zoom reads is one pure function,
`atlasPageForZoom` - detail exactly when the zoom exceeds the base page's
own resolution - and the two pages share one frame cache under distinct
key prefixes, with the sprite scale set per placement (change-detected)
because a zoom flip reuses every pooled sprite for the other page.

The startup cost is measured and guarded: `MapView.attach` times both
builds and warns on the console past `ATLAS_BUILD_BUDGET_MS` (250 ms, the
atlas's slice of section 21's 3 s cold start - a generous D-136 multiple).
Measured 2026-08-07 (Chromium on the reference machine, Ryzen 5 7520U):
base page 3.3-8.9 ms, detail page 8.5-10.3 ms per build, under 20 ms
together - the slice is spent to a tenth. Render-only throughout: no sim
contact, no save bump, no snapshot change; the baked-asset loader stub
(D-160) and its per-zoom manifest are untouched and stay the M13 door.

## M12 - the stage, stage 4: the living water (2026-08-07)

### D-164 Water is a tint over greyscale, three rows on a counter, and the chunk rebakes for its own shimmer

M12 orders the two 16.3 water tones from `oceanMask`/depth, a 2-4-frame
animation on the deterministic blink counter, and a coastline seam - all of
it render-only. This entry records the shape it took and the five choices
inside it.

**The tones are sprite tints over GREYSCALE cells, so the 16.3 hexes are
exact by construction.** The water cells are drawn white-based (white top
face, the terrain cell's own skirt and tilt shading, grain in greys);
multiplying `#4a86a8` or `#2c5a78` over them reproduces the section-16.3
colour on the flat face literally, where recolouring a blue-drawn cell with
a second blue would multiply into neither. Deep is `oceanMask` AND a floor
at least `WATER_DEEP_MIN_DEPTH` (2) levels under the surface, judged by the
HIGHEST corner exactly as water itself is judged; an inland lake is never
deep, whatever its floor - the mask is the fact that it is a lake. Both
inputs are layers the simulation already keeps (map model note: both
derived), so the sim was not touched. What DID move: the chunk checksums
now fold `oceanMask` in both profiles - a canal dug at the coast flips a
whole lake's mask without moving one corner near it - and a one-tile
terrain RING in the full profile, because foam reads the NEIGHBOUR's
terrain and a shoreline flip just across the chunk border must dirty the
chunk on the rare edit that leaves every shared corner in place. The
minimap keeps its single water colour: D-112's painter is a different,
honest drawing and was not part of the order.

**The animation is three rows ping-ponged on the blink counter.** Sequence
0-1-2-1, thirty render frames per phase (roughly half a second), so
consecutive phases - including across the loop - differ by exactly one row:
a swap is a step, never a jump. The counter is MapView's blink counter, the
deterministic frame counter the deadlock marker has always blinked on and
the one SPEC2 M12 names; no wall clock (Fehlerkatalog 39). The still grain
keeps the OLD water row's hash-placed speckle positions in every frame and
only the ripple dashes move, which is what makes the swap read as light
wandering over the surface rather than a strobe. On the detail path a
phase swap re-textures exactly the water sprites the last rebuild recorded
(parallel slot/slope arrays) - position, tint and draw order are
row-independent, so nothing else is touched.

**The foam row is sixteen cells because an edge only has two corners.** The
sixteen slope shapes reduce, per edge, to the lift of that edge's two
corners - nothing else moves the edge geometry - so 4 edges x 4 lift pairs
covers every (slope, edge) combination that exists. Foam is placed per
land-facing edge (the map border is open sea, never a shore), sits at the
road layer a water tile can never occupy, is drawn in its own near-white
rather than tinted - whiteness is what foam is - and does not animate, so
a shoreline never flickers.

**All four rows live on the BASE page, and the top zoom upscales its
water.** The four rows are the M12 ledger booking (SPEC2 6.2, page 0 now
2176x3456 of 4096, pinned in `terrainAtlas.spec.ts`). The detail page
cannot take a twin: D-163 packed it to 4096x3840, and four more short rows
are 1024 px it does not have. So water frames come from the base page at
EVERY zoom, which at 4x is a 2x upscale of a low-frequency surface -
stated openly here rather than discovered as a texture-cache surprise. The
static `Terrain.Water` row of the base grid is dead now; it stays, because
renumbering every terrain frame key would buy sixteen cells.

**At 0.5x the chunk rebakes for its shimmer; at 0.25x the ocean holds
still - measured, not guessed.** The two candidates M12 names were both
measured on the reference machine over an all-water 1920x1080 viewport at
0.5x (the water-heavy worst case). Option A, rebake water chunks on a
phase swap: 0.28 ms p50 / 1.69 ms p99 CPU proxy per chunk, 18 visible
chunks, staggered at WATER_CHUNK_REBAKES_PER_FRAME = 2 - the swap rolls
over the viewport in nine frames of well under a millisecond median each,
inside a thirty-frame phase window, and a pan pays nothing. Option B, keep
water OUT of the bake as live sprites: 23,161 extra live sprites whose
placement loop costs 5.8 ms p50 / 9.2 ms p99 on EVERY pan frame - the
exact bill chunking exists to delete - plus a correctness trap: above the
chunk layer, live water overdraws the baked cliff in front of it (a land
tile one level up overlaps the water diamond behind it), so B is only
correct UNDER the chunks, which buys nothing back. A wins on every column;
what the CPU proxy cannot see (the GPU RenderTexture pass per rebake) is
stated per D-136, and it is two render passes a frame at worst. Each
ChunkEntry remembers `hasWater` and the row it baked, so a still ocean and
a landlocked viewport never rebake at all. The abstract 0.25x profile pins
row 0 and never animates: 16.1 strips detail there by design, a
two-pixel tile cannot show a shimmer that reads as anything but noise, and
every chunk agreeing on one row is what keeps the frozen ocean from
becoming patchwork.

The tripwires were re-measured with the water in the busy fixture (one
tile row in six is now a canal with foam on both shores): sprite-pool
rebuild 8,017 sprites at p50 1.37 ms / p99 4.31 ms against the unchanged
25 ms tripwire, chunk bake 2,656 placements at p50 0.40 ms / p99 1.64 ms
against the 4 ms acceptance budget, vehicle draw prep untouched at p99
1.54 ms against 5. Render-only throughout: no sim contact, no save bump,
no snapshot change, and the determinism suite never sees a pixel.

## M12 - the stage, stage 5: names on the map and the finished minimap (2026-08-07)

### D-165 Map text is a startup-rasterised system font in an unscaled layer, and the culling order is the policy

M12 orders zoom-staged town and station labels with collision thinning, set
from a BitmapFont rasterised at startup out of system faces (E-14 - no font
binary may enter the repository; the D-160 glob test guards that). This
entry records the shape it took and the four choices inside it.

**The data was already there, so the marker channels were not touched.**
`TownMarker` has carried name, position and population since M1 and
`StationMarker` name and position since M2 - the labels are a pure reader
of channels that exist. Verified, not assumed: the alternative this rules
out is a second name export drifting beside the first.

**The label layer sits on the STAGE, unscaled, and follows the camera by
one copy per frame.** Inside the world container the glyphs would scale
with the zoom - four-times-blurry at 4x, unreadable at 0.25x - so the
layer lives beside the world, text renders 1:1 at every zoom, and each
frame copies `world.position` once. Label positions are world coordinates
times zoom, which is why a zoom flip re-lays-out the labels even though
nothing in the world moved; a pan re-lays-out nothing. The layer is
deliberately OUTSIDE the D-127 day/night tint - a name is wayfinding, and
wayfinding does not dim at night - and it swallows no pointer events, so a
click through a town name still selects the tile under it. Layout reruns
only when the zoom, the marker lists or the map revision move (a terraform
can change the height a label sits on); per frame the whole feature is
four equality checks.

**Culling is a pure greedy keep, and the ARRAY ORDER is the whole
policy.** `cullLabels` (src/render/labels.ts) keeps a label exactly when
it overlaps no label already kept - first come, first kept - and MapView
states the priority once, at the call site: towns before stations, larger
towns before smaller. When two names fight for the same pixels the map
keeps the one the player is more likely to be looking for, and no two
kept labels ever overlap, which is the SPEC2 sentence made structural.
Dropped labels block nobody (they are not kept), touching edges do not
collide, and all of it is pinned headless in `tests/unit/labels.spec.ts`
- the D-136 split again: pure parts under test, Pixi sprites not.

**Towns are never gated; stations vanish exactly where their modules do.**
The 0.25x overview is the view MADE for reading a map, so town names
survive to the bottom of the zoom ladder and the collision culling does
the thinning there - population-first priority means the villages drop
before the cities. Station labels exist only at 1x and above: at 0.5x the
modules they caption are baked into chunks two pixels tall, and a caption
for something invisible is noise. Town size is three population steps
(11/14/18 px against thresholds of 1,000 and 3,000 inhabitants), so the
map reads like a map: a city announces itself.

**The glyph inventory is a constant a test sweeps the name generator
against.** The raster covers exactly `LABEL_FONT_CHARS`; the test runs six
thousand generated names off a fixed seed and asserts every character
seen is covered, plus space, digits and hyphen (the composed-name path)
explicitly. The generator is umlaut-free by construction ("Sued",
"Koenigs"), but the raster carries A-umlaut through eszett anyway, as
E-14 orders - a future name source (scenario files, M22) must not be able
to break map text with a perfectly ordinary German letter. The font
installs once per page load behind a module flag: the raster is global
Pixi state, and a StrictMode remount must not build a second atlas.

### D-166 The minimap draws the camera as an honest parallelogram, over the painter and never in it

M12 orders the minimap's viewport rectangle and drag-to-pan. Both landed
in the PANEL; `paintMinimap` was not touched, and that is the decision.

**The viewport is drawn over the pure bitmap, not into it.** D-112's
painter is called from two places - the corner panel and the save
thumbnail - and a camera outline painted into the pixels would put
interface chrome inside every save file's picture. The panel therefore
stacks a second canvas over the bitmap: the outline redraws on every
camera move, the megapixel below it only when the ground changes, and the
thumbnail keeps calling the untouched painter. Two canvases are two
cadences, kept from paying for each other.

**The outline is the projected quadrilateral, not a bounding box.** A
screen rectangle back-projects into tile space as a rotated parallelogram
(the 16.1 dimetric read backwards); its axis-aligned bounds would claim
roughly twice the area the player actually sees. `minimapViewQuad`
(src/render/Minimap.ts) projects the four screen corners at height zero -
the same assumption `MapView.visibleTileBounds` makes - and is pure under
`tests/unit/minimapViewport.spec.ts`, corner for corner against the
projection module.

**The camera flows view - store - panel, and only when it moved.**
MapView publishes centre, zoom and screen size through `onCamera`,
change-detected, so an idle game writes nothing into the store and a pan
re-renders one small overlay rather than the interface. The panel does
the tile-space projection itself; the view exports camera FACTS, not
minimap geometry - the renderer does not know the minimap exists.

**Drag-to-pan is the click it always was, captured.** Pointer capture
makes press-jump-drag-release one gesture; coordinates are clamped to the
map rather than ignored outside it, so a drag that leaves the little
panel pins the camera to the edge instead of freezing mid-gesture. The N
key and the mode buttons still drive one store value (D-126), and the
interactive element carries the accessible name the bitmap canvas used
to.

## M13 - living trains, bundle 0: the verifier's non-blocking debts (2026-08-07)

### D-167 The tripwire gates the median, the p99 is a generous backstop, and an acceptance number is history, never a threshold

The M12 verifier caught the tripwires doing what D-136 says a tripwire
must never do: flake on a busy box. The chunk-bake gate sat at exactly
4 ms - the M12 ACCEPTANCE number doing double duty as a CI threshold,
zero headroom by construction - and the draw-prep gate at 5 ms had been
eroded from twelve times its baseline to barely three times the clean
p99 once M12's E-05 lerp raised the honest cost of the frame. Under
ordinary desktop background load both measured 5-7 ms against 1.3-3 ms
clean, and a proxy that fails on a busy box teaches people to ignore it
(D-136, the D-120 lesson).

The remeasurement that decided the fix (reference machine, four
busy-loop node processes saturating the 4C/8T box, five runs of the
suite): contention inflates the p99 TAIL by multiples - chunk bake
2.8 -> 3.2-11.1 ms, draw-prep 1.6 -> 4.3-8.1 ms, rebuild
3.9 -> 10.6-39.3 ms, the last overrunning even its old 25 ms wire - but
moves the MEDIAN at most ~1.6x (chunk 0.51 -> 0.74-0.84 ms, draw-prep
0.75 -> 1.08-1.20 ms, rebuild 1.63 -> 2.43-2.75 ms). Scheduler noise
lives in the tail; a real regression - an accidental per-frame rebuild,
a quadratic layer scan - multiplies EVERY sample and takes the median
with it. So the median is both the stabler statistic under load AND
just as sensitive to the regressions-of-multiples the wire exists to
catch. The two suggested alternatives were measured and rejected:
median-of-batch-p99s keeps the tail in every batch (the per-run
contended chunk p99s 3.2/6.9/7.4/10.0/11.1 have a median of 7.4 -
still 1.9x over the old budget), and a warm-up discard adds nothing the
median does not already give (early JIT samples are tail, not median;
one warm call already exists).

The gates are therefore: the MEDIAN under a generous multiple - rebuild
10 ms (6x clean), draw-prep 5 ms (6.7x clean), chunk bake 3 ms (6x
clean), each also >= 3.6x the fully-saturated-box median - plus a very
generous p99 BACKSTOP (60/30/30 ms, each above the worst observation a
saturated box ever produced) for the one regression shape a median
cannot see: a tail-only storm such as periodic cache eviction. The p99
stays in the console line for the record.

The acceptance numbers do not move. SPEC2 6.1.1 keeps the clean-machine
measurements (chunk bake p99 1.57 ms against the 4 ms acceptance
budget) as recorded history, and its preamble now states the rule this
entry is the reason for: an acceptance number is a measurement taken
once on a clean reference machine; a tripwire is a gate that must hold
on a loaded one. Verified after the change: five of five runs green
under the same four-way saturation that flaked four of five before -
the validation tails reached 12.5/9.3/34.0 ms and stayed under their
backstops with >= 1.8x headroom, while every median stayed under a
third of its gate.

### D-168 The repository is LF everywhere, and a CRLF checkout is repaired once, not fought forever

Every committed blob was already LF - `git ls-files --eol` reports 207
text files `i/lf`, zero `i/crlf`, zero mixed - but the M10
`.gitattributes` marked only the save fixtures binary and left line
endings to each machine's `core.autocrlf`. On a Windows checkout with
`core.autocrlf=true` the working tree materialises as CRLF (58 files on
the reference machine) and `npm run format:check` (prettier,
`endOfLine: "lf"`) turns red repo-wide on files nobody touched -
hygiene noise that trains people to ignore a red gate, the same erosion
D-167 just paid for in the perf suite.

`.gitattributes` now states the policy instead of inheriting it:
`* text=auto` normalises anything git detects as text at commit time;
every source and config extension in the index carries an explicit
`text eol=lf`, so checkout produces LF REGARDLESS of `core.autocrlf`;
and the binary marks are explicit - `*.ironsave` (compressed corpus
fixtures, the M10 rule: a CRLF conversion would corrupt them) plus
`*.png`/`*.ico` (the Tauri icons, the one committed binary the
repoAssets allowlist permits). `git add --renormalize .` was run before
committing and produced ZERO content changes - the blobs were already
clean, so no corpus fixture and no canonical hash moved and history
stays untouched.

A machine whose checkout predates this entry repairs itself ONCE, with
a clean tree:

    git config core.autocrlf false
    git rm -r --cached -q . && git reset --hard

The cached-rm forces the re-checkout that applies the new attributes; a
plain `git checkout` considers the CRLF files up to date and rewrites
nothing. The same recipe lives in CLAUDE.md's environment note. New
files need no care: the attributes clean them at commit and prettier
writes them LF in the working tree.

One honest limit, discovered while verifying: with the endings fixed,
`format:check` is STILL red on 52 files - genuine style drift older
than this entry (CI never gated formatting), not an EOL artefact. It is
deliberately not swept here: strict scope aside, prettier's own
markdown emphasis handling would CORRUPT prose - it rewrites
`**ships get plain A*, ...**` in CLAUDE.md into broken `_*`-emphasis,
because of the literal `A*` - so the cleanup needs a decision about
exempting the prose documents first, and that is its own change, not a
side effect of line endings.

## M13 - living trains, bundle 1: the catalogue mapped whole (2026-08-07)

### D-169 The full catalogue is mapped, a reuse is a recoloured stretch and never a wrong silhouette, and the coupling test holds art to the catalogues

D-160 shipped a representative subset of 43 mappings; M13's first bundle
completes it. `tools/assets-manifest.json` now carries 145 models: all 33
traction units and 23 wagons of `railCatalog.ts`, all 27 road vehicles of
`catalog.ts`, all 12 ships of `waterCatalog.ts`, 21 town-building cells
(three zones x two expansion stages x variants), 14 of the 17 industries,
and 15 trees keyed per climate. Baked on the pinned twelve kits that gives
810 cells per zoom - 2,430 cells, six pages, ~5.7 MiB, one bake ~25 s -
verified reproducible by a second bake with byte-identical SHA-256 on
every file, the D-160 promise re-proven on the full set.

**What stays procedural is a named list, and the test enforces it in both
directions.** Aircraft (E-14: no Kenney 3D aircraft kit exists), the
coal-mine headframe and the oil derrick (E-14 by name), and the FARM -
no pinned kit carries a farmstead, and a suburban house under an
industry marker would be exactly the wrong-silhouette forcing this
bundle's order forbids; `shapes.ts` keeps all four. The coupling test
(`assetsBake.spec.ts`, the i18n.spec.ts device applied to art) asserts
every rail/road/water catalogue id is mapped exactly once, every aircraft
id is NOT mapped, no mapped id is missing from the catalogues, the
industry set is exactly IndustryType minus {CoalMine, OilWell, Farm},
every zone x stage town cell exists, and every MapClimate has at least
two trees - the manifest and the catalogues can now drift in neither
direction without a red build.

**Two manifest features carry the honest reuses: `recolor` and
`stretch`.** The kits hold fewer distinguishable bodies than the
catalogue has entries, and the bundle's rule was: real model variety
first, reuse with recolour/scale variation where the kit genuinely lacks
a body, never a forced wrong silhouette. `recolor`
{hueShift/saturation/value} is a pure HSV transform applied at extract
time to NON-tint faces only - tint classification reads the authored
colours first, so a hue variant keeps exactly the company-colour zones of
the original, and an untinted reuse (the white reefer families) recolours
everything. `stretch` [x,y,z] scales per model axis around the ground
pivot (+z is travel), turning one van body into seven bus generations -
including the double-decker via the height axis, the one silhouette a
stretch can genuinely produce. Both are deterministic float maths on
fixed inputs; the reproducibility test covers them by construction.

**The reuse register.** Rail: five steam entries on three locomotive
bodies (steam4/5 are recoloured rescales); nine diesels on six bodies
(diesel7/8 and the hydrogen loco are recoloured box-cabs, the hydrogen
one pale cyan); nine electrics on eight bodies (electric7/8 recoloured);
four high-speed heads on two bullet noses (hs3/4 recoloured rescales);
the railcars follow the catalogue's TRACTION, not just its count: the
three diesel units take the three pantograph-free subway bodies (the 1950
one in olive paint against its 1954 sibling), the electric pair the
modern tram and the city-c EMU head as a single car, and the battery unit
the rounded tram shell in bright paint - a pantograph on a diesel railcar
would be a wrong silhouette in exactly the D-117 sense, and a BEMU
honestly carries one. Wagons: the five coaches are the two
locomotive-passenger coaches plus the city-b, double-b and bullet-b
EMU/coach middles; both mail vans are untinted recoloured coaches (no
mail stock exists); box1/2 and reefer1/2 are the container body
recoloured (no covered van exists - brown van and bleached white
respectively); the silo is the tank body raised and bleached; the
livestock wagon is the wooden stake wagon (an open pen, not a forced
box). Road: all seven buses are stretched van/delivery bodies - the
named E-14 bus gap; the three tankers keep the garbage-drum stand-in
with a note, the cement lorry the site vehicle; bulk/box/reefer/mail
generations are scale-and-recolour ladders on truck/delivery/van; the
livestock lorry is the truck untinted in wood-brown. Ships: tankers are
the coaster hull lengthened, lowered and darkened (no tanker hull
exists); the three container generations share the container-deck hull;
the bulker is the bulk-pile hull scaled; the reefer ship is the
twin-stack steamer bleached; the 2025 fast ferry is the small liner
brightened. Every reuse carries a `note` in the manifest naming the gap.

**The M12 subset had four misreads, corrected here rather than carried.**
The pax1 coach was `electric-city-c` - a pantographed EMU head standing
in for an unpowered carriage; the kit's `train-locomotive-passenger-a/b`
are actual coaches and carry the five-generation family now. The ship
hulls were sorted by name, not by deck load: `ship-cargo-a` carries
visible containers (it is the container family now), `ship-cargo-b`
bulk piles (coaster2/bulker), `ship-cargo-c` is the small coaster. The
steel mill moved from the plain block `building-d` to the twin-stacked
`building-e`, the sawmill onto the sawtooth `building-k` (D-117's own
north-light trope), the cement works onto the kiln-stacked `building-l`.
And the town-industrial zone cells no longer share models with mapped
industries - a zone building that IS an industry sprite would make the
two unreadable side by side.

**Chimney anchors come from measured geometry.** The emitter positions
for the eight smoking industries were read from the models' top-vertex
clusters (a scratch script over the parsed GLBs), not guessed: the
refinery carries two stack anchors, the mine hoppers a dust anchor at the
funnel mouth. The two Factory-Kit hoppers are recoloured away from the
kit's navy (rust for the ore tipple, washed stone for the gravel
classifier) so mine-side structures do not read as factory interiors.

**Base and mask cells pack as one atomic double-width rect.** The full
catalogue overflows one 4096 page at zoom 4 (four pages now), and the
M12 packer placed base and mask as two independent cells - a pair
straddling a page boundary was a hard error the subset never triggered.
Packing the pair as one rect makes "both halves share a page" true by
construction; a unit test overflows a synthetic catalogue and asserts
both rectangles of every cell inside its page. Tree targets renamed from
`tree:<n>` to `tree:<climate>:<n>` (temperate/arctic/tropical/desert
after MapClimate) while nothing consumes them - the M13 render bundle
reads the new grammar from the start.

The SPEC2 6.2 booking is honestly overrun and recorded (Fehlerkatalog
40): the plan's ~600 cells were a pre-Kenney estimate, the measured
truth is 810 cells per zoom - z1 one 4092x1067 page, z2 one 4092x3609,
z4 four pages under 4096 squared, with only ONE zoom's pages GPU-resident
at a time. Render-only in the strictest sense: this bundle touches
tools, manifest, tests and documentation - not one byte under `src/`.

## M13 - living trains, bundle 2: vehicles from the bake (2026-08-07)

### D-170 The catalogue drives baked, the white box retires to a fallback, and a sprite faces where it actually glides

M13's second bundle puts the D-169 vehicle cells on the map: MapView draws
every mapped catalogue entry from the baked pages, in eight facings, in
company colours, over a shadow - and the M12 white boxes retire from the
live path without being deleted, because they ARE the fallback (E-14).
Six choices inside that, and one measured refusal.

**The facing is the interpolated movement vector, not the tile step.**
SPEC2 names the (NextTile - Tile) delta, and that delta alone would turn
every sprite a quarter turn in the exact frame its vehicle crosses a tile
edge - the one artifact 60 Hz motion (D-162) exists to remove. The facing
therefore quantises the delta between the PREVIOUS and the CURRENT
generation's fractional tile positions - the direction the sprite visibly
glides, already computed for the E-05 lerp - so a corner blends through
the diagonal facing mid-glide instead of snapping at the boundary. A
standing vehicle (sub-epsilon movement) keeps the facing it last drove
with from a per-id render-side cache rather than spinning to a default;
a vehicle never seen moving reads its current tile step; the birth
default is east. The quantiser, the epsilon and the cache sentinel live
in `src/render/vehicleArt.ts` as pure functions under
`tests/unit/vehicleArt.spec.ts`, and the facing order is the bake's own:
the render side restates FACING_DELTAS and the coupling test asserts the
two lists equal (the D-160 device).

**Two-pass tint is two sprites, and the draw order costs no new key.** A
baked vehicle is the base cell (authored colours, tint zones neutral)
plus the mask cell (shaded grey livery) tinted with the owner's colour -
D-160's convention consumed as designed, so an untinted hull never wears
anybody's colours and a tinted one keeps its NW shading. Each vehicle
slot is now three sprites in the SAME sorted container - soft ellipse,
body, mask - sharing ONE `vehicleDrawOrder` zIndex, ordered within the
tie by insertion (Pixi's sort is stable): the M10 painter path did not
grow a layer, a hill still covers a train, and the 0.25x dots (D-161)
are untouched. Baked cells are tight per-facing rectangles, so placement
reads the cell's OWN `anchorX`/`anchorY` ground pivot - the D-117/D-163
lesson, per cell this time; the white-box path keeps its fixed offset.

**The fallback has two floors, and both are pure decisions.** Whether a
baked path exists AT ALL is `atlasSourceFor` (D-160) inside the loader -
no cache, damaged manifest, missing page all mean the procedural game
that was already running, because the pages load in the background AFTER
the first frame. Whether one VEHICLE draws baked is `vehicleVariantFor`:
null for an unmapped catalogue id (aircraft stay procedural per E-14),
for a vehicle the fleet markers have not named yet (specId -1), and for
a variant that is missing any of its eight facings - dropped WHOLE at
index time, because seven baked facings plus one white box is exactly
the wrong-silhouette flicker D-117 forbids. Which catalogue entry a
snapshot row IS travels on the low-frequency marker channel and is
cached render-side per E-05; the 20 Hz stride stays eight ints.

**Variance is an integer avalanche, not a stream.** `variantIndex` hashes
the vehicle id (two xor-multiply rounds) modulo the manifest-declared
variant count, so the same vehicle wears the same body on every machine,
frame and reload - deterministic per-vehicle variance with zero contact
to any RNG stream (Z3 untouched). The grammar `vehicle:<id>:<n>` is the
building cells' own; the manifest declares no vehicle variants yet, and
the mechanism is tested against synthetic manifests so declaring one is
a data change.

**The contact shadow is baked, its falloff runs from the silhouette
outward, and it is clipped - both wrong versions were measured and
refused.** Every cell now carries a soft dark ground patch: full
strength over the footprint rectangle (which is what darkens the gaps
under a chassis and between bogies), fading quadratically over 0.5 m
beyond it, alpha capped at 88 so an opaque pixel still means a model
pixel, stamped only where the model left the cell transparent. The
first build was a centre-based ellipse: it produced NOTHING visible,
because over the body the geometry covers it and its outer rim - the
only part that shows - is where a radial falloff is already zero. The
second was unclipped cells extended to the footprint's projected ground
diamond: prettier, and it pushed zoom 2 from one page to two and zoom 4
from four pages to six - a 6.2 booking overrun (Fehlerkatalog 40) for
pixels a 3-px edge fade renders invisible. So the shadow clips to the
model's own rectangle with that fade, the page dimensions are
byte-identical to the D-169 booking, and the double-bake was
re-verified bit-identical on the full twelve kits. The patch is
symmetric, not skewed screen-SE with the NW light: the skew is
sub-pixel at every baked zoom and an asymmetric patch breaks the
180-degree facing pairs' exact width equality the tests pin. Under
every vehicle the renderer additionally draws the M13 soft ellipse - a
shared procedural gradient texture, tinted black at low alpha, sized
from the baked cell (fixed sizes under the white box) - subtle enough
that the two shadows compose.

**The tripwire was re-measured with the new work priced in.** The
draw-prep proxy now replays the facing decision (movement quantise,
cache, tile-step fallback), the variant hash and the spec-map lookup per
vehicle: measured p50 0.78 ms / p99 1.78 ms for the full 1,500-vehicle
block against the unchanged 5 ms median gate and 30 ms backstop (D-167)
- the facing atan2 and one Map hit per vehicle cost ~0.05 ms of median
over the M12 acceptance measurement (0.73 / 1.58), noise-deep under the
gate. Zoom selection stays out of the loop: the baked zoom index
resolves once per frame (`bakedZoomFor` - largest baked zoom not above
the display zoom, the D-163 no-upscale rule; the chunked zooms
0.5x/0.25x downscale the z1 pages exactly as the procedural base page
always has).

## M13 - living trains, bundle 3: consist rendering (2026-08-07)

### D-171 A ten-wagon train is ten wagons on the path the head actually drove, and the ring records only what the sprite has passed

E-05 ordered the mechanism - compositions on the marker channel, positions
derived render-side from a path-history breadcrumb ring, arc-length spacing
from the aggregate lengths, D-162's clamps, road/water/air single-sprite -
and this entry records the shape it took and the six choices inside it.

**The composition already travelled the marker channel, so nothing was
extended.** SPEC2 M13 orders the consist list onto the fleet markers;
`VehicleMarker.consist` has carried exactly that - catalogue ids in coupling
order - since M3, for the fleet panel. Bundle 3 therefore changes zero
protocol bytes: `MapView.setFleet` now READS the field it always received
and caches it per vehicle id (the E-05 pattern D-170 established for
`specId`), and the 20 Hz stride stays eight ints (Fehlerkatalog 37). The
cache is RECONCILED, not rebuilt: the fleet refresh arrives daily, and a
refresh that recreated the rings would wipe every train's path history once
per game day - only a changed composition re-derives the distances, only a
vanished vehicle drops its entry, and an id the catalogue cannot resolve
falls back whole to the single sprite rather than drawing a train with
holes.

**The ring records the generation that just became PREVIOUS, so it never
holds a point ahead of the drawn sprite.** The interpolated head glides
BETWEEN the two newest generations (D-162); a ring fed the newest sample
would start with a segment pointing forwards, and the tail walk would place
the first wagon in front of the locomotive whenever alpha is small. On each
generation swap (`observe` now reports the 20 Hz edge; ring maintenance
never runs per rendered frame) the recorder walks the compacted previous
block once and offers each consist head its sample: the ring keeps it only
when it lies a spacing floor (0.25 tiles = 12.5 m, half a short wagon) past
the newest crumb - a standing train records nothing - and RESETS when it
lies past the teleport distance, which is deliberately the exported
`TELEPORT_TILES_SQ` of the head's own snap rule: one threshold, one truth,
and the whole consist cuts together (D-162's clamp extended to the tail).
Capacity is derived, not chosen: enough crumbs at the spacing floor to
cover `MAX_TRAIN_LENGTH_M` - the sim's own consist ceiling - with samples
recorded at generation cadence only ever SPARSER than the floor, so a full
ring always spans the longest legal train.

**Wagons sit at catalogue arc lengths, walked in one pass.** The lead unit
draws at the head anchor - exactly where the single sprite always drew, so
bundle 2's calibration is undisturbed - and follower k's centre sits half
the lead's length, every unit between, and half itself behind it
(`consistFollowerDistances`, from `vehicleSpec().lengthM`, the aggregate
lengths the composition names). The walk (`placeConsist`) consumes ring
segments once for the whole consist because the distances are ascending by
construction; each wagon takes its position AND its facing from its own
segment - `facingFromDelta` over the segment's forward direction, which is
what makes a train bend around a curve wagon by wagon instead of pivoting
whole - and its draw-order key from `drawOrder(round(fx), round(fy),
round(h), Vehicle)`: rounding IS `vehicleDrawOrder`'s half-way handover
rule, so a hill occludes the tail before the head exactly as it occludes
two separate vehicles.

**Where history runs out, the tail is a straight line, stated as the honest
floor.** A fresh spawn has an empty ring; a loaded world starts every ring
empty; a teleport reset leaves one crumb. The unplaceable remainder extends
straight backwards along the last known segment (or the head's facing, or
east - a total answer), at the last known height, and heals into the real
curve as crumbs accumulate. The alternative - reconstructing a plausible
path from the track graph - was rejected: the renderer draws what the
simulation published (D-162), and a guessed path through a junction is a
lie precisely where a lie is most visible. Corner cases (empty ring, short
history, teleport, wrapped ring, degenerate head segment) are pinned in
`tests/unit/consistArt.spec.ts`; everything in `consistArt.ts` is pure and
preallocated - the per-frame path allocates nothing, and the placement
scratch is sized by the sim's own `MAX_CONSIST_UNITS`.

**One placement routine serves every unit, and the fallback draws ten
boxes.** The sprite pool hands out shadow/body/mask triples by a running
cursor now (a rail row is its whole consist, so row-indexed slots died),
and `placeVehicleUnit` is the M12 single-sprite path extracted verbatim: a
wagon resolves its baked cell, two-pass tint and contact ellipse through
exactly the code that serves its locomotive, per-unit variance seeded
`vehicleId + unitIndex`. A build without a bake draws the white train box
per unit - E-14's floor holds with no special case, and a ten-wagon train
is ten visible somethings on every machine. Road, water and air never
enter the consist map (their markers carry empty consists; the map is
keyed rail-only), and the 0.25x abstract mode stays one dot per TRAIN:
16.1's overview names vehicles, not wagons, and 750 extra dots would be
noise at the zoom made for reading networks.

**The tripwire was re-measured against a rail-heavy scene, and the gate was
re-derived rather than eaten.** The draw-prep proxy now prices the consist
work per rail vehicle - the breadcrumb record (every frame, though the real
recorder runs only on the publish edge), the placement walk over a ring
pre-walked around a corner, per-wagon facing and draw-key writes - in a
scene of 750 ten-wagon coal trains among 1,500 vehicles: 9,000 placed
units, six times the rail load of the perf fixture's 150 trains. Measured
on the reference machine (Ryzen 5 7520U, Node 24): clean median 2.4-2.5 ms
over three runs, clean p99 4.7-5.4 ms, against the old 5/30 gates that had
been derived from the 0.75 ms pre-consist median. Leaving a 2.1x gate
would have re-created exactly the zero-headroom trap D-167 exists to kill,
so the median gate moved to 10 ms (4x clean, the same generosity the old
gate had over its own scene) and the backstop to 60 ms (an order of
magnitude over clean p99, the rebuild backstop's own ratio). Render-only
throughout: zero sim bytes, zero save bumps, zero snapshot changes - the
one permitted M13 layout bump (`IndustryMarker.level`) belongs to the
particle bundle, not this one.

## M13 - living trains, bundle 4: the emissive layer (2026-08-07)

### D-172 Light is the tint curve read backwards, glazing is one kit-wide convention, and the chunk glows through a baked twin

SPEC2 M13 orders the full day/night of SPEC.md 16.3: an emissive atlas page
for the baked cells, window-only regenerations for the procedural ones,
street lamps, headlights, additive compositing ramped by the D-127 curve,
luminance-based modulation tested against both palettes. This entry records
the shape it took and the seven choices inside it.

**The ramp IS the tint curve, read as missing luminance.**
`emissiveIntensity` (dayNight.ts, beside the curve it derives from) is the
tint's missing Rec.-709 luminance normalised so the night plateau reads
exactly 1 - not a second keyframe list that could drift against the first.
One source of truth, literally: lights come on precisely as fast as the
world darkens, 0 through the whole day plateau, ~0.42 in the dusk glow, 1
through deep night, and the caller feeds it the same interpolated phase the
tint reads (D-162), so both ramps share every frame's sub-tick position.
That derivation is also what "luminanz-basiert" means here, and the test
holds the other half of that sentence against BOTH company palettes: every
lightness distinction the colour-blind palette promises (17.4) survives
every tint of the curve with at least 60 % of its luminance gap and its
order intact - checked pair by pair, because two of its eight entries are
deliberately hue-separated, not lightness-separated, and a test that
demanded a total luminance order would be asserting a promise the palette
never made.

**Every glow sits INSIDE the tinted world container, and the night dims it
a little - stated, measured, accepted.** The alternative - an emissive
layer beside `art`, exempt from the D-127 tint - would glow at full warmth
but float above the painter order: a hill in front of a lit house would
occlude the house and not its windows. So the glow sprites are pool
sprites with additive blending, interleaved by the same drawOrder keys as
the cells they sit on (placed right after their building, so the stable
sort keeps the glow on its own facade), and the night tint multiplies the
addition. The cost is measured in the dayNight suite: the lit-window
colour under the deep-night tint still ADDS 0.56 of luminance at full ramp
(alpha 0.85) and stays warm (r 184 over b 128) - a window reads as a lit
window through the cool cast, and occlusion stays exact. EMISSIVE_MAX_ALPHA
is deliberately under 1: full addition clips warm pixels to white.

**Glazing in the bake is ONE manifest-level hue band, because the kits
agree.** A scan over all 145 mapped models found window glass to be the
same sky-blue colormap ramp in every pinned kit - hue 212-216 at HSL
saturation 0.62-0.83 - and the only saturated-blue non-windows to be two
livery hulls, which the tint-wins precedence already protects (paint does
not glow; classification reads AUTHORED colours, before any D-169
recolour). So `tools/assets-manifest.json` declares one root-level band
(205-225, min saturation 0.55) instead of 145 per-model blocks, models can
still override per entry if a kit ever disagrees, and the emissive pass
renders matching faces UNSHADED in one fixed warm lit colour
(EMISSIVE_LIT_RGB = #ffd98c, restated from emissive.ts under the D-160
coupling test) - the daylight glass tone is a sky reflection, and a window
that glows sky-blue at night reads as a monitor wall. The pass mirrors the
mask pass exactly: the depth WINNER decides, so glazing behind a wall
stays dark, and whether a facing gets a twin cell at all is decided on the
PIXELS - glazing that never survived occlusion books no page area. Baked:
548 twin cells per zoom out of 810 (coach windows, cab glazing, bridge
windows, building and industry facades), packed as their own page set per
zoom - z1 4090x568, z2 4088x1498, z4 4095x4040 plus 3826x1396, ~235 KiB,
booked in SPEC2 6.2 page 2 - with the trio (page, x, y) stamped on the
base cell so the render side never matches anything up. The manifest
version moved to 2 in bake-lib AND loader (coupling test): a stale
version-1 bake is refused whole and the game runs procedural until the
next `npm run assets:bake`, which is D-160's unknown-version rule doing
its job rather than a compatibility break. The double bake on the twelve
kits was re-verified bit-identical over all ten pages.

**The procedural twins are the same drawing code with everything but the
glazing skipped.** SPEC2 says "windows() kennt die Positionen", and that
stays true only while ONE place says where the windows are: the six
town-building cells and the three glazed industries regenerate through
their own draw routines under an emissive-only flag (`drawTownBuilding`,
`sawtoothRoof glassOnly`, the extracted WINDOW_SPECS of industryArt), so
the lit windows sit pixel-exact on the dark ones by construction. They
spend one new row on the BASE page - booked in SPEC2 6.2, page 0 now
2176x3648 of 4096, the layout test re-pinned - and exist there ONLY: the
detail page stands at 4096x3840 (D-163) and has no room for another tall
row, so the 4x zoom upscales its glow exactly as it upscales its water
(D-164's argument; a glow is low-frequency and the upscale is invisible
where a wall texture's would not be). The unglazed industries have no twin
and draw no glow: a coal heap at night is dark, and that is the honest
cell.

**Street lamps are a parity rule on town road tiles, and the light is the
glow, not a mast.** `lampOffsetForRoadTile` (emissive.ts, pure, tested):
road bits plus (x + y) parity - along ANY straight street the parity
alternates, so every second tile carries a lamp and an avenue is a chain
of pools rather than a wall of light. A straight road is lit down one
FIXED side (east-west on the northern verge, north-south on the western),
junctions take the centre island; only tiles with `townId >= 0` qualify,
so the country stays dark and a town reads as a town from a distance. The
lamp itself is a procedural radial glow texture (the makeShadowTexture
pattern, no atlas booking) - deliberately no lamp POST: a mast is daytime
world art that would change every chunk checksum and belongs to the
static-building bundle if it ever earns its pixels.

**Headlights are eight pre-baked ground cones on the interpolated
position.** `headlightGroundPoints` opens a symmetric cone in TILE space
around each facing's travel direction (length 0.85 tiles, half-angle 0.42
rad, pure and tested); attach projects the three corners through the 16.1
projection into eight little gradient textures, so a cone pointing up the
screen is foreshortened exactly like the road it lights. The cone follows
the vehicle because it is placed from the same interpolated worldX/worldY
as the body sprite, every frame; only the LEAD unit of a consist carries
one, and only underway - `headlightsOn` is Driving and Braking, pinned
against VehicleState in the test, so a loading lorry, a broken-down train
and a depot sleeper stand dark. The cones work on the white-box fallback
too: the facing is known either way (E-14's floor keeps its lights).
Baked vehicle cells additionally draw their emissive twin as a fourth
sprite in the slot (shadow, body, mask, glow, light - one zIndex,
insertion order under Pixi's stable sort): a night passenger train shows
its coach windows, which is the M13 headline sentence made visible.

**At 0.5x the chunk glows through a baked twin, measured against the live
alternative - the D-164 pattern, and the same winner.** A full-profile
chunk bake collects its window and lamp placements into a second bake tree
during the SAME tile walk and renders them into a second RenderTexture;
the visible chunk then carries one additive sprite whose alpha IS the
ramp, half a diagonal above its own chunk (the D-161 painter argument
covers the twin, since it never paints outside its chunk's columns). The
CPU proxy prices the walk at p50 0.052 ms / p99 0.25 ms per busy chunk
(183 glows); the rejected alternative - live glow sprites above the
chunks, the rebuildMarkers pattern - would pay that walk for every visible
chunk on every pan-rebuild (~0.94 ms for a 0.5x viewport's 18 chunks) AND
keep ~3,300 additive sprites in the per-frame draw, which is exactly the
per-frame bill chunking exists to delete (D-164 measured the same shape
for water and refused it). A dawn ramp costs one alpha write per visible
chunk per frame; a water-row rebake CARRIES the twin through unchanged
(ripples move, windows do not); eviction and invalidation recycle twin
textures through their own freelist. The 0.25x abstract mode draws no
emissive at all - 16.1 strips detail there by design.

**Off means off, and the toggle re-places the world.** With the D-127
setting off, `emissiveNow` is a constant 0, the rebuild places no glow
sprite, the chunk bake collects no twin, the vehicle path skips glow and
cone - no emissive work runs, not even invisible sprites. Toggling the
setting invalidates the sprite pool AND the chunk caches (a settings flip
is rare; a stale un-glowing chunk texture surviving into the night is a
visible bug on a timer). While the setting is ON at noon the twins are
still baked with their chunks - intensity gates the DRAW, not the bake,
because a bake happens on the chunk cadence and dusk arriving must not
trigger a rebake storm of every visible chunk.

The perf suite gained the emissive-walk tripwire (median 2 ms over the
0.05 ms clean measurement, backstop 20 ms - D-167 generosity); rebuild,
draw-prep and chunk-bake proxies are unchanged and stay green. Render-only
throughout: zero sim bytes, zero save bumps, zero snapshot changes - the
one permitted M13 layout bump (`IndustryMarker.level`) still belongs to
the particle bundle. i18n untouched: the feature ships behind the existing
day/night setting and adds no user-visible string.

## M13 - living trains, bundle 5: signal aspects and catenary (2026-08-07)

### D-173 The aspect is the F3 claim read at the lamp, the four kinds wear four silhouettes, and the wire hangs one layer above the trains

SPEC2 M13 orders signal aspects red/green from the reserved-tile block plus
the render-side BlockIndex, the four signal kinds readable apart by post
silhouette, and catenary masts on electrified track. This entry records the
shape it took and the eight choices inside it.

**The aspect is a pure derivation over exactly the two inputs F3 draws, so
the world art cannot disagree with the debug overlay.** `signalAspect`
(src/render/signalAspects.ts) reads the published reserved block - the
16 KiB the section-9.3 overlay has always drawn - bucketed into a
claimed-block set by the SAME BlockIndex instance MapView colours F3 with.
A signal shows RED when its own tile's block is claimed (a signal tile is a
block of its own, blocks.ts, so a train granted passage reddens the lamp
while still approaching) or when the block behind a guarded entry holds a
claim; a one-way signal guards only the side it is passable towards - a
claim behind its back is somebody leaving and changes nothing it promised.
Everything else is green. The agreement is a TEST, not an intention:
`signalAspects.spec.ts` re-derives the expectation tile-by-tile from the
raw reserved list (the exact tiles F3 fills) over empty, partial, full and
renumbered claim tables. The set rebuilds on the 20 Hz publish edge and on
a map revision (a BlockIndex rebuild renumbers, so a set keyed by block id
dies with it), never per frame; per visible signal an aspect change is one
texture swap and one glow tint - the waterSlots device.

**Found and fixed while wiring it: the render-side BlockIndex was
zero-sized since M4.** `MapView` constructed `new BlockIndex(0)` and
nothing ever resized it, so `blockAt` answered `undefined` for every tile
and F3's per-block colouring silently collapsed (undefined survives the
`< 0` guard and indexes the palette with NaN). A defect under the
project's own first rule - never written down, now fixed: `setMap`
allocates the index at the map's tile count, and the aspects inherit a
BlockIndex that actually segments. The overlay's occupancy fill and the
deadlock blink never read `blockAt` and were correct throughout.

**The four kinds are silhouettes, not tints (D-117 applied to
signalling).** Block signals wear a disc head, path signals a diamond
blade, and the one-way kinds add an arm - drawn procedurally into one new
base-page row, because no pinned Kenney kit carries a signal (checked
against the Train Kit's model list; E-14's gap rule says procedural). The
arm is deliberately GENERIC, never a compass: eight direction variants
would cost eight cells per one-way kind for a detail the tile panel
already answers with a screen-oriented arrow (D-126); the silhouette says
WHAT stands here, the panel says which way. The waypoint marker keeps the
old plain white post (D-141) - a mode tint over a kind silhouette would
mix two alphabets.

**The lamp is a position first and a colour second.** The post cell draws
the housing with BOTH lamps dark; the aspect cell lights exactly one - red
above, green below, the real-signal convention - so the aspect survives
any colour vision, and the hues are the colour-blind safe pair of the
shared palette (bluish green 0x009e73, vermilion 0xd55e00, section 17.4),
one tint table in signalAspects.ts that the atlas drawing derives its hex
strings from. At night the LIT aspect joins the emissive pass exactly as
D-172 built it: a small NEUTRAL radial glow texture (the lamp-pool
pattern, no atlas booking), tinted by the aspect, additive, alpha driven
by the shared ramp - and re-tinted in the same pass that swaps the lamp.

**Aspects exist where the posts are readable sprites - 1x and above.** The
chunk bake (0.5x) draws the kind silhouette but no lamp: claims are
per-tick truth and a baked copy would lie within seconds, a live lamp
would be under two pixels, and the F3 overlay stays the overview's truth -
the D-165 argument (station labels vanish exactly where their modules do).
The chunked path clears the aspect records so the per-frame pass never
touches pool sprites that now belong to the markers.

**Catenary is a wire one layer above the trains, and the mast yields.**
`DrawLayer` grew its last free slot (Catenary = 7, above Vehicle): the
wire hangs OVER the train, so drawing it after the vehicles of its own
tile is the honest painter order, and the mast stands on the viewer's side
of the track by construction - `catenaryMastOffset` (catenary.ts) flips
the perpendicular so its screen depth is never negative. Masts stand on
every second plain-line tile (junctions refused - a portal in a throat
would straddle the crossing; the D-055 measure reused), and the
alternating axis follows the run: no single parity alternates along all
eight directions (the diagonal steps defeat any linear form - measured in
the test, not assumed), so x-moving runs alternate on x and pure
north-south runs on y. A signal or waypoint tile keeps its post and drops
the mast; bridges carry the wire at deck height and no mast - a deck has
no verge. The wire cells are the track cells' own half-segment geometry
lifted to wire height (eight cells, meeting over the rail joint by
construction); the mast is a new shapes.ts primitive (`catenaryMast`),
strokes not solids, with a screen-horizontal cross-bar because one cell
serves every orientation. Electrified-only, keyed on the sim's own
`RailType.Electrified` (restated once as `CATENARY_RAIL_TYPE`); rail type
has been in the chunk checksums since D-161 for exactly this day, so an
electrification dirties precisely the chunks it touched and nothing else
moved.

**The atlas bookings are spent and recorded (Fehlerkatalog 40).** One new
base-page row (4 posts, 2 aspect lamps, 1 mast, 8 wires - 15 cells) takes
page 0 to 2176x3840 of 4096; on the detail page the same 15 cells are
SHORT rows and fill the track row's eight free columns plus the last
256 px row - 4096x4096, the page is full to the byte, and SPEC2 6.2 now
says so: any further detail cell needs a new page booking. Unlike the
water and emissive rows these cells exist on BOTH pages, because thin
poles and one-pixel wires are exactly what a 2x upscale smears where a
low-frequency glow forgives it.

**The tripwires were re-measured with the new work priced in.** The
rebuild proxy now replays the catenary branch and the aspect decision per
placed lamp on an all-electrified fixture: median 1.9 ms against the
unchanged 10 ms gate (was 1.63 clean pre-B5 - the furniture costs ~0.25 ms
of median on a scene denser than any real one). The chunk-bake proxy
gained the same furniture minus the lamps (3,046 placements, median
0.55 ms against 3). A new aspect-refresh tripwire prices the per-publish
pass - the claimed-set collect over 704 reserved tiles plus the decision
for 99 signals, all red (the branch that walks every guarded entry):
median 0.03 ms, gated at 2 ms with a 20 ms backstop (D-167 generosity).
Render-only throughout: zero sim bytes, zero save bumps, zero snapshot
changes - the one permitted M13 layout bump (`IndustryMarker.level`)
still belongs to the particle bundle. i18n untouched: no new user-visible
string.

## M13 - living trains, bundle 6: the working world (2026-08-07)

### D-174 The permitted layout bump was already spent in M5, the smoke is the level field made visible, and the cap is a budget rather than a hope

SPEC2 M13 orders the industry-life bundle: the milestone's ONE permitted
snapshot-layout bump (`IndustryMarker.level`), the capped particle system
(chimney smoke by production level, exhaust by throttle, breakdown smoke by
state), the status badges over troubled vehicles, and the still-image
distinguishability of a dormant versus a booming industry. This entry
records the shape it took and the six choices inside it.

**The one permitted layout bump turned out to be spent since M5 - zero
protocol bytes change, and that is recorded, not hidden.** The ledger row
booked "+`IndustryMarker.level` (Layout-Bump)" for this bundle; the field
has travelled the marker channel since the industry clock of M5
(`level: open ? productionLevel : 0`, commit b823519), `structureSignature`
already folds the level sum so a level change re-sends the markers within a
publish, and every consumer - tile panel, lists, delivery panel, minimap,
tutorial, MapView - reads it today. The D-171 precedent repeats
(`VehicleMarker.consist` was equally found already aboard): the honest
outcome is that `SNAPSHOT_LAYOUT_VERSION` stays 6 and `SAVE_VERSION` stays
24, because bumping a version whose layout did not change would teach the
version to mean nothing. What the bundle DID change: the marker assembly
moved out of SimWorker into `src/sim/markers.ts` (pure state-to-protocol
mapping, no worker globals), so the level round trip the ledger cites is a
unit test (`industryMarkers.spec.ts`) instead of an untested closure inside
the one file no test can import.

**One capped ParticleContainer, and the cap is enforced where the CPU is
spent.** The pure half (`particles.ts` - the emissive.ts/water.ts split) is
a preallocated `ParticlePool` of exactly `PARTICLE_CAP` (2000) rows with
swap-remove expiry; `spawn` REFUSES at the cap, so emitter overload means
the oldest puffs live out their lives and new ones are dropped - never an
allocation, never a growing frame bill. MapView mirrors the pool into ONE
`ParticleContainer` of 2000 preallocated particles (adding and removing
children would rebuild the container's buffers; dead rows sit at alpha 0),
as the LAST child of `art`: smoke takes the D-127 day/night tint like the
world it rises from, and one batched container deliberately cannot
interleave the 16.1 painter - a plume drifts over a hill that stands in
front of it, accepted because smoke lives above roof height and the honest
alternative is a sprite per puff, exactly the per-frame bill the container
exists to delete. The 0.25x abstract mode runs no particle work and clears
the field once (16.1 strips detail there by design); vehicle-sourced
particles and badges gate at 1x, the D-165 argument.

**Every emitter reads sim truth, every jitter reads a counter.** Industry
smoke rises from `INDUSTRY_SMOKE_ANCHORS` - the WINDOW_SPECS device applied
to stacks: the drawings themselves now consume the same table their
emitters do, so the puff leaves the pixel the chimney was drawn at by
construction. Eight industries smoke (the three diggers vent dust in their
heap's own tone, the five combustion works smoke from their stacks); a
builders' merchant stays honestly smokeless. Cadence comes from the marker
LEVEL (`smokePeriodForLevel`: nothing at 0, a puff per 16 frames at the
sim's base level 100, per 8 at the 200 ceiling), exhaust from
`vehicleThrottle` - the audio engine's throttle proxy, moved to
particles.ts so sound and smoke read ONE formula - and breakdown smoke from
the State field at a dense fixed period. Spawn cadence and jitter key on
the blink counter plus integer avalanche hashes over emitter ids
(Fehlerkatalog 25/39): no RNG stream is touched, no wall clock read, the
same frame sequence reproduces the same smoke, and the E-05 caveat carries
over verbatim - two screenshots of the same TICK may differ in particle
phase, and a paused game keeps shimmering water AND rising smoke, both on
the same counter.

**A dormant works and a booming one differ in a still image, by day and by
night.** By day the plume density IS the level (steady-state puffs per
stack roughly double from level 100 to 200, none at all at 0 - pinned by a
headless run of the exact emitter loop). By night the D-172 window twins
join in: `markEmissive` grew a per-slot factor and the industry twins pass
`industryGlowFactor(level)` - a closed works is dark (factor 0), an open
one brightens with its level towards 1. Coordinated with bundle 4 rather
than duplicating it: the factor multiplies the existing ramp alpha, and
windows, lamps and chunk twins are untouched at factor 1.

**The badges keep the game's one definition of stuck.** `badgeForState`
(badges.ts, state values pinned against `VehicleState` by test - the
interpolation.spec.ts device): a breakdown chips immediately, `NoRoute`
chips as stuck immediately (the simulation already said it cannot move), a
`WaitingForPath` vehicle chips as stuck only past `DEADLOCK_WARN_TICKS` -
the section-9.3 clock the F3 blink and the news already use, because a
second, shorter definition of "stuck" would cry wolf at every ordinary
signal halt - and `Stopped` earns the "no orders" chip. The render side
accumulates published tick deltas per vehicle id on the generation edge
(clamped per edge, so a loaded world's tick jump cannot promote every
signal wait to an alarm; the counter restarting at zero errs towards
silence). The chips are procedural canvas shapes - hourglass, exclamation
mark, ellipsis on 17.4-palette colours; glyphs from a font would render
differently per platform - world-positioned but counter-scaled to
screen-constant size, in a layer OUTSIDE the D-127 tint above the overlay:
a diagnostic is interface, and interface does not dim at night.

**The budget is measured at overload and the gate is the SPEC's own
number.** The perf suite gained the particle tripwire: pool pinned at the
cap with churning lifetimes, 300 booming industries and a full
1,500-vehicle block emitting every frame - spawn writes, refusals, the
full step and the full mirror loop all priced. Measured clean (reference
machine, Ryzen 5 7520U, Node 24): p50 0.32 ms / p99 1.30 ms. The median
gate is 2 ms - for once the acceptance sentence ("<= 2 ms Frame-CPU, im
Tripwire") and the D-167 generosity rule agree, since the budget is over
six times the clean median - with the usual 20 ms backstop. Render-only
throughout, in the strictest sense the milestone allows: the one sim-side
file touched is the marker-assembly extraction, which moves worker code
verbatim; zero save bumps, zero snapshot changes, and the determinism
suite never sees a puff. i18n untouched: the badges are glyphs, not
strings.

## M14 - instruments, bundle 0: M13 verifier cosmetics (2026-08-07)

### D-175 The mail2 wagon moves off the pantographed EMU middle onto the covered-van body - D-169's own rule applied to its one miss

The M14 verifier pass caught a wrong silhouette the D-169 register had
waved through: `vehicle:1511` (mail2, an unpowered wagon, intro 1985) was
mapped onto `train-electric-city-b.glb` - the one EMU middle in the kit
that CARRIES A PANTOGRAPH (measured: the model stands 2.219 units against
1.683 for its a/c siblings, and the extra half-unit is a narrow roof
frame). A pantograph on a hauled mail van claims traction the catalogue
entry does not have - exactly the wrongness that moved the diesel
railcars onto the pantograph-free subway bodies and pax1 off the city-c
EMU head in D-169. The recolour was dishonest twice over: the note said
"yellow-shifted accents", but shifting the body's measured 229-degree
slate blue by +60 lands at 289 - the old mail2 was purple.

The remap follows the kit's own covered-van convention: mail2 is now
`train-carriage-container-blue.glb` - the body D-169 already uses for
box1/2 and reefer1/2, "no covered van/mail stock exists" being one gap,
not two - recoloured to postal yellow (hueShift 180 from measured hue
229 to ~49, saturation 2.0, value 1.05) at the same one-size-up scale
10.5 that marks the modern generations. The coupling test held
throughout (every catalogue id mapped exactly once); pax3 KEEPS city-b,
because a pantographed middle coach inside an electric consist is an
honest silhouette - the fault was the traction claim on a mail van, not
the model.

Re-bake evidence and the honest re-booking (SPEC2 6.2 updated; the
6.1.1 M13 row stands untouched as the acceptance history it is):
double bake bit-identical by SHA-256 over all eleven output files, 145
models -> 10 pages, 810 cells per zoom, one zoom GPU-resident -
unchanged. Page geometry moved with the lost pantograph headroom and is
re-booked: z1 base 4096x1057 (was x1067), z4 page 0 4056x4015 (was
4062x4063); z1 emissive 4096x568 (was 4090), z4 emissive 0 4082x4034
(was 4095x4040); z2 dimensions unchanged. Emissive twins move from
543/550/551 to 545/552/553 per zoom (z1/z2/z4): the container body's
glazing detail survives occlusion in all eight facings (as it already
does for box1/2 and reefer1/2), where the city-b middle kept six. The
6.1.1 M13 row's flat "548 je Zoomstufe" matched no single zoom when
re-measured before the remap (543/550/551) - the occlusion decision is
per facing per zoom and the counts differ; the per-zoom truth stands in
6.2 with the new numbers now. No byte under
`src/`, no save, no snapshot, no i18n; the game reads whatever
`baked-manifest.json` the bake wrote (D-170), so the remap is complete
at bake time.

## M14 - instruments, bundle 1: the FlowMarker snapshot block (2026-08-07)

### D-176 The flow atlas measures the leg-sample window, rides the one publish pass, and no simulation decision may read it back

SPEC2 M14 wants the section 7.4 connection graph renderer-visible:
station-pair legs with measured volumes and leg times, the data the flow
arrows draw from. Three decisions shaped the block.

**The volume window is the graph's own eight-trip ring, not a
twelve-month one.** The task left the choice open; the evidence closed
it. `cargo/linkGraph.ts` measures a leg as the mean of its last eight
completed trips (LINK_SAMPLE_COUNT, arrival to arrival, D-077), so a
volume recorded per trip over the same window describes the SAME
journeys the time does - one staleness rule, one acceptance filter (a
trip whose time is rejected records no flow either). A per-leg
twelve-month ring would instead be new historical state: saved, it is a
second save bump beside the one Z5 grants M14 (the station
cargo-history ring owns v25) and a second twelve-month mechanism beside
that very ring (the Fehler-26 shape); unsaved, a year of arrow widths
would evaporate on every load. The eight-trip ring loses at most eight
trips' worth on load and re-measures within one round per leg - the
honest price, stated in the block by the row's own Measured flag.

**Display-only is a build property, not a promise.** The rings
(`flowUnits`/`flowTicks`/cursor, plus last owner and line) live on the
in-memory link, are never serialised (the CargoLinkSave shape is
field-for-field the v24 one - asserted in the test), never hashed
(bending a ring provably leaves `hashWorld` fixed), and are read by
exactly two files: the graph that records them and `sim/flow.ts` that
writes the block. `tests/unit/flowExport.spec.ts` walks every file
under `src/sim` and fails the build the day a pathfinder or a rating
starts reading the flow vocabulary - that would be a world rule fed by
an unsaved layer, Fehler 23/24 in one move. The exporter is extracted
from SimWorker exactly as the marker assembly was (D-174), so the perf
suite can price it and a unit test can hold its rows; SimWorker calls
it from the SAME publish pass as every other block (Fehler 33 - never a
second pass), and the tick never sees it.

**One layout bump carries everything the M14 render needs.** Snapshot
layout v6 -> v7: a FlowCount field (the i32 block rounds 15 up to 16)
and a stride-8 row per active directed leg - stations, volume, oldest
trip tick, mean ticks, measured flag, owner, line - capped at 4,096
rows on the reserved-tile rule (past the cap the atlas stops drawing,
the simulation never slows). Owner and line ride along because the M14
MUSS colours the arrows by company/line, and shipping the block without
them would force a second layout bump inside the same milestone.
OldestTick exists because a volume without a window is not a flow:
eight full buses last week and eight full buses last year must not draw
the same arrow, so the reader (`currentFlow`, tagged with the frame's
own tick read from the same generation) can turn units into units per
day. The load a trip records is what the vehicle had aboard AT arrival,
before unloading - the leg moved it, so the leg gets it; an empty run
records a zero and thins the arrow honestly.

Measured on the reference machine against the 1,500-vehicle fixture
(420 active legs, the fixture's real graph): **median 0.060 ms, p99
0.285 ms per publish** against the ledger's <= 0.5 ms allowance - the
6.1 M14 row's snapshot promise, delivered at an order of magnitude of
headroom. The tripwire gates the MEDIAN at the 0.5 ms allowance itself
with a 5 ms p99 backstop - the M13-particle case where the gate IS the
budget, with headroom instead of against it (D-167). Tick p50/p99
1.393/3.232 ms sit on the M10 baseline (1.45/3.26): the extended
`observe` signature and the per-arrival load sum cost nothing the
fixture can see. The determinism pins did not move - the rings are
deterministic state the digest deliberately ignores, and no decision
reads them. The three-line transfer network of the Fertig-wenn sentence
is a reusable helper (`tests/helpers/transferNetwork.ts`), built for
bundle 2 to reuse on the same stations. No i18n: the block carries
numbers, and every string above it belongs to the panel bundles.

## M14 - instruments, bundle 2: the flow atlas rendered (2026-08-07)

### D-177 The flow arrows are an event-driven vector layer outside the tint, the bow's fixed chirality separates every pair, and the minimap's Fluss mode is one more case of the one painter

SPEC2 M14's render half of the flow atlas: curved company-coloured
arrows over the measured legs of the D-176 block, width proportional to
volume, a top-N cut with an honest remainder, and a minimap mode that
inherits into the save thumbnail. Five decisions shaped it.

**The layer is a world-space Graphics sibling of the art container -
outside the D-127 tint, above the chunks, never baked.** The atlas is an
instrument, and instruments do not dim at night (the F3 precedent);
flows are dynamic, and D-161 bakes only what moves with the map
revision, so the arrows live above the chunk path at every zoom and the
chunk checksums never hear of them. Drawing in WORLD coordinates makes
every camera pan free - the container transform moves the arrows - and
zoom is the only camera fact that forces a redraw, because widths and
arrowheads are screen-constant (divided by zoom), which is what keeps
the diagram readable at 0.5x and 0.25x over the M12 chunks.

**Redraws are decided by a checksum, never by a frame or a publish.**
`flowHash` (FNV-1a 32 over the used rows plus the count) is refreshed on
publish edges only - the 20 Hz ceiling - and the layer is rebuilt when
the hash, the zoom or the station list moved: the D-161 pattern one size
down. A completed trip somewhere redraws once; an idle world redraws
never. The rebuild itself is priced in the render tripwire at the
4,096-leg megagraph (hash + top-N cut + full arc geometry for the drawn
set): p50 0.32 ms, p99 0.93 ms against a 3 ms median gate (D-167). The
top-N cut is a bounded insertion selection rather than a sort - one pass,
allocation-free, O(1) skip under the kept minimum; the sort it replaced
measured 2.8 ms median at the megagraph, the selection 0.32 ms with a
bit-identical result (same checksum), and the difference matters because
a busy world can move the hash on every publish.

**The bow direction is the perpendicular of travel, always the same
rotation - pair order needs no bookkeeping.** A->B and B->A negate the
travel direction, so one fixed +90-degree rotation puts their arcs on
opposite sides BY CONSTRUCTION: no pair table, no tie to break, and the
same leg always bows the same way in every save and on both minimap and
map. The bow grows with the chord, clamped to a floor (short pairs still
separate) and a ceiling (a cross-map leg does not swing over a region).
Arrowheads are gated at 0.5x and above - at 0.25x a head is noise on a
three-pixel arc (the D-165 zoom-gating argument); the tip's tangent is
the quadratic's own (endpoint minus control), so the head lies exactly
on the curve it finishes.

**Colour is the company first, the line second, the estimate never
either.** The Okabe-Ito company palette is deficiency-safe as a set
(palette.ts), so the atlas needs no CVD variant of its own; lines of one
company shade the base colour towards white in four deterministic steps
of the line id - tellable apart at a junction, company still dominant.
A leg nobody drove (OwnerId -1, the D-077 seed) draws at minimum width
in the interface's muted grey at reduced alpha: an estimate must not be
misreadable as anybody's traffic, the same honesty the Measured flag
carries in the block. The cut set feeds the "x weitere" indicator
through a change-detected callback into the store (the onCamera
pattern): drawn arrows against active legs, so the player is told what
the cap hid rather than shown a graph that quietly lies by omission.
The A key toggles the overlay (D-114's table, "A" as in Atlas, free in
both languages), with a chip in the app bar as the visible switch.

**The minimap's Fluss mode is a new case of the ONE pure painter, and
the panel gathers.** `paintMinimap` gains a flows argument - straight
Bresenham lines between station pixels, brightness scaled by volume
against the picture's own maximum, endpoints blotted - and stays a pure
function of its inputs (D-112), which is exactly why the save thumbnail
inherits the mode for free and the tests hold it byte for byte. The
PANEL joins the block's rows to station tiles and caps them with the
SAME `selectTopFlows` the map uses (the minimap never shows a flow the
atlas would cut), re-reading the published block on a two-second clock
that runs only while the mode is showing - the megapixel repaint
follows completed trips closely enough, and per frame it would cost
more than the map (the D-112 argument). The mode joins the N-key cycle
by being under MINIMAP_MODE_COUNT - the M10 wiring needed no new code.
The old CargoFlow mode STAYS: it answers "where does cargo pile"
(stations by waiting, industries by level - what "Frachtfluss" could
honestly mean before the measurement existed); Fluss answers "what
moves where" now that it is measured. Two questions, two modes - not
the Fehler-26 shape, and the entry says so where the next reader will
look.

## M14 - instruments, bundle 3: the station x-ray + the cargo-history ring (2026-08-07)

### D-178 The cargo-history ring counts three per-cargo verdicts, accumulates in the month and is written by the monthly hook, and only the full digest pays for it

SPEC2 M14's one Z5 save bump (v25): twelve months of per-station,
per-cargo Int32 history. Three decisions shaped the state.

**Three counters, and they are verdicts, not events.** The task left the
exact fields open; what the panel and 10.1 genuinely ask closed them.
Collected is what left ON A VEHICLE - the D-085 measure, the number the
death spiral is about. Delivered is what arrived here as its
destination. Expired is every loss the station wore: platform decay, the
thirty-day write-off of routeless cargo, and cargo turned away at a full
door - the same three losses that feed `overflowUnits` and the decay
sweep, i.e. exactly what 10.1's overflow malus punishes, now visible per
cargo and per month. A transfer set-down is deliberately NONE of the
three: it is the same parcel passing through, and it will be somebody's
Collected on its next leg - per STATION the books stay honest.

**Events add onto Float64 accumulators; the monthly hook rounds them
into the ring.** Cargo amounts are fractional shares (a destination
split, a decay share), and rounding per event would systematically lose
the small ones - a two-unit-a-day decay would vanish entirely. So the
tick's own paths (loading, delivery, the daily sweeps) do one indexed
add into a preallocated per-station Float64 block (law #7: no
allocation, nothing read back), and `rollStationHistories` - on the
monthly hook, where every other monthly counter is read and reset -
rounds the finished month into the Int32 ring at the cursor and zeroes
the accumulators. The accumulators are SAVED AND HASHED like the ring:
a load mid-month must not silently drop half a month of history, and an
unsaved input to saved state is the Fehler-23 shape one storage class
down.

**The ring rides the FULL digest only - the tile-layer precedent.** The
D-134 audit demands every saved field be refused-when-missing and
seen-when-bent, and it is (the audit passes over the v25 payload
unchanged; the ring travels as plain numbers, never as a typed array -
msgpack would serialise an Int32Array as platform-endian raw bytes and
hand back a Uint8Array, the quiet corruption the corpus exists to
catch). But ~700 numbers per station on a monthly cadence do not belong
in the per-day LIVE digest, exactly as the megabytes of tile layers do
not: every event that moves the accumulators also moves a waiting stack
or the overflow figure, which `hashWorldLive` already covers, so the
live digest still moves when the world does. Pin and corpus were
re-recorded under their own protocols (D-137/D-130): canonical hash
`bbe572afe2880243` on v25, corpus manifest re-recorded with the
self-primed `v25-played.ironsave` - all four fixtures still decode to
one world hash, which is the migration (old saves get the zeroed ring a
pre-M14 world honestly had; the corpus wrap keeps real months) proving
itself container-shape-only for a stationless game.

### D-179 The x-ray displays the simulation's own terms, the preview asks the build's own join question, and the stations join the fleet cadence

The M14 station x-ray, and the rule all three halves share: the panel
computes NOTHING the simulation does not already compute.

**`stationRating` is now the sum of `ratingTerms` - the five 10.1 terms
were factored out, not duplicated.** The rating had all five terms
folded inline; the x-ray needs them singly; a parallel formula would
drift (the M14 order names this trap by name). So `ratingTerms` fills a
caller-provided record with the wait, frequency, equipment, reliability
and overflow terms, `stationRating` itself sums exactly those into the
old round(clamp(base + ...)) - the test asserts sum-equals-rating over
played and deliberately bent stations - and the marker channel ships
the record as computed. The warning sentence names
`dominantLossTerm`: the biggest gap to each term's maximum, ties to the
lower index so the sentence cannot flicker between two equal causes,
gated at RATING_XRAY_WARN_LOSS (5 points) so a healthy station is not
nagged about a half-point. One i18n key per term, de+en, because "serve
it more often" and "add a canopy" are different sentences, not
parameters of one.

**The catchment preview answers with the build command's own rules.**
The join rule left `commands/build.ts` for `station/types.ts`
(`joinTargetIdFor`, the command delegates to it), and the preview
composes it with the same D-095 centre rule (`centreOfModules`, which
`recomputeCentre` now delegates to) and the same radius rule
(`radiusForModuleCount`) - so the circle drawn before the click IS the
catchment the build produces, quay exclusion included, and the tests
hold command and preview to one answer. The overlay traces the
tile-space circle point by point at terrain height (a flat screen
ellipse lies on every hillside) with the D-095 centre marked, on the
existing per-frame overlay exactly like the route preview - no new
layer, no wall clock, nothing baked.

**Station markers ride the fleet cadence, and the ring travels sparse.**
The x-ray's wait term, waiting table and visit window all move without
anything `structureSignature` can see moving - a panel that freezes
until somebody builds is not an instrument - so `postStations` joins
the existing FLEET_REFRESH branch (one message per game day, the
cadence the fleet list already pays). The marker assembly moved to
`sim/markers.ts` (the D-174 extraction, so a unit test holds the rows
against the state), and history rows exist only for cargos that
recorded anything: most stations handle two or three of the eighteen,
and fifteen all-zero rows of thirty-six numbers per station per day
would be marker-channel weight for nothing. The aggregate `waiting`
number STAYS on the marker for the list, the minimap and the tutorial;
the PANEL's aggregate display is what the per-cargo table replaced, as
the milestone ordered.

## M14 - instruments, bundle 4: the statistics centre (2026-08-07)

### D-180 The value graph draws the yearly archive plus today, because a monthly company-value series is not honestly derivable

SPEC.md 14.1's "Firmenwert-Verlauf" - the one display of that section
still owed - and the M14 order to render it with axes and labels. The
first question was whether new sim state was needed, and the answer is
no: `CompanyState.valueHistory` has existed since M6 - one entry per
closed game year, capped at COMPANY_VALUE_YEARS (25), saved, hashed and
already shipped in the FinanceReport. The graph is that series plus ONE
live point, the company value right now, so the line always reaches
today instead of ending at last New Year.

A MONTHLY value series was considered and rejected as underivable: the
account rings record flows, but company value is a level - cash plus
book value minus loan - and construction moves it OUTSIDE the accounts
(a vehicle purchase books its whole price as an expense while raising
`fixedAssetsCt` by the same amount; net value change zero, recorded
change negative). Reconstructing month-end values backwards from the
24-month ring would therefore be wrong by exactly the capital spending -
the interesting part of a transport company's history. Saving a monthly
value ring instead would be more v25 state for a curve the yearly series
already shows; the 24-month DETAIL therefore stays what the archive
honestly holds - the cash-flow bars, which gained the labelled scale and
the covered months.

Rendering: inline SVG in the FinancePanel, main thread, no second
render path (the M6 div-bar argument extends: the value graph needs
axis lines and gridlines, which divs do badly and a canvas would
over-solve). The scaling lives in `ui/chart.ts` as pure functions -
the classic 1/2/5 nice-numbers axis, degenerate series made drawable
rather than rejected - pinned by `tests/unit/chart.spec.ts`, and the
axis labels use a compact money format (`formatMoneyCompact`) because
"1,2 Mio. EUR" fits where the full grouped figure does not.

### D-181 The vehicle detail displays what the simulation computes, and the depot call is a one-shot flag beside the schedule, not an edit of it

The M14 vehicle detail: age, reliability, breakdown count, the manifest
with paid-up-to, running cost against revenue, the current order, and
the "send to depot" and follow-camera buttons. The rule of D-179
applies unchanged - the panel computes NOTHING the simulation does not
already compute - and four decisions shaped it.

**Everything on the marker channel, everything from the sim's own
functions.** The VehicleMarker gained the detail fields (Fehler 37:
low-frequency data rides the marker channel, never the 20 Hz stride):
age and design life from `vehicleAgeYears`/`vehicleLifetimeYears`, the
upkeep from `vehicleUpkeepCtPerYear` - factored OUT of
`fleetUpkeepCtPerYear` so the per-vehicle figure and the fleet bill are
one term, obsolescence doubling included, priced through `World.costCt`
exactly as the monthly booking prices it - and the manifest from
`sim/markers.ts` `vehicleCargoRows`: one row per stack (stacks are
already merged by cargo, origin, destination and paid-from point, so
the rows ARE the bookkeeping), with the open distance computed by the
payment formula's own `tileDistance` from the paid-up-to marker to the
vehicle's tile. The panel's own share - names, keys, rounding - is
`ui/manifest.ts`, pure and tested.

**Two fields joined the v25 payload, and the milestone's one bump
stayed one.** `breakdownCount` (incremented where `rollBreakdowns`
flips the state, so tally and news can never disagree) and `depotCall`
are saved and hashed: the count because a lifetime tally that reset on
every load would lie to the player (the D-176 "honest price" runs the
other way here - unlike a flow ring it cannot re-measure itself), the
flag because it steers routing and is therefore Z4 state. Z5 grants M14
exactly one SAVE_VERSION bump and bundle 3 spent it; the version stays
25 and the `v24_to_v25` migration was EXTENDED in place to default both
fields - one bump per milestone, not one migration edit. The canonical
pin was re-recorded under the D-137 protocol (`8146983bca3a6f92` on
v25; the hash gained two fields per vehicle, behaviour unchanged - the
determinism suite's three-run and save/load legs still pass on the same
worlds). The corpus needed NO re-record: its played world contains no
vehicles, so neither the v25 fixture's decode nor any recorded hash
moved - checked, not assumed.

**A depot call is a flag beside the schedule, never an edit of it.**
`SendVehicleToDepot` (CommandKind 41) sets `depotCall`; while set, the
ONE function every route decision already asks - `orderTargetTile` -
answers with the home depot, and the arrival there services the
vehicle, parks it Stopped (the refit-ready state of D-076) and clears
the flag. The alternatives were worse: editing the order list breaks a
LINE vehicle (the shared list is not the player's to bend from a
button), and a new VehicleState would have touched every
Driving/Braking comparison in the solver. What happens at command time
depends on what the vehicle is doing (`divertToDepot`): standing in its
own shed means served on the spot; rolling or idle means rerouted now;
mid-dwell or broken down means the flag waits for the departure that
routes through `orderTargetTile` anyway. The abandoned trip is
forgotten (D-077: a shed detour is a measurement of nothing) and the
arrival clears `lastStationId`, so no diverted leg can ever poison the
link graph; stopping the vehicle cancels the call - the documented way
out of a diversion whose shed became unreachable. Proven end to end on
the recorded road line (`tests/unit/depotCall.spec.ts`), including the
mid-diversion save/load hash equality.

**The follow camera is a render fact.** The store carries
`followVehicleId`; MapView centres on the followed sprite's
interpolated position at the top of its frame (one frame of lag,
applied BEFORE the camera transform so nothing tears), and a manual pan
or a list jump takes the wheel back through the view's own
`onFollowEnd` callback - button state and camera cannot disagree. A
vehicle that leaves the world stops steering on the fleet cadence. No
sim contact anywhere.

### D-182 Notification routing is a settings-crossed-severity table over the news delta, and the pause is speed control

The M14 notification routing: per-category off/ticker/toast/pause in
the options, a one-line ticker strip, toast cards, pause-on-critical.
Everything sim-side already existed - the news log of section 15 with
`postOnce` guaranteeing spam-freedom - so the whole feature is
presentation over the store (D-110: a setting, never a rule; two worlds
with the same commands are identical whatever is chosen).

**The decision is a pure table.** `routeNotification(mode, severity)`:
Off routes nowhere, Ticker to the strip, Toast to a card, and Pause
means "do not let me miss this" - a card always, the hard stop only
above Info severity, because a completed contract must not freeze the
game even in an armed category. Pause is deliberately never a DEFAULT
(Finance and Network default to toast, the rest to ticker): stopping
the world uninvited is a choice only the player may make. The pause
itself travels as `setSpeed(0)` - control traffic, not a command
(D-004), so a paused notification can never reach a replay log.

**Fresh means two things, and both are checked.** The log travels
whole on every change, so `newNewsEntries` finds the appended tail by
locating the previous newest entry by IDENTITY (tick, category, key,
tile - postOnce allows the same key at different tiles) and falls back
to tick comparison when a burst pushed it off the ring. An empty
previous yields nothing: the first sync of a world is its backlog. On
top of that, entries older than NOTIFICATION_FRESH_TICKS (two game
days) at first sight are swallowed - the belt to the delta's braces,
so however a load races the ready flip, a months-old log can never
flood the toast stack. The message rendering moved to
`ui/notifications.ts` and the news panel reads the SAME
`formatNewsMessage`/`severityClass` - one sentence per entry wherever
it appears.

**The settings shape is per category, normalised per entry.**
`AppSettings.notifications` is one mode per NewsCategory; a pre-M14
settings file gets the defaults, an out-of-range mode falls back
alone. `shared/settings.ts` may not import the sim, so the category
count is repeated there - and `tests/unit/notifications.spec.ts`
carries the coupling assertion that fails the build the day the news
log grows a sixth category the options screen would silently not show.

## M14 - instruments, bundle 5: tooltips over the 22 tools + milestone closure (2026-08-07)

### D-183 The tooltip clones its trigger and answers to focus at once, the registry is the enumeration of the 22 tools, and the text carries the mechanism while the price line keeps the number

The last M14 order: an effect-explaining tooltip on every build tool and
the major panel readouts. Four decisions shaped the module.

**One component, no wrapper element, a pure placement.** `Tooltip` takes
exactly one child and injects its handlers with `cloneElement` - wrapping
a toolbar button changes not a pixel of the flex layout - and the bubble
renders through a portal at the body, `position: fixed`, placed by
`placeTooltip` in `ui/tooltipLayout.ts`: a pure function of rectangles
(the `labels.ts`/`chart.ts` split), so the headless suite pins the
centre-above preference, the flip below a top-edge trigger, the viewport
clamp with the left edge winning, and the roomier-side rule when neither
side fits whole. The bubble is `pointer-events: none` and
`aria-describedby`-linked: it can never trap the cursor it explains.

**Focus never waits; hover does; Escape is dismissed but not eaten.**
Hover shows after TOOLTIP_DELAY_MS (450 ms - the desktop convention),
because a passing cursor is not a question. Keyboard focus shows
IMMEDIATELY: a Tab onto the element is deliberate (section 17.4's full
keyboard operation - the readout tooltips carry `tabIndex` 0 for the
same reason). Escape hides the bubble and deliberately keeps
propagating: the 17.2 escape ladder (disarm the tool, open the menu)
must see the same key, and the running app confirmed both happen - a
tooltip that swallowed Escape would cost the player the game's own
escape hatch for a hint box.

**The registry is the enumeration - "all 22" is proven, not counted.**
The toolbar's tool list left `TilePanel` for `ui/tools.ts` and carries
label AND tooltip key per row; a compile-time
`Exclude<Tool, RegisteredTool>` check makes a `Tool` union member
without a registry row a type error, and `tests/unit/tooltips.spec.ts`
walks the registry against BOTH catalogues - key present, non-empty,
and meaningfully LONGER than the label it hangs on, which is as close
as a test can come to rejecting a tooltip that merely repeats the
button. The 22 of the Fertig-wenn is asserted as `BUILD_TOOLS.length`
(the registry minus the select pseudo-tool, which explains itself all
the same).

**The tooltip explains the mechanism; the price line keeps the exact
figure.** The toolbar's price hint already runs every number through
the inflation the bill charges (17.3, D-119) - duplicating figures into
tooltip prose would give them a second place to go stale. So the texts
state what the tool DOES, what its cost scales with and what it
affects ("the first road on open land claims the tile", "+8 rating
points and cargo spoils a third slower", "the rating out of 100 IS the
share of cargo that appears"), and every number a sentence does carry
is a `t()` parameter fed from the sim's own constants
(RATING_WAIT_GOOD_DAYS, INDUSTRY_STOCK_MONTHS, OBSOLETE_UPKEEP_FACTOR,
BANKRUPTCY_MONTHS) - a rebalanced constant rewrites the sentence by
construction. Beyond the tools: status cash/loan, the station rating
(the 10.1 death-spiral sentence at the number itself), the five x-ray
terms, industry level/stock/service, vehicle age/reliability/earnings
and the value-graph heading got the same module, de+en.
---

## M15 - net value and road congestion, bundle 1: the 8.4 route costs (2026-08-08)

### D-184 The two 8.4 route costs are world rules that read the ONE reservation table, and a held train reconsiders on a capped cadence

SPEC.md 8.4 has always named two terms the train pathfinder did not charge:
a section another train has claimed, and a signal. SPEC2 M15 turns both
into world rules. The bundle is four decisions and one bookkeeping act.

**They are world RULES, and they are off unless somebody chose them.**
`occupancyPenalty` and `signalPenalty` are `NewGameParams` fields: saved,
hashed, chosen once on the new-game screen, untouchable mid-game (Z2 and
D-110 - the inflation precedent verbatim, because they change what a train
DOES, so two worlds with the same seed and the same commands but different
flags diverge). Absent means OFF - in the type default, in the migration
and on the dialog - and that asymmetry with inflation and emissions is the
decision rather than an oversight. Every band this game is measured
against - the five M6 scenarios, the takt band of D-151, scenario 5 on the
D-158 band - was measured by a pathfinder that had neither term. Shipping
either ON by default would re-band all of them inside the milestone that
introduces the rule, which is Fehlerkatalog 34 by name. A later milestone
may argue the default across on measured evidence; this one may not.

**The search reads the ONE reservation table, and charges once per train
met.** `RailPathfinder.find` now takes the live `ReservationTable` and the
searching vehicle's id, both REQUIRED rather than optional: there is
exactly one reservation truth in this game (D-054, tile-keyed and derived,
written by the claim logic that runs from where the train IS, D-060), and a
caller that could omit it would be a caller routing against a different
world than the one the claims live in. The vehicle id is what stops a train
routing around its own claim.

The charge falls on ENTRY to a run of foreign-claimed tiles - a step whose
destination is claimed by somebody the tile behind it is not claimed by -
and never per tile. Per tile would scale the penalty with how much track
the train ahead happens to hold: the identical wait would read as a
catastrophe behind a long block and as nothing behind a short one. What the
player pays for is MEETING a train, so the run entry is what is charged, at
`RAIL_OCCUPANCY_PENALTY_SECONDS` = 3 s (SPEC2 M15 fixes the figure). Three
seconds is deliberately far below what running up to an occupied block
really costs - brake to a stand and accelerate away is most of a minute -
because the claims the search reads are a SNAPSHOT taken now for an arrival
later, and a nudge that turns out wrong is cheap where a true price that
turns out wrong sends a train around half the map.

Occupancy is a PRICE and never a wall. The one-way signal check stays
`IMPASSABLE` because it is topology, but a claimed section must not make
the search return NoRoute: two trains meeting nose to nose on single track
is a stated deadlock (D-059), and turning it into a routing failure would
hide the one thing the player has to see.
`RAIL_SIGNAL_PENALTY_SECONDS` = 0.5 s is the second term, sized to break a
tie between two otherwise equal routes and far too small to push a train
off a signalled main line onto an unsignalled siding - which the occupancy
term would then have to undo.

Both penalties are additive, non-negative, and functions of the two tiles
and the two directions alone. The straight-line heuristic therefore stays a
lower bound, A* stays admissible, and the cost still depends on nothing
outside the search state.

**A signal stop is "standing still mid-route", and that is where the
reroute hangs.** The occupancy term makes route cost depend on LIVE
occupancy, so a train may now legitimately want a different route after it
has set off - and a train that repathed every tick would run one A* per
tick per held train, which a junction holding a dozen turns into the repath
storm SPEC2 M15 names. Three gates bound it (`mayRepathAtSignal`): the rule
must be on at all - without the live term a second search from the same
tile to the same target returns the same route by construction, so the
mechanism is provably never invoked in a pre-M15 world rather than merely
harmless; the train must have stood for
`RAIL_SIGNAL_REPATH_MIN_WAIT_TICKS` (40, two real seconds), so a train held
for the moment the one ahead needs to clear pays for no search at all; and
then at most once per `RAIL_SIGNAL_REPATH_INTERVAL_TICKS` (100 - the five
real seconds the routeless retry has used since M2), staggered by vehicle
id so a dozen held trains never search on one tick. Twelve reconsiderations
fit inside the 1,200-tick deadlock warning, so a train reroutes long before
the game calls it stuck.

WHERE the hook goes was worth measuring rather than assuming. The obvious
place - `VehicleState.WaitingForPath` - is the rare case: the braking
lookahead normally brings a train to a stand SHORT of the red, so its
wheels never cross the tile boundary again and the boundary gate never
runs. That is the same observation D-060 made about claiming and D-157 made
about the deadlock clock, met a third time. So the reroute hangs off the
definition this game already has for a train that is going nowhere -
`stalled`, standing still mid-route, in the Driving/Braking branch - AND
off the gate's own state. One predicate, both places.

The cadence clock is `waitingSinceTick`, which is already saved state (Z4)
and already the 9.3 deadlock clock, so the reroute needs no field of its
own and survives a save/load round trip by construction. It is deliberately
NOT reset by a reroute: a train that keeps rerouting without moving is
still stuck, and a clock restarted by its own retry would never fire.

**An identical route is not adopted.** Re-adopting the standing route would
release the claim, reset `progressM` and shove the head back to the start
of its own tile - every interval, for nothing - and identical is the COMMON
case, because most reds sit on lines with no way round at all. The
candidate is therefore found into a scratch buffer and compared against the
tail of the standing path first (one preallocated buffer, the `blockScratch`
argument of vehicles/reservations.ts; a plain copy loop, because `subarray`
is an allocation and this runs inside the tick, law #7). When the route
genuinely changes, `progressM` does go back to zero and the head re-enters
its own tile from the start - the M3 convention of `tailIndex`/D-058, and
precisely why a reroute only ever happens at a dead stop.

**v26, and what moved with it.** SAVE_VERSION 25 -> 26 is M15's one bump
(Z5); the milestone's later bundles extend `v25_to_v26` in place rather
than adding numbers. The migration enters both rules as false and keeps a
value already present, so the corpus trick of wrapping a CURRENT state in
an old container cannot flatten a real rule. Both flags are hashed
UNCONDITIONALLY, false included: a rule that entered the digest only when
it was on would let two worlds that route differently fingerprint alike,
which is the exact failure Z2 exists to prevent. The D-134 field audit
holds both ends of that with no new allowlist entry - the parser refuses a
save missing either flag, and flipping either moves the hash.

Adding two hashed words moves every world hash once, which is the
designed-for event with a written protocol. The canonical cross-OS pin was
re-recorded under D-137 (v26, seed 424,242, tick 10,000:
`54a6bef6e40c2a52`) and the corpus manifest under D-130, with a real
`v26-played.ironsave` written by this build. The corpus is also the
evidence that nothing but those two words moved: all five fixtures - v22,
v23, v24 and v25 written by their own builds, v26 by this one - decode to
the identical world hash `8235f454e3f1f538`. A migrated pre-M15 save is
bit for bit the world it always was.

Two behavioural inertness tests stand beside that, because a hash cannot
show it: with the rules off the search returns tile-identical routes
whether the track ahead is claimed or free and whether a signal stands on
it or not, and a held train never calls the pathfinder at all.

**The fixture is a diamond, and that is the decision.** The two-route test
deliberately does not lay a main line with a passing loop beside it: a loop
is longer than the line it bypasses, so whether three seconds flips the
choice would depend on hand-tuned geometry and the curve table - and a test
that passes because a constant was tuned to it proves nothing. The fixture
is two mirror branches - one diagonal, eight orthogonal steps, one
diagonal, the same four 45-degree turns - which cost the identical number
of seconds BY CONSTRUCTION. Which of the two an unhindered train picks is
the heap's total order, and every test MEASURES it rather than assuming it;
the only thing that separates the branches is the penalty under test.
`tests/unit/railRules.spec.ts` holds all of it, including the end-to-end
case: a train that set off north because south was claimed is held at a
signal short of the split when the claims swap, and reaches its platform
over the south branch. The cap is tested by counting real
`railPathfinder.find` calls over a thousand ticks with a train held and
both ways round claimed: exactly 10 searches with the rule on and 0 with it off,
against the 1,000 an uncapped reroute would have run.

Measured on the reference machine (Ryzen 5 7520U, `npm run test:perf`
2026-08-08): **tick p50 1.512 ms / p99 3.023 ms** on the 1,500-vehicle
fixture (max 19.0 ms over 6,500 ticks), against the M10 baseline of
1.45 / 3.26 - a p99 DELTA of -0.24 ms, inside the documented +-0.7 ms run
noise of this box, where the M15 ledger row allows +0.50 ms for the whole
milestone. That the bundle costs nothing measurable is what the gates buy:
the reference fleet runs with the rules OFF, so the occupancy read and the
reroute are both branches never taken, and even switched on the reroute is
bounded by held-trains-over-a-hundred-ticks. Render tripwires unchanged and
green (sprite pool median 1.84, draw prep 2.56, chunk bake 0.66, particles
0.30, aspect 0.03, emissive 0.04, flow prep 0.29 ms); flow export median
0.055 ms; the big save reads back in 635 ms.

One tidy-up rode along, because the new cadence constant would otherwise
have cited a magic number as its origin: `REPATH_INTERVAL_TICKS`, a local
constant in `vehicles/update.ts` since M2, moved into `constants.ts` as
`VEHICLE_REPATH_INTERVAL_TICKS` with its unit and origin. Same value, no
behaviour change.

## M15 - net value and road congestion, bundle 2: the road half of 8.4 (2026-08-08)

### D-185 The road congestion layer is saved state, the leaders are the layer, and the crossing reads the one reservation table

SPEC.md 8.4 has priced a road step by "vehicles per tile in the last 200
ticks" since the first day, and `RoadPathfinder` has never charged it. D-129
recorded that as a deferral with its fix already decided; this entry is the
implementation, and with it the road half of 8.4 exists. Five decisions.

**The layer is SAVED and HASHED, and that is the whole point.** Vehicles per
tile over the last two hundred ticks is not reconstructible from the current
state: it is history. Under Z4 a historical input to a simulation decision is
save state, so `TileMap.congestion` is a Uint8 tile layer that travels in the
file and enters `hashWorld` beside the terrain. A layer rebuilt empty on load
would price the same roads differently after loading than before saving -
different routes from the same state, architecture law #3 broken in silence,
and no test in this repository would have seen it. Two of the five expansion
drafts wrote "derived, no save change" for exactly this layer and two judges
vetoed it by name (E-02); the Fertig-wenn of SPEC2 M15 asks for hash equality
across a save/load round trip precisely because that is the property a derived
layer cannot have, and `roadCongestion.spec.ts` asserts it byte for byte as
well as by digest.

It rides in the map's SharedArrayBuffer like every other tile layer, which is
why the milestone's promised "Stau-Overlay-Block" in the snapshot costs ZERO
bytes: the heat map will read the layer in place, exactly as the renderer
already reads terrain and track. `SNAPSHOT_LAYOUT_VERSION` does not move -
the D-171/D-174 pattern met a third time, booked honestly rather than as an
empty version bump.

**One WORLD RULE for all three of E-03's deliverables, and it is off.**
`roadCongestion` is a `NewGameParams` field like `inflation` (D-110) and like
the two rail terms of D-184: saved, hashed unconditionally, chosen once on the
new-game screen, absent means OFF. It gates the recording, the A* term, the
speed cap AND the level crossing, because they are one behaviour: what a road
vehicle does about the traffic around it. Every band this game is measured
against - the five M6 scenarios, the takt band of D-151, scenario 5 on the
D-158 band, the AI acceptance run - was measured by a road pathfinder with no
congestion term and by lorries that drove through trains. Shipping any of it
on by default would re-band all of them inside the milestone that introduces
the rule, which is Fehlerkatalog 34 by name. With the rule off NOTHING is
recorded, so the layer stays zero, the sweep never runs and the search is
bit-identical to the M2 one - inertness that is provable rather than hoped
for, and the balance suite's figures are unchanged to the euro.

The system draws NO randomness at all, not even a named stream: it is
counting and integer decay (the D-093 posture, Z3).

**The units are the specified quantity, and the decay is an epoch sweep over a
dirty list.** One tile entry adds 16 units and every 20 ticks a tile loses
`ceil(value / 11)`, which leaves 10/11 per epoch and therefore (10/11)^10 =
0.386 - one over e - across the 200 ticks 8.4 names. The layer is an
exponential window with a time constant of 210 ticks, so `value / 16` IS
"vehicles per tile in the last 200 ticks" and there is no second definition
anywhere. Measured on the fixture: a bottleneck crossed by one lorry per
second settles at 176 units = 11.0 vehicles per window, which is the closed
form of that steady state and not a number anybody tuned.

Decaying a million tiles fifty times a game second for a layer with a few
hundred non-zero entries is the map-scan E-02 forbids, so `RoadCongestion`
keeps the tiles that carry something and the sweep walks that list. The list
is DERIVED - it is exactly "the tiles above zero" - and is rebuilt from the
layer on load beside the reservation table and the land masses (D-054). No
duplicate flag array is needed: a tile is pushed exactly when its value rises
FROM zero and dropped exactly when the sweep finds it back at zero, and
rounding the loss UP is what makes a value reach zero in finite time so the
list can ever drop it. The cap is a REFUSAL, not an eviction (the M13
particle-pool precedent): recording a tile the sweep can never reach again
would leave a phantom jam in the A* costs for the rest of the game.
`MAX_CONGESTED_TILES` = 65,536 is three times what MAX_VEHICLES can physically
keep alive, and the refusal is tested rather than assumed.

The test measures the WORK, not the wall clock: over four hundred ticks the
sweep is called exactly twenty times and touches tens of tiles, against the
16,384-tile map it would scan per tick if it were written the obvious way.

**The speed cap is the leader rule without a leader search.** E-03 asks for
capping behind slower traffic on the same tile and vetoes car-following in the
same breath, because a following model is O(vehicles x neighbours) in the hot
path for an effect the cost term already delivers economically. The way out is
that the layer ALREADY IS the leaders, aggregated: a vehicle entering a tile
reads how much traffic went through it in the last window and caps its own top
speed by it - one array read, no neighbour search, no overtaking, no following
distance. The vehicle's own entry is subtracted first, which is what makes it
a leader rule rather than a self-inflicted tax: a lone lorry on an empty road
put one entry's worth of units there a moment ago and must not be slowed by
its own trail. The floor is 0.35 of top speed, because a jam here is a queue
and a price, never a standstill - there is no leader to wait for, so a factor
of zero would strand a lorry for ever.

**A level crossing closes on a claim, and the claim is the one the trains
obey.** A tile carrying both road and track is shut to road traffic while
`ReservationTable` shows an owner on it. That table is the single occupancy
truth of this game (D-054, tile-keyed, derived, written by the claim logic
that runs from where the train IS, D-060), and the crossing tile is a tile of
the block a train claims: a block signal writes the whole block including the
crossing, a plain claim writes the run the train will drive through it. So an
O(1) read of that one tile IS reading the block's reservation, and a crossing
on an unsignalled line closes only as the train's own body arrives - the reach
of the claim, not a shorter or longer invention beside it.

It is a delay, not a collision model. A road vehicle already standing on the
crossing is not ejected, because nothing in this game has ever collided; the
gate stops a vehicle ENTERING, in the same shape as the section gate three
lines above it in `update.ts`. The held vehicle stays in `Driving` at speed
zero rather than in `WaitingForPath`: that state is the trains' and runs
`holdBody`, which would have a lorry claiming track.

**The fixture is a ladder, and the two-route test measures real journeys.**
The two ways round the middle are mirror images - one step off the main line,
fourteen straight, one step back - so they cost the identical number of tile
equivalents by construction, and nothing passes here because a detour was
tuned to a constant (the D-184 diamond argument, applied to roads). The
stretch west of the split is the bottleneck: every journey crosses it and no
route avoids it.

Two hundred lorries leave one real second apart, and the acceptance numbers
are read off the running world. Congestion: the bottleneck peaks at 176 units
= 11 vehicles per window while a road tile no journey uses stays at zero. The
two-route proof is the same fixture with one flag flipped, counted per
DIRECTION because a route is a pure function of its two ends: with the rule
off every vehicle heading the same way is on the same branch (96/0 eastbound,
103/0 westbound - the fleet has no choice), and with it on the journeys split
across both (46/41 and 50/63). That is "rerouted journeys demonstrably take
the alternative route" measured on journeys rather than on a probe search.

**v26, extended in place.** M15's one bump (Z5) is D-184's; this bundle adds
`roadCongestion` and the layer to the SAME `v25_to_v26` migration rather than
opening a v27. A version 25 world enters with the rule off and a zeroed layer,
which is what that world knew about its own past - the M11 waypoint and M14
ring precedent. Values already present are kept, so the corpus trick of
wrapping a current state in an old container cannot flatten a real rule or a
real layer.

Adding one hashed word and one hashed megabyte moves every world hash, which
is the designed-for event with a written protocol. The canonical cross-OS pin
was re-recorded under D-137 (v26, seed 424,242, tick 10,000:
`50c7d6a38f6da052`) and the corpus manifest under D-130. The v26 fixture was
REWRITTEN by this build, because the v26 payload gained a field inside its own
milestone and no released build ever wrote the intermediate shape - that is
what "every version writes its fixture with the encoder of its own build"
means while a version is still open. The corpus is also the evidence that
nothing but the new words moved: all five fixtures - v22, v23, v24 and v25
written by their own builds, v26 by this one - decode to the identical world
hash `17f7f507023b91d8`.

**Measured on the reference machine** (Ryzen 5 7520U, `npm run test:perf`
2026-08-08): tick p50 **1.351 ms** / p99 **2.985 ms** on the 1,500-vehicle
fixture (max 19.4 ms over 6,500 ticks), against the M10 baseline of 1.45 /
3.26 - a p99 delta of **-0.28 ms** where the M15 ledger row allows +0.50 ms
for the whole milestone, and inside the documented +-0.7 ms run noise of this
box either way. The reference fleet runs with the rule OFF, so the increment,
the sweep and the two gates are branches never taken; with it on the tick cost
is one clamped add per road vehicle per tile boundary plus a walk of the dirty
list once per second. Render tripwires unchanged and green (sprite pool median
1.71, draw prep 2.38, chunk bake 0.46, particles 0.32, aspect 0.03, emissive
0.04 ms); flow export median 0.055 ms.

**Save size, measured as an A/B on one world** rather than estimated: on a
1024^2 map the all-zero layer costs **1,039 B** compressed against 1,048,576 B
raw (0.1 %), and a heavily played layer with 25,000 congested tiles costs
**20,023 B**. The ledger's "~1 MB, zlib-small because mostly zero" is
therefore true with room to spare; the 1,500-vehicle reference save reads
187,272 B. The corpus fixture on its 128^2 map grew from 10,294 to 10,385 B.

**What this bundle deliberately did not change.** The road search remains
four-connected where 8.4's table says eight: a road tile carries four
connection bits and there is no diagonal road in this tile model, so an
eight-neighbour search would route over connections the map cannot express.
That departure predates M15 and is now written down rather than left as an
undocumented one.

## M15 - net value and road congestion, bundle 3: the diagnostics (2026-08-08)

### D-186 The throughput counters may draw the picture but never write the log, and a deadlock is a ring the waiting graph is walked to find

SPEC2 M15 asks for three instruments in one bundle: per-block throughput
counters feeding a utilisation heat map, an "Engpass" message on the M8 news
machinery, and a deadlock CYCLE detector that upgrades the 9.3 warning. They
arrived as one bundle because they are one question - what is the network
doing wrong, and where - and they are separated here by a line that was not
obvious until it was drawn.

**The counters are derived, and the whole licence for that is that nothing
reads them.** SPEC2 says "derived, monatlich geleert wie D-091" and the
mandate was to verify that the decision holds rather than to assume it. It
holds, but only because of where the counters stop. Z4 makes every historical
input to a SIMULATION DECISION save state - that is why the road congestion
layer of D-185, counting the same kind of thing, is saved and hashed - and
leaves exactly one exception: a purely reading overlay no simulation code ever
consults, the ReservationTable pattern of D-054. So `TileMap.throughput` is a
Uint8 tile layer in the map's shared buffer beside `oceanMask`: never
serialised, never hashed, empty in a loaded world, and read by the renderer in
place - which is why the "Stau-Overlay-Block" the M15 ledger row promised in
the snapshot costs ZERO bytes for a second time (`SNAPSHOT_LAYOUT_VERSION`
stays 7; the D-185 pattern, met again). The counters are also the reason
SAVE_VERSION stays at v26: this bundle touches no saved shape at all, so there
is nothing for D-184's one bump to be extended with.

`tests/unit/throughput.spec.ts` walks every file under `src/sim` and fails the
day anything but the meter, the layer, the world's monthly clear and the ONE
write speaks the access - the D-176 read-back guard, applied to the
expansion's second derived instrument. The pattern deliberately matches
`.throughput` rather than the English word: signalling and AI prose use
"throughput" freely and rightly, and what must not spread is the access.

The increment is therefore UNGATED by any world rule, which is the mirror
image of D-185's decision to gate everything: a derived counter cannot change
a route, a price or a hash, so there is no old seed for a rule to protect. One
clamped add per train per tile boundary, in the same place the congestion
layer is fed, so what a train costs the network and what it earns on the heat
map are recorded at one event.

**Keyed by TILE although the counter is "per block".** Block ids are
renumbered by every `BlockIndex` rebuild, which is every time a player lays a
piece of track - D-054's argument verbatim, and a counter keyed by block id
would silently retarget itself. A tile index survives it. The two readings
agree where it matters: a train traversing a block enters every tile of its
own path through it exactly once, so on plain line the per-tile count IS the
block's throughput, and at a junction block the busiest tile is the throat -
the more useful of the two numbers.

**Monthly clearing is not a weaker congestion layer, it is the honest derived
form.** A decaying window (D-185's shape) really is unreconstructible history:
a derived one would read differently after a load than before a save, and
while no rule reads it, that is still a lie on screen. A monthly counter is
honest about being a monthly counter - it starts the month empty and it starts
a loaded game empty, which is the price D-176's flow volumes already pay for
the same reason. The clear walks the meter's dirty list, never the map (E-02's
rule, the `RoadCongestion` shape), and the cap is a REFUSAL rather than an
eviction: a tile the clear could never reach again would keep a phantom
reading for the rest of the game.

**And this is why the news may not read them.** The news log is SAVED and
HASHED. A message conditioned on a derived counter would make saved state
depend on unsaved state: a world that continued would report what a world that
reloaded does not, which is Fehlerkatalog 2's Fehler 23 with a sentence
instead of a route, and no test in this repository would have caught it. So
SPEC2's arrow from the counters to the "Engpass" message is deliberately not
drawn. The counters draw the heat map; the waiting graph - a pure function of
saved state - writes the log. An Engpass is therefore defined by the QUEUE and
not by a reading: `BOTTLENECK_MIN_WAITERS` = 2 trains refused at the identical
tile, two being the smallest number that is a queue at all. One train held at
a red says nothing about capacity; a second waiting for the same tile says
demand for it exceeds what it passes.

**The waiting graph is `tryClaim`'s own test read backwards.** The edge of the
graph is `refusedTile(world, id)` in `vehicles/reservations.ts`, and it is in
that file rather than in the detector because it must be the same answer the
claim gives: the same range (tail through the end of the section being
entered), the same block collection for a block signal, the same `freeFor`.
`tryClaim` was refactored onto the extracted check, which is
behaviour-preserving - the order of the two scans cannot change a boolean - so
there is one definition of "refused" instead of two that drift. -1 covers
every case that is not a refusal, including a train standing still for a
reason nobody caused; those stay the plain 9.3 warning, because only a refusal
by a NAMED other train can be part of a ring.

**Membership is the 9.3 clock, not a third definition of stuck.** The detector
composes with the two decisions that taught that clock to see rather than
repeating them: D-083 taught it the train that never reaches a signal at all
(standing still, holding nothing beyond its own body), and D-157 widened it to
"standing still mid-route, whatever it holds" when the arrival-gate freeze
stood at speed zero holding its whole approach. `analyseDeadlocks` takes
`waitingSinceTick` as given and adds the one thing a ring needs on top. The
threshold is `DEADLOCK_WARN_TICKS`: a ring that forms and clears inside a
minute was a queue, and the M15 reroute of D-184 exists precisely so that some
of them clear themselves. The end-to-end test measured the composition rather
than assuming it - after four thousand ticks the two deadlocked trains are NOT
in `WaitingForPath` but braked to a stand in Driving/Braking at speed zero,
which is exactly D-157's observation and exactly why keying on the state would
have found nothing.

**The search is a walk, because the graph has out-degree one.** Every node is
a stuck train and its single edge points at the holder of the tile its next
claim needs, so cycle detection is: follow the pointers, colour the nodes on
the current walk, and a walk that re-enters its own colour has found the ring.
Iterative with an explicit walk buffer (architecture law #8 - and here the law
is not theoretical: the pointer chain on a busy network is as long as the
queue), linear in the number of stuck trains, module-level buffers in the
`waitingOrder` shape. Each ring is rotated to start at its LOWEST id, which is
a canonical form: the same deadlock reads the same way whichever train the
outer loop reached first, so the message it produces is stable and `postOnce`
recognises it the next day.

**One heading per stuck train, sharpest first, and that is what keeps
`postOnce` working.** A stuck train is reported as exactly one of: a ring
(`news.deadlockCycle`, one entry naming EVERY participant and EVERY contested
tile), a queue (`news.bottleneck`, one entry per tile, spoken for by its
lowest-id waiter), or the plain `news.trainStuck`. That is not tidiness.
`postOnce` suppresses a repeat only while it is the most recent entry, so two
headings about one situation would take it in turns to be the newest and the
daily clock would write both of them every game day - the exact spam the
method exists to prevent. Naming one train of a ring would also send the
player to the symptom, which is why the message carries the whole ring;
`tileIndex` is the ring's lowest contested tile, so the click jumps to the
deadlock rather than to one of its trains.

**No auto-fix, and it is tested as such** (SPEC.md Fehler 18): a thousand
ticks after the detector has spoken, both trains are on the tile they were on,
at speed zero, and the ring is still there. The game helps the player FIND it.

**The F3 highlight learns the contested tile.** `VehicleMarker.blockedTile`
joins the marker channel (E-05: low-frequency facts never ride the 20 Hz
stride) and is asked only of a train the 9.3 clock is already running on,
because `refusedTile` walks a section and possibly a block. The overlay now
blinks the train AND the track refusing it, so a ring is a picture and not
just a sentence - the tile a stuck train stands on is never the tile it is
waiting for, which is why the old marker set could not show one.

**The heat map is the flow atlas's structure with a tile walk in it**
(D-161/D-177): an own `Graphics` sibling of `art`, OUTSIDE the D-127 day/night
tint because an instrument does not dim at night, and outside every chunk bake
because the counters move whenever a train crosses a tile and a baked chunk
would have to be re-baked for each. It is event-driven rather than per frame:
camera window, zoom and map revision force a redraw at once, and otherwise a
repaint happens at most every `HEAT_REFRESH_TICKS` (20, one real second at 1x,
the congestion layer's own epoch) - the underlying quantity is monthly, so
sixty repaints a second would redraw the identical picture some three thousand
times per meaningful change. The ramp is pure and headless-tested
(`heatmap.ts`, the `water.ts` pattern) and reuses the interface's own
success/warning/danger stops, so the overlay reads like every other warning in
the game. No render tripwire was added, and that is an argument rather than an
omission: the walk is bounded by the visible window and is the same walk the
F3 block overlay has run PER FRAME since M4, so a once-a-second version of it
is strictly cheaper than something that already ships unmeasured.

`U` toggles it (D-114's one table, plus a chip beside the flow one), free in
both locales - "Utilisation" and "Auslastung".

**The M4 regression network is the no-false-positives case, and it is RUN.**
Twenty trains queueing round a one-way ring is congestion, not deadlock -
D-084 measured the worst standstill at 3,300 ticks and explained why that is
correct - so a detector that called it a deadlock would be worse than none.
The fixture moved to `tests/helpers/regressionNetwork.ts` for the second
reader (the `transferNetwork.ts` precedent, D-177); nothing in it changed, and
its own acceptance test still passes unaltered. The new test samples the whole
acceptance run every 250 ticks and asserts zero cycles at every sample, plus
an empty `news.deadlockCycle` in the log.

The three-train ring is CONSTRUCTED on the graph instead of on a geometry, and
the split is deliberate: a three-way ring needs a track layout whose own
quirks would then be doing the arguing, so the trains and their claims are
placed by hand and the detector is asked the one question it exists to answer.
The nose-to-nose case of D-059 is the end-to-end evidence that such a graph is
a real state of this simulation - two railbuses, a signalled single-track
line, no passing loop, and they drive into each other.

**Measured on the reference machine** (Ryzen 5 7520U, `npm run test:perf`
2026-08-08): tick p50 **1.383 ms** / p99 **2.785 ms** on the 1,500-vehicle
fixture (max 16.6 ms over 6,500 ticks), against the M10 baseline of 1.45 /
3.26 - a p99 delta of **-0.48 ms** where the M15 ledger row allows +0.50 ms
for the whole milestone. The bundle's tick share is one clamped add per train
per tile boundary; the detector and the news pass run once per game day.
Render tripwires unchanged and green (sprite pool median 1.62, draw prep 2.32,
chunk bake 0.44, particles 0.35, aspect 0.03, emissive 0.04, flow prep
0.27 ms); flow export median 0.057 ms; the big save reads back in 604 ms and
is unchanged at 187,272 B.

**The pins did not move, verified rather than assumed.** Nothing this bundle
writes is saved or hashed except news entries, and the canonical cross-OS
world (D-137, seed 424,242, tick 10,000) replays the ROAD fixture - no trains,
so no ring, no queue and no counter: the pin `50c7d6a38f6da052` stands
untouched, as does the corpus manifest (D-130), both green in the suite. Had a
train been deadlocked in either, re-recording under the documented protocol
would have been the correct act; it was not needed, and saying so precisely is
the point of checking.
## M15 - net value and road congestion, bundle 4: the number, the scenario, the cap (2026-08-08)

### D-187 The network value is the tariff test's own ceiling read from the world, the Netzdesign band is met by an alignment and a capacity in equal measure, and E-18 is answered by raising the cap

SPEC.md section 1 opens with the promise the whole game is built on: a smooth,
well signalled alignment with sensible passing places carries FOUR TIMES what a
slapdash one does, and the player must be able to SEE it and MEASURE it in the
books. SPEC2 M15 is where that sentence becomes a number. This bundle is four
decisions - what the number is, where it is shown, what the scenario measures,
and E-18.

**The ceiling was already written, and it lived in a test.** D-066 computes a
vehicle's ceiling revenue in closed form - `capacity x rate x speed x constant`,
with the line length cancelling out - and the freight tariffs were recalibrated
against exactly that figure. It lived in `tests/balance/tariff.spec.ts`, which
is the right place for the number that CALIBRATED the rates and the wrong place
for a number the interface divides by. `ceilingRevenueCtPerYear` is now
`src/sim/economy/networkValue.ts` and the test IMPORTS it. Two copies would be
two definitions of what a tariff means, and the copy that drifted would be the
one nobody was watching. The test's printed table is unchanged to the euro,
which is the evidence that the move was a move.

The formula's `/ 100` moved with it: a rate is quoted per
`PAYMENT_DISTANCE_TILES`, and that is a constant in `constants.ts` with a unit
and an origin now rather than a literal in `payment.ts` and a second literal
beside the ceiling. Same value, no behaviour change - the
`REPATH_INTERVAL_TICKS` tidy-up of D-184, met a second time.

**The denominator is quoted at the price level of the earnings it divides, and
that took a new function.** Revenue carries `epochFactor` (section 14.2), so a
lifetime of earnings is a sum of a century of different price levels; a ceiling
quoted at today's prices would make a company's network value sag by 1.8 % a
year for no reason but the calendar, and one quoted at the first year's would
make it climb. `inflatedYearsBetween` in `payment.ts` integrates the price level
between two ticks - a prefix sum over the same `EPOCH_FACTORS` table
`epochFactor` reads, so there is exactly one definition of what a year was
worth, and the answer is two lookups rather than a loop over a century. It is in
`payment.ts` and not beside the ceiling for that reason.

**What the number counts is deliberately generous to the track and hard on the
fleet.** The ceiling assumes no loading time and a full load in BOTH directions,
so it is unreachable by construction and the honest reading of a line at 7 % is
"this is what a railway looks like", not "you are failing" - which is why the
tooltip carries the mechanism (D-183) and the panel never shows the percentage
bare. Parked vehicles COUNT: a company-wide figure that quietly excluded what
stands in the shed would hide the most common way a network is badly designed.
And because the denominator depends only on capacity, tariff and top speed, two
identical fleets on two alignments have the identical denominator - the whole
difference between them lands in the numerator, which is the property that makes
the figure a measure of the NETWORK rather than of the fleet.

It is shown per line (the list column and the detail, beside the round time) and
per company IN THE BOOKS - `FinanceReport.networkValue`, on the monthly cadence
with everything else there, because "in der Bilanz messen" is what SPEC.md asked
for. The share is computed sim-side and the interface divides nothing, so the
number on screen and the number the balancing scenario asserts are the same
number.

**The Netzdesign scenario: the promise measured, and decomposed.**
`tests/balance/netzdesign.spec.ts` runs the identical traffic - the same two
trains, the same orders, the same two towns, the same seed, the same world rules
- over two railways between the same two stations, and divides their network
values. Measured over six game years: **botched 1.8 %, signalled 6.9 %, factor
3.73** against SPEC2's band of 3, and the figure is stable across seeds
(3.73 / 3.71 / 3.75 on three of them) rather than one lucky draw.

The scenario prints WHY, and it prints it as a decomposition, because a single
ratio sends the reader guessing. A third world - straight but still unsignalled
- splits the answer in two: the ALIGNMENT alone is worth **2.01x** (the sawtooth
is a fifth longer and every kink carries a curve speed limit from the 8.1
table), and the CAPACITY on top of it another **1.86x** (the botched line has no
signal anywhere, so `sectionEnd` runs to the end of the route, the whole line is
one section, and the second train can never enter it while the first is on it).
Two failures, each worth about double, and their product is the promise. The
station histories are printed beside it: the botched line collects 1,800 units a
game year and lets 5,700 expire on its platforms, the signalled one collects
6,120 and loses 1,443.

**The good railway is not the passing loop SPEC2's sentence names, and that is a
measured finding rather than a shortcut.** A short loop on single track was
built first. It does not work in this game, for two reasons that are both in the
engine rather than in the fixture. First, a train will not take it: the loop's
four 45-degree turns cost radius-300 curve speed at every one of them (8.1),
which is some eight seconds of route cost, while D-184 deliberately prices a
claimed section at three - occupancy is a NUDGE, and the nudge is an order of
magnitude too small to pay for a detour with curves in it. Second, even a loop a
train did take only helps where the trains happen to MEET; two shuttling trains
meet wherever their dwell times put them, and where they meet on plain signalled
line they deadlock, which is D-059's stated limitation and not a defect. The
design that removes opposing traffic altogether is the one D-082 already
recorded: one-way blocks and a return track, so the passing place is the whole
line. That is what the scenario's good railway is, and this entry says so
instead of dressing an oval up as an Ausweiche. Both worlds run with
`occupancyPenalty` and `signalPenalty` ON, so the comparison is about track and
never about a rule.

Nothing here tuned a constant. The scenario's own knobs - four passenger coaches
cut to three so the train FITS its two-tile platform (`platformShare`), and a
town population that offers a little more than the good line can carry - are
fixture sizing, and both are argued in the file: a train hanging off its
platform measures the platform, and a traffic level neither line can serve
measures neither.

**E-18: the cap goes up, and the priority writer is refused.**
`SNAPSHOT_MAX_VEHICLES` was 1,500 against a store of `MAX_VEHICLES` = 4,000, so
a large fleet was drawn at 37.5 % - and WHICH vehicles were drawn was decided by
nothing more meaningful than the order the store hands out slots.
`tests/unit/snapshotCap.spec.ts` measures that rather than describing it:
against a block sized as it was, the written rows are exactly ids 0 through
1,499 and the rest of the fleet is not there. To make that measurable at all,
the block writer moved out of `SimWorker` - which no test can import, because it
reads worker globals - into `src/sim/vehicles/snapshot.ts`, beside its subject,
the shape `flow.ts` already gave the flow block.

The cap is now the store's capacity, so the truncation cannot be reached by any
fleet this simulation can hold. Measured price on the reference machine
(`npm run test:perf`): the renderer's draw-prep walk over a full block of 4,000
plain vehicles is **p50 2.40 ms / p99 3.52 ms** against **0.89 / 1.50 ms** for
1,500 - and the tripwire scene next door already prices 9,000 placed units per
frame at 2.49 ms, which is MORE work than a full plain block, so the existing
gate covers this case from above and no new threshold was added. In the worker
the raise costs nothing at all for any world at or below the old cap: the write
loop is bounded by how many vehicles are alive, never by the cap. In memory it
costs 160 KiB of shared buffer.

The priority writer was refused on three grounds, none of them cost. It would
put the CAMERA inside the decision, so which vehicles exist for the renderer
would depend on where the player is looking - and a click, a sound and a status
badge all address a vehicle by the id in that block. It would break the E-05
pairing (D-162): a row that leaves the block and re-enters it has no previous
generation to glide from, so every pan would pop vehicles instead of moving
them. And it would put a per-vehicle priority test in the publish pass to save a
buffer the machine does not notice.

This spends the ONE snapshot-layout bump the M15 ledger row promised.
`SNAPSHOT_LAYOUT_VERSION` goes 7 -> 8 because the block's size and every offset
behind it move; the "Stau-Overlay-Block" that bump was booked for turned out to
cost zero bytes twice over (D-185's congestion layer and D-186's throughput
counters both ride the map's own shared buffer), so the row is honoured rather
than quietly left unspent. SAVE_VERSION stays at v26 - this bundle touches no
saved shape at all - and the canonical cross-OS pin `50c7d6a38f6da052` and the
corpus manifest are untouched and green: the snapshot is a render channel and
has never been in the world hash.

One coupling followed the cap. The render tripwires used to size their scenes
with `SNAPSHOT_MAX_VEHICLES` because it happened to equal the reference fleet.
They say `REFERENCE_VEHICLES` = 1,500 now - the fleet of SPEC.md section 21,
which is what the ledger prices everything against - so a cap that moves again
can never move a tripwire's readings out from under the milestones that recorded
them.

**Measured on the reference machine** (Ryzen 5 7520U, `npm run test:perf`
2026-08-08): tick p50 **1.481 ms** / p99 **2.949 ms** on the 1,500-vehicle
fixture (max 19.98 ms over 6,500 ticks), against the M10 baseline of 1.45 / 3.26
- a p99 delta of **-0.31 ms** where the M15 ledger row allows +0.50 ms for the
whole milestone. The network value adds nothing to the tick by construction: it
runs on the marker cadence (`postLines`, one pass over the line's vehicles) and
on the monthly books (`postMonthly`, one pass over the fleet), both outside
`World.step`. Render tripwires green (sprite pool median 1.77, draw prep 2.49,
chunk bake 0.48, particles 0.29, aspect 0.03, emissive 0.06, flow prep 0.29 ms);
flow export median 0.055 ms; the big save is unchanged at 187,272 B and reads
back in 604 ms.

## M16 - the proof chain: the `.ironreplay` format and the checkpoint ring

### D-188 The checkpoint ring is one mechanism for three jobs, its payload is a compressed world verified when it is restored, and the base entry is never evicted

SPEC2 M16 asks for a replay format and a checkpoint ring "alle 72.000 Ticks",
and it is explicit that ONE mechanism has to serve three jobs: scrubbing, tail
verification and log compaction. That sentence is the whole design brief, and
following it literally is what makes the milestone small.

**Save format 27 is a CONTAINER-only bump, the third of its kind.** Three
fields join the container beside the digest and the command log:
`checkpoints`, the ring itself; `logBaseTick`, the tick from which the retained
log is complete; and `replay`, the claim a `.ironreplay` makes about where the
recording ends. Not one byte of the hashed world state moves - `v26_to_v27`
spreads the container and passes `state` through BY REFERENCE, exactly as
`v22_to_v23` did (D-130), and the evidence is unusually direct: the corpus
manifest re-recorded with every world hash unchanged (`17f7f507023b91d8` for
all six fixtures, v22 through v27), and the canonical cross-OS pin re-recorded
under the D-137 protocol to the SAME hash `50c7d6a38f6da052`, with only its
`saveVersion` field moving from 26 to 27. Two tests hold that line for good: a
version 26 container around today's state decodes to an identical hash, and the
migration hands back the very state object it was given.

**The ring is history, not state, so it is not hashed - and that is Z2's
question answered rather than dodged.** Z2 makes every world RULE a saved,
hashed, migrated field, because a rule outside the digest is a rule two
machines can disagree about silently. A checkpoint is not a rule and not a
present fact: it is a recording of a past the world has already left, which is
exactly the family the command log belongs to and exactly why the log has never
been hashed either (D-131: the log is history, and replay verification rather
than the world digest is what judges it). Nothing in `src/sim` reads a
checkpoint to decide anything - restoring one REPLACES the world rather than
informing it - so Z4 is not engaged either. The field audit
(`saveFieldCoupling.spec.ts`) enforces exactly this and no more: the new leaves
are parsed and refused when missing, the ticks and digests are validated by
shape, and the only two entries added to the UNHASHED allowlist are
`checkpoints[].payload` and `replay.finalTick`, each with the reason it is
there. A stale allowlist entry fails the audit, so those two reasons cannot rot
into fiction.

**A checkpoint carries its own digest and is verified when it is RESTORED, not
when the file is opened.** The alternative - decoding every payload at load
time - would charge every load for a jump nobody asked for: sixteen world
states decompressed and hashed to open one save. So the parser checks the
ring's SHAPE (year boundaries, ascending, inside the recording, a digest that
looks like one, a non-empty payload) and `restoreCheckpoint` checks the
substance: the payload decodes, the world stands at the tick the entry claims,
and it hashes to the digest the entry recorded - otherwise
`SaveCorruptionError`, the same word D-130 gave a file that disagrees with
itself.

**The payload is compressed at record time, because that is what makes the ring
affordable.** Sixteen LIVE world states of a 1024 map are hundreds of megabytes
of Int16 and Uint8 layers; sixteen compressed ones are single-digit megabytes.
Measured on the 25-year AI game (256 map, three competitors, `world.toData()`
through the save's own codec): one payload is **25,471 to 39,081 B compressed
against 1,206,267 B of raw MessagePack**, and encoding it costs **24.5 to 41.3
ms**. All 26 checkpoints of that quarter century together are **916,498 B
(0.87 MiB)**; under a capacity of 16 the ring actually keeps the genesis plus
the newest fifteen years, **566,367 B (0.54 MiB)**. On the 1024 reference world
a checkpoint costs what an autosave costs - 187 kB, ~0.6 s to encode on the
reference machine - once a game year, which is an hour of real time at 1x and
three minutes at 20x. That is the honest price, it is the price the autosave
already pays, and it is on the SAVE path: the tick is untouched, measured p50
**1.494 ms** / p99 **2.684 ms** on the 1,500-vehicle fixture against the M10
baseline 1.45 / 3.26, which is the M16 ledger row's "+0,00 ms" met.

**`CHECKPOINT_RING_CAPACITY` is 16 entries in total, and the OLDEST is never
evicted.** The three jobs disagree about how many to keep - tail verification
wants one, scrubbing wants all of them, compaction wants few - so the number is
a budget rather than a preference: sixteen game years of instant scrubbing for
~0.6 MB on the AI world and ~3 MB on the biggest one the game ships, against an
unbounded cost for keeping every year of a century (101 of them under
`MAX_TICK`). A year older than the ring is still reachable; it is re-simulated
from the nearest checkpoint below it, which is what a scrubber does between
checkpoints anyway. What eviction may never take is entry ZERO: it is the tick
the retained log hangs from, and dropping it would orphan every command before
the second checkpoint. So `record` splices out index 1, and the parser refuses
any file whose `logBaseTick` has no checkpoint standing at it.

**Tick 0 is a year boundary, so the genesis of a game is a checkpoint like any
other.** That one arithmetic fact removes a whole special case: a replay's base
state is the genesis checkpoint, so "replay this game from its first day" is a
DECODE rather than a reconstruction, and the container digest `decodeSave`
already verifies covers it. A recording that predates the ring has no genesis
checkpoint and never will, so `replayGenesis` rebuilds one from the parameters
the world carries - seed, map size, climate, difficulty and every world rule
are saved state, and `World.create` over them reproduces the first tick
exactly, the same reproduction the determinism suite has relied on since M0.
Two parameters are NOT separately saved and are read off the world as it
stands: the player company's name and its colour, either of which a command may
have changed since. That is a real soft spot, and it is bounded by D-131: a
recording that needs the reconstruction is a recording from another save
version, and verifying one of those is refused before a single command is read.
The reconstruction is a playback affordance, never evidence.

**A replay is the save container with three things settled, not a second
format.** `.ironreplay` carries the world at `logBaseTick`, `commandsExecuted =
0`, and a `ReplayClaim` of `{finalTick, finalHash}`. The zero forces the state
to be the BASE rather than the final one, and that is not a stylistic choice: a
queue whose head is 0 while the world stands at the final tick would find every
command in the log due at once and re-run the whole game inside one tick. One
container also means one parser and one migration chain - a second format would
be a second parser, and a second parser falls silently behind the command set,
which is the exact defect D-133 removed from the determinism runner.

**"Trim the log before the last checkpoint" is a legal save variant, one-way
and never automatic.** `trimLogAtCheckpoint` drops the log entries and the ring
entries before a checkpoint and records the new base on both sides, which is
what finally bounds the log growth the M10 audit flagged as unbounded. It is
offered, never applied behind the player's back, because the price of the bound
is that the game can no longer be replayed from its first day - and a file that
has forgotten where its log starts cannot be replayed honestly at all.
`CommandQueue` therefore grew a `baseTick`, a `trimBefore` and a `seekToTick`;
`trimBefore` deliberately does NOT reset the sequence counter, because a number
a trimmed entry already used would make two commands of one recording
indistinguishable. Measured on a two-year fixture: 44,304 B kept whole against
23,494 B compacted to a single checkpoint, and the compacted save loads and
runs on to a hash identical to the untrimmed one's.

**Verification refuses before it reads, and locates a divergence to the year.**
`verifyReplay` asks `replayRefusal` first: the pair `{gameVersion,
SAVE_VERSION}` must match this build exactly, or a `ReplayVersionError` names
BOTH versions and nothing is simulated (E-11, D-131, Fehlerkatalog 38). When it
may judge, it re-simulates from the cheapest honest start and compares at every
checkpoint on the way AND at the final tick - each checkpoint is a hash the
recording committed to, so a manipulated log is reported as a first DIVERGENT
TICK rather than as a verdict. The ring is the granularity; narrowing further
inside a year is a bisection over the same mechanism, which is what the replay
browser can build on. Both halves are tested with a deliberately manipulated
log: a doubled loan at tick 0 is named at the year checkpoint, a tampered
repayment after the last checkpoint is named at the final tick.

**Where the ring is filled.** `SimWorker` owns it beside the command log and
calls `record` after every STEP rather than once per frame - a frame runs up to
40 ticks, and a year boundary inside one of them is still a year boundary -
plus once when a world is created, restarted or adopted from a file. `record`
is idempotent by tick, so adopting a world that stands exactly on a boundary
can only ever ADD the checkpoint the file lacked. None of it lives inside
`World.step`: encoding a world allocates, and law #7 does not bend for a
recording.

## M16 - the proof chain, bundle 2: the replay theatre (2026-08-08)

### D-189 A recording plays through a sealed queue, scrubs on the ring, and is judged only as far as it committed - the exact tick when the bracket holds one command, the bracket honestly when it holds more

Bundle 1 built the format; this is the theatre it is watched in. Four things
had to be decided, and three of them turned out to be the same decision seen
from different sides: **a recording is an input, never a place to write.**

**Playback is the ordinary tick loop with a SEALED queue, and the seal is the
whole design.** A replay is played by the scheduler that plays everything else
- same `World.step`, same `SPEED_FACTORS`, same accumulator - because a second
loop would be a second timing model to keep in step with the first, and the
speed control the milestone asks for already exists. What differs is exactly
one thing: `CommandQueue.seal()`, which makes `enqueue` drop what it is handed.
Two callers write into a queue and both of them have to be stopped, for
different reasons:

- **the AI of section 15** enqueues its moves from inside `step` (D-108).
  Those moves are ALREADY in the log - that is what makes an AI game
  replayable at all - so re-deriving them would run every competitor command
  twice. This is not a subtle corruption: `enqueue` refuses a tick older than
  the last queued one, so the first AI move of a replay throws against a log
  that already reaches the recorded end. Before the seal, a recorded AI game
  could not be played back at all; `replayTheatre.spec.ts` plays a
  twenty-thousand-tick game against one competitor through to the recorded
  hash and asserts the log holds commands of a company that is not the
  player's.
- **the interface.** The refusal is layered on purpose. The queue is the
  structural floor - a command that somehow reached it changes nothing. The
  worker refuses `command` (and `requestSave`) by name while `replay` is set,
  which is the AUTHORITY and the thing that produces a sentence on screen
  (`ui.replay.readOnly`). And `SimClient.send` returns false before the
  command leaves the main thread, which is the half a headless test can reach
  and what keeps commands that never happened out of the D-132 crash log. The
  interface then says the same thing by having nothing to offer: while a
  recording plays, the sidebar IS the playback bar, the build tools are
  unbound, autosave is off and F5/F9 do nothing.

**Leaving replay mode restores the game that was put aside, because entering
one REPLACES the world.** A replay swaps in a different world, tile layers and
all - exactly what a load does - so the way back is the way a load comes back:
the worker encodes the live game into `suspended` on the way in and loads those
bytes on the way out, through the ordinary load path, which is the one piece of
code that knows how to adopt a world completely. Only the FIRST entry saves a
game, so watching a second recording from inside the first cannot make the
first one the thing "leave" returns to. Any other world replacement - a load, a
new game, a shutdown - drops the recording too, so replay mode cannot outlive
the world it was watching.

**Scrubbing is the ring, and that is what makes a jump EXACT.** A jump to a
year restores that year's checkpoint and steps the remainder; a jump to a year
boundary steps nothing, so it lands on that tick with the hash the recording
committed to and not one tick either side of it (`restoreCheckpoint` verifies
the digest, D-188). Between checkpoints the remainder is re-simulated, which is
the same mechanism one step finer, and a recording with no usable checkpoint
below the target falls back to decoding the container again and reconstructing
the genesis - the fallback, never the rule, because it costs a full container
decode. The scrub chips ARE the ring (`replayJumpTicks`), labelled with the
calendar year rather than with a tick nobody can read.

**"Replay pruefen" names the first divergent tick, and it says which of the two
answers it is giving.** The running comparison at checkpoint granularity is
bundle 1's; what bundle 2 adds is the narrowing, and the honest limit of it.
Two facts do the work:

1. Between two committed hashes the world is a pure function of the state at
   the start (which MATCHED) and of the commands that ran. So a divergence
   inside the bracket must begin at a COMMAND's tick. When the bracket holds
   exactly one command tick, that tick IS the first divergent tick and `exact`
   is true. The M16 fixture is built to have one: a repayment alone in the
   second game year, tampered, is reported at tick 78,000 rather than at the
   84,000 the running comparison found it at.
2. That argument needs the log's own numbering to be truthful, so it is
   CHECKED rather than assumed. `checkLogIntegrity` walks the retained log for
   the two properties `CommandQueue` writes it with - `seq` contiguous, `tick`
   non-decreasing, both preserved by a trim, which drops a prefix and
   renumbers nothing (D-188). An entry inserted, removed or moved breaks one of
   them and is named with its index, tick and number. A break also WITHDRAWS
   the exactness claim: the executed sequence is then not the recorded one, so
   the candidate rule does not hold.

When the bracket holds several commands, the answer is the committed tick with
`exact: false` and a sentence that says so. That is a floor, and it is stated
rather than dressed up, because there is no honest way past it: the recording
commits to a hash once a game year and to nothing in between, and a bisection
needs a reference at the midpoint that simply does not exist - the end
checkpoint is one bit, and a full replay of the bracket always fails it, so it
carries no positional information at all. Naming the first command of the
bracket would be a guess that is wrong whenever the tamper is the second one.
What WOULD buy the exact tick in every case is a finer commitment IN THE FILE -
a rolling digest per envelope, say - and that is a format change with a
per-command cost, which belongs to a milestone that owns a save bump rather
than to a UI bundle that owns none.

The hash comparison stays the authority throughout: a log whose numbering is
broken but that still reproduces every committed hash is reported as
reproducing, because the hashes say the world is the recorded one and the break
is then bookkeeping rather than history. Verification runs on a SECOND world
decoded from the same bytes, so asking whether a recording is genuine does not
move the playback the player is watching, and a scrub before the question does
not turn the check into a check of the suffix.

**A file this build had to MIGRATE is shelved as it stands, and makes no
claim.** SPEC2 M16 wants old saves to stay watchable ("Resim ab Tick 0") and
E-11 refuses cross-version verification. Both are met by NOT manufacturing a
recording out of one: the save goes on the replay shelf unchanged, keeps its
own version pair, plays from the reconstructed genesis (D-188), and is
`verifiable: false` before the button is pressed - because the only end hash
available for it would be one THIS build computed over a state the writing
build never committed to, and a claim like that is a claim about nobody's
world. A save of the CURRENT format is converted properly: it carries a ring
and a log this build wrote, which is everything a claim needs to be honest. A
file that is already a `.ironreplay` is passed through untouched, since
re-encoding it would restamp somebody else's recording with this build's
version. The rejected alternative was a claimless REPLAY container, and it is
worth recording why: a replay holds the world at its BASE tick, so a container
without a claim has nothing that says where the recording ends - the playback
would start at the end of a recording of length zero.

**The shelf is a second shelf, not a slot on the save shelf** - its own
directory, its own index, its own metadata (the build that recorded it, the
years it spans, the companies that played) and no `.bak` dance: a save is the
only copy of somebody's game and is worth an atomic write, a recording is a
copy of something else by construction. The metadata is frozen when the file is
shelved, so the browser can grey out what the verifier would refuse without
decoding a world to find out. A recording's companies read from its BASE world,
which means a game renamed at tick 5,000 lists under the name it started with -
the honest thing for a browser that is listing what was PLAYED.

**Keyboard: F2** (D-114's table). Every letter with a mnemonic in either
language is already a build tool or a list - R, S, W, A and U all went that way
- and the F row is where the full-screen overlays live (F1 handbook, F5/F9 the
save shelf's own keys).

**Ledger.** No `SAVE_VERSION` bump: v27 is bundle 1's and this bundle changes
no serialised shape, so the canonical cross-OS pin and the corpus manifest are
untouched (nothing under `hashWorld` moved) and the field audit's two
allowlists are unchanged. No snapshot-layout change, no atlas cell. Tick cost:
none - a replay is stepped by the same loop, the seal is a boolean read on a
path that already allocated an envelope, and the only new per-frame arithmetic
is the `limit` comparison that stops a playback at the recorded end.

## M16 - the proof chain, bundle 3: the evidence (2026-08-08)

### D-190 A bug report carries a recording, the balance suite doubles as the desync net at a measured and stated price, and the soak fixture is a manifest of hashes rather than a megabyte in git

Bundles 1 and 2 built the format and the theatre. This one spends them: three
pieces of evidence, and the only decision each of them needed was where the
honesty line runs.

**The crash bundle carries an `.ironreplay` of the session, converted on the
MAIN thread from the very bytes it already copies.** SPEC2 M16 asks for it in
one clause and the audit's phrase for it is the point - the deterministic repro
superpower, made literal. A report has always carried the last save plus a
rolling command tail (D-132), and a developer could always convert that save by
hand; what the bundle lacked was the CLAIM, and with it the ability to ask the
game rather than a human whether the session reproduces. So the bundle now
holds the recording, its `finalTick`/`baseTick`, its command count, the
checkpoint ticks a scrub lands on, and whether THIS build may judge it. The
conversion is `replayFromSaveBytes`, extracted from `SimWorker.makeReplay` so
that the shelf's import, "export replay from save" and the crash bundle are one
function with three doors - the three cases (already a recording, an older
format, this format) had to stay one decision or they would drift apart.

D-132's argument decides WHERE it happens: when the worker dies it cannot be
asked to encode anything, so the survivor does it. `src/ui/sessionReplay.ts`
imports the sim DYNAMICALLY - the simulation belongs to the worker, and a
static import would put a second copy of it in the main bundle for a path that
runs once in the life of a session, if ever. That import is also the honest
failure boundary: a load that fails, bytes that are not a save, a file this
build had to migrate - each is caught, `replay` is null and `replayError` says
why in plain text. The recording is the repro ON TOP of the contract, never the
contract itself, so the bundle degrades to exactly what M10 promised.

**The recording ends where the last save ended, and the gap is stated in
numbers rather than papered over.** The commands issued after that save are in
the log tail, but as main-thread JSON: stamped with the last PUBLISHED tick,
without the worker's exact tick and without the sequence numbers `CommandQueue`
gave them. Splicing them into the log would manufacture a history that cannot
reproduce - and a recording that lies about itself is worse than one that stops
early, because the verifier would then report a desync that is really a
forgery. `replay.finalTick` against `error.tick` is the gap, and a test asserts
the report shows it. Schema version 1 to 2, because tooling has to be able to
tell bundle shapes apart (D-132's own reason for having the field).

Size, measured rather than assumed, on the twenty-five year AI game: the
recording is **582,520 B** against the save's **593,434 B**, of which the ring
is **566,367 B** in both - a recording and a save of the same long game cost
almost exactly the same, because the checkpoints dominate both. A bundle
therefore roughly doubles, and the shelf cap of five (D-139) is what bounds it.
That is the price of a self-contained repro and it is worth paying; what was
refused is the cheaper version - a recording with the ring stripped out - which
would have saved half the bytes by throwing away every intermediate hash and
leaving the verifier able to say only "somewhere in twenty-five years".

**Every balancing scenario is a desync guard now, and the price is split in the
open instead of being hidden.** SPEC2 asks for each scenario to run twice with
hash equality asserted. Measured one file at a time on the reference machine:
busline 6.6 s, coalTrain 9.1 s, woodChain 12.3 s, bankruptcy 10.7 s,
mineClosure 6.0 s, taktLine 9.4 s, netzdesign 12.9 s - and aiGame 40.9 s,
aiCompany 109.9 s. A complete twin is about **+186 s of CPU, of which the two
quarter-century AI scenarios are 143 s**: 77 % of the price for 2 of the 9
scenarios. Dropping the twin for those two would have been a quiet gap in a
sentence that says "every"; paying it on every developer's machine would have
made the suite something people stop running, which is the same gap by another
route.

So the split is declared and enumerated: the seven cheap twins run in every
`npm run test:balance` (+43 s of CPU; measured wall 118 s to 134 s), and ALL
NINE run in the new `soak` CI job on every push (`IRON_VEINS_BALANCE_HASH=all`,
also `npm run test:balance:full`; measured wall 223 s against the default
run's 134 s, of which the aiCompany twin alone is 101.6 s and the aiGame twin
23.2 s). Coverage of
every scenario is therefore per-push, not "eventually" - the rotating-subset
scheme the brief allowed was not needed once the expensive set turned out to be
two named files rather than a long tail.
`tests/unit/balanceDeterminism.spec.ts` is what keeps the claim true: it walks
the directory against the registry in both directions, so a new scenario
without a twin is a red build, and the one exempt file (`tariff.spec.ts`,
closed-form revenue ceilings) is named WITH its reason and re-checked - the
audit asserts the file really contains no world. Enumerated, not counted (the
D-183 habit).

The twin costs exactly ONE extra construction, not two: `hashTwin` takes a
thunk over the worlds the file already built for its band assertions and a
thunk that builds them again. Where a scenario is a comparison - netzdesign's
three railways, taktLine's takted and untakted pair, aiCompany's three
personalities - every world is hashed, because a divergence in either half
moves the number the band is read from.

**The long-run soak fixture is a manifest of HASHES, and that is the whole size
decision.** SPEC2 wants a recorded twenty-five year AI game replayed to an
identical hash. Committing the `.ironreplay` itself would put 582 kB of
compressed world states into git, re-recorded on every save bump, in a
repository whose glob test exists to keep binaries out (E-14). What the fixture
has to carry is what the recording COMMITTED to, and that is 1,359 bytes of
JSON: the sixteen year-boundary digests the ring holds, the final tick and
hash, the command count, and the parameters the game was played with. The
recording is rebuilt from the seed on every run - the same self-priming pin
protocol as the canonical cross-OS hash (D-137), including the error text that
tells you to delete the file and re-run when the simulation legitimately
changed, and never to re-pin a cross-platform divergence.

Two independent things are asserted, and only one of them needs the file: the
recording, decoded from its own bytes, re-simulates to every hash it committed
to (self-consistency, which catches a desync inside a single run), and those
hashes are the ones the fixture recorded (regression). Measured: seed 4,711,
256 map, three competitors, 1,800,000 ticks, **698 recorded commands**, final
hash `615d0259186b89dc`, compared at **16 committed ticks**, whole soak
**48.9 s** wall including the re-simulation. The liveness half is asserted too
- a soak that reproduces an empty world reproduces nothing - and the ring is
proven full with its base still at tick 0, which is D-188's never-evict rule
seen from the outside.

**The `soak` job runs on `windows-latest`, the platform both pins were recorded
on.** Putting a quarter-century AI game on the cross-OS surface would be
genuinely stronger evidence, and it is deliberately NOT taken here: D-137's
fixture is sized to be cheap on two runners and its failure is unambiguous,
whereas a red twenty-five-year soak on a second OS is an expensive thing to
bisect at a milestone boundary. The upgrade path is one line in the workflow
and is named here so it stays a decision rather than an oversight.

**Ledger.** No `SAVE_VERSION` bump - v27 is bundle 1's, and this bundle changes
no serialised shape: nothing under `hashWorld` moved, so the canonical cross-OS
pin (`50c7d6a38f6da052`) and the corpus manifest (`17f7f507023b91d8`) are
untouched, and the field audit's allowlists are unchanged. No snapshot-layout
change, no atlas cell, no tick cost - every line of this bundle is test
infrastructure, a crash-path conversion and a build file. The one production
change a running game can see is the extracted `replayFromSaveBytes`, which the
worker already ran verbatim.

## M16 - the proof chain, bundle 4: the verdict taxonomy (2026-08-08)

### D-191 A verification answers with a verdict rather than a number: the tick only when a re-simulation proved it, the bracket when it could not, and a broken FILE is never reported as a diverged SIM - superseding the exactness claim of D-189

D-189 gave "Replay pruefen" one answer, `firstDivergentTick`, with a boolean
beside it saying whether to believe it. An independent verifier took that
apart, and it was right to: a milestone whose whole identity is provable truth
had shipped a confident wrong answer, which is worse than an honest vague one.
Three findings, all reproduced in `tests/unit/replayVerdict.spec.ts` exactly as
they were found.

**D-189's stated justification is empirically false, and this entry says so
plainly.** It argued that the candidate rule was safe because "an entry
inserted, removed or moved breaks one of them" - `seq` contiguity or tick
monotonicity. A MOVED entry breaks NEITHER. Take the recording's second-year
command at tick 100,000 and stamp it 130,000: the sequence numbers are
untouched, the ticks still rise, `checkLogIntegrity` returns null, and the old
verifier then reported tick 130,000 as the exact first divergent tick - the
tick the TAMPER chose, while the two worlds really parted at 100,000, where the
recording ran the command and the re-simulation did not. The test asserts the
counter-example directly (same `seq` list, non-decreasing ticks, `null` from
the order checks) so the false claim cannot come back.

**Tampering the CLAIM rather than the history produced the same false
confidence.** Zeroing the `worldDigest` of the ring entry at tick 144,000, with
the log untouched, made the running comparison fail at that mark, and the
report named a divergent tick although nothing had diverged: the file was
broken, not the simulation. A verification that cannot tell those two apart is
not evidence about a simulation at all.

**The answer is a taxonomy, not a patch.** `ReplayVerification.verdict` is a
union of four, and each one is a different kind of statement:

* `verified` - every commitment the recording made was reproduced.
* `divergedAt(tick)` - and it comes with the `DivergenceProof` behind it. This
  is the only member that names a tick.
* `divergedInBracket(fromTick, toTick, whyKey)` - the world provably parted
  somewhere in there and this build cannot honestly go finer. `whyKey` is one
  of six sentences, because "several commands live in this stretch" and "the
  file's own timings are not evidence any more" are very different findings and
  a reader needs to know which one they are being told.
* `corruptRecording(where, tick, whatKey, detail)` - the file contradicts
  itself. It names no tick, ever.

**A recording now commits to WHEN its commands ran, and that is what makes an
exact tick provable at all.** The world digest says what the commands DID;
nothing said when they were issued, which is precisely the assumption the
candidate argument makes. So every mark - each checkpoint and the end claim of
a `.ironreplay` - carries one more hash: the SCHEDULE of the segment leading up
to it, the `(tick, seq)` pairs in log order, bounds hashed first and count
hashed last (`src/sim/save/schedule.ts`). A checkpoint commits to its own year
`[tick - 72,000, tick)`, a fixed rule that survives eviction and trimming; the
end claim commits to the part-year tail no checkpoint covers, which is the one
bracket in every recording where a command could otherwise be moved unseen and
also the part of the game that was played last.

**It covers the schedule and deliberately NOT the payloads, and that line is
load-bearing.** A digest over whole envelopes would catch more - and would cost
the exact answer in the only case that has one, because a tampered payload
would then be indistinguishable from a retiming. A payload change moves the
WORLD, and the world digest is what covers that; what no hash covered was the
timing. The commitment is exactly the assumption, and nothing more.

**Narrowing is now a chain of conditions, each of which can refuse.**
`narrowDivergence` answers with the bracket unless: the log agrees with itself
and with its commitments; the bracket is covered by a schedule commitment
(otherwise `uncommitted` - which is also what every recording written before
this bundle honestly gets, since its marks carry the empty digest); exactly one
command tick lies in the bracket (none means the divergence has no input behind
it and may have begun at any tick, several means naming one would be a guess
that is wrong whenever the tamper is the second one); and the proof comes off.

**The proof is a real re-simulation, and it is what "resim to t-1 matched,
resim to t did not" means here.** `proveDivergentTick` restores the checkpoint
at the bracket floor - a state the running comparison has already matched - and
runs the bracket TWICE: once with the recording's log, once with an empty
sealed queue that is handed no command at all. Up to `t` the two must agree,
and their agreeing is not decoration: the committed schedule says the recording
had no command before `t` either, so the control run IS the recorded trajectory
there, and the measured equality is the literal statement "the re-simulation
reproduces the recording up to `t`". A disagreement means the reasoning behind
the candidate is wrong, and the verdict falls back to the bracket
(`unproven`) - a proof that does not come off is never dressed up as a tick.
Then one tick more, with and without that command, and both hashes go into the
verdict. That the state at `t` differs from the recording's is the one step
that stays an argument rather than a measurement, and it is a closed one: the
states were equal entering `t`, no further command runs before the bracket end,
and the bracket end disagreed - so they must part at `t`. The unit test closes
even that loop, because a TEST has the reference the verifier cannot have: it
re-simulates the untampered recording from the same checkpoint and asserts the
proof's `matchedHash` at `t` and a different hash after `t`.

**A failing mark is asked whether it agrees with ITSELF before anything else.**
A checkpoint carries a payload and a digest OF that payload, so the zeroed-
digest case answers itself: the payload decodes, hashes to something else, and
that is a broken file - `corruptRecording`, with `where` naming the ring entry
and the failing detail carried in plain text for a bug report. A payload that
is not a world, or one standing at another tick, is the same finding. One more
case needs a second look: both halves replaced consistently with a coherent
world from another game. Self-consistency cannot see that, so the walk carries
on to the NEXT mark, and if the very trajectory that failed the earlier one
reproduces the later one exactly, the earlier claim is a claim about nobody's
world (`checkpointUnreachable`). The lookahead is ONE mark deep on purpose: it
costs one more bracket of re-simulation, and a diagnosis may cost that, while a
full walk of a quarter century after every divergence may not.

**Two floors are stated rather than hidden.** A tampered `replay.finalHash` has
no payload to be checked against, so it reads as a divergence in the tail -
which the tail's own schedule commitment then usually reports as
`noCommands`, the honest "no input can explain this". And a file that is BOTH
corrupt and divergent cannot be told apart from one that is only divergent:
when every mark from the first failure onwards disagrees, the earliest of them
is taken as the bracket. Both are limits of what a file commits to, not
oversights, and neither of them produces a confident tick.

**Ledger: no new `SAVE_VERSION`.** The schedule digests are container fields
and they extend v27 IN PLACE, which is Z5 read literally - v27 is M16's one
bump and this is M16's own defect; v28 belongs to M17. Nothing under
`hashWorld` moved, so the canonical cross-OS pin stays `50c7d6a38f6da052` and
the corpus manifest stays `17f7f507023b91d8` (both re-verified, not assumed:
the corpus fixtures carry no ring at all, and the audit's checkpoint and claim
sections gained the two fields). `v26_to_v27` grew the normalisation that gives
a payload without them the empty digest, and the parser accepts their absence
for the same reason - a recording written by an earlier build of version 27
committed to no schedule, and the honest consequence is a bracket instead of a
tick, never an invented commitment. The field audit gained two PARSER_IGNORED
entries with that reason (the `railTrains` precedent, D-153); the UNHASHED
allowlist is unchanged, because a perturbed digest fails the shape check. The
price of the commitment, measured on the twenty-five year soak: the
`.ironreplay` grows from 582,520 B to **582,995 B** - 475 bytes for sixteen
checkpoints and a claim, against a ring of 566,367 B - and the soak reproduces
the same final hash `615d0259186b89dc` at all sixteen committed ticks. Tick
cost: none. A schedule digest is computed once a game year on the SAVE path,
beside the checkpoint encode it rides with (24-41 ms), and the recomputation
during verification is a walk of the log on the failure path.

**Bundle size, measured.** The verifier also found a +248 kB main-bundle
regression from a static import chain, and it ran straight through the file
this bundle rewrites: `ReplayPanel.tsx` imported `replayCheckpointYear` from
`save/replaySession`, which pulls `serialize` and with it the whole `World`
into the main chunk and defeats the dynamic import `sessionReplay.ts` makes.
The fix is the same one the verdict needed anyway - the label travels WITH the
data: `ReplayMeta.jumps` carries each scrub chip's calendar year and
`ReplayVerification.years` carries the verdict's, both computed where the
calendar lives. No file under `src/ui` now imports a sim VALUE heavier than a
constant table. Measured with `npm run build`, before and after this bundle:
main chunk **1,083.31 kB -> 936.94 kB** (gzip 328.26 -> 283.96), the replay
half of the sim leaving for its own lazily loaded chunks (`replay` 158.36 kB,
`replaySession` 2.27 kB) that a session only pays for when a crash bundle is
assembled, and both vite warnings about the defeated dynamic import are gone.
The worker bundle carries this bundle's own new code and grew by what it is
worth: **309.23 -> 313.12 kB**.

## M16 - the proof chain, bundle 5: the budget, the scrubber and the one click (2026-08-08)

### D-192 The main bundle is measured by a test rather than by a rule, a recording is scrubbed to a tick rather than to a chip, and a save is watched in one click

Bundle 4 fixed a +248 kB main-bundle regression and wrote the rule down.
Bundle 5 is what happens when a rule is checked: the same chain was still
there in a smaller size, and nothing would have found it either.

**A rule that nobody measures is a comment.** D-191 states that `src/sim`
reaches `src/ui` through dynamic imports only, and it was already broken when
it was written: four main-thread files imported `SAVE_VERSION` or
`REPLAY_EXTENSION` from `save/format.ts`, and `format.ts` imports the entity
codecs, which import the vehicle catalogue, the line store and the station
types. Three constants dragged the parser into the main chunk - measured at
**32 kB**, an eighth of the defect that produced the rule and far too small
for anybody to notice by eye. So the container's IDENTITY is now a leaf,
`src/sim/save/version.ts`, with no imports at all, and everything that DECODES
stands above it; `format.ts` re-exports the three values, so the simulation's
own call sites still see one door.

**And the number is a test now** (`tests/unit/bundleBudget.spec.ts`). The main
chunk is a shared resource with a budget, exactly like the tick millisecond
and the atlas page, and it is the only one of the three that had no line in
the ledger. The test reads the entry chunk out of the built `index.html`
rather than guessing its name, measures the FILE (that is what a browser
downloads) and holds it against **930,000 B** - the measurement plus ~2.4 %.
Two decisions inside it are worth stating:

* **it builds when there is no `dist`, rather than skipping.** A guard that
  skips is green on every fresh checkout and on CI, which is exactly where a
  regression lands. It runs `vite build` only (~10 s; the type check is
  `npm run typecheck`'s job) and only when the artefact is missing or older
  than the sources, the entry document or the lockfile.
* **it pins `NODE_ENV=production` for that build.** The test runner sets it to
  `test`, vite honours an inherited value, and the resulting bundle carries the
  DEVELOPMENT React - measured +305 kB, a red build for a reason that has
  nothing to do with what the budget is about. That is the failure mode the
  test met on its first run, not one imagined for the comment.

The budget is a LEDGER entry, not a property of the machine: raising it is a
deliberate act with a fresh measurement beside it, an atlas-page booking in
another currency (SPEC2 6.2, Fehlerkatalog 40), and the failure message says
so - it asks the reader to look for a static sim import BEFORE raising the
number.

**A recording is scrubbed to a TICK, because the ring is sixteen entries and a
game is longer.** D-189 offered the ring as chips and called that scrubbing.
It is not: `CHECKPOINT_RING_CAPACITY` is 16, eviction takes the second-oldest
entry (never entry zero, D-188), so a twenty-five year recording offers the
genesis plus the last fifteen years and nine game years have no chip at all -
unreachable through the interface, although `ReplaySession.seek` has always
restored the newest checkpoint below ANY tick and re-simulated the remainder.
The bar is therefore the scrubber, and it is an `<input type="range">` rather
than a styled div: click, drag, keyboard and the screen reader's own value
come with it. A drag emits a position per pixel and a seek RE-SIMULATES, so
the drag moves a local position and only the release asks the worker; the
position then stands until the playback has arrived at it, or the bar would
snap back for the frame the seek takes.

**And the seek says what it will cost before it is asked for.** A chip year is
a decode; anything between two of them is re-simulated, and the sentence under
the bar names the checkpoint and the game days. That sentence is about work
the SESSION will do, so it is computed from the session's own rule -
`src/ui/replayScrub.ts` is `CheckpointRing.bestFor` read from the main thread,
and `tests/unit/replayScrub.spec.ts` holds the two against each other over a
sweep and on the boundaries rather than against a written expectation. The
module is deliberately import-free, which is the same lesson as the paragraph
above: a panel that needed the simulation's arithmetic would have imported the
simulation. `REPLAY_LONG_SEEK_TICKS` (18,000 ticks, a quarter game year) lives
beside it, the `TOOLTIP_DELAY_MS` precedent - it changes no world and prices
nothing. Its origin is the soak: 1,800,000 ticks in 48.9 s (D-190) is ~37,000
ticks per second, so a quarter year is about half a second there. It is a
threshold for a SENTENCE and never a refusal: the point of the arbitrary seek
is that every tick stays reachable, and a bigger world is simply slower.

**"Every save playable as a replay in ONE click" was two clicks across two
screens.** The save row's "Als Replay" only shelved a recording; playing it
needed F2 and a second button on another screen. The save row now has both
verbs - shelve, and play - and the play one carries `play: true` in the
`makeReplay` message, so the worker converts, answers with the recording for
the shelf AND enters playback in the same round trip. The intent travels in
the MESSAGE rather than as a pending flag on the main thread on purpose: a
flag would outlive a conversion that failed and start whatever was shelved
next. Two consequences follow and both are the honest half of the change: the
crash log's `replay` marker moved to the `replayStarted` branch, because it is
about a world that WAS replaced and there are two doors now; and the save
screen displays `replayError`, because a conversion asked for there must fail
there rather than on a screen nobody opened. The overlay closes on the
`replaying` transition itself, which is one rule for both doors.

**The repo-assets glob was not walking the files it was most likely to grow.**
`tests/unit/repoAssets.spec.ts` enumerates binary extensions, and neither
`.ironsave` nor `.ironreplay` was in the list - so the six committed corpus
fixtures (D-130) were exempt by ACCIDENT, and a seventh, or a stray recording
somebody force-added, would have been too. Both extensions are in the list now
and the corpus is on the explicit allowlist with its reason: it is the only
way to prove that a world written by an older build still loads, and it cannot
be regenerated from code by definition - the build that wrote it no longer
exists. A third assertion keeps the allowlist honest in the other direction:
every prefix must actually excuse a tracked file the pattern matches, so an
entry that stops matching fails the audit, exactly like a stale entry in the
save-field audit.

**Ledger.** No `SAVE_VERSION` bump and no migration: v27 is M16's one bump
(Z5) and nothing serialised moved - `SAVE_VERSION` changed FILE, not value, so
the canonical cross-OS pin stays `50c7d6a38f6da052` and the corpus manifest
stays `17f7f507023b91d8`. One protocol message gained a field
(`makeReplay.play`), which is main-thread traffic and touches no world. No
snapshot change, no atlas cell, no tick cost - `npm run test:perf` measured
tick p50 1.168 / p99 2.592 ms against the M10 baseline of 1.45 / 3.26. Bundle,
measured with `npm run build` before and after: main chunk
**936.94 kB -> 907.18 kB** (gzip 283.96 -> 277.04, 908,106 B on disk), the `replay` chunk growing
158.57 -> 190.41 kB as the parser lands where it belongs, the worker unchanged
at 313.15 kB.

---

## M17 - the goal machine, bundle 1: goals decided by the simulation (2026-08-08)

### D-193 A goal is the tutorial's predicate moved into the daily hook, because a medal has to be reproducible, and its bands live in hashed state rather than in the briefing

SPEC2 M17 asks for six goal descriptors and takes their vocabulary from the
tutorial of D-113 - and then, in the same sentence, says they are evaluated in
the SIMULATION's daily hook. That is a deliberate departure from D-113's rule
that a lesson watches and never touches the simulation, and it is worth being
explicit about which half of D-113 is kept and which is dropped.

**What is kept.** A goal is still a sentence plus a predicate over state that
already exists. Not one new signal was invented for it: company value is
section 14.1's own `companyValueCt`, a rating is `stationRating`, a connection
is the 7.4 table's `expectedTicks`, a population is the town's. A goal writes
nothing but its own verdict - no company, station, vehicle or tile is touched -
so architecture law #6 is untouched too: the daily hook is already a legitimate
author of state (E-10's argument for town growth), and no player command is
involved in reaching a verdict.

**What is dropped, and why it had to be.** D-113's binding reason for keeping
the tutorial out of the simulation was that a second author of state beside the
command queue would leave the replay missing half of what happened. A goal has
the opposite problem: evaluated in the interface it would be state the replay
never SEES. A medal decided in a panel is decided at whichever frame the panel
happened to be mounted, on whichever machine had it open; two players watching
one recording could disagree about who won, and M16's verifier - which compares
world digests - could not judge it at all. Evaluated sim-side and hashed, "the
goal fired at tick 860,800 with a silver medal" is part of the world's
fingerprint, survives the save, and re-simulates bit-identically. SPEC2 says
"nur so sind Sieg und Medaille deterministisch und replay-verifizierbar", and
that is exactly right.

**The bands are descriptors, not briefing.** SPEC2's `.ironscenario` metadata
block is deliberately UNHASHED and Fehler 35 makes a coupling test of it - a
briefing typo must never become a desync. Medal bands are listed among the
metadata in that sentence, and they cannot be: a medal decided from unhashed
bytes is a medal a typo can change, and two players with the same recording and
different files would hash different scoreboards. So the three band ticks are
fields of the GOAL DESCRIPTOR, which is world state - saved, hashed, fixed at
genesis. A scenario's briefing may DESCRIBE the bands in prose; the descriptor
is what decides them. That keeps the M17 scenario bundle's metadata block free
to be exactly what Fehler 35 wants it to be.

**Goals are a world rule (Z2), so they are a `NewGameParams` field**, saved,
hashed and migrated like `inflation` or the three 8.4 rules - and absent means
NONE, the load-bearing default every world recorded before M17 relies on. The
store is struct-of-arrays and allocated whole in its constructor, which is what
"descriptors preallocated at load" means in practice: the hook writes into
storage that already exists.

**The six descriptors, and the two places the words had to be pinned down.**
`ConnectStations` names TOWNS rather than stations, and that is forced rather
than chosen: a scenario is authored before a single station exists, so a
station id would refer to something the author cannot name, while towns are
placed at genesis and keep their ids. `StationRatingHold` watches the best
rating among the player's qualifying stops rather than one named station, for
the same reason - and its streak is a HISTORICAL input to a simulation
decision, so it is saved state (Z4) rather than something recomputed on load.
`CargoDeliveredTotal` needed a lifetime figure that no window can rebuild, so
`CompanyState.cargoDeliveredUnits` joined the save: one indexed add on the
delivery path that already books the revenue, per cargo, counting exactly what
the station ring calls Delivered (D-178) so the two can never disagree.

**A verdict is final.** Achieved or Failed, the goal is never measured again -
which is what makes a fifty-year game pay for a decided goal exactly once, and
why the tonnage goal's progress in the acceptance run reads 5,001 units while
the company has since delivered 70,800. The deadline is inclusive and is judged
on the day boundary that follows it; `SurviveUntil` is the one kind that can
fail EARLY, because a wound-up company cannot survive to a later date and
pretending otherwise would leave a decided outcome open for twenty years. The
parser refuses every scoreboard the hook could not have produced: achieved
without a date, a medal without an achievement, bands out of order.

**The snapshot block is the moving half only** - `SNAPSHOT_LAYOUT_VERSION`
8 -> 9, eight goals of two Int32, the 64 bytes the ledger booked. Progress in
thousandths and a `Standing` that folds status and medal into one signed number
(-1 failed, 0 open, 1..3 the band); every achievement earns at least bronze -
the bronze tick IS the deadline - so the fold loses nothing. What a goal IS
never moves and therefore never travels here (E-05, Fehler 37), and the block
is written from the ONE publish pass with every other block (Fehler 33).

**Allocation-free, measured rather than asserted - and the measurement found a
defect.** A bare `heapUsed` delta is not an instrument: it falls whenever a
collection happens to run, and the first attempt measured the ALLOCATING
control at a tenth of the subject. What is honest is the growth plus everything
the collector took away inside the window, which `GCProfiler` reports per
event. Instrumented that way, the hook's own machinery - loop, switch, store
writes, verdict transitions - allocates **0.17-0.71 bytes per game day over
50,000 days**, against an allocating control at 336 B/day. The harness has a
floor it states rather than hides: a call across a module boundary returning a
double is boxed here at exactly 16 bytes, because the test graph is not the
bundle the game ships, and the six-kind hook makes five such calls a day (81 B
measured, bound 128).

Chasing that residue found a real one. `stationRating` - documented
allocation-free since M5 because the collection gate and town production call
it from inside the tick - allocated ~9 bytes a call through `hasModule`'s
`for...of`, whose array iterator V8 does not always elide. It is an indexed
loop now, and the gate, the town clock and the goal hook all stopped paying it.

**Ledger.** **SAVE_VERSION 27 -> 28**, M17's one Z5 bump, owned by this bundle
and extended in place by the milestone's later bundles: `goals` plus
`cargoDeliveredUnits`, both hashed, migration entering none and zero - which is
exactly what a pre-M17 world knew about itself. First bump since v26 to move
hashed state, so both pins were re-recorded under their protocols: the
canonical cross-OS hash `50c7d6a38f6da052` -> **`4dff3f3f216385e6`** (D-137),
the corpus manifest `17f7f507023b91d8` -> **`f1dcab2a374ab728`** with a
`v28-played.ironsave` fixture, all seven fixtures still decoding to ONE world
(D-130). The soak fixture was re-recorded on the same reference platform,
`615d0259186b89dc` -> **`ed8ac72cd1d6284d`** at an unchanged 698 recorded
commands - the quarter century plays the same game, only the fingerprint moved.
The D-134 field audit covers every new field, with a synthetic achieved goal as
its representative; no allowlist entry was added or needed. Snapshot layout
8 -> 9, +64 B per slot. Atlas 0. Tick, measured on the 1,500-vehicle fixture:
**p50 1.181 / p99 2.449 ms** against the M10 baseline 1.45 / 3.26 on a row that
allows +0.05 - the hook returns on its first line for a world with no goals.
Bundle, measured with `npm run build`: main chunk **907.18 -> 907.53 kB**
(gzip 277.04 -> 277.16) against the 930,000 B budget, the whole of it the goal
block's constants in the shared channel; the `replay` chunk 190.41 -> 196.46 kB
and the worker 313.15 -> 319.89 kB, both of which carry the simulation and are
not the budget.

### D-194 A scenario is a save with a briefing, and the briefing is kept out of the hash by an audit rather than by a promise

SPEC2 M17 asks for `.ironscenario` as "eine Save-Obermenge mit ungehashtem
Metadatenblock" and settles the architecture in one sentence: **ein Serializer -
Szenario-Kompatibilitaet IST Save-Kompatibilitaet**. Taken literally that is the
whole design, and taking it literally is what kept this bundle small: there is
no scenario encoder, no scenario decoder, no scenario migration chain. There is
`encodeSave` with a sixth argument, one more section in `parseSaveFile`, and the
v27 -> v28 migration extended in place with a container default (Z5 - v28 is
M17's one bump and it belongs to the goal machine, D-193).

**The block is a CONTAINER field, so no hashed byte moved.** It joins
`gameVersion`, the command log, the checkpoint ring and the replay claim - the
family of things a file says ABOUT itself rather than IN itself (D-131). The
canonical cross-OS pin stays `4dff3f3f216385e6`, the corpus manifest stays
`f1dcab2a374ab728` and the soak fixture stays `ed8ac72cd1d6284d`; nothing was
re-recorded because nothing could have moved. Snapshot layout unchanged at 9,
atlas 0, tick 0.

**Fehler 35 is answered by three audits, and each one is fed a planted
violation.** "Ein Briefing-Tippfehler wird zum Desync" is a failure a comment
cannot prevent, so `tests/unit/scenarioCoupling.spec.ts` is built the way
`commandCoupling.spec.ts` is - pure audit functions over their inputs, with
meta-tests that prove they fire:

- **behaviour.** Every leaf of a real encoded `.ironscenario` is perturbed and
  the world hash compared. The meta-test hands the same audit a `hashWorld` that
  has the title and the German briefing folded INTO it, and requires the audit
  to report exactly those two leaves. That is SPEC2's acceptance sentence
  executed: planting a briefing field into the hash turns the build red. Two
  leaves get explicit replacements rather than a blind "append an X" - the lock
  list and the reference digest are shape-constrained, and a perturbation the
  parser refuses proves nothing about the digest.
- **reach.** A walk over `src/sim` fails the day a file outside `src/sim/save/`
  names the metadata vocabulary (the D-176/D-186 pattern). The first audit
  proves the digest does not read the block; this one proves nothing else does
  either, which is the stronger statement - a briefing that reached a pathfinder
  would desync without ever touching `hashWorld`.
- **the save-field audit itself.** The M10 field audit (D-134) now walks a
  payload that carries a scenario block, with ONE `scenario.*` entry in its
  UNHASHED allowlist and the reason written out. The metadata is therefore
  declared unwatched budget in the same place every other exception is, and a
  stale entry there fails like any other.

**Unhashed is not unchecked.** The parser validates every field: non-empty
strings under a bound (`SCENARIO_TEXT_MAX_CHARS`), both languages present, a
span that runs forwards, a reference hash that is a digest or nothing. Two
checks are worth their own sentence. The goal captions are cross-checked against
`state.goals.length`, which is the ONLY coupling between the unhashed block and
the hashed state there can be: a caption may describe a goal, never define one.
And the lock list must be strictly ascending, which gives a scenario's lock set
one canonical wire form and rules out duplicates in the same comparison.

**Medal bands and goals are not in the block, and SPEC2 lists both.** D-193
already refused the bands - a medal decided from unhashed bytes is a medal a
typo can change - and the same argument disposes of the goals: the descriptors
are hashed world state, and what the metadata carries is one CAPTION per goal so
the browser can say in German or English what the player is being asked for. The
briefing prose may name the bands; the descriptor is what decides them. This is
the one place the bundle deviates from the letter of SPEC2's list, and it
deviates towards SPEC2's own Fehler 35.

**Locked world rules are a list of names, honoured by the screen that offers the
choices.** `SCENARIO_LOCKABLE_RULES` names ten `NewGameParams` fields, and the
third audit holds all three properties D-110 and Z2 demand: every one of them is
a real `NewGameParams` field (a complete `Record<keyof Required<NewGameParams>>`
in the test, so a NEW world rule is a compile error until somebody decides about
it), every one is a top-level field of the saved world state (so it is saved,
hashed and migrated - a rule, not a setting), and none of them is an
`AppSettings` field. Three fields are excluded with reasons the audit checks for
staleness: the company name and colour are the player's identity rather than the
world's rules, and `aiCompanies` has no top-level saved field because the ROSTER
is the lock - a scenario ships its competitors already created and none can join
later (D-108).

The lock is deliberately advisory to the SIMULATION and binding on the
INTERFACE, and that is forced rather than chosen. Enforcing it sim-side would
mean a simulation decision reading unhashed metadata, which is precisely what
Fehler 35 forbids. It does not need to: the values that apply are the ones in
the shipped world state and they are hashed. A player who worked around the lock
would not be playing the scenario differently - they would be playing a
different world, and its hash would say so.

**The date span decides nothing on purpose.** A span that ENDED the game would
be a world rule and would have to be saved and hashed (Z2, Fehler 24). What
actually ends a scenario is a goal's `bronzeTick`, in hashed descriptor state.
`fromTick`/`toTick` are what the browser card prints.

**The reference final hash is a claim that is re-simulated, never believed.**
`verifyScenarioReference` compares it with the container's own `ReplayClaim`
FIRST - a file whose two halves name different ends is answering the question
before it is asked, and no re-simulation is run because it could only confirm
one of them and which one is exactly what is in doubt - and then hands the whole
job to `verifyReplay` unchanged: same version pinning (E-11), same verdict
taxonomy, same proofs (D-191). A scenario is not a special case of a recording,
it is a recording with a briefing. The answer is four-valued for D-191's reason:
`noReference`, `noRecording` and `claimMismatch` are three different findings,
and reporting "not verified" for all of them would be the confident non-answer
D-191 removed. The test that matters is the tamper: the metadata still names the
right hash and the claim still agrees with it, and only a real re-simulation of
the altered log sees that the recording no longer gets there.

**One latent defect fixed on the way.** `replayGenesis` rebuilt a world from its
saved rules but did not pass the goals, which have been hashed world state since
D-193. Every pre-M17 recording has none, so nothing measured moved - but a
scenario replayed from a reconstructed genesis would have diverged on its first
comparison, silently and for a reason that reads like a determinism bug.

**Ledger.** No `SAVE_VERSION` bump (v28's own migration extended in place, Z5),
no pin, no corpus, no snapshot byte, no atlas cell, no tick cost - the
simulation never touches this block. One new constant
(`SCENARIO_TEXT_MAX_CHARS`, 2,000 characters) and three new translation keys.
Bundle, measured with `npm run build`: main chunk **907.53 -> 908.59 kB** (gzip
277.16 -> 277.50) against the 930,000 B budget, and all of that is the three
German and English sentences - the main chunk contains no scenario code at all,
which was checked rather than assumed by grepping the built chunk for the
vocabulary. `replay` 196.46 -> 198.15 kB and the worker 319.89 -> 321.58 kB,
both of which carry the simulation and are not the budget.

### D-195 A shipped scenario is text, its seeds were chosen by looking at the worlds they generate, and its briefing is content rather than chrome

SPEC2 M17 asks for a scenario browser and "8 mitgelieferte Szenarien als
Text-Fixtures (Seed + Regeln + Ziel-JSON), die zugleich Determinismus-Fixtures
sind". Three decisions follow from taking that sentence literally, and the
third one is the interesting one.

**A shipped scenario is a definition, not a file.** `src/scenarios/catalog.ts`
holds eight entries of seed, world rules, goal descriptors and briefing; the
world is GENERATED when the player presses start. Nothing is stored, nothing is
decoded, and the eight cost twelve kilobytes of text rather than eight
megabytes of save. That is E-14's "no binary asset in git" applied to content
instead of to art, and it is what makes the same eight entries determinism
fixtures: same seed plus same rules is the same world (law #3), so the fixture
IS the product.

The `.ironscenario` file of D-194 is not made redundant by this - it is how a
scenario TRAVELS. `scenarioMetaOf` turns a definition into the metadata block,
and `tests/unit/shippedScenarios.spec.ts` writes every one of the eight out
through `encodeScenario` and reads it back with its goals intact. One
serializer, and the shipped catalogue is proven to be legal input to it.

**One function builds the world, and the browser, the worker and the fixtures
all call it.** `worldParamsFor(options)` came out of `SimWorker.restart` as a
module of its own, so `newGameOptionsOf(scenario)` -> `worldParamsFor` ->
`World.create` is the single path from a definition to a world. A determinism
fixture that assembled its own `NewGameParams` from the same fields would hash
its own copy of the rules and stay green while the game started something else
- the D-133 defect in a different costume. `NewGameOptions` grew one field for
this (`goals`), which is the door a scenario's goals travel through: the
new-game screen cannot author goals and should not, because goals come from a
scenario.

**The seeds were chosen by generating the worlds and measuring them.** This is
the part that cannot be shortcut and was not: two hundred seeds were generated
at 256 tiles and scanned, and the entries record what their maps actually hold.
What the scan established, beyond the eight choices:

- **an archipelago is rare and small on this generator.** Every seed is ~70 %
  land in one dominant mass, because the edge falloff plus the noise wavelength
  make one continent; in four hundred seeds exactly three had three inhabited
  land masses. Seed 67 is the best of them and is genuinely an island scenario:
  Sandenheim (8,000) sits on a 252-tile island 52 tiles of open water from
  Neu-Lindenried (8,000) on the mainland. No bridge spans that, so the
  connection is a ship or it is nothing. Calling it an "archipelago" would have
  been a briefing writing cheques the map does not cover, and the briefing does
  not.
- **relief varies less than it looks.** The global roughness of every 256 map
  sits between 0.231 and 0.267 height levels per tile step, so "which seed is
  mountainous" is not a question the histogram answers. What does answer it is
  the CORRIDOR between the two towns a goal names: seed 148's Silberheim to
  Ulmenburg is 60 tiles that climb and fall through 27 levels, span heights 2
  to 13 and cross eight tiles of water - the steepest long pair of towns in two
  hundred seeds. The test measures that corridor rather than the map.
- **climate changes the industries, not the terrain.** Relief and hydrology run
  before the biomes, so towns and heights are identical across climates for one
  seed - but industry placement is not. Seed 148 under arctic grows two coal
  mines and NOTHING that burns coal, which is why the mountain scenario's
  tonnage goal is passengers. A coal goal there would have been unachievable by
  construction, and the "producer and acceptor" audit is what would have caught
  it (the D-118 question asked per world).

**The thresholds are calibrated against measurements, and what is not measured
is said so.** Four figures were taken on this build and the bands are built on
them: four 1950 buses between two towns of 8,000 at 28 tiles deliver **21,400
passengers a game year**; one 1950 coal train of eight wagons over 45 tiles
delivers **~1,700 units of coal a year** (16,360 over ten); an unserved town of
8,000 reaches **10,465 inhabitants in twenty-five years** temperate and 9,200
arctic or desert, so a population goal above that line is a goal about SERVICE
and one below it is a goal about waiting; and D-158's ceiling - a competent
network gains at most ~840,000 EUR over a quarter century - caps every company
value asked for. What is NOT claimed is that a human has played each gold band.
The floor under that is a test rather than a hope: every scenario world runs a
full game year with no player at all and every goal must still be Open, which
catches the three cheap ways to ship a broken scenario (a value under the
starting capital, a population the town passes by itself, a rating nobody has
to earn).

**A briefing goes through the metadata block, never through `t()`, and the
distinction is the point.** The chrome around a scenario - the headings, the
medal words, the rule labels, the button - is interface and lives in
`src/i18n`, where the parity test is the guard. The briefing and the goal
captions are CONTENT: they belong to the scenario the way a threshold does,
they are authored with the seed they describe, and they travel in both
languages in the `ScenarioMeta` block of the file. Putting them in `de.json`
would mean a scenario somebody else writes could not carry its own words -
exactly the property the unhashed metadata block exists to give it - so a test
asserts the opposite direction too: no shipped briefing or caption may appear
in either catalogue. A caption still only ever DESCRIBES; the descriptor beside
it is what the daily hook measures (D-193), and the pair is kept in one object
so a caption cannot drift onto the next slot's goal.

**Ledger.** No `SAVE_VERSION` bump (v28 is M17's one bump and it belongs to the
goal machine, Z5), no migration, no pin, no corpus, no snapshot byte, no atlas
cell, no tick cost - a scenario is a set of new-game options and the simulation
never learns that it came from one. One protocol field (`NewGameOptions.goals`,
main-thread traffic). Bundle, measured with `npm run build` against the M17 B2
figures: main chunk **908.59 -> 913.49 kB** (gzip 277.50 -> 278.87; 914,431 B
on disk against the 930,000 B budget), and the catalogue is NOT in it - it
loads as its own **12.59 kB** chunk (gzip 4.18) behind the browser's dynamic
import, which was checked by grepping the built entry chunk for the scenario
names rather than assumed (D-191/D-192). `replay` 198.15 -> 198.03 kB, worker
321.58 -> 321.62 kB. The determinism suite grows by 14.5 s: eight worlds built
twice and played a game year each, all eight hash-identical across the two runs
and all eight hashing differently from one another, which is "genuinely
different" as a number rather than as a promise.

### D-196 The end of the game is one screen with four reasons, and the score is a reading of hashed state rather than a number that is stored

SPEC2 M17's last three MUSS items are a `GoalPanel`, a `GameEndScreen` "mit
Punktformel, Punktformel bekommt ein Balance-Band", and a
"Bankrott-Game-Over-Dialog". Read literally that is three screens; built
literally it would be two screens saying the same thing in different words,
because a winding-up IS an ending and the thing a player wants at either of
them is the same sentence and the same scoreboard. So there is ONE end screen
with four reasons - Won, Bankrupt, Lost, Century - and the bankruptcy dialog is
one of them. What the milestone actually closes there is an M8 hole: since M8 a
wound-up company produced a news entry and a red line in the finance panel,
which is a footnote and not an ending.

**The score is computed, never stored, and that is what keeps M17 at one save
bump.** Every input is already saved and hashed - the goal verdicts of D-193,
the company's books, the lifetime tonnage of `cargoDeliveredUnits`, the network
value of D-187 - so the score is the same number on every machine that holds
that state. Writing it down would create a second place for it to be wrong and
would cost a `SAVE_VERSION` bump Z5 does not have to give: v28 is M17's one
bump and it belongs to the goal machine. `sim/goals/score.ts` is therefore a
pure reading, called once a game day from the worker's publish pass beside
`postMonthly` - never from inside `tick()` (law #7), and nothing under
`src/sim` reads it back.

**Four quarters, each a SHARE of its own full mark, and the full marks are
measured.** Goals (medals earned against every goal at gold), company value at
the first year's prices, network value, and units delivered - 2,500 points
each, so a perfect game is 10,000. The saturation is the design: a player who
is very rich and ran a bad network cannot out-score a player who did all four
adequately, because the value term stops paying. The value is deflated by
`world.costFactor` for D-187's own reason - a company would otherwise read as
improving simply because the century wore on. The cargo term counts a passenger
and a tonne alike, deliberately: what the freight was WORTH is already the
value term's job, and a per-cargo weight here would be a second tariff table
standing beside `cargoSpec.baseRateCt` and free to disagree with it.

**The band is about the FORMULA, not about a good player.**
`tests/balance/gameScore.spec.ts` plays balancing scenario 3's wood chain a
quarter century with two goals over it and asserts two things: the total lands
in 3,000-7,000, and no single quarter is more than 45 % of it or less than 5 %.
The second is the one worth having - a score whose value term is nine tenths of
the total only asks how rich the player is, and the other three are decoration.
Measured: **5,747 points - goals 2,125 (37 %), value 1,477 (26 %), network
1,437 (25 %), cargo 708 (12 %)**, from 2 of 2 goals at silver overall,
2,362,704 EUR at first-year prices, 20.1 % of the closed-form ceiling and
70,800 units delivered. The scenario prints all of it. `SCORE_NETWORK_FULL_SHARE`
was set FROM that measurement rather than guessed: three point-to-point shuttles
that are almost never idle reach 20.1 %, so full marks are 35 % - a network that
also earns on the return leg, which is the half of the ceiling's assumption a
real railway hardly ever gets. The band owns the four full-mark constants;
freight tariffs, upkeep, D-187's network value and D-193's medal bands all land
here when they move.

**Hash-verified medals, end to end** (`tests/unit/gameEnd.spec.ts`). A bus line
is PLAYED for two game years with real commands until three goals are decided
at two different bands, exported as an `.ironreplay`, and then: `verifyReplay`
returns `verified`; `ReplaySession.seek(finalTick)` reproduces `goals.toData()`
field by field, the world hash, the score and the end marker; and the whole two
years re-simulated from the recording's own tick zero reaches the same
scoreboard. The claim is closed from the other side too - a world whose ONLY
difference is one medal hashes differently - because "the digest covers it" is
exactly the kind of statement that quietly stops being true when a field lands
on the wrong side of an audit. That test found a fixture defect worth
recording: `tests/balance/scenario.ts` lays its ground by hand and never runs
`markOcean`/`computeLandmasses`, so an industry SPAWNED by the yearly hook
records `landmassId` -1 before a save and 0 after one. The shared fixture is
deliberately left alone (every balance band was measured against it); the two
calls are made in the test that needs a save-stable world.

**Two halves reach the panel, and both were already designed.** What a goal IS
- kind, subject, threshold, band ticks - never moves and travels on the marker
channel once a game day, which is the cadence the daily hook decides goals at
and therefore the fastest anything about them can change (E-05, Fehler 37). The
moving half is the snapshot's 64-byte goal block, and the panel's bar is its one
consumer; `SimClient` compares sixteen integers before it writes, because a
fresh array every poll would re-render the panel fifteen times a second to draw
the same bar. The exact FIGURE cannot come out of thousandths - "1,234,567 EUR
of 2,000,000" is not derivable from "617 per mille" - which is why the marker
carries it and the block does not grow a third field.

**The panel names a goal from its DESCRIPTOR, never from a briefing.** A
scenario's caption is content that travels with the scenario (D-195), and a
loaded save carries goals with no metadata block at all - so a panel built on
captions would be blank in every game that was ever saved and reloaded. The
descriptor is what the daily hook measures, which is also the D-179 principle:
the instrument displays the simulation's own terms. Band ticks arrive as
calendar YEARS and town subjects arrive with their names looked up, because the
interface has no tick clock and reaching for `calendarFromTick` from a component
is precisely the static import chain D-191 removed.

**Won beats Bankrupt beats Lost.** A verdict is FINAL (D-193): a company that
achieved every goal and then went broke has won the scenario and lost the
company, and the score says both because its value and network terms collapse
on their own. Bankrupt has to come before Lost, because a winding-up leaves
every goal but `SurviveUntil` sitting Open for ever, so the goal outcome alone
would report "still running" for a game that is unmistakably over. The screen is
dismissible by REASON rather than by tick - the marker is re-sent every game
day, so a tick-keyed dismissal would last exactly one day - and it never appears
over a replay, whose buttons would offer to start somebody else's game (D-189).

**One defect fixed on the way.** `goalProgressMilli` divided progress by the
THRESHOLD for every kind, and a `StationRatingHold`'s progress is a run of days
while its threshold is a rating: "hold 60 for 30 days" read as one sixth done on
the day it was met. `goalTarget` is the denominator now, and the store, the
snapshot block and the panel's fallback all read it. Snapshot-only, so no hashed
byte moved and no pin was touched.

**Ledger.** No `SAVE_VERSION` bump (v28 is M17's one, D-193), no migration, no
pin, no corpus, no snapshot byte, no atlas cell. The canonical cross-OS hash
stays `4dff3f3f216385e6`, the corpus manifest `f1dcab2a374ab728` and the soak
fixture `ed8ac72cd1d6284d` - checked by running them, not assumed. Five new
constants (`SCORE_TERM_MAX_POINTS`, `SCORE_MEDAL_WEIGHTS`, `SCORE_VALUE_FULL_CT`,
`SCORE_NETWORK_FULL_SHARE`, `SCORE_CARGO_FULL_UNITS`) and one new protocol
message (`goalsChanged`, main-thread traffic). Tick, measured on the
1,500-vehicle fixture after the whole milestone: **p50 1.241 / p99 2.564 ms**
against the M10 baseline 1.45 / 3.26 on a row that allows +0.05 - the marker
costs one message a game day on the cadence the fleet already posts on, and the
score is computed on that message. Bundle, measured with `npm run build`: main
chunk **913.49 -> 923.32 kB** (gzip 278.87 -> 281.92; **924,276 B on disk
against the 930,000 B budget**), of which 5.5 kB is the fifty new German and
English sentences and the rest the panel, the screen and the store. The end
screen is `React.lazy` for that reason - it is the one screen a session shows at
most once, and it loads as its own 2.41 kB chunk (gzip 1.00). `replay`
198.03 -> 197.99 kB, worker 321.62 -> 324.10 kB, CSS 12.70 -> 13.43 kB. **The
remaining headroom is 5,724 B and that is worth saying out loud**: the budget
was set with a 2.4 % margin and M17 spent it down to 0.6 %, honestly (all
interface, none of it a sim import chain), so the next milestone that adds a
panel will have to book a raise with its own measurement the way D-192 requires.
Raising it here, under the line, would be spending headroom this bundle did not
need.

---

## M17 - the acceptance pass: honesty defects closed (2026-08-08)

### D-197 A briefing that lied about its own world, a "25 years" that was 22, and a constant validated by the run it came from

Independent verifiers read M17 and M16 and found four claims that were not true.
None of them was a crash, a desync or a wrong number in the simulation - every
one was the project's own standard applied to itself: a sentence somebody would
read and believe, with nothing holding it to what the code does. They are
recorded together because the fix is the same shape each time. **Make the claim
true, or change the claim. Never quietly widen the claim until it stops being
checkable.**

**1. The Passagiernetz briefing promised eight cities and the world had seven.**
`src/scenarios/catalog.ts` said, in the doc comment, "seventeen towns of 2,500 or
more, EIGHT of them at 8,000", and told the PLAYER "Acht Grossstaedte zu je
8.000 Einwohnern". Generated and counted, seed 10 has SEVEN. The doc comment was
wrong and the briefing was wrong with it, and the only reason nobody noticed is
that no test had ever asked the world.

The scenario's identity is a passenger network between big towns, so the seed
moved rather than the promise. Four hundred seeds were generated at 256 tiles
and temperate climate and exactly THREE carry eight towns of 8,000: 28 (which is
already Rats-Diplomatie's), 53 and 360. **360** was taken, because it also
carries the seventeen towns of 2,500 the old comment claimed - so both halves of
the sentence became true at once. Its four closest cities stand in a chain -
Nieder-Weidengrund to Kaiserskirchen 33 tiles, Rosenburg another 37, Ahorngrund
another 30, all dry land - and the `ConnectStations` goal names the first pair.
The one claim that could not be re-measured was dropped rather than restated:
"a measured AI competitor here delivered 28,457 passengers in its first year"
came from a run with an AI driver attached, which no fixture in the repository
reproduces, so it is gone.

**Then all eight were audited the same way, and four more entries were wrong.**
Frachtrausch claimed "the closest pairing is 59 tiles apart, the second 66" -
measured, each mine's nearest power station is 57, 59, 70 and 106 tiles away, so
the briefing's first figure named neither the closest pair nor a real pair (the
mine at 101,129 is nearest to the plant at 155,112, not to the one at 148,83),
and the "climb 24 over 89 tiles" corridor does not exist (the long one is 25 over
106). Wiederaufbau, Rats-Diplomatie and the catalogue header were all wrong by
exactly ONE GAME YEAR in the same way: 9,925 is what an unserved temperate town
of 8,000 reaches after TWENTY years and the text called it "by 1970"; 10,465 is
what it reaches after TWENTY-FIVE and the text called it "by 1975" - but a
scenario deadline of `endOfYear(1975)` is the year running OUT, where the figure
is 10,574. The desert pair is 9,200 / 9,248. Ueberleben called itself "the
thinnest offer of the eight" while Gebirgslogistik has two industries to its
ten. The other two calibration figures were re-measured and stand: four 1950
buses on 8,000-strong towns 28 tiles apart deliver 21,393 passengers in their
first game year, and the eight-wagon coal train 16,360 units over ten years.

**The deliverable is the test, not the seed.** `SCENARIO_WORLD_CLAIMS` in
`tests/unit/shippedScenarios.spec.ts` states, per scenario, every figure a
briefing or a doc comment quotes about its own world - towns at 8,000, towns at
2,500, industries, industries by type, inhabited land masses, the named towns
with their ids and populations, the corridors with their distance, climb, water
and height span, the archipelago's land-mass sizes in tiles, each mine's nearest
power station, and the cargo Gebirgslogistik's map deliberately cannot burn.
Every one is pinned EXACTLY rather than banded, because the generator is
deterministic (law #3): a changed seed, a changed mapgen constant or a changed
climate table moves them, and moving them silently is the failure being closed.
A ninth scenario without a claims row is a red build. The one claim about the
world's FUTURE rather than its generation - "the population goal cannot be waited
out" - is played to its exact deadline on the cheapest such world (Wiederaufbau
has no competitors, 0.45 s) and pins 10,574 against the 11,000 the goal asks for.

**2. A test called "25-Jahres-Partie" simulated twenty-two years.**
`tests/unit/goals.spec.ts` set `world.tick = 3 * TICKS_PER_YEAR` (1953, because
the box lorry the chain needs is a 1953 vehicle) and ran to
`25 * TICKS_PER_YEAR`. Both halves of the acceptance sentence in SPEC2 and in
the 6.1.1 ledger say a quarter century. The horizon is
`CHAIN_START_TICK + 25 * TICKS_PER_YEAR` now - 1953 to 1978, twenty-five years
every one of which is simulated - and the goal's own 1975 deadline is a date the
run passes on its way rather than the day it stops, which is what lets the medal
bands mean anything.

Starting in 1950 instead was tried first and is worse than wrong. Only the WOOD
haul can be crewed in 1950; the sawmill then produces planks nobody collects for
three years, the 24-month closure clock of D-086 shuts it in 1952, and what gets
played is one works and two dead ones - measured, 3,472 units delivered against
70,800 and a company value of MINUS 58,857 EUR. That is recorded in the file so
nobody tries it again. Re-measured after the change: the goal still fires at tick
860,800 (year 1961) for a SILVER medal, unchanged, and the company ends on
4,103,179 EUR rather than the 2.36 M of the shorter run.

`tests/balance/gameScore.spec.ts` had the identical defect under the identical
words ("played a quarter century") and was moved to the same horizon. Re-banded
by re-running, not by adjusting: **5,889 points - goals 2,125 (36 %), value
1,556 (26 %), network 1,413 (24 %), cargo 795 (13 %)**, against the unchanged
band of 3,000-7,000 with no quarter over 45 % or under 5 %. Not one constant
moved.

**3. `SCORE_NETWORK_FULL_SHARE` was validated by the run it was derived from.**
The constant is 0.35 because the wood chain reaches 20.1 % of D-066's
closed-form ceiling and full marks should want a network that also earns on the
return leg. The balance band then asserted that the network term is between 5 %
and 45 % of the total and does not saturate - both of which follow from that
derivation arithmetically. A green test that cannot fail is not evidence, and the
file now says so in those words.

What was added is a SECOND quarter century that had no part in setting any
constant: same map, same industries, same stops, same twelve lorries bought on
the same day with the same orders, and one difference - the road between the
stops doglegs sixteen tiles north and back, so every leg is sixty-two tiles of
driving instead of thirty over an UNCHANGED paid distance. The ceiling depends
only on capacity, tariff, top speed and years (D-187), so it is identical by
construction and asserted to be (within 1 %); the whole difference lands in the
numerator, which is the property the network value exists to have. Measured:
**19.8 % against 7.8 % of the ceiling, a factor of 2.55, and 1,413 against 554
score points**. None of the three assertions follows from the constant: the
botched share is a number nobody put into 0.35, the RATIO between the two shares
is independent of the full mark entirely, and "neither run saturates" is now a
statement about two structurally different runs rather than about the one the
constant was fitted to. The dogleg descends clear of the town because
`placeTown` puts houses down the whole column beside the centre and a road may
not be laid through a building - that is why the last few tiles run along the
row.

**4. Three M16 residuals, closed here because they are cheap and named.**

*The superseded sentence.* SPEC2 section 6.1.1 still carried D-189's
Fertig-wenn wording - "Replay pruefen nennt bei manipuliertem Log den ersten
abweichenden Tick, sonst ehrlich als obere Schranke mit `exact: false`" - which
D-191 had already proved false and replaced. It now states what the code
guarantees: a verdict, an exact tick ONLY with a re-simulation proof attached,
one of six named reasons when the bracket cannot be narrowed, and a corrupt file
that never gets a tick at all.

*The untested honesty branch.* `ui.replay.bracket.unproven` - the verdict when
`proveDivergentTick` returns null - existed only in the two i18n files and in the
list of keys a test checks are translated. Nobody had ever made the verifier say
it. It is produced now by the case the branch is FOR: a recording whose GENESIS
CHECKPOINT has been removed, with a payload tamper on the single command of the
first bracket. Every earlier gate passes - the log's timings are intact so every
schedule digest still matches, the bracket IS covered by a commitment, and it
holds exactly one command - and then the proof has no committed world to
re-simulate from, because starting from a world this build merely REACHED would
prove a tick against its own guess. The verdict is the bracket with the reason,
and the test asserts that the obvious candidate tick appears NOWHERE in it. A
control with the ring left intact returns the exact tick, so "unproven" is a
statement about the missing evidence rather than about the tamper.

*The world that could be created and never saved.* `World.create` accepted any
`mapSize` while `parseWorldState` accepted powers of two between 64 and 2048, so
a world of 96 tiles could be generated and played and then never saved,
checkpointed, replayed or crash-bundled - every one of those doors goes through
the parser, and the failure would arrive an hour after the mistake with nothing
to say about where it came from. The rule is ONE function now
(`src/sim/map/size.ts`, bounds in `constants.ts` with their origin) and both ends
import it, message included, so a refusal reads the same whichever end refused.
It sits in the private `World` constructor, which is the single door `create`,
`fromGenerated` and `fromData` all pass through.
`tests/unit/mapSize.spec.ts` holds the AGREEMENT rather than either half: the
same eleven sizes refused at both ends, the same six accepted at both, and the
selectable `MAP_SIZES` inside the rule the format enforces. One asymmetry is
stated rather than papered over - a fractional size never reaches the
constructor, because `TileMap`'s typed-array views refuse to align first.

**The bug was not hypothetical, and turning the check on proved it.** Three
fixtures in the repository were building worlds the save format would have
refused: `routing.spec.ts` and `finalApproach.spec.ts` at **96 tiles** - the
exact size the verifier named - and `streamFor.spec.ts` at 16. Every one of them
had been green for milestones while exercising a world that could never have
been saved, checkpointed or replayed. They moved to 128, 128 and 64; not one
coordinate in either 96-tile fixture changed and both pass unaltered, because a
larger map is simply more empty ground around the same layout.

**Ledger.** No `SAVE_VERSION` bump - v28 stands, M17 owns it and it is shipped.
No migration, no snapshot byte, no atlas cell, no protocol field. Nothing this
bundle touched is hashed world state: the Passagiernetz seed changes which world
that scenario GENERATES, and the eight shipped scenarios are text rather than
fixtures with pinned digests (`tests/determinism/scenarios.spec.ts` compares two
runs of each against each other, never against a recorded number), so the
canonical cross-OS pin `4dff3f3f216385e6`, the corpus manifest
`f1dcab2a374ab728` and the soak fixture `ed8ac72cd1d6284d` are all untouched -
checked by running them rather than assumed. Two new constants (`MAP_SIZE_MIN`,
`MAP_SIZE_MAX`, both with their origin) and one new import-free leaf module.
Test cost measured: `shippedScenarios.spec.ts` 6.3 s, `goals.spec.ts` 24.6 s
(three more game years), `gameScore.spec.ts` 38.6 s (the second quarter
century), `replayVerdict.spec.ts` 1.3 s, `mapSize.spec.ts` 0.1 s. Bundle,
measured with `npm run build`: main chunk **924,308 B against the 930,000 B
budget** (923.35 kB, gzip 281.93) - **+32 B**, which is the only number the
whole bundle could move, since no interface file was touched and the new leaf
module is imported by `World` and the save format alone. The scenario catalogue
stayed in its own dynamically loaded chunk and grew 12,560 -> 12,928 B, all of
it the corrected briefings. `replay` 198,180 B, worker 324,283 B, CSS
unchanged. Suite after: 114 files, 1,253 passing plus 2 skipped, and the 13
perf tests.
## M17 - the acceptance pass after that one: the briefing bound to its claims (2026-08-08)

### D-198 The guard that pinned the world and never read the sentence

D-197 built `SCENARIO_WORLD_CLAIMS`: every world property any shipped briefing
quotes, pinned exactly against the generated world. An independent verifier
checked all of it, confirmed every figure was true - and then defeated the guard
in one move. He put the falsification in the PLAYER-FACING German briefing of
Passagiernetz ("Acht Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab
2.500" became "Neun Grossstaedte zu je 9.000 Einwohnern und vierzig Orte ab
2.500"), left the claims table untouched, and the whole suite stayed GREEN.

He was right, and the reason is worth stating plainly: **nothing in the
repository read a briefing's content.** The only assertions on the text were
non-empty, under `SCENARIO_TEXT_MAX_CHARS`, and de !== en. The claims table
pinned the world the sentence is ABOUT and had no opinion about the sentence.

**1. The fix: every number a briefing says out loud is read back.**

Two designs were honest, and the second was taken.

*(a) Derive the numbers INTO the prose* - placeholders in the briefing filled
from the claims table at load or build time, so text and table cannot disagree
by construction. Strongest in principle, and refused for two reasons that
compound. It has to generate German AND English prose from bare numbers:
agreement ("zwei Kraftwerke" against "ein Kraftwerk"), spelled-out numerals
where the register wants them and digits where it does not, capitalisation at
the head of a sentence. And it would STILL need a scanner underneath it: a
placeholder scheme binds the numbers that ARE placeholders, and a literal
numeral typed in beside one is exactly as invisible as before. Since the
scanner is needed either way, the scanner alone is the smaller mechanism - and
it is the stronger one here, because it also covers the numbers no placeholder
could fill and it makes the two locales one claim rather than two.

*(b) Extract and compare* - `tests/unit/briefingNumerals.ts` reads every
numeral out of every briefing in both locales, and `SCENARIO_BRIEFING_FIGURES`
in `tests/unit/shippedScenarios.spec.ts` says, in reading order, where each one
is allowed to come from:

- **pinned** - resolved out of the claims table (`townsAt2500`,
  `citiesAt8000`, `industries`, a corridor's distance in whole tiles, its
  height span, its water tiles), out of the scenario's own definition (a goal
  threshold, `aiCompanies`, the year `toTick` falls in), or out of a constant
  with its own origin (`START_CAPITAL_CT` per difficulty,
  `BANKRUPTCY_WARNING_MONTHS`, `BANKRUPTCY_MONTHS`, `HEIGHT_STEP_M`,
  `SHIPPED_SCENARIOS.length`). Nobody can move one of these without moving
  what it is read from, and the claims table is in turn held against the
  generated world. That is the chain the falsification walked around.
- **allowed** - a number no world property can justify, with its value AND the
  reason. There are exactly EIGHT in eight briefings, and the test asserts both
  that count and that the world-bound figures outnumber the free ones in every
  single scenario: the two SPEC.md "8.4" cross-references, the four buses and
  21,400 / 21,000 passengers of the bus calibration, the eight wagons and 1,700
  units of the coal calibration. Each reason names where the measurement comes
  from - including that 21,000 is the same measured 21,393 rounded DOWN because
  Passagiernetz's pair is 33 tiles where the measurement drove 28.

Both locales are compared against the SAME resolved list, so the two languages
are one claim: a figure that changes in German and not in English is red, and
so is a translation that quietly drops one.

The extractor handles what the lie was actually written in. Digits with either
language's thousands separator, and spelled-out numerals in German and English
- "neun" and "vierzig" are how the falsification reads. Three things are
deliberately not numerals, each a hole in one direction only, because any edit
that turns a recognised numeral into something else drops it from the sequence
and the comparison fails on length: the German article that is also its numeral
("ein Zug" is "a train"), the English pronoun "one", and ordinals ("die vierte
Buslinie" ranks, it does not count). Two shapes a naive reader gets wrong are
tested directly: "57, 59" is two numbers where "1,700" is one, and the 2 in
"CO2-Abgabe" is not a number at all. And a numeral WORD the table has never
seen is not silently ignored - `unrecognisedNumeralWords` flags anything built
out of the productive parts of either language, so "einundvierzig" is a red
build rather than an invisible claim.

**The proof was performed, not asserted.** The verifier's falsification was
planted in `src/scenarios/catalog.ts` itself - the same three lies, one word
each, applied to the sentence as it now stands ("siebzehn davon" -> "vierzig
davon", "acht von diesen" -> "neun von diesen", "8.000" -> "9.000"). The build
went RED, with a message that names the figure that moved: *"passagiernetz/de
quotes 16 figures - 0: Vierzig (towns on the map), 1: vierzig (towns of 2,500
or more), 3: neun (cities among them), 5: 9.000 (the population a city starts
at) ... expected [40, 40, 2500, 9, 17, 9000, ...] to deeply equal [40, 17, 2500,
8, 17, 8000, ...]"*. Two tests failed: the audit and the meta-test. The plant
was then reverted and the file is green again. The meta-test keeps the
falsification permanently, applies it to the live string and requires the
comparison to reject it - with the converse beside it, because a guard that
rejects everything is no guard.

**2. The wording defect: a set stated as if it stood beside its superset.**

"Acht Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab 2.500" was TRUE
of seed 360 and still misleading. Two counts joined by "und" state a partition,
and a player reads twenty-five settlements. Measured, the map carries FORTY
towns; seventeen of them have 2,500 or more; and the eight cities are eight OF
those seventeen, not eight beside them. Both languages now say it in the order
a reader can only take one way - "Vierzig Orte stehen auf der Karte, siebzehn
davon haben 2.500 Einwohner oder mehr, und acht von diesen siebzehn sind
Grossstaedte zu je 8.000" - and the claims table pins `townsTotal` (40) with the
ordering `citiesAt8000 <= townsAt2500 <= townsTotal` as a property of the table
itself.

The same sentence carried a second overclaim: "dichter ist keine der acht
Karten besiedelt" is false by the obvious other measure - Rats-Diplomatie has
97,000 inhabitants on it against this map's 95,700. It says what is true and
checkable now ("keine der acht Karten traegt mehr Orte ab 2.500"), and a test
compares that count across all eight claims and requires this one to be the
strict maximum.

**All seven other briefings were read for the same defect class and none has
it.** Frachtrausch's "vier Kohlegruben, zwei Kraftwerke" are disjoint types;
Wiederaufbau's farms and food factories likewise; Ueberleben's "zehn
Industrien, zwei Grossstaedte" count different things. The one near-miss was
Gebirgslogistik, which quoted one corridor in two measures ("elf Hoehenstufen,
88 Meter") in a way that could read as two separate quantities; it now says
which two points the eleven levels are between and that the metres ARE those
levels.

**3. Three claim types that could not express what a doc comment said.**

*A corridor could only address towns.* Frachtrausch's comment quotes four
gradients between mines and power stations - "the two short corridors climb and
fall 16 and 12 levels, the 70-tile one 12, the long 106-tile one 25" - and a
mine-to-plant corridor was inexpressible, so all four sentences were unpinned.
`CorridorEnd` is a town id OR an industry id now, and the four corridors are in
the table with their distance, climb, water and height span.

That is also how a wrong sentence was found: the M17 comment said "three of the
four are nearest to the plant at 155,112", and measured, ALL FOUR are. The mine
at 101,129 is 57 tiles from that plant against 66 from the one at 148,83, and
the other three are further from the second plant still. `nearestPlantOfMine`
replaces `nearestPlantTiles` and pins the plant BY ID per mine, so "the same
plant for all four" is an assertion rather than a summary; `industriesAt` pins
the two plants' positions, which is what makes "the plant at 155,112" a name.

*A land mass could only be pinned by size.* Inselhuepfen's comment says "a
252-tile island carries Sandenheim (8)", and `landmassTiles` pinned the sorted
sizes [45,084, 252, 27] - which would hold unchanged if the two cities swapped
islands, with the sentence false and every number in the table green.
`townLandmassTiles` binds the pair.

*A growth curve was quoted rather than played.* The catalogue header quotes six
population figures for an unserved town of 8,000 - 9,925 / 10,033 / 10,465 /
10,574 temperate and 9,200 / 9,248 desert - and exactly one of them (the last
temperate) was played out while the other five were prose. `passiveGrowth` plays
them all now: four samples on Wiederaufbau, which has no competitors at all, and
two on Ueberleben's seed with `aiCompanies` set to zero. That last part is a
field of the claim, `withoutCompetitors`, because "unserved" is not a property a
world with four AI builders in it can be asked about, and a test that quietly
played the shipped world would be measuring something else. All six figures were
confirmed by the runs; not one had to move. Rats-Diplomatie's comment, which
quoted the temperate pair as if IT had been measured, cites Wiederaufbau's
pinned curve now and says why Falkenheim itself cannot honestly be played out:
three competitors, and one of them serving the town is what its goal asks the
player to do first.

**4. The refusal that was not the refusal the real door prints.**

D-197 put the map-size rule in the private `World` constructor, "the single door
`create`, `fromGenerated` and `fromData` all pass through". True, and one step
too late: `create` GENERATES a map before it reaches the constructor, and mapgen
fails on its own terms first. `World.create({ mapSize: 32 })` answered
`MapGenerationError: No playable map found for seed 7 after 20 attempts` - a
true sentence about the wrong subject, after twenty wasted generation attempts,
for a size the save format was never going to accept. `mapSize.spec.ts` never
saw it because every assertion went in through `fromGenerated`, which is handed
a map that already exists.

`create` asks the size question before it spends anything, through the same
private `refuseIllegalMapSize` the constructor uses, so there is still ONE
sentence and one place it is written. The test goes through the real door now:
all eleven refused sizes through `World.create` as well, plus the 32-tile call
by name with BOTH halves asserted - the size sentence must appear and the word
"playable" must not. Verified by disabling the new check and watching that exact
test fail with the MapGenerationError, then restoring it. The one asymmetry
stays stated: a fractional size is refused by the rule through `create` and by
`TileMap`'s typed-array alignment through `fromGenerated` - two sentences, both
refusals.

**5. Documentation staleness, re-measured rather than copied.**

`CLAUDE.md`'s M17 summary line and SPEC2 6.1.1's bundle paragraph both still
quoted 924,276 B and 5,724 B of headroom under their summaries while the D-197
paragraphs beneath them said 924,308. Re-measured with `npm run build` on this
build: main chunk **924,308 B against the 930,000 B budget, headroom 5,692 B**.
Both summary lines and the 6.1 ledger row say that now, with the history beside
it - 924,276 was the B4 build, D-197 added the +32 B of `map/size.ts`, and this
bundle adds nothing to the main chunk.

**Ledger.** No `SAVE_VERSION` bump - v28 stands. No migration, no snapshot byte,
no protocol field, no atlas cell, no constant added or moved. Nothing here is
hashed world state: a briefing is the unhashed metadata block by construction
(D-194), and the only `src/sim` change is a validation call that moves ahead of
mapgen - a world that used to throw one message throws another, and no world
that could be created can no longer be. Canonical cross-OS pin
`4dff3f3f216385e6`, corpus manifest `f1dcab2a374ab728` and soak fixture
`ed8ac72cd1d6284d` untouched. Bundle measured: main chunk **924,308 B**
unchanged - the scenario catalogue is its own dynamically loaded chunk and grew
12,928 -> 13,205 B, all of it the longer briefings - worker 324,283 -> 324,367 B
and `replay` 198,180 -> 198,264 B (the map-size guard, +84 B each), CSS
unchanged. Test cost measured on this machine, both ends re-run rather than
compared against an older note: `shippedScenarios.spec.ts` 6.48 -> 6.76 s (the
desert growth run is 0.5 s of it and replaced nothing), 26 -> 41 cases;
`mapSize.spec.ts` 0.1 s, 5 -> 7 cases. Suite after: 114 files, **1,270 passing
plus 2 skipped** against D-197's 1,253 + 2, and the 13 perf tests - all green,
`npm run typecheck` and `npm run lint` clean.

## M17 - the acceptance pass after that one: the names beside the numbers (2026-08-08)

### D-199 The two text surfaces the numeral guard did not reach

D-198 bound every NUMBER a shipped briefing says out loud to the world it
describes. The verifier who confirmed all seven M17 Fertig-wenn criteria, and
confirmed that the numeral guard works down to the spelled-out German numerals,
then defeated it twice more. Both are recorded here with what was done about
them, and one of the two was deliberately NOT closed - with the measurement that
decided it.

**1. A briefing's PLACE NAMES were bound to nothing.**

He renamed Passagiernetz's `Rosenburg` to `Rosenheim` and `Ahorngrund` to
`Ahornthal` in the GERMAN briefing alone - two towns that map does not carry,
with the English briefing left saying the real ones - and the build stayed
GREEN. `SCENARIO_WORLD_CLAIMS.towns` had pinned the real names against the world
since D-197; nothing read them back out of the prose. The pattern existed one
field away: a goal CAPTION has had to contain the name of the town its
descriptor addresses since D-195. A briefing has no descriptor to appeal to,
which is the whole reason it needed a declaration of its own.

*The grammar is the generator's, not a heuristic.* `tests/unit/briefingPlaceNames.ts`
builds its pattern out of `PLACE_NAME_PREFIXES` / `_ROOTS` / `_SUFFIXES`, now
exported from `src/sim/mapgen/names.ts` - the very tables
`PlaceNameGenerator.compose` draws from. A place name is exactly
`Root + Suffix`, optionally behind `Prefix-`; a syllable added to the generator
widens the audit on the same commit. That is the D-174 / D-183 shape (the
drawings consume the smoke-anchor table; the tooltip audit consumes the tool
registry) applied to prose.

*Two halves, because two different edits have to be caught.* `WorldClaim.briefingTowns`
is the town ids the briefing names IN READING ORDER - required on all eight, `[]`
for the five that name none, because an absent optional field would read as "this
briefing names nobody" for a briefing nobody had looked at. The audit resolves
each id to the name in the generated world and compares the extracted SEQUENCE,
per locale:

- a name the generator could have made, swapped in (`Rosenheim` = `Rosen` +
  `heim`), is EXTRACTED and is then not the declared one;
- a name it could not have made (`Ahornthal` - there is no `thal` suffix) is not
  extracted at all, and the declared `Ahorngrund` has vanished from the sequence,
  which is one shorter;
- a real town of that very map put in another's place fails on ORDER rather than
  on membership, which a set comparison would have missed;
- an addition that removes nothing fails on length.

All four are in the meta-test with the verifier's own two edits at its head, and
the converse beside them - the untouched briefing passes the same comparison.

*Captions are compared as a SET, and against the descriptor rather than a table.*
Which towns a goal is about is machine-readable (`ConnectStations.subjectA/B`,
`TownPopulationReach.subjectA`), so no new declaration is needed and the binding
is stronger than one. The order is the translator's - "Verbinde A mit B" against
"Connect B to A" is not a defect - and a briefing has no such authority to appeal
to, which is why only there the sequence is pinned.

**The proof was performed, not asserted.** The falsification was planted in
`src/scenarios/catalog.ts` itself and the red build watched: the German rename of
both towns fails two tests (*"passagiernetz/de: the places the briefing names:
expected [ 'Nieder-Weidengrund', ...(2) ] to deeply equal [ 'Nieder-Weidengrund',
...(3) ]"*), and the ENGLISH-only rename of one town fails on its own - the guard
is symmetric, which is exactly what the original defeat exploited. Both plants
were reverted.

**2. The DOC COMMENTS are NOT scanned, and that is a decision with a
measurement behind it.**

The same verifier falsified five figures in the catalogue's doc comments at once
- a plant coordinate, a distance list, a gradient, a town count, a land-mass size
- and all 41 cases stayed green. True, and worth stating precisely: every one of
those five is pinned against the WORLD in `SCENARIO_WORLD_CLAIMS`
(`industriesAt`, `nearestPlantOfMine`, a corridor's `climb`, `citiesAt8000`,
`landmassTiles`). What was defeated is not the truth about the world - it is the
agreement between the table and the prose beside it.

Extending the D-198 scanner to that prose was measured before it was refused.
The eight scenario doc comments plus the catalogue header carry **236 numerals**
(56 in the header, 180 in the eight) against the **58** declared figures that
cover both locales of all eight briefings. They are not one kind of claim:

- **10 are decision references** (`D-197`, `D-158`, `D-109`, ...) and one is a
  SPEC section (`13.3`). The extractor reads the digits of both.
- **6 are coordinate pairs**, and the extractor reads each as ONE number and the
  wrong one, in two different ways: `148,83` parses as one hundred forty-eight
  point eight three and `155,112` as one hundred fifty-five thousand one hundred
  twelve. A coordinate family would have to be invented for prose no player sees.
- **~15 are measurements taken in OTHER worlds** - the M6 bus world's 21,393 and
  64,893, the M6 coal world's 1,400-2,000 and 16,360, D-158's 840,000 / 1.12 M /
  500,000, the growth multipliers 1.55 and 0.35. No property of any of these
  eight maps can justify one of them.
- **~10 are provenance of the seed scan** - four hundred seeds, exactly three of
  them, two hundred scanned seeds.
- and a family that settles it: **figures the comments quote BECAUSE THEY ARE
  FALSE.** The header narrates D-198's falsification verbatim ("Acht ... 8.000
  ... siebzehn" became "Neun ... 9.000 ... vierzig"), and Frachtrausch's comment
  records that the M17 pass said "three of the four" and was wrong by one. A
  scanner demanding each numeral be pinned or allowlisted would have to
  allowlist the lies - which is the guard switched off one number at a time, and
  `SCENARIO_BRIEFING_FIGURES` already refuses that in so many words (eight
  allowlisted figures in total, each with a reason, and the world-bound ones
  outnumbering the free ones in every scenario). That property could not
  survive; a doc-comment allowlist would run to well over a hundred entries.

So the line is drawn where the readership changes: **the audit reads text a
PLAYER sees.** Briefings and goal captions are content that ships with the
scenario; a doc comment is developer prose whose job is provenance - why this
seed, what was measured elsewhere, what an earlier pass got wrong. What holds a
doc comment is that the figures worth pinning are in the claims table, so a seed
or mapgen change turns the TABLE red and whoever fixes it has the comment in
front of them. This is a named residual, not a claim of coverage, and the
documentation says so in both places (below).

**3. Two places described the guard as covering more than it does.**

`shippedScenarios.spec.ts` opened the claims table with "What each scenario's
briefing and doc comment CLAIM about its own world", and `catalog.ts` said
"every load-bearing claim each entry below makes about its own world is pinned
there" - where an "entry" includes its doc comment. Both are now the exact
sentence: the table pins every world property a briefing or caption quotes (and
those are read back out of the prose, numbers by D-198 and names by this entry),
PLUS the doc-comment figures that were worth pinning - and nothing reads a doc
comment back, which is stated with the reason. A guard's documentation
describing exactly what it guards is a rule of this project; these two were
describing the intention.

**4. Two doc-comment figures were unpinned even indirectly. Both measured true
today; this is about durability.**

- *Gebirgslogistik's "spans heights 2 to 13".* The table pinned the DIFFERENCE
  (`levels: 11`), which would have held unchanged over a corridor running from 5
  to 16. `CorridorClaim.heights` pins the band, asserts it against the world, and
  asserts it against `levels` - measured 2 and 13, unmoved.
- *Frachtrausch's "57 tiles from 155,112 against 66 from 148,83".*
  `nearestPlantOfMine` pinned the 57 and that plant 5 wins for all four mines; it
  did not pin the mine's own position, nor the 66 the win is measured by. The
  mine joined `industriesAt` (`[1, CoalMine, 101, 129]`) and the comparison is
  the fifth corridor (`industry 1 -> industry 0`), measured 65.8 tiles - which
  rounds to the 66 the sentence quotes - climb 20, water 5, levels 11. Each new
  pin was perturbed in the table and the red build watched, one at a time, so no
  assertion is claimed to run that has not been seen to.

**5. The insertion hole `briefingNumerals.ts` documented, closed as far as it
pays to.**

A REPLACED numeral was always caught: the figure list is positional and compared
whole, so any edit to a recognised numeral moves a value or the length. What
could be INSERTED was a quantity word the table had never seen - "ein Dutzend
Busse" carried a claim past a scanner looking only for numerals. Four words
joined the SUSPICION list `NUMERAL_SHAPED` and deliberately not the value table
`NUMERAL_WORDS`: **Dutzend, Handvoll, dozen, handful.** There is no honest value
to give them ("Dutzende" is not twelve), and a briefing whose numbers are audited
should write the figure - which the audit then has to justify like every other.
Planted in the real Frachtrausch briefing and watched: *"frachtrausch/de: unknown
numeral: expected [ 'Dutzend' ] to deeply equal []"*, then reverted.

Three more were considered and REFUSED, because each fires on prose that is
already shipped or already ambiguous: **"Paar"** (capitalised a pair, lower case
"a few" - and Passagiernetz says "vier Busse auf einem Staedtepaar" as it
stands), **"couple"** (the same ambiguity without even the case to separate the
two), **"score"** (twenty in one register and this project's own end-screen noun
in every other). All three are in the test as cases that must stay green, so the
refusal cannot quietly become an oversight.

**Named residuals.** Each is genuinely out of scope, non-material, and written
here rather than into the code:

- *Doc comments are unscanned* (2 above) - the one that matters, and the one a
  later pass would revisit if the comments ever became a shipped surface.
- *A false red is possible on the name grammar.* Any German compound the
  generator COULD have made is read as a place: "Eichenwald" in a sentence about
  oak woods would redden the build. That costs a rewording and can never hide
  anything; the eight briefings were read for it and none hits it. The
  near-misses are worth knowing - "Startkapital" ends in the suffix `tal` and
  "Strassenstau" in `au`, and both are safe only because `Startkapi` and
  `Strassenst` are not roots. The grammar is `Root + Suffix`, never a suffix
  alone.
- *A disambiguated name would fail loudly rather than silently.* The generator's
  collision path produces "Rosenburg 2"; the extractor reads "Rosenburg" and the
  comparison against the town's real name fails. No shipped scenario names such a
  town.
- *`title` and `author` are not scanned.* Neither is a claim about a world; the
  eight titles contain no composable name.
- *A quantity with no number in it at all* ("zahlreiche Orte", "several trains" -
  the latter is in Frachtrausch's briefing today) is not a figure and is not
  caught by anything. It states no number, so there is nothing to falsify.

**Ledger.** No `SAVE_VERSION` bump - v28 stands, M17 owns it and it is shipped.
No migration, no snapshot byte, no protocol field, no atlas cell, no constant
added or moved. Nothing here is hashed world state: the only `src/sim` change is
three `const` arrays becoming `export const` in `src/sim/mapgen/names.ts`, with
`compose()` reading the same tables under their new names - not a byte of
generated output moves, which the eight scenario worlds re-measured in this run
confirm (every figure in `SCENARIO_WORLD_CLAIMS` still holds). Canonical cross-OS
pin `4dff3f3f216385e6`, corpus manifest `f1dcab2a374ab728` and soak fixture
`ed8ac72cd1d6284d` untouched. Bundle measured with `npm run build` on this build:
main chunk **924,308 B against the 930,000 B budget**, headroom **5,692 B** -
zero change, and so are the scenario catalogue's own chunk (13,205 B), the worker
(324,367 B), `replay` (198,264 B) and the CSS. Everything added this pass is
comment or test. Test cost measured on this machine: `shippedScenarios.spec.ts`
6.76 -> **6.8-7.0 s** across runs (the twelve new cases share the eight worlds
the file already generates and play nothing), **41 -> 53 cases**. Suite after:
114 files, **1,282 passing plus 2 skipped**
against D-198's 1,270 + 2, and the 13 perf tests - all green, `npm run typecheck`
and `npm run lint` clean.

## M18 - weather, bundle 1: the world rule and the field (2026-08-08)

### D-200 Weather is a world rule with a field of its own, and switching it off costs the simulation nothing

SPEC2 E-01 settled the question the audit marked as "decide before starting":
weather is SIM REALITY, not render candy. Render-only weather would be weather
that lies - it rains and nothing costs anything - and sim weather that was not
hashed would break architecture law #3 the first time a game was reloaded. This
bundle is the authority half of that: the rule, the field, the daily pass, the
save and the snapshot seam. What weather COSTS - the multiplier lookups at
`ROLLING_RESISTANCE_*`/`DRAG_*`, the breakdown threshold band and
`CARGO_EXPIRY_FRACTION_PER_DAY` - is the next bundle's, and the seams it will
use are named here so nobody invents a second one.

**`weather` is a `NewGameParams` rule, off/mild/harsh, saved and hashed
unconditionally.** It is D-110's split applied for the fourth time (inflation,
the two 8.4 route costs, the road congestion rule): a rule is the world's, it is
fixed at genesis, it lives in the save and in the digest, and it is chosen on a
different screen from the settings. Hashing it only when it is ON was refused
for the reason M15 wrote down: a rule that entered the digest conditionally
would let two worlds that behave differently fingerprint alike, which is the
whole failure Z2 exists to prevent.

**Absent means OFF, and that is load-bearing.** Every band this game is measured
against - the five M6 scenarios, the takt band of D-151, scenario 5 on the D-158
band, the AI acceptance run, all eight shipped scenarios' thresholds (D-195) -
was measured by a simulation with no weather in it. Shipping the rule on by
default would re-band the lot inside the milestone that introduces it, which is
Fehlerkatalog 34 by name. So the new-game screen offers three buttons and the
first one is selected; all eight shipped scenarios state `weather: Off`
explicitly rather than defaulting, because a rule a scenario does not state is a
rule its thresholds were not calibrated against.

**With the rule off the subsystem is provably inert.** `updateWeather` returns
on its first line: nothing is drawn, no stream is even constructed, no cell is
written, so the field stays all-clear for ever and the snapshot publishes a
count of ZERO rather than 256 clear cells. That is the same inertness D-185 gave
the congestion layer, and it is what makes "a v28 save loads and behaves exactly
as before" a property rather than a hope.

**The field is 16x16 REGIONS and deliberately not a tile layer.** SPEC2 names
16x16; making it independent of the map size is what keeps it a fixed 256-byte
preallocated array on every world (law #7) instead of a second megabyte-scale
layer beside the congestion one. One region is 4 tiles across on the smallest
map and 128 on the largest, which is a weather FRONT either way rather than a
per-tile shower. `weatherRegionOf` is the one place the grid is related to the
map, so a rule reading the sky over a vehicle and a renderer drawing rain over
that vehicle cannot disagree about where the front is.

**It is SAVED, not derived.** A field rebuilt from the rule on load would give a
loaded world a different sky from the one that was saved - and with it different
costs, different breakdowns, different cargo ages - which is law #3 broken in
exactly the silence Z4 and E-02 were written about. Saved, hashed, and the test
asserts the round trip byte for byte as well as by digest.

**The daily pass draws from the named weather stream and never from
`world.rng`** (Z3, D-106/D-128). The salt is `streamSalt('weather')` folded with
the game DAY: the name is what keeps it from colliding with another system's
stream by an accident of call order, and the day is what makes each invocation a
different sequence - D-128's rule that "a periodic hook passes something that
varies per invocation", with the tender review's tick fold as the precedent. The
consequence is measurable and is measured: an off world and a harsh world played
a game month reach the IDENTICAL gameplay RNG state, so switching the rule on
cannot move a single breakdown roll. The draw count is fixed at one per region
per day whatever the field holds, which is the identical-draw-count discipline
the next bundle's threshold shifts will need.

The pass allocates the day's generator and nothing per region - what D-128
permits for a hook and forbids for the per-tick path - and works in preallocated
buffers otherwise. Measured rather than asserted, with M17's own instrument:
**136 B per game day with the rule on, 0.18 B with it off**, against a control
that allocates one small record per region at 17.5 kB. `next` exists because the
pass reads YESTERDAY's neighbours while it writes today: without it the answer
would depend on the order the grid is walked in, which is "iteration order as
logic" (law #3).

**The model is persistence plus a neighbour pull plus a season gate, one draw
per region.** A cumulative pick over five weights: the base weight of the rule,
times the season gate for Frost and Heat, times a pull that raises Rain and
Storm beside a wet neighbour, times a persistence bonus on whatever sky is
already standing. What each part buys:

- *Persistence* is what makes it weather rather than noise. Measured over five
  mild game years, a region keeps its sky from one day to the next in 86.4 % of
  cases - a spell of about a week, long enough for a player to watch a front
  arrive, cost something and pass.
- *The neighbour pull* is what makes it a MAP rather than 256 independent dice.
  Measured over five harsh game years: 42.5 % of orthogonal neighbour pairs
  share a sky against the 40.3 % an independent scatter of the same per-day
  distribution would give. With the constant set to zero the same measurement
  reads 49.5 % against 49.8 % - no structure at all - which is what makes the
  comparison in the test evidence about the pull rather than about the weights
  it acts on.
- *The season gate* multiplies BEFORE the persistence bonus, and that ordering
  is the whole reason there is no frost in July: a gate of zero takes a standing
  frost's weight to zero as well, so it cannot survive into the month. The test
  plants a full map of frost in high summer and requires it gone in one day,
  which a gate applied after persistence would fail.

**The weight table was chosen by looking at the distribution it produces, and
the test says so.** Measured over five game years (seed 424,242, 1,800 sampled
days x 256 regions): mild 80.5 % clear / 17.0 % rain / 1.2 % storm / 0.7 % frost
/ 0.6 % heat; harsh 52.4 / 33.5 / 8.3 / 3.2 / 2.5. `weather.spec.ts` bands those
shares, and the file states in its header that the band is a READ-BACK of its
own calibration - worth having because a collapse to all-clear or all-storm has
to be a red build, worthless as evidence about the model. The evidence is
elsewhere in the same file and is listed above: the front comparison against the
field's own per-day distribution, the July frost, the two-run identity, the
stream separation, the save round trip.

**One snapshot layout bump, the one the ledger booked.**
`SNAPSHOT_LAYOUT_VERSION` 9 -> 10: `WeatherCount` plus a 256-entry Int32 block,
1 KiB per slot, written from the ONE publish pass with every other block (Fehler
33). The renderer will read the field from there and from nowhere else, which is
what keeps rain a pure function of published counters (Fehlerkatalog 39).
`SNAPSHOT_I32_COUNT` went 16 -> 18 rather than 17, because the Float64 block
behind it has to start on an eight-byte boundary. `SNAPSHOT_WEATHER_CELLS`
equals `WEATHER_REGION_COUNT` and the equality is a TEST, not an import - the
shared channel must not depend on the simulation (D-187's precedent).

**v29, and both pins re-recorded.** M18's one Z5 bump is this one: the rule and
the field. It moves hashed world state - one word plus 256 bytes - which is the
designed-for event with a written protocol, and the corpus is the evidence that
nothing but the new words moved: **all eight fixtures, seven of them written by
seven earlier builds and untouched on disk, decode to the ONE world hash**
`c0a021f5d1ee8619` (was `f1dcab2a374ab728`). The canonical cross-OS pin moved
under D-137 to `5a2a6cf73f4107bb` (v29, seed 424,242, tick 10,000) and the soak
fixture under D-190 to `e6c5e33d8e7607ec` at unchanged 698 recorded commands - the same
game, only the fingerprint moved. The scenario metadata's lock table gained
`weather`, which the M17 coupling test forced: a new `NewGameParams` field is a
compile error there until somebody decides whether a scenario may pin it, and
that test's own planted violation - which used the name `weather` - moved on to
`startYear` (E-15, M23).

**Ledger.** `SAVE_VERSION` 28 -> **29** (M18's one Z5 bump; the later bundles
extend `v28_to_v29` in place). `SNAPSHOT_LAYOUT_VERSION` 9 -> **10**, the one
layout change 6.1 booked: `WeatherCount` plus 256 Int32, 1 KiB per slot, so the
whole snapshot grows by 2 KiB. Atlas: zero cells - the seasonal art is
regeneration, not booking (6.2). Save cost: 256 B of hashed field per world,
whatever the map size, plus one word for the rule. Tick measured on the
1,500-vehicle reference fixture: **p50 1.296 / p99 2.841 ms** (max 17.233 ms
over 6,500 ticks) against the M10 baseline 1.45 / 3.26 on a row that allows
+0.15 - the reference fleet runs the rule OFF, where the hook returns on its
first line; a second run inside `npm test` measured 1.258 / 2.758. Allocation
measured with M17's instrument: **136 B per game day with the rule on, 0.18 B
with it off**, against a per-region control at 17.5 kB. Main bundle measured with
`npm run build`: 924,308 -> **926,473 B against the 930,000 B budget, headroom
3,527 B** - all of it six new i18n sentences in two languages plus the three
buttons and the scenario card's line; `SimWorker` 324,367 -> 326,656 B, `replay`
198,264 -> 200,046 B, the scenario catalogue 13,205 -> 13,319 B, CSS unchanged.
**The next M18 bundle that adds a panel or a screenful of text books the raise
with its own measurement (D-192); 3,527 B is not room for one.**
Suite after: **115 files, 1,303 passing plus 2 skipped** against D-199's 114 and
1,282 + 2, and the 13 perf tests - `npm test`, `npm run typecheck` and
`npm run lint` all green; `npm run test:soak` re-recorded and green.

## M18 - weather, bundle 2: what the sky costs, and the seasons (2026-08-08)

### D-201 The weather reaches the simulation as four multipliers and nothing else, and the season is the calendar read as a pure function

D-200 built the authority half of E-01 - the rule, the field, the daily draw,
the save and the snapshot seam - and named the seams the effects would use so
that nobody would invent a second one. This is those effects. SPEC2 M18 spells
the shape out and it was followed literally: "sim effects exclusively as
multiplier lookups at existing seams". Not one new mechanic, not one new state
field, not one new draw, **no save bump and no migration edit** - the v29
migration D-200 owns needed nothing added to it, because a multiplier at a seam
carries no state of its own.

**There are exactly four seams and there is no fifth.** Each is a factor
multiplied into a number the simulation already computed, at the line it
already computed it:

- `ROLLING_RESISTANCE_RAIL`/`_ROAD` and `DRAG_TRAIN`/`_ROAD`/`_SHIP`/`_AIR` in
  the longitudinal solver of section 11.1 (`WEATHER_ROLLING_FACTOR`,
  `WEATHER_DRAG_FACTOR`);
- the daily breakdown threshold of section 11.3 (`WEATHER_BREAKDOWN_FACTOR`);
- `CARGO_EXPIRY_FRACTION_PER_DAY` at the daily station sweep
  (`WEATHER_EXPIRY_FACTOR`, heat only - SPEC2 names heat and names nothing
  else, so the other four entries are exactly 1 and a test holds them there);
- the monthly output of a farm and a forestry in section 7.3's own production
  pass (the season, not the sky).

`src/sim/weather/effects.ts` is the only file that knows a `World` has weather
at all outside `updateWeather`, and every function in it answers with the exact
identity on its first line for a world with the rule off.

**The gate is the RULE and never the FIELD, and that is what makes the off path
provable.** `weatherCellAt` answers `Clear` for a world with the rule off
without reading a cell, and every table is exactly 1 at `Clear`, so the whole
arithmetic collapses to `x * 1 === x` - exact in IEEE-754, in the order the
factors were inserted (each new factor sits immediately beside the coefficient
it modifies, so the multiplication SEQUENCE of a pre-M18 world is reproduced
term for term, not merely its value). The consequence is measured rather than
asserted: **the canonical cross-OS pin stayed `5a2a6cf73f4107bb`, the corpus
manifest stayed `c0a021f5d1ee8619`, the soak fixture stayed
`e6c5e33d8e7607ec` at unchanged 698 commands, and scenario 5 measured
1,119,720 EUR - D-158's recorded figure to the cent.** A test nails a sky of
storms over an off world and plays the recorded road line two thousand ticks
against a clear twin: same generator state, same cash, same tile, same speed,
same `progressM` for every vehicle.

**Z3, and the property that would have broken every seed in silence.** The
breakdown roll is modulated by moving the THRESHOLD, and the discipline is
exactly the one Z3 writes down: `rollBreakdowns` still takes one `nextFloat`
per eligible vehicle per game day, unconditionally, before the sky is consulted
at all - the sky only multiplies the number that draw is compared against. So
the shared gameplay stream advances by the same number of words under every
weather state there is. This is instrumented rather than argued:
`weatherEffects.spec.ts` shadows `Rng.nextUint32` for the length of a call and
counts, because `nextFloat` and `nextInt` both go through it, so the count IS
the stream position (rejection retries included). Three statements are held:

- a fabricated fleet of 512 at full reliability cannot break down under any
  sky, and the five runs draw exactly 512 words each AND leave the generator in
  the **identical state** - the strongest form of "the threshold shift itself
  spends nothing";
- the same fleet at reliability 5,000 draws exactly `512 + breakdowns` under
  every sky, which is the total statement: **the draw count is a function of
  the outcomes and of nothing else**, so a weather that spent a draw of its own
  would break it for all five skies at once;
- and the same holds on the played road line, so it is not a rule only a
  hand-filled store obeys.

The fleet is fabricated for exactly one reason and the test says so: the
recorded fixture has ONE bus rolling at any moment, which is enough to show a
seam is wired and far too few to tell a moved threshold from a coin that fell
differently. `rollBreakdowns` reads four vehicle fields and the sky, so filling
those fields is the whole of its input.

**The season is a pure function of (month, height, climate) and the rule
decides only whether the simulation consults it.** `seasons.ts` imports no
`World`, draws nothing, remembers nothing and takes three numbers; the gate
lives one file up in `effects.ts`. Both halves of that split are load-bearing.
The function must stay free of the rule because the renderer will read it for
the snow line without asking the simulation anything (Z1) - and the simulation
must not consult it in an off world, because seasonal production alone would
move every band this game owns inside the milestone that introduces it
(Fehlerkatalog 34). What it produces:

- a **winter friction** multiplier on the rolling resistance coefficient,
  `1 + severity * SEASON_FRICTION_GAIN`, where the severity is a monthly table
  times a climate factor times a height gain, clamped into [0, 1]. Total by
  construction: finite and inside [1, 1.2] for every month, every height a map
  can hold and every climate, walked in full by the test rather than sampled.
  Measured: January at the shore 1.1272, at height 15 1.2000, arctic shore
  1.1908, and every July in every climate exactly 1;
- a **seasonal output** multiplier for a farm and a forestry, `1 + (t - 1) * a`
  over integer-percent tables that sum to exactly 1,200. The transform is
  affine around 1 and an affine image of a mean-1 table has mean 1 for any
  amplitude, so the climate and the height change the SHAPE of the year and
  never its total - asserted exactly on the tables and to nine places through
  the transform, for every height and climate. `SEASON_AMPLITUDE_MAX` is
  totality and not taste: the farm's deepest month is 40 %, so an amplitude
  above 1.666 would ask a farm for negative output, and the test states that
  arithmetic so moving one constant without the other is a red build.
  **Tropical is an exact zero in both climate tables**, so a tropical world has
  no season at all rather than a small one.

**Which assertions are evidence and which are read-back**, stated in the test's
own header the way `weather.spec.ts` states it. The four factor tables were
CHOSEN - each fixes the ratio between the five skies at one seam - so every
"a storm is slower than a clear sky" assertion is a read-back of that choice,
worth having because a seam that stopped being wired has to turn the build red
and worth nothing as evidence about the numbers. Independent of every one of
them: the draw-count invariance, the off path, the purity and totality walk,
and the exact identities (a sky whose factor is 1 moves its seam by exactly
zero float - not nearly).

Measured on this build, and quoted nowhere without having been re-measured:

- breakdowns over 512 vehicles in one game day, the generator restored between
  skies so the draws are literally the same: clear 69, rain 83, storm 109,
  frost 124, heat 105;
- the road fleet from a standstill over 180 ticks (under one game day, so no
  calendar hook fires and the solver is the only difference): clear 97.6 m,
  rain 97.4 (-0.17 %), storm 97.1 (-0.50 %), frost 96.8 (-0.87 %), **heat
  exactly the clear figure**;
- of 100 stale units at a station, left after one daily sweep: 90.00 under
  clear, rain, storm and frost alike - the same float - and 82.50 under heat;
- a farm's twelve months on flat ground at height 5, sheds emptied so the
  7.3 store throttle cannot drown the signal: 267/273/280/286/292/298/303/308/
  313/316/319/322 with the rule off against 87/151/249/351/423/499/541/498/
  348/228/105/106 with it on - a year total within 0.2 % and a coal mine in
  the same world identical month for month.

**What is deliberately NOT in this bundle.** The M18 balance band ("a hard
winter drops the reference coal line's annual revenue by 8-15 %") is not
claimed here and no constant was tuned towards it: the tables were chosen for
the ratios they state, and a band measured against them belongs with the
milestone's own new scenario, beside the seasonal atlas and the storm warnings.
Saying so is the point - a constant set from the run a band then validates is
the defect D-197 was written about.

**Ledger.** `SAVE_VERSION` unchanged at **29** (M18's one Z5 bump is D-200's;
this bundle adds no state, so `v28_to_v29` needed no extension at all),
`SNAPSHOT_LAYOUT_VERSION` unchanged at **10**, atlas zero cells, no new
protocol field, no new i18n string, no UNHASHED or PARSER_IGNORED allowlist
line. Tick measured on the 1,500-vehicle reference fixture: **p50 1.613 /
p99 2.934 ms** (max 19.086 ms over 6,500 ticks) against the M10 baseline
1.45 / 3.26 on a row that allows +0.15 - the reference fleet runs the rule OFF,
where `weatherCellAt` returns on its first line and `winterFrictionAt` with it;
the per-vehicle cost with the rule ON is one array read plus two table reads
plus a `baseHeight`, and it is NOT measured on that fixture, which is stated
here rather than implied. Main bundle measured with `npm run build`:
926,473 -> **927,719 B against the 930,000 B budget, headroom 2,281 B** - all
of it the five new constant tables, which reach the main chunk because the
interface imports `constants.ts`; `SimWorker` 326,656 -> 327,698 B, `replay`
200,046 -> 199,950 B, the scenario catalogue unchanged at 13,319 B, CSS
unchanged. **2,281 B is not room for the seasonal-optics bundle's panel or
text: it books the raise with its own measurement (D-192).** Suite after:
**116 files, 1,320 passing plus 2 skipped** against D-200's 115 and 1,303 + 2,
plus the 13 perf tests - `npm test`, `npm run typecheck` and `npm run lint` all
green, `npm run test:soak` green at the unchanged fixture and
`npm run test:balance:full` green including all nine desync twins.

## M18 - weather, bundle 3: the optics in the same release as the authority (2026-08-08)

### D-202 The snow line is the winter friction read backwards, the regeneration repaints only what the season moved, and the rain shares the cap it is spawned last into

D-200 made the sky simulation reality and D-201 made it cost something. SPEC2
M18 puts the optics in the SAME release for a stated reason - "damit Autoritaet
(Sim) und Candy (Render) nie auseinanderlaufen" - and this bundle is that half:
the seasonal atlas regeneration, the height-dependent snow line, the autumn
forests, the rain and snow driven from the published weather field, and the
storm warning. It is render-only in the strictest sense the milestone allows,
with one exception that is sim by nature and is named below.

**Nothing here moved a byte of hashed state, and both pins say so.** No save
bump (v29 is D-200's and this bundle adds no state), no migration edit, no
snapshot layout change, no atlas cell. The canonical cross-OS pin stayed
`5a2a6cf73f4107bb`, the corpus manifest stayed `c0a021f5d1ee8619` and the soak
fixture stayed `e6c5e33d8e7607ec` at unchanged 698 commands - **re-run, not
assumed**. The one sim-side addition, the storm warning, writes into the news
log, which IS saved and hashed; it can only fire in a world with the weather
rule on, and every fixture and every balancing scenario runs it off, which is
why the pins did not move and why that is a property rather than luck.

**The snow line is `winterFrictionFactor` read backwards** - D-172's device
("light is the tint curve read backwards") applied one milestone on, and the
reason the optics cannot drift from the economy. `snowLineFor(month, climate)`
carries no table of its own: it walks the height levels and asks the very
function the longitudinal solver multiplies into its rolling resistance at
which height the season's severity reaches `SNOW_LINE_SEVERITY` (0.85 of full).
So snow lies exactly where the ground the player drives on has gone hard, and
a change to `SEASON_WINTER_SEVERITY_PERCENT` or `SEASON_CLIMATE_WINTER` moves
both halves at once because there is only one table. `seasonArt.spec.ts` walks
the agreement in FULL - every climate, every month, every height - rather than
sampling it. Measured lines: temperate January 10, February and December 13,
nothing in the other nine months; arctic January down to the shore (4), March
14; desert and tropical never, the second of which follows from the exact zero
D-201 put in the climate table. Land runs 4..15, so a January line at 10 is a
LINE part way up the mountain, which is what the acceptance sentence asks for -
a blanket at sea level would not be one.

**The snow line costs zero atlas cells, because the game has had a snow cell
since M1.** A tile at or above the line draws `Terrain.Snow` instead of its own
terrain (`terrainTakesSnow`: everything but water and snow itself), and the
substitution goes into the frame KEY, so the texture cache, the sprite path and
the chunk bake cannot disagree about what was drawn. The M18 ledger row books
zero cells and the existing layout guard (2176x3840 base, 4096x4096 detail) is
what holds it.

**The regeneration repaints what the season MOVED and nothing else, which is
the whole of the budget.** `planSeasonRepaint(from, to)` compares `terrainLook`
in the two stages and lists the terrains whose colour or grain differs, plus
the six town cells when the roof snow changes. Four terrains have a season in
them - grass, field, forest, marsh - and rock, sand, snow, shore and pavement
are the same in every month, so a change repaints 4 or 5 jobs out of ten rows
instead of the lot. A page that has never been repainted needs no special case:
`terrainLook(terrain, Summer)` IS the base palette of section 16.3 and a summer
roof carries no snow, so the artwork the game builds at startup is exactly the
summer stage, which is a test rather than a claim.

**Measured on the reference machine, in a real browser with a real canvas**
(the atlas needs one; the perf suite is headless, so this is the README's
hand-measurement class, done through the dev server): a whole regeneration over
BOTH procedural pages costs **p50 1.35 ms (Summer to Autumn, 128 cells), 1.50 ms
(Autumn to Winter, 146 cells), 2.67 ms (Winter to Spring), 3.34 ms (Spring to
Summer)** - against the 30 ms SPEC2 6.2 allows, and against 11.94 ms to rebuild
both pages from scratch on the same machine (base 4.31, detail 7.63). Per STEP -
one job on one page, which is what a frame actually pays - p50 0.125 ms on the
base page and 0.155 ms on the detail page. The scheduler runs two steps a
frame, so the frame cost of a season change is a fraction of a millisecond and
the whole change lands within a handful of frames.

**Asynchronous means spread over frames, and the swap is still atomic.** The
canvases are repainted a couple of jobs at a time, but neither is uploaded
until the last job is done - one `texture.source.update()` per page in the same
step - so no frame can show two seasons. `SEASON_REGEN_BUDGET_MS` (30, SPEC2's
own number) is checked against the milliseconds the steps actually spent and
warns on the console when it is crossed: the ATLAS_BUILD_BUDGET_MS pattern, and
a wall clock is as legitimate here as it is there because this times work
rather than animating anything (Fehlerkatalog 39).

**The debounce protects the scrub, not the month.** SPEC2 6.2 asks for "max. 1
Rebuild/Realsekunde bei 20x" and `SEASON_REGEN_MIN_FRAMES` is that second on a
60 Hz display. What it actually guards is worth stating rather than implying:
at 20x a game month is fifteen REAL seconds, so the calendar alone can never
ask twice in one second. A replay scrubbed across years, a save loaded onto a
running game and a new game started from the menu all can, and each arrives as
a month jump with no notice. The latest pending look wins when the window
opens - repainting through the intermediate months of a scrub would draw
artwork nobody asked to see.

**A chunk remembers its season the way it remembers its water row** (D-164's
device, for a fact that changes a few times a game year instead of twice a
second). `ChunkEntry.seasonEpoch` is the generation it baked in; the staggered
loop that already walked the visible set for water rebakes now carries both,
with a budget each so a season change during a shimmer cannot halve either
rate. Measured: a 1920x1080 viewport at 0.5x holds **17 chunks**, and one chunk
bake is p50 0.470 / p99 1.394 ms of CPU proxy, so at two a frame the season
rolls over the viewport in nine frames of under a millisecond each. The one
place the season and the water differ: a water swap CARRIES the emissive twin
through unchanged (ripples move, windows do not), and a season rebake must
re-render it, because the town cells and their twins were repainted together -
this is the one case where carrying it through would put last season's windows
on this season's roofs.

**"Emissive im selben Pass" is one function call, not a rule.** The six
window-only twins of the town cells are repainted inside
`repaintSeasonJob(SEASON_JOB_BUILDINGS)`, from the same `drawTownBuilding` call
with `emissiveOnly` set - so the lit windows sit pixel-exact on the dark ones
by construction, which is D-172's own argument restated. What the season does
to a building is snow on the three roofs that already take an explicit colour
(the pitched roof, the shed's sawtooth, the commercial block's rooftop plant);
the flat top face of the commercial block is the box primitive's own shading of
its wall colour and is deliberately left alone, because snowing it would mean a
roof-colour parameter on every solid in shapes.ts for one cell of six. That
residual is named here rather than discovered.

**Rain and snow are the published field plus the render frame counter, and
nothing else** (E-01, Fehlerkatalog 25/39). Sixteen hashed attempts a frame
over the visible tile range; each attempt asks its tile's REGION for the sky
through `weatherRegionOf` - the one place the 16x16 grid meets the map, so what
the simulation charges a vehicle for and what falls on it are the same front -
and its own height for rain against snow at this month's line. So a front
crossing a range rains in the valley and snows on the ridge in the same frame,
and the two halves of the milestone's optics are one decision. A frost cell
snows at any height: it is the winter sky itself, and a frost that produced
nothing visible would be the one weather state the player could not see. A
clear sky costs sixteen hashes and no particles.

**The new particles SHARE the M13 cap and are spawned LAST, which is the whole
of the budget decision** (D-174). Measured on the reference machine: a viewport
under storm over every region reaches a steady state of **820 live drops**
against a ceiling of 832 and the 2,000-row cap, at **p50 0.173 / p99 0.309 ms**
per particle frame - and the M13 reference overload scene (300 booming
industries plus a full 1,500-vehicle block) with the SAME storm over it holds
**zero** weather rows, because the emitters fill the cap first and `spawn`
refuses: p50 0.283 / p99 0.499 ms against the unchanged 2 ms median tripwire.
That is the honest shape of the decision - under overload the rain is what is
dropped, never a plume, because a plume is simulation truth made visible and
rain is a sky the tint and the tile panel already report. The pool grew exactly
one column for it (`stretch`, a per-particle vertical scale: a raindrop drawn
as a round dot reads as grey noise and a streak is what says rain), which costs
one read and one multiply in the mirror loop and is inside the same tripwire.
A drop falls THROUGH the ground rather than splashing on it - the pool has no
collision - which is the same stated floor D-174 gave smoke drifting over a
hill.

**The storm warning is the one sim-side line, and it is edge-triggered,
filtered and canonical.** `updateWeather` records the regions where a storm
ARRIVED in the pass that has both days in hand (a working buffer beside `next`,
not state: both its inputs are saved, so a loaded world warns about exactly the
storms a running one would). `reportWeather` posts one entry per arriving
region that the PLAYER has a station in, keyed by the lowest-id station there,
which is a canonical key `postOnce` recognises. Three decisions, each about not
writing noise: a front that stands for a week is one event, not seven; a storm
over empty desert costs nothing and is not news; and a message that named a
region by its grid coordinates would be a riddle. It gets its own
`NewsCategory.Weather` - a player who has filtered the log down to signalling
trouble is not asking about the sky - which grew `NEWS_CATEGORY_COUNT` to six
and the notification defaults with it (ticker: a storm costs a percentage, not
a game). Measured over four months of harsh weather on a controlled world: a
handful of warnings, never two in a row about the same place, and none at all
in the same world with the rule off, where `arrivalCount` is zero for ever
because `updateWeather` returns before it is written.

**One protocol field: the climate.** The season is a pure function of (month,
height, climate); the month rides the snapshot already and the climate is a
world constant that nothing published. It joins the `ready` message, which is
sent on every world replacement, so a load, a new game and leaving a replay all
carry it. Main-thread traffic, no snapshot byte.

**Ledger.** `SAVE_VERSION` unchanged at **29**, `SNAPSHOT_LAYOUT_VERSION`
unchanged at **10**, atlas **zero cells** (regeneration is the mechanism, SPEC2
6.2), one protocol field, two new i18n sentences in two languages, no UNHASHED
or PARSER_IGNORED allowlist line. Tick measured on the 1,500-vehicle reference
fixture over four runs: **p50 1.702 / 1.554 / 1.650 / 1.542 ms, p99 3.796 /
3.456 / 3.239 / 3.156 ms** against the M10 baseline 1.45 / 3.26 - the last two
land below the baseline and the four straddle it inside this machine's
documented +-0.7 ms run noise; the reference fleet runs the rule OFF, where the
milestone's two new sim lines are a return on the first line and one integer
compare a game day.
**Main bundle 927,719 -> 934,751 B, and the budget is raised to 950,000 B with
that measurement beside it** (D-192's rule; D-200 and D-201 both said this
bundle would have to book it) - the growth is `seasonArt.ts`, `weatherArt.ts`,
the atlas repaint and the MapView scheduler, all of it interface code, none of
it a sim import chain. `SimWorker` 327,698 -> 328,296 B, `replay` 199,950 ->
200,040 B, the scenario catalogue unchanged at 13,319 B, CSS unchanged.

**What this bundle does NOT claim.** The M18 balance band - a hard winter
costing the reference coal line 8-15 % of its year - is still not claimed and
still no constant is tuned towards it (D-201 said so and it remains true).
Neither is the milestone's own renderer path measured end to end: the seasonal
scheduler, the snow substitution and the weather spawn run inside MapView's
frame loop, which needs a GPU and a compositor and has never been headless in
this project (D-136). What was measured in a real browser is the atlas
regeneration itself and the atlas pages building; the frame loop around them is
held by the type checker, by the pure halves' own tests and by a perf proxy
that replays the weather spawn loop literally.

Suite after: **118 files, 1,363 passing plus 2 skipped** against D-201's 116
and 1,320 + 2, plus 14 perf tests (was 13) - `npm test`, `npm run typecheck`
and `npm run lint` all green, `npm run test:soak` green at the unchanged
fixture and `npm run test:balance` green with scenario 5 at 1,119,720 EUR.

## M18 - weather, bundle 4: the band and the closure (2026-08-08)

### D-203 A hard winter costs the reference coal line 4.95 %, not 8-15 %; the route to 8-15 % was found, measured and refused

SPEC2 M18 ends with a balance band: "a hard winter depresses the reference coal
line's annual revenue by 8-15 %". D-200 built the authority, D-201 built the
four seams and said in as many words that no constant had been tuned towards
that sentence, D-202 built the optics. This bundle measures it. **The number
the economy pays is 4.95 %, the band is 3-7 %, and that is a re-band taken with
the trace rather than by moving a constant until the sentence came true** - the
D-158 precedent, applied to a number that was written before the physics it
describes existed.

**The scenario is scenario 2's own railway, and now literally so.** The coal
line was hand-built inside `coalTrain.spec.ts`; a second file measuring a
second thing about "the reference coal line" would have been a second railway
within a game year of the first edit. `tests/balance/coalLine.ts` is the ONE
definition now - geometry, platform length, consist, orders, seed and span -
and both files call it; the only thing a caller may vary is the weather rule
and the seed. Scenario 2's own figures are unchanged by the extraction and were
re-run to prove it: investment 249,980 EUR, payback in year 6, the same nine
year-end balances to the cent.

**Why an ensemble and not a world.** One coal train is chaotic. The weather
moves a THRESHOLD and never a draw (Z3, D-201), so the two arms take the same
numbers out of the shared gameplay stream and start getting different OUTCOMES
from the first frosty morning; a breakdown that falls on the wrong day costs a
month of trips. Measured with the rule off, seed 9 alone runs 60.3 / 75.4 /
60.7 / 70.4 / 71.5 / 64.7 / 64.7 / 65.5 k EUR over eight consecutive years - a
swing of a quarter of the mean, against an effect of a twentieth. So
`tests/balance/hardWinter.spec.ts` plays SIX seeds in both arms over the same
nine years scenario 2 plays and bands the ENSEMBLE, and it prints the per-seed
figures because their spread is the honest error bar: 3.33 % to 8.15 %, one
seed outside the band on each side of it.

**The measurement.** Six seeds x nine years, freight revenue (the coal line has
no other): **3,510,797 EUR with the weather rule off against 3,336,995 EUR
under the harsh rule, -4.95 %.** Winter-loaded on two instruments that are not
the banded figure: breakdowns in December, January and February rise 29.2 %
against 12.9 % in the other nine months, and the train's mean speed while it is
moving falls 4.87 % against 3.00 %. Not one seed earns more with weather than
without.

**Which multiplier dominates**, measured by neutralising one channel at a time
against the same off baseline (the residual is what the channel was worth):

| channel neutralised | measured | the channel is worth |
| --- | --- | --- |
| nothing (the band) | -4.95 % | - |
| `WEATHER_BREAKDOWN_FACTOR` to all 1 | -0.51 % | ~4.4 points |
| `WEATHER_ROLLING_FACTOR` + `WEATHER_DRAG_FACTOR` to all 1 | -2.89 % | ~2.1 points |
| `SEASON_WINTER_SEVERITY_PERCENT` to all 0 | -4.01 % | ~0.9 points |
| `WEATHER_EXPIRY_FACTOR` to all 1 | -4.31 % | ~0.6 points |

The parts sum to eight points against a whole of five, and that is not an
error: the channels compete for the same lost time on the same chaotic line, so
removing any one of them lets the others take some of what it was taking. What
the table settles is the ORDER, and the order is unambiguous - **the breakdown
threshold is the seam with the reach**, the two solver seams are second, and
the heat seam is close to nothing on a line that carries coal (coal in a yard,
and the heat gate is zero in the months the frost gate is open).

**Why the solver seams cannot reach further, measured rather than argued.** The
reference train is a 1950 steam locomotive and eight open wagons: 158 t empty,
358 t loaded, top speed 20.83 m/s. Measured on the played line - traction
105.0 kN from a standstill and 43.2 kN at top speed, against a rolling
resistance of 7.0 kN loaded and a drag of 2.4 kN at top speed. A frosty January
at this line's height multiplies the rolling coefficient by 1.3 (the sky) times
1.1344 (the season) and takes that 7.0 kN to 10.4 kN - **3.4 kN off a 33.8 kN
surplus, so the cruise does not lose one metre per second.** What it costs is
the ramps, and the ramps are most of the journey: the train is at its top speed
on only 16.1 % of its moving ticks over a 45-tile haul. That is exactly the
shape of the measured -4.87 % of winter mean speed - real, and bounded by
physics rather than by a table.

**Why the frequency cannot reach further either.** Measured over 256 regions
and three game years under the harsh rule: the sky is clear 52.7 % of
region-days, rain 33.5, storm 8.2, frost 3.1, heat 2.6 - and in December,
January and February, where `WEATHER_FROST_SEASON` opens its gate fully, frost
holds **9.6 %**. A harsh January is a wet month with three frosty days in it.
The reason is in the field generator: frost's weight is 14 and never boosted,
while rain's is 20 and the neighbour pull multiplies it by up to 2.4, so the
sky that forms fronts crowds out the sky the season is gating for.

**The seams are not too weak, and this is the measurement that proves it.**
With every sky behaving as FROST at both weather seams and the season at full
severity in all twelve months - a permanent winter, far beyond anything the
rule can draw - the same six seeds over the same nine years lose **26.39 %**.
So "the multipliers are too small" is false. What is small is how much of the
year the expensive sky owns.

**The route to 8-15 %, measured**, by sweeping the one constant that owns that:
`WEATHER_BASE_WEIGHT[Harsh][Frost]`.

| frost weight | frost share of winter region-days | single-sky days of 1,080 | revenue |
| --- | --- | --- | --- |
| **14 (shipped)** | 9.6 % | 0 | -4.95 % |
| 40 | 36.6 % | 0 | -7.30 % |
| 90 | 70.0 % | 0 | **-9.30 %** |
| 250 | 91.9 % | 0 | -10.86 % |
| 2000 | 99.4 % | 66 | -13.81 % |

So the band is reachable, and reaching it needs seven of every ten winter days
to be frost. **It was refused, for three reasons that are stated together
because no one of them would carry it alone:**

1. **`WEATHER_FROST_SEASON` is climate-blind.** It is indexed by month and by
   nothing else - `updateWeather` reads it with no climate term anywhere near
   it - while the SEASON half (`SEASON_CLIMATE_WINTER`) is climate-aware and
   gives tropical an exact zero. At 9.6 % that asymmetry is a blemish: a
   tropical January gets the odd frost. At 70 % it is a tropical January frozen
   on seven days in ten. Fixing that means giving the sky its own climate
   table, which is a new mechanic in a milestone whose own decision says there
   are four seams and no fifth, and whose one Z5 bump is spent.
2. **The constant would have been set FROM the run the band then validates.**
   There is no independent standard by which 14 is wrong - D-200 chose the
   weight row by looking at the distribution it produces, and `weather.spec.ts`
   says its share bands are a read-back of that choice. The only thing that
   calls 14 wrong is the revenue figure it fails to produce, which is precisely
   the defect D-197 was written about.
3. **It would change what the rule MEANS in order to move one line's number.**
   The weight row is the design statement of "harsh"; a world that switches the
   rule on gets that winter everywhere, in every climate, for every vehicle,
   for the rest of the century.

**What the band is worth, and what it is not.** The band is a read-back of
D-201's four factor tables in the same sense scenario 2's payback year is a
read-back of the freight tariffs: it restates what this build's constants do to
this line. What it is worth is that a seam which stops being wired, a factor
table that collapses to the identity, or a field that stops producing weather
all turn the build red. Independent of it, and asserted separately: the
winter-loading on two instruments, that no seed earns more in the weather than
without it, and that the two arms really are two arms (the off world's field is
clear on every one of its region-days; the harsh world's is not, measured
2,357,962 non-clear region-days).

**The residual, named so it can be picked up rather than rediscovered.** M23
gives climate its own sets (E-15, the ledger's v34 row). That is the milestone
in which the sky can honestly be given a climate table, and with one a
continental winter can be frosty without freezing the tropics - at which point
this band is the one to re-measure, and 8-15 % may well be what it reads. The
sweep above is the map for whoever does it.

**The rest of the bundle.** `hardWinter` joins `BALANCE_SCENARIOS`, so
`tests/unit/balanceDeterminism.spec.ts` - which walks the directory against the
registry in both directions - covers it, and a future scenario without a twin
stays a red build. Its twin is deliberately ONE world, the harsh arm of the
reference seed: that is the arm which draws from the weather stream and the
only surface this scenario adds, the off arm being `buildCoalLine()` played by
scenario 2's own guard. The cost is stated where the other ten are, in
`determinism.ts`: the file measures 32.5 s, of which the twin is 2.3-3.2 s.
**Scenarios 1-4 and every other band of section 19.4 go on running with the
rule off** (Fehlerkatalog 34); `buildCoalLine` defaults to off and says why.

**Ledger.** `SAVE_VERSION` unchanged at **29** (M18's one Z5 bump is D-200's;
this bundle adds no state at all), `SNAPSHOT_LAYOUT_VERSION` unchanged at
**10**, atlas zero cells, no migration edit, no protocol field, no i18n string,
no allowlist line, and not one byte under `src/` - the bundle is a balancing
scenario, a shared fixture, a registry row and documentation. Verified by
running rather than assumed: canonical cross-OS pin `5a2a6cf73f4107bb`, corpus
manifest `c0a021f5d1ee8619`, soak fixture `e6c5e33d8e7607ec` at 698 recorded
commands, all eight shipped scenarios hash-identical over two runs with their
world-claims, briefing-numeral and place-name audits green, and scenario 5 back
at D-158's 1,119,720 EUR. Main bundle re-measured with `npm run build` (twice,
byte-identical): **934,926 B against the 950,000 B budget, headroom 15,074 B**;
`SimWorker` 328,296 B, `replay` 200,040 B, the scenario catalogue 13,319 B, CSS
13,427 B - all unchanged, as a bundle that touched no `src/` file must be.
D-202 recorded 934,751 B for the same `src/` tree; the 175 B are not accounted
for by anything this bundle did, and the discrepancy is written down rather
than smoothed away.

Suite after: **119 files, 1,369 passing plus 2 skipped** against D-202's 118
and 1,363 + 2 (the six assertions of the new scenario), plus the 14 perf tests
- `npm test`, `npm run typecheck` and `npm run lint` all green,
`npm run test:soak` green at the unchanged fixture and
`npm run test:balance:full` green including all eleven desync twins. Tick
re-measured on two clean runs of the 1,500-vehicle reference fixture: **p50
1.531 / 1.508 ms, p99 3.006 / 3.225 ms** against the M10 baseline 1.45 / 3.26
on a row that allows +0.15 - both p99 land below the baseline, and the bundle
touches no simulation code at all. Render tripwires green on the same runs
(sprite pool median 1.71, draw prep 2.33 in the consist scene, E-18 full block
2.60, chunk bake 0.59, particles 0.28, weather particles 0.21, aspect 0.04,
emissive 0.05, flow prep 0.27 ms).

---

## M18 - weather, bundle 5: the sky gets a climate, and the band is re-measured on the fixed build (2026-08-08)

### D-204 The frost gate is the season's own winter curve; the defect D-203 named is fixed, and the band re-measured at 4.36 %

**Supersedes D-203.** That entry re-banded M18's balance sentence from SPEC2's
8-15 % to 3-7 % on a measured 4.95 %, and named as its first reason for
refusing the route to 8-15 % that `WEATHER_FROST_SEASON` was CLIMATE-BLIND -
indexed by month and by nothing else, so a tropical January could freeze. That
is a defect, and a re-band whose stated justification is a defect is not
admissible: the project's own rule (D-158's precedent) permits an
evidence-based re-band, never a bug-based one. So the defect was fixed first,
the effect re-measured second, and the band decided third. **The band survives
at 3-7 %; the measured figure moves from 4.95 % to 4.36 %; every claim below
was re-measured on the fixed build and none of it is quoted from D-203.**

**The defect, precisely.** M18 shipped two winter calendars. The SEASON half
(`SEASON_WINTER_SEVERITY_PERCENT` x `SEASON_CLIMATE_WINTER` x height) knew
about climate and gave the tropics an exact zero, which is why
`winterFrictionFactor` and the snow line of D-202 are already honest there. The
SKY half was a twelve-entry table of its own, `[1, 1, 0.5, 0, ..., 0.5, 1]`,
with no climate term anywhere near it. Two tables answering "how much winter
has month M" is the defect; a climate COLUMN bolted onto the sky's table would
have been the instance patched and the class left standing - two month SHAPES
free to drift apart at the next edit, which is the D-187 argument ("the number
that calibrated and the number that divides must be one number") applied to a
calendar.

**The fix is one curve, read twice.** `winterSeverity(month, height, climate)`
is now the private core of `weather/seasons.ts`; `winterFrictionFactor` is
`1 + severity * SEASON_FRICTION_GAIN` and the new
`frostSeasonFactor(month, climate)` is that same severity divided by
`WEATHER_FROST_FULL_SEVERITY`. `WEATHER_FROST_SEASON` is deleted. The device is
D-202's, one bundle on: there the snow line asked the friction where the ground
has gone hard, here the sky asks the same function which months can freeze.

- **The tropics cannot freeze**, as an exact zero rather than a rarity: a
  weight of zero beats the persistence bonus, so a planted frost is gone the
  next day. Measured over a harsh game year on a tropical world: **zero** frosty
  region-days out of 92,160, on a field that is otherwise fully alive.
- **The arctic freezes harder and longer.** The gate is 1.5x the temperate one
  in every month that has any winter, so every threshold is cleared in at least
  as many months and strictly more in between - three months reach a full
  temperate January against one, five reach three quarters of it against three.
  Measured frost share of region-days over one harsh year: arctic **5.2 %**,
  temperate **3.1 %**, desert **0.8 %**, tropical **0.0 %**.
- **The southern hemisphere does not arise, verified rather than assumed.** This
  game has one. `CLIMATE_LATITUDE_RANGE_C` is a monotone temperature gradient
  from the north edge to the south edge WITHIN a climate (`mapgen/climate.ts`),
  never a crossing of the equator, and one `SEASON_WINTER_SEVERITY_PERCENT` is
  applied to the whole world - January is winter everywhere or nowhere.
- **Height is deliberately not a parameter of the sky.** The season takes one
  everywhere it is evaluated AT a place - the vehicle's tile, the snow line's
  height sweep. A weather cell is not a place: it covers a whole 16x16 region, 4
  tiles across on the smallest map and 128 on the largest, spanning every height
  in it. The gate is read at `SEA_LEVEL`, where `heightGain` is exactly 1, and
  the height half of the season goes on entering where a height exists.
- **A temperate January is EXACTLY unchanged**, by construction:
  `WEATHER_FROST_FULL_SEVERITY` is that month's own severity, computed from the
  two tables rather than written out, so the division is a number divided by
  itself and the climate the rule was measured in is not silently recalibrated
  by a fix aimed at the tropics. What does move in the temperate world is the
  shoulders: December and February carry 0.917 of a full winter month instead of
  a flat 1, March 0.583 instead of 0.5, and April and October gain 0.20 and
  0.167 where the old table had nothing. The ground has always said a temperate
  April carries a tenth of a winter; the sky agrees now.
- **Heat is NOT given the same treatment, and that is the named residual.**
  `WEATHER_HEAT_SEASON` is still a bare month table, so an arctic July can be a
  heat wave. Frost could be fixed by REUSING a table; heat cannot - the season
  half has no summer term at all, `SEASON_CLIMATE_WINTER` is about winter, and
  `SEASON_CLIMATE_AMPLITUDE` is the harvest swing and is exactly zero in the
  tropics, which would forbid a tropical heat wave. Giving heat a climate means
  INVENTING a table, and that booking belongs to M23's climate sets. The
  asymmetry is written down rather than smoothed away.

**The re-measurement, same harness, same six seeds, same nine years**
(`tests/balance/hardWinter.spec.ts`, unchanged but for its documentation and its
recorded figures): **3,510,797 EUR of freight with the rule off against
3,357,840 EUR under the harsh rule, -4.36 %**, against D-203's -4.95 % on the
identical off baseline. The fix moved the number by 0.59 points and DOWNWARD,
because the reference line is temperate and a temperate deep winter now gets
marginally less frost. **The gap to 8-15 % was never the tropics.** Per-seed:
-4.89 / -6.31 / -4.81 / -5.46 / -3.14 / -1.48 %, a spread of 1.48-6.31 against
D-203's 3.33-8.15 on the same seeds - the mean moved by 0.59 points and
individual seeds by up to 2.3, which is the chaos of one train and is why the
band is on the ensemble. The two independent instruments SEPARATED further than
they had: breakdowns rise 32.9 % in December/January/February against 7.3 % in
the other nine months (D-203 measured 29.2 against 12.9), and mean speed while
moving falls 4.94 % against 2.97 %. No seed earns more in the weather;
non-clear region-days off 0, harsh 2,360,218.

**Which channel actually drives a winter, re-measured by neutralising one at a
time against the same off baseline.** This is the step D-203's own case (b)
asks for, and the answer is sharper than D-203's - and different:

| channel neutralised | measured | the channel is worth |
| --- | --- | --- |
| nothing (the band) | -4.36 % | - |
| `WEATHER_BREAKDOWN_FACTOR` to all 1 | -0.54 % | ~3.8 points |
| `WEATHER_ROLLING_FACTOR` + `WEATHER_DRAG_FACTOR` to all 1 | -5.50 % | ~-1.1 points |
| `SEASON_FRICTION_GAIN` to 0 | -5.29 % | ~-0.9 points |
| `WEATHER_EXPIRY_FACTOR` to all 1 | -4.38 % | ~0.0 points |
| `SEASON_WINTER_SEVERITY_PERCENT` to all 0 (friction AND frost sky) | -3.93 % | ~0.4 points |

**Only one channel stands clear of the noise.** The breakdown threshold carries
3.8 of the 4.36 points; two of the other three measure NEGATIVE - removing them
makes the loss BIGGER - which is not an error but the honest reading of a
single-train line whose year is reshuffled by every change to which day a
breakdown lands on. D-203 reported all four channels positive and summing to
eight points against a whole of five; on the fixed build two of them changed
sign. **So the sub-dominant channels were never separable, and D-203's ordering
of them beyond the leading term should not be relied on.** What survives both
measurements is that the breakdown threshold is the seam with the reach.

Two structural facts about the reference line that the table makes obvious and
that no constant can change: the seasonal PRODUCTION seam cannot reach it at all
(a coal mine is neither a farm nor a forestry, so that factor is exactly 1 every
month of the nine years), and the heat expiry seam measures nothing because coal
does not perish and the heat gate is zero in the months the frost gate is open.
Two of M18's four seams are inert on the line M18's band is measured on - which
is a property of the scenario, stated here rather than discovered again.

**The seams are not too weak, re-measured.** With every sky behaving as FROST at
both weather seams and the season at full severity in all twelve months - a
permanent winter far beyond anything the rule can draw - the same six seeds over
the same nine years lose **25.24 %** (D-203 measured 26.39 % before the fix).
What is small is how much of the year the expensive sky owns: under the harsh
rule frost holds **9.1 %** of December/January/February region-days (D-203:
9.6 %) and 3.2 % of the year, because its weight is 14 and never boosted while
rain's 20 is multiplied by up to 2.4 by the neighbour pull.

**So the band stays 3-7 %, and it now rests on a measurement rather than on a
defect.** No constant was tuned towards it: the only constant this bundle adds
is derived from two existing tables, and the only one it removes is the
defective one. Three routes to a bigger number were considered and refused, each
with its reason, because refusing them is what keeps the figure honest:

1. **Raising the frost weight** (D-203's sweep: 14 -> 90 buys 70 % frost days
   and -9.30 %). With the gate climate-aware, D-203's first reason is gone - but
   its second and third stand untouched, and they were always the load-bearing
   ones: the constant would be set FROM the run the band then validates, which
   is exactly the defect D-197 was written about, and it would change what
   "harsh" means everywhere in order to move one line's number.
2. **Giving frost the neighbour pull.** `wetness()` counts Rain and Storm, so a
   cold snap cannot form a front while a rain front can, and that is the direct
   reason frost holds a tenth of the winter rather than a third. It is a bounded
   model, not a defect - `WEATHER_NEIGHBOUR_PULL` is documented as the wet-front
   term and was measured as such (D-200) - and changing it would raise the band.
   With no independent evidence that frost SHOULD cluster, changing it is
   indistinguishable from tuning, so it is named here as the next honest
   question and left alone.
3. **Widening the ensemble** past six seeds to shrink the error bar. It would
   buy a tighter band at a linear cost in CI minutes on a scenario that already
   measures 30-34 s, and the spread is reported rather than hidden, which is
   what an error bar is for.

**SPEC2 is amended rather than left to disagree with the test** (the
D-158/D-191 precedent, which D-203 did not apply): section 8's M18 MUSS bullet
and its Fertig-wenn sentence now carry a bracketed note recording that 8-15 % is
superseded by the measured 3-7 %, with this entry named. SPEC.md is untouched
(D-123).

**Ledger.** `SAVE_VERSION` unchanged at **29** - M18's one Z5 bump is D-200's
and this bundle adds no state at all; `SNAPSHOT_LAYOUT_VERSION` unchanged at
**10**; zero atlas cells, no migration edit, no protocol field, no i18n string,
no allowlist line. A constants-table change does not move `hashWorld`, and that
was verified by running rather than assumed: canonical cross-OS pin
`5a2a6cf73f4107bb`, corpus manifest `c0a021f5d1ee8619` (all eight fixtures
decode to one world), soak fixture `e6c5e33d8e7607ec` at 698 recorded commands,
all eight shipped scenarios hash-identical over two runs with their
world-claims, briefing-numeral and place-name audits green, scenario 2 at
investment 249,980 EUR and payback in year 6 with the same nine balances,
scenario 1 at payback year 3, scenario 5 at D-158's 1,119,720 EUR. **Nothing a
world with the rule OFF does changed**: the frost gate is read inside
`updateWeather`, which returns on its first line there. Draw-count invariance
(Z3) is unmoved and instrumented as before - the weather pass takes exactly one
draw per region per day in every climate including the tropics, where the frost
weight is zero, and the shared gameplay stream is untouched.

Main bundle re-measured with `npm run build`: **935,002 B against the 950,000 B
budget, headroom 14,998 B** (D-203 recorded 934,926 B; the +76 B is the new
function and the derived constant reaching the main chunk through
`constants.ts`); `SimWorker` 328,296 -> 328,376 B, `replay` 200,040 -> 200,050 B,
the scenario catalogue 13,319 B and CSS 13,427 B both unchanged.

Suite after: **119 files, 1,377 passing plus 2 skipped** against D-203's 1,369
+ 2 (six assertions for the new gate function, two for the field), plus the 14
perf tests - `npm test`, `npm run typecheck` and `npm run lint` all green,
`npm run test:soak` green at the unchanged fixture and
`npm run test:balance:full` green including all eleven desync twins. Tick
re-measured on three clean runs of the 1,500-vehicle reference fixture: **p50
1.431 / 1.548 / 1.449 ms, p99 3.108 / 3.890 / 2.768 ms** against the M10
baseline 1.45 / 3.26 on a row that allows +0.15. Two of the three p99 land below
the baseline and the second is 0.63 ms above it, inside this machine's
documented +-0.7 ms run-to-run noise; the reference fleet runs the rule OFF,
where the changed line is never reached at all, so the honest reading is noise
rather than cost. The ON-path cost is one extra function call per game DAY,
hoisted out of the region loop, and it is not measured on that fixture.

## M13 - living trains, bundle 7: the static world from the bake (2026-08-08)

### D-205 The bake's other 1,670 cells finally draw: buildings by zone and stage, industries by type, trees by climate - and M13's Fertig-wenn never asked

M13's acceptance passed with a renderer that consumed a quarter of its own
art. `public/assets-baked/baked-manifest.json` carries **2,430 cells** across
ten pages; `MapView` read only the ones whose target began `vehicle:`. Every
`building:`, `industry:` and `tree:` cell D-169 mapped and the bake rendered
was fetched, decoded, uploaded to the GPU and never drawn - the world kept the
procedural silhouettes of D-117, so a player with no vehicles yet saw **none**
of the Kenney art and said so.

**This is a spec gap, not a design choice.** SPEC2's M13 section orders
"Gebaeude-, Stadt- und Industrie-Sprites aus dem Kenney-Bake (City Kits,
Factory Kit, Building Kit, Nature Kit - E-14)" in its own MUSS bullet. Its
**Fertig-wenn sentence lists six things** - catalogue entries in eight
facings, a ten-wagon train as ten wagons, night windows and lamps, signal
aspects without F3, a dormant works against a booming one, the particle CPU,
and the repo glob - and **not one of them is a building, a town or a tree.**
Bundles 2 to 6 each satisfied a clause of that sentence and the seventh clause
did not exist, so nothing was red. What closes it is not a promise but
`tests/unit/staticArt.spec.ts`: the three families' target grammars, the
index, the per-tile variance and every fallback decision are pure functions
under test, and the industry half is held against `tools/assets-manifest.json`
in BOTH directions - a type that loses its model and a procedural-only type
that gains one are equally red.

**The architecture is D-170's, deliberately not a second one.**
`staticArt.ts` is `vehicleArt.ts` for the things that stand still: page
textures shared, one `BakedCellHandle` (the vehicle handle, renamed - a Kenney
cell is a Kenney cell, and a second handle type would be a second place for
the anchor rule to be wrong), the frame cache keyed by page and cell origin,
placement from the cell's OWN `anchorX`/`anchorY` because baked cells are
tight rectangles, `bakedZoomFor`'s no-upscale rule for the zoom, and the two
floors of E-14 unchanged: `atlasSourceFor` decides whether a baked path exists
AT ALL, and a null base target decides per entry. The whole of the fallback is
one variable per rebuild - `statics === null` means the procedural game that
was already running.

**The key grammar was read out of the manifest, not guessed.** A town cell is
`building:<zone>:<stage>` with `<zone>` from `BuildingKind` and `<stage>` the
`level >= 2` split `TerrainAtlas.buildingFrame` has used since M1 - restated
once and held to the procedural cell by a test through `emissiveBuildingFrame`,
because a tile that draws the tall Kenney block while its fallback would draw
the small procedural one is a silhouette that changes when a fetch completes.
An industry is `industry:<TypeName>`, the enum read backwards so a new type
needs no edit here. A tree is `tree:<climate>:<n>` - and here the trailing
index is the VARIANT, not a stage, which is why the three families get three
written-out regexes instead of one "strip a trailing number": `tree:temperate:0`
and `building:x:0` end in the same shape and mean different things.

**The three procedural-only industries are refused BEFORE the index, by
name.** `industryTargetFor` answers null for CoalMine, OilWell and Farm
whatever the manifest holds - the headframe, the derrick and the farmstead
stay `shapes.ts`'s (E-14, D-169) - and the test plants all three in a
synthetic manifest and requires them still refused. Aircraft never enter this
file at all; they are vehicles and `vehicleVariantFor` already refuses them.
The existing `assetsBake.spec.ts` coupling is untouched and green.

**Both render paths, or the overview would be a different world.** Buildings
and trees are static MAP art, so they go into the chunk textures at 0.5x and
below exactly as roads and track do (D-161); industries and station modules
stay live sprites above them, as they always have, because their markers move
on their own channel. The chunk bake pins its static index to the CHUNK zoom
rather than the live one - the same discipline that pins it to the base page -
so a chunk holds the same pixels however the camera got there, and the detail
path and the bake ask ONE function (`bakedBuildingHandle`) with ONE seed for
every tile. **A chunk texture had to grow its headroom to make that true**:
`chunkAabb` reserved `CELL_HEADROOM_STEPS` = 48 world px above the highest
tile, and the tallest baked static cell (`building:commercial:1:2`) lifts
**138 px** - a skyscraper guillotined at the chunk seam at 0.5x while drawing
whole at 1x, the D-117 unwritten agreement one container out.
`CHUNK_ART_HEADROOM_PX` is now the larger of the two (160 px, the measurement
plus room for one taller kit model), and it is deliberately a CONSTANT rather
than a reading of the loaded manifest: chunk RenderTextures are recycled
between chunks, so a headroom that changed when the bake finished loading
would hand a bake a texture of the wrong size. The price is ~8 % more chunk
texture area in a build with no bake at all, and it is stated rather than
hidden.

**Night windows come from the cell that is actually drawn** (D-172). A baked
building lights its own `emissivePage` twin and the procedural
`emissiveBuildingFrame` is NOT placed beside it - the bake decided which
pixels are glazing when it rasterised the model, so the lit windows sit on the
dark ones by construction, while the procedural twin would light a facade that
is no longer there. The same swap on the chunk path, into the chunk's own
emissive twin, so the D-172 mechanism is untouched: content composites
normally inside the twin and meets the ramp once, where the twin sprite meets
the frame. Eighteen of the twenty-one town cells and four of the fourteen
industry cells carry a twin; the rest simply do not glow, which is the honest
answer for a warehouse at night. `industryGlowFactor` still scales the
industry glow by the marker level, so M13's "dormant and booming tell apart in
a still image" survives the swap unchanged.

**Trees are the one thing here that did not exist at all.** A forest tile was
green speckle and nothing else - a wood was a COLOUR - and the only tree in
the game was the conifer primitive inside the Forestry silhouette. A wooded
tile now grows `FOREST_TREES_PER_TILE` = 3 baked trees of its climate's
family, each its own body and its own jitter from `tileVariantSeed(x, y,
salt)` - the `speckleHash`/`hash(vehicleId)` device keyed by POSITION, so the
same tile grows the same wood on every machine, after every reload and on both
render paths, with zero contact to any RNG stream (Z3 untouched, Fehlerkatalog
25/39). Three because a baked tree is 6-10 px against a 64 px tile and one
reads as a lone shrub. The three share one `drawOrder` key - the key is per
tile and per layer - so what orders them is Pixi's stable sort over insertion
order, and the slot table is therefore written back to front with its depth
sums 0.42 apart while the jitter can move one by at most 0.16: the bands are
disjoint by construction and a test walks 576 tiles to say so. `isWoodedTile`
reads terrain, roads, track and buildings and nothing else - **every one of
those layers is in `chunkChecksum`'s full fold**, which is the rule and not a
coincidence: a gate reading a layer outside the checksum would leave a wood
standing on a factory until the camera happened to evict the chunk.

**The smoke follows the drawn stack, which is D-174's own promise carried into
the bake.** A baked industry emits from the cell's measured `points.chimney`
anchors (D-169 read them off the models' top-vertex clusters) instead of from
the procedural silhouette's table, which is somewhere else entirely on a
different building. What does NOT change is the emitter SET: the cadence, the
count and the tint stay `INDUSTRY_SMOKE_ANCHORS`'s, because those are the
simulation's production level made visible. A baked cell that declares fewer
stacks than its silhouette draws therefore smokes from fewer, and never from
more - so the particle budget can only fall.

**Found while measuring, and worth more than the feature:** the first tripwire
run of the new scene read **9.7 ms** against a 10 ms gate, and the cost was not
the 4,914 tree sprites but the STRINGS - one target key composed per tile,
`building:<zone>:<stage>` and `tree:<climate>`. The targets are module-load
tables now, and the same scene with 27 % MORE sprites than the pre-tree one
costs 5 % more time. Law #7 is written for the simulation's tick, but a
renderer that composes a string per tile per rebuild has the same disease.

**Render-only in the strictest sense**: not one byte under `src/sim`,
`SAVE_VERSION` unchanged at **29**, `SNAPSHOT_LAYOUT_VERSION` unchanged at
**10**, no migration edit, no protocol field, no i18n string, no procedural
atlas cell (the baked pages are a build artifact, and the repo-glob test is
green - nothing binary entered the index).

**Ledger.** Render tripwires re-derived by the D-171 procedure rather than
eaten. The rebuild scene grew from 9,832 to **14,746 placements** - the perf
fixture's untouched ground is all woodland now, the worst case for the new
branch - and its clean median moved 2.2-2.9 -> **3.6-3.9 ms** over three runs
each on this machine; leaving the 10 ms gate would have left 2.6x, so
`REBUILD_P50_TRIPWIRE_MS` is re-derived at **15 ms** (4x the new clean median,
the generosity it had over its own scene), backstop unchanged at 60. The chunk
bake grew from 3,046 to **4,273 placements** and its median 0.93-0.96 ->
**1.11-1.39 ms**, so `CHUNK_BAKE_P50_TRIPWIRE_MS` moves 3 -> **5 ms** (4x),
backstop unchanged at 30. Every other tripwire unmoved and green on the same
runs: draw prep median 2.96 (gate 10), E-18 full block 2.14, aspect refresh
0.03, emissive twin walk 0.04, particles 0.40, weather particles 0.26, flow
prep 0.27. **Main bundle measured 935,002 -> 940,149 B against the 950,000 B
budget** (D-192's rule; headroom 9,851 B) - the +5,147 B are `staticArt.ts`
and the MapView placement, the whole of it render code, no sim import chain;
`SimWorker` 328,380 B and `replay` 200,050 B unchanged, as a render-only
bundle must leave them. `npm run typecheck`, `npm run lint` and
`npx vitest run tests/unit` all green: **101 files, 1,309 passing**, the 28
new assertions of `staticArt.spec.ts` among them.

**Not verified, and it says so.** The drawing itself was not seen. D-136's
standing note applies unchanged - MapView's frame loop needs a GPU and a
compositor and has never been headless - and this session's browser pane was
hidden, so `requestAnimationFrame` never ran and every screenshot timed out.
What WAS verified in the real browser is the load path: the dev server serves
`baked-manifest.json` (version 2, ten pages, all four target families) and the
running game fetched the manifest and all ten pages with 200. Everything
downstream of that is held by the type checker, the pure halves' tests and the
two tripwire proxies, which replay the new decisions literally.

## M13 - the static world, bundle 8: proportion (2026-08-09)

### D-206 A tile's building may not stand taller than the cell the game reserves for it - the rule, the remap, and the wood that stopped being wallpaper

D-205 wired the bake's other 1,670 cells and never asked how BIG any of them
was. The owner looked at a brand-new 1950 town and reported thin grey towers
over a settlement of low houses, and a countryside of identical small spikes.
Both readings were correct and both are measurable.

**Measured first.** A tile at zoom 2 is 128x64 px and one height step is 32 px,
so a cell's `anchorY / zoom / TILE_H` IS its height in tile heights. The M13
bake's tallest static cell, `building:commercial:1:2`
(`building-skyscraper-e`), was 53x289 px at zoom 2 with `anchorY` 275: **4.30
tile heights, 8.6 height steps, 69 m** on a 50 m tile. Its three siblings were
3.09, 3.17 and 4.16. The procedural cell the same tile falls back to - the
D-117 three-shape town, `TerrainAtlas.drawTownBuilding` - lifts **1.12** tile
heights for the same zone and stage (the six procedural cells measure 0.62 /
0.89 residential, 0.72 / 1.12 commercial, 0.51 / 0.66 industrial). The bake
was **3.8x** the reference the game was balanced and read against, so the two
paths drew two different towns depending on whether a fetch completed.

**The rule is the game's own reserved headroom, not a taste.** A procedural
atlas cell reserves `CELL_HEADROOM_STEPS * HEIGHT_PX` = 3 x 16 = 48 px above
its tile diamond - that reserve IS D-117: it was one step, and everything
taller than a crate was silently cut off. A baked cell's `anchorY` is measured
from the tile CENTRE, half a diamond further down, so the same ceiling on the
same datum is

    CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2  =  48 + 16  =  64 px

= **2.00 tile heights = 4 height steps = 32 m** at zoom 1. That is the tallest
silhouette a fallback can physically draw, so it is the tallest a baked cell
may be if the two paths are to stay interchangeable. It is bounded above by a
correctness fact rather than by preference: a chunk texture reserves
`CHUNK_ART_HEADROOM_PX`, and a cell over it is guillotined at a 0.5x chunk
seam while drawing whole at 1x. `BAKED_STATIC_MAX_LIFT_PX` is now that one
number (160 -> 64; D-205's budget was sized for a 138 px skyscraper that no
longer exists), `CHUNK_ART_HEADROOM_PX` is exactly it, and a chunk texture
fell from 1,440 to 1,344 px tall - **-6.7 % of every chunk bake**. The datum
difference leaves that reserve conservative by `TILE_H / 2`, which is now
written down rather than left as the 16 px lie it was.

**Enforced by the baker, not by a comment.** `tools/bake-lib.ts` restates the
rule as `BAKE_STATIC_MAX_LIFT_PX` (the D-160 coupling device; a test asserts
the two equal) and `bakeAtlases` THROWS on a `building:`, `industry:` or
`tree:` cell above it, with the numbers in the message. Run against the
pre-change manifest it says exactly what is wrong: `building:commercial:1:
lifts 100.0 px at zoom 1 (3.13 tile heights, 6.25 height levels), over the
64 px static-art rule`. Vehicles are exempt - a train is bounded by its
catalogue, not by a tile's headroom. `tests/unit/assetsBake.spec.ts` proves
the refusal on synthetic geometry, so it holds on a machine with no cache and
no bake; `tests/unit/staticArt.spec.ts` holds the arithmetic against
`TerrainAtlas`'s own `CELL_HEADROOM_STEPS` and, when a bake IS on disk, holds
every cell to the rule AND to the stage ladder.

**Height was corrected with `stretch`, size with `scale`, and the wrong
building with a remap.** The camera draws 1 m of height at
`HEIGHT_PX / HEIGHT_STEP_M` = 2 px and 1 m of ground at 0.64 px across and
0.32 px in depth, so a model at real-world proportions draws three to six
times too tall for its own plan. Correcting the HEIGHT is what `stretch`
exists for (D-169), and `[1, y, 1]` leaves the authored footprint alone - a
building that keeps covering its tile. Scaling instead would have taken the
plan with it: `building:residential:0` would have gone from 0.41 to 0.32 tile
widths against the procedural 0.44, curing one axis by breaking the other.

**The reuse register, amended (D-169's).** Town buildings, new lift bands in
tile heights, with the procedural cell each family falls back to:

| family | models (bold = remapped) | lift band | fallback |
| --- | --- | --- | --- |
| residential:0 | suburban type-h/i/c/j, `stretch [1, 0.585, 1]` | 0.55-0.73 | 0.62 |
| residential:1 | suburban type-b/d/t/f, `stretch [1, 0.675, 1]` | 0.89-1.00 | 0.89 |
| commercial:0 | commercial building-e/**c**/**k**, `stretch [1, 0.49, 1]` | 0.52-0.88 | 0.72 |
| commercial:1 | commercial **f**/**i**/**j**/**n**, `stretch [1, 0.54, 1]` | 1.05-1.36 | 1.12 |
| industrial:0 | industrial building-h/i/j, `stretch [1, 0.62, 1]` | 0.55-0.63 | 0.51 |
| industrial:1 | industrial **o**/**r**/**b**, `stretch [1, 0.66, 1]` | 0.77-1.00 | 0.66 |

- **The four skyscrapers and `building-m` leave the mapping entirely.** They
  were not merely too tall, they were the wrong CENTURY: stage 1 means
  "grown", not "1999", and a glass tower over a 1950 town is a wrong
  silhouette in exactly the D-117 sense. `building-f/i/j/n` are the kit's
  ordinary mid-rise blocks, which is what a town looks like in the MIDDLE of
  the century the game plays. **The named handoff is M23**: an era axis is
  where `building-skyscraper-a/b/c/d/e` and `building-m` belong, beside the
  watercraft galleon and the Pirate Kit that D-160 already filed for the
  pre-1920 eras. Nothing here builds it and nothing here makes it harder -
  the target grammar is untouched, so an era becomes one more variant
  dimension rather than a rewrite.
- **`building:industrial:1` was drawing SHORTER than the stage it outgrows.**
  `building-p` lifted 25.0 px against `building:industrial:0:2`'s 30.5, so an
  industrial tile got smaller as the town grew and nothing said so. The stage
  ladder is a test over the real bake now, per zone, both stages.
- Industries are deliberately NOT remapped: the tallest,
  `industry:CementWorks`, lifts 59.5 px = 1.86 tile heights, already inside
  the rule, and a works that dominates a suburb is right. D-169's industry
  register therefore stands exactly as written.

**The wood was two defects, and neither of them was the tree count.**
Measured: the temperate family drew 14-15 px wide against a 128 px tile at
zoom 2 - **0.11 tile widths**, against the procedural conifer inside the
Forestry silhouette at **0.22**. At that width a Kenney broadleaf lollipop is
a 1:4 spike and reads as a conifer whatever species it is, which is what the
owner saw. `stretch [1.7, 1, 1.7]` widens the authored 5.5 m crown to 9.4 m
and takes the tallest temperate tree to 0.16 tile widths - half-way to the
procedural reference, deliberately not all of it, because the full correction
takes the trunk with it. Per-variant `scale` then spreads each climate over a
**2:1 size ladder** (temperate 0.88 / 0.73 / 0.58 / 0.45 tile heights, where
M13 had 0.88 / 0.72 / 0.66 / 0.59), so a wood has saplings in it.

The second defect was a lattice: three trees at three fixed slot centres on
every wooded tile, jittered by at most +-0.08 tiles per axis - +-5 world px -
which over a forest is literally a repeating pattern. **The depth key reads
`u + v` and nothing else**, so a displacement of `+l` on u and `-l` on v is
invisible to the painter order BY CONSTRUCTION. The jitter is split:
`FOREST_JITTER_LATERAL_TILES` = 0.17 across - free, and derived (the tile's
half-width less the farthest slot centre 0.24 and the depth jitter 0.08, less
a hundredth so the containment test stays a strict inequality) - and
`FOREST_JITTER_DEPTH_TILES` = 0.08 along, unchanged, because the slot sums
are 0.42 apart and D-205's disjoint-band proof rests on it. Lateral travel
goes from +-5 to +-11 world px, 2.1x, at zero cost and with the ordering
proof untouched. `FOREST_TREES_PER_TILE` stays 3 and not one tree variant was
added: **more bodies is the next lever and it is not free** - every new cell
is a SPEC2 6.2 booking (Fehlerkatalog 40), and this bundle deliberately spent
none.

**What did not move, verified by running.** Render- and asset-only in the
strictest sense: not one byte under `src/sim`, `SAVE_VERSION` unchanged,
`SNAPSHOT_LAYOUT_VERSION` unchanged, no migration, no protocol field, no i18n
string, no procedural atlas cell, no new baked cell. The SPEC2 6.2 booking is
untouched at 810 cells per zoom, and the atlas pages come out at the same
DIMENSIONS as the D-175 measurement (z1 4096x1057, z2 4092x3606, z4
4056x4015 + 4096x4089 + 4056x3858 + 4060x1333) because the shelf heights are
set by the vehicle cells rather than by the buildings; the z1 emissive page
SHRANK, 4096x568 -> 4096x491. Two consecutive bakes are byte-identical on all
eleven files (D-160's promise re-proven on the changed set): 145 models,
2,430 cells, 6,275 KiB. Main bundle 940,149 -> **940,159 B** against the
950,000 B budget - **+10 B**, measured against a build of the same tree
without these two render files, because the rest of the working tree belonged
to another milestone at the time.

**What a human still has to confirm by eye**, because the browser pane here
renders no frames (D-136, D-205): that a 1950 town now reads as a town rather
than as a skyline, and that a forest reads as woodland. Everything that CAN
be checked against a screenshot is a number: nothing standing on a tile is
taller than two of that tile's diamonds stacked; the tallest office block is
1.36 tile diamonds and the tallest house 1.00; a grown building of a zone is
taller than every ungrown one of the same zone at all three zooms; and a
wooded tile carries three trees of visibly different heights spanning 2:1,
scattered across the tile by up to a sixth of its width.

## M19 - travellers with destinations, bundle 1: the two passenger classes (2026-08-09)

### D-207 Two fare classes, one seat: `CommuterPax` and `BusinessPax` as own cargo ids, and the first remap in the save chain

SPEC2 M19's first bundle, and the milestone's one Z5 bump (v29 -> v30). What
lands here is E-08 literally: the passenger trade becomes two cargo ids, a
residential or industrial zone offers commuters and a COMMERCIAL zone offers
business travellers - the first economic use of the 13.1 zones - business pays
1.6 times the fare and loses it twice as fast, the catalogue refits grow, and
every save ever written is carried across. Gravity, return trips and the AI's
own use of the classes are later bundles.

**The classes are ids and never per-parcel attributes** (E-08, Fehlerkatalog
28). The stack merge key, the M5 routing, the rating, the tariff table, the
refit validation and the D-118 walk are untouched by construction, and the
fixed-size cargo arrays grew by exactly two entries: `CARGO_COUNT` 18 -> 20.

**`Cargo.Passengers` is RETIRED at id 0 rather than reused.** A cargo id is a
number in every save ever written; renumbering the seventeen cargoes above it
would rewrite every capacity map, every history-ring index and every stack in
one edit, to save two table rows. Nothing produces it, nothing accepts it, no
vehicle carries it, and `tests/unit/deliveries.spec.ts` holds all three - so
the empty slot can never become the dead end D-118 is about. The alternative
(rename 0 to `CommuterPax`, add only `BusinessPax`) was refused for the same
reason SPEC2 wrote "+2 Cargo-IDs": it makes the remap vacuous and hides the
fact that the class a pre-M19 world carried is a DECISION, not a rename.

**The commuter row is the retired row, digit for digit.** 950 ct, four grace
days, 5 % decay - the three numbers balancing scenario 1 is calibrated on
(D-039). A test holds the two rows together so a later edit cannot separate
them by accident, and scenario 1 measures **payback in game year 3** after the
split, exactly as before: every balancing world of section 19.4 is hand-built
and every one of its buildings is residential, so those worlds produce ONE
class and the M6 bands cannot move. Business is 1,520 ct and 10 % decay beyond
the SAME grace period: doubling the decay is what makes a slow line lose the
premium, and halving the grace as well would have taken it away before the
line's speed could decide anything.

**The seats are shared, and that is the one thing here SPEC2 did not ask for
by name.** A vehicle refitted to either class loads that class first and fills
the rest of its room with the other; `refitCargo` decides the ORDER of
boarding and nothing else. Two things forced it. The first is arithmetic: a
station's capacity is checked against the SUM over every stack
(`cargo/routing.ts`), so a class nobody carries does not merely go unserved -
it fills the station to its 2,000-unit cap and then every later deposit of the
class that IS served becomes overflow, which is a line that earns nothing at
all. Measured on the generated map behind scenario 5: a stop at the centre of
a city of 8,000 covers TWELVE commercial tiles and no residential ones, so a
single-class bus there would have run out of traffic inside a few game years.
The second reason is the milestone's own sentence - "speed finally becomes
money for passengers" - which is only true if business travellers ride the
lines that exist. The refit list, its price and its validation are unchanged,
which is what E-08's "Refit unveraendert" actually claims; what changed is
what a vehicle may LOAD, in one function, with one test, and with a catalogue
coupling test that holds both classes to the same seat count so the
subtraction is exact rather than approximately right.

**The split is the map's zoning and invents no constant.** `commercialShare`
is the share of the town buildings inside a station's catchment that are
commercially zoned, counted in the scan `assignStationIndustries` already
makes and DERIVED like `acceptedCargo` beside it - recomputed on load, never
saved, never hashed (the landmass treatment). It is deliberately not
`commercialCovered / buildingsCovered`: that counter IS saved and can predate
a demolition, and a share above one would hand a town negative commuters. The
town's total output is unchanged - `PASSENGERS_PER_INHABITANT_PER_MONTH` never
moved, the split only says which fare it travels at - and commuters are
deposited FIRST, so a world with no commercial zone makes exactly the one call
the pre-M19 code made with exactly the arguments it made it with (the D-201
device).

**A passenger train nearly left its shed as a mail train.**
`consistDefaultCargo` picked the lowest cargo id among the ties, and a
passenger coach has exactly as many "mail" units as it has seats because a
refit gives back the unit's own capacity. Until M19 that tie was settled by
the accident that passengers were id 0; with the classes at 18 and 19, Mail
(1) won every one of them. What a consist was BUILT to carry now beats what it
could be converted to, and only a consist with no direct capacity at all -
nothing but a locomotive - falls through to the old answer. Found by
`train.spec.ts`, which stopped earning.

**The migration is the first REMAP in the chain, and it uncovered a latent
trap.** Every number that named a cargo moves - parcels waiting and aboard,
`refitCargo`, order and line-order `refitTo`, the AI project's cargo, a
tender's cargo, a `CargoDeliveredTotal` goal's subject - and the two
CARGO_COUNT-sized tables grow with the old passenger figures moved to the
commuter slot and the business slots entered as zero, which is not a
convenience but what those worlds knew: they earned no business fares because
they had none. The trap: `v24_to_v25` and `v27_to_v28` sized their zero-fills
from the LIVE constants, so a version 22 save would have arrived at
`v29_to_v30` carrying twenty-cargo rows and left it with twenty-two. A
migration writes the shape of ITS OWN target version; both are pinned to
`CARGO_COUNT_V29` now, and the corpus - which walks the whole chain from 22 -
is what proves it.

**The command log is deliberately NOT remapped.** A log is history rather than
state (D-131) and it is judged only by a build of its own version, because
cross-version replay verification is refused rather than guessed (E-11,
D-191). Rewriting a recorded `refitTo` would invent a command the player never
gave.

**Losslessness is proved on a world that HAS parcels, not on the corpus
alone.** The corpus game is station-less and vehicle-less by construction, so
its v29 fixture can only prove the half it has - the company row grows without
moving a figure, sum for sum, which the test asserts entry by entry. The other
half is a round trip: a played two-town bus world (parcels waiting, parcels
aboard, a per-order refit, a filled ring, a lifetime tally) is written DOWN
into the v29 shape by an inverse that is legitimate only because the world
provably contains no business passengers, migrated forward, and compared field
by field with the original - and then the same v29 container is fed through
`decodeSave` and hashes to the world the v30 encoder wrote. The corpus
reconstructed the v22 container exactly once, for the same reason and under
the same rule.

**Every pin moved once, and the corpus is the proof nothing else did.**
Canonical cross-OS `5a2a6cf73f4107bb` -> **`40be7d25b1a6a90f`** (D-137),
corpus manifest `c0a021f5d1ee8619` -> **`9800c136644b0199`** with a new
`v30-played.ironsave` - all NINE fixtures, eight of them written by eight
earlier builds and untouched on disk, still decode to ONE world (D-130) - and
the soak fixture `e6c5e33d8e7607ec` -> **`65d8cb57cf5edec5`** at 698 -> 800
recorded commands, because the competitors now earn a business premium and
therefore make different decisions.

**Measured, and one band re-banded with the trace.** Scenario 1 payback year 3
(unchanged), scenario 2 249,980 EUR and payback year 6 (unchanged), scenario 3
159,516 EUR/yr (unchanged - and the "166 k" in CLAUDE.md was already stale
BEFORE this bundle, verified by running the same scenario in a git worktree at
HEAD), Netzdesign 3.73 (2.01x alignment, 1.86x capacity, unchanged), takt
-8.3 % and rating variance 0.57 (unchanged), hard winter in band, Punktzahl
5,889 with the identical quarter split (unchanged - the wood chain's world is
hand-built and residential). Scenario 5 road 1,119,720 -> **1,122,965 EUR**
(+0.29 %), deep inside D-158's 0.8-3.2 M band: the AI's bus lines run on
GENERATED towns, which do have commercial zones, so a small part of its
passenger revenue now carries the premium.

The one band that broke is `aiGame`'s RAIL value floor, and the trace stands
in the test beside it. Both figures were measured on this machine an hour
apart, the second in a git worktree at HEAD: the road company earns the
premium, builds ten more tiles of road (345 -> 355) and finishes at 550,942
instead of 544,857 EUR; the three competitors share ONE world, so from there
every later decision is a different decision, and this run's rail company buys
and writes off one train (~144,000 EUR of depreciated asset) that the M11 run
never bought. At BOTH figures it is the same stagnant husk D-158 names as an
open bottleneck - no line, no vehicle, two stations - so what the floor is FOR
still holds; it moves from -150,000 to -250,000 EUR, set from the measured run
exactly as the original was, which is stated rather than hidden.

**The fare, measured on runs rather than read off the table.** At the counter
the ratio is exactly 1.6 (the payment formula, same amount, same distance, no
time in transit). On two villages twelve tiles apart with four buses it is
**1.291** - what is left of the premium after the queue and the drive - and on
the SAME villages with the SAME four buses thirty tiles apart it is **0.664**:
past twice the grace period a business traveller is worth LESS per seat than
the commuter beside him. That crossing is the mechanism the milestone is
about, and it is asserted by sign rather than banded tight, because the exact
figure moves with every decision the payment formula makes.

**The tick could not be measured on this box, and that is stated rather than
rounded away.** The perf gate is red on the BASELINE commit too - measured in
a git worktree at HEAD, 2.9-3.5 ms p50 against the 1.43/3.11 ms reference -
because other agents were building and baking on the same machine throughout.
Four A/B pairs, alternating: this build 2.958/9.848, 3.601/16.641,
3.173/11.408, 3.102/12.924 ms p50/p99; the baseline 3.469/13.355, 2.886/8.529,
2.963/8.106, 3.136/9.817. Mean p50 delta **+0.10 ms** - exactly the ledger
row, and inside the documented +-0.7 ms noise - and mean p99 delta +2.76 ms
with the SIGN FLIPPING across pairs (the first pair measures this build
3.5 ms faster). p99 is the quantity D-167 describes as inflated by multiples
under background load. **No acceptance number is claimed**; the clean
measurement is outstanding and belongs to whoever takes the milestone's
6.1.1 row.

What the bundle actually adds per tick is stated instead of estimated: NO
O(stations) walk anywhere. Both places where a second class would have cost
one - the routing decision at a stop and the destination search in the daily
hook - are SHARED between the classes, and the sharing is provable rather than
convenient, because both classes sit in `STATION_ALWAYS_ACCEPTED` and neither
the allowed-destination set nor the candidate list can differ between them.
What is left is one more `transferCargo` scan per passenger stop, one more
placement per station-with-a-commercial-zone per game day, and about twice as
many cargo stacks at a town station - the last of which is inherent in having
two ids and is what E-08 bought when it chose ids over per-parcel attributes.

**What this bundle did NOT do**, so the next one knows: `chooseDestinations`
has no gravity term yet, no return trips are generated, the AI still rates a
town pair by the commuter class alone, and the four shipped scenarios that
counted passengers now count COMMUTERS - their captions say so in both
languages, and the thresholds were left where D-195 calibrated them.

## M13 - the static world, bundle 9: the wood (2026-08-09)

### D-209 A wood is a density, not a carpet: the stand field, the four-slot table and the size jitter that ended the wallpaper

D-206 corrected the SIZE of a tree and left the ARRANGEMENT alone, and the
owner's second reading survived it: the countryside still read as a repeating
wallpaper of identical small conifers rather than as woodland. The reading was
correct, the cause was measurable, and it was none of the three things one
would guess.

**Measured first, on the world the game actually makes.** A default temperate
1024 map (seed 4,711) has 737,380 land tiles of 1,048,576, and **172,966 of
them are forest** - 16.5 % of the map, 23.5 % of the land - every one of them
untouched and therefore wooded on day one. At `FOREST_TREES_PER_TILE` = 3 that
was **518,898 tree instances on the map** and, on a 1920x1080 canvas, about
**501 tree sprites on screen at zoom 1** (1,013 tiles visible, 167 of them
wooded at the map's average), 125 at zoom 2 and 2,005 inside the chunk
textures at 0.5x - and far more than that whenever the camera is parked over a
wood, which is the shot the complaint came from.

**The hash was NOT the problem, and that is worth writing down because it is
the usual suspect.** Over a 64 x 64 patch the per-slot body pick produced
**all 64 possible variant triples**, the most common on 79 of 4,096 tiles
(1.9 %), and each slot's four bodies came up 1,003-1,078 times against an
expected 1,024. There were plenty of effective states. What repeated was the
GEOMETRY, in three ways a screenshot shows and a hash count does not:

1. **A constant count.** Every wooded tile carried exactly three trees. A
   constant density over a region is a carpet however varied its pile is: no
   clearings, no stands, no edges, and a texture whose spatial frequency is
   exactly the tile grid.
2. **One triangle, stamped everywhere.** The three slot centres sat at
   (0, -6.7), (+15.4, 0) and (0, +6.7) world px, so every tile in the game
   drew the same motif, and the jitter that was meant to hide it moved a tree
   over a span of 21.8 px across but only **5.1 px along the depth axis**,
   against a tile 64 x 32 px. The three occupied x in [-10.9, +26.2] of 64 and
   y in [-9.3, +9.3] of 32.
3. **A lateral bias nobody had noticed.** The slot table averaged
   (+0.08, -0.08) in tile space, which is **+5.1 world px to the right, on
   every wooded tile of every map**. A constant offset repeated a hundred
   thousand times is a lattice signature of its own.

**The cure is a density, and it is the cheapest of the candidates rather than
the most elaborate.** `forestDensityAt(x, y)` is smoothstep-interpolated value
noise over a lattice of `FOREST_STAND_TILES` = 8 tiles - **400 m on the game's
own 50 m tile, the scale of a stand or a clearing rather than of a tree** -
banded into [0.12, 1.00]. Each of `FOREST_TREE_SLOTS` = 4 slots then draws or
does not draw on a Bernoulli test against that density. Measured over 262,144
tiles: **mean 2.223 trees per wooded tile** (8.4 % of tiles empty, then 20.5 /
28.0 / 26.7 / 16.5 % carrying one to four), so the maximum went UP while the
placement count went **DOWN by 26 %**. Smoothstep rather than raw bilinear
because raw bilinear value noise creases along its lattice lines, and the
creases would be a grid again; 8 tiles rather than 4 or 32 because a viewport
at zoom 2 is about 33 tiles across and has to contain several stands.

**It costs no extra hashing at all.** The M13 code already spent one
`tileVariantSeed` per (tile, slot) on position and used sixteen of its
thirty-two bits. `forestTreeAt` spends all four bytes of that same avalanche:
lateral offset, depth offset, **presence**, and **size**. The density itself is
four more hashes and three lerps, once per TILE. Presence is tested BEFORE the
manifest lookup, so an empty slot never pays for a `Map.get` on a string key -
which is why the branch got cheaper and not dearer.

**The slot table is four wide, symmetric, and its bands are still disjoint by
construction.** Centres (-0.26,-0.26), (+0.08,-0.26), (-0.08,+0.26),
(+0.26,+0.26): depth sums -0.52, -0.18, +0.18, +0.52, summing to zero on both
axes so the +5.1 px bias is gone. The depth jitter moves a sum by at most
+-0.12, so the bands are [-0.64,-0.40], [-0.30,-0.06], [+0.06,+0.30] and
[+0.40,+0.64] - disjoint with 0.10 of margin, and D-205's proof that insertion
order IS painter order therefore survives one more slot untouched. **Skipping
a slot preserves the order of the rest**, which is the whole reason a variable
count needed no sorting and no second pass. Containment stays a strict
inequality: 0.26 + 0.17 (lateral jitter) + 0.06 (depth jitter) = 0.49 < 0.5,
and the 576-tile walk still says so. `FOREST_JITTER_DEPTH_TILES` went
0.08 -> 0.06 to buy the fourth band; the total depth footprint still GREW,
18.6 -> 20.4 px of 32, because the centres spread further than the jitter
shrank. Laterally the footprint went 37.1 -> **43.6 px of 64**, and symmetric.

**And every instance is now its own size.** `FOREST_TREE_SCALE_JITTER` = 0.15
is a per-instance multiplier from the fourth hash byte, applied by
`placeBaked`'s new `sizeFactor` - which scales the ground pivot with the
sprite, or a resized cell would stand off its own contact point. A climate
owns three or four bodies in the bake, so without it a wood is built from four
rubber stamps: the temperate family measures 0.45 / 0.58 / 0.73 / 0.88 tile
heights and **nothing in between**. The multiplier turns that four-rung ladder
into a continuum of 0.38-1.01 tile heights **without one new atlas cell**,
which is what a fifth body would have cost (a SPEC2 6.2 booking,
Fehlerkatalog 40). It is bounded above by D-206's rule: the tallest tree lifts
28.0 px at zoom 1, so the tallest one drawable is 32.2 against the 64 px
ceiling, and `staticArt.spec.ts` asserts that headroom against the real
manifest - the baker only ever sees a cell at 1.0, so the RENDERER's
multiplier has to be checked on the render side.

**The tree cells' own size was measured and is RIGHT - no manifest change, no
re-bake.** At zoom 2 the fifteen tree cells are 9-28 px wide and 26-59 px tall
(median 41; the 48 px in circulation was the pre-D-206 bake). What matters is
the lift: **0.375-0.875 tile heights, i.e. 6.0-14.0 m, median 9.3 m** on a
50 m tile with 8 m per height step. The reference is not a preference but the
game's own other tree: `shapes.ts`'s `conifer`, the one inside the Forestry
silhouette, is drawn at **0.53 / 0.69 / 0.81 tile heights** (8.5 / 11.0 /
13.0 m) with radii 0.17-0.22 tile widths. The baked family **straddles** it,
and the size jitter widens the straddle to 0.38-1.01. A tree taller than an
ungrown house (0.55-0.73) and shorter than a grown one (0.89-1.00) is the
right answer, and the whole family sits at 19-50 % of the 2.00 static-art
ceiling. The one residual is WIDTH - baked temperate 0.125-0.172 tile widths
against the procedural conifer's 0.17-0.22 - and it is D-206's named,
unchanged trade: `stretch [1.7, 1, 1.7]` widens the crown and the trunk
together, so the last third of the correction would give every tree a fat
bole. **Named residual, not an oversight.**

**Both render paths ask the same two functions.** `MapView.rebuild` and
`MapView.bakeChunk` each call `forestDensityAt` once per wooded tile and
`forestTreeAt` once per slot, exactly as they already shared
`bakedBuildingHandle` - so the map cannot change appearance as the camera
crosses the 0.5x chunk threshold. The density needs **no `chunkChecksum`
entry**, and that is a property rather than an omission: it is a pure function
of the tile coordinates and cannot change without the map itself changing,
while every layer `isWoodedTile` reads is already in the checksum's full fold
(D-205's rule, unmoved). Determinism is `tileVariantSeed` throughout - no
`Math.random`, no RNG stream, no wall clock (Z3 untouched, Fehlerkatalog
25/39) - so the same tile grows the same wood on every machine, after every
reload, and on both paths.

**It got cheaper, and the placement counts are the evidence.** The render
tripwire's fixture makes every untouched tile woodland, which is the worst
case: the sprite-pool rebuild fell from **14,746 to 13,276 placements**
(-10.0 % overall). The scene has 1,638 wooded tiles, so the TREE share alone
went **4,914 -> 3,444, -29.9 %**, at a local mean of 2.103 - the field has its
own mean over any particular patch, and 2.223 is the figure over a quarter
million tiles. The chunk bake fell from **4,273 to 3,873** (-9.4 %). Timed five times alternating A/B on one
machine to cancel drift: rebuild p50 medians **8.378 -> 7.273 ms** (gate 15,
backstop 60), chunk bake **2.046 -> 1.963 ms** (gate 5, backstop 30). Every
other tripwire unmoved and green on the same runs. **No tripwire was
re-derived** - a bundle that makes a scene smaller does not get to raise its
own gate.

**What did not move.** Not one byte under `src/sim`; `SAVE_VERSION` unchanged,
`SNAPSHOT_LAYOUT_VERSION` unchanged, no migration, no protocol field, no i18n
string, no procedural atlas cell. `tools/assets-manifest.json` was **not
touched**, so the bake is unchanged: re-run twice it reports 145 models -> 10
pages, 2,430 cells, 6,275 KiB and all eleven output files are byte-identical
to each other AND to the files D-206 left on disk (D-160's promise, re-proven
on a bundle that deliberately spent nothing). The SPEC2 6.2 booking stays at
810 cells per zoom. Main bundle **940,159 -> 940,619 B** against the 950,000 B
budget (+460 B, headroom 9,381), measured as two builds of the same tree with
and without the two changed render files.

**The named next lever, deliberately not spent.** `tree:desert` has only three
bodies (two cacti and one thin tree) against four elsewhere, so a desert tile
that fills all four slots must repeat one - `staticArt.spec.ts` asserts the
floor of three per climate and the ceiling is the booking. A fourth desert
body is one model, three zooms, three new cells and a SPEC2 6.2 entry. So is
any per-climate expansion. This bundle bought its variety from geometry and
from a multiplier instead, because those are free.

**What a human still has to confirm by eye**, because the browser pane here
renders no frames (D-136, D-205, D-206). Checkable against a screenshot with
a ruler: a wooded tile carries **nought to four** trees and not always three -
count ten tiles and expect roughly one empty, two with one, three with two,
three with three and one and a half with four; two adjacent wooded tiles do
not show the same arrangement; a wood contains visibly thinner patches and
thicker ones on a scale of about **eight tiles**; no tree stands outside its
own tile diamond; the tallest tree is about **0.9 of a tile diamond's height**
and the shortest about **0.38**, i.e. a range of 2.7:1 rather than the 1.9:1
the four bodies alone gave; and the tallest tree is still shorter than a grown
house. The one JUDGEMENT that cannot be measured from here is the one the
owner has to make: does the countryside now read as woodland rather than as
wallpaper. If it does not, the lever is more BODIES per climate and it costs
a 6.2 booking; the density band and the slot table are two constants away
from any other answer.

## M13 - the static world, bundle 10: what the player builds (2026-08-09)

### D-208 The thirteen station modules leave the orange box: `module:<ModuleKind>` in the bake, an accent-sized company colour, and an audit that makes an unmapped kind a red build

The owner's verdict on the M13 build was that the game does not look modern.
The loudest single reason was measurable: the baked manifest's target prefixes
were exactly **vehicle, building, industry, tree**. Stations, lorry bays,
depots, platforms, quays, canopies, cold stores, terminals and all three
airports - **everything the PLAYER builds** - were never mapped, so all
thirteen `ModuleKind`s fell through `moduleFrame` to one white box drawn at
FULL company tint. On the 16.3 palette that box is `#f08020` at roughly 1,100
opaque pixels a tile: a saturated orange block the size of a house, on the
objects a transport game is looked at through. D-205 wired the bake's other
1,670 cells and never asked about these, for the same reason M13's Fertig-wenn
never asked about buildings - nothing in the repository read the module side of
the manifest, so nothing could be red.

**The mapping is thirteen of thirteen, and the register is below.** Target
grammar `module:<ModuleKindName>`, which is `industry:<TypeName>` one enum
along - `src/sim/station/types.ts`'s `ModuleKind` read backwards by name, so a
fourteenth kind needs no edit in `staticArt.ts` and gets a red build until the
manifest carries a model for it. Measured at zoom 1, `anchorY / TILE_H` in
tile heights and `width / TILE_W` in tile widths, which is what a human can
check against a screenshot:

| module | kit body | lift (th) | width (tw) | accent | night |
| --- | --- | --- | --- | --- | --- |
| BusStop | commercial `detail-awning` | 0.44 | 0.36 | canopy, 77 px | - |
| Canopy | commercial `detail-overhang-wide` | 0.66 | 0.56 | trim, 141 px | - |
| RailPlatform | roads `tile-high` | 0.56 | 0.88 | neutral | - |
| Quay | pirate `structure-platform-dock` | 0.63 | 0.84 | neutral | - |
| RoadDepot | industrial `building-h`\* | 0.88 | 0.58 | door, 21 px | yes |
| ColdStore | industrial `building-q`\* | 0.91 | 0.61 | neutral | yes |
| LorryBay | industrial `building-p` | 0.91 | 0.56 | doors, 39 px | yes |
| RailDepot | industrial `building-j`\* | 1.00 | 0.66 | neutral | - |
| Airstrip | factory `machine` | 1.00 | 0.56 | skirt, 80 px | - |
| Airport | commercial `low-detail-building-wide-a` | 1.03 | 0.72 | neutral | - |
| ShipDepot | watercraft `boat-house-d` | 1.09 | 0.69 | trim, 129 px | yes |
| InternationalAirport | commercial `low-detail-building-wide-b` | 1.19 | 0.75 | neutral | - |
| FreightTerminal | factory `crane` | 1.47 | 0.30 | collar, 4 px | - |

\* an honest reuse under D-169: `building:industrial:0`, `:0:2` and
`industry:ElectronicsFactory` respectively, each with its own `facing`,
`stretch` and (for the cold store) `recolor`, each carrying a manifest note
that names the body it shares. Every lift is inside D-206's **64 px** rule
(2.00 tile heights); the tallest is the freight crane at 47 px. The ladder is
deliberate and is the D-117 argument applied to what the player builds: the
crane is the landmark, the bus shelter the mark, and airstrip < airport <
international airport in BOTH axes so the size a player pays for is visible
without a label.

**What was looked at, and what was rejected.** The kits were inventoried
model by model rather than guessed at, and two guesses in the brief turned out
to be wrong: the **Train Kit carries no station building, no platform and no
shed** - it is locomotives, wagons, trams and track pieces, 103 models, none of
them a station - and the **City Kit Roads carries no bus stop**. What the kits
DO carry, and what was taken: a shop awning that is a bus shelter, a wide
overhang that is a waiting hall, a raised paving slab that is a platform, a
Factory Kit jib crane that is SPEC.md 10's "Kran/Rampe" exactly, a Pirate Kit
timber dock that is literally a berth, a Watercraft Kit covered vessel for the
depot that STANDS ON WATER, a barrel-roofed factory shell that is a hangar, and
two low-detail commercial blocks that are terminals. Rejected after looking:
`city-kit-industrial/building-f` for the cold store (it has a smokestack - a
cold store does not burn anything), the Factory Kit boxes and a Watercraft
Kit container (0.15-0.18 tile widths - specks), and `building-k`'s north-light
hall (that is a factory silhouette and a cold store is not a factory).

**Company colour is an accent, and where it cannot be, the module is neutral
and SAYS so.** The two-pass tint of D-160 does the work: the base cell wears
the kit's own greys, the mask cell carries only the zone, and the zone is a
hue band measured off the model - the awning's green canopy (hue 145-161), the
industrial kit's roller doors (hue 31-39 at saturation 1.00 exactly, against
walls at hue 229/0.11), the Factory Kit's orange trim (hue 30-33), the
commercial kit's dark fascia (hue 228-232 against neutrals at exactly 240).
**Measured per cell, the accent is 4 to 141 opaque pixels** where the box it
replaces was ~1,100, i.e. the loudest module on the screen now carries an
eighth of the saturated area the quietest one used to.

Five kinds carry no zone at all and the manifest note gives the reason for
each: `tile-high` is twelve white triangles (nothing to separate - it is
recoloured to concrete #b8b8b8 instead, 16.3's Beton), the dock is one timber
family, `building-j` and `building-q` have nothing saturated but a shrub and a
plant pot. **The two airports were the interesting case**: their band WAS
written, baked and measured, and it took 42.2 % and 32.3 % of the cell - the
kit body has two colour families and the only separable one is the whole
wrap-around glazing. A 42 % company-coloured terminal is a coloured BUILDING,
which is the defect this entry exists to remove, so the band was deleted and
the note records the measurement rather than the taste. Ownership of a neutral
module is read off the vehicle standing at it and the station label (D-165) -
that is a stated loss against the old full-tint box, not an oversight.

**A static may now choose which way it faces** (`facing` in the manifest,
`baseFacing` in `BakeModelInput`). A vehicle bakes eight cells and its cell
index IS its direction, which is what all of D-170 rests on; a static bakes
ONE, and which way the kit pointed its model is an art fact. At the kit's own
facing the lorry bay's roller doors and the road depot's vehicle portal point
AWAY from the camera and both modules are blank boxes with roofs. The cell
still records `facing: 0` - that is what identifies it as static art to
`STATIC_FACING` - and only the camera moved; a model with no turn bakes
byte-identical files to one that never asked, which is a test.

**Wired the way D-205 wired the industries, and that is not the same thing as
the buildings.** Buildings and trees go INTO the chunk textures; station
modules may not and never did (D-161: they carry the company tint, and a
company recolour must not force a chunk rebake). So the two render paths for a
module are `rebuild` at 1x and up and `rebuildMarkers` at 0.5x, and they are
one function - `placeStations` - which is why "sprite path AND chunk textures"
is satisfied by editing one place. Per module: base pass, mask pass tinted
`companyTint` at the SAME zIndex, and at night the cell's own emissive twin
through `markEmissive` (four of the thirteen bodies carry glazing the depth
pass let through). The per-entry fallback is one variable: `bakedModuleHandle`
answers null and the old `moduleFrame` box is drawn - for a kind on
`PROCEDURAL_ONLY_MODULES`, for a kind the manifest never mapped, and for every
build with no bake at all (E-14's floor, unchanged: the game always starts).

**`PROCEDURAL_ONLY_MODULES` is EMPTY, and that is the mechanism.** The audit
that stops this class of hole recurring is the D-169 both-directions device
applied to modules, in two places: `tests/unit/assetsBake.spec.ts` holds
`tools/assets-manifest.json` against `ModuleKind` (a kind with no model and no
entry on the procedural list is red; a `module:` target the enum does not know
is red; a module entry with no `note` is red; a module entry with no `tint`
must say NEUTRAL in its note), and `tests/unit/staticArt.spec.ts` holds the
same agreement through the functions the renderer actually calls, plus the
proportion and width table over the real bake when one is on disk. Twelve new
assertions; `MODULE_KIND_COUNT` is asserted against the enum so a fourteenth
kind cannot slip in as a hole either.

The proportion rule itself grew one word: `STATIC_TARGET` in
`tools/bake-lib.ts` is `^(building|industry|module|tree):` now, so a terminal
that broke the 64 px headroom would be a FAILED BAKE exactly like D-206's
skyscraper, not a needle at a chunk seam. `assetsBake.spec.ts` proves the
refusal on synthetic geometry with no cache in sight.

**Measured.** Bake: 145 -> **158 models**, 2,430 -> **2,469 cells**, ten pages
unchanged, 6,371 KiB, and **baked twice bit-identically** (all eleven files
hashed, twice, byte-equal). No procedural atlas cell was added, so there is no
SPEC2 6.2 booking - the baked pages are a gitignored build artifact and the
repo-glob test is green. Render tripwires re-run on this tree and all green:
sprite-pool rebuild p50 6.752 / p99 16.222 ms (gates 15 / 60), chunk bake p50
1.726 / p99 8.133 (5 / 30), draw prep 5.09 / 12.17 (10 / 60), E-18 full block
3.94, aspect refresh 0.042, emissive twin walk 0.072, particles 0.486, weather
particles 0.327, flow prep 0.436. Main chunk **942,637 B against the 950,000 B
budget** (headroom 7,363 B); the figure is the artefact as it stands and this
tree carried two other bundles' uncommitted work, so the delta is NOT
attributable to this entry alone and is not claimed to be.
`npm run typecheck`, `npm run lint` and `npx vitest run tests/unit` all green:
**102 files, 1,356 passing** (1,344 before).

**Zero sim contact**: not one byte under `src/sim`, `SAVE_VERSION` untouched,
`SNAPSHOT_LAYOUT_VERSION` untouched, no migration, no protocol field, no i18n
string. Render-only in the strictest sense.

**Not verified, and it says so.** The drawing was not seen running. D-136's
standing note applies unchanged and this session's browser pane rendered no
frames. What WAS seen is every one of the thirteen baked cells, composited
against a 16.3 meadow tile with the tile diamond drawn under it, base pass and
mask pass separately - which is how the accent shares above were measured and
how the two airports' band was caught. What only a human at the running game
can confirm: that a station reads as a station AT PLAY, that thirteen
silhouettes stay apart when they stand four tiles from each other in a real
joined station, and that a neutral platform beside a coloured train is the
right trade.

**What this bundle did NOT do**, so the next one knows: the three airport
sizes are three separate bodies but share no architectural family with each
other beyond the kit; there is no runway art at all (the airstrip is its
hangar, and no Kenney 3D aircraft kit exists - E-14); the freight crane does
not animate; and a joined station's modules are still placed one per tile with
no awareness of their neighbours, so a four-tile platform is four slabs that
happen to abut rather than one modelled platform with ends.

### D-210 A road stop may stand BESIDE the road: the bay, its one spur, the price that is road's own, and no save bump

The owner's sentence was "die depots werden einfach gesetzt, sie sollen nur
neben strassen gebaut werden koennen und sich automatisch an die strasse
anbinden". The code said why: `buildRoadStop` REQUIRED `roadBits[tile] !== 0`
and refused everything else with `NeedsRoad`, so every stop, lorry bay and road
depot in the game stood ON the carriageway - and since D-208 gave each of them
a kit body, that body then covered the road it stood on. A depot is a hall with
doors; a hall in the running lane is the picture the owner was looking at.

**A road stop is now one command with two shapes, decided by the tile the click
lands on.**

- `roadBits[tile] !== 0` - **drive-through stop**. Exactly the previous
  behaviour, write for write: same tile, same price, same map writes. Every
  recorded command log, every balance fixture and the AI replay identically.
- `roadBits[tile] === 0` - **bay**. The tile must be able to carry road and at
  least one orthogonally adjacent tile must carry road the acting company may
  work on. The build lays ONE tile of road on the module tile, connected to
  exactly one neighbour, and charges for it.

**Both shapes stay legal, and the owner's "nur" is deliberately not taken
literally.** Two reasons, and the second is the expensive one. (a) A bus
halting at the kerb IS a bus stop - SPEC.md 10 calls the thing
"Bushaltestelle" and calls the lorry module "Lkw-Ladebucht", a _bay_, which is
the distinction this entry implements rather than invents. (b)
`src/sim/ai/build.ts` plans its roads first and then places `LorryBay`,
`LorryBay`, `RoadDepot` on three of its own road tiles (`plan.from`, `plan.to`,
`plan.depot`). Making the carriageway illegal moves those three module tiles,
and a module tile moves the station centre, and a station centre moves the
catchment (D-095) - so it re-bands scenario 5, `aiGame`, the recorded soak
(hash AND its 800-command recording) and `gameScore` inside the bundle that
introduces a placement rule. **The AI is therefore untouched by this entry and
still parks on the carriageway; that is a named residual with its bill
attached, not an oversight.** What the PLAYER gets is the shape he asked for
plus an interface that leads to it.

**Which neighbour, as a total order and never an iteration order (law #3).**
Candidates are the four orthogonal neighbours that are inside the map, carry
road, and are `TILE_PUBLIC` or the acting company's. The winner is the minimum
of the key

```
(-roadDegree, tileIndex)
```

- **road degree first** (how many of the four `RoadBit`s the neighbour carries)
  so a through carriageway beats another dead-end stub: a bay hung off a stub
  is reachable only by driving down the stub, which is a second bay, not a
  connection.
- **tile index second** - `y * size + x`, a genuine total order over tiles that
  exists whatever order anything is walked in. It resolves North, then West,
  then East, then South, and two tiles can never tie on it. The loop that
  evaluates the key may run in any order; the comparison is the logic.

**What the auto-connect builds is ROAD, not a flag.** `roadBits[bay] |= bit`,
`roadBits[neighbour] |= opposite`, `terrain[bay] = TownGround`, through the
very same `connect()` the road command uses. A connection FLAG was refused: it
would be a second road graph that `net/roadPath.ts`, `net/congestion.ts`,
`net/throughput.ts`, the demolition path and the renderer would each have to
learn, and every one of them already knows what a road bit is. Because the spur
is road, the bay is a road tile of degree one: `RoadPathfinder.find` reaches it
as a TARGET (its guard is `roadBits[toTile] !== 0`) and no route can ever pass
THROUGH it, because a dead end cannot be an interior node of a path.

**The price is road's own price, and the player gets no free road.**
`ROAD_STOP_COST_CT + ROAD_COST_PER_TILE_CT` = 2,000 + 200 = **2,200 EUR** for a
bay stop, `ROAD_DEPOT_COST_CT + ROAD_COST_PER_TILE_CT` = **3,200 EUR** for a bay
depot, the sum put through `world.costCt` ONCE so the century's inflation
applies to the whole bill (D-092). Upkeep the same way: module upkeep +
`ROAD_UPKEEP_PER_TILE_CT`, i.e. 200 + 10 and 300 + 10 EUR a year. A
drive-through stop charges no road, because the road under it was already
bought.

**No save bump, and that is the decision that made this bundle small.** The
obvious `StationModule.spurDirection` field was written down and refused: the
bay's entire persistent footprint is one bit in `map.roadBits`, which is
already serialised, already hashed and already migrated. A saved bay reloads as
a bay by construction; a v30 save written before this bundle is a valid v30
save after it; nothing in the simulation ever asks a module which way it faces,
and the renderer can read the map. `SAVE_VERSION` stays **30**, no migration,
no snapshot byte, no protocol field, no `AiState` field.

**The preview is the command's own planner (D-119's rule, second
application).** `planRoadStop(map, companyId, x, y)` in
`src/sim/net/roadBuilder.ts` answers `{ reasonKey, spurTile, roadTiles }` from
the map alone - the `planTrack` shape - and `buildRoadStop` RUNS it rather than
re-deriving it. The hover handler in `MapCanvas` calls the same function on the
same shared map, draws `[bayTile, spurTile]` through the existing
preview-route overlay (so the player sees which way the driveway will go BEFORE
the click) and prices it with `inflatedCostCt(...)`, exactly as the track
preview does. Preview and bill cannot disagree because there is one planner.
`roadBuildableAt(map, x, y)` moved into the same file for the same reason: it
is the command's own ground test, and the preview has to fail where the build
fails.

**What happens when the road beside a bay is demolished is the state the game
already had.** `demolishRoad` clears the opposite bit on all four neighbours, so
the bay falls to `roadBits === 0` and becomes unreachable - the pathfinder
refuses it as a target, the vehicle gets no route, and the stuck clock of D-186
reports it. Nothing is destroyed and nothing is silently repaired: the bay's OWN
tile still cannot be demolished (`demolishRoad` refuses a tile a module stands
on), and **the repair is the ordinary road tool** - dragging road from the bay
to any street counts the bay as a new tile (`roadBits === 0`) and charges
exactly one road tile for it. An automatic re-attachment on demolition was
refused: it writes on the map outside a command, for free, in a code path the
player did not aim at. The spur's upkeep is not unbooked when the road beside it
goes, for the same reason a module's upkeep is never unbooked - there is no
command in the game that removes a station module.

**A bay can later become a through stop, and that is the player's road.** A drag
across it, or a funded town street laid beside it (`fundRoads` ->
`connectToNeighbours`), can give the tile a second connection. Nothing in the
simulation depends on a bay staying a dead end; the degree-one property is
asserted at the build, which is where it is a rule.

**One new refusal, one re-worded.** `RoadNotYours` (`cmd.reject.roadNotYours`,
de+en) fires when the only road beside the tile belongs to another company -
the concrete obstacle SPEC.md 17.3 asks for instead of the misleading
`NotYours`, which names the tile the player clicked and not the one that
refused him. `NeedsRoad` now says "on a road or beside one" in both catalogues,
because its condition changed. Everything else a bay can fail on is already
named by `roadBuildableAt`: `OutsideMap`, `OnWater`, `Occupied` (an industry or
a house on the tile), `TooSteep`.

**Coupling.** `tests/unit/roadStopBay.spec.ts` holds the planner against the
command in both directions (the preview's price is asserted to be the cash the
company actually loses), holds the choice against build ORDER (the same four
roads laid in two different sequences pick the same neighbour), and walks
`RejectReason` against both translation catalogues - all sixty keys, so a
sixty-first reason with no German string is a red build rather than a screen
that shows `cmd.reject.foo` to a German player.
`tests/determinism/roadStopBay.spec.ts` plays the new command shape twice to
one world hash and takes it through a save, a load and a continue.

**Ledger.** `SAVE_VERSION` **30**, unchanged; `SNAPSHOT_LAYOUT_VERSION`
unchanged; no migration edit; no protocol field; no atlas cell (a bay draws the
D-208 module cell it already had, over the road stub its own spur paints); two
new i18n strings, four re-worded.

**Measured, and the AI evidence is the sharp one.** `npm run typecheck` and
`npm run lint` green; `npx vitest run tests/unit` **104 files, 1,383 passing**;
`npx vitest run tests/determinism` **7 files, 33 passing**, which is the
canonical cross-OS pin and the corpus unmoved; the render tripwires re-run
(`--no-file-parallelism tests/perf/render.perf.spec.ts`, 9 passing - chunk bake
p50 2.079 / p99 7.997 against 5 / 30, particles p50 0.505, emissive walk 0.078,
flow prep 0.515) although this bundle touches no render path; balance:
`busline` payback in year 3 at 21,200 EUR investment, `woodChain`, `taktLine`,
`bankruptcy` and `gameScore` all in band with their desync twins.

**The AI's quarter century is bit-identical with and without this change.**
`npm run test:soak` computes `071cbd7e8db44893` on this tree - and computes
**the same `071cbd7e8db44893`** with the four files of this bundle reverted to
HEAD and rebuilt. The recorded 25-year AI game is therefore provably untouched
by D-210, which is the claim the "both shapes stay legal" decision rests on.
That the pin itself (`65d8cb57cf5edec5`) is red on this tree is NOT this
bundle's: the working copy carried three other workflows' uncommitted changes
under `src/sim` (`cargo/routing.ts`, `constants.ts`, `station/types.ts`), the
A/B above is what separates them, and the fixture the failing run rewrote was
restored rather than committed.

**Main chunk 946,048 B against the 950,000 B budget, headroom 3,952 B**, and
the delta IS attributable this time: the same tree with this bundle's eight
source files reverted builds **942,680 B**, so D-210 costs **+3,368 B** - the
planner, the store slot, the panel block, the hover branch and six catalogue
strings in two languages. `bundleBudget.spec.ts` green. The next bundle that
adds a panel has under four kilobytes and should book a raise with its own
measurement (D-192's rule) rather than assume the room is there.

**What only a human at the running game can confirm.** That a depot beside the
carriageway with a one-tile driveway under it reads better than a depot on the
carriageway; that the green two-tile preview line is legible at zoom 1 against
the road ribbon; and that the D-208 module body, which is baked at ONE facing,
does not look wrong when its driveway comes from the other side. That last one
is the named art residual: a per-instance facing for modules would need four
baked variants per kind and a 6.2 booking, and this bundle did not take it.

### D-211 Gravitation weights the destination, it does not choose it: population times airport size, multiplied onto the network-time split

SPEC2 M19's second bundle. `chooseDestinations` has always split a batch of
cargo between the nearest few reachable stations, weighted by the reciprocal
of the expected journey. For the two passenger classes that weight is now
MULTIPLIED by the mass of the place at the far end - the destination town's
population, times the size of its airport - which is the classic gravity model
of transport planning and the thing that makes a city worth building towards.
No save field, no snapshot byte, no `SAVE_VERSION` bump: the rule is a pure
function of state the world already carries, so the v30 migration of D-207 was
not touched.

**The mass is `GRAVITY_BASE_POPULATION + population`, times `AIRPORT_RUNWAYS`.**
Both halves were chosen so that this rule invents as close to nothing as a
rule can:

- The population is the destination TOWN's, not the share of it a station's
  catchment covers. SPEC2 says "Zielstadt-Population" and it is also the
  honest measure - what makes a city worth travelling to is the city. The
  consequence is stated rather than left to be discovered: two stations
  serving one town each carry that town's whole pull, which is right in the
  same sense that two stops in one city are two ways of reaching that city.
- The floor is a quarter of the smallest town the generator places (the
  village row of `TOWN_START_POPULATION`, so 100 inhabitants). It exists
  because a destination with no town would otherwise weigh nothing, and a
  candidate set that weighs nothing in total has no normalisable split at all.
  Being ADDED rather than substituted, it is also what stops two shrunken
  villages of five and ten inhabitants dividing a town's entire output 1:2.
- The airport multiplier IS `AIRPORT_RUNWAYS` - 1, 2, 4 - because that is the
  game's OWN measure of an airport's size, and an airport is a reason to
  travel that has nothing to do with the town: it is the way off the map. An
  airstrip, at one runway, is therefore worth exactly its town and no more.
  Inventing a second size table beside the one the runway allocator already
  reads would have meant two numbers to keep in step for one idea.

Only `+` and `*` (law #4), no exponent and no logarithm, so the split stays
bit-exact and the distance term keeps the plain 1/(t+1) shape it had. Zero
draws from any RNG stream (Z3): gravity is arithmetic on saved state.

**It weights the candidates; it does not choose them.** The shortlist is still
the nearest `CARGO_DESTINATION_FANOUT` by network time, so a city just outside
the fanout is not pulled into it. That is a stated floor and not an oversight:
SPEC2 words the rule as a weighting ("multiplikativ zur Netzzeit-Gewichtung"),
selection by mass would move every existing passenger flow in the game rather
than re-proportion it, and the fanout exists in the first place to keep the
split legible in the station panel.

**Freight is untouched, and the rescue path proves it rather than promising
it.** `isPassengerClass` gates the multiplication, so an ore batch is weighted
exactly as it was. The one other consumer of the candidate scratch -
`refreshCargoRouting`, which gives a homeless parcel ONE destination - used to
take `candidateIds[0]`, the nearest. It takes the heaviest weight now, which
for freight is provably the same index: without gravity the weights fall as
the costs rise, so the maximum sits at index 0 by construction and a tie keeps
it there. For passengers it is what stops the rescue contradicting the
distribution.

**The cadence is daily, and it is measured rather than assumed.** All three
callers - `refreshCargoRouting`, `produceTownCargo` and `collectIndustryOutput`
- sit inside the `tick % TICKS_PER_DAY` block of `World.step`, and nothing was
added to the per-tick path. `tests/unit/gravity.spec.ts` steps a world one
tick at a time for four game days with the fleet parked and counts the ticks
on which a station's pile moves: exactly four, every one of them on a day
boundary. A second, structural half asserts the two town-side hooks are called
once each and from inside that block.

**What the test controls for.** A destination that is bigger AND nearer is not
evidence of gravity, so the fixture is symmetric: a hub town with a branch
twelve tiles west and twelve tiles east, the buses bought and given orders but
never started, so the two legs keep the identical straight-line seed of D-077
for the whole test instead of drifting apart as trips are measured. Every
gravity claim asserts `expectedTicks(hub, west) === expectedTicks(hub, east)`
before it reads a split. Measured: a town of 2,400 against one of 1,200 at the
same network time takes **1.923** times the passenger flow, which is exactly
the mass ratio 2,500 : 1,300. Two controls on the same geometry say the number
is the population and not the road - with the two towns equal the split is
1.000, and MAIL, a town cargo that is always accepted and is deposited by the
same function in the same daily pass over the same legs, stays 1.000 with the
populations unequal. Negative control run: with the multiplication switched
off, the two gravity claims fail and all seven other assertions stay green.

**The balancing bands of section 19.4 did not move, by construction and then
by measurement.** Those worlds are hand-built with two or three stations, so a
station has exactly ONE reachable destination, the normalisation makes its
weight 1 whatever the mass is, and the rule is a no-op - the D-201 device
again. Measured in a clean worktree at bc88982 plus the three files of this
rule (identical at eed256e, the commit before it): scenario 1 payback year 3, scenario 2 249,980 EUR and payback year 6,
scenario 3 159,516 EUR/yr, scenario 6 month 25, Netzdesign 3.73, takt -8.3 %
and 0.57, Punktzahl 5,889, hard winter in band, scenario 5 road 1,122,965 /
rail 90,230 / expansive 121,328 EUR - every figure identical to the M19
bundle-1 run. Scenario 5 is unmoved for the same reason: its lone AI runs one
line, so its served stations have one candidate each and its nine unserved
stations are unreachable and never candidates. The canonical cross-OS pin
(`40be7d25b1a6a90f`) and the save corpus manifest are unmoved too - the first
because the recorded road fixture is a two-station world, the second because
it decodes files and never steps a simulation.

**Two pins DID move, and both were re-recorded from a tree containing only
this change.** The soak fixture - the recorded twenty-five year AI game - went
`65d8cb57cf5edec5` -> **`071cbd7e8db44893`** at 800 -> **704** commands; its
own replay-twice determinism half stayed green, so what moved is the game and
not the machine. And `aiGame`'s rail value floor failed. Both figures below
were taken back to back in two clean git worktrees at the same commit,
differing only in the three files of this rule - and re-measured unchanged
after D-210 landed, so the table below holds at eed256e and at bc88982 alike:

| company | baseline (bc88982) | with gravity |
| --- | --- | --- |
| Rail | 0 lines, 95 rail, 2 stations, 0 vehicles, **-159,142 EUR** | 1 line, 167 rail, 4 stations, 0 vehicles, **-509,219 EUR**, wound up |
| Road | 1 line, 355 road, 14 stations, 6 vehicles, **550,942 EUR** | 1 line, 345 road, 14 stations, 6 vehicles, **536,615 EUR** |
| TownNetwork | 309 road, 16 stations, **95,788 EUR**, wound up | 309 road, 16 stations, **100,763 EUR**, alive |

The mechanism is the one thing this world has that the balancing worlds do
not: three competitors sharing ONE link graph, so a station is reachable from
another company's stops and multi-candidate splits actually exist. The road
company's bus line therefore carries different traffic, the towns on it grow
at different rates, and the rail company picks a different project out of the
world that results. **The rail company has ZERO vehicles in BOTH runs**, so
this rule cannot have reached one cent of its revenue: the entire difference
is a bigger railway - seventy-two more tiles of track, two more stations, a
line where it had none - bought out of the same capital and the same 300,000
credit line. It is the stagnant husk D-158 names as an open bottleneck in both
runs, and it builds MORE, not less.

**The re-band, and the fact that it is a loosening.** The floor moves from
-250,000 EUR to `-(START_CAPITAL_CT[Normal] + LOAN_MIN_LIMIT_CT)` = -800,000
EUR, which is the company's total exposure: its starting capital plus the
credit line every company can draw whatever its balance sheet says. Below that
line, money came from nowhere. That is the thing every version of the comment
above `VALUE_FLOOR_CT` has claimed the floor was for, and it is the floor now
instead of a number set one and a half times under a chaotic quarter century -
a number that has needed re-banding twice inside one milestone (D-207 moved it
from -150,000 to -250,000) because the shared world keeps reshuffling which
husk dies. A band that moves with every bundle guards nothing. Said plainly:
this is weaker than what it replaces. What the old number caught that an
exposure bound cannot - a personality that stops BUILDING, the D-156
regression - is asserted directly in the same test now, where it can be read:
every competitor that took the field still owns at least two stations and some
way at the end. WHICH competitor is wound up is deliberately not asserted; the
M8 criterion is that at most one is, and that still holds.

Not taken here, and named so nobody has to rediscover them: a station's share
of its own town, a destination just outside the fanout, and the return trips
and the AI's own use of the classes, which are the remaining bundles of M19.

### D-212 The road was drawn along the wrong tile axis and a whole tile long: the ribbon, the round join, and a marking that runs through a boundary

Second item of the owner's verdict on the M13 build: "strassen sind nicht
zusammenhaengend und gleich". Read literally and measured, both halves were
true, and neither was a matter of taste.

**How it was measured, since this is a case where measuring was possible.**
`drawRoadCell` paints into a canvas, so nothing in the suite had ever looked at
what it produces - the atlas is tested as LAYOUT (where a frame sits, how big
the page is) and the drawing was assumed. A probe extracts the function's
source from `TerrainAtlas.ts` at run time (never retyped), transpiles it with
the repo's own esbuild and calls it against a small exact rasteriser: the M13
device for making art testable, one level down. Every number below is pixels
of the shipped cell.

**Defect 1: the four arm vectors were the tile axes TRANSPOSED.** The table
was indexed by `RoadBit` bit position - west, east, north, south - but held
`[-half, +TILE_H/2]` for west, which is the screen direction of y + 1. A bit
towards x - 1 was drawn towards y + 1 and a bit towards y - 1 towards x - 1:
the two ground axes swapped. Measured: a cell with ONLY the west bit set paints
nothing at all at its own west edge midpoint, and the asphalt found at the west
edge midpoint of a west+north cell belongs to the NORTH arm. Five tiles of
straight east-west road, sampled at 201 points along the line between the first
and the last tile centre, are painted at **77 points and bare ground at 124**,
in four runs of 31 consecutive bare samples. That is the "nicht
zusammenhaengend" exactly: a straight road came out as one slab per tile, each
slab running ACROSS the road it belongs to, none of them touching the next.

**Defect 2: every arm was a WHOLE tile step long, not half a step.** Half a
step is the shared edge, which is where this tile's carriageway has to end so
the neighbour's can begin. A whole step reaches the neighbour's CENTRE. The
farthest painted pixel of a one-armed cell sits **82.5 atlas px** from the tile
centre against an arm of 35.8 (the round cap added the rest). Two consequences,
both of them defects on their own: a tile painted a full tile of road surface
into each of its neighbours, so the later tile of a diagonal drew its pale
verge over the earlier tile's asphalt; and the cell painted **6,240 px outside
its own atlas cell across the sixteen columns** (390 px per two-armed cell,
bounding box x -11..138 in a cell 0..127 wide). The base page draws the sixteen
road cells side by side WITHOUT a clip, so those pixels landed in the next
`roadBits` column and travelled to the screen as somebody else's road. The
detail page clips, so the two pages disagreed - the same tile drew differently
at zoom 4.

**Defect 3: the centre line was not a marking.** Because it ran along the
transposed axis it only crossed the true carriageway in passing: over four
tiles the sample line finds **5 dashes of 1.0-2.5 px spaced 70-72 px apart**.
The dash pattern was `[3, 4]` design px restarted at every tile centre, so even
drawn correctly it would have restarted its rhythm at each boundary.

**The cure, three properties of NEIGHBOURING cells rather than of one cell.**

- `ROAD_ARM_OFFSETS` is derived from the 16.1 projection instead of eyeballed:
  a step of (dx, dy) tiles is ((dx - dy) * TILE_W / 2, (dx + dy) * TILE_H / 2)
  on screen, and the table is HALF of that, per `RoadBit` bit position. The
  arm therefore ends on the shared edge and the two halves tile the line
  between two tile centres exactly once.
- Butt caps plus a **disc at the tile centre** in every pass. The disc is the
  round JOIN the arms would otherwise lack: it holds the width constant through
  a bend instead of notching the outside of the corner, it makes three or four
  arms a junction instead of overlapping rectangles, and it is the whole
  surface of an isolated tile - which is what a road stop on a bare tile stands
  on (D-210).
- The marking's dash phase is anchored on a HALF GAP
  (`lineDashOffset = dash + gap / 2`), so the middle of a gap falls on the tile
  centre AND on the shared edge. The rhythm continues through a boundary
  instead of restarting at it, and the kink a bend makes at the tile centre
  sits inside a gap and is invisible. Period = half an arm = a quarter tile =
  12.5 m of ground, painted 4 m of it: the German Leitlinie's ratio.

**`ROAD_SEAM_OVERLAP_PX` is the one place the geometry is deliberately not
exact.** Two butt-capped strokes that meet precisely leave an anti-aliasing
seam - each covers about half the boundary pixel, the two half-coverages
composite to three quarters, and the remaining quarter is ground showing
through as a pale hairline at every tile boundary, which is the fine-grained
version of the very defect this cell was rewritten for. The arms therefore run
2 design px past the edge, one SCREEN pixel at 0.5x (the lowest zoom that still
draws road cells; below it the map is the abstract overview). The overlap is
harmless because both halves are the same colours in the same pass order, so an
overlap repaints exactly what it covers.

**Measured before and after, same probe, same cells:**

| | before | after |
| --- | --- | --- |
| cells reaching the shared edge of every connected direction | 0 of 16 | **16 of 16** |
| painted outside the atlas cell, all 16 cells | 6,240 px | **0 px** |
| samples of the line between two tile centres that are carriageway | 77 of 201 | **201 of 201** |
| carriageway width at the shared edge (designed 16.8) | 0.00 | **16.75-17.50** |
| dashes between two tile centres, start-to-start (designed 17.89) | 5 over four tiles at 70-72 | **4 at 17.5-18.0** |

**The palette moved to 16.3's own hexes** while the file was open: asphalt
`#4c4a48` -> **`#4a4a4d`** ("Straße"), verge `#b7b1a4` -> **`#b8b4ac`**
("Beton"), marking `#d8d2c4` -> `#d5d0c4`. That is also the colour the 0.25x
overview has always stroked (`NET_ROAD_COLOR` = `0x4a4a4d`): the two
representations of the same road agreed on nothing before. A fourth pass adds a
6.6 px camber crown at `#505053` - the asphalt at 1.08, computed once - so the
carriageway is not one flat grey slab under the NW light this project fixes
everything else to.

**Nothing else was transposed, and that is why this survived eleven
milestones.** `extractNetworkSegments` and `rebuildNet` project tile deltas
correctly, so the 0.25x overview drew the road network right while the art drew
it wrong, and the overview is what a screenshot of a whole map shows.
`lampOffsetForRoadTile` is in tile space too - which means the street lamp that
its own comment places "on the verge beside the carriageway" was standing in
the middle of the mis-drawn road, and now stands where the comment says.

**What this does NOT fix: roads on slopes.** `roadFrame` has sixteen cells
keyed by `roadBits` and no slope dimension, and `MapView` places the cell at
`tileToWorld(x, y, map.baseHeight(x, y))` - the tile's LOWEST corner. The cell
is drawn flat. So on a tile with one raised corner the carriageway lies
**8 atlas px (4 world px, 2 m) below the ground surface at the tile centre**
and 16 atlas px (8 world px, 4 m) below it at the raised edge; on a ramp the
two half-arms that meet at a shared edge are a full height step apart -
**16 world px, 8 m** - so the ribbon that is now continuous on the flat still
steps at every boundary where the ground climbs. The road is drawn after the
ground (`DrawLayer.Road` above `DrawLayer.Ground`), so it hides the hillside
rather than sinking into it, which is why this reads as a flat patch pasted on
a slope rather than as a hole. The honest cure is per-arm lift, and it is
COSTED rather than guessed: an arm needs the lift of the edge it crosses (three
values) and of the tile centre (five), which is 4 x 3 x 5 = 60 arm cells plus 5
centre discs, about 8,300 px of atlas width = five more rows. The base page
stands at 3,840 of 4,096 and has 256 px left, and the detail page is full
(D-163), so it needs a new page and therefore a SPEC2 6.2 booking of its own
(Fehlerkatalog 40). Drawing the cell at the tile's MEAN corner height instead
was measured on paper and rejected: on a uniform ramp it halves the error at
the centre and leaves the step at the boundary at a full height step, because
both tiles are wrong by half a level in opposite directions.

**The test is a pixel assertion, and it fails on the old geometry.**
`tests/unit/roadCell.spec.ts` carries its own exact rasteriser (~130 lines, no
anti-aliasing, pixel centres only) and holds nine properties: the `RoadBit`
order the arm table is indexed by, carriageway at the shared edge of every
connected direction AND at none of the unconnected ones, containment inside the
atlas cell, an unbroken carriageway between two neighbouring tile centres, the
width across the boundary, the dash rhythm across the boundary, a filled
junction centre for every three- and four-armed cell, no marking where the road
does not run through, and the surface patch an isolated tile keeps. Patched
back to the pre-fix vectors, **five of the nine fail** - which is the argument
for the file: this defect was one edit away from returning and nothing would
have said so. `ROAD_INK` and `drawRoadCell` are exported for it; classifying
by luminance instead would have passed on a road drawn in the wrong direction.

**Cost.** Zero sim bytes, zero save bump, zero snapshot bytes, zero protocol
fields, zero i18n strings, zero atlas booking - the fix REMOVED spill rather
than adding cells, and the base page stands at 2,176x3,840 and the detail page
at 4,096x4,096 exactly as before. Main chunk **946,301 B** against the 950,000
budget (headroom 3,699 B); the same tree with `TerrainAtlas.ts` reverted builds
946,048 B, so this costs **+253 B**. `npm run typecheck`, `npm run lint`,
`vitest run tests/unit` (105 files, 1,392 tests) and the render perf spec are
green; chunk bake p50 **1.969 ms** against D-209's 1.963 and its 5 ms median
tripwire - a road cell is drawn once into the atlas, so a chunk only blits a
different frame.

**What only a human at the running game can confirm.** That the ribbon reads
as one road at zoom 1 and 2 rather than as a chain of tiles - the numbers say
the pixels are continuous, not that the eye reads them as a road; that the
camber crown is a texture rather than a second faint marking; that the marking
period of 12.5 m is a rhythm rather than a stipple at zoom 0.5; and that a
crossroads reads as a crossroads with the round join rather than as an X. And
the named residual above: every road on sloping ground is still a flat patch,
and on a ramp the ribbon still steps by one height level at each tile boundary.

## M19 - travellers with destinations, bundle 3: return journeys (2026-08-09)

### D-213 A return journey is generated at the destination from a running mean, and a two-counter ledger is what stops demand appearing from nothing

SPEC2 M19's third bundle. Until it landed nobody in Iron Veins ever went home:
a town produced passengers, a vehicle carried them somewhere, and there they
ceased to exist. A line into a works, a quarry or a village that produces
nothing of its own ran back EMPTY every day of its life - which is both a
missing half of the passenger trade and the thing the milestone's own
acceptance sentence measures ("Fluss-Asymmetrie < 30 % auf einer
Pendelstrecke").

**It is generated at the destination out of a twelve-month running mean, kept
D-079's way.** SPEC2 names both halves ("Rueckreise-Erzeugung am Ziel",
"12-Monats-Laufmittel nach D-079-Muster, kein Parcel-Tracking"), and D-079's
reason carries over exactly: what the rule needs is the SIZE of a flow, and a
size is one number. So the ledger keeps one running mean per class rather than
a ring of twelve, a TRUE mean while the window fills and a rolling one
afterwards - and that correction is not decoration here either. Rolled from
zero, a station carrying a full flow from its first day reads 0.65 of it after
a game year and sends home two thirds of the travellers it owes.
`tests/unit/returnJourneys.spec.ts` drives the roll by hand and pins all three
regimes: the first month exact, twelve perfect months at exactly the flow, and
a twelfth of the window per month after that.

**What is averaged is the IMBALANCE, and that is this entry's one real design
decision.** A station's monthly figure is what ARRIVED here minus what the town
here OFFERED of its own accord, per class - not the arrivals alone. Three
things follow, and the first two are why the obvious alternative was refused
rather than merely not chosen:

- **Averaging the arrivals inflates the whole game.** Every arrival would breed
  a return, every return would arrive somewhere and breed another, and the
  closed form of that loop is `1 / (1 - share^2)` times what the towns actually
  produce - 2.3x at a share of 0.75. Balancing scenario 1 is a bus line whose
  payback year is a shipped band; multiplying its traffic by two and then
  re-banding it would have been this bundle rewriting M6's calibration to pay
  for its own mechanism.
- **The imbalance is a no-op on a route that is already balanced.** Two towns
  of the same size each offer about as many travellers as reach them, so the
  mean sits at zero and the emission with it. That is the D-201 device again,
  and it is why the section 19.4 bands are safe by CONSTRUCTION rather than by
  luck. Measured over three game years on exactly that shape: **0.009 % and
  0.003 %** of the traffic at the two ends. Not zero, and the test says why
  instead of rounding it away - a month in which the fleet clears a backlog
  delivers more than the town offered that month, and the mean carries a trace
  of it for the next twelve.
- **A return journey is deliberately NOT counted as a departure.** Counting it
  would turn this into a controller for its own output: the emission would
  cancel the imbalance that produced it and the steady state would settle at
  `share / (1 + share)` of the flow - half of it at a share of 1, whatever the
  constant were set to. It would also make the mechanism regulate the very
  quantity the acceptance criterion measures, which is a worse thing to be
  right about.

**Conservation is a LEDGER, and it is the deliverable of the bundle.** The mean
sets the RATE; two lifetime counters per class set the TOTAL. `Credited` counts
every passenger of that class ever delivered here, `Generated` every return
journey ever created here, and an emission is clamped to their difference. So
`Generated <= Credited` holds at every tick of every world by construction.

The clamp is not belt-and-braces, and this is stated with the number rather
than asserted: **a running mean alone fails conservation by 37 %.** The
starvation test runs a year of real traffic into a stop with no town, stops
every bus, and plays two more years. With the clamp: 1,598 passengers arrived,
1,598 return journeys generated in total, 521 of them after the line was cut -
the pool draining, which is exactly what it is for. With the clamp REMOVED (run
in the tree, not reasoned about): **2,196 generated against 1,598 arrived**,
because the mean of a dead flow decays over twelve months and the sum of that
decay is twelve times the mean. The same negative-control run leaves the
LONG-RUN conservation test green, which is the useful half of the measurement:
on a healthy line the inequality is slack and only the starvation case carries
it.

**The ledger is triangulated against instruments this bundle does not own.**
Asserting `Generated <= Credited` from two counters the same module maintains
would be reading one number twice. So the identity is also checked at a
terminus with no town, where nothing but this rule can put a passenger into the
pile: `Generated` must equal what the M14 history ring saw leave aboard a
vehicle, plus what the ring saw lost there, plus what is still on the platform
- three counters written by `station/history.ts` from the loading, the delivery
and the decay paths. Measured over eleven months (inside the ring's own memory,
so its record is complete): generated 1,072.9 against collected 1,039.1 +
expired 0.0 + waiting 32.9, residue **1.00 unit** against a ring that rounds
each month into an Int32 and can therefore lose half a unit per month and
counter.

**The measured asymmetry is 21.2 % against an ideal of 20 %.** The fixture is a
town of 400 and a stop fourteen tiles away in open country with no town at all,
four buses, three game years, measured over the ring's last twelve months:
1,799 passengers out, 1,417 back. The baseline needs no measurement - the far
stop has no town, so `produceTownCargo` never offers it a traveller and every
journey back was zero before this bundle. Two things the test guards so the
number means what it says: it asserts the queues at both ends stay small,
because a capacity-bound line evens out in both directions for reasons that
have nothing to do with return journeys; and the 30 % is SPEC2's own figure,
not one derived from this run.

**`RETURN_TRIP_SHARE` = 0.8 is set from the closed form, not from the run.**
With a pure destination at one end the steady state carries `share` of the
outbound flow back, so the asymmetry settles at `1 - share`; SPEC2 asks for
under 30 %, which needs a share above 0.7, and 0.8 puts the ideal at 20 % with
ten points left for what the closed form leaves out - the twelve-month lag,
decay at the platform, and a line without the capacity to carry everybody home.
The measured 21.2 % is what those ten points cost in practice, and it was
measured AFTER the constant was chosen and not the other way round. The
remaining fifth are the journeys that are genuinely one way: people who moved,
who arrived to stay, or who travelled on by some means the game does not carry.
It must stay strictly below 1 - at 1 a two-station loop sustains itself for
ever once its source dries up, which conservation permits (nothing is invented)
but which is traffic with no origin.

**No parcel is followed, and a return goes wherever a traveller would go.** The
emission is deposited through the same `chooseDestinations` split as everything
else - nearest few by network time, weighted by D-211's gravity - so on a
shuttle it goes back the way it came because that is the only destination, and
on a network it fans out. The one thing `depositReturns` does differently from
the town's own deposit is REFUSE when the network offers no destination at all:
a town's passengers with nowhere to go are a real grievance and wait until they
are written off, but a return journey with nowhere to go is a journey nobody
sets out on, and inventing one would rot at the platform and pull down the
rating of a station whose only fault is that its line was cut. The credit stays
in the ledger for the day the line comes back. What is DEBITED is what was
offered rather than what the platform had room for - a traveller turned away
still set out, and the refusal is booked as this station's overflow by the same
`placeDeposit` that books the town's own.

**Save: the migration is EXTENDED IN PLACE, not bumped (Z5).** M19's one bump
is v30 and D-207 spent it. Every station gains eight Float64 figures plus a
month count, all saved and all hashed - a twelve-month mean is a historical
input to a simulation decision, so it is save state and not derived (Z4,
Fehlerkatalog 23). They join the LIVE digest as well as the full one, unlike
the M14 ring beside them: eight numbers rather than seven hundred, and two of
them move on every passenger delivery, which is the cadence the live digest
already pays for in the waiting stacks. `v29_to_v30` enters the ledger EMPTY,
which is what a v29 world knew about itself - it generated no return journeys
and banked no credit for any, because the measurement did not exist while its
travellers were arriving. A ledger that is already the current shape is left
alone (the `growCargoRow` rule), so the corpus trick of wrapping a current
state in an old header cannot wipe a real one. `RETURN_STATE_SIZE_V30` is
pinned in the migration file for D-207's own reason - a migration writes the
shape of ITS target version - and the other end of that rule is a test that
migrates a v29 station and holds the result against the LIVE constant, so the
milestone that adds a third class is told to write a v30 -> v31 growth instead
of silently moving this migration's target. (D-207's comment claims
`tests/unit/save.spec.ts` does that for the v29 sizes. It does not; the claim
was never true. This bundle wrote the test it needed rather than repeating it.)

**Two of D-207's claims were qualified rather than left to fail quietly**, and
this is the honest part of the save story. Its round-trip test reconstructs the
v29 encoder and asserts losslessness; its sibling asserts that a v29 container
loads into the identical world. Neither can be true of a field v29 had no way
to carry - not a renamed field and not a grown row, but a measurement that did
not exist. Both now assert FIRST that the played world's ledger is non-empty,
and then exclude exactly it and compare everything else field for field and
hash for hash. The exclusion can therefore never become vacuous, which is what
makes it a qualification rather than a weakening.

**Pins: one moved, one provably did not.** The canonical cross-OS hash
`40be7d25b1a6a90f` -> **`f04cebfeb26e8161`** (D-137 protocol, re-recorded in a
clean worktree carrying only this change), because the recorded road fixture is
a two-station world and eight new hashed figures per station reach the digest
whatever their value. The save corpus manifest `9800c136644b0199` is
UNCHANGED, and not by luck: the corpus game is station-less by construction, so
the station loop of `hashWorld` contributes nothing to it - all nine fixtures
still decode into one world (D-130), verified by running. The soak fixture -
the recorded twenty-five year AI game - went `071cbd7e8db44893` ->
**`856392bde0cd79bf`** at 704 -> **698** commands, re-recorded from the same
worktree; its own self-consistency half (the recording decoded from its own
bytes and re-simulated to every hash it committed to, sixteen checkpoints)
stayed green, so what moved is the game and not the machine.

**The 19.4 bands, measured in the same worktree.** Every hand-built world is
unmoved to the digit: scenario 1 payback **year 3**, scenario 2 249,980 EUR and
payback **year 6**, scenario 3 **159,516 EUR/yr**, scenario 6 month **25**,
Netzdesign **3.73** (alignment 2.01x, capacity 1.86x), takt **-8.3 %** and
delivery-rating ratio **0.57**, hard winter **-4.36 %**, Punktzahl **5,889**
with the identical 36/26/24/13 split. That is the D-201 device paying off:
those worlds are two or three stations of matched towns, so the imbalance the
mean averages never turns positive.

What moved is what always moves - the worlds where three companies share one
link graph and a station can be reached from a competitor's stop. `aiGame`
stays green with the same shape (one line, 345 road, 14 stations, six vehicles
for the road personality, 538,469 EUR against D-211's 536,615; the rail husk
20,792 EUR against -509,219, i.e. it survives this time instead of being wound
up - which is the reshuffling D-211 re-banded the floor FOR, and the floor
holds). Scenario 5's road personality measures **978,528 EUR** against D-211's
1,122,965 (-12.9 %), deep inside D-158's 0.8-3.2 M band; rail 90,230 and
expansive 121,328 are unchanged to the euro, because those two companies own
zero and one vehicle and carry almost no passengers.

**Bundle.** Measured in a clean git worktree at c1a5b93 carrying only this
change, built twice: baseline **946,301 B**, with this bundle **946,425 B** -
**+124 B** against the 950,000 B budget, leaving 3,575 B. The shared working
tree measures 950,612 B and is over budget, and that is NOT this bundle: it
carries a concurrent session's uncommitted render files, which is precisely why
the number above was taken in isolation.

**Tick: no acceptance number is claimed, and the reason is measured rather
than asserted.** D-207's and D-211's finding still holds - the perf gate is red
on the BASELINE commit on this machine, because other agents are building and
baking on it throughout. Two alternating A/B pairs in the same worktree, the
only difference being this change: mine **3.192 / 10.375** and **3.551 /
11.256** ms p50/p99, baseline **3.313 / 10.703** and **3.615 / 10.141**. Mean
p50 3.372 against 3.464 - this build measures **0.09 ms FASTER**, i.e. the
change has no measurable p50 cost - and mean p99 +0.39 ms with the sign
flipping across the pairs (pair one measures this build 0.33 ms faster). Both
sides sit at 3.2-3.6 ms p50 against the 1.43-1.45 ms reference, so the box is
loaded by a factor of about 2.3 and p99 is exactly the quantity D-167
describes as inflated by multiples under load. **The clean acceptance
measurement of the M19 row is still outstanding** and belongs to whoever takes
it.

What the bundle actually adds per tick is stated instead of estimated: NOTHING
per tick. One extra O(stations) walk per game DAY that reads eight Float64s per
station and returns early - a station owing no journey never reaches
`chooseDestinations`, which is what keeps a freight-heavy map at the cost of
the walk alone - plus one destination search per EMITTING station, the same
search `produceTownCargo` has always made for a station with a town. Per game
MONTH, one more walk of four multiply-adds per station. Both measured
allocation-free with the M17 `GCProfiler` instrument: **0.864 B per game month**
for the roll against a 233 B allocating control that proves the instrument can
see one, and **0.152 B per game day** for the emission where nothing is owed.

**What this bundle did NOT do**, so the next one knows: the AI still rates a
town pair by the commuter class alone and knows nothing about return traffic
when it sizes a fleet, which is M19's remaining bundle. No panel shows the
ledger - a station's return traffic is visible only as cargo in the pile and in
the M14 flow atlas. And a station's return journeys are split by gravity like
anything else, so a traveller can be sent "home" to a third town that is bigger
than the one he came from; that is the price of not tracking parcels, it is
stated rather than hidden, and it is the same trade D-211 made when it weighted
destinations without choosing them.

### D-214 The ground stops being a polygon: one light, a fold per slope, a grain per terrain, and no seam

The third item of the owner's verdict - "das sieht doch nicht gut aus" - is the
surface everything else stands on. Measured on the default temperate 1024 map
(seed 4,711, the world D-209 counted its forest on) before anything moved:

- `drawTerrainCell` put down **three flat fills and 22 identical speckles**.
  A cell is keyed by (terrain, slope) and by nothing else, so **630,421 flat
  land tiles - 85.5 % of the land** - drew the same pixels. Grass is 25.66 % of
  the map, rock 18.57 %, forest 16.50 %, field 3.88 %, water 29.68 %, town
  ground 1.09 %, snow 3.48 %, coast 0.69 %, marsh 0.45 %, desert 0.00 %.
- The visible surface of a flat tile carried **two** distinct values: the base
  tone and a speckle at 0.89 of it over 2.1 % of the diamond.
- **The top face's light was inverted against the very skirt drawn under it.**
  `1 + tilt * 0.07` with `tilt = W + N - E - S` drew a ramp descending towards
  the north-west - towards the light the skirt factors 0.62/0.76 place - at
  **0.86, its darkest**, and the ramp turned away from it at 1.14, its
  brightest. The two DIAGONAL slopes counted `tilt = 0` and were drawn in
  exactly the colour of flat ground, so sixteen shapes shared five values.
- **Neighbouring diamonds abutted with no overlap.** Each covers about half of
  every boundary pixel, source-over composites the two half-coverages to three
  quarters, and the last quarter is background: a lattice of hairlines at every
  tile edge, over the whole map. It is `ROAD_SEAM_OVERLAP_PX`'s arithmetic
  (D-212) one layer down, and nothing had ever asked the question here.

**The palette was audited and NOT changed.** All eight terrain tones SPEC.md
16.3 fixes are in `TERRAIN_COLORS` exactly (`#6f9b58` Wiese, `#b09a4e` Acker,
`#3f6b3a` Wald, `#8a8578` Fels, `#e8eef2` Schnee, `#d6bc86` Wüste, `#4a86a8`
Wasser flach, `#5a6b4a` Moor) plus `WATER_DEEP` `#2c5a78`. Two of the ten
terrains are not in 16.3 at all and the test now says so rather than leaving it
to be discovered: **Coast `#cbb682` is an invention** with no entry in the
palette, and **town ground `#b8b4ac` is 16.3's INFRA tone "Beton"** - which is
why a town's made ground and a road's kerb are the same grey by construction.
Everything this bundle adds is a VALUE multiplied onto one of those hexes;
nothing invents a hue.

**The light is solved from the artwork, not proposed.** A wall facing screen-SE
has the tile-space normal (1,0,0) and has been drawn at 0.62 since M1; one
facing screen-SW is (0,1,0) at 0.76; flat ground is (0,0,1) at 1.00. Under
`ambient + diffuse * (n . L)` those are three equations in three unknowns with
exactly one solution, and its **y component comes out zero** - the light the
shipped skirts always implied is fixed north-west and nothing else.
`GROUND_LIGHT` is that vector, `(-0.5039, 0, 0.8638)`, computed from the three
shades rather than written down beside them.

**A slope is two triangles.** A quad with three corners at one level and one at
another is not planar, so drawing it as one polygon was drawing a surface that
does not exist. The fold runs along the HIGHER diagonal, which is what makes a
saddle read as a ridge instead of a gully, and each half is lit by its own
normal. The top response is re-anchored on the artwork it replaces - flat stays
exactly 1.00, the steepest one-level ramp turned away stays exactly 0.86 - so
the CONTRAST is unchanged and only the direction and the resolution move.
Measured: **14 distinct (fold, shade, shade) signatures for the sixteen slopes
against five values**, range **0.8385 .. 1.0650** against 0.86 .. 1.14. The two
signatures that still coincide differ in SHAPE - which corner is low - and
shape is the information (D-117). One height step is measured against the tile
AS DRAWN (`HEIGHT_PX / hypot(TILE_W/2, TILE_H/2)` = 0.4472 tile edges), never
against the simulation's 8 m over 50 m: the shading has to agree with the
picture.

**The seam is closed by geometry and proved by geometry.** Every face and every
skirt is offset outwards by `GROUND_SEAM_BLEED_PX` = **0.75 design px** - which
IS 0.75 screen px at the zoom each atlas page is drawn for, against the half a
pixel a boundary pixel needs to be covered whole by one of its two neighbours.
Two things about how were found the hard way. The offset is **mitred per edge,
not scaled from the centroid** (a radial scale leaves two thirds of every edge
under-covered), and a **sliver corner is bevelled rather than collapsed**: the
two triangles of a folded slope meet at 14 degrees, where the miter would be
twenty-five times the bleed, and the first draft's clamp collapsed it - measured
as **half the asked-for seal along the north-east edge of every east-raised
slope**. The bled polygon is then **clipped** to the box both pages reserve
(one height step above the north corner, one below the south) with
Sutherland-Hodgman, because clamping the corner VERTEX drags its two edges
inwards with it. Measured after: **0 px painted outside the box on all sixteen
slopes**, and over **10,000 samples** along the four edges of all sixteen
slopes - every 2 % of each edge, eight steps out to the full bleed - every one
covered. The box matters because the detail page clips each cell to its frame
and the base page does not: a bleed that overran would draw one picture at zoom
4 and another at zoom 1, which is the 6,240 px D-212 measured.

**A grain per terrain, and it made the cell CHEAPER.** Seven kinds, one per
terrain and none of them a new hue: tufts leaning against the light (grass,
marsh), ploughed furrows along the tile's +x axis (farmland), angular scree
chips with lit top edges (rock, coast), coarse canopy mottle (forest), shallow
drift ripples (snow, desert), a faint joint grid (town ground), and the old
speckle for the water row nothing draws from. Every mark rides the BILINEAR
tile surface through `groundSurfacePoint`, so a furrow climbs a hillside
instead of floating across it, and every ink is the FACE colour times a value
factor, so the seasonal repaint inherits the grain for free. The cell is
clipped to its own face, so a mark that overshoots costs a clipped pixel and
never a wrong one. **Each grain is batched into one path per ink**, and that is
the whole cost story: a terrain cell drew **25** paint operations before this
bundle and draws **4 to 10** now, a whole page of terrain **4,000 -> 1,100**,
while the artwork grew. `tests/unit/groundCell.spec.ts` holds a booked ceiling
of 16 with a counting context, because the wall-clock atlas budget
(`ATLAS_BUILD_BUDGET_MS` = 250, measured 20 ms base + 50 ms detail) can only be
timed in a browser - the README's own procedure - and `MapView.attach` already
warns on the console when it is crossed.

**The per-tile variance is a TINT, and that is a decision.** The page has one
cell per (terrain, slope) and **256 px of the 4,096 px guarantee left** (D-163
leaves the detail page full), so a variant dimension would cost a new page and
a SPEC2 6.2 booking; a grey tint is a batcher uniform the ground sprites were
already paying for and it multiplies, so the 16.3 hue survives exactly.
`groundValueFactor` draws from the SAME `tileVariantSeed` avalanche as the
building body, the tree body and the tree jitter (D-205/D-209) under its own
salt - no new hashing, no RNG stream, no `Math.random`. Bounded to **1 ± 0.04**
by construction; measured over 40,000 tiles **0.9600 .. 1.0400, mean 0.99995**,
so a plain does not drift off its tone as a whole. It is a pure function of
(x, y) and therefore never changes, which is why **no chunk checksum had to
learn about it** and both render paths - live sprites and the chunk bake - set
it in the pass they already ran.

**Water gets the geometry and NOT the tint.** It is 29.68 % of a default map
and the hairline lattice was just as visible on it, so `drawWaterCell` takes the
same two-triangle split and the same bleed. It keeps its own tint for the two
16.3 tones (D-164), so a second tint would break "white multiplies to the exact
hex"; its variance is the ripples it already has. Its grain rides the surface
now and is clipped to the diamond rather than kept inside it by a placement
formula - a wide ripple near the east corner was the one thing that formula
could not hold.

**The baked contact shadows were VERIFIED in the pixels, not believed.** Read
out of `atlas-z1-p0.png` against the manifest: every family carries pure black
at alpha <= `SHADOW_ALPHA_MAX` (88) exactly where D-170 says - buildings
14-19 px (1.6-2.4 % of the cell), industries 13-46 px, modules 43-80 px, trees
23-42 px, vehicles 91-96 px. So the bake needs nothing. What has NO shadow is
the **procedural fallback**, which is the E-14 floor every game starts on and
which draws `CoalMine`, `OilWell` and `Farm` in EVERY game by name (D-205).
`contactShadow` in `shapes.ts` closes that: two diamonds rather than a radial
gradient, because the falloff has to run from the FOOTPRINT outwards - the
lesson D-170 paid for when its centre-based ellipse produced nothing. It is on
the six town cells and the seventeen industry cells and deliberately **not** on
the `BOX_SPRITES`, which take the company colour as a sprite tint and would
multiply a black patch into a coloured one. The industry patch is a **YARD**
(0.62 x 0.56 tiles) and says so: every composition in `industryArt.ts` draws its
mass inside 0.8 tiles and three already lay a 0.72 x 0.6 pad, so one honest
patch beats seventeen guessed silhouettes - the per-model silhouette is the
bake's job.

**Cost.** Zero sim bytes, zero save bump, zero snapshot bytes, zero protocol
fields, zero i18n strings, **zero atlas booking** - not one new cell, both pages
stand at 2,176x3,840 and 4,096x4,096 exactly as before. Main chunk **951,284 B**
on the working tree; reverting exactly the four render files in place and
rebuilding gives **946,425 B**, so this bundle weighs **+4,859 B** and the
budget is raised to 956,000 with that measurement beside it (D-192's rule).
Render tripwires, three interleaved runs: sprite-pool rebuild p50 **7.33-8.05
ms** against D-209's 7.273 and a 15 ms median tripwire, chunk bake p50
**2.08-2.15 ms** against D-209's 1.963 / D-212's 1.969 and a 5 ms tripwire -
the delta is the per-tile tint, which the perf proxies now run so it cannot be
measured out of existence. `npm run typecheck`, `npm run lint`,
`vitest run tests/unit` and `tests/perf/render.perf.spec.ts` are green.

**What only a human at the running game can confirm.** That a grass plain reads
as ground rather than as one painted surface; that 4 % of value is variance and
not a checkerboard; that the furrows read as farmland at zoom 1 and not as
stripes at zoom 0.5; that the grain does not turn to noise when the base page
is minified 2:1; that a hillside now reads as lit from the upper left; and that
the atlas still builds inside its 250 ms - the operation count fell, but only a
browser rasterises. Two residuals are named rather than hidden: the grain is
per (terrain, slope) and therefore REPEATS - at zoom 4 the same tufts stand on
every grass tile, and only the tint tells two tiles apart - and water carries no
value variance at all by the D-164 argument above.

---

## M19 - travellers with destinations, bundle 4: the close (2026-08-09)

### D-215 Scenario 1 re-measured: the band held, and the one sentence the re-measurement broke

SPEC2 M19's MUSS list ends with "Balance: Szenario 1 (Buslinie) neu vermessen -
die Split-Konstanten gehoeren den Tests", and its Fertig-wenn ends with
"Balance-Szenario 1 im Band bleibt". This bundle is that measurement and
nothing else: **no constant moved, no band moved, and no file under `src/`
changed except one comment that was not true.**

**Scenario 1 is the ONLY 19.4 world M19 could reach.** The other four
hand-built worlds haul coal, planks and furniture; `passengerClassIndex`
answers -1 for every cargo on them, so the class split, the gravitation and the
return ledger are all dead code there. That is not an argument, it is why
scenarios 2, 3, 4 and 6 come back to the euro below.

**The band holds, comfortably: payback in game year 3 of a 2-4 year band.**
Investment 21,200 EUR against a start capital of 500,000; balances by year
485,738 / 494,144 / **501,718** / 509,262 / 515,863 / 520,024 EUR. Payback is
the first year end at or above 500,000 and year three clears it by 1,718 EUR.

**But the run is NOT identical to the pre-M19 run, and the bisect says which
bundle did it.** Measured in a git worktree at four commits, same box, same
hour:

| build | balances by year (EUR) | payback |
| --- | --- | --- |
| pre-M19 (`5b0758a`) | 485,738 / 494,144 / 501,492 / 509,855 / 518,409 / 522,655 | year 3 |
| M19 B1, the classes (`158d877`) | identical to the row above | year 3 |
| M19 B2, gravitation (`c1a5b93`) | identical to the row above | year 3 |
| M19 B3, return journeys (`1fc78da`) | 485,738 / 494,144 / 501,718 / 509,262 / 515,863 / 520,024 | year 3 |

So **D-207 and D-211 are inert on this scenario to the digit** - exactly what
both entries claimed - and **D-213 is not**, which is exactly what it claimed to
be.

**Why the two inert bundles really are inert, checked rather than repeated.**
`placeTown` writes `BuildingKind.Residential` and nothing else, so every stop
here is 100 % residential: `commercialShare` is 0 at both stations, not one
`BusinessPax` unit is ever produced, carried or delivered, and the retired
`Cargo.Passengers` id is delivered zero times. The commuter row IS the retired
row (D-207), so the fare M6 calibrated is unmoved. Gravitation normalises over
a candidate set that has exactly one member here, so the mass cancels. All of
that is now asserted in `tests/balance/busline.spec.ts` rather than reasoned
about, together with a positive control - the commuter trade must be non-empty
- so the three zeroes can never go vacuous by the line simply carrying nobody.

**What D-213 costs this line, measured.** Six-year net profit 22,655 ->
**20,024 EUR**, i.e. **-11.6 %**; vehicle revenue 9,473 -> **9,035 EUR/year**
(**-4.6 %**) at an upkeep of 1,760 EUR/year in both builds. The year the band
actually reads got SAFER, not tighter: year three clears the payback line by
1,718 EUR against 1,492 before.

**And the return traffic itself is far too small to have paid for that, which
is the finding.** The ledger after six years:

| station | mean (units/month) | credited arrivals | return journeys | share |
| --- | --- | --- | --- | --- |
| Westheim | -5.551 | 32,519.40 | 36.68 | **0.113 %** |
| Ostheim | +7.326 | 32,683.96 | 45.30 | **0.139 %** |

Business class: exactly zero in every slot of both. Eighty-two units of return
traffic against 65,203 arrivals. At the line's own ~0.85 EUR per delivered unit
those eighty-two units are worth about **70 EUR** of gross revenue over six
years, against a swing of **2,631 EUR** - a factor of 37 - and their sign is
wrong for a deficit anyway, because a return journey ADDS a fare rather than
removing one. **The deficit is therefore not the return journeys' economics; it
is two buses re-phased.** The visible half of that: Ostheim goes from 2 to 3
visits per 20 days, its rating from 54 to 59 and its queue from 309 to 161
units, while Westheim's rating stays 57 and its queue moves 309 -> 286. A
two-bus line whose station rating gates the town's own offer over a 20-day
window is a feedback loop, and D-203 measured the same chaos on one coal train.

**No re-band, and that is the point.** The rule of this project is that a
balancing test owns its constants; the corollary nobody writes down is that a
test which is still IN ITS BAND owns nothing that needs changing. Scenario 1 is
in band on the same payback year it has held since M2, with more margin in the
year that decides it than before. `RETURN_TRIP_SHARE` stays 0.8, the commuter
and business rows stay where D-207 put them, and the 2-4 year band stays what
SPEC.md 19.4 wrote. **Nothing here rests on a re-band, so nothing here needs a
bracketed SPEC2 note** (contrast D-158, D-204).

**One shipped sentence WAS false and is corrected.** `src/sim/station/returns.ts`
said, of the imbalance mean:

> a station whose town already sends out as many travellers as arrive generates
> NOTHING. Both stations of balancing scenario 1 are exactly that, so the bands
> of section 19.4 are untouched by construction and not merely by measurement

The second sentence is not true and the third does not follow. Both stations
generate; the bands are untouched by MEASUREMENT, with margin. Two reasons, and
D-213 already knew the second one without applying it here: the two towns are
equal in POPULATION but the two stops are not equal in CATCHMENT (16 buildings
against 22), and a mean taken over a MONTH cannot be zero on a line whose fleet
clears a backlog in one month and falls behind in the next, whatever the two
ends offer over a year. D-213's own test measured 0.009 % on a deliberately
symmetric fixture and the conclusion was carried across to a world that is not
symmetric; the measured share here is 13-15 times that.

**The correction is a bound, not a better adjective.** `busline.spec.ts` now
asserts the return share from both sides - strictly positive, so no future
reader may re-derive "inert" from a green build, and under a 1 % tripwire, so a
rule change that turns this line's return traffic into a real share of its
business is a red build. The ceiling was read off this very run and the file
says so in those words: measured 0.113 %/0.139 %, guarded at 1 %, on D-167's
rule that a guard catches a regression of MULTIPLES rather than pinning a
digit. The comment in `returns.ts` carries the measurement and the retraction.

**Both new guards were falsified in the real source and the red build watched**
(D-198's discipline). Dropping the ceiling to 0.1 % fails with "Westheim return
share: expected 0.001127886687557964 to be less than 0.001" - the assertion
reads the ledger this entry quotes, to the digit. Pointing the business-is-zero
assertion at `CommuterPax` instead fails with 210.01 units waiting, so the three
zeroes are a fact about the world and not a lookup that finds nothing. Both were
reverted.

**Everything else M19 could have moved, re-run rather than quoted.**

- **The eight M17 scenarios hash-identically**: `tests/determinism/scenarios.spec.ts`
  green, all eleven tests, including the save-and-load in the middle of one.
- **Their briefing and place-name guards hold**: `tests/unit/shippedScenarios.spec.ts`
  green, 53 tests - `SCENARIO_WORLD_CLAIMS` (D-197), `SCENARIO_BRIEFING_FIGURES`
  (D-198) and `briefingTowns` (D-199) all still true of the worlds the seeds
  make, and no shipped goal decides itself in a year of doing nothing.
- **The M18 band holds to the digit**: hard winter **-4.36 %** (3,510,797 EUR
  off against 3,357,840 harsh), per-seed 1.48-6.31 %, breakdowns +32.90 % in
  Dec/Jan/Feb against +7.31 % in the other nine months, mean speed -4.94 %
  against -2.97 % - D-204's numbers, re-measured, not copied.
- **D-118 is green for both classes**: `deliveries.spec.ts` walks the chain
  table, holds the commuter row against the retired row field for field, proves
  business is 1.6x the fare at twice the decay beyond the same grace period,
  and proves nothing carries the retired id.
- **Draw-count invariance is untouched** (Z3): weather leaves the gameplay
  stream in the identical state after a game month with the rule harsh and with
  it off, and the instrumented count is unchanged - 512 reliable vehicles spend
  exactly 512 words under all five skies, breakdowns clear 69 / rain 83 / storm
  109 / frost 124 / heat 105, which is D-201's table to the unit. M19 added no
  stochastic system at all: gravitation and return journeys use `+ - * /` only
  and draw nothing.
- **The rest of 19.4 and the shared worlds**: scenario 2 249,980 EUR and
  payback year 6, scenario 3 159,516 EUR/yr, scenario 4 bankrupt in band,
  scenario 6 month 25, Netzdesign 3.73 (alignment 2.01x, capacity 1.86x), takt
  -8.3 % and 0.57, Punktzahl 5,889 with the 36/26/24/13 split and the dogleg
  control at 7.8 % against 19.8 % (factor 2.55), scenario 5 road 978,528 / rail
  90,230 / expansive 121,328 EUR, `aiGame` 538,469 / 101,636 / 20,792 EUR. All
  twelve balance files green, every desync twin included.

**Tick: no acceptance number, and this time the control prices the WHOLE
milestone.** D-207, D-211 and D-213 each declined an acceptance figure because
the perf gate was red on their baseline commit too. It still is, and the box
still says why: eighteen `node` processes carrying 16,146 s of accumulated CPU
while these runs were taken. Two interleaved pairs, the two sides being all of
M19 against NONE of it (`5b0758a`, the commit before D-207):

| | p50 | p99 |
| --- | --- | --- |
| M19 complete | 3.446 / 3.705 ms | 28.896 / 10.700 ms |
| pre-M19 | 3.594 / 3.496 ms | 15.924 / 9.829 ms |

Mean p50 3.576 against 3.545 - **+0.031 ms for the entire milestone** against
the ledger's +0.10 ms budget line - and a p99 that scatters 9.8-28.9 ms with
the sign flipping, which is the quantity D-167 describes as inflated by
multiples under load. Both sides FAIL the 8 ms gate and both sit at 3.4-3.7 ms
p50 against the 1.43-1.45 ms reference, so the gate's redness is the machine.
**The M19 row in 6.1.1 therefore stands with these figures and says in its own
words that they are not an acceptance measurement**; the clean-machine run is
the one thing this milestone leaves owed, and it is named rather than
manufactured.

**Cost.** Zero sim behaviour, zero constants, zero save bump, zero migration
edit, zero snapshot bytes, zero protocol fields, zero atlas cells, zero i18n
strings, zero RNG draws. The only file under `src/` is a comment. Every pin is
where D-213 left it - canonical `f04cebfeb26e8161`, corpus manifest
`9800c136644b0199`, soak `856392bde0cd79bf` - because nothing hashed moved.
Main chunk **951,284 B**, the digit D-214 measured an hour earlier, against its
956,000 B budget: a comment does not survive minification and a spec file was
never in the bundle, so **+0 B**, measured rather than assumed. `npm run
typecheck`, `npm run lint` and `npm run build` clean; 127 test files and 1,533
tests green. The perf suite is the documented exception above.

---

## Towns: a street exists for something (2026-08-09)

### D-216 A town is laid out for the houses it has, not for the radius of its size class

The owner looked at a generated town and said "es haengt immer noch alles
zusammen, strassen durch haeuser usw, das sieht doch nicht echt aus". The
report that came with it named a checkerboard of isolated concrete diamonds.
**That diagnosis was measured first and it is wrong**; what is wrong with a
town is something else, and it is much larger.

**Measured before anything was touched** - five seeds, 200 towns, 256 tiles,
temperate, the same erosion the unit fixtures use:

| | before | after |
| --- | --- | --- |
| town road tiles | 9,962 | **4,359** (-56.2 %) |
| road tiles with one connection | 1,095 (11.0 %) | 866 (19.9 %) |
| **of those, serving nothing** | **1,013** | **0** |
| road tiles touching no building | 6,726 (67.5 %) | 1,164 (26.7 %) |
| paved (TownGround) tiles | 13,507 | 8,024 (-40.6 %) |
| buildings | 3,281 | 3,265 (-0.5 %) |
| buildings per paved tile | 0.243 | **0.407** |
| mean largest paved patch per town | 0.9975 | 0.9974 |

**Two thirds of every town's streets served nothing at all.**
`TOWN_START_RADIUS` is 10 / 6 / 3 and it was used for two different jobs: the
area a town CLAIMS (the "Stadtgebiet" of 13.3, which the council rates a
company on) and the area it BUILDS. A city of 8,000 wants 80 houses at one per
hundred inhabitants and its radius-10 grid offers some 200 plots, so
`layRoadGrid` laid every main axis and every side street across the full
diameter - `length = r * 2 + 1`, whether or not anything would ever stand there
- and `placeBuildings` filled the middle and stopped at 80. The outer half of
every town was streets through empty land. On top of that the runs did not stop
at the town's OWN GROUND: `claimArea` claims a disc and the grid was laid over
the square, so every town also wrote roads and pavement onto four corners of
open country it did not own (D-101).

**And the checkerboard was never there.** Two independent measures say so: 3
isolated paved tiles in 13,507, and a 4-connected walk of each town's paved
ground that finds the largest patch holding **0.9975** of it - before the
change as well as after. The defect report's cure (fill the enclosed gaps) was
therefore refused with the measurement, and the cure that was taken is the one
the same instruction offers second: **a smaller extent with denser building.**

**The layout is five passes now and the ORDER is the whole change.** Streets
are laid over ground the town owns; everything the centre cannot be driven to
is dropped; the houses go up along what is left; every street that ended up
serving nothing is taken away; and only THEN is the ground under the survivors
paved. Laying the pavement first - which is what the file did - paves a street
that is about to be removed and cannot take it back, because the terrain that
was there is gone by the time anybody knows.

- **The extent is derived from where a house can actually stand.**
  `builtRadiusFor` walks the rings outward counting tiles that are the town's
  own ground, buildable, off the street lines and beside one, and stops at the
  ring that has counted enough plots for the population's houses;
  `TOWN_BUILT_RADIUS_MARGIN` (1 tile) adds the one ring that a plot's own
  street can lie in. It never exceeds the claimed radius, so a town that cannot
  fill itself behaves exactly as before. Reference city: radius 10 -> **built
  radius 7**, 244 -> 114 road tiles, the same 80 houses.
- **Pruning is iterative and its fixed point is unique** (law #8, law #3). A
  street with one connection and nothing beside it is removed; that can turn
  its neighbour into the same thing, so a row-major sweep repeats until nothing
  moves. Removing a leaf can only create leaves and never un-make one, and a
  protected tile is never taken, so the sweep ORDER decides how many passes it
  takes and nothing about the result. Nothing but a building can stand beside a
  street while a map is generated, but the guard asks about track, bridges and
  industries too, because M20 grows towns with the same rule over a played map.
- **A street may be shortened, never dissolved.** The first version of the
  pruner was wrong and its own test caught it: clearing a leaf clears the bit
  the neighbour carried back, and where that was the neighbour's ONLY bit the
  neighbour became a road layer with no connection - not a street - and the
  house beside it was left without one. Eight houses of Nieder-Weidengrund on
  seed 360 stood like that. The pair is refused instead of repaired.
- **A street the centre cannot be driven to is not a street.** The same eight
  houses stood across a river: a run reaches the far bank, lays a fragment
  there, and the town has no bridge. A flood fill from the centre (explicit
  queue, law #8) drops every fragment, which also makes the pruner well posed -
  after it, a town's streets are ONE network.
- **The zoning is deliberately NOT scaled to the new extent.** `zoneFor` reads
  the CLAIMED radius, as it always did. The zones are the town's economy - a
  station's `commercialShare` reads them and with it the M19 fare classes - so
  scaling them to the streets would turn a street change into an economic one:
  measured on the reference city, at the built radius the works start 5.6 tiles
  out instead of 8 and the outer third of every town becomes industrial.
  Measured both ways: the AI runs come out identical to the euro, so this is
  discipline rather than a fix.

**The ripple, in full.** Town centres, names, size classes, populations and
radii are all unmoved - the generator draws exactly one number per town for the
street spacing and it is still drawn first, so no later draw shifted (law #3).
What moved:

- **The canonical cross-OS pin** (D-137): `f04cebfeb26e8161` ->
  **`ddaacd4b970d31db`**, re-recorded by the documented protocol.
- **The soak fixture** (D-190): `856392bde0cd79bf` -> **`051d20db6ca47f1b`**,
  and its recorded command count 698 -> **3,818** - the competitors issue five
  and a half times as many orders on a map whose public streets are 56 %
  shorter, which is the same fact as everything below.
- **The save corpus did not move.** Its fixtures are real saved files decoded
  by their own codecs; nothing in the format or the entity shape changed, so
  the manifest stands at `9800c136644b0199`.
- **SAVE_VERSION stays 30.** A generation change writes different VALUES into
  layers that already existed; not one field, layer or entity changed shape, so
  Z5 has nothing to spend and `saveFieldCoupling`, the round trip and every
  migration test pass untouched.
- **One shipped-scenario claim**: `passagiernetz.industries` 10 -> **14**. It
  is the only figure of the eight worlds that moved, and no sentence rests on
  it - it is not in `SCENARIO_BRIEFING_FIGURES` and no doc comment counts it -
  so the number moves alone. Every town count, city count, corridor, land mass,
  place name, briefing numeral and passive-growth curve is exactly where D-197,
  D-198 and D-199 left it, including Frachtrausch's four industry positions and
  its mine-to-plant distances. **Why so little moved is worth knowing**: a tile
  inside a town's claimed disc is refused to industry by `townId` alone, so
  everything this change does INSIDE a town is invisible to the industry pass.
  Only the ground outside the disc - the four corners the grid used to cross -
  changed hands, and eight cities are what makes passagiernetz the world where
  that was enough to move a draw.
- **Five of the six balancing scenarios of 19.4, Netzdesign, Takt, Punktzahl
  and Harter Winter are untouched**: their worlds are hand built.
- **Scenario 5's road company is BETTER**: 978,528 -> **1,173,298 EUR**, 6 ->
  12 vehicles, one line -> two, deep inside its 0.8-3.2 M band and still
  compounding through the year-twenty-one renewal. That is the measurement that
  says a tighter map is not a broken one.

**Two AI bands were re-banded, with the trace, and the second one is the entry
worth reading.**

`aiCompany`'s expansive personality (seed 2) goes 121,328 [alive, 3 stations, 1
vehicle] -> **-241,309 [wound up, 5 stations, 1 line, 0 vehicles]**. It builds
MORE than it did and it crews nothing in either run; its value declines
monotonically from year one in both, and 362,637 EUR is twenty-five years of
upkeep on a company whose revenue is zero at both measurements. D-158 named
that stagnation an OPEN BOTTLENECK and refused it a growth band; blessing its
SIGN was the half of the sentence that could not survive a world change. The
assertion now holds what D-156 actually caught - that it still BUILDS - plus
D-211's exposure bound.

`aiGame`'s M8 acceptance loses the road company (538,469 -> **-157,183, wound
up**, after laying 345 -> 546 tiles of its own road and drawing its credit line
to the limit), and the richest competitor becomes the one that never built.
Before re-banding anything, the fixture was played at HEAD - the generator
untouched - on the three seeds beside its own:

```
4711  p0    20,792 l0 v0 s2  | p4  101,636 l0 v0 s16 | p1 538,469 l1 v6 s14
4712  p4  -150,281 [X] s29   | p2 -161,432 [X] s2    | p0 415,000 l0 v0 s0
4713  p4  -200,910 [X] s29   | p0 -650,744 [X] s3    | p3 500,000 l0 v0 s0
4714  p4  -129,117 [X] s29   | p2 -477,036 [X] s3    | p3 500,000 l0 v0 s0
```

**On three of the four, at HEAD, two competitors wind up, no competitor owns a
vehicle after twenty-five years, and the richest company is the one that never
built anything.** Every assertion in that block fails on 4712, 4713 and 4714
with nothing of this change in the tree. So "the winner is a real network" was
never a property of the simulation - it was a property of seed 4711, and this
change moved that sample onto the pile where three of its four neighbours
already sat. The block is loosened to what the four runs share, the sweep is
recorded beside it, and **the defect it was covering up is named rather than
tuned away: the AI builds networks it cannot crew.** It spends its capital on
way and stations and has nothing left for vehicles; that is D-158's open
bottleneck, it belongs to M11, and shaping a town generator around it would be
the wrong repair.

**What the game still does not do, named rather than hidden.**
**[SUPERSEDED by D-217, 2026-08-09 - the collision below is fixed; the terrain
is what moved and `TERRAIN_COLORS[TownGround]` is `#8a775e` now.]** The road
cell's kerb is drawn in `ROAD_INK.verge` = `#b8b4ac` and
`TERRAIN_COLORS[TownGround]` is `#b8b4ac` - **the same hex**. A town street
therefore paints its kerb in the colour of the ground it stands on, so the
11-design-px verge D-212 designed as the road's edge is invisible on the only
terrain town roads ever run over, and what the eye gets is an 8.4 px
carriageway floating on an unbounded pale field shared with the houses. That
is the literal mechanism behind "strassen durch haeuser" and it is a RENDER
fact in D-212's own table, not a generator one, so it is not touched here. It
wants its own bundle and a decision about which of the two - street or plot -
stops being Beton.

**Cost.** Zero save bump, zero migration edit, zero snapshot bytes, zero
protocol fields, zero atlas cells, zero i18n strings, zero new RNG draws, zero
change to the draw ORDER. Two constants, both in `constants.ts` with unit and
origin. `npm run typecheck`, `npm run lint` and `npx prettier --check` clean;
`tests/unit` 107 files and 1,436 tests green, `tests/determinism` and
`tests/corpus` 38 green, `tests/balance` 63 green, `tests/soak` 4 green on the
re-recorded fixture.

---

## Towns: the street stops being the plot (2026-08-09)

### D-217 Town ground is a terrain and stops borrowing the road's concrete: the collision D-216 named, measured and priced

D-216 closed with a residual it could not fix from the generator, and this
entry is that residual - **it supersedes D-216's "What the game still does not
do" paragraph**. `ROAD_INK.verge` is `#b8b4ac` and
`TERRAIN_COLORS[Terrain.TownGround]` was `#b8b4ac`: **the same hex**. A town
street therefore painted its kerb and graded verge in exactly the colour of
the plot beside it, and the boundary between street and plot did not exist in
the pixels at all. **That is the literal mechanism behind the owner's
"strassen durch haeuser" - there was nothing between the two to see.**

**Which of the two had to move, and why it is not a toss-up.** SPEC.md 16.3
lists `#b8b4ac` on the **Infra** line as "Beton", beside Gleis, Schotter and
Strasse. It is an infrastructure colour, the road's verge is infrastructure,
and D-212 took it deliberately and correctly. 16.3's **Terrain** line names
nine tones and the simulation has TEN terrains: coast and town ground are in
neither. Coast already carried an invented tone (`#cbb682`) and nobody ever
mistook it for spec; town ground had quietly reached across to the infra line
instead. The terrain is the party with no claim, so the terrain is what moved.
`palette.ts` now says so in a comment that names the hex it is NOT.

**The pixels, before and after.** The road cell is rasterised by
`tests/unit/roadCell.spec.ts`'s own exact rasteriser - D-212's device, one
level up - one atlas cell at the 2x page scale:

| straight town street (bits W+E) | before | after |
| --- | --- | --- |
| kerb pixels (`ROAD_INK.verge`) | 428 | 428 |
| carriageway (asphalt + crown + marking) | 1,352 | 1,352 |
| bare plot inside the tile diamond | 2,522 | 2,522 |
| **value step across the street/plot boundary** | **dL* 0.00, contrast 1.000** | **dL* 22.27, contrast 2.082** |

**Not one pixel moved and the picture changed completely**, which is the whole
point: the kerb was always drawn - 428 px of it on a through street, 298 on a
stub, 592 on a crossroads, 426 on a bend - and it was drawn in the ground's
own colour, so it was 428 px of nothing. The carriageway's own contrast
against the plot falls from 4.274 to 2.053, and that is not a loss: a street
reads as a three-value sandwich now - dark asphalt, BRIGHT kerb, mid-value
plot - instead of one dark stripe on a pale sheet. The kerb is the brightest
of the three, which is how a kerb reads, and the test pins that ordering
rather than trusting it.

**The tone was chosen by measurement, not by eye.** `#8a775e` - L* 51.2,
C* 16.8, hue 78 deg: trodden earth. Every figure below is CIEDE2000, and every
one was taken again through simulated protanopia, deuteranopia and tritanopia,
because **the colour-blind mode of 17.4 does not repaint terrain at all**. It
swaps the company and cargo palettes (`COMPANY_COLORS_CVD`), so a TERRAIN
distinction has to survive deficiency on its own or not at all.

- against the verge: **dE 20.9, dL* 22.3, WCAG contrast 2.08**, and dE 20.9 /
  20.5 / 20.7 under protan / deutan / tritan, **18.8 in flat greyscale**. The
  street boundary is a VALUE step, so it survives every colour vision there
  is - which is the property the old pair had exactly none of.
- against the terrains a town abuts: grass 23.0, field 16.9, forest 24.0,
  desert 22.9, coast 21.2, marsh 18.7, and asphalt itself 22.5.
- its closest are rock at 8.5, and under the dichromacy that flatters each
  least rock 7.3, grass 7.4 and marsh 7.5. **The shipped palette already lives
  with coast/desert at 2.4 in normal vision, forest/marsh at 3.8 under deutan
  and grass/field at 4.4 under protan**, so the new terrain is the widest
  separated of the ten rather than a new risk - and grass and town ground
  carry different GRAINS besides (D-214: tufts against paving).

The search was a grid over Lab inside an argued window - hue 50-88 deg, so it
is warmer than every pale terrain, which all sit at 87-94; C* 12-23, so it is
a colour and not a neutral; L* 48-58 - maximising the minimum dE over twelve
neighbours times four vision models, with the verge floored at 18 in every
model. The optimum is flat around L* 51 and the shape of the curve is the
argument: pushing lighter lets the verge collapse (at L* 64 the best
achievable verge separation is already 7.9 and the verge itself becomes the
binding constraint), pushing darker buys nothing and turns a town into a hole.

**The same collision class, walked everywhere else.** Ten terrain colours plus
`WATER_DEEP` against every infrastructure ink - four road inks, three rail
inks. **Exactly one exact collision existed and it is the one above.** The
near misses, reported rather than fixed:

| pair | dE2000 | dL* | contrast | verdict |
| --- | --- | --- | --- | --- |
| rock `#8a8578` / bridge deck `#8e8a84` | 3.85 | 2.03 | 1.07 | the closest pair left in the tree. The deck is a procedural FALLBACK marker (`BOX_SPRITES`), it is drawn at `railHeight` ABOVE the ground it spans rather than on it, and what a player with a filled asset cache sees is D-208's baked art. Named, not touched. |
| rock `#8a8578` / ballast `#9a938a` | 5.71 | 5.66 | 1.21 | **both are 16.3's own** - "Fels" and "Schotter" - so this is the specification's choice, not a defect, and moving either would be the departure. A track cell also lays sleepers `#5a4b3a` and rails `#6b6560` over the ballast, and that is what carries the read on rock. Untouched. |
| snow `#e8eef2` / signal post `#d8d4cc` | 8.75 | 8.74 | 1.26 | a 0.12-tile-wide post against a whole tile: a silhouette against a field, not two fields. Left. |
| town ground / marking `#d5d0c4` | 7.32 -> **27.0** | | | fixed as a side effect of the above |
| town ground / ballast `#9a938a` | 9.83 -> **12.0** | | | improved as a side effect |
| desert `#d6bc86` / marking `#d5d0c4` | 13.97 | 6.30 | 1.20 | a 0.9 px dashed line; well clear. |

`RAIL_INK` is a new export and it is why this audit can exist at all: the
ballast, sleeper and rail hexes lived as string literals inside
`drawTrackCell`, and an ink inside a drawing function is an ink no test can
see. Three constants moved out with their 16.3 origins written down; the
drawing is byte-identical.

**The minimap** - D-112's one pure painter, which the save thumbnail shares -
paints terrain straight from the same table under a height shade of
`0.72 + h/15 * 0.5`. Measured through that shade at the SAME height, which is
what a town and the field beside it actually are:

| town ground against | before | after |
| --- | --- | --- |
| field `#b09a4e` | 17.6 | **14.0** |
| desert `#d6bc86` | 12.9 | **20.4** |
| coast `#cbb682` | 11.9 | **18.4** |
| snow `#e8eef2` | 8.8 | **29.8** |
| grass `#6f9b58` | 21.5 | 20.4 |
| rock `#8a8578` | 13.6 | **6.6** |

A town is still plainly not a field, and now plainly not a desert, a beach or
a snowfield: **the old pale grey was 8.8 from SNOW, which is the confusion the
minimap actually had.** It loses ground against rock, and that is the trade
the tone was chosen with open eyes - a town stands on flat buildable land and
rock is what is above it. Under the shading a town at one height can meet a
terrain at another; the worst such crossing is 4.7 (town h15 against desert
h2) where before it was **3.4** (town h0 against rock h8), so the cross-height
floor rises rather than falls. In the colour-blind minimap, terrain
unrepainted, town against field measures 13.7 / 13.3 / 9.4 and town against
desert 20.1 / 20.6 / 19.5.

**The regression is pinned twice and both pins go red on the old colour.**
`groundCell.spec.ts` walks the two tables for an exact equality - the pin the
next hand needs - and asserts the verge/plot and asphalt/plot contrast floors
plus the brightness ORDER of the sandwich. `roadCell.spec.ts` counts the kerb
and the carriageway pixels of every shape a town street takes and asserts the
verge is none of the eight terrains a road crosses. Reverted to `#b8b4ac`,
**four assertions fail** - which is the argument for writing them: this defect
survived D-212 and D-216 and nothing in the suite said a word.

**Render-only, and checked rather than assumed.** `TERRAIN_COLORS` is imported
by `Minimap.ts`, `seasonArt.ts` and `water.ts` and by nothing else; `src/sim`
knows `Terrain.TownGround` as an enum value and has never seen its colour. So:
zero sim bytes, zero save bump, zero migration, zero snapshot bytes, zero
protocol fields, zero i18n strings, zero atlas cells, zero new RNG draws, zero
change to the draw order - and no chunk checksum learned anything, because a
checksum folds terrain IDS and not tones. `TERRAIN_SPECKLE`'s town entry moved
with the base at the same 0.916 the old pair carried: nothing consumes it
today, since made ground draws the Paving grain whose ink is the FACE colour
times a value, but a stale pale grey there would be the next hand's trap.

**Cost.** `npm run typecheck`, `npm run lint` and `prettier --check` on the
touched files clean; `tests/unit` 107 files and **1,440 tests** green (D-216's
1,436 plus the four new assertions), `tests/determinism` and `tests/corpus` 38
green. Render perf unmoved, as a colour change must be: chunk bake p50
**1.882 ms** against D-214's 2.08-2.15 and the 5 ms median tripwire, sprite
rebuild and draw prep inside theirs, main-chunk budget green.

**What only a human at the running game can confirm.** That a street now reads
as a street THROUGH a town rather than as a stripe on a sheet; that the new
ground reads as ground rather than as mud; and that a town on the minimap
still looks like a town. D-212's own named residual is untouched and still
open: a road on sloping ground is a flat patch, and on a ramp the ribbon still
steps one height level at every tile boundary.

---

## The AI's road, bundle 1: a road that meets a road (2026-08-11)

### D-218 A road run that lays no new tile still writes the joins it names - the guard stood in front of its own connect loop

The diagnosis of "the richest competitor is the one that never built" measured
five causes over four seeds; this bundle fixes the top-ranked one and only it,
and it is not in `src/sim/ai` at all. **It is a `buildRoad` defect a player
hits too**, and it is the D-076 shape: a command whose validator refuses
exactly what the command's own body exists to do.

`buildRoad` counted TILES. `if (newTiles === 0) return reject(NothingToDo)`
stood immediately in front of the loop that calls `connect()` on every adjacent
pair of the run, so a drag whose tiles all already carried road was refused
BEFORE any of the joins it named were written. Two adjacent road tiles that are
not joined by bits are two roads: `roadBits[tile] !== 0` says "has road", a
vehicle asks "is joined". Drag from your own road onto the town's street and
nothing happens, with the refusal naming nothing to do.

**The measurement, on the shipped command log** (seed 4712, company 1, the
25-year `aiGame` world):

```
BuildRoad x1=24 y1=99 x2=24 y2=76  => ok
BuildRoad x1=24 y1=76 x2=25 y2=76  => REJECT cmd.reject.nothingToDo
BuildRoadStop x=25 y=76            => ok
```

At month 12 the stop S15 (25,76) carries `roadBits=2` (East only) and its
neighbour (24,76) carries `roadBits=8` (South only): `[missing West]`. Flood
fill: `bfsReachable=true driveable=false hasRoadComponent=44
connectedComponent=5`. All six buses of that line lived in `NoRoute` with
`earn=0`. Census over four seeds x months {6,12,18,24}: **26 of 98 line
observations (26.5 %) had their two stops unreachable by connected road, and 82
of 354 crewed vehicles (23.2 %) were in `NoRoute`**; in 22 of the 26 the
drivable island was exactly five tiles. Whole-map context: **0 asymmetric
road-bit pairs** on every world measured and only 1-12 adjacent-but-unconnected
pairs per map - the damage is tiny in extent and catastrophic in placement,
because every one of those breaks sits at a junction the AI itself ordered.

**The AI's own road made its own junction a no-op.** `planRoadRuns` (D-154)
walks a BFS whose passability test is "has road" and hands back maximal
straight RUNS; the run that turns onto an existing street is a single hop
between two tiles that both already carry road by the time it executes -
because the run before it laid the first of them. 25 of 99 `BuildRoad` commands
of that company over twenty-five years were refused this way. The producing
side is not what is wrong: teaching `planRoadRuns` about bits would paper over
a command that is refusing work it was asked to do, and would leave the player
holding the same defect.

**The cure is the guard asking the question it meant.** Work is a new tile OR a
missing join: the validation loop counts both, and the refusal is
`newTiles === 0 && missingJoins === 0`. `joinBit` is one table read by the
write and by the question, so the two cannot drift. **The price stays per
TILE** - a join has never been charged for, and a run that also lays tiles has
always written its joins free; a join-only run is that run with the tiles taken
away. `tests/unit/roadJoin.spec.ts` reproduces the gap, the join, the AI
corridor verbatim from the log, and asserts that a drag over road that is
already one road is still `NothingToDo` and that ground and ownership are still
asked first.

**Measured after, the same four seeds, same fixture parameters** (256 map,
Temperate, Normal, 3 competitors, 25 years; `l` lines, `v` vehicles,
`s` stations):

```
       before (HEAD)                     after
4711   p0  450,000     l0 v0 s0          p0  247,067     l0 v0 s0
       p4  147,413     l0 v0 s11         p4  147,155     l0 v0 s11
       p1 -157,183 [X] l1 v0 s19         p1  576,736     l1 v6 s19
4712   p4 -170,141 [X] l0 v0 s29         p4 -168,859 [X] l0 v0 s29
       p2  195,605     l1 v1 s2          p2  123,894     l1 v1 s2
       p0  296,000     l0 v0 s0          p0 -138,039 [X] l0 v0 s2
4713   p4 -288,638 [X] l0 v0 s31         p4 -290,949 [X] l0 v0 s31
       p0 -284,642 [X] l1 v0 s2          p0 -256,082 [X] l0 v0 s2
       p3  500,000     l0 v0 s0          p3  500,000     l0 v0 s0
4714   p4 -147,283 [X] l0 v0 s29         p4 -145,573 [X] l0 v0 s29
       p2   44,651     l0 v0 s2          p2 -166,757 [X] l1 v0 s2
       p3  500,000     l0 v0 s0          p3  500,000     l0 v0 s0
```

**What it bought, stated plainly.** Seed 4711's road company - the one D-216
lost - goes **-157,183 EUR [wound up], 0 vehicles -> +576,736 EUR alive, six
vehicles, one line**, above the 538,469 it earned before D-216. Living vehicles
across all twelve competitors go **1 -> 7**; companies still owning a fleet
1/12 -> 2/12. `aiGame`'s M8 acceptance is green with room: nothing winds up on
its seed, where one company did.

**What it did NOT buy, stated just as plainly.** Ten of twelve competitors
still own no vehicle after twenty-five years, and the four-seed total value
falls **1,085,782 -> 928,593 EUR** with wound-up companies 5/12 -> 6/12. That
is not the fix regressing: it is the husks finally being ABLE to build, and
then losing money on the bus economics the diagnosis ranks third - a town-pair
line that earns ~20 EUR per bus-month against ~76 of upkeep passes every gate
the AI has, because `startProject` asks only whether the company can AFFORD a
project and never whether it will pay. Two named causes are left for their own
bundles: a closed line strands its stations and its road (nothing in
`src/sim/ai` ever demolishes anything, and `closeDeadLine`'s `owed` sees only
vehicle upkeep), and the missing absolute profitability floor. Both figures
above reproduce the diagnosis's isolated channel C1 to the euro, which is what
says this change is that channel and nothing else.

**Save discipline (Z5), verified rather than assumed. SAVE_VERSION stays 30.**
The only persistent state this touches is `map.roadBits`, saved and hashed
since M2; not one field, layer or entity changed shape, so `saveFieldCoupling`,
the round trip and every migration test pass untouched.

**Hashed values moved in exactly one fixture, and the other two were checked
rather than presumed.** The **soak fixture** (D-190/D-130 protocol) is
re-recorded: `051d20db6ca47f1b` -> **`15e0eca37ca9b897`**, recorded command
count **3,818 -> 5,442** - the competitors issue forty percent more orders
because their roads now connect and their projects reach the stage that buys
vehicles. The **canonical cross-OS pin (D-137) did NOT move** and stands at
`ddaacd4b970d31db`: its world is the recorded ROAD fixture at seed 424,242, and
none of its player commands was a run of nothing but existing road. The **save
corpus manifest did not move** either - the format is untouched.

**The band correction this bundle owes its successor, and does not spend.**
`aiGame.spec.ts` is green at HEAD only because it plays seed 4711 alone; on
seed 4713 its `woundUp.length <= 1` assertion fails both before and after this
change. The four-row table in the comment above `VALUE_FLOOR_CT` was measured
at the commit BEFORE D-216 landed and no longer reproduces; the sweep above is
recorded there as the current one. No band value is touched here - re-banding
needs its own trace and its own bundle.

**Cost.** Zero save bump, zero migration edit, zero snapshot bytes, zero
protocol fields, zero new constants, zero i18n strings, zero new RNG draws, one
new unit spec. `npm run typecheck`, `npm run lint` and `npx prettier --check`
clean; `tests/unit` 108 files and 1,446 tests green, `tests/determinism` and
`tests/corpus` 38 green, `tests/balance` 63 green + 2 skipped, `tests/soak` 4
green on the re-recorded fixture.

### D-219 The AI's single-track railway is planned on ground it may build on, because the command it plans for asks

`planTrack` is the route assistant. It answers about water, slope, curvature
and gradient, and it knows nothing about who OWNS a tile - it takes a `TileMap`
and not a `World`. `buildTrack` walks the finished route through
`buildPermission` and refuses the WHOLE run on the first tile that belongs to
somebody else. `enqueueSingleTrack` - the D-115 fallback every rail company
reaches when no straight oval corridor fits, which on generated terrain is
almost always - ordered whatever the assistant handed back.

This is the D-076 shape a third time, and D-218's twin one file along: a
planner and its command disagreeing about what is legal. `planRailOval` has
asked the ownership question since D-153 (`clearRailTile`) and `planRoadRuns`
since D-154 (`roadTilePassable`); only this branch did not.

**What it cost, measured over four seeds and twenty-five years** (256 map,
Temperate, Normal, three competitors - `aiGame`'s own fixture parameters,
played on 4711, 4712, 4713 and 4714), by counting every command outcome:

- **350 `BuildTrack cmd.reject.notYours`**, against 3 accepted.
- **1,750 `BuildRailStop cmd.reject.needsTrack`** queued behind them - the
  platforms and the shed for track that was never laid.
- **339 `TakeLoan` and 336 `RepayLoan`.** A borrower enqueues the loan in the
  SAME command batch as the build (D-154), so the money lands, the build is
  refused, and the repayment rule hands it straight back at the next decision.
  **The loan-churn standstill D-154 declared dead was alive**, one cycle a
  month: seed 4711's rail company took and repaid a 300,000 EUR loan **253
  times**, from month 49 to month 300, at 1,000 EUR of interest a turn. It ends
  the quarter century with no station, no tile and no vehicle, and **253,000
  EUR of its 500,000 gone**, having never laid a rail.

Because the decision cycle re-plans its best candidate every `AI_RETRY_TICKS`,
one rival tile anywhere on the alignment is not one refused railway: it is the
same refused railway ordered every month for the rest of the century.

**The fix is the question, asked in the branch that lacked it.**
`tileOursOrPublic` is now the ONE ownership test in `src/sim/ai/build.ts` -
`clearRailTile`, `roadTilePassable` and the new loop all read it - and the
deliberate twin of `mayBuildOn` in `commands/build.ts`, which is the test that
actually refuses. The plan is refused by the AI itself, before any money moves,
and the candidate scan carries on to the next opportunity.
`tests/unit/aiRailPermission.spec.ts` reproduces the command's refusal, the
AI's own refusal of the plan, and the two controls that say it is about the
OWNER and not about the road: the identical obstruction laid by the company
ITSELF is no obstacle, and a public street is still crossable. Verified red on
the old code - the fallback enqueued six commands where it must enqueue none.

**Measured, same four seeds, before and after** (`l` lines, `v` vehicles,
`s` stations, `[X]` wound up):

```
       before (D-218 HEAD)               after
4711   p0  247,067     l0 v0 s0          p0  500,000     l0 v0 s0
       p4  147,155     l0 v0 s11         p4  147,155     l0 v0 s11
       p1  576,736     l1 v6 s19         p1  576,736     l1 v6 s19
4712   p4 -168,859 [X] l0 v0 s29         p4 -168,859 [X] l0 v0 s29
       p2  123,894     l1 v1 s2          p2 -279,226 [X] l1 v0 s3
       p0 -138,039 [X] l0 v0 s2          p0   58,097     l0 v0 s2
4713   p4 -290,949 [X] l0 v0 s31         p4 -290,949 [X] l0 v0 s31
       p0 -256,082 [X] l0 v0 s2          p0 -256,082 [X] l0 v0 s2
       p3  500,000     l0 v0 s0          p3  500,000     l0 v0 s0
4714   p4 -145,573 [X] l0 v0 s29         p4 -145,573 [X] l0 v0 s29
       p2 -166,757 [X] l1 v0 s2          p2 -166,757 [X] l1 v0 s2
       p3  500,000     l0 v0 s0          p3  500,000     l0 v0 s0
```

Four-seed total **928,593 -> 974,542 EUR (+45,949)**, wound up 6/12 in both,
`BuildTrack notYours` 350 -> 0, `BuildRailStop needsTrack` 1,750 -> 0,
`TakeLoan` 339 -> 4. The soak fixture's recorded command count falls
**5,442 -> 3,419**, which is the same 2,023 dead orders counted a second way.

**The one row that got worse is named rather than averaged away.** Seed 4712's
expansive company goes 123,894 alive with a train to -279,226 wound up with
none. That is not the fix misbehaving: freed of the refusals it now builds a
SECOND railway - two accepted `BuildTrack`, ten platforms - and cannot afford
the train for it, `BuyTrain cmd.reject.insufficientFunds`. That is D-158's
named open bottleneck verbatim, "it spends its capital on way and stations and
has nothing left to crew them with", and it belongs to whoever closes it.

**Save discipline (Z5), verified rather than assumed. SAVE_VERSION stays 30.**
Nothing persistent is touched at all: this is a refusal inside a planner, and a
refused plan writes nothing. `saveFieldCoupling`, the save round trip and every
migration test pass untouched. The **canonical cross-OS pin (D-137) did NOT
move** - `tests/determinism` and `tests/corpus`, 38 tests, green at
`ddaacd4b970d31db` - because its world is a recorded ROAD fixture with no AI
railway in it. The **save corpus manifest did not move.** The **soak fixture IS
re-recorded**, under D-190/D-130: `15e0eca37ca9b897` ->
**`45ccb46dc67e1fdf`**. **No band was touched and none needed to be**:
`tests/balance` is 12 files, 63 passed and 2 skipped, unchanged, and scenario
5's three rows are bit-identical (road 1,156,463 EUR, rail 228,047, expansive
-241,309) - the road and expansive worlds never reach this branch, and the rail
one's alignment was always its own.

### D-219a What the same trace refutes, and what the rest of the AI hole costs

The measurement above was taken on the way to the two causes D-218 named for
their own bundles. Both were built, measured on the four-seed sweep and
REVERTED, and the numbers are recorded here so the next bundle does not spend
the same day finding them.

**The stop scan has the identical defect, and fixing it ALONE is worth
-281,115 EUR.** `clearStopTile`'s own sentence is "bare, flat, dry, and nobody
else's", and the last clause was prose: it tested the ground and never asked
who owned the tile, nor whether a station was already standing on it. Measured
on seed 4711's town-network company over twenty-five years: **589
`BuildRoadStop cmd.reject.occupied`, 292 `roadNotYours` and 584 `BuildRoad
notYours` against 16 accepted stops and 19 accepted roads**, plus **952
`BuyRoadVehicle cmd.reject.needsDepot`** - buses ordered at a shed the refused
batch never built. Teaching the scan the command's own questions
(`tileOursOrPublic`, a station test, and `planRoadStop` - the very function
`buildRoadStop` runs, D-119/D-210) removes every one of those refusals, and the
four-seed total goes **928,593 -> 647,478 EUR**, wound up **6/12 -> 7/12**,
living vehicles **7 -> 0**. Seed 4711's road company - the one D-218 rescued -
builds MORE (76 -> 87 accepted roads, 12 -> 14 lines) and goes **+576,736 ->
-387,077 [wound up]**. The refusal storm was an accidental BRAKE on suicidal
building; taking a brake off before fixing the reason for it is how a genuine
defect fix measures negative. It ships with the economics or not at all.

**An absolute profitability floor cannot be built out of the ranking
estimate.** `rate`'s `revenueCtPerMonth` is a RANKING figure by construction -
D-122's `ticksInTransit: 0`, and a nominal `AI_ROAD_LOAD_UNITS = 20` where the
1950 bus lifts 150. Measured against the yearly upkeep of everything each
project would build and run: on a generated 256 map the town pairs score
**0.34-0.68** of their own upkeep and the coal railways **1.73-3.47**, which
looks like exact separation - and on scenario 5's own 512 map, seed 4711, **no
road candidate reaches 1.00 at month 1, 6, 24, 60 or 180**, while that company
earns 1.16 M. A break-even gate at 1.0 therefore stops the AI building at all:
measured on the four seeds, four-seed total **928,593 -> 4,078,104 EUR** with
**ten of twelve companies holding zero stations and zero vehicles**. That is
money by inaction, not a fix. A floor has to be built from the REAL lift the
builder already knows - `loadUnitsOf`, the fleet it is about to buy, the real
round of `AI_LIFT_REAL_SHARE` - and never from the ranking number.

**Four recurring AI questions, re-checked against the running code rather than
against this file.** (1) `adviseFleet` has exactly ONE definition,
`src/sim/lines/metrics.ts`, and both the AI (`fleetFor`) and the line panel's
advisor in `SimWorker` call it - D-152 holds. (2) D-115's
half-year-against-a-full-year error has NOT come back: `closeDeadLine` scales
its `owed` by `AI_LINE_REVIEW_TICKS / TICKS_PER_YEAR`. What that `owed` still
cannot see is the infrastructure the closure strands, which is D-218's second
named cause and stands. (3) Auto-renewal IS on for every AI line (D-146):
`SetAutoRenew` is accepted once per line in every measured run - 7, 12, 16, 18
and 21 per company - and every surviving AI line reads `autoRenew === 1` at
year twenty-five. (4) Reinvestment: the repayment rule fires correctly, and the
companies that hoard do so because their candidate list is empty or every
candidate on it loses money - seed 4713's conservative company issues ZERO
commands in twenty-five years and keeps exactly its starting capital. D-109's
compounding gap is still open, and on these maps it is now the bus economics
and nothing else.

---

## The AI's acceptance net: one seed was never a measurement (2026-08-11)

### D-220 The AI acceptance run is a seed sweep, and what it could not see is a refusal profile

**`tests/balance/aiGame.spec.ts` asserted on ONE seed for the whole project, and
every claim it made about the AI was a property of that seed.** D-216 measured
that and said so; D-218 and D-219 then each found a defect the green single-seed
run had been sitting on top of since M8. This bundle closes the hole the two of
them walked through, and it changes no simulation code at all: `src/` is
untouched.

**The sweep.** `aiGame` plays four seeds now - `AI_SWEEP_SEEDS = [4711, 4713,
4712, 4714]`, defined in `tests/balance/determinism.ts` beside the costly-twin
split it shares a switch with. **The order is the argument**: 4711 is the seed
the whole project's AI evidence is recorded on (the soak fixture replays exactly
that game, D-190) and the one seed on which every old claim was true; **4713 is
second because it is the counterexample** - two of its three competitors wind up,
the richest built nothing at all, and `woundUp.length <= 1` is red on it before
D-218 and after it. A run that plays only the lucky seed learns nothing, so the
small sweep is the recorded seed AND the seed that breaks it.

**The split, measured rather than guessed.** One quarter century of this fixture
takes 40-70 s depending on machine load. Whole-file wall clock, three runs on
the same afternoon: the old single-seed file **93.9 s**, the two-seed sweep
**106.8 s**, the four-seed sweep with the desync twin **242.1 s** (160.6 s of it
the four quarter centuries, 61.6 s the twin's replay). So the default run pays
about **+13 s** and the CI `soak` job about **+150 s on every push**, which is
the same trade `determinism.ts` already made for the two costly twins and it is
settled with the same switch: `IRON_VEINS_BALANCE_HASH=all`. The variable's NAME
is now narrower than its meaning and it is kept anyway, because CI, the runner
script and every developer alias already say it; `fullHashMode` is renamed
`fullBalanceMode` so the code does not lie about it. **No CI change was needed** -
the `soak` job already sets the variable, and only its comment moved. The split
is guarded from outside by four new cases in
`tests/unit/balanceDeterminism.spec.ts`: at least four distinct seeds, the small
sweep a proper non-empty prefix, the two modes producing exactly the two lists,
and 4711 first - if it stops being first, the default run stops covering the
world the rest of the project's AI evidence is about, and the twin would replay
a world no assertion had looked at.

**What the four seeds actually share, measured at this HEAD** - format:
personality, value EUR, [X] wound up, l lines / v vehicles / s stations:

```
4711  p0  500,000     l0 v0 s0  | p4  147,155     l0 v0 s11 | p1  576,736     l1 v6 s19
4713  p4 -290,949 [X] l0 v0 s31 | p0 -256,082 [X] l0 v0 s2  | p3  500,000     l0 v0 s0
4712  p4 -168,859 [X] l0 v0 s29 | p2 -279,226 [X] l1 v0 s3  | p0   58,097     l0 v0 s2
4714  p4 -145,573 [X] l0 v0 s29 | p2 -166,757 [X] l1 v0 s2  | p3  500,000     l0 v0 s0
```

Total 974,542 EUR, **six of twelve wound up, ONE of twelve owns a vehicle**,
nine of twelve took the field, three hold a line. It reproduces D-219's table to
the euro. Asserted, because it holds on all four: at least one competitor alive;
the richest competitor solvent; somebody built a network of at least two
stations; everybody who took the field still owns it; everybody inside the total
exposure bound; three distinct personalities producing distinguishable networks;
no living vehicle stranded in `NoRoute`. **Deliberately NOT asserted, because it
is red on the sweep**: `woundUp.length <= 1` (red on three of four) and "the
richest company built something" (red on 4713 and 4714, where the richest is the
conservative company that never left the yard with its 500,000 intact). The
sweep-wide floor is stated as the embarrassment it is - **at least ONE company
in twelve runs a line with a fleet** - rather than dressed up as a property.

**The instrument that was missing, and it is the larger half of this bundle.**
Both AI scenarios measured exactly one thing: the balance sheet at year
twenty-five. A company that ordered a railway it was never allowed to build,
every month for two hundred and fifty game months, has a perfectly plausible
balance sheet - which is precisely what D-219 was, and nothing in the suite could
see it. `tests/balance/aiRefusals.ts` counts `World.step`'s own outcome sink per
company and per command kind. It is a pure observer: it reads what the command
layer already decided and writes nothing back, proved by scenario 5's twenty-five
yearly values being identical to the euro with the sink attached. Two guards,
**and neither is a band**:

- **`looping`** - a kind issued `LOOP_ISSUES` = 8 times with not one accept
  among them. Eight is not tuned toward anything: the decision cycle re-plans
  every `AI_RETRY_TICKS` (one game month), so eight issues without an accept is
  eight months of the same order going out and coming back. D-219 was 253
  `BuildTrack` and 1,265 `BuildRailStop` with zero accepts - red by a factor of
  thirty. Below eight, a rejection is ordinary bad luck and says nothing.
- **`undeclared`** - the (kind, reason) pairs the AI collects are DECLARED, each
  with the reason it is tolerated, and anything else is a defect until somebody
  measures it. Same shape as the project's other coupling audits (D-133, D-183),
  and asserted in ONE direction on purpose: seen-but-not-declared fails,
  declared-but-not-seen does not, because a two-seed run legitimately does not
  produce all six and a road-only scenario produces none of the rail ones.

**The six declared pairs, which are the honest state of the AI**, measured over
the four seeds: `BuildRoad|nothingToDo` (a run whose tiles and joins are all
already there - since D-218 this really is nothing to do),
`BuildRoad|notYours` **x584 on one company**, `BuildRoadStop|occupied` **x589**,
`BuildRoadStop|roadNotYours` **x292**, `BuyRoadVehicle|needsDepot` **x952** and
`BuyTrain|insufficientFunds`. The first five are D-219a's reverted fix and its
downstream, the last is D-158's bottleneck verbatim. **Zero `BuildTrack|notYours`
and zero `BuildRailStop|needsTrack` anywhere in the sweep**, and `TakeLoan`
accepted 7/1/2/2/1/1/1/2 times per company instead of 339 - D-219's fix
confirmed by an instrument that was not in the tree when it was written. One
company still collects 2,811 refusals against 71 accepted builds, a **97.5 %
refusal rate on the build family**, and that number is printed on every run now
instead of being invisible. Scenario 5's map is clean by comparison: 7 refusals
across three companies over seventy-five game years.

**The bands were re-measured on the fixed behaviour and NOT ONE MOVED**, which
is the point of writing it down - D-158's evidence rule is that a band moves only
when a measurement says the old one described a world that no longer exists, and
both numbers go in the entry either way. Scenario 5: ROAD **1,173,298 ->
1,156,463 EUR** (-1.4 %, 12 vehicles and 2 lines in both), inside 0.8-3.2 M with
margin; RAIL **228,047** and EXPANSIVE **-241,309 [wound up]**, both unchanged to
the euro - D-219's fix cannot reach them, their opportunities never take the
single-track fallback branch on that map. `aiGame`'s exposure bound is unmoved at
-(START_CAPITAL + LOAN_MIN_LIMIT); the assertions around it changed, the bound
did not.

**And the sentence that would have been the prize, said plainly instead: the AI
does NOT reach SPEC.md 19.4's 5-25 million, and this bundle does not claim it
does.** 1,156,463 EUR is a factor 4.3 under the original floor. D-116 stays
closed on D-158's recalibrated band and on the achievability probe behind it -
the map's physical offer, not the AI's competence, is what five million was
measured against - and nothing in D-218, D-219 or D-220 moved that argument by a
euro.

**No save bump, and it is verified rather than assumed: `src/` is not touched at
all.** The soak fixture hash is unchanged (`45ccb46dc67e1fdf`, 3,419 recorded
commands, re-run and compared, not presumed), the canonical cross-OS pin
`ddaacd4b970d31db` is unchanged, the corpus manifest is unchanged, and
SAVE_VERSION stays 30. Zero snapshot bytes, zero constants, zero i18n strings,
zero RNG draws, zero `CommandKind`s.

**Both new guards were verified RED on the pre-D-219 simulation, by reverting
that fix in a working copy and re-running the DEFAULT two-seed sweep.** The loop
guard fails with `company 1 BuildRailStop: 1265 refused, 0 accepted
(cmd.reject.needsTrack x1265)` and `company 1 BuildTrack: 253 refused, 0
accepted (cmd.reject.notYours x253)`; the declared-set guard fails naming the
same two pairs as undiagnosed. Those are D-219's own numbers, reproduced by a
test that did not exist when D-219 was written - which is the whole claim of
this bundle, demonstrated instead of asserted. `src/sim/ai/build.ts` was
restored afterwards and `git diff src/` is empty.

**Verified by running**, in this order, on the final tree: `npm run typecheck`
clean; `npm run lint` over the whole repo, architecture laws included, clean;
`npx prettier --check` clean on every file touched; `tests/unit` **109 files /
1,455 tests** green; `tests/balance` **12 files / 79 green + 2 skipped** in 139 s
(was 63 + 2); `npm run test:balance:full` **12 files / 97 green** in 292 s;
`tests/determinism` + `tests/corpus` **8 files / 38** green; `npm run test:soak`
**4** green at the unchanged hash.

**What this does NOT do, named so the next bundle does not have to rediscover
it.** The two coupled causes of D-219a are untouched: the stop scan has the
identical ownership defect, and its fix must ship WITH an economics half built
from the real lift the builder knows. Ten of twelve competitors still own no
vehicle after twenty-five years. The sweep makes that visible on every push now
instead of once a milestone, and the `NoRoute` guard covers six living vehicles
today - it gets stronger exactly as the AI gets better at crewing, which is the
right direction for a net to grow in.

### D-221 A competitor may not build a business that cannot pay - and the four-building stop was measured and refuted

**`rate` scored revenue per unit of capital, which is a RANKING with no floor,
and `startProject` asked only whether the company could AFFORD the build. So
nothing anywhere asked whether a line would cover its own costs**, and the best
of a list of loss-makers was built exactly as a good line would have been - and
then built again, because the list does not change when the money goes. Measured
first, on the four seeds of the sweep plus four nobody had played (2718, 31415,
60613, 12345), twenty-five years, 256 map, three competitors each:

```
seed   before                                       after
4711    500,000 |  147,155     |  576,736             55,935     |  412,641 |  540,495
4713   -290,949 [X] | -256,082 [X] |  500,000        411,226     | -247,794 [X] |  500,000
4712   -168,859 [X] | -279,226 [X] |   58,097        500,000     |   63,551 |  500,000
4714   -145,573 [X] | -166,757 [X] |  500,000        382,931     |  500,000 |  500,000
2718    500,000 | -483,604 [X] | -325,286 [X]        500,000     |  222,570 |  500,000
31415   500,000 | -415,716 [X] | -326,599 [X]        500,000     |  456,327 | -408,030 [X]
60613  -140,020 |   23,385 [X] |  -47,967 [X]       -157,950 [X] |  500,000 |  448,473
12345  -117,468 [X] | -622,832 [X] |  500,000        377,602     |   35,576 |  500,000
```

**Total over twenty-four competitors 18,435 -> 7,593,553 EUR; wound up 8 -> 3;
the four unplayed seeds alone -956,108 -> 3,474,568.** The four-seed sweep the
acceptance run asserts on moves 974,542 -> 4,118,986 with six windings-up down to
one. What did NOT move is the thing that matters most, and it is said out loud:
**one competitor in twenty-four still runs a line with a fleet** - seed 4711's
road company, one line, six vehicles - and nine of twenty-four now finish with
their 500,000 untouched, against four before. **This bundle stops the AI
destroying capital; it does not yet make it build.** The second named cause -
three personalities of five see an EMPTY opportunity list on a generated map,
because they collect industry pairs only and the map carries 9-15 industries - is
deliberately untouched, and it is what the next bundle is for. Giving them town
pairs while the bus business still lost money was measured at -3,123,753 EUR.

**`projectLine` is the absolute test beside the ratio**, and three things make it
different from `rate`'s estimate - D-219a measured a floor built out of `rate`'s
own figures and it stopped the AI building anything at all (+3.1 M, ten of twelve
companies with no station), because `rate` quotes a NOMINAL 20-unit lorry load
where the 1950 bus lifts 150. (1) The REAL vehicle and the REAL fleet: the specs
the builder will buy and the size the 12.3 advisor gives. (2) The REAL round, at
`AI_LIFT_REAL_SHARE` of the nominal speed, on both the capacity and the decay
side. (3) **The decay is charged.** D-122's verdict that decay must stay out of
the ranking stands untouched - it was about ORDERING candidates, and depressing
every score equally cannot change an order; a floor is exactly where the honest
arrival value belongs. The cost side is the whole monthly bill: fleet upkeep, two
stops, the shed and the way. **It is deliberately NOT folded into
`buildCostCt`** - that field is the WAY and nothing else, because the builder
adds the stops, the shed and the vehicles to it when it asks about
financeability, and a figure that already contained them is D-121's measured
double count that put every rail line permanently out of reach.

**The gate sits in `opportunities`, not only in `startProject`, and that was
measured too.** With the floor in the builder alone, the refused town pairs went
on sitting at the top of the ranking for ever and the builder spends a fixed
`AI_CANDIDATES_TRIED` on them: scenario 5's road company did not reach its coal
pair until game year nine. Dropped from the LIST, the pairs that pay rise into
the candidates the builder actually tries. `fleetFor` and `loadUnitsOf` moved
from `ai.ts` into `evaluate.ts` for that - ONE definition, because a filter and
the builder it filters for drifting apart is the D-219 defect one file along.

**`AI_MIN_PROFIT_MARGIN = 1.25`, and it is a measurement rather than a knob.**
Eleven quarter-century games were instrumented (the four sweep seeds, the four
unplayed ones, and scenario 5's three personalities): every project logged the
projection it was built on, and every line review logged what it had actually
earned against the same whole-bill basis. 114 lines, 492 reviews. Sorted by
projection, per line, on the best review window a line ever had:

| projected margin | lines | ever covered their whole monthly bill |
| ---------------- | ----- | ------------------------------------- |
| under 0.9        | 77    | 7 (9 %)                               |
| 0.9 and over     | 37    | 17 (46 %)                             |
| 1.4 and over     | 10    | 6 (60 %)                              |
| 2.0 and over     | 4     | 4 (100 %)                             |

**The value is not read off that table** - picking the column that flatters a
band is what this project does not do. It is the reciprocal of the projection's
own measured optimism: over all 114 lines the MEDIAN one realised **0.815** of
its projected margin (quartiles 0.54 and 1.47), so 1 / 0.815 = **1.23** is what
the median line needs in order to cover its bill in fact. Rounded to 1.25. The
sensitivity is stated because it is real: seed 2's expansive company builds at
1.435 and 1.488 and seed 3's rail company at 1.881, so a floor above 1.435 would
stop two of scenario 5's three personalities building at all - a property of how
thin the industry offer is on a generated map, not of this number.

**The other half of the diagnosis was measured and REFUTED, and that is the
finding rather than a fix.** "The stop the AI plants covers FOUR buildings in a
town of 400" is true, and it is not a placement defect: **four is the whole
town.** On every one of the eight swept seeds, every town of population 500 or
under carries EXACTLY 4.00 building tiles (24-33 such towns a seed, 96-132
buildings, the figure identical on all eight), and `stopTileNear`'s radius-4
catchment reaches **3.79-4.00** of them against a best-legal-placement
**3.79-4.00**: the whole head-room a cleverer scan could win on a small town is
between 0.00 and 0.11 buildings, and on four of the eight seeds it is exactly
zero. Over ALL towns the scan covers 54.8-74.3 % of a town's stock against a
best of 58.1-77.7 %, and every point of that 2-5 point gap is on the large towns
whose houses do not fit inside one disc at any centre. A second measurement says
the coverage would not be worth much even if it could be raised:
**`produceTownCargo` hands a town's output to its stations by SHARE**
(`buildingsCovered * rating / totalWeight`) and the shares sum to one, so the
SOLE station of a town - which is what an AI town always has - receives the
town's WHOLE monthly output whatever it covers. `buildingsCovered` decides which
town a stop belongs to, whether it takes goods and food at all, and how two
stations of one town split the traffic; it does not scale a passenger line's
revenue. **`stopTileNear` is therefore unchanged**, and both numbers are pinned
in `tests/unit/aiProfitFloor.spec.ts` and written over the function so the day
is not spent again. What a town of 400 cannot support is the LINE, and the floor
above is what refuses it: two towns of 400 at 26 tiles project **0.623**.

**Bands re-measured, and the one that moved is documentation, not a band.**
Scenario 5 ROAD **1,156,463 -> 1,022,084 EUR** (-11.6 %), still two lines, twelve
vehicles, still compounding through the year-twenty-one renewal, comfortably
inside 0.8-3.2 M; the fall is chaotic divergence and the trace says so - with the
two loss-making town pairs refused, the AI consumes different RNG and that map's
coal pair appears in a different game year (the 1950 list on that seed holds
nothing BUT two pop-400 bus pairs, projected 0.623 and 0.266). RAIL **228,047**
and EXPANSIVE **-241,309 [wound up]** unchanged to the euro. Every other
scenario - the bus line, the coal train, the wood chain, bankruptcy, the mine
closure, the takt, Netzdesign, harter Winter, Punktzahl - bit-identical.

**No save bump, verified rather than assumed.** `Opportunity` is a transient
ranking record and gained one derived field (`offeredPerMonth`, both ends of a
passenger pair rather than the larger one); `AiState` and `AiProject` are
untouched, so no field, layer or entity changed shape and **SAVE_VERSION stays
30**. The **canonical cross-OS pin `ddaacd4b970d31db` did NOT move** - checked by
running `tests/determinism`, not presumed, because its world is the recorded ROAD
fixture and carries no AI. The **soak fixture is re-recorded**:
`45ccb46dc67e1fdf` -> **`1f76e2df98be99a3`**, and the number in it worth reading
is the command count, **3,419 -> 191**. Nine tenths of what that competitor
ordered over a quarter century was a line that could not pay.

**Verified by running**, on the final tree: `npm run typecheck` clean;
`npm run lint` over the whole repo clean; `npx prettier --check` clean on every
touched file (the repo-wide check is red at HEAD too - **and the cause stated
here was wrong: read D-227**, which measured that the working tree is LF
throughout and that the 31 files have simply never been through the formatter);
`tests/unit` **110 files / 1,459 tests** green;
`tests/balance` **12 files / 79 green + 2 skipped**; `npm run test:balance:full`
**12 files / 97 green**, the four-seed sweep included; `tests/determinism`
**7 files / 33** green at the unmoved pin; `npm run test:soak` **4** green at the
re-recorded hash.

### D-222 A mode preference is not a vow of poverty, and a projection must price the railway that gets built

**Cause 4 of the AI diagnosis - "three of five personalities see an EMPTY
opportunity list" - is half right, and the half that is wrong was named as the
filter to fix.** Measured before anything was changed, on all eight seeds of
the acceptance set at game start (256 map, three competitors):

| what | 4711 | 4713 | 4712 | 4714 | 2718 | 31415 | 60613 | 12345 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| industries / towns | 9/40 | 12/40 | 11/40 | 11/40 | 12/40 | 13/40 | 13/40 | 15/40 |
| pairs whose sink accepts the source's cargo | 6 | 9 | 8 | 4 | 4 | 4 | 5 | 6 |
| dropped `tooFar` (>120) | 3 | 2 | 2 | 4 | 0 | 1 | 4 | 5 |
| dropped `noOnwardLeg` | 2 | 6 | 1 | 0 | 2 | 1 | 0 | 0 |
| dropped `canSupply` (unsupplied factory) | 0 | 0 | 1 | 5 | 2 | 3 | 5 | 7 |
| dropped by the FRESH rot gate | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| reaching the economics | 1 | 1 | 5 | 0 | 2 | 2 | 1 | 1 |

- **The rot gate is refuted, and it is pinned refuted.** `arrivesAlive` drops
  **zero** industry pairs on all eight seeds, and the whole candidate list is
  IDENTICAL with it on and off - both modes, both pair sources, distance window
  at 120 and lifted. Everything it would refuse the D-221 floor refuses anyway,
  because `projectLine` charges the real transit decay properly. The 0.10
  survival figure in the diagnosis is the STALE branch, not the fresh one, and
  that branch is CORRECT: it is what refuses a farm making 307 units a month to
  six lorries at sixty-five tiles, and seven of the thirteen pairs that reach
  the economics are exactly that. `tests/unit/aiModeFallback.spec.ts` holds the
  zero.
- **The personalities are not idle for want of building, either.** The
  lifecycle trace nobody had taken: of twenty-four competitors, **fourteen
  built AND crewed** - three road companies bought 12-18 buses, eight rail
  companies bought a train each - and then `closeDeadLine` sold the fleet and
  deleted the line, after which the standing stations act as the graveyard
  marker (`servedByUs`) and the pair is never tried again. Thirteen of the
  fourteen finished with no vehicle. **Every railway ever built died**, ten of
  ten.
- **THE DEFECT: the projection priced a railway the builder never lays.**
  `enqueueInfrastructure` lays D-153's one-way oval only where two straight
  clear rows fit the whole span, and on generated terrain they never do -
  `BuyTrain` accepted exactly ONCE per rail company, ten of ten, and
  `AiProject.railTrains` was 1 every time. `projectLine` was quoting **two
  trains over a double way**. Measured at the closing review of every rail line
  the eight seeds produced, earnings against the FLEET upkeep alone came to
  0.61, 0.71, 0.89, 0.96, 0.96 and 0.99 of what was owed, against projections
  of 1.3-1.9 times the whole bill. `AI_RAIL_PROJECTED_TRAINS` /
  `AI_RAIL_PROJECTED_TRACKS` are 1 and 1 now, used by the drain gate and the
  floor together; where the oval does fit the line beats its own projection,
  which is the safe direction for a floor to be wrong in. This is D-219's
  lesson one file along - a filter and the builder it filters for must not
  disagree about what is being built.
- **THE FIX FOR THE EMPTY LIST: a mode preference is not a vow of poverty.**
  A personality whose PREFERRED mode offers nothing that pays now looks at the
  same pairs on the other one, and only then. It is safe in a way it was not
  before D-221 - what comes back is filtered by the profit floor like
  everything else, and widening the offer while the offer still lost money was
  measured at -3,123,753 EUR. It runs ONE way, measured: **no** town pair on
  any seed pays as a railway (0 of 780 per seed, best margin 0.07) and the
  industry pairs that pay by rail are a subset of those that pay by road, so a
  road personality falling back to rail would find nothing and would only blur
  the five personalities into one. Over the eight seeds, four of sixteen
  rail-personality lists stay rail and six fall back.
- **Measured, eight seeds, twenty-five years each: total value 7,593,553 ->
  9,233,799 EUR (+21.6 %), wound up 3 -> 2, competitors running a line with a
  fleet 1 -> 4 on 4 of 8 SEEDS (4711, 4713, 4714, 12345), living vehicles
  6 -> 40, `NoRoute` 0 throughout.** The asserted four-seed sweep goes
  4,118,986 -> 5,969,618 with nobody wound up. Seed 4713's rail company reads
  -247,794 [wound up] -> **+1,687,871 with three lines and eighteen vehicles**;
  4714's expansive 500,000 untouched -> 415,718 with a line and six vehicles.
  Two rows got worse and are named: 2718's rail company 222,570 -> -196,058
  (alive, five stations, a road business it now runs at a loss) and 31415's
  expansive -408,030 [X] -> -103,538 [X], still wound up but for two thirds of
  the money.

**AI_MAX_DISTANCE was measured, and the bands refused it.** The window is
SPEC.md section 15's own "Distanz 15-120 Tiles", written when the opportunity
list had no profitability test at all - so it is a proxy standing beside the
instrument D-221 built for it, and the natural conclusion was to open it. The
evidence for opening it is real: 21 of the 51 accepting pairs are further apart
than 120 tiles, the per-seed median accepting pair is 33-168, the window also
bounds `onwardLegExists` and so kills complete chains whose NEXT leg is beyond
it (4712: IronOre->SteelMill at 83 tiles, refused because SteelMill->Machine
Factory is 163), and the game's own **economic horizon** - the longest haul at
which `projectLine` can clear the floor for ANY cargo, swept tile by tile over
twenty cargoes, both modes, five source sizes and six decades of catalogue - is
**233 tiles**. Opened to 240 the eight-seed set improves (7,593,553 ->
7,829,962 with the fallback, 42 living vehicles). **It is not shipped**: on
scenario 5's 512 map the road company falls **1,022,084 -> 797,873 EUR**,
0.27 % under D-158's measured floor, and stops compounding through its year-21
renewal - not through anything in its own line, but because the rail company on
the same map now competes for the same ground. The bands own the constants
(D-087). The whole measurement is in the constant's own comment so the next
pass starts from it.

**And one thing that was retried and is still not the answer.** D-122 reverted
charging `rate`'s ranking the honest transit decay. It was retried here because
D-221 changed the world the revert was measured in - the ranking is no longer
the build decision, so a term that depresses every score equally can no longer
stop anything being built, only reorder. Measured on scenario 5 with the window
open: **not one cent of difference.** D-122's real finding was that the order
does not move, and it stands.

**No save bump, verified rather than assumed.** `Opportunity` is a transient
ranking record and nothing in `AiState` or `AiProject` changed shape, so
SAVE_VERSION stays 30. **The soak fixture did NOT need re-recording** - seed
4711 plays the identical game, hash `1f76e2df98be99a3` at 191 commands,
re-run and compared rather than presumed - and the canonical cross-OS pin
`ddaacd4b970d31db` did not move. Scenario 5 is **bit-identical to D-221's**
(road 1,022,084, rail 228,047, expansive -241,309), and no band, threshold or
assertion in `tests/balance` was loosened or moved.

### D-223 A project reads its stops back off the map, and the read-back must ask who owns them

**The second connectivity defect, and the one D-218's fix walked past.** An
independent verifier played the shipped `aiGame` assertions over a seed the
sweep does not cover and found `company 3
SetVehicleRunning|cmd.reject.noRouteToStop x6` on seed 60613 - a whole fleet
refused the moment it was told to start, on a build that had just fixed
junctions. Reproduced at 5d32299 before anything was touched, and traced the way
D-218 was traced: the command outcome sink, the actual `roadBits` at the stop,
and a flood fill from the shed.

**What the trace says, tile by tile.** Tick 943,468, company 3, six buses, all
standing on their own shed tile at 196,103. The flood fill over joined road bits
from that tile reaches **81 tiles** - the company's road is fine, and the FAR
stop of the line, its own station 34 at 228,108, is inside it. The NEAR stop is
not: the line's other order calls at **station 27, owned by company 2**, whose
bay lies at 196,104, one tile south of the shed, with `roadBits` 8 (South only)
against the shed's 1 (West only). The two are neighbours and are joined by
nothing. There is no asymmetric bit pair, no missing junction and no defect in
`buildRoad` here - the AI simply built a line to somebody else's stop.

- **The cause is one missing ownership question**, and it is the D-219 shape one
  file along. `advanceProject` observes what the previous cycle left behind
  rather than trusting the commands it sent (D-108), and the observation was
  `stationAtTile(world, tile)`: the first station with a module on that tile,
  whoever owns it. So the sequence is: the AI plans its stop onto a tile a rival
  has already built on; `BuildRoadStop` refuses it `Occupied`; **that refusal is
  DECLARED and tolerated** (D-220, and D-219a measured that fixing the scan
  costs -281,115 EUR); the next cycle finds the rival's station on the tile,
  adopts it as its own terminus, buys the fleet, opens the line, sets the
  schedule and starts the vehicles. `ownStationAtTile` is that question asked,
  and a project whose stop is not its own ends like any other failed project -
  what was built stays standing and stays paid for.
- **Every command in that sequence is ACCEPTED**, which is why the refusal
  profile of D-220 could not see it: the only rejection in the whole story is
  the `SetVehicleRunning` at the end, six of them, one per bus. And a year-25
  audit cannot see it either - `closeDeadLine` closes the line that never moved,
  so on seed 60613 at year twenty-five the line list is empty and the company
  owns 18 stations, 403 tiles of road and nothing that runs.
- **The road to it was never buildable either**, which is the second half of why
  the buses are stranded rather than merely slow: the rival's stop tile belongs
  to the rival the moment it is paved (D-101), so `BuildRoad` onto it answers
  `NotYours` - the declared refusal `BuildRoad|notYours` in the profile is the
  same event seen from the other side. `roadTilePassable` refuses the tile too,
  so `planRoadRuns` never even offers a run that would reach it; the search
  starts ON that tile and walks away from it.
- **It stays something a player could do** (D-109). `SetLineOrders` accepts a
  foreign station id - a player may write that schedule too, and gets the same
  useless line - so nothing here is a rule the AI plays by and the player does
  not. What is fixed is that the AI stops doing it by accident.
- **Measured over the eight seeds, twenty-five years each: not one euro moved.**
  Every one of the twenty-four rows is identical before and after, to the euro,
  with identical station, road, rail, line and vehicle counts. The adoption is
  simply not exercised on these eight worlds at today's HEAD - it was at
  5d32299, where it cost company 3 of seed 60613 its whole fleet. That is stated
  rather than dressed up: **this bundle removes a reachable defect and buys no
  measured improvement.**
- **So the guards are the evidence, and both are red on the old code.**
  `tests/unit/aiForeignStation.spec.ts` builds the situation directly - a rival
  bay on the tile the project planned its stop at - and fails two of its four
  assertions on the pre-fix simulation (the project buys its fleet and advances
  to stage 2); its two controls, the company's OWN stop on that tile and the
  command layer's own `Occupied`/`NotYours` verdicts, pass on both sides. And
  `watchForeignStops` in `tests/balance/aiRefusals.ts` is a second pure observer
  over the same sink `recordOutcomes` uses, watching ACCEPTED `SetLineOrders`
  and `SetVehicleOrders` for a station order the issuing company does not own -
  the audit that is not blind to a sequence of accepted commands, asserted per
  swept seed.
- **What that observer says about the eight seeds, and it is worse than the one
  report.** At 5d32299 it fires **five** times over two seeds: twice on 60613
  (ticks 31,068 and 943,468 - the second is the six stranded buses) and **three
  times on seed 4711**, at ticks 31,068, 865,868 and 1,057,868. 4711 is the
  RECORDED seed, the swept seed, and the one every AI claim in this project was
  ever measured on: the default two-seed sweep would have been red. Said
  precisely, because the two seeds differ: on 4711 the adopted stop did the
  company no visible harm - it ends with its line, six vehicles and no `NoRoute`
  - so a rival's station is sometimes simply a free ride, and on 60613 it cost
  the whole fleet. Neither is something the AI should do by accident. At HEAD
  the observer is **zero on all eight seeds**, before this fix as well as after
  it, which the bit-identical sweep proves: had any adoption happened, refusing
  it would have changed the run.
- **`SetVehicleRunning|noRouteToStop` is deliberately NOT declared.** It was
  D-223's whole visible trace; a refusal whose cause has been removed must stay
  red if it returns.
- **One refusal WAS declared, with its measurement**:
  `BuyRoadVehicle|insufficientFunds`, seen x4 on seed 2718 against 8 accepted
  and x3 on 12345 against 21. It is the road twin of the already-declared
  `BuyTrain|insufficientFunds` and the same D-158 bottleneck - a company that
  has spent on way and stops and cannot crew the next line. It appears on
  neither of the two default sweep seeds, which is why nothing had named it.
- **No save bump, verified rather than assumed.** The change is one ownership
  test inside a private helper of `src/sim/ai/ai.ts`; no field, layer or entity
  changed shape, and no world on the eight seeds even reaches a different state,
  so SAVE_VERSION stays 30, the soak hash `1f76e2df98be99a3` stands at 191
  commands (re-run, not presumed) and the canonical cross-OS pin
  `ddaacd4b970d31db` did not move.

### D-224 The per-personality value floors, restored - and "the richest competitor is solvent" re-measured before it was kept

**A band moved without a complete trace, and this entry is the trace.** At
b9c337a `aiGame` carried a three-row `VALUE_FLOOR_CT`: Rail and Road at
`-(START_CAPITAL_CT[Normal] + LOAN_MIN_LIMIT_CT)`, TownNetwork at **0**. D-220
replaced the whole map with one `TOTAL_EXPOSURE_CT` applied to every row. **Two
of those three rows lost nothing**: D-211 had already moved Rail and Road TO the
exposure bound, with its own A/B trace and its own admission that this was a
loosening. **The third row did**, and it went without an entry of its own.

- **What the old floor asserted.** `TownNetwork: 0` is not an exposure bound: it
  says the town-network competitor finishes its quarter century having destroyed
  **none of its own equity**. It came from M11 stage C2 (D-156), pinned under a
  measured run - road solvent at 544,857 EUR, rail alive at -15,142, the town
  network wound up at +96,512 - and the 0 is the floor under that last figure.
- **What was measured now, on eight seeds and twenty-five years each.** At
  D-220's own commit, before the profitability floor of D-221 existed, the
  town-network row was the worst company in the game on nearly every seed:
  -117,468 [X], -325,286 [X], -415,716 [X], +147,155, -168,859 [X], -290,949
  [X], -145,573 [X], +23,385 [X] - **six of eight below zero, seven of eight
  wound up, and three of the four seeds this file sweeps red**. At today's HEAD,
  same eight worlds: +383,214, +500,000, +456,327, +412,641, +500,000, +410,475,
  +382,931, +500,000 - **eight of eight above the floor, the tightest by 382,931
  EUR.**
- **Why restoring it is not a re-band.** The number is not fitted to anything:
  it is zero, it was zero in M11, and it has 382,931 EUR of margin on the worst
  of eight seeds. What it guards is exactly the thing D-221 fixed - a town-pair
  bus business that loses money on a generated map - and it is the one assertion
  in the file that would go red if that came back, because an exposure bound of
  -800,000 EUR sits comfortably below every one of those eight negative figures.
  Rail and Road stay at the exposure bound for D-211's reason, and the exposure
  bound now applies to Expansive and Conservative as well, which is what D-220
  added and is kept.
- **The register entry D-220 owed.** Said plainly, because that is the standing
  rule here: replacing the three floors with one exposure bound WAS a weakening
  for the town-network row, it was not declared, and the reason it was not
  noticed is that the row it weakened was deeply negative on three of the four
  swept seeds at the time - the assertion would have been red, and a floor that
  is red is a floor somebody deletes. It is restored now because the simulation
  earned it.

**And the claim beside it, re-measured rather than kept on faith.** "The richest
competitor is solvent" is asserted per swept seed. On seed 60613 at 5d32299 it
is **false** - the richest of the three finished at +23,385 EUR and was wound up
- which is what the verifier found. Re-measured over all eight seeds at HEAD it
holds: 4711 540,495; 4713 1,687,871; 4712 500,000; 4714 500,000; 2718 500,000;
31415 500,000; 60613 500,000; 12345 383,214, none of them bankrupt. So it stays,
and the comment above it now says on which worlds that was measured and where it
was false - the project's rule is that a test asserts what holds, and what makes
this one honest is the eight-seed measurement rather than the four-seed sample
it runs on.

**No band was loosened.** Nothing in `tests/balance` moved except in the
tightening direction: one restored floor, one new per-seed audit, one newly
declared refusal, and a trace comment re-measured. SAVE_VERSION stays 30.

---

## The AI's residuals: a traced regression and a false stated cause (2026-08-11)

### D-225 Seed 918273 traced: the profitability floor refused nothing, and what killed the line was a factory the AI woke and never collected from

**A seed nobody had played got worse and no report named it.** At 5d32299 seed
918273 read p2 232,129 | p1 828,767 with one line and six vehicles | p4 -58,032,
total 1,002,864 EUR; at HEAD it reads p2 -130,562 [X] | p1 437,994 with nothing
running | p4 412,615, total 720,047. The obvious suspects were D-221's
profitability floor and D-222's constants. **Both are refuted by the trace, and
the trace names a third cause that is neither of them.**

**The floor refused nothing.** Company 2 (Road personality) builds the SAME line
at HEAD that it built at 5d32299, at the IDENTICAL tick 5,734 (game month
1950.0), with the identical six lorries: coal from the mine at 67,139 to the
steel mill at 76,187, 49 tiles. `projectLine` passes it; it sits at rank two of
the opportunity list in both builds. It then runs for NINE GAME YEARS at 4.2-5.0
times its fleet's half-yearly bill - 24,662 to 29,130 EUR per review window,
which are the figures the 5d32299 run earned on the same line. Nothing D-221 or
D-222 added ever touched it.

**What killed it, month by month.** The instrument is a probe on the mill's own
tile (76,187) plus a log in `closeDeadLine`, both temporary and reverted:

```
1950.0   the coal line opens; the mill takes coal and cannot produce -
         a SteelMill wants coal AND iron ore, and nobody brings iron ore
1950-56  mill: open, prod 0, monthsWithoutCollection 0, inputStock pinned at
         1,440 (the eight-month cap) - DORMANT, and dormant is immortal
         (CLAUDE.md's own rule, 7.3 / D-086)
1956.4   tick 461,734: the AI opens a SECOND line into the SAME station -
         iron ore from 180,171, 105 tiles, six lorries
1956.7   the mill produces for the first time: prod 168, out 168.
         monthsWithoutCollection starts, because nothing carries steel away
1956.8   through 1958.6: neglect 1, 2, 3 ... 23. Every third month 168 units
         of steel go into the station's waiting pile and rot there - D-085,
         a works is judged on what left ON A VEHICLE, never on what a
         station took
1958.7   neglect 24. The mill CLOSES: map.industryId at its tile is -1 and
         the station's servedIndustries is empty
1958.11  the iron line earns 17,333 against 32,754 - the sink is gone
1959.5   the iron line gains 0 over a whole review window; closed, fleet sold
1959.7   the coal line - nine years old - gains 0; closed, fleet sold
1959-75  company 2 never builds again and coasts 856,831 -> 437,994 EUR
```

At 5d32299 the same mill reads `open=true prod=0 in=1440/0 neglect=0` at every
one of the twenty-five year boundaries. **The coal line survived there because
the sink was never woken.**

- **So the AI destroyed its own best business by completing a factory's input
  set.** `onwardLegExists` already guards a pair whose sink PRODUCES - "a pair
  ending at one is only offered when the NEXT leg is there to be built" - but it
  asks whether an onward leg is POSSIBLE, never whether this company is going to
  build it. It is the D-219 shape a third time: two halves of one decision
  disagreeing about what is really going to happen.
- **And the onward leg WAS there, priced, and ranked FIRST for twenty-two game
  years.** The same trace: from tick 221,734 (1953.0) to the end of the game
  company 2's candidate list is headed by
  `road cargo=Steel d=59 76,187->96,131`, `projectLine` margin **4.230** against
  the 1.25 floor. It was skipped **67 times** with one reason - `noBorrow`. It needs 469,594-478,046
  EUR at the 1.4 capital factor and the company held 413,688-437,977 in cash; a
  Road personality that already runs one line may not borrow, because
  `bootstrapping` is `lines.length === 0` and only Expansive is exempt (D-154).
  **The AI missed the onward leg of its own chain by about 8 % of its price**,
  and then spent some 270,000 EUR on the feeder that killed the chain instead.
- **Why 5d32299 did not do it is chaotic, and it is stated as chaotic.** By 1956
  the two worlds have diverged - at 5d32299 company 2 owns 17 stations and six
  dead lines against four stations and one live line at HEAD, and the iron-ore
  pair 180,171->76,187 is simply not in its candidate list there. D-221's floor
  is what removed the junk town-pair lines and therefore what made this world
  reachable; it is the occasion, not the defect. **The defect is that the AI
  feeds a works it does not collect from, and it would fire on any world that
  offered the same shape.**
- **Nothing is fixed here, deliberately.** The two candidate cures - refuse a
  pair that would COMPLETE a sink's input set unless we collect its output, and
  let a company borrow for the onward leg of a chain it already feeds - are both
  simulation changes that re-roll twelve seeds, scenario 5, `aiGame`, the soak
  fixture and the cross-OS pin, and the brief for this bundle scoped a fix to
  the case where the FLOOR's projection is wrong. It is not. What this entry
  buys is that the next pass starts from a measurement rather than from a total:
  **the profitability floor is not the cause of seed 918273's regression, and
  saying that it was would have been the class of claim D-227 supersedes.**

### D-226 The twelve-seed bar, re-measured at HEAD - and the rail bundle that was never landed

**Measured at HEAD e06cd94**: twelve seeds, twenty-five years each, three
competitors, 256 map, a player company that does nothing. The previous bundle's
rail shuttle was measured and REVERTED, so there is no rail bundle in the tree
and this table is HEAD's. It reproduces that bundle's own HEAD figures to the
euro, which is what says the two harnesses measure the same thing.

Format: personality, value EUR, [X] wound up, lines / vehicles / stations, and
owned rail tiles where there are any.

| seed   | competitor 1                | competitor 2              | competitor 3                   |
| ------ | --------------------------- | ------------------------- | ------------------------------ |
| 4711   | p0 55,935 0/0/2 115rt       | p4 412,641 0/0/4          | **p1 540,495 1/6/4**           |
| 4713   | p4 410,475 0/0/4            | **p0 1,687,871 3/18/4**   | p3 500,000 0/0/0               |
| 4712   | p4 500,000 0/0/0            | p2 63,551 0/0/2 126rt     | p0 500,000 0/0/0               |
| 4714   | p4 382,931 0/0/5            | **p2 415,718 1/6/5 62rt** | p3 500,000 0/0/0               |
| 2718   | p3 500,000 0/0/0            | p0 -196,058 0/0/5 18rt    | p4 500,000 0/0/0               |
| 31415  | p3 500,000 0/0/0            | p4 456,327 0/0/2          | p2 -103,538 [X] 1/0/4 149rt    |
| 60613  | p0 -157,950 [X] 0/0/2 88rt  | p4 500,000 0/0/0          | p1 448,473 0/0/3               |
| 12345  | p4 383,214 0/0/6            | **p2 337,369 2/9/6**      | p0 96,345 1/1/2 99rt (1 train) |
| 77003  | p4 399,565 0/0/5            | **p0 300,967 1/6/5**      | p1 409,410 0/0/4               |
| 918273 | p2 -130,562 [X] 0/0/4 235rt | p1 437,994 0/0/5          | p4 412,615 0/0/4               |
| 131313 | p1 454,465 0/0/2            | p2 500,000 0/0/0          | p3 500,000 0/0/0               |
| 860213 | p4 341,841 0/0/8            | p3 500,000 0/0/0          | p2 -394,521 [X] 0/0/4 125rt    |

**Totals: 12,965,575 EUR over thirty-six competitors, 4 wound up, 46 living
vehicles of which exactly ONE is a train, `NoRoute` 0 on every seed, rail lines
alive 1.**

**The bar, as two numbers, because it is two questions.**

- **At least one competitor finishes year twenty-five alive with a line and two
  or more vehicles: 5 of 12 seeds** - 4711, 4713, 4714, 12345, 77003. It is
  unchanged from the previous bundle's measurement of the same HEAD, and of the
  four seeds nobody had played before that bundle - 77003, 918273, 131313 and
  860213 - exactly ONE contributes. Seed 31415's rail company owns a line and no
  vehicle and is wound up, which is why the question is "alive AND crewed" and
  not "has a line".
- **The richest competitor owns something it built: 5 of 12 seeds** - 4711,
  4713, 12345, 77003, 918273. **On seven of twelve the richest competitor is one
  that never left the yard with its 500,000 intact**, which is the claim
  `aiGame.spec.ts` names as red on 4712 and refuses to assert - now measured
  over three times as many worlds. On only **2 of 12** does the richest
  competitor also own a fleet (4711, 4713).
- **The rail personality still has no business.** One rail line and one train
  alive in thirty-six competitor-lifetimes; five of the six companies that own
  rail tiles at year twenty-five own no train at all. That is D-222's named
  remaining cause, unmoved.

### D-227 The repo-wide `format:check` is red because nothing has ever run the formatter, and the CRLF working tree is measurably not the cause - superseding the claim in D-221 and two bundle reports

**Three bundle reports stated that the red `npm run format:check` at HEAD is
caused by "the CRLF working tree of CLAUDE.md's environment note"** - D-221 says
it in its own verification paragraph, and two reports repeat it. An independent
verifier measured that this is false. It is, and this entry is the correction,
because this project supersedes a wrong entry with a named one and never
rewrites it quietly.

**What is measured, at HEAD, on a clean tree:**

- **Every file in the working tree is LF.** `git config core.autocrlf` answers
  `false`, `git check-attr` reports `text: set, eol: lf` for the sources
  (D-168's pin), and a byte scan for carriage returns over the failing files
  finds none.
- **A CRLF file would fail differently, and the difference is arithmetic.**
  `.prettierrc.json` sets `endOfLine: "lf"`, so prettier rewrites EVERY line of
  a CRLF file. Converted to CRLF, `src/sim/ai/evaluate.ts` (811 lines) produces
  a **1,622-line** diff - two per line, every line. The 31 files that really
  fail produce **3 to 520** diff lines each, and every one of those diffs is a
  wrap width or a table column.
- **The real cause is that the formatter has never been run on them, and
  nothing gates it.** `format:check` exists in `package.json` and appears in
  **no CI job** - `.github/workflows/ci.yml` runs typecheck, lint, determinism,
  `npm test` and the soak - and there is no git hook and no husky. Checked file
  by file: **25 of the 31 were already prettier-dirty at the commit that ADDED
  them** (SPEC.md at `6b90035`, README.md at `a6f5bbc`, `tools/bake-lib.ts` and
  `tools/assets-manifest.json` at `69c0e7b`, `src/sim/lines/metrics.ts` at
  `0d0c6f6`, and so on), and the other six - CLAUDE.md, DECISIONS.md,
  `src-tauri/tauri.conf.json`, `src/sim/commands/execute.ts`,
  `src/ui/FleetPanel.tsx`, `tests/unit/terraform.spec.ts` - were clean when
  written and drifted under later hand edits.
- **What the diffs actually are**, sampled in all four families: markdown pipe
  tables written without padded columns, which prettier pads (CLAUDE.md,
  DECISIONS.md, README.md, SPEC.md, SPEC2.md - 54 to 520 lines each);
  `*emphasis*` where prettier writes `_emphasis_`; hand-broken JSON arrays
  prettier collapses onto one line (`tauri.conf.json`,
  `tools/assets-manifest.json`); and TypeScript wrapped by hand on both sides of
  `printWidth: 100` - `src/sim/lines/metrics.ts` has one line broken at 95
  characters and another left unbroken at 101, in the same file.
- **SPEC.md and SPEC2.md are a separate, permanent case, and it is named.**
  CLAUDE.md's first sentence is that SPEC.md "is the original brief, verbatim";
  reformatting it would break that rule to satisfy a formatter. Those two files
  are 1,002 of the roughly 1,300 dirty lines in the repository.

**Nothing is reformatted here.** The repair belongs in its own session with its
own diff - touching 31 files inside a bundle about the AI is exactly the
sweeping change this project refuses - and it has to decide the SPEC question
first. What changes now is that the stated cause is true: the CRLF paragraph in
CLAUDE.md's environment note stays a correct repair procedure for a checkout
that predates D-168 on an `autocrlf=true` machine, and it is no longer offered
as the explanation for THIS repository's red check.

---

## The rail question, decided on evidence (2026-08-11)

### D-228 The competitor's railway is unaffordable rather than unprofitable: the shuttle rebuilt, measured over sixteen seeds and refused - and the project pricing it exposed, fixed

**The programme's one unwon claim was that a player never meets a railway
competitor** (D-226: one train on one line in thirty-six competitor-lifetimes).
A previous bundle built a two-train `planRailShuttle`, measured it and reverted
it because it turned scenario 5 red. This bundle rebuilt it from that
description, reproduced the conflict, traced it, and lands the half the evidence
supports. **The shuttle is not shipped. What is shipped is the defect the
shuttle exposed**, and it is worth **+1,260,517 EUR over sixteen seeds with one
fewer winding-up**, with every band in `tests/balance` untouched.

**What was rebuilt, and it works.** `planRailShuttle` took the assistant's own
single-track alignment and hung a passing place on each terminus: a turnout one
step off the spine at forty-five degrees, so the branch MERGES rather than
crosses (D-082), and a second platform face beside the first. No signals
anywhere, which is the whole safety argument - `sectionEnd` then runs to the END
of a train's route, so a departing train claims the whole way to its platform
all or nothing and no second train can take a tile of it. The second train waits
at a face of its own. `platformFor` hands each train the first face nobody holds
(D-049/D-080), and the faces have to be listed END first, because a train
stopped on the entry tile stands with its tail out on the running line.
**Proven, not argued**: two trains, one game year, on the railway
`enqueueInfrastructure` really orders - both worked both termini five times or
more, zero `NoRoute`, nothing permanently blocked. D-059's stated limitation is
answerable.

**And it does not produce a railway competitor. Measured, sixteen seeds,
twenty-five years each, three competitors, 256 map, a player company that does
nothing:**

| what                           | HEAD 807a0af | shuttle alone | shuttle + the pricing fix | **pricing fix alone (shipped)** |
| ------------------------------ | ------------ | ------------- | ------------------------- | ------------------------------- |
| total value EUR                | 19,994,405   | 19,401,262    | 23,333,839                | **21,254,922**                  |
| wound up, of 48                | 4            | 6             | 4                         | **3**                           |
| living vehicles                | 88           | 88            | 102                       | **90**                          |
| **trains alive**               | **1**        | **0**         | **0**                     | **0**                           |
| **rail lines alive**           | **1**        | **0**         | **0**                     | **0**                           |
| seeds with a crewed competitor | 8/16         | 8/16          | 9/16                      | 8/16                            |

The shuttle's own direct effect is that a railway costs MORE and is abandoned
more often. The +2 M it adds on top of the pricing fix is chaos - different
worlds, not railways - and it arrives with zero trains and zero rail lines. On
scenario 5 it takes the rail personality from **228,047 EUR alive to -238,132
[wound up]**, which is the conflict the previous bundle reported, reproduced.

**The trace, and it names a cause neither the previous bundle nor the brief
had.** The instrument is the command-outcome sink of D-220 plus a temporary
probe in `startProject` and in the buying stage, both reverted.

```
seed 4711, company 1, the Rail personality, twenty-five years:
  ONE project ever started, at tick 1,445,601 - game year 1970
  distance 72 tiles       the way the ASSISTANT lays: 119 tiles of track
  way      185,166 EUR
  stops    122,872 EUR    EIGHT platforms and a shed; the estimate quoted FOUR
  trains   351,472 EUR each, two of them
  estimate 1,010,982 EUR  against cash 500,000 and a credit line of 300,000
  -> TakeLoan accepted 1  - a PART loan, whatever room there was
  -> BuildTrack accepted 5, BuildRailStop accepted 9: the railway IS built
  -> BuyTrain accepted 1, cmd.reject.insufficientFunds 1
  -> year 25: value 32,127 EUR [wound up] - a line, a railway, one train,
     and the interest
```

- **`takeLoan` took what the credit line had ROOM for and reported success
  either way.** `startProject`'s own stated rule, two lines above its dry run,
  is that "a loan must never be taken for a line that cannot be laid"; the
  second half of it - that a line whose fleet there is no money for is not laid
  but abandoned half built - was never enforced. `borrowableCt` asks the same
  arithmetic WITHOUT taking the money, and a project whose cash plus its whole
  remaining credit line is under its own ESTIMATE is not started. The 1.4
  capital factor stays what it is, a reserve; what may not be crossed is the
  estimate itself.
- **And the estimate was not the project's.** It priced the STRAIGHT LINE and a
  FIXED `AI_PLATFORM_TILES * 2` whatever the plan really was. `BuiltLine`
  carries `platformTiles` and `wayCostCt` now - the stops the plan really orders
  and the planner's own price for the alignment it really orders - and
  `startProject` does its dry run FIRST and prices that. It also budgets for the
  fleet the railway that will really be laid can carry rather than for the
  largest any railway could. This is D-219's lesson applied to money: a filter
  and the builder it filters for must not disagree about what is being built.
- **So the shuttle exposed the defect rather than causing it, and the brief's
  preferred option was taken - the deeper cause was fixed first and
  re-measured. It did not resolve the conflict, because the deeper cause is not
  the one that had been named.** That candidate - `fleetFor` sizing against
  UNGATED output while the 7.3 collection gate caps the offer at the station
  rating times the covered share (D-063/D-064) - was built here as
  `fleetThatPays`: the largest fleet up to the advisor's figure that still
  clears `AI_MIN_PROFIT_MARGIN`, quoted through `projectLine`, whose lift is
  already capped at what the line is offered. **It is not shipped either, and
  the reason is arithmetic rather than taste**: it can only bind where a railway
  carries more than one train, `AiProject.railTrains` is 1 on every railway the
  builder lays without the shuttle (D-222 measured ten of ten), and
  `fleetThatPays(..., 1)` returns 1. The world in which it fires is the shuttle
  world. A second train the gate never feeds was never bought here, so the
  defect it removes is one this bundle did not measure - and an unmeasured
  change is not what this project ships.

**The real reason there is no rail competitor, stated as a number.** A two-train
railway over the AI's own 72-tile coal pair is priced at **1,010,982 EUR**
against a starting company's **500,000 of cash and a 300,000 credit line**. It
is not that the railway loses money - `projectLine` passes it at a margin above
the floor - it is that no competitor can raise the price of one. With the
pricing fix in place the AI correctly refuses those projects, which is why
trains alive goes 1 -> 0 and why that is an improvement rather than a
regression: the one train of D-226 stood on a railway its owner could not
afford, and seed 12345's rail company now runs a ROAD line worth **932,261 EUR**
instead of a railway worth 96,345. **A player will still practically never meet
a railway competitor, and this entry says why in euros rather than in
adjectives.** What would change it is a competitor that reaches a railway out of
a road business it has already made money on - the `bootstrapping` rule of
D-154 forbids exactly that borrowing, and D-225 measured it costing seed 918273
the onward leg of its own chain by 8 % of the price - or a first railway that
costs less than a company's whole capital. Both are simulation changes with
their own bundles, and neither is a constant.

**Two rows got worse and are named**, because refusing one project re-rolls the
world that follows it: seed 246813's expansive company 500,000 -> **106,114**
with a 39-tile railway (that seed falls 1,066,232 -> 818,052), and seed 860213's
rail company -394,521 [X] -> -354,955 [X] is better and still wound up. Seeds
4711, 4713, 4712, 4714, 77003, 131313, 8675309, 555777 and 22071969 are
**identical to the euro**, which is what says the soak fixture's own game is
untouched.

**Bands: nothing moved, and that was measured rather than assumed.** Scenario 5
reads road **1,022,084** (identical to the euro, 2 lines, 12 vehicles, growing
through its year-21 renewal), rail **228,581** against 228,047 (+534, alive, 2
stations - `rail.bankrupt === false` HOLDS and was not re-banded), expansive
**-241,375** against -241,309 (wound up, 5 stations, 1 line, inside its
exposure). The whole of `tests/balance` is green at 81 tests; `aiGame`'s four
swept seeds are bit-identical; `tests/determinism` is 33 green and the soak
fixture replays unchanged. No constant in `src/sim/constants.ts` was touched and
`SAVE_VERSION` stays 30 - `BuiltLine` is a transient return record and nothing
in `AiState` or `AiProject` changed shape.

**The guard is `tests/unit/aiAffordable.spec.ts`, and it is RED on the pre-fix
simulation**: two of its three assertions fail there, one because `BuiltLine`
has no `platformTiles` to compare against the stops the plan enqueued, and one
because the short company takes its part loan (`TakeLoan` accepted 1 where 0 is
asserted). Its bar is derived rather than typed in - it plays the same project
on the same world with money, reads what the company really sank into it, and
then gives a second company a quarter of that with its credit line already drawn
down to ten loan steps.

---

## The profit floor, swept (2026-08-11)

### D-229 `AI_MIN_PROFIT_MARGIN` swept over fifteen values: 1.25 -> 2.00, chosen on opponents that play rather than on money, and the median derivation that produced 1.25 re-measured and found to be the right arithmetic on the wrong quantile

**D-221 derived `AI_MIN_PROFIT_MARGIN = 1.25` as `1 / 0.815` - the reciprocal of
the median realisation of 114 measured lines. It is a principled derivation with
exactly ONE point measured, and an independent verifier's recommendation was to
sweep it.** This bundle is that sweep: fifteen values from 0.60 to 3.00, each
played over the sixteen acceptance seeds on a 256 map with three competitors for
twenty-five years (48 companies a value, 720 quarter centuries in all), plus
scenario 5's three personalities on a 512 map at every value. The constant moves
to **2.00**, one existing unit assertion is re-anchored on a measurement that
proves its instrument could not see the property it asserted, and one unit
fixture moves to a map size the game actually offers. **No band moved.**

**THE CURVE, which is the finding rather than the winner.** "Crewed" is a
company that finishes the quarter century running a line with a fleet - the
thing a player actually meets; "husk" is stations standing with no fleet at all;
"idle" is a company that never built anything. Every row is 48 companies over
the same sixteen seeds:

| floor | value EUR  | wound up | crewed | seeds crewed | lines built | lines alive | vehicles | husks | idle | rail lines | trains |
| ----- | ---------- | -------- | ------ | ------------ | ----------- | ----------- | -------- | ----- | ---- | ---------- | ------ |
| 0.60  | 10,768,464 |       14 |      7 |         7/16 |         177 |          11 |       48 |    31 |   10 |          0 |      0 |
| 0.80  | 13,375,268 |       10 |      4 |         4/16 |          98 |          13 |       42 |    35 |    9 |          0 |      0 |
| 0.95  | 14,122,339 |        8 |      5 |         5/16 |          99 |          13 |       48 |    34 |    9 |          0 |      0 |
| 1.10  | 16,057,291 |        6 |      4 |         4/16 |          74 |           9 |       32 |    29 |   13 |          0 |      0 |
| 1.25  | 21,254,922 |        3 |      9 |         8/16 |          69 |          16 |       90 |    26 |   13 |          0 |      0 |
| 1.40  | 24,182,147 |        0 |      7 |         7/16 |          45 |          11 |       61 |    16 |   24 |          0 |      0 |
| 1.55  | 24,814,668 |        0 |      8 |         8/16 |          37 |          13 |       78 |    12 |   28 |          0 |      0 |
| 1.70  | 25,198,926 |        1 |     11 |        10/16 |          37 |          16 |       96 |     8 |   29 |          0 |      0 |
| 1.80  | 25,077,729 |        0 |     11 |        10/16 |          37 |          16 |       93 |     9 |   28 |          0 |      0 |
| 1.90  | 25,422,832 |        0 |     12 |        11/16 |          36 |          17 |       99 |     8 |   28 |          0 |      0 |
| 2.00  | 25,597,942 |        0 |     13 |        11/16 |          37 |          18 |      105 |     6 |   29 |          0 |      0 |
| 2.20  | 25,883,582 |        1 |     13 |        11/16 |          36 |          19 |      108 |     4 |   31 |          0 |      0 |
| 2.35  | 26,727,677 |        1 |     13 |        11/16 |          33 |          20 |      114 |     4 |   31 |          0 |      0 |
| 2.60  | 24,616,844 |        0 |     10 |         9/16 |          30 |          12 |       72 |     7 |   31 |          0 |      0 |
| 3.00  | 24,606,487 |        0 |      7 |         6/16 |          20 |           8 |       48 |     8 |   33 |          0 |      0 |

Scenario 5 at every value, and the road row is the one to read first:

| floor | road (seed 4711)     | rail (seed 3)          | expansive (seed 2)      |
| ----- | -------------------- | ---------------------- | ----------------------- |
| 0.60  | 396,542 0l/0v/4s     | 228,581 0l/0v/2s       | -241,375 [X] 1l/0v/5s   |
| 0.80  | 1,022,084 2l/12v/3s  | 228,581 0l/0v/2s       | -241,375 [X] 1l/0v/5s   |
| 1.25  | 1,022,084 2l/12v/3s  | 228,581 0l/0v/2s       | -241,375 [X] 1l/0v/5s   |
| 1.40  | 1,022,084 2l/12v/3s  | 228,581 0l/0v/2s       | 383,190 1l/6v/4s        |
| 1.55  | 1,022,084 2l/12v/3s  | 228,581 0l/0v/2s       | 383,190 1l/6v/4s        |
| 1.70  | 1,022,084 2l/12v/3s  | 62,433 [X] 1l/0v/4s    | 2,153,604 4l/23v/5s     |
| 1.80  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 2,153,604 4l/23v/5s     |
| 1.90  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 2,153,604 4l/23v/5s     |
| 2.00  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 2,153,604 4l/23v/5s     |
| 2.20  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 2,153,604 4l/23v/5s     |
| 2.35  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 1,737,757 3l/18v/7s     |
| 2.60  | 1,022,084 2l/12v/3s  | 1,802,165 3l/18v/6s    | 2,043,193 3l/18v/7s     |
| 3.00  | 356,068 0l/0v/2s     | 1,078,817 1l/6v/4s     | 2,043,193 3l/18v/7s     |

**WHAT WAS OPTIMISED, and why it is not the money.** Total company value alone
is the wrong objective and this curve shows exactly how it fails: at 2.60 and
3.00 the total is still 24.6 M with the AI building almost nothing (20 lines
built against 69 at 1.25, 33 of 48 companies never leaving the yard), and a
world with nobody in it is a worse GAME than a slightly poorer one with
opponents. The property optimised is **competitors that finish running a
business - a line with a crew** - with the number of SEEDS carrying at least one
beside it, and the tie broken by MINIMALITY: **2.00 is the smallest floor that
reaches the plateau maximum** (13 crewed companies, 11 of 16 seeds), the plateau
1.90 - 2.35 is broad rather than a peak, and the cliff at 2.60 is three grid
steps away.

That the money is not made by inaction is measured rather than asserted.
Against the **24,000,000 EUR** the 48 companies start with, the field at 1.25
**destroys 2,745,078** of it and at 2.00 **creates 1,597,942**. Living vehicles
rise 90 -> 105, lines alive 16 -> 18, husks fall 26 -> 6, windings-up 3 -> 0.

**WHAT THE ALTERNATIVES COST, stated in the same units.** Staying at 1.25 costs
4,343,020 EUR, three seeds of sixteen where the player meets nobody running
anything, four crewed competitors, fifteen living vehicles, three companies
destroyed and twenty husks left standing on the map. Taking the argmax 2.35 buys
1,129,735 EUR more and **not one more crewed competitor**, while adding a
winding-up, making scenario 5's expansive company worse (2,153,604 ->
1,737,757), and sitting one grid step from 2.60, where the total falls 2.1 M and
two seeds lose their live opponent. Choosing 1.55 - the last value at which
every existing assertion stays green untouched, see below - keeps the money
(24,814,668) and **loses the point**: 8 crewed companies against 9 at 1.25, i.e.
it buys solvency without buying an opponent.

**THE COST OF THE CHOICE, which is real and is not hidden.** Competitors that
build nothing at all rise **13 -> 29 of 48**, and one world of sixteen (seed
131313) ends with no competitor infrastructure at all where 1.25 left one
company with two stations and no fleet. On the 128-tile map used only by a unit
fixture the competitor goes completely silent (measured: not one command in
120,000 ticks on any of eight seeds, against 55 by tick 20,000 at 1.25) - 128 is
not a size the game offers (`MAP_SIZES` is 256, 512, 1024, 2048), and on eight
128-maps played to year twenty-five the field was already a wasteland at 1.25:
24 companies owning ONE living vehicle between them, against six vehicles and
one crewed company at 2.00.

**THE RE-DERIVATION, AND THE DISAGREEMENT THAT IS THE FINDING.** D-221's own
instrument was rebuilt - every project logs the `projectLine` projection it was
built on, every line review logs what it earned against that projection's own
whole-bill denominator - and run over 51 quarter centuries at a near-unfiltered
floor of 0.60, which is the sample the derivation needs and 1.25's sample was
not (a floor censors the very lines its derivation is measured on). 182 lines,
every one of them reviewed:

- the median line realises **0.603** of its projection (D-221 measured 0.815 on
  114 lines of eleven games), quartiles 0.058 and 1.310;
- **the projection at which the MEDIAN line covers its whole monthly bill in
  fact is 1.257** - which reproduces the shipped 1.25 on a sample sixty percent
  larger. **D-221's arithmetic is not wrong.**
- the same statistic at the THIRD QUARTILE - the projection at which three
  quarters of built lines cover their bill - is **2.26**, and it lands inside
  the sweep's measured plateau.
- coverage by projected band on that unfiltered sample: under 0.9 **18 %**,
  0.9-1.25 **40 %**, 1.25-1.9 **53 %**, 1.9-2.6 **75 %**, 2.6 and over **88 %**.

So the two do not disagree about the arithmetic; they disagree about the
QUANTILE, and the sweep is what settles it. A median criterion is the right one
only when a miss costs what a hit gains. A missed line does not merely fail to
compound: it consumes the capital, the review cycle and one of the company's
`AI_MAX_LINES` slots, and the fourteen windings-up at the bottom of the table
are that asymmetry priced. Read forwards, the coverage figures say the same
thing - at 1.25 the admitted lines are a coin toss (53 % of the band above it
ever cover their bill), at 1.9 - 2.6 three quarters do.

**A STATED SENSITIVITY, REFUTED - and this is why the old sentence is quoted in
the constant rather than deleted.** D-221 wrote: "seed 2's expansive company
builds at 1.435 and 1.488 and seed 3's rail company at 1.881, so a floor above
1.435 would stop two of scenario 5's three personalities building at all."
Measured at 2.00, both build MORE: the rail company goes from a **228,581 EUR
husk with no line and no vehicle** to **1,802,165 EUR with 3 lines, 18 vehicles
and 6 stations**, and the expansive company from **-241,375 [wound up]** to
**2,153,604 EUR with 4 lines and 23 vehicles**. Refusing the line a company
would have built does not stop the company; it sends it to the next candidate,
later, with its capital intact. The prediction was made from the projections of
the lines those companies built THEN, and a floor changes which lines exist.

**WHAT THIS CONSTANT DOES NOT BUY: a railway competitor.** Rail lines alive and
trains alive are **ZERO at all fifteen values**, 0.60 to 3.00, over all 720
quarter centuries. The programme's one unwon claim (D-226, D-228) is untouched
by this floor, and the sweep is evidence for D-228's diagnosis rather than
against it: what stops a competitor's railway is affordability, not
profitability.

**THE HONESTY LINE, because this is a constant chosen against measurements that
include the acceptance scenarios.** The choice was made on properties the bands
do not assert - crewed competitors, husks, capital created against capital
started with - and every band was then re-measured rather than consulted. **None
moved, and none was widened.** Scenario 5: road **1,022,084 EUR, identical to
the euro** (and identical at every floor from 0.80 to 2.60 - the floor never
reaches that company's list), still 2 lines, 12 vehicles, still compounding
through its year-21 renewal; rail 228,047/228,581 -> **1,802,165, alive**, which
its band asserts only as "alive with two stations"; expansive -241,309/-241,375
[wound up] -> **2,153,604**, which its band asserts only as "builds, inside its
exposure". The whole of `tests/balance` is green at **81 passed, 2 skipped**.
`aiGame`'s swept seeds change - they are the same sixteen-seed measurement one
map size down - and every assertion in that file holds on all four.

**TWO UNIT ASSERTIONS WENT RED AT 2.00, AND NEITHER WAS WIDENED.**

1. `tests/unit/aiModeFallback.spec.ts` asserted `keptRail > 0`: some rail
   personality on some seed still prefers a railway. Measured at world creation
   it is **8 of 32 at 1.25 and 0 of 32 at 2.00** (sixteen seeds x two rail
   personalities; the 1.25 hits are seeds 2718, 60613, 918273, 860213). No
   generated 1950 map offers a railway that clears 2.00 - the industries are
   small and the catalogue is dear. But the property the test wants is TRUE and
   its instrument could not see it: over the sixteen played quarter centuries
   **650 of 5,700 rail-personality scans prefer a railway at 2.00** (11.4 %;
   1,313 of 5,508 at 1.25), and the first rail-first list appears in **1956** on
   seed 4714, 1962 on 4711, 1968 on 4713, never on 4712. The assertion is
   therefore re-anchored on a PLAYED game (seed 4714, early exit at the first
   hit, ~0.9 s) and the world-creation half keeps the fallback branch. A railway
   that becomes worth building as the industries grow and the locomotives
   improve is the right shape for this game.
2. `tests/unit/replayTheatre.spec.ts` needed a competitor that ACTS inside
   20,000 ticks; its subject is the replay SEAL, not the AI's economics. Its
   world was a 128-tile map for cheapness, and at 2.00 the competitor is silent
   there (0 commands in 120,000 ticks on eight seeds). The FIXTURE moved to a
   256 map - the smallest size the game offers - where the first competitor
   command lands at tick 5,601 exactly as before. The recorded replay every
   other test in that file decodes is untouched.

**No save bump and one re-recorded fixture.** `SAVE_VERSION` stays **30**: a
constant's value is not a state shape. The cross-OS canonical pin is unmoved
(its world is the recorded ROAD fixture and carries no AI) - checked by running
`tests/determinism`, 33 green, rather than presumed. The soak fixture IS
re-recorded, because it replays a quarter century WITH competitors:
`1f76e2df98be99a3` -> **`f08265c0152efea9`**, command count **191 -> 143**.

**THE SIXTEEN SEEDS AT 2.00**, personality, value EUR, lines/vehicles/stations:

```
4711     p0   233,189 0/0/3  · p4   471,588 0/0/2  · p1   342,738 1/3/2
4713     p4   500,000 0/0/0  · p0 1,842,457 3/18/4 · p3   500,000 0/0/0
4712     p4   500,000 0/0/0  · p2   329,982 1/6/2  · p0   500,000 0/0/0
4714     p4   500,000 0/0/0  · p2   304,670 1/6/5  · p3   500,000 0/0/0
2718     p3   500,000 0/0/0  · p0   150,934 0/0/4  · p4   500,000 0/0/0
31415    p3   500,000 0/0/0  · p4   500,000 0/0/0  · p2   -48,583 0/0/6
60613    p0 2,015,525 2/12/3 · p4   500,000 0/0/0  · p1   500,000 0/0/0
12345    p4   500,000 0/0/0  · p2   457,387 1/6/4  · p0   392,540 1/6/2
77003    p4   500,000 0/0/0  · p0   401,601 1/6/4  · p1   500,000 0/0/0
918273   p2   397,325 0/0/3  · p1   500,000 0/0/0  · p4   500,000 0/0/0
131313   p1   500,000 0/0/0  · p2   500,000 0/0/0  · p3   500,000 0/0/0
860213   p4   500,000 0/0/0  · p3   500,000 0/0/0  · p2   669,626 2/12/7
8675309  p0   229,438 1/6/6  · p1   596,485 1/6/3  · p4   500,000 0/0/0
246813   p0   370,653 0/0/2  · p4   500,000 0/0/0  · p2   500,000 0/0/0
555777   p4   500,000 0/0/0  · p2   704,636 1/6/5  · p3   500,000 0/0/0
22071969 p1 1,235,752 2/12/3 · p2   500,000 0/0/0  · p4   500,000 0/0/0
```

Total **25,597,942 EUR**, **nobody wound up**, 105 living vehicles, 18 lines
alive, `NoRoute` 0 everywhere, a crewed competitor on **11 of 16** seeds - and
**0 rail lines, 0 trains**, which no value of this constant changes.

---

## A railway needs ground its own stops can still stand on (2026-08-12)

### D-230 The rail planner asks whether a station already stands where its shed will go - the refusal only the FULL balance job could see, traced, and the broader cure measured and refused

**The gate D-220 built went red for the first time, and only in
`npm run test:balance:full`.** `undeclared` collected two pairs on seed 4714 -
`company 2 BuildRailStop|cmd.reject.occupied x1` and `company 2
BuyTrain|cmd.reject.needsRailDepot x1` - and **two bundles in a row missed it
because they ran the default suite**, which plays `AI_SWEEP_SEEDS`' first two
seeds only (D-220's split). 4714 is the fourth. The class of gate that reads a
whole quarter century's command outcomes lives in the four-seed sweep and the
`soak` CI job, nowhere else; a green `npm run test:balance` says nothing about
it. That sentence is in CLAUDE.md's digest now.

**The trace, tile by tile, from D-220's own outcome sink** (seed 4714, company
2 "Nordwind Verkehr", personality Expansive, 256 map):

- **1955-01-28, tick 365,735**: `BuildRoadStop LorryBay` at **171,96** -
  ACCEPTED. The company's own station 1. `roadBits` 8, terrain TownGround,
  owner 2.
- **1955-02-28, tick 371,735**, one `AI_RETRY_TICKS` month later, the same
  company starts a RAIL project over the single-track fallback of D-153:
  `BuildTrack 171,96 -> 196,94` (assistant) ACCEPTED, sixty-two tiles;
  platforms at 172,96 / 173,96 / 195,95 / 194,96 - the route's tiles 1, 2,
  last-1, last-2 - all four ACCEPTED; and `BuildRailStop RailDepot` at
  **171,96**, the route's tile 0, **REFUSED `Occupied`**. The lorry bay is
  standing on it.
- **1955-03-00, tick 372,135**, the next decision cycle: stage 1 finds its two
  platform stations, re-derives the fleet and orders `BuyTrain` at the shed
  tile - **REFUSED `needsRailDepot`**. Stage 2 then finds no vehicle in the
  depot and ends the project. Sixty-two tiles of track and four platforms
  bought, charged upkeep for twenty-three more years, and never crewed.

**So they are ONE defect and not two.** The `BuyTrain` is strictly downstream:
with the shed built there is a shed to buy a train in. And it is not a D-108
race - the bay had been standing for a whole game month and was on the map when
the plan was made. **Neither was declared. Both were fixed at the cause.** The
same pair appears on seed 555777 of the wider set, with the same signature.

**The cause is an asymmetry between two commands, and a planner that knew only
one half of it.** `buildTrack` lays rails straight through a tile a station
module stands on - a level crossing is a legal thing, and the trace shows
`trackBits` going 0 -> 1 under a bay that stays - while `buildRailStop` refuses
that same tile `Occupied`. `enqueueSingleTrack` validates every tile of the
alignment for OWNERSHIP (that is D-219's fix, in that very loop) and never
asked the other question, although the alignment's **tile 0 IS the engine shed**
and its tiles 1 and 2 are platforms. `clearRailTile`, the oval's own ground
test, had the identical hole: its stub tile is the shed.

**The fix is one question, asked in both rail branches out of ONE definition.**
`stationOnTile(stations, tile)` moves into `src/sim/station/types.ts` beside
`joinTargetIdFor`, for that helper's own stated reason - one rule, two callers,
no drift. `commands/build.ts`'s private `stationAt` becomes a one-line
delegation to it, so the ten `cmd.reject.occupied` sites and the AI planner
cannot answer differently. A railway whose shed tile is taken is refused
WHOLE, exactly as a route the assistant cannot find is: `enqueueInfrastructure`
returns null, `startProject`'s dry run skips the candidate, and **nothing is
ordered** - the company keeps the money instead of sinking it into a line it
can never crew.

**THE BROADER CURE WAS BUILT, MEASURED OVER SIXTEEN SEEDS AND REFUSED**, which
is the other half of this entry. The obvious place for the question is
`clearStopTile`, whose own sentence has said "bare, flat, dry, and nobody
else's" since M8 with the last clause as prose - D-219a named it and measured
the whole trio (`tileOursOrPublic` + a station test + `planRoadStop`) at
**-281,115 EUR**. The station test ALONE, at today's HEAD, is not that number:
**25,597,942 -> 26,593,627 EUR (+995,685), lines 18 -> 27, vehicles 105 ->
162, stations 70 -> 100.** It was refused anyway, on the three things that came
with the money:

1. **`SetVehicleRunning|cmd.reject.noRouteToStop` x6 on seed 860213** - the one
   refusal D-223 says must never be tolerated again, and the exact signature of
   the stranded fleet it removed.
2. **Wound up 0 -> 1**, and it is the very company this bundle set out to
   repair: seed 4714's competitor 2 finishes at **-188,733 [X]** with three
   stations and nothing running.
3. **It does not even close the gate**: `BuildRailStop|occupied` is still there,
   moved to seed 918273, plus new `BuildRoadStop|notYours` on two seeds and
   `RefitVehicle|insufficientFunds` x6 - **five undeclared pairs against the
   four it started with.** The refusal storm is still the brake D-219a
   described, and the rail builder is still the thing that was broken.

**The sixteen-seed table, before and after the shipped fix** - personality,
value EUR, lines/vehicles/stations. Twelve of sixteen seeds and forty-five of
forty-eight companies are IDENTICAL TO THE EURO; only the three companies that
had a doomed rail project move, and they are marked:

```
4711     p0   233,189 0/0/3  · p4   471,588 0/0/2  · p1   342,738 1/3/2
4713     p4   500,000 0/0/0  · p0 1,842,457 3/18/4 · p3   500,000 0/0/0
4712     p4   500,000 0/0/0  · p2   329,982 1/6/2  · p0   500,000 0/0/0
4714     p4   500,000 0/0/0  · p2   304,670 1/6/5 -> 657,880 1/6/4  · p3 500,000
2718     p3   500,000 0/0/0  · p0   150,934 0/0/4  · p4   500,000 0/0/0
31415    p3   500,000 0/0/0  · p4   500,000 0/0/0  · p2   -48,583 0/0/6
60613    p0 2,015,525 2/12/3 · p4   500,000 0/0/0  · p1   500,000 0/0/0
12345    p4   500,000 0/0/0  · p2   457,387 1/6/4  · p0   392,540 1/6/2
77003    p4   500,000 0/0/0  · p0   401,601 1/6/4  · p1   500,000 0/0/0
918273   p2   397,325 0/0/3  · p1   500,000 0/0/0  · p4   500,000 0/0/0
131313   p1   500,000 0/0/0  · p2   500,000 0/0/0  · p3   500,000 0/0/0
860213   p4   500,000 0/0/0  · p3   500,000 0/0/0  · p2   669,626 2/12/7 -> 857,945 2/12/6
8675309  p0   229,438 1/6/6  · p1   596,485 1/6/3  · p4   500,000 0/0/0
246813   p0   370,653 0/0/2  · p4   500,000 0/0/0  · p2   500,000 0/0/0
555777   p4   500,000 0/0/0  · p2   704,636 1/6/5 -> 364,792 1/6/5  · p3 500,000
22071969 p1 1,235,752 2/12/3 · p2   500,000 0/0/0  · p4   500,000 0/0/0
```

Totals: **25,597,942 -> 25,799,627 EUR (+201,685, +0.79 %)**, wound up **0 ->
0**, lines **18 -> 18**, living vehicles **105 -> 105**, stations **70 -> 68**
(the platforms of the two abandoned railways), **rail lines alive 0 -> 0 and
trains alive 0 -> 0** - this bundle does not buy a railway competitor and does
not claim to; D-228 and D-229 already said what would. Undeclared pairs over
the sixteen seeds: **4 -> 0**, so the gate is green on twelve seeds the suite
does not play as well as on the four it does. `aiGame`'s own four-seed sweep
reads **6,524,624 -> 6,877,833 EUR**, four of twelve owning a fleet in both.

**Not every seed that gained is a seed that was broken, and one LOST.** 4714
+353,210 and 860213 +188,319 are the freed capital going into road lines that
work; **555777 is -339,844** - the same company, refused the railway a month
earlier, spends the money on a road pair that does worse than the one it built
before. Three companies, two up and one down, and the net is stated rather than
the two good ones.

**Deliberately NOT done, so the next bundle does not have to rediscover it.**
`advanceProject` stage 1 still orders `BuyTrain` without OBSERVING that a shed
stands at the tile, which is D-108's rule half-applied - it reads its two stop
stations back (with the owner test of D-223) and trusts the depot. That path is
unreachable through the plan now, but a `BuildRailStop RailDepot` refused for
`InsufficientFunds` or by the council would walk it again. It is left alone on
purpose: the road twin `BuyRoadVehicle|needsDepot` is DECLARED and tolerated
for exactly that shape, and pre-declaring the rail twin would widen the guard
to swallow the next unknown refusal, which is the one thing the guard exists to
prevent. The oval's platform list can also name one tile twice when the two
ends are exactly two tiles apart along the corridor; it is not exercised on any
of the sixteen seeds and is therefore not touched.

**Guarded from outside by a test that is RED on the pre-fix simulation.**
`tests/unit/aiRailShedTile.spec.ts`, the D-223 pattern: five cases, of which two
fail on the old code - the single-track plan is ordered onto a taken shed tile,
and the oval's shed is ordered onto a standing stop - and three pass on both
sides as controls: the command layer's own asymmetry (`buildTrack` accepted and
`buildRailStop` `Occupied` on the same tile), the ordinary railway still being
planned with its shed on tile 0, and a RIVAL stop on that tile, which D-219's
ownership question already refused.

**No save bump, verified rather than assumed.** The change is two ground tests
in `src/sim/ai/build.ts` and one helper moved into `src/sim/station/types.ts`;
no field, layer or entity changed shape, so `SAVE_VERSION` stays **30**. The
soak fixture is UNCHANGED and re-run rather than presumed - `f08265c0152efea9`
at 143 recorded commands, all sixteen checkpoints - because seed 4711's quarter
century is bit-identical, and the canonical cross-OS pin did not move.
**Scenario 5 is identical to the euro on all three personalities and all
seventy-five yearly values**, measured by reverting the fix in a working copy
and re-running `aiCompany`: road 1,022,084 / rail 1,802,165 / expansive
2,153,604 on both sides, same refusal profiles. No band moved and none was
widened.

**Verified by running**, in this order, on the final tree: `npm run typecheck`
clean; `npm run lint` over the whole repo clean; `npx prettier --check` clean on
every touched file; `npx vitest run tests/unit` **114 files / 1,477 tests**
green (109 -> 114 files, +5 cases); `npm run test:balance:full` **12 files /
101 tests** green in 178.6 s - the red gate closed; `tests/determinism` **7
files / 33** green; `npm run test:soak` **4** green at the unchanged hash.

## SPEC2 M20 - lebendige Städte

### D-231 A town builds - the growth rate finally puts up houses and lays street, one town a day, through the guards the player builds through

**Until this bundle a town was pixel-identical in 1950 and in 2050.** `growTowns`
has computed a 13.2 growth rate since M2 and moved a population number with it;
nothing on the map ever changed, so the most visible thing a transport game has
to show for a century of play - a village that became a city - did not exist.
This is SPEC2 M20 bundle 1: the physical half of section 13.2. The 13.2 formula
itself (the building-material term, the company-rating factor, the twelve-month
window, the shrinkage), the zone economy and the council elections are the later
bundles of the same milestone and are NOT here; **what is here is the fabric.**

- **The monthly hook mutates the world directly, and that is E-10 rather than a
  shortcut.** Architecture law #6 binds the PLAYER's interventions; `growTowns`
  has been a legitimate author of state since M2. A pseudo-company command would
  flood the replay log with non-player noise (Fehlerkatalog 29), and it would
  have to be issued BY somebody - which would hand a company the town's own
  streets and break D-104 on the way. The growth pass therefore sits in the
  daily hook beside `updateGoals` and `reportNews` and writes the map itself.
- **The placement is `mapgen/towns.ts`'s own, called with the DEFICIT.** D-216
  had just rebuilt that file - extent derived from where houses can actually
  stand, dead-end pruning to a fixed point, paving last - and growth had to
  extend that shape rather than undo it. `placeBuildings` is exported and now
  answers how many it put up; a tile that already carries a house fails
  `plotBuildable`, so "place four more" and "place four in total" are ONE loop
  and there is exactly one answer in the project to "where does a house go".
  `buildingsWantedFor` is the founding ratio shared with the growth for the same
  reason `coalLine.ts` is one object (D-203): two copies of it would be two
  different towns within a game year of the first edit.
- **A street's own next tile is not a building plot, and that one rule is what
  makes growth possible at all.** Without it the first house built beside a
  street end caps that street for ever, because every tile a street could grow
  onto is a tile a house may stand on - measured, and it is not a corner case:
  a town fills the band beside its streets within a game month and then never
  builds again. `continuesStreet` is the identity read off the road layer - the
  neighbour in direction k carries a road bit that ALSO points in direction k,
  i.e. the street runs through it and away from us - so it needs no saved street
  pattern and no RNG draw to know where a street line lies. **It is a no-op at
  generation time**: a street-line tile inside the laid radius carries a road
  unless it was impassable, and impassable fails `plotBuildable` too. That claim
  is not argued, it is held - every figure in `SCENARIO_WORLD_CLAIMS` and every
  assertion in `mapgen.spec.ts` is unmoved, and those pin eight generated worlds
  exactly (D-197/D-198/D-199).
- **The street extension is SPEC.md 13.2's own sentence, in its own order.**
  "Neue Gebaeude werden entlang bestehender Strassen platziert; wenn kein Platz,
  verlaengert die Stadt selbst eine Strasse (max. 3 Tiles/Monat)." So the street
  is the answer to there being no plot and never the first move, it is at most
  `TOWN_GROWTH_ROAD_TILES_PER_MONTH` = 3 tiles a month, and the house goes up in
  the SAME step the tile is laid - a candidate is only ever accepted if it opens
  at least one new plot, which is D-216's 1,013 unserved dead ends refusing to
  come back. The winner is an explicit total order and never the order of the
  walk (law #3): nearest the centre first, then most plots opened, then lowest
  tile index, which no two candidates tie on.
- **One town a day, and the cursor is not a save field.** 140 towns searching
  for a plot in one tick is the 7.3 cadence mistake transferred to towns
  (Fehlerkatalog 32), so the pass grows the town at `day % towns.length` and no
  other. SPEC2's ledger row for v31 names a "Wachstums-Cursor" beside the rest;
  it is not stored, because the tick is already saved and hashed and the town
  list never changes length after genesis, so a stored cursor would be a second
  source of truth for a pure function of the first - the D-174 pattern, where
  the layout bump the ledger named turned out to be already paid for.
- **Zero randomness, deliberately.** Nothing here draws, from `world.rng` or
  from a named stream (Z3, the D-093 precedent). A new periodic subsystem
  normally gets its OWN stream (D-106) precisely so that it cannot shift a later
  breakdown roll; a subsystem that draws NOTHING cannot shift one either, and
  the deficit, the ring order, the extension candidate and its tie-breaks are
  all total orders over tile indices. Every existing seed therefore keeps its
  breakdown sequence, and the only reason a world hash moves is the state that
  moved.
- **The guards are the player's own.** `roadBuildableAt` - the ground test the
  road command and its hover preview share since D-210 - refuses water, an
  industry, a house and anything steeper than `TOWN_ROAD_MAX_SLOPE`, so the town
  refuses exactly what the player refuses. On top of it the town asks three
  questions: the tile must be its own claimed ground, it must be `TILE_PUBLIC`
  (which in ONE array read covers a company's road, its track and every station
  module, because all three take the tile - D-101, `attachModule`), and it must
  carry no track, structure or waypoint. **A town does not build level crossings
  and it never terraforms**: it builds where the ground already allows, which is
  why the M10-hardened terraform guard is not reached rather than bypassed. And
  every tile it touches stays PUBLIC, which is what D-104 says a town's own
  street is for ever - asserted on the diff, not promised.

**SAVE_VERSION 30 -> 31, and it is the smallest field a bump in this chain has
been spent on.** `Town.roadTilesThisMonth` is the month's own street budget:
the cap is per MONTH while the pass runs per DAY, so the tally is real history
and derivable from nothing the world holds (Z4). A counter rebuilt as zero on
load would let a town lay three more tiles in a month it had already spent - the
same street, priced differently after a load, which is law #3 broken in the
silence Z4 was written about. Saved, hashed and parsed as a required field, so
the D-134 audit picked it up by existing and needed no allowlist row. The
migration enters zero, which is exactly what a version 30 world knew about
itself; the milestone's later bundles extend `v30_to_v31` IN PLACE and add no
number (Z5).

**Found on the way, and fixed: a derived station field nobody refreshed.**
`station.commercialShare` - the M19 zone mix that decides whether a stop sells
commuter or business tickets - is DERIVED, and `World.fromData` recomputes it
for every station on load. Growth moves `buildingKind`, so leaving it stale
would make a loaded game split its passengers differently from the game that was
saved. **The same hole was already open on `DemolishBuilding`** since M19 gave
the share a meaning: that command unzoned a covered tile and refreshed nothing.
`refreshCommercialShare` is its own allocation-free function now (the industry
scan beside it builds a list; this one counts two integers), called by
`assignStationIndustries`, by the growth and by the demolition. The test asserts
both ends: a ten-year grown world reproduces every station's share through a
save and a load, and a demolition leaves the share exactly where a fresh read of
the map puts it.

**Measured.** The Fertig-wenn's own before/after tile diff, on a fully served
town over ten game years (`tests/unit/townGrowth.spec.ts`): **28 -> 60
buildings, 22 -> 34 street tiles, population 8,000 -> 10,538 at a passenger
supply of 96.5 %.** The three-a-month cap BINDS on that fixture (busiest month
exactly 3, asserted so the cap assertion cannot go vacuous) and the town then
stops when its streets reach the ground it claimed. On a GENERATED world - seed
4,711, 256 tiles, 40 towns, nobody serving anything - ten years move **661 ->
695 buildings and 872 -> 881 street tiles** against a population of 66,100 ->
69,772: the growth keeps pace with what the population asks for, which is what
an unserved world should look like.

> **Corrected by D-235 (2026-08-12).** Those three figures were true of bundle 1
> and of nothing after it: bundle 2 (D-232) gave a town nobody supplies the
> -0.03 %/month branch, so that world now SHRINKS. Re-measured on the final M20
> tree: **661 -> 642 buildings, 872 -> 869 street tiles, population 66,100 ->
> 63,820**. The claim is a test since D-235 (`townShrinkage.spec.ts`, "a
> generated world nobody serves"), which asserts the direction and prints the
> figures, so the next bundle cannot invalidate it in silence.

**Cost.** The pass allocates **0.990 B per game day** over 50,000 days against
an allocating control at 1,621 B (law #7), and costs **0.75 us per game day** on
a 512 map of 40 towns, i.e. **0.023 ms per game month** - the whole monthly bill
the ledger prices at +0.10 ms. Tick on the reference fixture, three runs: p50
1.666 / 1.707 / 1.862 ms, p99 3.677 / 3.675 / 4.345 ms against the M10 baseline
1.45 / 3.26 on a box whose documented run noise is +-0.7 ms; the arithmetic
bounds the real contribution at about 4 ns a tick, so the spread is the box and
not the growth. **No 6.1.1 row is claimed here** - that table takes ONE row per
milestone at its close, and M20 is one bundle in.

**Pins, and which of them moved and why.** Every world hash in the project moves
on this bundle whether or not a town grew, because every town hashes one more
integer. Canonical cross-OS pin `ddaacd4b970d31db` -> **`6e46c92e5d94c66b`**;
soak fixture `f08265c0152efea9` -> **`ad5247561331af6e`** at unchanged 143
recorded commands and all sixteen checkpoints; corpus manifest re-recorded with
a `v31-played.ironsave`. **The corpus is the first case in this project where
the fixtures do NOT all decode to one world**, and the reason is worth stating
rather than smoothing: the nine frozen fixtures were played by builds whose
towns did not grow, so migrating them yields that world plus an unspent road
budget (all nine agree, at `960a2e5587108419`), while the v31 fixture is the
same thirty days played by THIS build, with the growth in it
(`4466ebea223a0d74`). Both are right, and the suite only ever required v22 and
v23 to agree - a container-only change is the one case where two fixtures must
be the same world.

**Bands: not one moved, and scenario 5 is identical to the euro.** Road
1,022,084 / rail 1,802,165 / expansive 2,153,604, all seventy-five yearly values
and all three refusal profiles unchanged; `aiGame`'s four-seed sweep unchanged;
scenario 1 payback year 3, scenario 2 249,980 EUR / year 6, scenario 3 159,516
EUR/yr, Netzdesign 3.73, Punktzahl 5,889, Harter Winter -4.36 %. **That is a
finding, not an absence of effort**, and it names this bundle's own residual:
`station.buildingsCovered` is a BUILD-TIME reading and the growth does not
refresh it, so a town that doubles its houses offers its stop no more cargo -
`produceTownCargo` normalises the per-station share and the town's total is
population-driven, so the new houses are zoning and scenery and not yet
tonnage. It is a saved field, so nothing diverges on load; it becomes load
bearing in the ZONE-ECONOMY bundle of this milestone, and that is where it is
booked.

**Two further residuals, named rather than discovered.** A town extends the
streets it HAS and never starts a new one - which is SPEC.md 13.2's literal
sentence ("verlaengert ... eine Strasse") and keeps D-216's grid a grid - and it
never grows past the ground it claimed at genesis, so `TOWN_START_RADIUS` is a
hard ceiling on the fabric until the 13.3 Stadtgebiet becomes something that can
move. The measured consequence on the test fixture is that growth stops after
four months with the arms at the claim boundary; on a generated map, where a
town's grid has many street lines and its claim is about twice its built
radius, there is room for a century.

**Verified by running**, on the final tree: `npm run typecheck` clean;
`npm run lint` over the whole repo clean; `npx vitest run tests/unit`
**115 files / 1,496 tests** green (114 -> 115 files, +19 cases);
`npx vitest run tests/corpus tests/determinism` **8 files / 38** green after the
re-record; `npm run test:balance:full` **12 files / 101 tests** green;
`npm run test:soak` **4** green at the re-recorded hash; `npm run test:perf`
green with the three tick samples above.

### D-232 SPEC.md 13.2 complete - the building-material term, the company rating, the twelve-month window, and the shrinkage that takes houses down again

**`growTowns` has computed a growth rate since M2 and it was never the rate 13.2
asks for.** Three of the formula's terms were missing or wrong and the sentence
underneath it had never been implemented at all: `versorgungBau` did not exist,
so SPEC.md 7.2's "Baustoffhandel (Senke, treibt Stadtwachstum)" drove nothing
and a builders' merchant was a yard that ate cement; the goods and food weights
stood at 0.35 against the specification's 0.45; the company-rating factor
`(0.5 + 0.5 x firmenRating/100)` was absent; the passenger share was read off ONE
month where 13.2 annotates it "letzte 12 Monate"; and "Ohne jede Versorgung
schrumpfen Staedte langsam (-0,03 %/Monat)" was not in the code in any form - an
unserved town GREW at 0.15 % a month for the whole century. This is SPEC2 M20
bundle 2. The v31 migration is EXTENDED in place (Z5); no bump.

- **The formula is one pure function of six numbers, and that is what makes the
  Fertig-wenn answerable.** `townGrowthRate(pass, waren, food, bau, terrain,
  rating)` takes no world, so `tests/unit/townFormula.spec.ts` can compute the
  specification BY HAND from its own numerals - `0.0015 * 2.1275 * 0.6 * 0.9 =
  0.001723275` - and then drop one term at a time and check what the rate loses
  against `weight x share x outer`. A test that composed the constants the
  implementation reads would only prove a file agrees with itself, so the hand
  reckoning uses literals and a separate case asserts the constants ARE those
  literals.
- **"Ohne jede Versorgung ..." is a BRANCH and not a term, and it has to be.**
  Every factor in the product is strictly positive, so the formula evaluated at
  zero supply grows a town nobody has ever reached; the two halves of 13.2 are
  only both true if a town with no supply at all takes the flat rate instead of
  the product. The flat rate carries neither the terrain factor nor the council
  with it - which is why the desert and the temperate passive curves, which used
  to part at 9,248 and 10,574 by the end of 1975, are now **the same 7,376**.
- **Rounding is the floor nobody has to write.** At -0.03 % a month a town under
  1,667 inhabitants rounds back to where it was and does not shrink at all,
  exactly as a town under 334 does not grow at the base rate. A hamlet therefore
  outlives its bus line, and that is arithmetic rather than a rule.
- **`versorgungBau` is booked on what the yard ACCEPTED, from the cargo the yard
  itself accepts.** The delivery path calls `noteBuildingMaterial` with what
  `deliverToIndustry` really took, so the term widens the day a merchant's recipe
  does (the D-174/D-183 shape: the table IS the enumeration) and a full yard
  credits nothing - the term reads the LINE rather than the stock. Which town a
  yard belongs to is `TOWN_BUILDING_MATERIAL_RADIUS`, nearest centre first, ties
  on the lower id: **the town's own claimed radius could not be used and this is
  not a shortcut** - `mapgen/industries.ts` refuses to place any industry on a
  claimed tile, so a term measured against the claim would be zero on every
  generated world by construction. The radius is `INDUSTRY_NEAR_TOWN_DISTANCE`,
  the placement rule's own figure, moved out of `industry/types.ts` into
  `constants.ts` so the two ends cannot drift.
  `TOWN_INHABITANTS_PER_BUILDING_MATERIAL` = 1,200 is the one demand ratio 13.2
  leaves open; the constant's comment carries the arithmetic that chose it
  (6.67 t a month for a city of 8,000 against one merchant's 200 t of intake).
  Measured end to end: three cement lorries into a merchant ten tiles from a town
  of 3,000 leave it at **3,104 after three game years against 2,964 for the
  identical world with no lorries** - the whole gap is the term.
- **`firmenRating` is the 13.3 council rating, weighted by what each company
  CARRIED.** It is the only company rating the game has, `reviewCouncils` runs
  immediately before `growTowns`, and it already carries what 13.2 wants growth
  to depend on. A town served by a well regarded operator and touched once by a
  resented one does not grow at the average of the two. Where nothing was carried
  the best regarded company with a station in the town speaks for it; where no
  company serves at all the rating is 0 and the factor sits on its 0.5 floor -
  which a town in that state never reaches anyway, because it is shrinking.
- **The twelve-month window is D-079's device for the third time** (after the
  industry service window and the M19 return-journey mean): two running numbers
  and a month count rather than a ring of twenty-four, a TRUE mean while the
  window fills. It is SAVE STATE, because a window is historical input to a
  simulation decision (Z4, Fehlerkatalog 23) - a town reloaded with an empty
  window would grow at the unserved rate for a game year and then at the served
  one, the same world priced differently after a load. The ratio is of the two
  MEANS and not the mean of the ratios, so a month in which a town produced
  nothing carries no weight instead of counting as perfect or hopeless service.
- **Shrinkage takes houses down, and the two refusals on the way down are the
  point.** `growTownFabric` gained its second direction: `standing > wanted`
  removes ONE house a day, farthest from the centre first (the mirror of
  `placeBuildings`, which fills from the centre out), ties on the highest tile
  index. **A station is never left with an empty catchment** - a house that is
  the last one a station of this town covers is refused, counted live off the map
  because `station.buildingsCovered` is the build-time reading D-231 named as a
  residual - so the 10.1 death spiral stays legible in the M14 instruments
  instead of ending as a stop with nothing around it. Measured on a stop nobody
  drives to: population 2,776 -> 2,296 over forty years, and the station's own
  history ring reads **947 -> 785 commuters lost at the platform a month**. The
  refusal is the LAST building and deliberately not the last few: a town that
  could never shrink inside a catchment would keep its full stock for ever
  wherever a stop was ever built.
- **D-216's pruning invariant holds in both directions, through the same sweep.**
  `pruneUnservedStreets` is exported and runs after a removal, so a street that
  served the house it lost is shortened to the same fixed point the map generator
  uses - one invariant, not two. What the played map adds is an OWNER, and
  `streetServesSomething` reads it now: a tile a company took is a stop, a bay, a
  depot or its own road, and every one of those is something the street beside it
  exists for. **Provably a no-op at generation time** - `owner` is `TILE_PUBLIC`
  everywhere until a command writes it - and every `SCENARIO_WORLD_CLAIMS`
  generation figure and every `mapgen.spec.ts` assertion is unmoved, which is
  what proves it.
- **The shipped scenarios' passive curves were re-measured and both ends moved
  together** (D-197/D-198/D-199's rule). Wiederaufbau's Erlenbach 9,925 / 10,033
  / 10,465 / 10,574 -> **7,520 / 7,496 / 7,400 / 7,376**, Ueberleben's
  Sandenwerder 9,200 / 9,248 -> **7,400 / 7,376**; the claims table, the German
  and English briefings (10.574 -> 7.376, and "waechst von allein nur langsam" ->
  "waechst nicht, sie schrumpft"), the catalogue header and three doc comments
  all changed in the same edit, and `SCENARIO_BRIEFING_FIGURES` reads the numeral
  straight back out of the claims table. The 11,000 population goal is still
  above the passive line - by a much wider margin than before - and still
  reachable: with passengers and food fully carried the rate is
  `0.0015 x 2.0 x 0.6 x ~0.92`, i.e. **8,000 -> about 13,100 over the scenario's
  own span**.
- **One AI band was re-banded with an A/B trace from two worktrees at one commit,
  and the trace is the entry.** `aiGame`'s seed-4711 block asserted "the road
  company still runs its line"; once a town nobody serves shrinks instead of
  growing for free, the town-pair bus business on that seed stops clearing
  `AI_MIN_PROFIT_MARGIN` and D-221's floor refuses it. What the old assertion was
  protecting: Seeblick Spedition ran that line to a company value of **342,738
  EUR from a 500,000 start** and Rautenberg Fracht laid 151 tiles of road for
  **233,189** - seed 4711's three competitors together held **1,047,515 EUR of
  the 1,500,000 they began with**. On this build they hold **1,462,984** and two
  of them never leave the yard. The line the guard protected was destroying its
  owner's capital, so **the guard is on the CAPITAL now**, banded at 1,200,000
  EUR - under the measurement and over the previous build's run, so it would have
  been RED on that build. Four-seed sweep 6,877,612 -> **7,293,303 EUR**, 0 wound
  up on both sides, and the whole difference is seed 4711: 4713 moves 1,842,235
  -> 1,842,457, and 4712 and 4714 are identical to the euro.
- **Every other band is untouched and scenario 5 is identical to the euro.**
  Scenario 1 payback in game year 3, scenario 2 249,980 EUR / year 6, scenario 3
  159,516 EUR/yr, mine closure month 25, Netzdesign 3.75 against a band of 3
  (3.73 in the M15 note - the scenario prints the figure and bands the
  threshold; its alignment half is unmoved at 2.01x and its capacity half reads
  1.87x against 1.86x, both on a world whose towns now decline), takt -8.3 % / 0.57,
  Harter Winter -4.36 %, Punktzahl 5,889, scenario 5 road **1,022,084** / rail
  **1,802,165** / expansive **2,153,604** - the D-221 and D-229 figures to the
  cent. The AI worlds that DID move are the three-competitor ones, where towns
  are the business.
- **A stated claim in `src/sim/ai/evaluate.ts` was falsified by this bundle and
  is corrected rather than left**: "a town is the one source in the game that
  cannot shut down or run dry". It can run dry now, slowly, and the comment says
  so with the measurement beside it.
- **Pins, all moved once and each by running:** canonical cross-OS
  `6e46c92e5d94c66b` -> **`817c99ef5dfe2061`** (D-137 protocol); corpus manifest
  re-recorded with a fresh `v31-played.ironsave` - **the nine frozen fixtures
  still decode to ONE world** (`ac21b577424ab399`, played by builds whose towns
  did not shrink) and the v31 one is the same thirty days played by THIS build
  (`8356a543736c7eb1`), which is D-231's pattern one bundle on; soak
  `ad5247561331af6e` -> **`75ef4332dae55b89`** at **143 -> 35** recorded
  commands, the drop being seed 4711's two companies that no longer build.
  `SAVE_VERSION` stays **31**.
- **A latent cost the whole game has paid since M4, found by this bundle and
  fixed.** With one town changing the map every day, the 1,500-vehicle
  acceptance fixture measured tick p99 **6.06 -> 8.29 ms** (five interleaved A/B
  pairs against a worktree at HEAD; p50 2.433 -> 2.522). Two probes located ALL
  of it and none of it was the town's own work: with the removal disabled the
  run reads **6.03 ms**, and with the removal kept but the single `map.revision++`
  taken out it reads **4.95 ms**. `RailPathfinder.reindex` and
  `BlockIndex.refresh` keyed on `TileMap.revision`, which moves for every house,
  kerbstone and tree, so ONE map edit cost a full 1024^2 scan TWICE on the very
  next tick whatever it had edited - which is what a player's every road tile
  has cost since M4, hidden because the acceptance fixture never edited the map
  while it was being timed. **`TileMap.trackRevision` is the second counter**,
  moved by `TileMap.noteChange()` - which every command calls, in the safe
  direction by construction, because over-invalidating costs a rebuild and
  under-invalidating is a stale route. The three passes the town runs for itself
  (D-231's growth, and the trees and streets of the 13.3 measures) move
  `revision` alone, and each of them refuses a tile carrying track before it
  writes anything. `tests/unit/trackRevision.spec.ts` holds both halves: the
  counters move apart exactly where they should, and a source walk over
  `src/sim` proves `commands/build.ts` is the ONLY writer of `trackBits` or
  `signal`, so "every writer went through `noteChange`" is a property of the
  source rather than a promise (the D-176/D-186 device). After it: **p99 6.07 ms
  with the daily map change in place.** Zero behavioural difference - both
  indexes are pure functions of the same two layers and a rebuild is
  deterministic, which the determinism suite, the corpus and the soak confirm by
  not moving.
- **The tick numbers are named rather than claimed** (D-167, D-215's posture).
  This box is not clean: both sides of every pair sit at **p50 2.3-2.8 ms
  against the reference machine's 1.43-1.45**, and `max` reads 30-47 ms. What is
  measured cleanly is the growth pass itself, on the same 512 world in both
  trees: **1.19 us per game day against 0.99** (+0.20 us, i.e. about 1 ns a
  tick), allocating **0.798 B per game day** against an allocating control at
  1,665 B (law #7). The 6.1.1 row stays open until the milestone closes.
- **Named residual, and it is the same one D-231 left**: `station.buildingsCovered`
  is still a build-time reading. The growth and the shrinkage both refresh
  `commercialShare` and neither refreshes that counter, so a town that has
  doubled or halved its houses still offers its stop the coverage it had on the
  day the stop was built. The removal guard therefore counts the buildings LIVE
  rather than trusting it, and the field itself belongs to the zone-economy
  bundle.

**Verified by running**, on the final tree: `npm run typecheck` clean;
`npm run lint` over the whole repo clean; `npx vitest run tests/unit`
**118 files / 1,525 tests** green (115 -> 118 files, +29 cases);
`npx vitest run tests/determinism tests/corpus` green after the two re-records;
`npm run test:balance:full` **12 files / 101 tests** green;
`npm run test:soak` **4** green at the re-recorded hash; `npm run test:perf`
green at p99 6.07 ms with the daily map change in place. `npm run format:check`
is red on the same 31 files it was red on before (D-227); the three new test
files were formatted before they were committed and are not among them.

### D-233 The zones become an economy and the councils face the voters - a new stream, a world rule with an off anchor, and every band bit-identical

**SPEC2 M20 bundle 3, and it is two things that had to ship together**: the
first ECONOMIC use of the 13.1 zones, and the elections SPEC2 asks for by name.
Both extend the milestone's one `SAVE_VERSION` bump in place - **v31 stands**
(Z5) - and the `v30_to_v31` migration is the same function with more in it.

**The zone economy.** SPEC2 M20: "Wohnen erzeugt Pendler / verbraucht
Waren+Lebensmittel; Gewerbe erzeugt Post+Business-Pax / verbraucht
Waren+Elektronik". Two of those four were already true - the M19 classes split a
town's passengers by `station.commercialShare` (D-207) - so what this bundle
adds is the POST and the whole consumption side. The parallel path was checked
for first, which is what the task asked: `town/update.ts` already held the
production pass, the demand arithmetic and the growth formula, and all three are
extended rather than duplicated.

- **The post follows the shops and the town's TOTAL never moves.** A stop's mail
  weight is `1 + TOWN_MAIL_COMMERCIAL_WEIGHT * commercialShare` over the
  coverage-times-rating share it already had, NORMALISED over the town's stops.
  That is D-207's device one cargo along, and normalising is what makes it an
  exact no-op wherever every stop of a town has the same zone mix - which covers
  a town with ONE station and every hand-built world of section 19.4, where the
  share is zero everywhere (the D-201 device). A rate scaled per zone would have
  changed how much post a town makes, and with it scenario 1.
- **Electronics gets a counter, not a fifth term.** SPEC.md 13.2 has four supply
  terms and `versorgungWaren` is one basket, so radios still count as goods
  where the formula reads them - they have since M5. What needed separating is
  the DEMAND: `TOWN_INHABITANTS_PER_ELECTRONICS` is multiplied by the commercial
  SHARE of the town's buildings and added to the goods demand, so a town with
  shops wants more of the same basket. `Town.electronicsDeliveredThisMonth` is
  the saved, hashed counter that makes that possible, and it exists because a
  demand cannot be scaled per zone while the deliveries behind it are one
  number.
- **Food is the houses' demand**: `population * residentialShare / 700`. A town
  that is a third shops is fed by two thirds of what a wholly residential one
  needs, and an all-residential town takes exactly the pre-M20 figure.
- **The census is monthly, counted, and its own walk.** `countTownZones` is
  `countTownBuildings` asked one question further on, into a preallocated
  four-slot scratch indexed by `BuildingKind` (a monthly hook allocates no more
  than a tick does, law #7, D-231). It is NOT folded into the daily deficit
  walk: that one is a DAILY question about one town and this is a MONTHLY
  question about every town. A town with no buildings at all reads as fully
  residential, which is what it was before the zones meant anything.
- **What the split deliberately does not touch is ACCEPTANCE.** A stop covering
  houses still takes electronics whether or not the town has a commercial zone
  (`TOWN_CARGO` is unchanged). The demand is the shops'; the acceptance is the
  houses'. Unhooking the second from the first would re-open D-118's dead end -
  an electronics works whose output nobody takes closes in twenty-four months.

**The elections, and the one decision the whole bundle turns on.**

- **A ballot is a WORLD RULE with an off anchor** (Z1/Z2, Fehlerkatalog 34, the
  D-200 precedent). A council profile reweights the rating; the rating gates
  building permits and exclusive rights and - since D-232 - is a FACTOR of
  SPEC.md 13.2's growth formula. So an election reaches money, which under Z1
  makes it saved, hashed and fixed at genesis, and under Fehlerkatalog 34 makes
  it OFF unless the world was started with it: every band this game owns was
  measured by councils that never faced a voter. `NewGameParams.elections` is
  the eleventh entry of `SCENARIO_LOCKABLE_RULES`, all eight shipped scenarios
  state it `false` explicitly, and `runElections` returns on its first line for
  a world that has it off - no stream constructed, no draw taken, no profile
  written.
- **The draws come from a NEW named stream and this is the exact mistake D-106
  was written for.** `streamFor(streamSalt('politics') + electionNumber)`, the
  weather's shape one period out (D-128's tender-review precedent). A single
  draw from `world.rng` here would shift every later breakdown roll of 11.3 in
  every existing seed - the balance scenarios, the soak recording and every save
  a player holds would run a different future for a reason that has nothing to
  do with politics. **Instrumented rather than argued**: `elections.spec.ts`
  plays three full terms with the rule on and with it off and requires
  `world.rng.getState()` to be IDENTICAL, with the comparison proved
  non-vacuous - a four-town world elects somebody other than the balanced
  council, the two worlds hash differently because of it, and the gameplay
  stream is still in the same place. A second test wraps only the election's own
  generator (`streamFor` is shared - the tender review draws from it monthly)
  and counts **one word per town per election**, which is Z3's identical-draw-
  count clause made checkable.
- **The profile reweights two terms and invents none.** Green doubles the noise
  and the clean-fleet bonus, business-friendly halves both; "umgekehrt" is read
  as the reciprocal rather than as a second invented number. The cap
  (`COUNCIL_NOISE_MAX`) is applied AFTER the weight, or a green council could
  not reach the towns where a company laid most track. Balanced is 1 and 1, is
  what every town is born with, and is what a world with the rule off keeps for
  ever - so the rating arithmetic of a world that did not ask for politics is
  the pre-M20 arithmetic term for term.
- **The Fertig-wenn, measured**: the same company, the same map, the same month,
  only the council different - nine tiles of track cost 5 rating points under a
  balanced council, 11 under a green one and 3 under a business-friendly one,
  i.e. the table's x2 and x0.5 within the one point an integer rating rounds by.
  And the converse is asserted too: a company with no track and no fleet has
  neither term, so a green council is not "everybody loses points".
- **Two new measures, and both refuse rather than charge for nothing.**
  `SponsorStations` pays goodwill per station the company runs here and is
  refused (`nothingToDo`) to a company with none - sponsoring a station one does
  not have is not a thing a council can be sold. `NoiseBarrier` halves the noise
  term for two years and is refused where the company laid no track, asking
  `townTrackTiles` - the noise term's OWN definition, exported so a wall cannot
  be sold beside a line the rating does not charge for. Half and not zero: a
  wall is not the line going away, and against a green council the pair puts the
  term back exactly where a balanced council had it (asserted).
- **`TOWN_MEASURE_COUNT` 5 -> 7 re-lays a saved array**, because
  `measureReadyTick` is company-major with that count as its stride: what was
  company 1's tree cooldown is company 0's sponsorship slot now. `v30_to_v31`
  re-lays it row by row with BOTH counts written out as literals (D-207's rule -
  a migration writes the shape of its own target version, never the live
  constant's). **The exposure is stated and checked rather than papered over**:
  a list this build wrote, wrapped in a v30 container by the corpus trick,
  cannot be told apart from a real v30 one - it does not arise because no corpus
  fixture and no `save.spec.ts` world buys a town measure, and that emptiness is
  now a test rather than an assumption.
- **News: edge-triggered first, `postOnce` behind it.** An election line is
  written only for a council that actually CHANGED and only for a town the
  player has a station in (D-202's storm-warning filter). A growth milestone is
  compared against the population BEFORE and AFTER the month that just ran, so a
  town sitting over a threshold for thirty years is one entry rather than three
  hundred and sixty. **The stated floor of using `postOnce` at all**: its key is
  the message AND the place, so two milestones for one town with nothing written
  in between collapse into one line - pinned in the test rather than hidden, and
  priced in months, since the thresholds are a factor of two apart.

**A defect found on the way and fixed**: `replayGenesis` did not pass the
WEATHER rule. Every rule that function omits is a rule the reconstruction
quietly turns off, so a recording of a harsh world that fell back to a genesis
rebuild would have re-simulated under a clear sky and reported a desync that was
the rebuild's own. One line, beside the election rule that was about to be
forgotten the same way.

**Measured, and the headline is that nothing moved that was not a new hashed
byte.**

- **Not one balance band moved and the hand-built worlds are bit-identical**:
  scenario 1 payback in game year 3 (balances 485,735 / 493,316 / 501,669 /
  509,938 / 518,793 / 521,260 EUR), scenario 2 investment 249,980 EUR and
  payback year 6, scenario 3 **159,516 EUR/yr**, Harter Winter **-4.36 %**,
  Punktzahl **5,889** with the same 36/26/24/13 split, Netzdesign green. That is
  by CONSTRUCTION for those worlds: they are all-residential, so
  `residentialShare` is 1, `commercialShare` is 0 and every new term is the term
  that was there.
- **Scenario 5 is identical to the euro** - road 1,022,084, rail 1,802,165,
  expansive 2,153,604 EUR, D-229's figures exactly - although it plays a
  GENERATED map with real commercial zones. The reason is worth writing down:
  its competitors haul passengers and freight into industries, and nothing in
  that world delivers goods, food or electronics INTO a town, so both new
  demands are compared against a delivered zero and answer zero exactly as
  before. The zone economy is observable where somebody supplies a town, and the
  balance suite has no such line on a generated map.
- **Pins moved once each, and only because new hashed fields joined the
  digest.** Canonical cross-OS `817c99ef5dfe2061` -> **`5f4c022bef5b94d1`**,
  soak `75ef4332dae55b89` -> **`9aac5ef0864d5c69`** at **unchanged 35
  commands**, corpus manifest re-recorded with a fresh `v31-played.ironsave`;
  the nine frozen fixtures still decode to ONE world (`1dd5bb6255a236a9`) and
  only the v31 one differs, which is D-231's correct behaviour.
  `SCENARIO_WORLD_CLAIMS` did NOT move - the claims are measured at genesis, and
  the two `passiveGrowth` curves play years in which nothing is delivered at
  all, so they take the shrink branch untouched.
- **Cost.** The census is the only new per-town work and it is measured by A/B
  on the same 512 world with 40 towns: `growTowns` **24.51 -> 91.34 us per game
  MONTH**, i.e. +66.8 us a month or about **0.011 us a tick**, against a ledger
  line of +0.10 ms. `npm run test:perf` on the reference fixture (120 towns,
  elections off) reads tick **p50 1.756 / p99 2.912 ms** against the M10
  baseline 1.45 / 3.26 - the p99 BELOW it, so no acceptance number is claimed
  beyond "inside this machine's noise" (D-167/D-215's posture).
- **Main bundle 955,606 -> 959,448 B**, against 394 B of headroom left under the
  old budget, so this bundle had to book whatever it weighed. Split by copying
  only the two catalogues into a baseline worktree and rebuilding: **+1,505 B
  are the eleven new i18n keys in two languages** and **+2,337 B the interface
  and the constant tables it reaches through `constants.ts`**. No new static
  `src/sim` import chain - the council panel already imported `town/council.ts`,
  and `town/elections.ts` is reached only from `SimWorker.ts`. Budget raised
  956,000 -> **966,000 B** with that measurement beside it (D-192's rule).

**Verified by running**, on the final tree: `npm run typecheck` clean;
`npm run lint` clean; `npx vitest run tests/unit` **120 files / 1,549 tests**
green (118 -> 120 files, +24 cases); `npx vitest run tests/determinism tests/corpus` green after the two
re-records; `npm run test:balance:full` **12 files / 101 tests** green;
`npm run test:soak` **4** green at the re-recorded hash; `npm run test:perf`
green. `npm run format:check` stays red on the files D-227 names; the two new
test files and the new simulation file were formatted before they were
committed.

### D-234 M20 measured and closed - the month tick priced on two instruments, and a census that read two map layers when one was enough

**SPEC2 M20 bundle 4, the milestone's last.** It answers exactly one open
question - "der Monats-Tick p99 waechst um < 0,15 ms gegenueber der
Grundlinie" - re-runs everything a growing world can reach, and writes the
ledger row. **No save bump, no migration edit, no hashed byte, no RNG draw, no
i18n string, no atlas cell, no constant.** The one file under `src/` is
`mapgen/towns.ts`, and what changed there is how two counting walks are
written, not what they count: every hash, every band and every scenario figure
below is bit-identical across the change.

**The clause is met on the instrument Z6 names, and that instrument turned out
to be a 120-town world already.** `tests/perf/fixture1500.ts` builds 120 towns
through `flatScenario`, which calls `placeTown` for each of them - claimed
ground, a street cross, houses either side - so M20's growth pass is not
dormant there, and "the 1500-vehicle fixture" and "a 120-town world" are the
same measurement. Three clean `npm run test:perf` runs on the final tree:

| run | tick p50 | tick p99 | max over 6,500 ticks |
| --- | --- | --- | --- |
| 1 | 1.464 ms | 2.927 ms | 19.411 ms |
| 2 | 1.384 ms | 2.770 ms | 19.984 ms |
| 3 | 1.382 ms | 2.705 ms | 19.431 ms |

against the M10 baseline of **1.45 / 3.26**: p50 +0.014 / -0.066 / -0.068 and
**p99 -0.333 / -0.490 / -0.555 - all three below the baseline**, against a
ledger budget line of +0.10 ms. The max in that window IS the month boundary,
and M10's own row records 39.4 ms there.

**The month-boundary tick was then isolated and measured on its own, because
"Monats-Tick" deserves the literal reading too.** A harness timed every tick of
a run crossing whole months and split the boundary ticks from the rest, run in
a `git worktree` at `c8b9e48` - the commit before M20 bundle 1 - and at HEAD,
alternating.

On fixture1500 the answer is **not separable from the fixture's own noise**:
month-tick medians over n=12-16 samples read 13.993 / 13.171 / 13.346 / 13.224
on the baseline and 13.569 / 13.539 / 13.821 / 14.010 at HEAD, so the
baseline's own spread is 0.82 ms and the difference of the means is 0.30. The
ORDINARY ticks of the same runs are clean and say the milestone costs nothing
per tick: p50 1.312 / 1.476 / 1.331 baseline against 1.328 / 1.340 / 1.455, p99
2.554 / 3.048 / 2.640 against 2.611 / 2.757 / 2.772.

So the number was taken on a quiet instrument instead: **a generated 1024 world
with 140 towns, mapgen's own street networks, and no player network at all** -
where the month tick is 0.5-1.1 ms and the town work is nearly all of it.
Seven interleaved pairs, n=40 month samples each, on the final tree:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pre-M20 | 0.549 | 0.557 | 0.612 | 0.745 | 0.523 | 0.598 | 0.715 | **0.614 ms** |
| M20 | 0.786 | 0.764 | 0.815 | 0.780 | 0.808 | 0.794 | 0.867 | **0.802 ms** |

**+0.188 ms at 140 towns**, i.e. 1.34 us a town, i.e. **+0.161 ms scaled to the
120 the clause names** - seven per cent over 0.15, and inside the +-0.12 ms
spread of the pairs themselves. That is the honest edge this milestone closes
on, and the next paragraph is why it is not the 0.63 it started at.

**Two probes, not a guess.** Neutralising the census call alone took the M20
month tick from 1.02 to 0.671 ms, landing inside the pre-M20 range: the zone
census of D-233 was the WHOLE of the delta, and nothing else M20 added to the
monthly block is measurable. A census micro-benchmark over the same 140 towns
(17,300 tiles inside the squares) then priced it at **225.9 us, i.e. 13.06 ns a
tile** - two orders of magnitude off what a scan of two typed arrays costs.
Three changes, each measured:

1. **The square is clamped to the map once instead of asking `map.contains` per
   tile**, and the row offset is hoisted instead of calling `map.tileIndex` per
   tile. 225.9 -> 178.9 us. The visited set is identical by construction, since
   `contains(x, y)` is exactly `0 <= x < size && 0 <= y < size`, which is what
   the clamp computes.
2. **`BuildingKind.None` is read once into a local instead of per tile.**
   178.9 -> **39.8 us**, which is 85 % of the whole cost and the finding worth
   keeping: an identical body written as a LOCAL function in the test file ran
   at 25.2 us against the imported one's 176.3, and calling the import through
   a local BINDING was still 178.1 - so it was never the module-namespace
   access, it was the ENUM MEMBER inside the inner loop, which the test
   runner's SSR transform turns into a namespace property load on every tile.
   The shipped bundle does not pay that; the project's own measurements do, and
   any future hot loop with a bare `SomeEnum.Member` in it will read the same
   way.
3. **The one-byte layer is asked before the two-byte one.** `buildingKind` is
   non-zero on 14 % of the square's tiles, so testing it first means `townId`
   is touched only where a building actually stands - the cold cache lines are
   the cost here, and this removes most of the second layer's. Measured on the
   generated world: month tick 1.02 -> 0.79 ms median.

Together, against **M20 bundle 3** (`3281bfd`) on the same world: month tick
median **1.067 -> 0.79 ms**, `growTowns` timed directly **301.4 -> 115 us**, and
the shipped `townGrowth.spec.ts` figure for the DAILY pass - which walks the
same square through `countTownBuildings` - **0.62 -> 0.20 us per game day** on
40 towns of a 512 map. Everything else that test prints is unchanged to the
digit (28 -> 60 buildings, 22 -> 34 street tiles, 8,000 -> 10,355 inhabitants
at 120.1 % passenger supply), which is what proves the walks still count what
they counted.

**What is left, named rather than dressed up.** The floor for a WALKED census
is the cold traffic over `buildingKind`: about eleven rows a town, one cache
line each, 140 towns a game month. Getting under it means CARRYING the census
instead of counting it - which D-233 refused for a stated reason (a carried
count has to be kept in step with the growth, the shrinkage, the demolition
command and every future rule that clears a tile) and which is save state under
Z4, so it is a bundle of its own with a migration and a re-recorded pin, not a
line in a closing bundle. **The clause is met on the Z6 instrument and on the
ledger's budget line; on the quiet 140-town world it lands 0.011 ms over at the
clause's own town count.** No constant was tuned to make any of this read
better - the only thing that moved is how a loop is written.

**Both new guards were falsified in the real source and the red build watched**
(D-198's discipline). `tests/unit/townGrowth.spec.ts` now holds both clamped
walks against a VERBATIM copy of the pre-clamp naive walk, on a town at (1, 2)
whose radius-4 square hangs over two map edges and on two towns four tiles
apart whose squares overlap. Dropping the low clamp so the walk starts at
`town.x - radius` fails with **"Eckstadt: total: expected 36 to be 18"**;
removing the owner check fails with **"Westheim: total: expected 44 to be
14"**. Both were reverted.

**The first of those two guards was vacuous when it was first written, and the
trap that fixes it is the interesting part.** A row walked from `y * size - 3`
instead of from `y * size` wraps onto the last three tiles of the PREVIOUS row
- and on an empty map those tiles carry nothing, so the broken walk and the
naive walk agreed and the test passed green with the clamp deleted. The fixture
therefore PLANTS the town's own id and a house on exactly those tiles before it
measures. A negative ROW needs no trap and cannot be given one: the index is
negative, a typed array reads `undefined` there, and the comparison falls
through - so the y clamp is safe by the language and the file says so rather
than pretending to test it. The tests assert their own non-vacuity as well: the
corner town really has buildings, its square really overhangs both edges, the
trap really was planted, and the two squares really do overlap.

**Everything a growing world touches, re-run rather than quoted.**

- **The eight shipped scenarios hash-identically** and their briefing guards
  hold: `tests/determinism/scenarios.spec.ts` green (11 tests),
  `tests/unit/shippedScenarios.spec.ts` green (**53 tests**) -
  `SCENARIO_WORLD_CLAIMS` (D-197), `SCENARIO_BRIEFING_FIGURES` (D-198) and
  `briefingTowns` (D-199) all still true of the worlds the seeds make, town
  populations and counts included. **Nothing was re-measured because nothing
  moved**: the claims are taken at GENESIS and this bundle changes no generated
  byte, which the unchanged canonical pin proves independently.
- **All three pins stand where D-233 left them**: canonical
  `5f4c022bef5b94d1`, soak `9aac5ef0864d5c69` at unchanged 35 commands, corpus
  manifest unchanged and all nine frozen fixtures still decoding to one world.
  `SAVE_VERSION` **31**. The soak fixture was NOT re-recorded, because no
  command changed and the replay reaches the recorded hash.
- **Every 19.4 band and every SPEC2 scenario, measured on the final tree**:
  scenario 1 payback **year 3** (485,735 / 493,316 / 501,669 / 509,938 /
  518,793 / 521,260 EUR), scenario 2 investment 249,980 EUR and payback
  **year 6**, scenario 3 **159,516 EUR/yr**, scenario 4 bankrupt in **year 9**,
  scenario 6 closure in **month 25**, Netzdesign **3.75** (alignment 2.01x,
  capacity 1.87x), Takt **-8.3 %** and delivery-variance ratio **0.57**, Harter
  Winter **-4.36 %** over six seeds, Punktzahl **5,889** with the 36/26/24/13
  split and the dogleg control at 7.8 % against 19.8 %, scenario 5 **1,022,084
  / 1,802,165 / 2,153,604 EUR**, and the `aiGame` sweep 12 competitors over 4
  seeds, 0 wound up, 4 took the field, 3 own a vehicle, total value 7,293,303
  EUR. The AI refusal profile prints on every run that has one. **Twelve files,
  101 tests, both costly desync twins included** (`npm run test:balance:full`).
- **Two figures the documentation carried had drifted, and the bisect says
  where.** Run at `c8b9e48` the bus line reads 485,738 / 494,144 / 501,718 /
  509,262 / 515,863 / 520,024 with return shares 0.113 % / 0.139 %, and
  Netzdesign reads **3.73** with the capacity split at 1.86x - D-215's figures
  to the digit. So **M20 moved both, and neither is this bundle**: both worlds
  are hand-built with `placeTown`, so D-232's shrinkage and its corrected 13.2
  weights reach them. Scenario 1 stays payback year 3 with MORE margin than
  before (521,260 against 520,024 after six years), Netzdesign stays far above
  its `>= 3` band, and CLAUDE.md's two stale numbers are corrected in the same
  edit rather than left to be found later. The same is true of D-231's digest
  line "8,000 -> 10,538 at 96.5 % passenger supply": measured at `3281bfd` it
  was already 10,355 at 120.1 %, so bundle 2's formula moved it and the digest
  was not carried along.

**Cost.** Zero sim behaviour, zero constants, zero save bump, zero migration
edit, zero snapshot bytes, zero atlas cells, zero i18n strings, zero RNG draws,
zero new files under `src/`. `npm run typecheck` and `npm run lint` clean; unit
**120 files / 1,551 tests** (+2 cases); determinism 33, corpus 5, soak 4,
balance:full 101 - all green. `npm run format:check` stays red on the files
D-227 names; the two files this bundle touched were formatted before they were
committed.

### D-235 M20 closed honestly: the perf clause given ONE reading, SPEC.md 13.2's third demand implemented, and three documentation claims made true or made tests

**SPEC2 M20 bundle 5, and it exists because an independent verifier read the
milestone back and found five things that were true of the prose rather than of
the code.** Four of the five Fertig-wenn criteria it confirmed with its own
fixtures; none of the five findings is a broken feature. **No save bump (v31
stands), no migration edit, no hashed byte, no RNG draw, no i18n string, no
atlas cell, no snapshot byte.** All three pins are where D-233 left them:
canonical `5f4c022bef5b94d1`, soak `9aac5ef0864d5c69` at unchanged 35 commands,
corpus manifest unchanged. `SAVE_VERSION` **31**.

---

**1. The perf clause had two readings and the measurements straddled the line -
so the SENTENCE now says which one it is.**

"der Monats-Tick p99 waechst um < 0,15 ms gegenueber der Grundlinie" can mean
the tick p99 over a window that CONTAINS the month boundary, or the isolated
month-boundary tick. D-234 measured both and left the ambiguity standing:
reading A is met with room (**-0.333 / -0.490 / -0.555 ms** on three clean
`test:perf` runs against the M10 baseline of 1.45 / 3.26), reading B is
**+0.161 ms** scaled to the 120 towns the clause names, i.e. **0.011 ms over**.
A specification and a measurement that can disagree is not a closed milestone,
so SPEC2 M20's Fertig-wenn carries a bracketed note now and 6.1.1's M20 row
points at it.

**Reading A is binding, and the argument is what the budget protects.** The
number it defends is SPEC.md 21's own row - "Sim-Tick bei 1.500 Fahrzeugen
<= 8 ms p99" - and Z6 names the instrument in the same breath: every
tick-millisecond promise in SPEC2 is measured against the 1500-vehicle fixture.
Ledger 6.1's column is headed "Tick-Budget Delta p99 (1500 Fzg., Z6)" and M20's
cell in it is +0,10 ms, so the Fertig-wenn's 0,15 is that same quantity with
headroom rather than a second, stricter promise about a different one. The
isolated month tick was never bound by SPEC.md 21 and could not be: M10's own
ledger row records it at **39.4 ms** against a budget of 8, because one outlier
in 6,000 ticks is by construction outside a p99. Read against 39.4 ms, 0.15 ms
is a **0.4 %** tolerance; read against 3.26 ms it is **4.6 %**. Only the second
is an engineering budget - the first would be a number nobody could have chosen
deliberately. The frame the player would feel says the same thing: one 39 ms
tick a game month is a single frame inside the 50 ms the 20 Hz clock allows,
and 0.15 ms of it is not what makes it visible or not.

**The other reading stays measured and is not smoothed.** +0.188 ms at 140
towns on a quiet generated 1024 world, +0.161 ms scaled to 120, **0.011 ms over
0.15 - seven per cent, on one tick in 6,000, and inside the +-0.12 ms spread of
the measurement pairs themselves.** That is a real number and a small one, and
this entry stands behind it rather than banding it away.

**D-233's refusal was re-examined rather than cited.** The only remaining cure
under reading B is CARRYING the zone census instead of walking it, which D-233
refused because a carried count must be kept in step with every writer of the
building layer. The reason holds, and it is counted here rather than asserted: a
source walk finds **three** writers of `map.buildingKind` under `src/sim` -
`mapgen/towns.ts`'s placement (which genesis AND the growth call),
`commands/build.ts`'s `DemolishBuilding`, and `town/growth.ts`'s removal - and
nothing since D-233 has reduced that number. A carried census is also save state
under Z4, so it is a migration and a re-recorded pin: a bundle of its own, and
not a line in a closing one.

---

**2. SPEC.md 13.2 specifies THREE demand scalings and the code implemented two -
so the third is implemented, and the one departure that remains has this entry.**

The section writes `bedarf.elektronik = max(0, (einwohner-3000)) / 2500`. That
formula appeared nowhere in `src/` and nowhere in `DECISIONS.md`: D-233 had
introduced `TOWN_INHABITANTS_PER_ELECTRONICS = 1_800` over a plain `einwohner`
with no threshold, and two comments made it worse by stating that 13.2 "scales
only the OTHER two demands" and that goods and food were "the two demand ratios
13.2 writes out". The project's own rule is that a departure without an entry is
a defect and not a decision, so this one is closed the way the rule prefers:
**the specification's arithmetic is implemented.**
`electronicsWantedFor(population)` is `max(0, population - 3000) / 2500`, pure
and exported, hand-checked against the specification's own numerals at ten
population scales in `townFormula.spec.ts`.

**The one thing 13.2 does not say is the commercial SHARE in front of the term,
and that is SPEC2 M20's own MUSS** ("Gewerbe ... verbraucht Waren+Elektronik").
Both are kept, because they are the same idea measured twice - the threshold is
SPEC.md's population proxy for "big enough to have a shopping street", the share
is what a zoned map can actually answer - and this paragraph is the entry that
makes the survivor a decision instead of a silence. The same gate sits on food
(`residentialShare`) for the same MUSS and is covered here with it.

**What it changes, measured rather than assumed.** The demand is smaller and
starts later: a city of 8,000 a third of whose buildings are commercial wants
**0.67 t a month** where it wanted 1.48, and a town under 3,000 wants **nothing
at all** where it used to want radios in proportion to its shops. On the
generated 256 world the mean town is 1,652 inhabitants, so the threshold is
doing real work there rather than being decorative in the other direction.
**Not one pinned hash moved** - canonical and soak both replay to the recorded
value, all nine corpus fixtures decode as before - and not one balance band
moved, which is the D-201 device again: every hand-built world of section 19.4
is all-residential, so the term is multiplied by zero there whatever its scale.
`zoneEconomy.spec.ts`'s electronics test needed a CITY to stay non-vacuous and
now says so in the fixture: at 4,000 inhabitants the specification's own demand
is 0.4 t against a goods basket of 4.4, and the integer population rounds the
difference away.

---

**3. A stale measurement presented as current, in two files.**

`CLAUDE.md` and D-231 both carried "661 -> 695 buildings, 872 -> 881 street
tiles, population 66,100 -> 69,772" for a generated 256 world with nobody
serving anything, and called it "what an unserved world should look like".
Bundle 2 (D-232) gave exactly that world the -0.03 %/month branch, so every
arrow in the sentence is backwards, and it survived two further bundles because
nothing red read it. **Re-measured on the final tree: 661 -> 642 buildings,
872 -> 869 street tiles, population 66,100 -> 63,820.** Both places are
corrected, D-231's paragraph keeps its original figures under a dated correction
note rather than being quietly rewritten, and the claim is a TEST now -
`townShrinkage.spec.ts`, "a generated world nobody serves" - which asserts the
direction, prints the figures for the next digest to copy, and costs 0.4 s.

---

**4. Two comments described `versorgungBau` differently.**

`town/update.ts` said the term "counts what was DELIVERED, not what the yard
consumed"; the call site in `vehicles/update.ts` said it is "booked on what the
yard ACCEPTED". Both were reaching for the same contrast against the yard's flat
200 t a month of consumption, and neither said what separates them: the caller
books `deliverToIndustry`'s RETURN value, so a merchant whose input stock is at
its cap credits the town with less than the lorry brought, and a closed one
credits nothing. The town-side comment says that now, with the reason - a lorry
tipping cement onto a yard with nowhere to put it has not supplied the town with
anything - so the two ends agree with each other and with the code.

---

**5. A stated total order, and what runs when the guard bites.**

`town/growth.ts` documented removal as "the candidate FARTHEST from the centre
goes first and ties break on the HIGHEST tile index - a total order no two
candidates tie on" and stopped there, which reads as an unconditional winner.
What executes is that order FILTERED by `mayRemoveBuilding`, and the two name
different tiles whenever the guard refuses the leader.

**Measured before it was written up.** On a fixture where the town's stop sits
out at the edge of its claim - built through the player's own commands, road and
stop, because that is the only geometry in which the guard can refuse the leader
while permitting a nearer candidate - a town cut to 400 inhabitants performs 24
removals: **the guard refused the winner of the order on 9 of them, the
tie-break on the highest tile index decided 22, and the executed tile agreed
with the documented order on 24 of 24.** So the CODE was right and the COMMENT
was short: the guard is a filter over the candidate set and never a reordering
of it, which is also why the walk may test it lazily - only for a candidate that
already beats the best so far - and still answer the same tile. The comment says
all of that now, including that the walk visits tiles in ascending index, so the
tie-break can only ever keep the last tie seen. `townShrinkage.spec.ts` pins it
against an implementation of the order written from the SENTENCE rather than
from the code, and asserts its own non-vacuity in both directions: the guard was
selective, and the tie-break was load bearing.

---

**Cost and verification.** Two `src/` files changed behaviour-bearing lines
(`sim/constants.ts`, `sim/town/update.ts`), one changed only comments
(`sim/town/growth.ts`), and the comment in `sim/vehicles/update.ts` was the
correct one and is untouched. `npm run typecheck` and `npm run lint` clean; unit
**120 files / 1,557 tests** (+6 cases: four for the electronics demand, one for
the removal order, one for the generated world); `tests/determinism` +
`tests/corpus`
**38** green at unchanged pins; `npm run test:soak` **4** green at
`9aac5ef0864d5c69`; `npm run test:balance:full` **12 files / 101 tests** green.
**Every band is where D-234 left it, to the digit and not by quotation** - the
suite was re-run with its whole output kept: scenario 1 payback **year 3**
(485,735 / 493,316 / 501,669 / 509,938 / 518,793 / 521,260 EUR), scenario 2
investment 249,980 EUR and payback **year 6**, scenario 3 **159,516 EUR/yr**,
scenario 4 bankrupt in **year 9**, scenario 6 closure in **month 25**,
Netzdesign **3.75** (alignment 2.01x, capacity 1.87x), Takt **-8.3 %** with the
delivery-variance ratio **0.57**, Harter Winter **-4.36 %** over six seeds,
Punktzahl **5,889** (36/26/24/13, dogleg control 7.8 % against 19.8 %),
scenario 5 **1,022,084 / 1,802,165 / 2,153,604 EUR**, and the `aiGame` sweep 12
competitors over 4 seeds, 0 wound up, 4 took the field, 3 own a vehicle, total
value 7,293,303 EUR, with the refusal profile printing. **No `test:perf` run is claimed for
this bundle**: it touches no hot path, and the acceptance numbers of the
milestone are D-234's three runs. `npm run format:check` stays red on the files
D-227 names; the files this bundle touched were formatted before they were
committed.

### D-236 Das Konjunktur-Jahrhundert: einmal bei der Genese gewuerfelt, viermal gelesen - und ein Save-Bump, der keinen einzigen Hash bewegt

SPEC2 M21 Bundle 1, E-09. **Der EINE Z5-Bump des Meilensteins: SAVE_VERSION 31 -> 32.**

**Was gebaut wurde.** Eine Jahrhundert-Kurve pro Frachtart-Gruppe, bei der
Weltgenese vollstaendig aus `streams.economy` gezogen, gespeichert und gehasht;
die Monats-Hooks LESEN sie nur. Sieben Zeilen a 101 Jahre = **707 Ints** in
Promille (E-09s "einige hundert Ints"): fuenf Frachtgruppen (Personen & Post,
Kohle, Rohstoffe, Fertigwaren, Container), die weltweite Konjunktur und der
Energiepreis. Vier Naehte, und keine fuenfte:

| Naht | Wo | Was |
| --- | --- | --- |
| Tarif | `deliveryRevenueCt(input.rateFactor)` | Gruppen-Zeile des Jahres |
| `costCt` | `World.costCt` -> `economyCostCt` | Konjunktur, gedaempft auf 0,5 |
| Industrie | `industryBaseOutput(..., cycle)` | Konjunktur, multipliziert IN den 7.3-Sinus |
| Energie | `bookMonthlyEnergy` | Energiepreis-Zeile des Jahres |

Kohle sinkt nach 2000 und Container boomen ab 1970 als **strukturelle Trends,
nicht als Wuerfelwurf**: eine Kurve, in der Kohle vielleicht nicht sinkt, macht
den Abnahme-Satz des Meilensteins zum Muenzwurf. Gezogen wird alles darum herum
- drei Konjunkturwellen mit gezogenen Phasen, eine eigene Welle je Gruppe, ein
Energieschock je Zwanzig-Jahres-Aera an gezogenem Jahr und gezogener Groesse,
plus +-4 % Jahres-Jitter. Gemessen ueber vier Seeds: Kohle **1,00 -> 0,69**
(letztes Jahrzehnt 0,46), Container **0,34 -> 1,63**, Konjunktur 0,75-1,26,
Energie 0,96-1,65.

**Warum die Kurve gespeichert wird, obwohl sie aus dem Seed folgt.** Weil sie
GEZOGEN ist. Eine beim Laden neu erzeugte Kurve waere eine zweite Stelle, an der
das Jahrhundert entschieden wird, und an dem Tag, an dem der Generator sich
bewegt, wuerde jeder existierende Spielstand still ein anderes Jahrhundert
spielen. `World.born` ist die EINE Tuer, die zieht (`create` und `fromGenerated`
gehen durch sie), `fromData` uebernimmt, was die Datei traegt, und zieht nie -
instrumentiert, nicht behauptet: `tests/unit/economyCurve.spec.ts` spioniert
`World.streamFor` und zaehlt ueber Genese + 13 Monats-Hooks + 1 Jahres-Hook
genau **einen** Aufruf mit dem `economy`-Salt, ueber ein Laden **null**.

**Die eine begruendete Abweichung: der Hash ist BEDINGT.** Die drei Weltregeln
ueber ihr (`occupancyPenalty`, `weather`, `elections`) hashen ihren Aus-Wert
mit, und das hat jedes Pin dieses Spiels je einmal bewegt. Hier ist der
Aus-Zustand kein WERT, sondern eine ABWESENHEIT: eine Welt ohne die Regel hat
gar keine Kurve, jeder Leser in `economy/curve.ts` gibt auf seiner ersten Zeile
exakt 1 zurueck, und `x * 1 === x` ist in IEEE-754 exakt - sie ist also nicht
aehnlich einer Prae-M21-Welt, sie ist arithmetisch dieselbe. Also hasht
`hashWorld` fuer sie nichts, und die Injektivitaet, die Z2 wirklich verlangt,
bleibt unberuehrt: die einzigen Welten, die wie eine Prae-M21-Welt
fingerabdrucken, sind Welten mit ausgeschalteter Regel. Der Parser haelt das
Paar zusammen - Regel aus => Tabelle leer, Regel an => 707 Eintraege im Band -,
sodass es keine Welt gibt, die beides gleichzeitig behauptet. Die Kurve steht
ausserdem nur im VOLLEN Digest, nicht im Live-Digest: sie ist nach der Genese
konstant, und 707 Woerter pro Spieltag kauften der F3-Anzeige nichts, was sie
sich je aendern sehen koennte (D-178s Argument, ein Instrument weiter).

**Was das gekostet hat: nichts, und das ist gemessen.** Der kanonische Pin
`5f4c022bef5b94d1` ist unveraendert (nur der `saveVersion`-Stempel 31 -> 32
wurde nach D-137-Protokoll neu geschrieben). Der Soak-Hash `9aac5ef0864d5c69`
ist unveraendert, **alle 16 Checkpoints byte-identisch**, 35 Kommandos. Das
Korpus-Manifest ist rein ADDITIV: alle zehn Alt-Hashes stehen, `v32-played`
dekodiert auf `63ea4f0ca2506741` - denselben Hash wie `v31-played`.
`SCENARIO_WORLD_CLAIMS` unveraendert (alle acht Szenarien tragen
`economy: false`), die Briefing-Waechter unberuehrt. **Alle Baender auf den Euro
identisch mit D-235**: Szenario 1 Payback Jahr 3 (485.735 / 493.316 / 501.669 /
509.938 / 518.793 / 521.260 EUR), Szenario 2 Investition 249.980 EUR und
Payback Jahr 6, Szenario 3 **159.516 EUR/Jahr**, Szenario 4 Bankrott Jahr 9,
Szenario 6 Schliessung Monat 25, Netzdesign **3,75** (Alignment 2,01x,
Kapazitaet 1,87x), Takt -8,3 % bei Varianz-Verhaeltnis **0,57** (22,9 -> 27,4
Tage), Harter Winter **-4,36 %** ueber sechs Seeds, Punktzahl **5.889**
(36/26/24/13, Dogleg-Kontrolle 7,8 % gegen 19,8 %), Szenario 5 **1.022.084 /
1.802.165 / 2.153.604 EUR**, aiGame-Sweep 12 Gegner ueber 4 Seeds, 0
abgewickelt, 4 im Feld, 3 mit Fahrzeug, Gesamtwert 7.293.303 EUR.

**Vorschau und Rechnung gehen durch DIESELBE Funktion.** `economyCostCt` ist
die Formel, die `World.costCt` bucht, und die vier Bau-Vorschauen der
Oberflaeche (`connect.ts`, `MapCanvas`, `TilePanel`, `FleetPanel`) rufen sie
jetzt statt `inflatedCostCt` - zwei Formeln, die heute uebereinstimmen, sind
genau, wie Vorschau und Rechnung ab Spieljahr zwei auseinanderlaufen (D-092).
Die Kurve reist dafuer im `ready`-Signal neben der Karte: ein
Genesis-Konstantes in einem 20-Hz-Stride waere das Stride-Wachstum, das
Fehlerkatalog 37 verbietet, und die Ledger-Zeile bucht M21 auf null
Layout-Aenderung.

**Die Oberflaeche kann die Kurve zeigen** (E-09s "inspizierbar"): sieben Linien
ueber das ganze Jahrhundert im Statistik-Zentrum, Marke auf dem gespielten
Jahr, darunter jede Zeile mit ihrem heutigen Wert. Sie liest `economySeries`
aus demselben Modul, aus dem der Tarif multipliziert wird - eine Tafel mit
eigener Arithmetik waere eine zweite Meinung darueber, was 1997 wert war.

**Bundle-Buchung** (Fehlerkatalog 40 in anderer Waehrung): 959.545 ->
**965.937 B, +6.392 B**, gemessen als zwei Builds desselben Baums (Worktree am
Eltern-Commit gegen den Arbeitsbaum). Aufgeteilt durch Kopieren NUR der beiden
Kataloge in den Baseline-Worktree: **+1.505 B sind die elf i18n-Schluessel in
zwei Sprachen**, die restlichen **+4.887 B sind Oberflaeche und
`economy/curve.ts` darunter**. Keine neue statische `src/sim`-Importkette, die
eine Welt dekodiert, serialisiert oder schrittet. Das Budget stand bei 966.000
- **63 Byte Luft, was keine Luft ist, sondern ein Zufall** -, also ist es mit
der Messung daneben auf 972.000 gehoben.

**Was dieses Bundle NICHT liefert** und was M21 noch schuldet: die
Container-Wiederbelebung am Hafen-Terminal (der Kurven-Boom ab 1970 existiert,
der Abnehmer noch nicht), die Liefervertraege mit `Account.ContractPenalties`,
das Subventions-Board, die Foerdergelder fuer emissionsarme Kaeufe und die
Industrie-Events aus `streams.events`. Alle fuenf erweitern die
`v31_to_v32`-Migration IN PLACE (Z5) und legen keine neue Nummer an.

**Tests:** `tests/unit/economyCurve.spec.ts`, 29 Faelle in sechs Gruppen -
einmal-bei-der-Genese (instrumentiert), Seed-Determinismus und die beiden
Trends ueber vier Seeds, die Regel-aus-Identitaet (jede Naht exakt 1, `costCt`
exakt die Prae-M21-Formel, ein untergeschobenes Jahrhundert bewegt den Digest
nicht), die vier Naehte, die Tabelle selbst und die Save-Kette (Rundlauf,
Regel/Tabelle-Widerspruch, Band-Verletzung, fehlende Regel, Migration).

### D-237 Der tote Frachttyp lebt: das Hafen-Terminal als Erzeuger UND Abnehmer, und ein Save-Bump, den dieser Bundle nicht braucht

SPEC2 M21 Bundle 2, E-09. **Kein zweiter Z5-Bump: `SAVE_VERSION` bleibt 32.**
Dieser Bundle legt kein Save-Feld an, also gibt es an der `v31_to_v32`-Migration
nichts zu erweitern - und das ist ein Befund, keine Sparmassnahme (siehe unten).

**Was gebaut wurde.** `Cargo.Containers` hatte seit M5 eine Rate, ein
Tonnengewicht, eine Verfallskurve und acht Fahrzeuge - und **nichts auf der
Karte hat je eine Kiste erzeugt**. Ein Hafen-Container-Terminal ist jetzt beides:
Quelle und Senke einer **Uebersee-Metafracht**. Kisten kommen von jenseits der
Karte an einem Hafen an Land und gehen an einem ANDEREN wieder in See; was der
Spieler faehrt, ist die Strecke dazwischen.

**Ein Terminal ist ein PAAR bestehender Module, kein vierzehnter `ModuleKind`.**
`isContainerPort` (in `station/types.ts`, neben `isWaterModule` und
`isSupportModule`) sagt: ein `Quay` UND ein `FreightTerminal` an derselben
Station. Ein eigener Modultyp haette eine Save-Format-Nummer, ein
Build-Kommando, einen Reject-Grund, eine Atlas-Zelle und einen vierzehnten
Eintrag in jeder Modultabelle gekostet - fuer ein Gebaeude, das der Spieler dort
schon hinstellen kann. Was die Paar-Regel stattdessen kauft: **der Handel kommt
an den Haefen an, die seit M7 gebaut werden.** Ab 1970 schlaegt der Hafen mit dem
Kran Container um, ohne dass irgendjemand etwas Neues lernen muss. Die Funktion
ist die EINE Definition - die Akzeptanzmaske, der Tageshook und die Oberflaeche
lesen sie, also koennen "was die Oberflaeche Containerhafen nennt" und "was
Kisten umschlaegt" nicht auseinanderlaufen.

**Die fuenfte Naht - und D-236 sagte "vier Naehte, und keine fuenfte".** Das
wird hier ausdruecklich korrigiert statt still gebrochen:
`economyContainerFactor` ist ein fuenfter Leser der Genesis-Kurve. Die
Invariante, die D-236s Satz schuetzt, ist, dass **jeder Leser in
`economy/curve.ts` lebt**, und die gilt unveraendert. Zwei Dinge sind an dieser
Naht anders als an den vier davor, und beide sind der Grund, warum Container tot
waren:

* **Ihre Identitaet ist NULL, nicht Eins.** Die vier alten Naehte skalieren
  etwas, das es auch ohne Jahrhundert gibt; diese hier entscheidet, ob es die
  Groesse ueberhaupt gibt. Eine Welt ohne Kurve hat gar keinen
  Uebersee-Handel - also exakt die Prae-M21-Welt, in der nie eine Kiste
  entstand. Der Balance-Anker aus Fehlerkatalog 34 ("Konjunktur: aus") ist damit
  **per Konstruktion** unberuehrt, nicht per Glueck.
* **Sie ist hart auf `ECONOMY_CONTAINER_BOOM_FROM_YEAR` gegattert.** Die
  Container-Zeile der Kurve traegt schon ab 1950 `ECONOMY_CONTAINER_BEFORE`
  (0,35) - eine Kiste, die trotzdem gefahren WIRD, ist etwas wert -, aber
  **erzeugen** darf sie niemand. E-09 sagt "boomt ab ~1970"; ein Hafen, der 1951
  still Kisten umschlaegt, machte diesen Satz zur Dekoration.

**Die fuenf Regeln, ausgeschrieben statt entdeckbar** (`station/containers.ts`
traegt sie im Kopfkommentar, `tests/unit/containerPort.spec.ts` haelt jede):

1. **Erzeugung.** Nur im Tageshook, nur an einem Containerhafen, nur ab 1970,
   nur mit Weltregel `economy`. Keine Industrie und keine Stadt erzeugt sie.
2. **Ziel.** Ein Containerhafen ist das EINZIGE auf der Karte, das einen
   Container annimmt (`PORT_OVERSEAS_CARGO`, in `assignStationIndustries`
   gewaehrt), also kann das gewoehnliche M5-Routing eine Kiste nur zu einem
   anderen Hafen schicken. Es gibt kein container-eigenes Routing.
3. **Verweigerung.** Ein Hafen ohne erreichbaren Partner erzeugt **gar nichts**
   (`depositRoutedAtStation`, das `depositReturns`-Muster aus M19). Kohle ohne
   Linie ist eine echte Beschwerde und wartet, weil die Kohle auch ohne Linie
   existiert; ein Container ohne Gegenhafen ist ein Schiff, das nie ablegt. Ihn
   zu erfinden hiesse, jedem Hafen der Karte ab 1970 einen
   Ueberfuellungs-Malus zu schenken.
4. **Ueberlauf.** Das Angebot laeuft durch dasselbe `placeDeposit` wie jede
   andere Produktion: Kisten zaehlen gegen `STATION_CARGO_CAPACITY` mit allem
   anderen, werden an der vollen Tuer abgewiesen, und diese Abweisung wird als
   `overflowUnits` und als `Expired` im Ring gebucht. Kein reservierter Platz
   fuer Container.
5. **Zustellung und Erhaltung (D-065).** Ein zugestellter Container ist nach
   Uebersee gegangen: `deliverCargo` bucht ihn und kehrt zurueck - **vor** der
   Industrie- und der Stadtschleife, damit kein kuenftiges Rezept eine Kiste
   still in einen Industrie-Input verwandelt. Er landet nie in einem Lager, nie
   an einem Stadtzaehler und nie - die Regel, um die es D-065 wirklich geht - in
   `station.waiting`.

**Erhaltung ist gemessen, nicht behauptet.** Der Test summiert alle vier Toepfe
(wartend + an Bord + zugestellt + verfallen) **tickweise** ueber einen Spielmonat
mit zwei Haefen und einem Schiff: auf jedem Tick, der kein Tagesgrenz-Tick ist,
ist die Summe **exakt** konstant (Toleranz 1e-9 auf Float-Rundung) - Laden,
Loeschen, Zustellen, Umsetzen und Verfallen VERSCHIEBEN nur zwischen den
Toepfen -, und auf Tagesgrenzen darf sie steigen und nie fallen. Eine Kiste, die
aus der Welt faellt, ist genau ein negatives Delta auf einem Tick, der nichts
erzeugt. Bewusst innerhalb EINES Spielmonats: der Historien-Ring rundet beim
Monatswechsel auf Int32, und eine Erhaltungsaussage, die eine Toleranz braucht,
um die eigene Buchhaltung zu ueberleben, ist keine.

**Der D-118-Kettentest kennt den Abnehmer.** Der Gang durch die Kettentabelle
fragt jetzt drei Akzeptanztabellen statt zwei (`hasAcceptor`: Industrie-Rezept,
Stadt-Nachfrage, Kaimauer) - eine Industrie, die eines Tages Container
ausstoesst, findet ihren Abnehmer statt durchzufallen. Dazu ein dritter Arm, der
Container als **geschlossene** Metafracht festnagelt: kein Industrie-Output und
kein `TOWN_OUTPUTS` erzeugt sie, und weder ein Industrie-Input noch `TOWN_CARGO`
noch `STATION_ALWAYS_ACCEPTED` nimmt sie - das Terminal ist der einzige Erzeuger
und der einzige Abnehmer. **Erzeuger- und Akzeptanzliste sind physisch DIESELBE
Konstante** (`PORT_OVERSEAS_CARGO` in `industry/catchment.ts`, neben ihren zwei
Geschwistern), also kann die Sackgasse nicht durch Drift entstehen.

**Akzeptanz ist absichtlich NICHT auf das Jahr gegattert.** `acceptedCargo` ist
derived und wird nur neu berechnet, wenn sich eine Station aendert oder ein Save
geladen wird - ein Kalenderterm darin waere so lange schal, wie niemand den
Hafen anfasst (dieselbe Falle, die `refreshCommercialShare` eine Funktion weiter
dokumentiert). Ein Hafen, der 1951 Kisten annaehme, kostet nichts, weil 1951
keine entsteht.

**Warum kein Save-Feld - und warum das geprueft und nicht angenommen ist.**
Alles, woraus der Handel besteht, steht schon im Save: die Module, die Kurve
(D-236) und die wartende Fracht. Z4-Historie gibt es keine - das Angebot ist
eine Funktion des HEUTIGEN Ratings und des HEUTIGEN Jahres, der Hook ist
zwischen zwei Tagen zustandslos. Damit bewegt sich kein gehashtes Byte, und das
ist gemessen: kanonischer Pin `5f4c022bef5b94d1` **unveraendert**, Soak
`9aac5ef0864d5c69` **unveraendert** bei 35 Kommandos und 16 byte-identischen
Checkpoints, Korpus-Manifest unberuehrt, `SCENARIO_WORLD_CLAIMS` unveraendert
(alle acht Szenarien tragen `economy: false`, und keines hat einen Kai mit Kran).
**Alle Baender aufs Euro identisch mit D-236**: Szenario 1 Payback Jahr 3
(485.735 / 493.316 / 501.669 / 509.938 / 518.793 / 521.260 EUR), Szenario 2
Investition 249.980 EUR und Payback Jahr 6, Szenario 3 **159.516 EUR/Jahr**,
Szenario 4 Bankrott Jahr 9 bei 304.400 EUR investiert, Szenario 6 Schliessung
Monat 25, Netzdesign **3,75** (Alignment 2,01x, Kapazitaet 1,87x), Takt -8,3 %
bei Varianz-Verhaeltnis **0,57**, Harter Winter **-4,36 %** ueber sechs Seeds,
Punktzahl **5.889** (36/26/24/13, Dogleg 7,8 % gegen 19,8 %), Szenario 5
**1.022.084 / 1.802.165 / 2.153.604 EUR**, aiGame-Sweep 12 Gegner ueber 4 Seeds,
0 abgewickelt, 4 im Feld, 3 mit Fahrzeug, Gesamtwert 7.293.303 EUR.

**Die eine neue Konstante und wer sie besitzt.**
`PORT_CONTAINER_TEU_PER_MONTH = 30` ist die ANGEBOTS-Seite des Handels, den
D-236 bepreist hat, und sie ist gegen den eigenen Referenz-Erzeuger des Spiels
gewaehlt statt erfunden: bei 14 t je Box sind dreissig TEU **420 t im Monat**
gegen die 300 t einer Kohlemine, und zu den beiden Grundraten **36.000 EUR**
Brutto-Angebot ueber `PAYMENT_DISTANCE_TILES` gegen die 25.200 der Mine. Ein
Hafen ist eine groessere Quelle als eine Grube und keine andere
Groessenordnung - das ist es, was den neuen Handel davon abhaelt, jede andere
Linie sinnlos zu machen. Sie ist **je HAFEN und nicht je Kai oder je Kran**: wer
sechs Liegeplaetze anlegt, wird dafuer bereits ueber den Ausstattungsterm des
Ratings und den Einzugsradius bezahlt, und dieselben Module zweimal zu bezahlen
machte den Box-Handel zum Spam-Ziel statt zur Linie. Das Rating multipliziert
das Angebot - die Regel, die CLAUDE.md fuer eine Stadt und D-063 fuer eine
Industrie festhaelt, auf einen Hafen angewandt: ein Liegeplatz, an dem niemand
anlegt, ist einer, den die Reederei nicht mehr anfaehrt.

**Kein Abschnitt 19.4 besitzt diese Zahl, also besitzt sie das Band im Test.**
Gemessen wird ein volles Spieljahr auf zwei Haefen an einer elf Kacheln breiten
Meerenge mit einem Containerschiff: **186 TEU zugestellt, 17.676 EUR** bis 1971,
gegen ein Angebots-Dach von 2 x 12 x 30 = 720 TEU. Das Band ist
`2 x PORT_CONTAINER_TEU_PER_MONTH < TEU < 2 x 12 x PORT_CONTAINER_TEU_PER_MONTH`
und es bandiert die VERSORGUNG. **Es ist ausdruecklich keine
Rentabilitaetsmessung** - ein 320-TEU-Schiff auf elf Kacheln ist keine Linie, die
irgendwer bauen wuerde, und die gedruckte Zahl sagt das. Was die Strecke wert
ist, fuer die es gedacht ist, ist die Rechnung ueber 100 Kacheln nach 2000: rund
864 TEU im Jahr ueber beide Haefen, brutto etwa 1,04 Mio. EUR vor dem
Zeitfaktor, der bei einem Schiff auf dieser Strecke tief in den Verfall laeuft -
eine Linie, die sich in wenigen Jahren traegt, und keine, die alles andere
ueberholt. Ein eigenes 19.4-Szenario dafuer ist nicht bestellt und wird nicht
erfunden.

**Bundle-Buchung.** 965.937 -> **968.190 B, +2.253 B**, gemessen als drei Builds
desselben Baums (Arbeitsbaum; Arbeitsbaum mit auf HEAD zurueckgesetzten
i18n-Katalogen; `git stash -u` auf HEAD). Aufteilung: **+1.422 B sind die vier
i18n-Schluessel in zwei Sprachen** (zwei Stationssaetze und der
Handbuch-Eintrag), die restlichen **+831 B** sind `station/containers.ts`, die
Akzeptanzliste, `isContainerPort`, die Kurven-Naht und die Panel-Zeile. Budget
**972.000 unveraendert**, Restluft 3.810 B. Keine neue statische
`src/sim`-Importkette in die Oberflaeche: `TilePanel` importierte
`station/types` und `constants` bereits.

**Tick.** Ein zusaetzlicher Tageshook, der in jeder Welt ohne Jahrhundert auf
seiner ersten Zeile zurueckkehrt - also in jeder Welt, an der ein Pin dieses
Repositoriums je gemessen wurde. Mit Kurve ist es ein `isContainerPort`-Scan je
Station und Spieltag (indizierte Schleife, kein Iterator, Gesetz 7).
`npm run test:perf` auf dem Referenz-Fixture: Tick **p50 1,532 / p99 2,823 ms**
gegen die M10-Grundlinie 1,45 / 3,26 - der p99 DARUNTER. Die Ledger-Zeile
(+0,05 ms fuer M21) ist damit eingehalten; die Zahl wird als "im Rauschen dieser
Maschine" berichtet und nicht als Abnahmezahl beansprucht (D-167/D-215-Haltung).

**Oberflaeche.** Die Stationszeile im Kachel-Panel nennt einen Containerhafen
und das Jahr, ab dem er umschlaegt - **nur wenn die Welt ueberhaupt ein
Jahrhundert hat**, denn ohne die Regel gibt es den Handel nicht und ein Hafen,
der ihn verspraeche, luege. Sie fragt die Sim-eigene `isContainerPort`, nicht
eine Kopie der Regel. Dazu ein Handbuch-Eintrag im Frachtkapitel mit dem
ASCII-Diagramm der beiden Kaimauern (`HANDBOOK_CHAPTER_OF` mitgewachsen, was
`settings.spec.ts` erzwingt).

**Was M21 noch schuldet**: die Liefervertraege mit `Account.ContractPenalties`,
das Subventions-Board, die Foerdergelder fuer emissionsarme Kaeufe und die
Industrie-Events aus `streams.events`.

**Tests:** `tests/unit/containerPort.spec.ts`, 16 Faelle in sechs Gruppen - was
ein Containerhafen IST (Paar-Regel, Akzeptanz, Jahres-Ungattertheit), nichts vor
1970 (kein Jahrhundert, jedes Jahr davor, ein voller Monat durch `World.step`),
die Verweigerung ohne Partner (und ihr Anspringen, sobald einer existiert), das
Angebot selbst (Formel, Tageshook, Ueberlauf an der vollen Tuer), der Fluss
zwischen zwei Haefen mit der Preisprobe gegen `deliveryRevenueCt` und dem
gemessenen Jahr, sowie Erhaltung und D-065. Dazu der dritte Arm in
`tests/unit/deliveries.spec.ts`.

### D-238 Liefervertraege, das Subventions-Board und das elfte Konto - und die ehrliche Messung, dass der Hebel die KI fast nie erreicht

SPEC2 M21 Bundle 3. **Kein zweiter Z5-Bump: `SAVE_VERSION` bleibt 32**; die
`v31_to_v32`-Migration ist an Ort und Stelle erweitert, wie Z5 es fuer die
spaeteren Bundles eines Meilensteins vorsieht.

**Was gebaut wurde.** Drei Dinge, die SPEC2 M21 namentlich bestellt:

1. **Liefervertraege** (`src/sim/economy/supply.ts`): eine verbrauchende
   Industrie ordert eine Monatsquote - SPEC2s eigenes Beispiel, 200 t Kohle im
   Monat fuer ein Stahlwerk. Opt-in per `AcceptSupplyContract`, monatlich
   abgerechnet, Bonus fuer die erfuellte Quote, anteilige Strafe fuer den
   Fehlbetrag, und bei Dauerbruch Input-Hunger.
2. **Das Subventions-Board** (`src/sim/economy/subsidies.ts`), ein Klon von
   `contracts.ts` in der Form und etwas anderes in der Sache: der Staat bietet
   das 1,5- bis 2-Fache der Rate fuer N Monate auf einer UNBEDIENTEN
   (Quelle, Ziel)-Relation, und **das erste liefernde Unternehmen gewinnt sie**
   (D-107). Es gibt kein Kommando dazu - die einzige Art teilzunehmen ist, die
   Linie zu bauen.
3. **`Account.ContractPenalties`**, das elfte Konto, plus die Foerdergelder fuer
   emissionsarme Fahrzeugkaeufe (SPEC.md 14.3) als Rabatt im Buy-Kommando.

**Das elfte Konto schliesst die 14.1-Luecke, die SPEC2 mit Zeilennummer
nennt.** `settleExpired` (`economy/contracts.ts`) buchte seine
Konventionalstrafe ueber `bookExpense`s Vorgabewert nach `Construction`: wer die
Buecher las, sah eine Baurechnung, die er nie beauftragt hatte. Beide Strafen -
die verfehlte Ausschreibung und die verfehlte Monatsquote - buchen jetzt dorthin
und nirgends sonst.

**Der Preis dafuer ist der einzige Grund, warum dieser Bundle Pins bewegt.**
`ACCOUNT_COUNT` 10 -> 11 verbreitert jede Zeile jeder Firmenbuchhaltung, und
`hashWorld` hasht die ganze Buchhaltung. Also bewegt sich JEDER Welt-Digest
dieses Spiels, in jeder Welt, ob sie ein Jahrhundert hat oder nicht. Neu
aufgezeichnet nach D-137-Protokoll: kanonischer Cross-OS-Pin
`5f4c022bef5b94d1` -> **`5fc5168993e38191`**, Soak `9aac5ef0864d5c69` ->
**`cc491b59f6bfc729`** bei **unveraendert 35 Kommandos und 16 Checkpoints**
(genau das ist der Beleg, dass sich nur der Digest bewegt hat und nicht das
Spiel), Korpus-Manifest `1dd5bb6255a236a9` -> **`c1df3e4dfb1558a9`** (v22-v30)
und `63ea4f0ca2506741` -> **`a5f594cc0bc76901`** (v31, v32). Der Zwei-Hash-Split
des Korpus ist aelter als dieser Bundle und unveraendert.

**Ein v32-Spielstand des VORIGEN Builds ist von diesem Build nicht mehr
lesbar, und das steht hier statt in einer Fussnote.** Migrationen laufen nur
UNTER `SAVE_VERSION`; ein v32, das Bundle 1 geschrieben hat, traegt
zehnspaltige Konten und keine der beiden neuen Tafeln, und der Parser weist es
zurueck. Z5 erlaubt genau einen Bump je Meilenstein und verlangt, dass spaetere
Bundles ihn erweitern - die Kehrseite ist, dass v32 bis zum Ende des
Meilensteins keine eingefrorene Zusage ist. Die Korpus-Fixture
`v32-played.ironsave` wurde deshalb **neu aufgezeichnet**; die zehn aelteren
Fixtures (v22-v31) laden unveraendert durch die erweiterte Migration.

**Zwei Migrationen bemassen sich an einer LEBENDEN Konstante - D-207s Regel,
hier noch offen.** `v12_to_v13` schrieb `zeros(ACCOUNT_COUNT)` und
`v19_to_v20` nahm `ACCOUNT_COUNT - 1` als alte Breite. Beide schreiben damit die
HEUTIGE Kontenzahl in einen Spielstand, der auf dem Weg zu einer Version ist,
die sie nicht hatte: seit M8 das zehnte Konto einfuehrte, migriert ein v12 auf
elf Spalten und wird vom Parser abgewiesen. Aufgefallen ist es nie, weil der
Korpus bei v22 anfaengt - oberhalb beider Schritte. Jetzt Literale
(`ACCOUNT_COUNT_V13 = 9`, `ACCOUNT_COUNT_V20 = 10`, `ACCOUNT_COUNT_V32 = 11`)
und **eine** gemeinsame `widenAccounts`, weil das flache 24-Monats-Ringlager
Zeile fuer Zeile neu gelegt werden muss und ein Fehler dabei nicht wirft,
sondern jeden historischen Monat um ein Konto verschiebt. Der Fix ist
arithmetisch richtig und **durch keine Fixture belegt** - der Korpus hat keine
v12.

**Beide Tafeln haengen an der Weltregel `economy`, und das ist eine
Entscheidung.** SPEC2 M21 nennt genau EINEN Balance-Anker fuer diesen
Meilenstein ("Weltregel Konjunktur: aus pinnt alle Referenzlaeufe"), und D-237
hat den Ueberseehandel bereits zur Folge derselben Regel gemacht. Eine zweite
Regel waere eine zweite Antwort auf dieselbe Frage und wuerde "Konjunktur: aus"
das Pinnen der Referenzlaeufe wegnehmen. `reviewSupply` und `reviewSubsidies`
kehren ohne die Regel auf ihrer ersten Zeile zurueck - kein Stream, kein Zug,
kein Datensatz - und `subsidyRateFor` gibt exakt 1 zurueck. Folge, gemessen
statt gehofft: **jedes Band identisch mit D-237 auf den Euro** (Szenario 5
1.022.084 / 1.802.165 / 2.153.604 EUR, Punktzahl 5.889, Netzdesign 3,75, Harter
Winter -4,36 %), `npm run test:balance:full` gruen bei 101 Tests.

**Erfuellung ist, was das WERK genommen hat.** `creditSupply` wird aus dem
Zustellpfad mit dem Betrag gerufen, den `deliverToIndustry` angenommen hat -
D-085s Mass eine Station weiter: eine Ladung, die ein volles Eingangslager
abgewiesen hat, hat nicht geliefert, und sie gutzuschreiben hiesse, eine Quote
liesse sich durch Abkippen auf einem Bahnsteig erfuellen. Die Quote teilt sich
gleichmaessig auf die Halter (zwei Lieferanten schulden je die Haelfte),
gemessen wird die Firma an IHREM Anteil und das Werk an der SUMME.

**Input-Hunger fasst genau ein Eingangslager an.** Nach
`SUPPLY_BREACH_MONTHS` = 3 aufeinanderfolgenden Monaten unter Quote verliert das
Werk die Haelfte dessen, was es von genau dieser Fracht noch hat. Nicht das
Produktionsniveau, nicht die Schliessuhr, nichts sonst: **nichts schrumpft eine
Industrie** (D-086), und ein Liefervertrag darf keine Hintertuer zur
Niedergangsregel werden, die gemessen und entfernt wurde. Der Test beweist das
gegen eine KONTROLLE - dasselbe Werk mit erfuellter Quote -, denn ein Stahlwerk
frisst seine Kohle ohnehin, und ein gefallener Bestand ist kein Beleg fuer
Hunger; ein WEITER gefallener ist einer.

**Das Wettrennen geht an genau ein Unternehmen, und Hinsehen gewinnt es nicht.**
`subsidyRateFor(..., claim)` ist die einzige Schreibstelle ausserhalb des
Monatsreviews. Mit `claim: true` (nur der Zustellpfad, nur eine echte
Zustellung, nie ein Transfer) faellt der Anspruch an die erste liefernde Firma
und gilt fuer den Rest der Laufzeit; mit `claim: false` fragen die beiden
KI-Schaetzungen und die Oberflaeche. Der Faktor reist auf der `Opportunity`
(`subsidyFactor`), damit die Rangfolge und die Rentabilitaetsschwelle
DIESELBE Zahl sehen - die D-219-Lehre, dass ein Filter und der Bauer, fuer den
er filtert, nicht auseinanderlaufen duerfen.

**Der Hebel auf die KI ist bewiesen - und er erreicht sie in erzeugten Welten
fast nie. Beides ist gemessen.**

* **Bewiesen, kontrolliert** (`tests/unit/subsidies.spec.ts`): eine Kohlegrube
  auf Produktionsniveau 10, das Stahlwerk 60 Kacheln weiter, die Maschinenfabrik
  dahinter als Weiterleitung. Ohne Subvention ist die Kandidatenliste des
  Strassen-Konkurrenten **leer** und er baut in drei Jahren **nichts** - keine
  Station, kein Fahrzeug. Mit der Subvention (2,0) erscheint genau dieses Paar
  in der Liste, er baut **zwei Stationen und sechs Lastwagen**, faehrt sie, und
  **gewinnt das Wettrennen durch Liefern** (`claimedBy = 1`, 119 Einheiten in
  drei Jahren). Das Niveau 10 ist nicht gewaehlt, sondern gefegt: bei 15 baut er
  die Linie ohne Hilfe, bei 10 verweigert er sie.
* **Die Sechzehn-Seed-Messung sagt etwas anderes.** 16 Seeds x 25 Jahre x 3
  Konkurrenten, Jahrhundert an, zwei Arme auf denselben Welten (der
  Kontrollarm leert die Tafel zu Beginn jedes Ticks, das Monatsreview laeuft
  also weiter und zieht weiter aus seinem eigenen Stream): **312 Angebote,
  davon von einem Konkurrenten gewonnen: 2.** Auf **14 von 16 Seeds sind beide
  Arme auf den Euro identisch** - die Tafel aendert nichts. Auf den beiden
  anderen aendert sie viel und in beide Richtungen: Seed 12345 6 Fahrzeuge / 1
  Linie -> 0/0 bei +494.423 EUR, Seed 918273 0/0 -> 18 Fahrzeuge / 3 Linien bei
  -894.280 EUR. Gesamt **23.290.860 -> 22.891.003 EUR (-1,7 %)**, Fahrzeuge
  102 -> 114, abgewickelt 0 zu 0.
* **Warum, ohne Beschoenigung**: ein Konkurrent baut in einem Vierteljahrhundert
  ein bis drei Linien; ein Angebot steht 12-36 Monate auf einem zufaelligen
  unbedienten Kettenpaar. Dass ein Entscheidungszyklus auf ein Angebot trifft,
  das genau dieses Unternehmen bauen kann, ist selten - und wo die Tafel doch
  wirkt, wirkt sie als chaotische Divergenz (eine andere Rangfolge, eine andere
  Linie), nicht als gerichtete Verbesserung. **Das ist nicht nachgestellt
  worden**: eine Konstante zu drehen, bis die Zahl gefaellt, waere Tuning gegen
  eine Messung, und es gehoert in einen eigenen Bundle mit eigener Messung.
* **Ein Zaehlfehler wurde dabei gefunden und korrigiert.** Der erste Lauf zaehlte
  die Ansprueche auf der Tafel, wie sie im Jahr 25 dastand - abgelaufene
  Angebote werden aber geloescht, also war er blind fuer jeden frueheren
  Gewinn und meldete 0. Gezaehlt wird jetzt monatlich mitlaufend. Deshalb
  beansprucht `SUBSIDY_MIN_DISTANCE`/`_MAX_DISTANCE` (das Fenster, in dem eine
  Linie ueberhaupt traegt - dieselben Zahlen wie die KI-Kandidatenliste) auch
  KEINE gemessene Verbesserung, sondern nur sein Argument.

**Foerdergeld fuer emissionsarme Kaeufe: eine Funktion derselben Tabelle, aus
der die Abgabe geschoepft wird.** `cleanVehicleGrantShare` = (Diesel-Wert minus
dieser Antrieb) / Diesel-Wert x `CO2_VEHICLE_GRANT_MAX_SHARE` (0,25), geklemmt
bei null - also Dampf und Diesel nichts, Elektro 0,786 der Decke, Batterie
0,714, Wasserstoff 0,262. Kein zweites Sauberkeits-Mass, das aus dem Tritt
geraten koennte. `grantedPriceCt` ist die EINE Funktion, die alle vier
Kauf-Kommandos rufen. Die Decke ist gegen `RESALE_SHARE` = 0,6 gewaehlt: wer
mit 25 % Rabatt kauft und am selben Tag verkauft, verliert 15 % - unter 0,4 kann
das Foerdergeld nie zum Arbitragegeschaeft werden, und der Test haelt genau das
fest. **Der Buchwert ist der Listenpreis MINUS demselben Foerdergeld** und nicht
die inflationierte Rechnung: was diese Zeilen immer gebucht haben, bleibt
gebucht - eine Aenderung dort haette jede Firmenbewertung dieses Spiels bewegt.

**Was die Oberflaeche NICHT quotiert, ehrlich benannt.** Das Flottenpanel zeigt
`spec.priceCt` roh - den Katalogpreis - und weicht damit seit M6 um die ganze
Inflation von der Rechnung ab, jetzt zusaetzlich um das Foerdergeld. Das ist
eine echte Luecke in D-119s Regel; sie wird hier benannt statt halb geschlossen,
denn das Panel braucht dafuer die `emissions`-Regel und den Kostenfaktor der
Welt, und eine zweite Preisformel im Panel ist genau der Weg, auf dem Vorschau
und Rechnung auseinanderlaufen.

**Ledger.** SAVE_VERSION 32 (erweitert, kein Bump); Snapshot-Layout
unveraendert - die beiden Tafeln reisen im `contractsChanged`-Monatskanal neben
den Ausschreibungen und kosten null Stride-Bytes (Fehlerkatalog 37); null
Atlas-Zellen. Hauptbundle 968.190 -> **972.824 B (+4.634)**, davon **+1.979 B
die neunzehn i18n-Schluessel in zwei Sprachen** (gemessen, indem genau diese
neunzehn Zeilen aus beiden Katalogen geloescht und neu gebaut wurde: 970.845 B)
und **+2.655 B die Oberflaeche**; Budget 972.000 -> **978.000** mit der Messung
daneben (D-192s Regel). Kein `npm run test:perf`-Lauf wird fuer diesen Bundle
beansprucht: die beiden Monatsreviews laufen in der Monatskadenz, und der
einzige Zusatz im Tick-Pfad ist ein Listendurchlauf ueber hoechstens drei
Angebote je Zustellung, der in jeder Welt ohne Jahrhundert auf der ersten Zeile
zurueckkehrt.

**Tests:** `tests/unit/supplyContracts.spec.ts` (11 Faelle: das elfte Konto, die
Tafel als Eigenschaft der Regel, Annahme und Ablehnung, die 200-t-Quote mit
Bonus UND Strafe ueber `Account.ContractPenalties`, die anteilige Strafe, das
Mass am Werk, der Hunger gegen eine Kontrolle und sein Zuruecksetzen),
`tests/unit/subsidies.spec.ts` (9 Faelle: die Tafel, das Wettrennen an genau
eines, Hinsehen gewinnt nicht, falsche Fracht/Richtung/Frist, Inertheit ohne
Jahrhundert, der Hebel auf die Kandidatenliste, der gebaute Betrieb gegen die
Kontrolle, und dass jeder andere Kandidat exakt zum Tarif quotiert bleibt), vier
neue Faelle in `tests/unit/emissions.spec.ts` fuer das Foerdergeld.

**Was M21 noch schuldet**: die Industrie-Events aus `streams.events`
(Rekordernte, Streik) mit ihren `postOnce`-Meldungen.

### D-239 Industrie-Events: die Rekordernte, der Streik - und der ruhende Monat, der nicht zur Schliessung zaehlt

SPEC2 M21 Bundle 4, der letzte des Meilensteins. **Kein zweiter Z5-Bump:
`SAVE_VERSION` bleibt 32**; die `v31_to_v32`-Migration ist zum dritten Mal an
Ort und Stelle erweitert, wie Z5 es fuer die spaeteren Bundles eines
Meilensteins vorsieht.

**Was gebaut wurde.** Der letzte offene MUSS-Punkt von M21, woertlich:
"Industrie-Events aus `streams.events`: Rekordernte (temporaerer
Output-Multiplikator), Streik (ein ruhender Monat - Dormanz zaehlt per D-086
nicht zur Schliessung); News via `postOnce`."

`src/sim/industry/events.ts` ist die eine Stelle, an der die Regel wohnt. Ein
Ereignis ist ein Datensatz mit Werk, Art, Anfangs- und Endtick; die Monatsrunde
`reviewIndustryEvents` raeumt Abgelaufenes weg und wuerfelt neu, und drei
Lesefunktionen sind alles, was der Rest der Simulation davon sieht.

**Die Falle, die dieses Feature stellt - benannt, bevor sie zuschnappt.** Ein
Streik ist ein Monat ohne Produktion. Abschnitt 7.3 zaehlt Monate ohne
Abtransport auf die 24-Monats-Schliessungsuhr, und die Dormanz-Regel, die
`reviewIndustries` bereits hat, greift **nicht**: sie prueft "nichts produziert
UND nichts im Hof stehen", und ein bestreiktes Werk hat in aller Regel einen
vollen Hof - es hat bis zum Vormonat gearbeitet. Ein naiv gebauter Streik haette
also still einen der vierundzwanzig Monate verbraucht, die der Spieler hat, um
eine Linie dorthin zu legen. Die Regel steht deshalb **ausdruecklich** im Review
(`industryStruckMonthEnding`), und **gemessen wird sie gegen eine Kontrolle**:
dieselbe Welt, dieselben Monate, mit und ohne Streik. Ohne Kontrolle waere die
Behauptung wertlos, weil ein Bergwerk, von dem niemand abholt, diese Uhr ohnehin
jeden Monat weiterstellt. Gemessen: Kontrolle **4**, bestreiktes Werk **3** nach
denselben fuenf Monaten - genau der eine Monat, den es stillstand. Ebenso
ausgenommen ist das Zwoelfmonatsfenster des Bedienungsgrads (`serviceMonths` 3
gegen 4): ein Abtransportanteil von null, an dem der Spieler nichts aendern
konnte, wuerde dem Werk ein Jahr Wachstum verbauen. Ein Abtransport, der
**stattgefunden hat**, stellt die Uhr trotzdem zurueck - ein Streik legt das
Werk still, nicht die Zuege.

**Vier Entscheidungen, die keine Geschmacksfragen sind:**

1. **Ein Zug je offenem Werk und Monat.** Wie viele Zahlen dieses Subsystem aus
   seinem Strom nimmt, haengt an der Industrieliste und an nichts, was die
   Zuege selbst gesagt haben (Z3, dasselbe Argument, fuer das `supply.ts` seine
   Kandidatenliste ganz baut). Die Quote ist **1 zu 240 je Werk und Monat** und
   damit per Konstruktion kartenskaliert: eine 300-Industrien-Karte sieht rund
   1,25 Ereignisse im Monat, eine handgebaute Testwelt mit einem Werk eines in
   zwanzig Spieljahren. Gewaehlt ist sie von der SPIELERSEITE her - wer ein
   halbes Dutzend Industrien bedient, begegnet einem etwa alle drei Jahre.
2. **Eine Rekordernte bekommt nur, wer erntet.** Ausschliesslich Industrien
   ohne Inputs - Bergwerk, Forst, Hof, Bohrturm. Bei einem verarbeitenden Werk
   ist der Ausstoss durch den gelieferten Input gedeckelt, ein Multiplikator
   dort taete in den meisten Monaten **nichts**, und die Meldung im
   Nachrichtenlog waere eine Luege ueber ein Ereignis, das nicht stattfand.
   Bestreikt werden kann jedes Werk: ein Streik betrifft die Leute, nicht das
   Rezept.
3. **Der Multiplikator steht im SELBEN Produkt** wie die Saison (M18) und das
   Jahrhundert (D-236), nicht daneben: ein gutes Jahr in einem Boom in einem
   guten Sommer ist eine Zahl und nicht drei Regeln, die sich streiten. Der
   Faktor ist **1,5** und bewusst in derselben Groessenordnung wie der eigene
   Fuenfjahresschwung der Industrie (`INDUSTRY_FLUCTUATION_AMPLITUDE`, +-25 %)
   statt eine Groessenordnung darueber - ein Ereignis, das den Rhythmus
   erschlaegt, auf dem es sitzt, ist kein gutes Jahr mehr, sondern eine zweite
   Oekonomie.
4. **Die Tafel haengt an der Weltregel `economy`**, wie die beiden Tafeln aus
   D-238 und aus demselben Grund: SPEC2 M21 nennt genau EINEN Balance-Anker
   ("Konjunktur: aus pinnt alle Referenzlaeufe"), und eine zweite Regel waere
   eine zweite Antwort auf eine Frage. `reviewIndustryEvents` kehrt ohne sie auf
   seiner ersten Zeile zurueck - kein Strom, kein Zug, kein Datensatz
   (Fehlerkatalog 34).

**Kein Id, und das ist eine Entscheidung.** Ausschreibung, Liefervertrag und
Subvention tragen eine, weil ein COMMAND sie benennt; hier gibt es kein Command.
Ein Ereignis ist etwas, das die Welt einer Industrie antut.

**Reihenfolge im Monatsblock, und warum sie genau dort steht.**
`reviewIndustryEvents` laeuft **zwischen** `reviewIndustries` und
`produceIndustryCargo`. Das Review oben ist der letzte Leser des Monats, der
endet, und muss einen Streik sehen, der ihn abgedeckt hat - deshalb wird
Abgelaufenes **nach** dem Review geraeumt und nie davor. Die Produktion unten
ist das, was ein Streik oder eine Ernte veraendert. Das halboffene Fenster
`[start, end)` liest sich an der Monatsgrenze eine Grenze spaeter als "der
Monat, der endete, war bestreikt" - beides ist getestet.

**Der eine Hash, der sich bewegt - und die ehrliche Buchung dafuer.** Das
Ereignisbrett ist historischer Sim-Input und damit Save-Zustand (Z4): der Monat,
den ein Werk im Streik verbrachte, ist genau das, was das Review des Folgemonats
wissen muss, und ein beim Laden neu gebautes Brett gaebe einer geladenen Welt
eine andere Schliessungsuhr. Es wird gehasht wie jede andere gespeicherte Zahl -
**unbedingt**, wie die beiden Tafeln aus D-238, nicht bedingt wie die Kurve aus
D-236. Der Unterschied ist argumentiert: D-236 durfte bedingt hashen, weil der
Aus-Zustand dort eine ABWESENHEIT ist und jeder Leser exakt 1 zurueckgibt; hier
waere ein bedingter Hash eine Zeile Sim-Verhalten (`industryOnStrike` liest die
Liste in JEDER Welt), die der Digest nicht sieht - also genau das Loch, das der
Kopplungstest `saveFieldCoupling.spec.ts` findet. Ein leeres Brett kostet den
Digest eine Null, und es ist dieselbe Null fuer jede Welt ohne Jahrhundert.

Neu aufgezeichnet nach dem D-137/D-130-Protokoll:

* kanonischer Pin `5fc5168993e38191` -> **`29f227b0d3cf3db1`**
* Soak `cc491b59f6bfc729` -> **`ff8eb61c2dec1669`** bei **unveraendert 35
  Kommandos und 16 Checkpoints** - was der Beleg dafuer ist, dass sich nur der
  Digest bewegt hat und kein Spielverlauf
* Korpus-Manifest fuer alle elf Fixtures neu (`v22`-`v30` decodieren nach
  `d8f5a8960661dc49`, `v31`/`v32` nach `77fa16c749945e51`);
  `v32-played.ironsave` neu aufgezeichnet, weil der Parser das Feld jetzt
  verlangt und Migrationen nur UNTER `SAVE_VERSION` laufen - v32 ist erst mit
  dem Abschluss dieses Meilensteins ein eingefrorenes Versprechen
* `SCENARIO_WORLD_CLAIMS` **unveraendert**, gelaufen statt behauptet: alle acht
  Szenarien tragen `economy: false`, also hat keines je ein Ereignis

**Kein Band bewegt, alles auf den Euro identisch mit D-238**, weil die Tafel an
`economy` haengt: `npm run test:balance:full` gruen bei 101 - Szenario 5
1.022.084 / 1.802.165 / 2.153.604 EUR, Punktzahl 5.889, Netzdesign 3,75, Harter
Winter -4,36 %, aiGame-Sweep 7.293.303 EUR.

**Budget.** Hauptbundle 972.824 -> **973.302 B (+478)**, davon **+353 B die
zwei i18n-Schluessel in zwei Sprachen** (gemessen, indem genau diese vier Zeilen
aus beiden Katalogen geloescht und neu gebaut wurde: 972.949 B) und die
restlichen +125 B der neue Parser-Zweig; Budget **978.000 unveraendert**,
Restluft 4.698 B. Null Snapshot-Byte - das Brett reist ueberhaupt nicht zur
Oberflaeche, weil SPEC2 hier ausschliesslich News bestellt - und null
Atlas-Zelle. Kein `npm run test:perf`-Lauf wird fuer diesen Bundle beansprucht:
die Monatsrunde ist ein Zug je offenem Werk, und die drei Lesefunktionen kehren
in jeder Welt ohne Jahrhundert auf ihrer ersten Schleifenzeile zurueck, weil die
Liste leer ist.

**Tests:** `tests/unit/industryEvents.spec.ts` (12 Faelle: die Tafel als
Eigenschaft der Regel, Reproduzierbarkeit ueber zwei Welten, nie zwei Ereignisse
auf einem Werk, der Streik stoppt genau seinen Monat, **die Schliessungsuhr
gegen eine Kontrolle**, das Bedienungsfenster gegen dieselbe Kontrolle, das
Grenzverhalten der beiden Praedikate, der Erntefaktor exakt gegen eine
Kontrolle, keine Ernte fuer ein Werk mit Inputs, Identitaet 1 fuer alle anderen,
die News in beiden Sprachen mit Ort und `postOnce`, und die Rundreise durch Save
und Hash), plus ein Vertreter des Bretts im Kopplungstest
`tests/unit/saveFieldCoupling.spec.ts`, damit jedes seiner Felder geloescht und
verfaelscht wird.

**Damit ist M21 vollstaendig.** Alle sechs MUSS-Punkte stehen: Genesis-Kurve
(D-236), Container-Wiederbelebung (D-237), Liefervertraege, Subventions-Board,
elftes Konto und Foerdergeld (D-238), Industrie-Events (hier) - und der
Balance-Anker "Konjunktur: aus" ist ueber alle vier Bundles hinweg gehalten
worden.

### D-240 Die Werkstatt spricht nur Commands: fuenf Editor-Kinds, die Weltregel `editorMode` - und `PaintRiver` ueber Meereshoehe, abgelehnt statt erfunden

SPEC2 M22, Bundle 1: die Simulationshaelfte der Szenario-Werkstatt. Fuenf neue
`CommandKind`s, eine Weltregel, **der EINE Z5-Bump des Meilensteins
(SAVE_VERSION 32 -> 33)**, und die eine Frage, die SPEC2 hier namentlich
entschieden haben will. `src/ui/editor/` - Werkzeugpalette, Pinselgroessen,
Debug-Overlays - ist Bundle 2; Heightmap-Import, Benchmark-Karten und der
`.ironscenario`-Export sind die Bundles danach.

**Die Werkstatt spricht nur Commands, und das ist kein Stil, sondern der Grund
fuer den Meilenstein.** Eine im Editor gebaute Karte IST ein Befehlslog, und ein
Befehlslog ist etwas, das der Beweiskette aus M16 vorgelegt werden kann. Keiner
der fuenf ist also ein "Generatoraufruf aus der Oberflaeche": jeder ist ein
gewoehnlicher Eintrag in derselben Queue, mit Besitzer, Preis,
Ablehnungsvokabular, Parser-Zweig und i18n in beiden Sprachen.

* `TerraformBrushRegion` (43) - Quadrat von Ecken, Kantenlaenge `2r+1`, jede Ecke
  faehrt die gewoehnliche Terraform-Kaskade, danach `enforceSlopeInvariant` ueber
  die Region.
* `PlaceTownSeed` (44) - `newTown` + `settleTown`, die beiden Aufrufe, die
  `generateTowns` seit M2 macht, aus einer Hand statt aus einem Wurf.
* `PlaceIndustryAt` (45) - `industrySiteRefusal`, die vier Standortfragen des
  Generators an EINER genannten Kachel statt hinter einer Suchschleife.
* `PaintForest` (46) - `Terrain.Forest` auf offenen, trockenen, unbebauten
  Boden (Gras, Feld, Marsch).
* `PaintRiver` (47) - siehe unten; schreibt **kein** Terrain.

**Der Regionsdeckel bindet am COMMAND, nicht am Werkzeug.**
`EDITOR_BRUSH_MAX_RADIUS` = 8, also `EDITOR_BRUSH_MAX_CELLS` = 289 Zellen, mit
Einheit und Herkunft in `constants.ts`. Am Werkzeug waere er wertlos: ein
aufgezeichnetes Log muss von einem Build abspielbar sein, dessen Palette andere
Pinselgroessen anbietet, und ein ungedeckelter Bulk-Edit ist eine unbegrenzte
Menge Arbeit hinter einem Eintrag. Der Deckel greift, **bevor ein Byte bewegt
ist** - `brushTooLarge` ist eine Ablehnung und nie ein halb angewandter Edit;
`tests/unit/editorCommands.spec.ts` prueft beide Richtungen (r = max
angenommen, r = max + 1 abgelehnt mit unveraendertem Hoehenfeld) und dass
derselbe Deckel fuer beide Malwerkzeuge gilt.

**Vorschau UND Befehl sind EINE Funktion, wortwoertlich (D-119).**
`terraformBrush(..., commit: false)` faehrt die ganze Operation gegen die echte
Karte und legt danach jedes Byte zurueck - Hoehen, Terrain **und die beiden
Revisionszaehler**. Der letzte Punkt ist keine Kosmetik: eine Vorschau, die
`revision` bewegt, laesst den Renderer bei jeder Mausbewegung die Welt neu
bauen. Eine zweite Preisformel wurde damit gar nicht erst geschrieben, was der
einzige Weg ist, auf dem Preis und Rechnung nicht ab Spieljahr zwei auseinander
laufen koennen. Der Test misst die Unversehrtheit byteweise.

**Die Slope-Invariante ueberlebt den Bulk-Edit, und die Messung sagt mehr als
das.** Zwoelf ueberlappende Pinsel ueber aufgerauhtes Gelaende, nach jedem
einzelnen `worstTileSlope <= 1` - und danach meldet `enforceSlopeInvariant()`
**0 bewegte Ecken**. Der von SPEC2 bestellte Sweep ist also nicht die
Reparatur, sondern der Beweis: die Kaskade je Ecke haelt die Invariante schon,
und wenn der Sweep doch etwas zieht, wird die Uferfrage fuer die ganze Karte neu
gestellt (`refreshShorelineEverywhere`, ausserhalb des Hot-Path per
Ledger-Zeile).

**`editorMode` schaltet GENAU ZWEI Dinge ab, und `commands/editorRule.ts` ist das
eine Tor darauf** (das `weather/effects.ts`-Muster eine Ebene hoeher): Funds und
Ownership. `affordable`, `buildBudgetCt`, `chargeBuild`, `refundBuild`,
`ownershipWaived` - fuenf Funktionen, und ausserhalb der Regel liefert jede
Term fuer Term das, was das Spiel seit M2 gerechnet hat. Die 15
Kassenvergleiche und die 15 Buchungen in `build.ts` gehen durch sie, und
`mayBuildOn` ist die EINE Eigentumsfrage der Bauschicht.

* **Kostenlos heisst in BEIDEN Richtungen kostenlos.** `refundBuild` ist die
  Haelfte, die man vergisst: eine Werkstatt, die nichts berechnet, aber die
  Abrissverguetung auszahlt, laesst einen Autor durch Bauen und Abreissen genau
  das Startkapital drucken, das sein Szenario ausliefert. Gemessen im Test.
* **Was NICHT abgeschaltet wird**, und jede Zeile davon ist eine Behauptung mit
  einem Testfall: Wasser, freier Boden, die Hoehengrenze, der
  E-11-Hindernis-Waechter der Terraform-Kaskade und der Stadtrat aus 13.3
  einschliesslich exklusiver Baurechte. Das ist, was die Karte IST; wer das
  aussetzt, schreibt Zustaende, die die Simulation nicht ausdruecken kann - und
  ein Szenario ist ein Save (D-194), das laden muss.
* **Der Eigentumstest im Terraform brauchte nichts.** `cornerObstruction`
  liefert `ForeignOwner` nur dort, wo `built` ohnehin wahr ist, also verfeinert
  der Besitz die ANTWORT und nie das Ergebnis (D-104 woertlich). In der
  Werkstatt hiesse dieselbe Kachel `Occupied` - beides eine Ablehnung.
* **Nicht sperrbar im Szenario** (`NOT_LOCKABLE` in
  `tests/unit/scenarioCoupling.spec.ts`): `editorMode` ist die Regel der
  WERKSTATT, nicht der ausgelieferten Welt. Ein Szenario, das sie pinnt, gaebe
  jedem Spieler ein Spiel, in dem nichts kostet und niemandem etwas gehoert.

**Null Zug auf `world.rng` (Z3, Fehlerkatalog 25).** Zwei der fuenf brauchen
Zufall - Stadtname und Strassenabstand - und nehmen ihn aus
`streamFor(streamSalt('editor') + Eckenindex)`, also **mit der genannten Kachel
gesalzen**. Dadurch baut derselbe Befehl dieselbe Stadt, egal an welcher Stelle
des Logs er steht; der Test faehrt alle fuenf Befehle und vergleicht den
Generatorzustand davor und danach Wort fuer Wort, und ein zweiter Test baut
dieselbe Stadt in zwei Welten mit unterschiedlicher Vorgeschichte.

**`PaintRiver` ueber Meereshoehe: ABGELEHNT, nicht formalisiert.** SPEC2 M22
laesst beides zu und verlangt eine Entscheidung. Sie faellt so:

* **Formalisieren hiesse eine zweite Wasseroberflaeche**, und D-097 hat schon
  aufgeschrieben, dass dieses Spiel genau eine hat: eine Kachel ist Wasser,
  wenn selbst ihre hoechste Ecke auf oder unter `SEA_LEVEL` liegt. Genau das
  schreibt `floodSeaLevel`, und genau das liest jede Uferauffrischung seit M2.
* **Der Quirk ist real und wird gemessen, nicht behauptet.** `applyRivers`
  malt `Terrain.Water` entlang der verfolgten Bahn, gleich auf welcher Hoehe
  das Tal liegt - `refreshShoreline` fragt nur `isSubmerged`. Der Test setzt
  eine Wasserkachel acht Stufen ueber dem Meer (das, was `applyRivers` tut),
  faehrt EIN gewoehnliches Terraform daneben und sieht sie zu Gras werden.
* **Also schreibt `PaintRiver` ueberhaupt kein Terrain.** Er **graebt** jede
  genannte Kachel bis zum Meer (`digTileToSeaLevel`) und laesst die
  gewoehnliche Uferauffrischung fluten. Was dabei entsteht, ueberlebt jedes
  spaetere Terraform - im Test nachgefahren: Fluss schneiden, daneben Land
  heben, Ufer neu fragen, die Kachel ist noch Wasser.
* **Der Preis steht dabei, statt versteckt zu werden.** Eine Region, die das
  Meer im Erdbudget eines Befehls nicht erreicht, wird GANZ abgelehnt
  (`riverNeedsSeaLevel`). Die Werkstatt schneidet Fluesse in Kuestennaehe und
  durch tiefes Gelaende; wer ein Talflussbett will, hebt erst das Tal aus.
* **Das neue Messinstrument ist `standingWaterAboveSeaLevel(map)`** und es
  benennt den Rest ehrlich: auf einer erzeugten 128er-Karte ist es **groesser
  als null**, weil der GENERATOR weiter Bergfluesse malt. Bundle 1 schliesst
  die ERZEUGUNGS-Haelfte - kein Werkstatt-Befehl kann einen anlegen, gemessen
  ueber 25 Pinsel auf einer erzeugten Welt (der Zaehler steigt nie) - und
  benennt die Generator-Haelfte als Rest. Sie zu reparieren bewegt jede erzeugte
  Karte, jeden Pin und jeden `SCENARIO_WORLD_CLAIM` und ist ein eigener Bundle.

**Der Bump und was er bewegt hat.** `editorMode` wird **unbedingt** gehasht, auf
den Bedingungen jeder Regel vor v32 und ausdruecklich NICHT auf denen von D-236:
der Aus-Zustand des Jahrhunderts ist eine ABWESENHEIT (leere Tabelle, jeder
Leser liefert exakt 1), der Aus-Zustand dieser Regel ist ein WERT -
`editorRule.ts` wird in jeder Welt und bei jedem Bau befragt. Eine bedingte
Hashung waere also Simulationsverhalten, das der Digest nicht sieht, also genau
das Loch, fuer das `saveFieldCoupling.spec.ts` existiert. Folge, nach dem
D-137/D-130-Protokoll neu aufgezeichnet:

* Kanonischer Cross-OS-Pin `29f227b0d3cf3db1` -> **`f1349c9b9c922981`**
* Soak `ff8eb61c2dec1669` -> **`1f1ac33ffed6afe9`** bei **unveraenderten 35
  Kommandos und 16 Checkpoints** - der Beweis, dass nur der Digest sich bewegt
  hat und kein Spiel
* Korpus fuer alle zwoelf Fixtures neu aufgezeichnet, `v33-played.ironsave`
  ergaenzt; die eingefrorenen Alt-Fixtures dekodieren weiter zu EINER Welt
  (v22-v30 auf `56982201046249b9`, v31-v33 auf `d3c2c16e6d8bf6e1` - dieselbe
  Zweiteilung wie vorher, aus D-231s Grund)
* `SCENARIO_WORLD_CLAIMS` und die Briefing-/Ortsnamen-Waechter **unveraendert**,
  gelaufen statt behauptet: es wurde kein erzeugtes Byte bewegt

**Kein Band bewegt, alles auf den Euro identisch mit D-239**:
`npm run test:balance:full` gruen bei 101 - Szenario 5 1.022.084 / 1.802.165 /
2.153.604 EUR, Punktzahl 5.889, Netzdesign 3,75, Harter Winter -4,36 %,
aiGame-Sweep 7.293.303 EUR. Das ist erwartbar und trotzdem nachgefahren: die
Regel ist in jeder dieser Welten aus, und `editorRule.ts` liefert dort Term fuer
Term die alte Rechnung.

**Der UI-Erzeuger fehlt und steht auf der dokumentierten Erlaubnisliste.** Die
fuenf Kinds stehen in `NO_UI_ISSUER` in `tests/unit/commandCoupling.spec.ts`,
mit dem Grund und mit der Frist: **Bundle 2 loescht diese fuenf Zeilen.** Der
Audit faellt auch andersherum - ein Kind, das die Oberflaeche erzeugt UND das
gelistet ist, ist ein roter Build -, also kann der Eintrag seinen Grund nicht
ueberleben.

**Nicht gemessen und deshalb nicht beansprucht:** keine `npm run test:perf`-Zahl
und keine Bundle-Budget-Zahl fuer diesen Bundle. Der Editor liegt per
Ledger-Zeile ausserhalb des Hot-Path (M22: +0,00 ms) und dieser Bundle fasst
keine Datei unter `src/ui` an; die Ledger-Zeile 6.1.1 fuer M22 gehoert an das
Ende des Meilensteins, wenn Palette, Import und Benchmark-Karten stehen.

**Tests:** `tests/unit/editorCommands.spec.ts` (32 Faelle: Parser-Rundreise
aller fuenf Kinds, derselbe Weg durch `parseScenarioFixture` des
Determinismus-Runners, ein verstuemmelter Befehl als Fehler statt als Default,
i18n in beiden Katalogen fuer Labels und Ablehnungen; der Deckel in beide
Richtungen und fuer beide Malwerkzeuge; die Invariante ueber zwoelf Pinsel plus
der Null-Sweep; Funds und Ownership abgeschaltet, Wasser/Boden/Hoehengrenze/
Terraform-Waechter/Stadtrat NICHT; kostenlos in beide Richtungen; die Regel im
Hash, in der Save-Rundreise und in der Migration; der Quirk gemessen, der
Generator-Rest gemessen, die Ablehnung, der Schnitt, sein Ueberleben und der
Nicht-Anstieg auf einer erzeugten Welt; die Standortregeln der drei
Platzierungsbefehle; null RNG-Zug und Reproduzierbarkeit; Preis gleich
Rechnung und die byteweise Unversehrtheit der Vorschau) - plus die fuenf
Stichproben in `tests/unit/commandCoupling.spec.ts` und `editorMode` in beiden
Kopplungstabellen von `tests/unit/scenarioCoupling.spec.ts`.

### D-241 Die Palette, die nur Commands baut - vier reine Overlays, der Szenario-Export, und die geloeschte Erlaubnisliste

SPEC2 M22, Bundle 2: die Oberflaechenhaelfte der Szenario-Werkstatt.
`src/ui/editor/` - Werkzeugpalette, Pinselgroessen, Debug-Overlays,
`.ironscenario`-Export. **Kein Save-Bump**: v33 gehoert Bundle 1, dieser Bundle
erweitert ihn und beruehrt kein gespeichertes Feld.

**Die Palette baut Commands und sonst nichts, und das ist eine Datei.**
`src/ui/editor/tools.ts` haelt die EINE Abbildung von "welches Werkzeug ist
scharf und wohin wurde geklickt" auf einen `Command`; sechs Werkzeuge, fuenf
Kinds (der Gelaendepinsel ist zwei Knoepfe auf einem Kind, Heben und Senken).
Weil das eine reine Funktion ihrer Argumente ist, faehrt der Test die ganze
Palette kopflos ab - erst gegen die erwarteten Command-Literale, dann durch die
ECHTE Queue, also denselben Umschlag, denselben Executor, dasselbe
Ablehnungsvokabular.

* **Der Radius wird nicht geklemmt.** Eine Palette, die einen zu grossen Pinsel
  still verkleinert, versteckt die Ablehnung, auf die der Autor Anspruch hat -
  und der Deckel gehoert dem Befehl (D-240). Der Test uebergibt
  `EDITOR_BRUSH_MAX_RADIUS + 1` und erwartet ihn unveraendert im Command.
* **Die Pinselleiter wird aus dem Deckel ERZEUGT**, nicht getippt:
  `[0, 1, 2, 4, 8]`, verdoppelnd bis `EDITOR_BRUSH_MAX_RADIUS`. Damit kann die
  Palette nie eine Groesse anbieten, die die Queue zurueckweisen wuerde, und
  ein anderer Deckel bewegt die Leiter mit.
* **Vier von sieben Knoepfen tragen den NAMEN DES BEFEHLS** aus Bundle 1
  (`editor.tool.placeTownSeed` und die drei anderen). Knopf und Ablehnungs-Toast
  sagen dasselbe Wort fuer dieselbe Sache.

**Die fuenf Zeilen der Erlaubnisliste sind geloescht, und zwar so, wie der
Mechanismus es vorsieht.** `NO_UI_ISSUER` in
`tests/unit/commandCoupling.spec.ts` ist jetzt LEER. Der Audit faellt in beide
Richtungen - ein Kind ohne Erzeuger ist rot, ein gelistetes Kind MIT Erzeuger
ebenso -, also konnte der Eintrag seine Frist nicht ueberleben.

**Die vier Debug-Overlays sind reine Recomputes, und der Test misst beide
Haelften von "rein".** `computeEditorOverlay` ist eine Funktion von der Welt auf
ein gepacktes Farbfeld (`0xAARRGGBB` je Kachel, 0 = nichts malen):

* **Gleiche Welt, gleiches Feld** - zweimal gerechnet, byteweise gleich.
* **Nichts geschrieben** - ein Fingerabdruck aus `revision`, `trackRevision`,
  `cornerHeight`, `terrain`, `landmassId` und `oceanMask` ist danach identisch.
* **Und die Gegenprobe, die ein Cache nicht besteht**: eine GEAENDERTE Welt
  liefert ein geaendertes Feld. Die ersten beiden Tests allein wuerden von einem
  Cache bestanden.
* Der wiederverwendbare Puffer gehoert dem Aufrufer und wird vor jedem Lauf
  ganz genullt, also kann kein Rest des vorigen Overlays durchscheinen -
  gemessen gegen einen frisch gerechneten Lauf.

Jedes der vier ist an die Simulationsfunktion gebunden, die es zu lesen
behauptet:

* **Temperatur** ist der Ausdruck des Generators, nicht sein Zwilling.
  `temperatureAtSeaLevel` und `tileTemperatureC` sind nach
  `mapgen/climateField.ts` gezogen; `assignBiomes` ruft dieselbe Funktion.
  Gelesen wird die AKTUELLE Hoehe - wer in der Werkstatt einen Berg hebt, sieht
  die Temperatur fallen.
* **Feuchte ist ehrlich beschriftet.** Das Rauschfeld der Weltgenese ist NICHT
  rekonstruierbar (der Strom ist verbraucht, das Feld wurde nie gespeichert,
  und nach dem ersten gepflanzten Wald waere es ohnehin falsch). Das Overlay
  liest deshalb die KARTE: jede Geländeart steht fuer das Feuchteband, aus dem
  `classify` sie gemacht haette. Die Kopplung ist gemessen, nicht behauptet -
  jeder Bandwert geht durch `classifyBiome` zurueck und liefert dieselbe
  Geländeart. Schnee, Fels, Wasser und Stadtboden tragen bewusst gar kein
  Messergebnis. Die Oberflaeche sagt beides in beiden Sprachen.
* **Landmasse LIEST die abgeleitete Schicht**, statt sie neu zu labeln:
  `computeLandmasses` SCHREIBT in `map.landmassId`, und ein Overlay, das in die
  geteilte Karte schreibt, waere ein zweiter Zustandsautor. Acht Farben,
  zyklisch - zwei weit auseinander liegende Massen koennen sich eine teilen,
  und die Bildunterschrift sagt das, statt eine Bijektion vorzutaeuschen.
* **Einzugsgebiet malt genau den Kreis der Simulation.** `inCatchment` wurde auf
  `withinCatchment(cx, cy, radius, x, y)` zurueckgefuehrt, und das Overlay ruft
  dieselbe Funktion; der Test faehrt alle 4096 Kacheln ab und vergleicht Zelle
  fuer Zelle. Eine Ueberlappung ist Bernstein statt Gruen - kein Fehler, aber
  das, wonach ein Autor in diesem Overlay sucht.

**Der Renderer weiss von keinem der vier, was es bedeutet.** `MapView` bekommt
das gepackte Feld und malt das sichtbare Fenster; die Bedeutung bleibt in
`ui/editor/overlays.ts`. Vergleich per IDENTITAET, nicht per Inhalt: die
Oberflaeche rechnet nur neu, wenn die Welt sich bewegt hat, also heisst ein
neues Array ein neues Bild. Das ist die Zeile, die alle vier kopflos testbar
macht und ein Render-Modul davor bewahrt, eine Meinung ueber Klima zu bekommen.

**Der Export ist der M17-Serializer, ohne zweiten Schreiber.** Der Worker ruft
`encodeScenario` (= `encodeSave` plus Metablock), die Hauptseite entscheidet,
wohin die Bytes gehen - dieselbe D-111-Teilung wie bei jedem Save. Zwei neue
Nachrichten (`requestScenario`, `scenarioWritten`/`scenarioFailed`), null
Save-Felder, null Snapshot-Bytes. Der Test schreibt eine im Editor gebaute Welt
und liest sie durch `decodeSave` zurueck - **es gibt keinen Szenario-Leser**,
was genau SPEC2s Satz fuer diesen Meilenstein ist: Weltdigest gleich, Stadt mit
demselben Namen wieder da, `editorMode` erhalten, Briefing in beiden Sprachen,
und das Befehlslog der Sitzung liegt in der Datei.

* **Der Fall im Worker ist absichtlich inline geschrieben.** Ein benannter
  Parameter haette den Typ des Metablocks in eine Datei unter `src/sim` gebracht,
  die nicht `src/sim/save` ist - genau das, was `scenarioCoupling.spec.ts`
  verbietet. Der Worker reicht das Briefing durch, ohne ein Feld davon zu lesen.
* **Die Formularpruefung ist die Pruefung des CONTAINERS, vorwaerts gelesen.**
  `parseSaveFile` weist leeren Titel, leeren Autor, jede leere Briefing-Haelfte
  und alles ueber `SCENARIO_TEXT_MAX_CHARS` zurueck. Ein Szenario ist ein Save
  (D-194), das laden muss - also findet das Formular den Fehler, waehrend der
  Autor noch tippt, statt in fremden Haenden. Der leere Autor war der Fund: er
  waere sauber kodiert und unladbar gewesen.
* Keine Regel wird gepinnt und kein Ziel gesetzt: `lockedRules` und `goals` sind
  leer, weil dieser Bundle keinen Bildschirm dafuer anbietet und ein erfundener
  Vorgabesatz Regeln pinnen wuerde, die niemand gewaehlt hat. Der Parser prueft
  die Zielanzahl gegen die Welt, also ist die leere Liste die WAHRE Beschreibung
  einer Welt ohne Ziele.

**Die Werkstatt wird auf dem Neues-Spiel-Bildschirm geoeffnet, und sie startet
pausiert.** `editorMode` ist ein `NewGameOptions`-Feld (optional, abwesend =
aus, wie jede Regel seit D-185); `SimClient.newGame` setzt Speed 0, wenn es
gesetzt ist - dort und nicht auf dem Bildschirm, weil JEDE Tuer in eine
Werkstattwelt durch diese Methode geht und eine laufende Uhr Industrien altern
und Gegner starten liesse, waehrend der Autor noch eine Kueste zieht. Ob die
laufende Welt eine Werkstatt IST, sagt der Worker in `ready` - nicht der Knopf,
der sie geoeffnet hat: die Regel ist gespeicherter, gehashter Zustand, also ist
eine gespeicherte und wieder geladene Werkstatt weiter eine.

**Das Bundle-Budget hat einen Fund gemacht, und dafuer gibt es das Budget.**
Der erste Build lag bei 996.464 B, und **5.346 B davon waren `map/terraform.ts`
mit `mapgen/hydrology.ts` darunter**, in den Entry-Chunk gezogen von einer
Palette, die `TerraformDirection` - zwei ganze Zahlen - aus dem Modul importierte,
das Boden bewegt. Das Vokabular ist nach `constants.ts` gewandert, wo Konstanten
ohnehin wohnen, und der Chunk gab die Bytes zurueck. Gebucht wird der Rest, mit
der Messung daneben: **976.409 B -> 991.118 B (+14.709 B)**, davon **+8.098 B
die vierzig i18n-Zeilen in zwei Sprachen** (gemessen, indem genau diese Zeilen
geloescht und neu gebaut wurde: 983.020 B) und **+6.611 B die Oberflaeche**.
`EditorPanel` ist LAZY (D-192-Muster) und liegt in einem eigenen 5.211-B-Chunk -
wer nie eine Werkstatt oeffnet, laedt keine. Am gebauten Entry-Chunk geprueft:
kein `decodeSave`, kein `hashWorld`, keine Save-Magic, kein `streamFor`. Neue
Grenze 998.000 B = Messung plus ~0,7 %.

**Kein Band bewegt, alles auf den Euro identisch mit D-240**:
`npm run test:balance:full` gruen bei 101 - Szenario 5 1.022.084 / 1.802.165 /
2.153.604 EUR, Punktzahl 5.889, Netzdesign 3,75 (Trasse 2,01x, Kapazitaet
1,87x), Harter Winter -4,36 %. Determinismus 33 gruen, Unit 1.689 gruen. Das ist
erwartbar - keine Zeile dieses Bundles laeuft in einer Welt ohne Werkstatt -,
und trotzdem nachgefahren, weil `TerraformDirection` und `temperatureAtSeaLevel`
in andere Dateien gezogen sind und "identische Arithmetik" eine Behauptung ist,
bis der Digest sie bestaetigt.

**Nicht gemessen und deshalb nicht beansprucht:** keine
`npm run test:perf`-Zahl. Die Overlay-Schicht liegt neben der Heat-Map und wird
nur neu gemalt, wenn Feld, Zoom oder Kamerafenster sich bewegen; in einem Spiel
ohne Werkstatt ist das Feld immer `null` und die Schleife laeuft nie. Die
Ledger-Zeile 6.1.1 fuer M22 gehoert an das Ende des Meilensteins, wenn
Heightmap-Import und Benchmark-Karten stehen - dort wird auch der Editor-Chunk
gegen die 0,00-ms-Zusage der M22-Zeile gehalten.

**Tests:** `tests/unit/editorPalette.spec.ts` (18 Faelle: die fuenf Kinds aus
der Palette und keine anderen, die Palettenwerte im Command, der ungeklemmte
Ueberpinsel, der Zeiger baut nichts, alle sechs Werkzeuge durch die echte Queue
angenommen, die Leiter unter dem Deckel, Label plus Wirkungs-Tooltip in beiden
Sprachen fuer jede Zeile der Registry, jeder Bildschirmtext in beiden
Katalogen; die vier Overlays zweimal gleich, nichts geschrieben, Puffer ohne
Leck, geaenderte Welt geaendertes Feld, Temperatur gegen den Generatorausdruck
mit Wasser ausgenommen, Feuchtebaender durch `classifyBiome` zurueck, eine
Farbe je Landmasse mit klarem Wasser, das Einzugsgebiet Zelle fuer Zelle gegen
`withinCatchment`; die Formularablehnungen, der Dateiname, und die editierte
Welt exportiert und wieder eingelesen) - plus die geleerte `NO_UI_ISSUER` in
`tests/unit/commandCoupling.spec.ts`, deren Meta-Tests unveraendert beweisen,
dass der Audit noch feuert.
