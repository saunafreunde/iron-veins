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
