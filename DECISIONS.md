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
  D-100, D-111, D-145, D-146, D-148
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
  D-061, D-073, D-080, D-081, D-082, D-083, D-157
- **Stations & catchment:** D-049, D-080, D-095, D-150, D-159
- **Cargo, payment & routing:** D-036, D-037, D-065, D-067, D-075, D-077,
  D-078, D-118, D-142, D-151
- **Industry & production:** D-022, D-062, D-063, D-064, D-069, D-071, D-079,
  D-085, D-086
- **Towns, council & ownership:** D-101, D-102, D-103, D-104
- **Economy, finance & emissions:** D-008, D-090, D-091, D-092, D-105, D-154
- **Balancing & scenarios:** D-038, D-039, D-040, D-041, D-066, D-087, D-088,
  D-116, D-151, D-152, D-156, D-158, D-159
- **Vehicles & fleet:** D-043, D-044, D-045, D-068, D-076, D-089, D-093,
  D-096, D-142, D-143, D-145, D-146, D-155, D-157
- **Water & air:** D-094, D-095, D-096, D-097, D-098, D-099
- **Competitors, AI & tenders:** D-107, D-108, D-109, D-115, D-116, D-121,
  D-122, D-147, D-152, D-153, D-154, D-155, D-156, D-158
- **Rendering & art:** D-013, D-014, D-033, D-035, D-112, D-117, D-125, D-127,
  D-136, D-140
- **UI & input:** D-011, D-013, D-015, D-035, D-110, D-113, D-114, D-119,
  D-126, D-148
- **Performance & measurement:** D-002, D-120, D-135, D-136
- **Platform, tooling & build:** D-012, D-014, D-015, D-016, D-017, D-029,
  D-030, D-031
- **Crash safety:** D-132, D-139
- **Testing method & fixtures:** D-010, D-038, D-072, D-074, D-084, D-133
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
