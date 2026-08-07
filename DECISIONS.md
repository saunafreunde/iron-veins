# Decision log

Every decision that was not spelled out in the specification, with the reason it
was made that way. Newest milestone last.

## Register - topic to decisions (SPEC2 M10)

Hand-maintained: every new entry adds its D-number to at least one topic line
here, and `tests/unit/decisionsRegister.spec.ts` fails the build when a logged
decision is missing from this register or the register cites a number that has
no entry below. A number may appear under several topics.

- **Determinism, RNG & hashing:** D-001, D-002, D-003, D-004, D-009, D-010,
  D-024, D-093, D-106, D-128, D-137, D-142, D-145, D-146, D-149, D-153
- **Commands, snapshot & worker boundary:** D-004, D-005, D-006, D-011, D-032,
  D-100, D-111, D-145, D-146, D-148, D-162, D-174, D-176
- **Lines & timetables:** D-145, D-146, D-147, D-148, D-149, D-150, D-151,
  D-152, D-155, D-159
- **Map generation & terrain:** D-018, D-019, D-020, D-021, D-022, D-023,
  D-025, D-027
- **Terraforming & structures:** D-028, D-034, D-050, D-051, D-052, D-124,
  D-141
- **Save format, migrations & replays:** D-007, D-025, D-026, D-027, D-048,
  D-111, D-130, D-131, D-134, D-142, D-144, D-145, D-146, D-147, D-153
- **Rail & track:** D-042, D-043, D-044, D-045, D-046, D-047, D-053, D-141,
  D-153, D-157
- **Signals & reservations:** D-054, D-055, D-056, D-057, D-058, D-059, D-060,
  D-061, D-073, D-080, D-081, D-082, D-083, D-157, D-173
- **Stations & catchment:** D-049, D-080, D-095, D-150, D-159
- **Cargo, payment & routing:** D-036, D-037, D-065, D-067, D-075, D-077,
  D-078, D-118, D-142, D-151, D-176
- **Industry & production:** D-022, D-062, D-063, D-064, D-069, D-071, D-079,
  D-085, D-086, D-174
- **Towns, council & ownership:** D-101, D-102, D-103, D-104
- **Economy, finance & emissions:** D-008, D-090, D-091, D-092, D-105, D-154
- **Balancing & scenarios:** D-038, D-039, D-040, D-041, D-066, D-087, D-088,
  D-116, D-151, D-152, D-156, D-158, D-159
- **Vehicles & fleet:** D-043, D-044, D-045, D-068, D-076, D-089, D-093,
  D-096, D-142, D-143, D-145, D-146, D-155, D-157, D-171, D-174
- **Water & air:** D-094, D-095, D-096, D-097, D-098, D-099
- **Competitors, AI & tenders:** D-107, D-108, D-109, D-115, D-116, D-121,
  D-122, D-147, D-152, D-153, D-154, D-155, D-156, D-158
- **Rendering & art:** D-013, D-014, D-033, D-035, D-112, D-117, D-125, D-127,
  D-136, D-140, D-160, D-161, D-162, D-163, D-164, D-165, D-166, D-169, D-170,
  D-171, D-172, D-173, D-174, D-175, D-177
- **UI & input:** D-011, D-013, D-015, D-035, D-110, D-113, D-114, D-119,
  D-126, D-148, D-165, D-166, D-177
- **Performance & measurement:** D-002, D-120, D-135, D-136, D-161, D-162,
  D-163, D-164, D-167, D-170, D-171, D-172, D-173, D-174, D-176, D-177
- **Platform, tooling & build:** D-012, D-014, D-015, D-016, D-017, D-029,
  D-030, D-031, D-160, D-168, D-169, D-170, D-172, D-175
- **Crash safety:** D-132, D-139
- **Testing method & fixtures:** D-010, D-038, D-072, D-074, D-084, D-133,
  D-167
- **Process & specification:** D-070, D-123, D-129, D-133, D-138, D-140

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
