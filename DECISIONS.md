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
