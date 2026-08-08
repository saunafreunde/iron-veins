# Iron Veins - working rules

**`SPEC.md` is the specification.** It is the original brief, verbatim. When
this file, `DECISIONS.md` or the code disagrees with it, `SPEC.md` says what was
wanted and `DECISIONS.md` says why it was departed from. A departure with no
entry in `DECISIONS.md` is a defect, not a decision. Read `SPEC.md` before
starting any milestone, and read section 22 of it - the catalogue of what
reliably goes wrong - before each one.

A modern successor to Transport Tycoon Deluxe. TypeScript, PixiJS v8, React 18,
simulation in a dedicated web worker, Tauri 2 desktop shell. Fully offline, no
backend, no game engine.

**Read this before touching anything.** The rules below are what keep a project
of this size from collapsing; they are not style preferences.

---

## The ten architecture laws

1. **Sim never sees render.** `src/sim/**` must not import `src/render/**`,
   `src/ui/**`, `src/platform/**`, `pixi.js`, `react` or `zustand`. Enforced by
   `eslint.config.js`, proven by `tests/unit/lint-rules.spec.ts`.
2. **Fixed time step.** The simulation runs at 20 Hz (50 ms). No delta time
   inside the sim - the renderer interpolates between snapshots.
3. **Determinism is mandatory.** Same seed + same command sequence => bit
   identical state. Banned in the sim core: `Math.random`, `Date`,
   `performance`, `window`, `for...in`, `sort()` without a total comparator,
   iteration order as logic.
4. **Only bit-exact float maths in the sim.** `+ - * /` and `Math.sqrt` are
   allowed. Trigonometry goes through the lookup table in `src/sim/math.ts`.
5. **Money is integer cents.** Never floating point euros. Formatting happens in
   the UI only.
6. **All state changes go through commands.** `src/sim/commands/`. The UI never
   mutates sim state. This is what buys replays, undo, save verification and
   later multiplayer.
7. **No allocation in the hot path.** Inside `tick()` and everything below it:
   no object/array literals, no `.map/.filter/.reduce`, no closures, no spread.
   Preallocated buffers and plain `for` loops.
8. **No recursion for network traversal.** Rail graphs reach 100k edges. Always
   iterative with an explicit stack or queue.
9. **IDs, not references.** Entities are addressed by numeric id; object
   references never live in serialisable state.
10. **State changes are atomic per tick.** The renderer always reads a complete
    snapshot through the double-buffered `SharedArrayBuffer`.

## Additional standing rules

- **Every constant lives in `src/sim/constants.ts`**, annotated with unit and
  origin. No magic numbers anywhere else.
- **Every user visible string goes through `t()`** (`src/i18n/`), German and
  English kept in sync.
- **No `TODO`, `FIXME`, `any`, `@ts-ignore`, empty function bodies, commented
  out code.** ESLint fails the build on the first three.
- **Every change to the shape of the sim state bumps `SAVE_VERSION` and adds a
  migration** under `src/sim/save/migrations/`.
- **Tests are written with the feature, not after it.**
- Code, comments, identifiers and commit messages in English. Summaries for the
  user in German.

## Time model - the classic trap

Vehicle motion and the calendar run on two different clocks.

| Clock                 | Drives                                            | Unit              |
| --------------------- | ------------------------------------------------- | ----------------- |
| Tick time (real time) | physics, position, loading, signal reservations   | 20 ticks/s        |
| Game time (calendar)  | dates, ageing, production, growth, finance, decay | 200 ticks = 1 day |

1 day = 200 ticks = 10 s at 1x. 1 month = 30 days = 6_000 ticks.
1 year = 360 days = 72_000 ticks = 60 min at 1x. Playable span 1950-2050.

Moving vehicles on the calendar clock makes a train cross the map in one frame.
Running the calendar on the tick clock makes a year take eight hours.

## Layout

```
src/sim/       deterministic simulation (no DOM, no rendering, no host globals)
  SimWorker.ts   worker entry + scheduler - the ONLY file here that may read the
                 wall clock; holds no simulation state
src/render/     PixiJS drawing - reads the sim snapshot, never writes  (from M1)
src/ui/         React panels + zustand store + SimClient
src/shared/     types and buffers both sides need (snapshot, protocol, palette)
src/platform/   the only place that imports @tauri-apps/*
src/i18n/       t() plus de.json / en.json
tools/          build-time generators (icons now, sprite atlases from M1)
tests/unit      unit tests
tests/determinism  the suite that must never be red
```

## Commands

```bash
npm run dev              # vite dev server on :5183 (COOP/COEP headers set)
npm run build            # tsc --noEmit && vite build
npm run typecheck
npm run lint
npm test                 # everything except the perf and soak suites, then perf
npm run test:unit
npm run test:determinism # must never be red
npm run test:balance
npm run test:balance:full # + the two costly desync twins (SPEC2 M16, D-190)
npm run test:soak        # the recorded 25-year AI game, replayed (~50 s)
npm run icons            # regenerate src-tauri/icons from tools/make-icons.mjs
npm run tauri dev        # desktop shell - needs the Rust toolchain
```

## Map model

- Heights live on a `(size+1)^2` CORNER grid; a tile owns the four corners
  around it. `+x` runs to the lower right on screen, `+y` to the lower left, so
  the corner called North really is the top one.
- **Invariant:** no two corners of a tile differ by more than one level. That
  gives exactly 16 slopes and no steep-slope special cases. Every routine that
  moves ground has to restore it (`TileMap.enforceSlopeInvariant`, or the
  cascade inside `map/terraform.ts`).
- A tile is water when even its highest corner is at or below `SEA_LEVEL`.
- `landmassId` and `oceanMask` are derived: recomputed on load and after a
  terraform that moved the shoreline, never serialised.

## Environment note

`npm run tauri dev` and `npm run tauri build` need Rust and the MSVC build
tools. Both are installed (Rust 1.97.1, VS 2022 Build Tools, Windows SDK
10.0.26100). If a shell reports `cargo` missing, its environment predates the
install - prepend `%USERPROFILE%\.cargo\bin` to PATH.

Line endings are LF everywhere - committed blobs AND working tree.
`.gitattributes` pins `eol=lf` per source extension (D-168), so fresh
checkouts are LF regardless of `core.autocrlf`. A checkout that predates
D-168 on a `core.autocrlf=true` machine has a CRLF working tree and a
red `npm run format:check`; repair it ONCE, with a clean tree:
`git config core.autocrlf false`, then
`git rm -r --cached -q . && git reset --hard`. A plain `git checkout`
rewrites nothing - the cached-rm is what forces the re-checkout.

## Rendering

- The tile layers live in a SharedArrayBuffer the worker owns; `src/render`
  reads them in place through `TileMap.fromBuffer` and never writes.
- Sprites are rebuilt only when the visible tile range, the zoom or the map
  revision changed - never per frame.
- Draw order runs along the diagonals `(x + y)`; a tile's road, building and
  industry sprites follow immediately after its ground.
- The tile artwork is generated at startup by `render/TerrainAtlas.ts`. No
  binary art in the repository.

## Economy

- Every cargo parcel carries a "paid up to" point. A delivery pays for the
  distance from there and moves the marker along, so a journey split across
  several vehicles earns exactly what one direct run would.
- What a town offers a station is its output multiplied by the station rating.
  A badly served stop therefore gets less cargo - the death spiral of section
  10.1 is intended and has to be visible in the UI.
- Loading takes the oldest cargo first. Oversupply therefore shows up as low
  revenue per unit, not as a growing pile: everything carried is stale and pays
  the 10 % floor. If a line earns little, check the queue length first.
- **The balancing tests own the constants.** When `npm run test:balance` leaves
  its band, the tables in `constants.ts` and `vehicles/catalog.ts` change, never
  the test. Every scenario prints why it earns what it earns.

  Five of the six scenarios of section 19.4 exist and are in band. What each one
  actually holds in place is worth knowing before changing a number:

  | Scenario | Band | Measured | What it pins |
  | --- | --- | --- | --- |
  | 1 bus line | payback 2-4 yr | year 3 | the passenger and mail rates |
  | 2 coal train | payback 4-7 yr | year 6 | **the freight rates** (D-087) |
  | 3 wood chain | 80-200 k/yr | 166 k | that a full chain is worth building |
  | 4 idle company | bankrupt yr 6-9 | year 9 | **upkeep as a share of price** |
  | 6 mine closure | 24 +/- 1 months | month 25 | the closure clock on the calendar |

  M6's acceptance criterion is exactly this table being in band, and it is.

  Scenario 5 (an AI company alone on a 512 map, 25 years) is in the suite
  since M11 as `tests/balance/aiCompany.spec.ts`, on the band the economy
  actually pays (D-158): road personality 0.8-3.2 M plus a
  compounding-through-renewal assertion, rail and expansive solvency
  floors. SPEC.md's 5-25 M was measured against the map's physical offer
  and is not real - read D-158 before touching that band.

  Scenario "Punktzahl" is SPEC2 M17's own (`tests/balance/gameScore.spec.ts`)
  and it is the only one that pins a FORMULA rather than a tariff: the wood
  chain played a quarter century with two goals over it, scored by the end
  screen's own function. Band: total 3,000-7,000 AND no quarter over 45 % or
  under 5 % of it - the second half is the one worth having. Measured **5,889**
  (goals 36 %, value 26 %, network 24 %, cargo 13 %) on the real twenty-five
  years; 5,747 was the same run when it was still twenty-two (D-197). It owns
  the four full-mark constants of the score; freight tariffs, upkeep, the
  network value of D-187 and the medal bands of D-193 all land here when they
  move (D-196). Since D-197 it also carries the network term's INDEPENDENT
  evidence: a second quarter century on a deliberately doglegged alignment with
  the identical fleet reaches 7.8 % of the ceiling against 19.8 % (factor 2.55,
  554 points against 1,413). `SCORE_NETWORK_FULL_SHARE` was derived FROM the
  good run, so only that comparison is evidence - the file says which half is
  which.

  Scenario "Netzdesign" is SPEC2 M15's own, and it is the only one that
  measures the NETWORK rather than a tariff: identical traffic over a
  botched and a well designed railway, compared by network value (earned
  revenue over the closed-form ceiling of D-066). Band: factor >= 3,
  measured 3.73, and it prints the split - alignment 2.01x, capacity
  1.86x. It owns no constant; if it ever leaves its band, something about
  signalling, the curve table or the payment formula moved (D-187).

  Scenario "Harter Winter" is SPEC2 M18's own
  (`tests/balance/hardWinter.spec.ts`) and it is the only one that measures
  a WORLD RULE: scenario 2's railway - literally, both files build it from
  `tests/balance/coalLine.ts` - played twice over the same nine years, once
  with the weather rule off and once harsh. Band: the freight year drops
  **3-7 %**, measured **4.36 %**. **SPEC2 asked for 8-15 % and this is a
  re-band, not a miss** - and read D-204 rather than D-203 for why: D-203
  banded it at 4.95 % and named a DEFECT (`WEATHER_FROST_SEASON` was
  climate-blind, so a tropical January could freeze) as the reason the
  effect was small, which is not an admissible justification. D-204 fixed
  the defect FIRST - the frost gate is the season's own climate-aware
  winter curve now - and re-measured: 4.36 %, so **the gap to 8-15 % was
  never the tropics.** It is an ENSEMBLE of six seeds because one coal
  train is chaotic (per-seed 1.48-6.31 %), and its two independent halves
  are that the loss is winter-loaded on two instruments that are not the
  band (breakdowns +32.9 % against +7.3 %, mean speed -4.94 % against
  -2.97 %) and that no seed earns more in the weather. It owns no
  constant. D-204 carries the re-measured channel decomposition - the
  breakdown threshold is worth ~3.8 of the 4.36 points and **every other
  channel is inside the noise, two of them measuring negative**, so
  D-203's ordering below the leading term does not hold - plus the
  permanent-winter ceiling of 25.2 % that says the seams are not too weak.

- **An industry is judged on what left ON A VEHICLE**, never on what a station
  took (D-085). Crediting the deposit makes the growth signal meaningless: a
  works then reads full service while its output rots on a platform.
- **Nothing shrinks an industry.** The level moves one way; neglect is punished
  by the closure clock (D-086). A decline rule drove every new line's industry
  to the floor before the line could prove itself.

## Milestone status

M0, M1 and M2 are done. A bus line can be built, crewed and run entirely from
the interface, and balancing scenario 1 is in band (payback in game year 3).

**Still outstanding, to pick up with M3:**

- The **minimap** (owed since M1).
- Vehicle **hover and selection on the map** - the fleet list is the only way
  to select one at the moment.
- The other **balancing scenarios** of section 19.4. Only scenario 1 exists;
  scenarios 2, 3 and 5 need rail and industry, scenario 4 (bankruptcy from
  doing nothing) could be written now.
- The **lorry, tanker and mail van prices** are first-draft numbers. They move
  cargo that does not exist before M5, so calibrating them now would be tuning
  against a guess (DECISIONS.md D-041).

**M3 is done.** A train can be assembled in an engine shed, given orders and run
over a line the player laid - across rivers and through hills - and it behaves
the way its composition says it should.

Done: eight-direction track, the curve radius table of section 8.1 with its
speed limits, five rail types, the route assistant (A* over tile plus incoming
direction, costs in metre equivalents), manual mode, the build preview, track
rendering, 33 traction units and 23 wagons, train composition, the rail
coefficients in the longitudinal solver, curve-aware braking, train pathfinding
over the track graph, platforms and engine sheds, electrification, track
conversion, bridges and tunnels, and save format v6 with every migration from 2
on.

## Rail - the four things that will bite

1. **Gradients are measured over a window, never tile to tile.** One height
   level is 8 m over a 50 m tile, i.e. 160 per mille, which no rail type can
   accept. See the note in `map/track.ts` and DECISIONS.md D-042. Three places
   use the same measure - the route assistant, `measureRoute` and the
   longitudinal solver - and they have to stay in step.
2. **Track height is `TileMap.railHeight`, never `baseHeight`.** On a bridge the
   two differ by the whole depth of the valley (D-053).
3. **A train is one entity.** Its composition is a list of catalogue ids;
   mass, tractive effort, top speed, length, braking and capacity are cached
   aggregates refreshed by `VehicleStore.refreshAggregate` whenever the train or
   its load changes. Never read a train's properties from its leading spec.
4. **`routeRemainingM` is measured from the start of the current tile**, not
   from the vehicle. The distance left is that minus `progressM`. Two separate
   accumulators drift and strand vehicles one tile short of their platform
   (D-043).

## M4 - signals

A signal divides a line into sections; a train claims the one it is entering,
all of it or none of it, and gives it back as its tail clears. Two trains can
run one line.

- the reservation table is keyed by TILE and is DERIVED - never saved, never
  hashed, rebuilt on load. A key derived from anything else would be rebuilt
  every time a road tile is laid (D-054).
- a signal stands only on plain line, which is what removes junction throats as
  stopping places and with them the whole pre-signal family (D-055).
- **the claim runs from where the train IS, every tick** - not at the tile
  boundary. A train braked to a stand never crosses a boundary again, so a
  boundary-triggered claim is never retried (D-060).
- following trains are safe and live; two trains meeting nose to nose on single
  track deadlock, and that is a stated limitation, not a bug (D-059).

## M5 - cargo routing (section 7.4)

Every parcel knows where it is going, and no vehicle carries one anywhere else.

- **the connection table is ONE graph** keyed by station, not a table per
  station: a stop cannot work out on its own what lies two lines and a transfer
  away (D-075). Legs come from the vehicles' ORDERS; the mean of the last eight
  trips is the measurement.
- **a vehicle loads a parcel only when its next stop is on a shortest route to
  that parcel's destination**, and sets it down the moment that stops being
  true. Feeder chains are what those two rules produce, not something modelled.
- **the comparison has no detour allowance, only a one-tick epsilon** (D-078).
  Payment is measured from a POSITION, so a parcel that accepts a detour can be
  carried out and back on one line and be paid for both legs.
- a leg nobody has driven is credited with a straight line at 54 km/h, or the
  first cargo ever produced would expire while its line is being driven for the
  first time. A leg is measured ARRIVAL to ARRIVAL (D-077).
- routeless cargo is written off WHOLE at thirty days and charged as overflow;
  cargo that has a route just decays. Different failures, different treatment.

## M5 - industry chains

Industries produce, accept and transform cargo on the calendar, and the loop
closes back into town growth.

- **production is MONTHLY, collection is DAILY.** Per-tick production is the
  balancing mistake section 7.3 names by name; monthly collection would put a
  month of output on a platform in one tick and leave it ageing for four weeks.
- **review the month that ENDED, then produce for the next one.** The other way
  round compares this month's production against last month's collection, and
  every industry looks neglected for ever.
- **an industry that produced nothing is dormant, not neglected.** Counting
  those months towards the 24 month closure shuts every factory on the map
  inside two game years, because a factory makes nothing until it is supplied.
- stock capacity is eight months of the industry's OWN production; a flat cap
  makes the small ones hoard and chokes the large ones.

- the collection gate CAPS what leaves an industry by the rating of the stations
  serving it, weighted by the SHARE of the footprint they cover. A tile count
  saturates the gate and the rating stops mattering (D-063).
- the growth ratio divides by UNGATED production, which is what makes service
  quality pay in tonnage (D-064).
- delivered cargo goes into industry stock or town demand, NEVER into
  `station.waiting` - it would push a town's passengers into overflow (D-065).
- **freight tariffs were four times too low and nothing checked it.** A
  vehicle's ceiling revenue is closed form; measured that way, no freight
  vehicle covered its own upkeep on any line. `tests/balance/tariff.spec.ts`
  prints the table now (D-066).

## Measured against SPEC.md - what M4 and M5 still owe

**M4 (section 9) is complete.** All four signal types, block segmentation, path
versus block claiming, one-way signals the pathfinder respects, automatic
signalling (9.4), the F3 block overlay (9.3) and the deadlock warning. The
regression network of 19.5 runs twenty trains with zero collisions and nothing
permanently stuck (D-084).

Read D-082 before touching that fixture: what fixed it was the SHAPE of the
railway - platforms on loops, sheds that merge instead of crossing, a signal
immediately past every merge - and a priority-reservation scheme that composed
into deadlock cycles is recorded there so nobody builds it again.

**M5 (sections 7 and 10) is complete.** Production chains, the service gate,
the monthly level, acceptance, town demand, refit, cargo routing (7.4), the
industry clock (7.3) and the station modules (10).

Still open, and none of it is M4, M5 or M6:

- **Lines** (section 12.2) and with them the line list, the timetable of 12.3
  and per-line auto-renewal. No milestone has assigned them; M6 needed the
  renewal switch, so that one is company-wide for now (D-093).
- **The news log** (section 15, due with M8). Until it exists, an industry's
  closure warning is visible only in the tile panel and a stuck train only in
  the fleet list and the F3 overlay.
- **A reversing train** ("Wendezug") in the regression network. The pathfinder
  refuses a 180 degree turn, so a train that runs round its own train is not
  something the simulation can express yet.

## M6 - economic depth

The books, the fleet's mortality and the lists. Four things here are easy to get
wrong and expensive to notice late:

- **depreciation never touches cash** (D-090). The money left when the vehicle
  was bought; charging it against the bank again makes every company insolvent
  twice as fast. Only the FLEET is written down - infrastructure has no design
  life and no wear model.
- **the fleet's upkeep and its depreciation are RECOMPUTED from the vehicles**,
  not carried as running totals. Obsolescence arrives with age rather than with
  a command, so a cached sum would need correcting from the yearly hook and any
  drift would be invisible until a save was reloaded.
- **the energy meter is a Float64 and is emptied every month** (D-091). One tick
  is up to 840 kJ and a century is 7.2 million ticks; a Float32 stops
  accumulating meaningfully inside the first game month.
- **auto-renewal draws no randomness** (D-093). Breakdowns do, and a stray draw
  would send every existing seed down a different future the moment a player
  enabled the switch. The successor is picked by a total order.

Inflation is fixed at new-game time, saved and hashed, and applies to costs as
well as fares (D-092) - including in the build preview, or the preview and the
bill disagree from game year two.

## M7 - water and air

Two more modes, and the cheapest of the four milestones so far - because M5's
cargo routing never asked what kind of vehicle was carrying a parcel. A ship
joins a chain with no changes to the routing at all.

- **a quay does not move the station centre** (D-095). The centre is what the
  catchment is measured from; a berth reaching into deep water drags a port's
  catchment off the shore, and a harbour beside a coal mine can lose the mine.
- **ships get plain A*, not the flow field of 8.4** (D-094). Shorelines MOVE
  when a canal is dug, and a stale flow field routes ships into land that is no
  longer there - silently.
- **an aircraft flies a path of ADJACENT tiles** (D-098). Every consumer
  downstream measures a step from the delta between two entries; endpoints would
  mean a second motion model, snapshot and save.
- **a hull and a wing have no rolling resistance.** Their drag is in the fluid,
  which the drag term carries. Charging a ship road friction puts a hundred
  kilonewtons on a vehicle that has none.
- **canals already worked and locks cannot exist** (D-097). Lowering land below
  sea level floods it; a ship sails up the result. But water IS "terrain at or
  below sea level", so the game has exactly one water surface and a lock has no
  second level to connect. That is the one thing in M7's sentence not delivered.

## M8 - opponents and goals

Five subsystems, and the order they were built in is the order they depend on
each other.

- **The news log** (section 15) is one place that reads every warning clock the
  simulation already kept - the deadlock timer of 9.3, the closure count of 7.3,
  the solvency months of 14.2 - and turns it into something the player sees.
  Everything in it uses `postOnce`: a clock that ticks daily otherwise writes
  the same sentence seven hundred times a game year.
- **Several companies.** `world.company` now means the company currently ACTING,
  set from the command envelope for the length of one command and back to the
  player straight afterwards (D-100). Three places run OUTSIDE a command and had
  to be told: the monthly hooks take a `CompanyState`, a vehicle's revenue is
  booked to its OWNER, and the winding-up acts as the company being wound up.
- **Tiles have an owner** (D-101). Stations and vehicles already did; the town
  council of 13.3 rates a company on the track IT laid, and no company may tear
  up another's line. A tile is claimed by the first ROAD on it or by any TRACK;
  a town's own street stays public however much a company extends it (D-104).
- **The town council** rates every company 0-100 on service and nuisance,
  recomputing three of the four inputs every month and remembering only what a
  company DID, which decays (D-102). At 75 exclusive building rights are for
  sale; below 25 the council refuses the company. `DemolishBuilding` exists so
  that "buildings demolished" is a real term (D-103).
- **The carbon levy** is metered from ENERGY rather than kilometres (D-105) -
  the same question with a better answer, and no new number on any vehicle. The
  grant that pays for electrification is the other half of the same policy.
- **Tenders** are opt-in bets, and every one is a race (D-107). They draw from
  their own RNG stream, because taking those draws from the gameplay stream
  moved every later breakdown roll and turned balancing scenario 3 red (D-106).
- **The AI** enqueues the player's own commands as its own company, which is
  what makes "no cheating" structural. Read D-108 and D-109 before touching it:
  the first is why a line is built over three cycles instead of one, and the
  second is what the twenty-five year acceptance run measured and what it
  changed.

The acceptance run is `tests/balance/aiGame.spec.ts`. It passes: a twenty-five
year game against three competitors runs through untouched, they build networks
that can be told apart, and two of three finish solvent. What they do not do is
COMPOUND - by year twenty-five they have usually pruned back to nothing. That is
a scoring problem and it is written up in D-109.

## M9 - finishing

The last milestone: a menu, options, save and load, a minimap, a handbook, a
tutorial, audio, an installer and a README. Read `README.md` first - it is
written for somebody who has never seen the project.

- **A setting is not a game rule** (D-110). A setting is the player's, is the
  same for every game, and must never reach `src/sim`. A rule - inflation, the
  carbon levy, how many competitors - is the world's, lives in the save and the
  hash, and is chosen once on the new-game screen. They are deliberately on
  different screens.
- **The worker encodes a save; the main thread decides where it goes** (D-111).
  Architecture law #1 forces it, and it is right anyway: naming and rotation
  are policy, and the thumbnail is a picture of the map as the MAIN thread
  holds it.
- **The minimap is a pure function, and the save thumbnail is the same one**
  (D-112). It repaints when the map revision moves and never per frame.
- **The tutorial watches and never plays** (D-113). A lesson is a sentence plus
  a predicate over the store. It cannot write to the world: that would make it
  a second author of state beside the command queue.
- **The keyboard scheme is one table** both the handler and the options screen
  read (D-114). Undo and redo are deliberately unbound - see D-114 for why a
  partial undo would be worse than none.
- **Audio is injected an AudioContext** rather than constructing one, which is
  the whole reason its graph can be asserted in a headless test.

### Performance, and what is measured by hand

`npm run test:perf` holds section 21's budgets against the world that section
actually names: `tests/perf/fixture1500.ts` builds 1,500 WORKING vehicles -
1,350 buses and 150 signalled coal trains, with live cargo routing - on a
1024 map with 120 towns and 300 industries, and asserts the fleet is working
before a tick is timed (a parked fleet is skipped by the update loop and
measuring one says the simulation is thirty times faster than it is).
Measured baseline, M10 (D-135): p50 1.45 ms, p99 3.26 ms against a budget of
8 - the ledger row every SPEC2 tick promise is priced against, recorded in
SPEC2 section 6.1.1. The same suite reads the big save back and holds a
render CPU tripwire (D-136): the sprite-rebuild and draw-prep cost of
`MapView`, measured without Pixi, with generous thresholds that catch
regressions of multiples before the M12/M13 art milestones. Since M13 the
tripwires gate the MEDIAN of the samples with a very generous p99 backstop
(D-167): background load inflates the p99 tail by multiples but moves the
median at most ~1.6x, so the gate holds on a loaded box while an
acceptance number stays what it is - a clean-machine measurement recorded
in 6.1.1, never a CI threshold.

The two frame-rate budgets need a GPU and a compositor. The procedure for
measuring them by hand is in README.md. There is deliberately no browser test
runner: adding one would pull PixiJS into the simulation's own test runs.

Cross-OS determinism (D-137): a canonical world hash is pinned in
`tests/determinism/fixtures/canonical-hash.json`; CI asserts it on windows
AND ubuntu, and `npm run test:determinism:cross` is the same comparison
locally. A legitimate sim change re-records the pin (corpus protocol); a
divergence between platforms is a law-#3 break and is never re-pinned.

## M11 - the line backbone: order grammar, lines, takt, AI adoption

The merged core milestone of the expansion: SPEC.md 12.1 + 12.2 + 12.3
complete, plus an AI that runs all of it through the player's own commands.
ONE save bump for all three stages (v24, Z5); snapshot layout +`lineId`.
Closed D-093, D-121 and D-116 (the last on a recalibrated band, D-158).

- **A waypoint is a tile layer, not an entity** (D-141), and conditional
  jumps guard the order they SIT on, evaluated at stops only, never per
  tick (D-142). A depot order is a service call, not a terminus (D-143).
- **`LineStore` is the ONE line entity** (D-145, E-06). Vehicles point at
  it via `lineId` and read the order list live through
  `lines/LineStore.scheduleOf` - the ONLY correct way to read a vehicle's
  schedule anywhere in the sim; a released vehicle keeps a private copy.
  `AiState.lines` was migrated and DELETED in the same milestone.
  Auto-renewal is per line (D-146), still drawing zero randomness; L opens
  the line list (D-148).
- **ONE takt point per line - its first station order** (D-149): a grid
  enforced at every stop quantises every leg up to a whole takt and makes
  regularity WORSE. A vehicle past its slot slips to the NEXT one - an
  off-grid departure churns the phase lock permanently. Anchor the takt at
  the DELIVERY terminus: slack spent at the loading end rides aboard as
  cargo age (measured -14.5 %) (D-151). Transfer nodes: the waiting graph
  is derived, cycle-checked BEFORE a wait starts, hard-capped (D-150).
- **The takt band and its floor** (D-151, D-159): earnings within +-10 %
  holds (-8.3 %); the delivery-rating variance reaches 0.57 of untakted,
  banded 0.6, and the missing half is STRUCTURAL - the 20-day rating
  frequency window aliases 0/1 visits against the 23-27-day service period
  no two-train takt can go below, plus the round's own jitter arriving at
  the plant. A slack sweep 2-6 days measured 0.571 as the optimum; do not
  hunt the 0.5 with fixture knobs.
- **The AI sizes its fleet with the 12.3 advisor** (D-152) - fleet from
  the demand interval, takt = the fleet's own spacing, and ONLY on
  two-train railways: on roads the slot idle costs more than the bunching
  it removes, at every fleet size. Its railway is the D-082 oval where
  flat straight ground exists, else the assistant-planned single line with
  exactly ONE train (`AiProject.railTrains` is save state, Z4) (D-153).
  A borrower enqueues loan and build in ONE command batch (the loan-churn
  standstill is dead), and every road is FOUND by BFS before it is
  ordered (D-154). A renewed fleet is not a failing line: the successor
  finder takes each replacement once, and a negative review gain reliably
  means turnover, so the review re-anchors instead of closing the best
  line of the run (D-155).
- **The arrival-gate freeze** (D-157): the Float32 `routeRemainingM`
  accumulator drifts a few ulps below the freshly recomputed float64 step
  of the LAST path node; a dead stop in that sliver held Braking at speed
  zero for ever. The final crossing threshold is now `routeRemainingM`
  itself - brake target and arrival gate are one number, D-043's own rule
  one storage class down. The deadlock clock sees a standing train
  whatever it holds (D-083's arc finished). `finalApproach.spec.ts` pins
  train, aircraft, bus and clock; the v24 pins did not move.
- **Scenario 5 is in the suite on the band the economy pays** (D-158,
  closes D-116): `tests/balance/aiCompany.spec.ts` asserts road (seed
  4711) at 0.8-3.2 M - measured 1 119 720 - plus growth THROUGH the
  year-twenty-one renewal, and rail/expansive alive with standing
  networks where D-156 measured both wound up. Five million was never
  physical: the achievability probe (a competent hand-built network over
  the map's complete sustainable offer, with 6 M free capital) peaked at
  +840 000 over 25 years - one long coal haul is the map's real earner,
  the big-town pax piles pin at the station cap, and the farm-to-food
  chain is a measured trap (livestock dies over the 100-tile haul).

## M12 - the stage: hybrid renderer, 60 Hz motion, living water, map text

The render substrate everything later mounts on (SPEC2 E-04/E-05/E-14).
Strictly render-only: zero sim contact, zero save bumps, zero snapshot
changes - the wall clock may only choose WHERE BETWEEN two published
counters a frame sits, never invent one (D-162), and world animation keys
to the deterministic blink counter, never `performance.now()`
(Fehlerkatalog 39, D-164).

- **The Kenney bake is a pure function from pinned kits to bit-identical
  atlases** (D-160). `tools/assets-manifest.json` pins twelve packs by URL
  AND SHA-256; `assets:fetch` fills a gitignored cache, `assets:bake`
  rasterises GLB models through EXACTLY the 16.1 dimetric camera (coupling
  test against `projection.ts`) with an own ~400-line rasteriser and a
  fflate PNG writer ("bake twice, bit-identical" across machines). No
  cache means a warning and procedural art - the game ALWAYS starts. The
  glob test walks the git index and is the guard. `bakedAtlas.ts` was the
  door M13 walked through: the game consumes the bake since D-170 (see
  the M13 digest below).
- **A chunk is a checksum with a texture** (D-161). At 0.5x and below the
  static world is 32x32-tile RenderTextures; the per-chunk FNV digest
  (corners one PAST the range - seams are shared) is what makes "only
  touched chunks rebake" true. Industries, stations and vehicles stay
  live sprites (markers and tints must not force rebakes). At 0.25x:
  terrain chunks + network polylines + vehicle dots - one batched fill
  per company, dots are clickable. Chunk-granular painter order is
  pixel-exact (proof in the entry); textures bake at display zoom, LRU
  with current-frame exemption.
- **The renderer draws one tick behind and glides towards the newest**
  (D-162). Reader-side copies of the two newest generations, wall-clock
  alpha in between, rows paired by vehicle id (the block is compacted),
  clamped at teleports AND at Loading/BrokenDown/InDepot transitions.
  Never extrapolate: an overshoot at a red signal is a lie. The lerp
  window comes from the published `SimRateCentiHz`, capped 250 ms; the
  day/night phase glides on the same alpha.
- **The top zoom has its own atlas page, packed by headroom** (D-163). A
  uniform 4x grid would burst the 4096 GPU guarantee, so short rows for
  terrain/road/track, tall rows for buildings - and `anchorY` moved ONTO
  the frame: every frame states its own ground line, `MapView.place`
  reads nothing else. The cells are the base drawing code under a 2x
  transform - no second artwork to keep in sync. Chunks always bake from
  the BASE page.
- **Water is a tint over greyscale, three rows on the blink counter**
  (D-164). White-based cells make the two 16.3 hexes exact by
  construction; deep = `oceanMask` AND two levels under the surface. The
  chunk checksums fold `oceanMask` plus a one-tile terrain ring (foam
  reads the neighbour). Phase swaps re-texture recorded sprites on the
  detail path and REBAKE water chunks staggered (2/frame) at 0.5x -
  measured against live water sprites, the rebake wins on every column.
  The 0.25x ocean deliberately holds still.
- **Map text is a startup-rasterised system font in an unscaled stage
  layer** (D-165, E-14 - no font binary, the glob test guards). Town and
  station labels read the marker channels that always carried the names;
  the culling (`labels.ts`, headless-tested) is greedy in priority order
  - towns by population before stations - so labels DROP, never overlap.
  Towns are never zoom-gated (the overview is for reading maps); station
  labels exist only at 1x+ where their modules are visible sprites.
  Relayout only when zoom, lists or revision move; the layer follows the
  camera by one position copy per frame, outside the D-127 tint.
- **The minimap draws the camera as an honest parallelogram, over the
  painter and never in it** (D-166). `minimapViewQuad` back-projects the
  four screen corners at height zero; the PANEL strokes it on a second
  canvas above the bitmap, so `paintMinimap` stays pure and the save
  thumbnail stays a picture of the world (D-112). Camera facts flow
  view->store change-detected; drag-to-pan is pointer-captured, clamped
  at the map edge.

Measured (reference machine, in the ledger 6.1.1): tick p50/p99 unchanged
(render-only; the +0.43 ms read is run-to-run noise, argued in the row),
chunk bake p99 1.57 ms against the 4 ms acceptance budget, sprite-pool
rebuild p99 4.17 ms / draw-prep p99 1.58 ms against 25/5 ms tripwires,
both atlas pages under 20 ms of the 250 ms startup slice.
Atlas ledger: page 0 at 2176x3840 of 4096 (M12's four water rows plus
M13's emissive row, D-172, and rail-furniture row, D-173), page 0-detail
FULL at 4096x4096 (D-163, D-173 - any further detail cell needs a new
page) - every further cell needs a 6.2 booking first (Fehlerkatalog 40).

## M13 - living trains, breathing day, working world

The white box dies: every catalogue entry drawn from the Kenney bake in
eight facings and company colours, a ten-wagon train as ten wagons, the
full 16.3 day/night with emissive windows, signal aspects as world art,
catenary, smoke and status badges. Render-only in the strictest sense -
and even the ONE permitted snapshot-layout bump (`IndustryMarker.level`)
turned out to be already spent: the field has travelled the marker channel
since M5, so M13 changed ZERO protocol bytes and SAVE_VERSION stayed 24
(D-174, the D-171 pattern). Bundle 0 (D-167/D-168) is digested in the
perf and environment notes above.

- **The full catalogue is mapped, and a reuse is never a wrong
  silhouette** (D-169). 145 manifest models cover all rail, road and
  water catalogue ids; aircraft, headframe, derrick and farm stay
  procedural BY NAME, and the coupling test holds art to catalogues in
  both directions. Honest reuses via `recolor`/`stretch` carry manifest
  notes; chimney anchors were measured from model geometry, not guessed.
- **The catalogue drives baked, the white box retires to a fallback**
  (D-170). Facing = the interpolated glide vector (never the tile step -
  no quarter-turn snaps), cached for standing vehicles; two-pass tint as
  two sprites sharing one zIndex; contact shadows are baked INTO the
  cells (clipped - the unclipped version overran the 6.2 booking and was
  refused); `vehicleVariantFor` drops incomplete variants WHOLE. Every
  fallback floor is a pure decision under test.
- **A consist is wagons on the path the head actually drove** (D-171).
  `VehicleMarker.consist` already travelled the marker channel; the
  breadcrumb ring records the generation that just became PREVIOUS (never
  a point ahead of the drawn sprite), resets on the head's own teleport
  rule, and where history runs out the tail extends straight - stated
  floor, no guessed paths through junctions. Road/water/air stay
  single-sprite; 0.25x stays one dot per train.
- **Light is the tint curve read backwards** (D-172). `emissiveIntensity`
  is the D-127 curve's missing luminance - one source of truth, lights
  come on exactly as fast as the world darkens. Glows sit INSIDE the
  tinted container (occlusion stays exact; the night dims them a little,
  measured and accepted); glazing is one kit-wide hue band; procedural
  twins reuse the same drawing code windows-only; street lamps are an
  (x+y) parity rule on town roads; headlights are eight pre-baked ground
  cones on Driving/Braking only; at 0.5x the chunk glows through a baked
  twin (the D-164 pattern, same winner).
- **The aspect is the F3 claim read at the lamp** (D-173). One BlockIndex
  serves the overlay AND the world art (found and fixed: it had been
  zero-sized since M4); four signal kinds are four post silhouettes
  (D-117 applied), the lamp is a position first and a colour second
  (17.4-safe pair); catenary hangs on the new Catenary layer above the
  vehicles, masts on every second plain-line tile, electrified-only.
  Aspects exist at 1x+ where posts are readable (D-165 argument).
- **The working world reads sim truth through the marker level** (D-174).
  ONE capped ParticleContainer (cap 2000, spawn REFUSES at the cap;
  measured p50 0.32 ms at overload against the 2 ms budget, in the
  tripwire): chimney smoke at `INDUSTRY_SMOKE_ANCHORS` - the drawings
  consume the same table, so smoke leaves the drawn stack by
  construction - cadenced by the marker level (dormant = none, booming =
  dense), exhaust from the audio's own throttle proxy, breakdown smoke
  from the State field. All cadence on the blink counter plus avalanche
  hashes - no RNG stream, no wall clock (Fehlerkatalog 25/39). Status
  badges (stuck/breakdown/no-orders) keep the ONE definition of stuck
  (the 9.3 deadlock clock), gate at 1x, live outside the day/night tint.
  A dormant and a booming works differ in a STILL image: plume density
  by day, `industryGlowFactor` on the window twin by night.
- **The static world draws from the bake too, and M13's Fertig-wenn never
  asked** (D-205, bundle 7, 2026-08-08). The manifest carries 2,430 cells;
  until this bundle `MapView` consumed only the `vehicle:` ones, so a
  player with no vehicles saw NONE of the Kenney art. Buildings
  (`building:<zone>:<stage>`, zone from `BuildingKind`, stage the
  `level >= 2` split the procedural cell already used), industries
  (`industry:<TypeName>`) and TREES (`tree:<climate>:<n>`, three per
  wooded tile - a forest used to be a colour) now draw from
  `staticArt.ts`, which is `vehicleArt.ts` for things that stand still:
  same handle, same frame cache, same per-cell anchors, same two E-14
  floors. CoalMine, OilWell and Farm are refused BEFORE the index, by
  name, so the headframe, the derrick and the farmstead stay `shapes.ts`'s
  whatever the manifest holds. Both render paths: buildings and trees go
  INTO the chunk textures (industries stay live sprites over them), which
  forced `CHUNK_ART_HEADROOM_PX` - a chunk reserved 48 world px and the
  tallest baked cell lifts 138, so every skyscraper was one edit away from
  being guillotined at a 0.5x chunk seam. Night windows come from the
  cell's own emissive twin, smoke from its own measured chimney points
  (D-174's promise carried into the bake), variance from
  `tileVariantSeed(x, y, salt)` and never from a stream. **Read the
  measurement note in D-205 before adding a per-tile string**: the first
  tripwire run cost 9.7 ms and the cost was composing a target key per
  tile, not the 4,914 new sprites.
- **A tile's building may not stand taller than the cell the game reserves
  for it** (D-206, bundle 8, 2026-08-09). D-205 drew the bake and never
  asked how BIG it was: the tallest static cell was **4.30 tile heights**
  (69 m on a 50 m tile) against the **1.12** of the D-117 procedural block
  it falls back to, so a 1950 town was a skyline and the two render paths
  drew two different towns. **The rule is the game's own reserved
  headroom** - `CELL_HEADROOM_STEPS * HEIGHT_PX + TILE_H / 2` = 64 px =
  2.00 tile heights = 4 height steps = 32 m - because that is what a
  procedural cell can physically draw and what a chunk texture must
  enclose; `BAKED_STATIC_MAX_LIFT_PX` 160 -> 64 takes 6.7 % off every
  chunk bake. `tools/bake-lib.ts` REFUSES to bake a `building:`,
  `industry:` or `tree:` cell over it, proven on synthetic geometry, so a
  proportion break is a failed bake and not a needle in somebody's town.
  Height is corrected with `stretch [1, y, 1]` (the authored footprint
  survives, a `scale` cure would break the width instead), size with
  `scale`, and the wrong BUILDING with a remap: the four skyscrapers and
  `building-m` leave the mapping - stage 1 means "grown", not "1999" -
  and **the era axis they belong to is M23's, named, with nothing here
  making it harder**. Found on the way: `building:industrial:1` drew
  SHORTER than the stage it outgrows. Trees: 0.11 tile widths against the
  procedural conifer's 0.22 reads as a spike whatever the species, and
  three trees at three fixed slot centres is a wallpaper - crowns widened,
  a 2:1 size ladder per climate, and the jitter split so the LATERAL half
  (which the depth key `u + v` cannot see) is 2.1x wider while D-205's
  band proof is untouched. Zero sim bytes, zero new cells, zero atlas
  booking; main bundle +10 B.
- **A wood is a density, not a carpet** (D-209, bundle 9, 2026-08-09). D-206
  fixed the SIZE of a tree and the countryside still read as wallpaper.
  Measured: a default temperate 1024 map is **16.5 % forest** (172,966 tiles),
  which at three trees a tile was 518,898 instances and about 501 tree sprites
  on screen at zoom 1. The hash was NOT the fault - all 64 variant triples
  occurred, the commonest on 1.9 % of tiles. The GEOMETRY was: a constant
  three per tile (a carpet has no clearings, stands or edges), one fixed
  triangle of slot centres stamped on every tile with only **5.1 px** of depth
  jitter against a 32 px tile, and a slot table whose centroid sat **+5.1 px
  right** on every wooded tile in the game. The cure is one smooth field -
  `forestDensityAt`, value noise over an **8-tile (400 m)** lattice - deciding
  per slot whether a tree grows at all: measured **2.223 trees per tile**
  (8.4 % of tiles empty, up to four), so the maximum rose to four while the
  placement count fell **26 %**. It costs no extra hashing: the one avalanche
  M13 already spent on position now pays for position, presence AND a
  per-instance **+-15 % size**, which turns the four-body ladder
  (0.45/0.58/0.73/0.88 tile heights) into a continuum with no new atlas cell.
  Four slots, symmetric, bands still disjoint by construction (0.10 of margin)
  so D-205's insertion-order proof is untouched - skipping a slot preserves
  the order of the rest. The tree cells' own size was measured and left alone:
  6.0-14.0 m straddles the game's OWN procedural conifer at 8.5-13.0 m, so the
  manifest was not touched and the bake is byte-identical. Cheaper, and the
  counts say so: rebuild 14,746 -> **13,276** placements, chunk bake
  4,273 -> **3,873**, p50 medians 8.378 -> 7.273 and 2.046 -> 1.963 ms on
  interleaved A/B runs, no tripwire re-derived. Zero sim bytes, zero atlas
  booking; main bundle +460 B.

## M14 - instruments: flow atlas, station x-ray, statistics, tooltips

Instruments BEFORE dynamics: the diagnosis tools M18-M21 will be
balanced with. ONE save bump (v24 -> v25, owned by the station
cargo-history ring, extended in place by the vehicle fields - the pin
moved twice under the D-137 protocol, `8146983bca3a6f92` is current);
ONE snapshot-layout bump (6 -> 7, the FlowMarker block). Ledger row
6.1.1 closed: tick 1.48/3.17 on the M10 baseline, flow export
0.057/0.241 ms per publish against the 0.5 ms promise.

- **The flow block rides the one publish pass and nothing sim-side may
  read it back** (D-176). Volumes live in the link graph's own
  eight-trip ring (one staleness rule with the leg times; at most eight
  trips lost on load - the honest price), exported in the SAME pass as
  `structureSignature` (Fehler 33), stride 8, cap 4,096 legs, owner and
  line aboard because the arrows colour by them. A test walks `src/sim`
  and fails the day a pathfinder reads the flow vocabulary.
- **The arrows are an event-driven vector layer outside the tint**
  (D-177). Redraw only when `flowHash`, zoom or stations move; top-N by
  bounded insertion selection (the sort it replaced was 9x dearer at
  the megagraph); bow side = fixed +90-degree rotation of travel, so
  A->B and B->A separate BY CONSTRUCTION; unmeasured legs draw
  estimate-grey, never a company colour; the cut feeds an honest
  "x more" chip. Minimap Fluss = one more case of the ONE pure painter,
  so the save thumbnail inherits it (D-112). A toggles the overlay.
- **The cargo-history ring counts three VERDICTS per cargo and month**
  (D-178): Collected (left ON A VEHICLE, the D-085 measure), Delivered
  (arrived as destination), Expired (decay + write-off + turned away).
  A transfer set-down is deliberately none of them. Events add onto
  Float64 accumulators; the monthly hook rounds into the Int32 ring.
  Accumulators are saved AND hashed like the ring - but full digest
  only (the tile-layer precedent; the live digest already moves via
  waiting/overflow). 3,024 B per station.
- **The x-ray displays the simulation's own terms** (D-179).
  `stationRating` IS now the sum of `ratingTerms` (test: sum = rating);
  the warning names `dominantLossTerm`, ties to the lower index, gated
  at 5 points. The catchment preview composes the build command's own
  `joinTargetIdFor` + D-095 centre + radius rule - the circle before
  the click IS the catchment after it. Station markers join the fleet
  cadence (one post per game day); history rows travel sparse.
- **The value graph is the yearly archive plus today** (D-180) - a
  monthly value series is NOT honestly derivable (construction moves
  value outside the accounts), so the 24-month detail stays the
  cash-flow bars. Axis scaling is pure in `ui/chart.ts`.
- **The vehicle detail displays what the sim computes** (D-181):
  per-vehicle upkeep factored OUT of the fleet bill (one term),
  manifest rows ARE the merged stacks with paid-up-to distance by the
  payment formula's own measure. `breakdownCount` + `depotCall` joined
  the v25 payload (saved + hashed; the flag is Z4 routing state). A
  depot call is a ONE-SHOT flag beside the schedule - `orderTargetTile`
  answers with the shed while it stands, the arrival services, parks
  and clears; the abandoned trip measures nothing (D-077) and stopping
  the vehicle cancels the call. Follow camera is a render fact.
- **Notification routing is presentation over the news delta** (D-182):
  off/ticker/toast/pause per category, a pure `routeNotification`
  table, pause = `setSpeed(0)` (control traffic, never a command,
  D-004), pause never a default. Fresh = identity-delta plus a
  two-game-day age cap, so a loaded backlog can never flood the stack.
- **Tooltips: the registry is the enumeration** (D-183). `ui/tools.ts`
  carries label + tooltip key per tool, a compile-time
  `Exclude<Tool, RegisteredTool>` check covers the union, and the
  coupling test holds both locales - "all 22" is proven, not counted.
  The module clones its trigger (no layout change), places by a pure
  headless-tested function, shows on focus IMMEDIATELY (hover waits
  450 ms), and lets Escape keep propagating to the 17.2 ladder. Texts
  carry the MECHANISM, parameterised from the sim's constants; the
  price line keeps the exact inflated figures (D-119). Major readouts
  (cash/loan, station rating, x-ray terms, industry, vehicle, value
  graph) wear the same module with `tabIndex` 0.

## M15 - net value and road congestion: SPEC.md 8.4 as world rules

The 4x promise of SPEC.md section 1 becomes a number, and the two route
costs 8.4 always named finally exist. ONE save bump (v25 -> v26, owned by
the rail rules, extended in place by the road layer); ONE snapshot-layout
bump (7 -> 8) - spent not on the promised congestion block, which cost
zero bytes twice, but on the E-18 cap. Every new rule is a `NewGameParams`
flag and every one of them is OFF unless chosen: the five M6 bands, the
takt band and scenario 5 were all measured by a game that had none of
them, and shipping one on by default would re-band the lot inside the
milestone that introduced it (Fehlerkatalog 34).

- **The rail terms read the ONE reservation table, and a held train
  reconsiders on a capped cadence** (D-184). `RailPathfinder.find` takes
  the live table and the searching vehicle's id, both REQUIRED; occupancy
  is charged once per foreign run ENTERED (3 s - per tile would scale the
  price with how much track the train ahead happens to hold), and it is a
  PRICE, never a wall - a claimed section that returned NoRoute would hide
  D-059's stated deadlock. The reroute hangs off `stalled` in the
  Driving/Braking branch, not off `WaitingForPath`: the braking lookahead
  stops a train SHORT of the red, so the tile-boundary gate never runs
  again (D-060/D-157, met a third time). An identical route is never
  re-adopted - that would release the claim and shove the head back to the
  start of its own tile every interval.
- **The road congestion layer is SAVED and hashed** (D-185, E-02/Z4).
  Vehicles per tile over 200 ticks is history, and a layer rebuilt empty
  on load would price the same road differently after a load than before a
  save - law #3 broken in silence. It rides the map's SharedArrayBuffer,
  so the heat map costs no snapshot byte. One entry = 16 units, one sweep
  every 20 ticks removes `ceil(value / 11)`, so `value / 16` IS "vehicles
  in the last 200 ticks" and the decay is an epoch walk over a dirty list,
  never a map scan. The layer ALSO IS the leader rule: a vehicle reads the
  tile's traffic, subtracts its own trail and caps its top speed by it -
  no neighbour search, floor 0.35 (a jam is a queue and a price, never a
  standstill). A level crossing shuts on the claim the trains obey.
- **The counters may draw the picture but never write the log** (D-186).
  `TileMap.throughput` is derived, monthly-cleared, never saved, never
  hashed - and the licence for that is that NOTHING reads it: a test walks
  `src/sim` and fails the day anything but the meter speaks the access. So
  the news is NOT conditioned on it (saved state must not depend on unsaved
  state); an Engpass is defined by the QUEUE - two trains refused at the
  same tile. The deadlock detector walks the waiting graph, whose edge is
  `tryClaim`'s own refusal test read backwards (`refusedTile`), rotates
  each ring to its lowest id so `postOnce` recognises it, and reports one
  heading per stuck train - ring, queue or plain stuck - because two
  headings about one situation would take turns being newest and spam the
  log daily. No auto-fix, and that is tested (SPEC.md Fehler 18).
- **The network value is the tariff test's ceiling, read from the world**
  (D-187). `ceilingRevenueCtPerYear` moved out of
  `tests/balance/tariff.spec.ts` into `src/sim/economy/networkValue.ts`
  and the test imports it - the number that CALIBRATED the freight rates
  (D-066) and the number the panel divides by must be one number. The
  denominator is quoted at the price level of the earnings it divides
  (`inflatedYearsBetween`, a prefix sum over `epochFactor`'s own table),
  or a company would read as improving because the century wore on. It
  depends only on capacity, tariff and top speed - never on the track - so
  two identical fleets on two alignments share a denominator and the whole
  difference lands in the numerator. Per line in the line panel, per
  company in the BOOKS, because "in der Bilanz messen" is what SPEC.md
  asked for.
- **Netzdesign measured 3.73 against the band of 3** (D-187), stable
  across seeds, and the scenario prints the split: the alignment alone is
  worth 2.01x (a fifth longer, a curve limit at every kink) and the
  capacity on top another 1.86x (no signal anywhere means the whole line
  is ONE section, so the second train can never enter it). The good
  railway is one-way blocks plus a return track, NOT the short passing
  loop SPEC2's sentence names: a train will not take a loop whose four
  45-degree turns cost some eight seconds against D-184's deliberate 3 s
  nudge, and a loop only helps where two shuttling trains happen to meet.
  That is measured, written up, and the D-082 shape is what replaces it.
- **E-18 is answered by raising the cap** (D-187):
  `SNAPSHOT_MAX_VEHICLES` = `MAX_VEHICLES` = 4,000, so no living fleet can
  outgrow the block again (it was drawn at 37.5 %, and WHICH vehicles fell
  off was decided by the order the store hands out slots). Measured: a
  full block of 4,000 plain vehicles costs draw-prep p50 2.40 ms against
  0.89 at 1,500, while the already-gated consist scene prices 9,000 units
  at 2.49 - the gate covers it from above, so no new threshold. The
  priority writer was refused because it puts the CAMERA inside the
  decision and breaks the E-05 id pairing. The block writer moved to
  `src/sim/vehicles/snapshot.ts` so a test can reach it at all.

Measured (reference machine, ledger 6.1.1): tick p50 1.481 / p99 2.949 ms
against the M10 baseline 1.45 / 3.26 - a p99 delta of -0.31 ms where the
row allows +0.50. Save size A/B on one world: the all-zero congestion
layer costs 1,039 B compressed against 1,048,576 B raw; heavily played,
20,023 B.

## M16 - the replay theatre and the proof chain

The determinism dividend, paid out: a game is a file you can watch, scrub,
and hand to somebody else as evidence. ONE save bump (v26 -> v27) and it is
a CONTAINER-only one - not a byte of hashed world state moved, so the
canonical cross-OS pin stayed `50c7d6a38f6da052` and the corpus manifest
stayed `17f7f507023b91d8` through the whole milestone. Zero snapshot
change, zero atlas cell, zero tick cost.

- **The checkpoint ring is ONE mechanism for three jobs** (D-188) -
  scrubbing, tail verification, log compaction - because SPEC2 said so and
  following it literally is what kept the milestone small. A checkpoint is
  the whole world at a year boundary, compressed at record time (measured
  25-39 kB against 1.2 MB raw), carrying its own digest, verified when it
  is RESTORED rather than when the file is opened. `CHECKPOINT_RING_CAPACITY`
  is 16 and **entry zero is never evicted**: it is the tick the retained log
  hangs from. Tick 0 is a year boundary, so a game's genesis is a checkpoint
  like any other and "replay from the first day" is a DECODE. A
  `.ironreplay` is the same container with three things settled - the world
  at `logBaseTick`, `commandsExecuted = 0`, and a `ReplayClaim` - never a
  second format, because a second parser falls silently behind the command
  set (the D-133 defect). "Trim the log at a checkpoint" is a legal save
  variant, one-way and never automatic.
- **A recording plays through a SEALED queue** (D-189). Playback is the
  ordinary scheduler at the ordinary speeds; the only difference is
  `CommandQueue.seal()`, and it has to stop two writers: the AI, whose moves
  are already IN the log (before the seal, a recorded AI game could not be
  played back at all), and the interface, refused in four layers so the
  player gets a sentence rather than a silence. Entering a replay REPLACES
  the world, so leaving one loads the game that was put aside through the
  ordinary load path. Scrubbing IS the ring, which is what makes a jump
  exact. A file this build had to MIGRATE is shelved as it stands and is
  `verifiable: false` before the button is pressed. **Its exactness claim was
  false and D-191 supersedes it** - read that before touching the verifier.
- **"Replay pruefen" answers with a VERDICT, never with a bare number**
  (D-191). `Verified`; `DivergedAt(tick)` ONLY with a re-simulation proof
  attached; `DivergedInBracket(from, to, why)` when narrowing could not go
  finer, and it says which of six reasons stopped it; `CorruptRecording(where,
  what)` for a file that contradicts itself - a broken FILE is never reported
  as a diverged SIM and never gets a tick. What makes an exact tick provable
  is that every mark (each checkpoint, and the end claim for the part-year
  tail) now commits to the SCHEDULE of its own segment - the `(tick, seq)`
  pairs, ONE hash, `save/schedule.ts`: a command MOVED inside a bracket breaks
  neither `seq` contiguity nor tick monotonicity, so D-189's candidate rule was
  trusting the tamper's own timings. The commitment covers the schedule and
  deliberately NOT the payloads - a payload tamper is exactly the case where a
  tick IS provable, and what a command DID is what the world digest covers.
  The proof is two real re-simulations of the bracket (the log's, and a
  command-free control), and a proof that does not come off is reported as a
  bracket rather than dressed up. Container-only inside v27 (Z5, extended in
  place); pin and corpus manifest unmoved.
- **A bug report is a repro now** (D-190). The crash bundle carries an
  `.ironreplay` of the session beside the autosave it was converted from -
  same conversion as the shelf's ("export replay from save"), extracted to
  `replayFromSaveBytes` so three doors share one decision, and run on the
  MAIN thread because a dead worker cannot encode anything (D-132). The sim
  enters that thread through a DYNAMIC import, which is also the honest
  failure boundary: `replay: null` plus a `replayError` sentence, never a
  broken bundle. The recording ends at the last save, and the commands after
  it stay in the log tail as text - splicing them in would manufacture a
  history that cannot reproduce, since the main thread has neither the
  worker's exact ticks nor the queue's sequence numbers.
- **The balance suite is the desync net, at a price that is stated**
  (D-190). Every simulating scenario runs twice and asserts hash equality.
  A complete twin costs +186 s of CPU and 143 s of that is the two
  quarter-century AI scenarios, so the seven cheap twins run in every
  `npm run test:balance` (+43 s) and ALL NINE run in the new `soak` CI job
  on every push (`IRON_VEINS_BALANCE_HASH=all`, locally
  `npm run test:balance:full`). `tests/unit/balanceDeterminism.spec.ts`
  walks the directory against the registry in both directions, so a new
  scenario without a twin is a red build and the one exempt file
  (`tariff.spec.ts` - closed form, no world) is named with its reason.
- **The long-run soak is a manifest of HASHES, not a megabyte in git**
  (D-190). `npm run test:soak` plays the recorded twenty-five year AI game
  (seed 4,711, 256 map, three competitors), exports it as a `.ironreplay`
  and re-simulates it against the 16 year-boundary digests it committed to
  AND against a 1,359-byte text pin - self-priming under the D-137
  protocol, including the rule that a cross-platform divergence is debugged
  and never re-pinned. Measured 48.9 s wall, 698 recorded commands, final
  hash `615d0259186b89dc`. The `soak` job runs on windows-latest, the
  platform both pins were recorded on; putting a quarter century on the
  cross-OS surface is a named, deliberately untaken upgrade.

Measured (reference machine, ledger 6.1.1): tick p50 1.447 / p99 2.868 ms
against the M10 baseline 1.45 / 3.26, on a row that allows +0.00 - the
milestone's only per-tick cost is a modulo in the scheduler, and a
checkpoint is encoded once a game year on the SAVE path (25-39 kB
compressed against 1.2 MB raw, 24-41 ms). A recording of the twenty-five
year game costs 582,520 B against the save's 593,434 B; the ring is
566,367 B of both.

**The main bundle is a budget too, and `src/sim` reaches `src/ui` through
DYNAMIC imports only** (D-191). One static `import { fn } from '../sim/save/…'`
in a panel pulls `serialize` and with it the whole `World` into the main chunk
and silently defeats the dynamic import somebody else wrote; it cost +248 kB
before it was found. Display values a panel needs from the simulation - the
calendar year of a scrub chip, of a verdict - travel WITH the data instead.

- **The rule alone did not hold, so the number is a TEST** (D-192).
  `tests/unit/bundleBudget.spec.ts` measures the entry chunk it reads out of
  the built `index.html` against 930,000 B, builds one when `dist` is missing
  (a guard that skips is green exactly where regressions land) and pins
  `NODE_ENV=production` for that build - vitest sets it to `test`, and the
  development React alone is +305 kB. Raising the budget is a booking with a
  measurement beside it, like an atlas cell.
- **Three constants can weigh 32 kB.** Four main-thread files imported
  `SAVE_VERSION`/`REPLAY_EXTENSION` from `save/format.ts`, which imports the
  entity codecs. The container's identity is now the import-free leaf
  `src/sim/save/version.ts`; everything that DECODES stands above it.
- Measured across the milestone: main chunk 1,083.31 -> 936.94 -> **907.18 kB**
  (gzip 328.26 -> 283.96 -> 277.04), the replay half in its own lazily loaded
  chunk. `npm run build` prints the table; check it when a panel grows an
  import.

**The scrub bar is the scrubber, not a read-out** (D-192). The ring is
sixteen entries, so a longer recording has years with no chip - reachable
only because `ReplaySession.seek` restores the newest checkpoint below ANY
tick. The bar is a range input (click, drag, keyboard, screen reader); the
drag moves a local position and only the RELEASE seeks, because every seek
re-simulates. `src/ui/replayScrub.ts` is `CheckpointRing.bestFor` read from
the main thread - import-free, tested against the ring itself - and it is what
lets the bar say before the jump whether it is a decode or ninety game days of
re-simulation. A save is watched in ONE click: `makeReplay.play` makes the
worker shelve and enter in the same round trip.

## M17 - the goal machine and the scenario format

The game gets an end, goals and provable medals. ONE save bump (v27 -> v28,
owned by the goal machine and extended in place afterwards); snapshot
layout 8 -> 9 for the goal block. Measured on the reference machine (ledger
6.1.1): tick p50 1.241 / p99 2.564 ms against the M10 baseline 1.45 / 3.26
on a row that allows +0.05, and the daily hook allocates 0.17-0.71 B per
game day. **The main bundle finished the milestone at 924,308 B against the
930,000 B budget** - 5,692 B of headroom left, all of the growth interface
(50 new sentences in two languages) and none of it a sim import chain. The
next milestone that adds a panel books a raise with its own measurement
(D-192's rule); this one stayed under the line. (Both figures are the
artefact as it stands, re-measured after the second acceptance pass; 924,276 /
5,724 was the B4 build, before D-197's `map/size.ts` added +32 B and D-198
left the main chunk untouched - the briefings live in the scenario catalogue's
own dynamically loaded chunk, 12,928 -> 13,205 B.)

- **A goal is the tutorial's predicate moved into the daily hook** (D-193).
  The vocabulary is D-113's and not one new signal was invented; what
  changed is WHERE it runs, because a medal decided in a panel is a medal no
  replay can reproduce. Verdict and descriptor are both saved and hashed, a
  verdict is FINAL, and the medal bands are descriptor fields rather than
  briefing text - a band decided from unhashed bytes is a band a typo can
  change. `CompanyState.cargoDeliveredUnits` joined the save because no
  twelve-month window can rebuild a lifetime.
- **A scenario is a save with a briefing, and the briefing is kept out of
  the hash by an audit rather than by a promise** (D-194). ONE serializer -
  `encodeSave` with a sixth argument, one more section in `parseSaveFile`,
  the v28 migration extended in place with a CONTAINER default, so not one
  hashed byte moved and no pin was re-recorded. Fehler 35 is answered by
  three audits that are each fed a planted violation:
  `tests/unit/scenarioCoupling.spec.ts` perturbs every leaf of a real
  `.ironscenario` against `hashWorld` (its meta-test folds the briefing INTO
  the digest and requires the audit to name it), walks `src/sim` so the
  vocabulary can live only under `save/`, and holds the lock table against
  the real `NewGameParams`, the saved world state and `AppSettings`. Unhashed
  is not unchecked: every field is validated, the goal captions are
  cross-checked against `state.goals.length` - a caption may describe a goal,
  never define one - and the lock list is strictly ascending. A locked rule
  binds the START SCREEN and never the simulation, because enforcing it
  sim-side would be a simulation decision reading unhashed bytes. The
  reference final hash is compared with the container's own `ReplayClaim` and
  then handed to M16's `verifyReplay` unchanged - re-simulated, never
  believed.
- **A shipped scenario is TEXT, and its seed was chosen by looking at the
  world it generates** (D-195). Eight definitions of seed + rules + goal
  descriptors + briefing, twelve kilobytes, no file: the world is generated
  when the player presses start, which is what makes the same eight
  determinism fixtures (each built twice, played a game year, hash-identical
  - and all eight hashing differently from each other). ONE path from a
  definition to a world - `newGameOptionsOf` -> `worldParamsFor` ->
  `World.create` - shared by the browser, `SimWorker.restart` and the
  fixtures, because a fixture that builds its own params hashes its own copy
  of the rules. The scan behind the seeds is worth knowing before adding a
  ninth: this generator makes ONE continent (three of four hundred seeds had
  three inhabited land masses), global roughness says nothing about
  mountains (the CORRIDOR between the two towns a goal names does), and a
  climate keeps the terrain but changes the industries - which is why the
  arctic mountain scenario counts passengers, since at that climate its map
  grows coal mines and nothing that burns coal. Thresholds are calibrated on
  four measurements (four buses = 21,400 pax/year, one coal train = ~1,700
  units/year, an unserved town of 8,000 reaches 10,465 in 25 years, D-158's
  840,000 EUR ceiling); the floor under them is a test that runs every
  scenario a game year with no player and requires every goal still Open.
  **The briefing goes through the metadata block, never `t()`** - chrome is
  interface, a briefing is content that travels with the scenario, and a
  test asserts neither catalogue contains one.
- **The game ends on ONE screen with four reasons, and the score is a
  reading rather than a record** (D-196). Won, Bankrupt, Lost, Century -
  the bankruptcy dialog is one of them, which closes the M8 hole where a
  wound-up company got a news entry and a red line and no ending. Every
  input to the score is already hashed (goal verdicts, the books, the
  lifetime tonnage, D-187's network value), so storing it would only make
  a second place for it to be wrong - and would cost a save bump v28 does
  not have to give. Four quarters of 2,500, each a SHARE of its own
  measured full mark, so a very rich company with a bad network cannot
  out-score one that did all four: `tests/balance/gameScore.spec.ts`
  measures **5,889 - goals 2,125 (36 %), value 1,556 (26 %), network 1,413
  (24 %), cargo 795 (13 %)** and bands the SPREAD, not the total (5,747 in
  earlier notes was the same run while it was still twenty-two years, D-197).
  **Hash-verified medals are end to end**: a played two-year recording
  verifies, and re-simulating it - from the last checkpoint AND from
  genesis - reproduces the scoreboard field by field, with the converse
  proved too (one changed medal moves the world hash). The panel names a
  goal from its DESCRIPTOR, never a briefing (a loaded save has goals and
  no metadata block); its bar is the snapshot goal block's one consumer,
  change-detected in `SimClient`, while the exact figures ride the marker
  channel once a game day - thousandths cannot say "1,234,567 of
  2,000,000". Won beats Bankrupt beats Lost, because a verdict is final
  and a winding-up leaves every goal but `SurviveUntil` Open for ever.
  Found and fixed on the way: `goalProgressMilli` divided a rating hold's
  DAYS by its RATING, so the bar read one sixth full on the day the goal
  was met.

### M17 acceptance pass - four honesty defects, no save bump (D-197)

Independent verifiers found four claims that were not true. None was a
crash or a desync; every one was a sentence somebody would read and
believe with nothing holding it to the code. Read D-197 before touching a
briefing, a "quarter century" test or a score constant.

- **A briefing may not describe a world the seed does not make.** The
  Passagiernetz briefing promised eight cities of 8,000 and seed 10 has
  seven. The seed moved (to **360**: eight cities, seventeen towns at
  2,500 - out of four hundred scanned seeds exactly three carry eight),
  because the scenario's identity is the network between big towns. Then
  all eight were generated and audited, and four more figures were wrong -
  Frachtrausch's mine-to-plant distances are 57/59/70/106, and three
  population claims were out by exactly ONE GAME YEAR (`endOfYear(Y)` is
  the year running OUT: 10,574, not 10,465). **The deliverable is
  `SCENARIO_WORLD_CLAIMS`** in `tests/unit/shippedScenarios.spec.ts`: every
  briefing-bearing world property of every scenario, pinned EXACTLY, so a
  ninth scenario without a row is a red build.
- **A test named "25 years" simulates 25 years.** `goals.spec.ts` and
  `gameScore.spec.ts` both started in 1953 and ran to
  `25 * TICKS_PER_YEAR` - twenty-two years. They run 1953-1978 now. A 1950
  start is not the answer: only the wood haul has a 1950 lorry, and three
  years of uncollected planks shut the sawmill under D-086's closure clock
  (measured, and written down so nobody retries it).
- **A constant may not be validated by the run it came from.**
  `SCORE_NETWORK_FULL_SHARE` was set from the wood chain's 20.1 %, and the
  band then checked properties that follow from that arithmetic. A second
  quarter century - identical fleet, doglegged alignment, identical
  ceiling by construction - reaches 7.8 % (factor 2.55). The test states
  which half is calibration and which is evidence.
- **A world that can be created must be a world that can be saved.**
  `World.create` took any `mapSize`; `parseWorldState` took powers of two
  between 64 and 2048. One rule now (`src/sim/map/size.ts`), imported by
  both ends, applied in the private `World` constructor every door passes
  through; `tests/unit/mapSize.spec.ts` holds the AGREEMENT, not either
  half. Turning the check on found three fixtures that had been building
  unsaveable worlds for milestones (96, 96 and 16 tiles) - they moved to
  128, 128 and 64 and pass unaltered.

### M17 acceptance pass 2 - the briefing bound to the claims (D-198)

The verifier who confirmed every figure in `SCENARIO_WORLD_CLAIMS` then
defeated the guard: he planted the lie in the player-facing GERMAN BRIEFING
("Acht Grossstaedte zu je 8.000 Einwohnern und siebzehn Orte ab 2.500" ->
"Neun ... 9.000 ... vierzig"), left the claims table alone, and the suite
stayed green. Nothing in the repository read a briefing's CONTENT - the
assertions were non-empty, under the length cap, and de !== en.

- **Every number a briefing says out loud is read back**
  (`SCENARIO_BRIEFING_FIGURES`, same file). Each numeral, in reading order, is
  either PINNED - resolved out of the claims table, the scenario's own rules
  and goals, or a constant - or on an eight-entry allowlist with the reason no
  world property can justify it (a SPEC section number, a calibration
  measurement, the fleet a measurement used). Both locales are held to the
  same list, so a figure that moves in one language and not the other is red
  too. Spelled-out numerals are extracted in both languages because that is
  how the lie was written; `ein`/`one` and ordinals are deliberately not
  numerals, and a numeral word the table has never seen is a red build rather
  than an invisible claim. **The falsification was planted in the real source,
  the red build watched, and reverted** - and a meta-test keeps a copy.
- **Deriving the numbers INTO the prose was the other honest design and was
  refused**: it would have to generate German and English agreement from bare
  numbers, and it would STILL need this scanner underneath to prove no literal
  numeral had been typed in beside a placeholder.
- **A set inside a set is never stated as if it stood beside it.** "Acht
  Grossstaedte ... und siebzehn Orte" was true and read as 8 + 17 = 25; the map
  has forty towns, seventeen at 2,500+, eight of THOSE at 8,000. Both locales
  say so now, the claims table pins `townsTotal` and the ordering
  cities <= towns <= total, and the other seven briefings were read for the
  same defect (none has it).
- **Three claim types grew.** `CorridorClaim` addresses industries as well as
  towns - Frachtrausch's four mine-to-plant corridors were inexpressible, and
  "three of the four are nearest to the plant at 155,112" was wrong by one (all
  four are); `townLandmassTiles` binds a town to its island BY ID, which the
  sorted sizes never did; `passiveGrowth` PLAYS the four temperate and two
  desert population figures the catalogue quotes instead of quoting them - the
  desert one on Ueberleben's seed with its competitors removed, because
  "unserved" is not a property a world with four builders can be asked about,
  and the claim says so.
- **The map-size refusal now comes from the door the game uses.**
  `World.create({ mapSize: 32 })` answered "No playable map found for seed 7
  after 20 attempts": mapgen ran BEFORE the size check, and the old test only
  went in through `fromGenerated`. The size is refused first now, and the test
  goes through `create` on every refused size.

### M17 acceptance pass 3 - the names beside the numbers (D-199)

The same verifier defeated the numeral guard twice more: a briefing's PLACE
NAMES were bound to nothing (Rosenburg -> Rosenheim, Ahorngrund -> Ahornthal in
the German briefing alone, English left true, build green), and the catalogue's
DOC COMMENTS are read back by nothing at all. One was closed, one was refused
with a measurement. Read D-199 before touching a briefing or that table.

- **A place name in shipped TEXT is a town of that scenario's world.**
  `tests/unit/briefingPlaceNames.ts` builds its pattern out of the map
  generator's own exported syllable tables - a name is exactly `Root + Suffix`,
  optionally behind `Prefix-` - so the audit widens the day the generator does
  (the D-174/D-183 shape). `WorldClaim.briefingTowns` declares the ids a
  briefing names IN READING ORDER, both locales against the one sequence: an
  invented name that the generator COULD have made is extracted and rejected, one
  it could not have made drops the declared name and shortens the list, two real
  towns swapped fail on order, and an addition fails on length. Captions are
  compared as a SET against the towns their own DESCRIPTOR addresses - no
  declaration, and word order stays the translator's. Both falsifications were
  planted in the real source and the red build watched.
- **The audit reads text a PLAYER sees; doc comments are a named residual.**
  Measured before it was refused: the eight scenario comments plus the catalogue
  header carry 236 numerals against the briefings' 58, and they are not one kind
  of claim - 10 decision references, 6 coordinate pairs the extractor reads as
  ONE number and the wrong one, some fifteen measurements taken in OTHER
  worlds, the seed-scan provenance, and figures the comments quote BECAUSE they
  are false (the header narrates D-198's falsification; Frachtrausch records that
  "three of the four" was wrong by one). Pinning that would need an allowlist of
  over a hundred, and the allowlist discipline that makes the briefing audit
  worth having could not survive it. What holds a doc comment is the claims table
  beside it.
- **Two figures that rested on nothing are pinned** (both measured true, so this
  is durability): Gebirgslogistik's "spans heights 2 to 13" (`CorridorClaim.heights`
  - the table pinned only the difference, which would have held from 5 to 16),
  and Frachtrausch's "57 from 155,112 against 66 from 148,83" (the mine joined
  `industriesAt`, the comparison is a fifth corridor at 65.8 tiles). Every new
  pin was perturbed and the red build watched, one at a time.
- **The documented insertion hole is closed for four words and refused for
  three.** Dutzend, Handvoll, dozen and handful are SUSPICIOUS (`NUMERAL_SHAPED`)
  and deliberately carry no value - a briefing that wants a quantity writes the
  figure. Paar, couple and score are refused with their reasons, as green test
  cases: "Staedtepaar" is in a shipped briefing today, and "score" is this
  project's own end-screen noun.
- **Two documentation overclaims are gone.** The claims table said it held "each
  scenario's briefing AND DOC COMMENT" and `catalog.ts` said "every load-bearing
  claim each entry makes"; both now say exactly what holds, with the residual
  named.

## M18 - weather and seasons as world rules

The environment becomes simulation reality (SPEC2 E-01). ONE save bump
(v28 -> v29, owned by the weather rule and its field, and never extended
after it); ONE snapshot-layout bump (9 -> 10, the weather block); zero atlas
cells. The milestone is complete, and its balance band is the one thing in
it that reads differently from the specification: measured **4.36 %**
against SPEC2's 8-15 %, banded 3-7 % with the trace (D-204, the D-158
precedent; D-203 is superseded - it banded the same sentence on a build
that still carried the defect it blamed). Read D-204 before touching a
weather constant.

### Bundle 1 - the rule, the field and the daily draw (D-200)

- **`weather` is a world rule, off/mild/harsh, saved and hashed
  unconditionally** (D-200). D-110's split for the fourth time, and OFF
  unless the world was started with it: every band this game owns was
  measured without weather, so a default of on would re-band the lot inside
  the milestone that introduces the rule (Fehlerkatalog 34). All eight
  shipped scenarios state `weather: Off` explicitly rather than defaulting.
- **With the rule off the subsystem is provably inert.** `updateWeather`
  returns on its first line - no draw, no stream constructed, no cell
  written - so the field stays all-clear for ever and the snapshot
  publishes a count of ZERO rather than 256 clear cells. Measured: 0.18 B
  allocated per game day with the rule off, 136 B with it on.
- **The field is 16x16 REGIONS, saved and hashed, never derived.** Fixed
  256 bytes on every map size (law #7), not a second tile layer; a field
  rebuilt on load would give a loaded world a different sky from the saved
  one, which is law #3 broken in the silence Z4 was written about.
  `weatherRegionOf` is the one place the grid meets the map.
- **The daily pass draws from the named weather stream, never
  `world.rng`** (Z3): salt = `streamSalt('weather')` folded with the game
  day, one draw per region per day whatever the field holds. An off world
  and a harsh world played a game month reach the IDENTICAL gameplay RNG
  state, so switching the rule on cannot move a breakdown roll - which is
  what the next bundle's threshold shifts need.
- **Persistence, a neighbour pull and a season gate, one draw per region.**
  The gate multiplies BEFORE the persistence bonus, which is why there is
  no frost in July as a property rather than as an unlikely event. The
  weight table was chosen by looking at the distribution it produces and
  `weather.spec.ts` says so: its share bands are a READ-BACK, the front
  comparison, the July frost, the two-run identity and the stream
  separation are the evidence.
- **Every pin moved once, and the corpus is the proof nothing else did.**
  Canonical cross-OS `4dff3f3f216385e6` -> **`5a2a6cf73f4107bb`**, corpus
  manifest `f1dcab2a374ab728` -> **`c0a021f5d1ee8619`**, soak
  `ed8ac72cd1d6284d` -> **`e6c5e33d8e7607ec`** at unchanged 698 commands.
  All eight corpus fixtures - seven written by seven earlier builds and
  untouched on disk - still decode to ONE world.

### Bundle 2 - what the sky costs, and the seasons (D-201)

Four multiplier lookups at seams that already existed, plus a season that
is a pure calendar function. **No save bump, no migration edit, no
snapshot byte, no atlas cell, no new i18n string** - a multiplier at a
seam carries no state, and every pin held: canonical `5a2a6cf73f4107bb`,
corpus `c0a021f5d1ee8619`, soak `e6c5e33d8e7607ec` at 698 commands, and
scenario 5 back at D-158's 1,119,720 EUR to the cent.

- **The gate is the RULE and never the FIELD** (D-201).
  `weather/effects.ts` is the only file outside `updateWeather` that knows
  a world has weather, and every function in it answers with the exact
  identity on its first line when the rule is off. Every factor table is
  exactly 1 at `Clear`, and each factor was inserted immediately beside
  the coefficient it modifies, so an off world reproduces the pre-M18
  multiplication SEQUENCE term for term rather than merely its value. A
  test nails a sky of storms over an off world and plays 2,000 ticks
  against a clear twin: same generator, same cash, same tiles, same
  speeds.
- **The four seams and there is no fifth**: `ROLLING_RESISTANCE_*` and
  `DRAG_*` in the longitudinal solver, the 11.3 breakdown threshold,
  `CARGO_EXPIRY_FRACTION_PER_DAY` under heat (the other four skies are
  exactly 1 there, and a test holds them), and the 7.3 monthly output of a
  farm and a forestry.
- **The breakdown roll moves its THRESHOLD and never its draw** (Z3).
  `rollBreakdowns` takes one `nextFloat` per eligible vehicle per game day
  BEFORE the sky is consulted; the sky only multiplies what it is compared
  against. Instrumented, not argued: the test shadows `Rng.nextUint32` and
  counts, so 512 perfectly reliable vehicles draw exactly 512 words under
  all five skies AND leave the generator in the identical state, and a
  worn fleet draws exactly `512 + breakdowns` under every one - **the draw
  count is a function of the outcomes and of nothing else**. Measured
  breakdowns on identical draws: clear 69, rain 83, storm 109, frost 124,
  heat 105.
- **The season is a pure function of (month, height, climate)**; the rule
  decides only whether the SIMULATION consults it (`seasons.ts` knows
  nothing of `World`, so the renderer can read it for the snow line under
  Z1). Winter friction is total by construction - inside [1, 1.2] for
  every month, height and climate, walked in full. The harvest tables are
  integer percent summing to exactly 1,200 and the transform is affine
  around 1, so height and climate change the SHAPE of a farm's year and
  never its total. Tropical is an exact zero in both climate tables.
- **The M18 balance band is deliberately not claimed here.** No constant
  was tuned towards "a hard winter costs 8-15 %"; the tables were chosen
  for the ratios they state, and the band belongs with the scenario that
  will measure it (D-197's rule).

### Bundle 3 - the seasonal optics, in the same release as the authority (D-202)

Render-only but for one line of news. **No save bump, no migration edit,
no snapshot byte, no atlas cell**, and every pin held on a re-run:
canonical `5a2a6cf73f4107bb`, corpus `c0a021f5d1ee8619`, soak
`e6c5e33d8e7607ec` at 698 commands, scenario 5 at D-158's
1,119,720 EUR.

- **The snow line is `winterFrictionFactor` read backwards** (D-202, the
  D-172 device one milestone on): `snowLineFor` carries no table, it asks
  the solver's own winter severity at which height it crosses
  `SNOW_LINE_SEVERITY`. Snow therefore lies exactly where the ground has
  gone hard, and the test walks that agreement over every climate, month
  and height. Measured: temperate January 10, Feb/Dec 13, nothing else;
  arctic January at the shore; desert and tropical never. Zero atlas
  cells - a tile above the line draws the `Terrain.Snow` cell the game
  has had since M1, and the substitution rides the frame KEY so sprite
  path and chunk bake cannot disagree.
- **The regeneration repaints what the season MOVED and nothing else.**
  Four of ten terrain rows have a season in them; rock, sand, snow, shore
  and pavement do not. `terrainLook(t, Summer)` IS the base palette, so a
  freshly built page is the summer stage and needs no special case.
  Measured in a real browser (the atlas needs a canvas): a whole
  regeneration over BOTH pages p50 1.35-3.34 ms against the 30 ms of
  SPEC2 6.2, and against 11.94 ms to rebuild both pages. Two steps a
  frame, p50 0.125/0.155 ms per step, and neither canvas is uploaded
  until the last step - the work is spread, the swap is atomic.
- **The debounce protects the scrub, not the month**: at 20x a game month
  is fifteen REAL seconds, so the calendar can never ask twice a second.
  A replay scrub, a load and a new game can, and the latest pending look
  wins when the window opens.
- **A chunk remembers its season like its water row** (D-164's device).
  One staggered loop, two budgets. Measured: 17 chunks in a 1920x1080
  viewport at 0.5x, one bake p50 0.470 ms, so a season rolls over the
  viewport in nine frames. A water swap carries the emissive twin
  through; a SEASON rebake must re-render it, because the town cells and
  their twins were repainted together.
- **"Emissive im selben Pass" is one function call**: the six window-only
  twins are repainted inside the same `repaintSeasonJob` call as the six
  town cells, from the same `drawTownBuilding` - D-172's "by
  construction" restated. The season snows the three roofs that already
  take an explicit colour; the commercial block's flat top is `box`'s own
  shading and is left alone, stated rather than discovered.
- **Rain and snow are the published field plus the blink counter and
  nothing else.** Sixteen hashed attempts a frame; each asks its tile's
  region through `weatherRegionOf` (the one place the grid meets the map)
  and its own height against the snow line, so a front rains in the
  valley and snows on the ridge in one frame. Frost snows at any height.
  **They SHARE the M13 cap and are spawned LAST** (D-174): measured 820
  live drops at p50 0.173 ms in a storm over an idle world, and ZERO
  weather rows in the M13 overload scene under the same storm - the
  plumes hold the cap and the rain is what is refused. The pool grew one
  column (`stretch`) so a drop can be a streak.
- **The storm warning is edge-triggered, filtered and canonical**:
  `updateWeather` records ARRIVALS in the pass that holds both days;
  `reportWeather` posts one entry per arriving region the player has a
  station in, keyed by the lowest-id station there. Its own
  `NewsCategory.Weather` (count 5 -> 6, ticker by default). A world with
  the rule off never writes one and `arrivalCount` is zero for ever.
- **One protocol field**: the climate, on the `ready` message - the
  season is a pure function of (month, height, climate) and the month
  already rides the snapshot.
- Measured: tick p50 1.702/1.554/1.650/1.542, p99 3.796/3.456/3.239/3.156
  ms over four runs against the M10 baseline 1.45/3.26 - the last two land
  below it and the four straddle it inside this machine's +-0.7 ms noise;
  the reference fleet runs the rule off. **Main bundle 927,719 -> 934,751 B and the budget is RAISED to
  950,000 B with that measurement beside it** (D-192; D-200/D-201 both
  said this bundle would book it).
- **Not measured, and it says so**: MapView's frame loop needs a GPU and
  a compositor and has never been headless (D-136). The atlas
  regeneration was measured in a real browser; the scheduler around it is
  held by the type checker, the pure halves' tests and a perf proxy that
  replays the weather spawn loop literally.

### Bundle 4 - the band, measured, and re-banded with the trace (D-203)

The milestone's own balance band, and the only bundle here that changed no
file under `src/` at all: a scenario, a shared fixture, a registry row and
documentation. No bump, no migration edit, no snapshot byte, no protocol
field, no atlas cell, no i18n string; every pin re-verified by running.

- **The reference coal line is now ONE object** (`tests/balance/coalLine.ts`).
  Scenario 2 and the winter band both build it; the only thing a caller may
  vary is the weather rule and the seed. Two hand-built copies would have been
  two railways within a game year of the first edit, and the second file's
  band would have quietly stopped being about the line the first one pins.
  Scenario 2's own figures are unchanged by the extraction and were re-run to
  prove it (investment 249,980 EUR, payback year 6, the same nine balances).
- **The band is an ENSEMBLE because one coal train is chaotic.** The weather
  moves a THRESHOLD and never a draw, so both arms take the same numbers out
  of the gameplay stream and start getting different OUTCOMES from the first
  frosty morning; with the rule off, seed 9 alone swings 45-75 k EUR from year
  to year against an effect of a twentieth. Six seeds, both arms, nine years,
  and the per-seed spread (3.33-8.15 %) is printed as the error bar.
- **Measured: 3,510,797 EUR of freight without weather against 3,336,995 with
  it, -4.95 %** - and winter-loaded on two instruments that are NOT the band
  (breakdowns +29.2 % in Dec/Jan/Feb against +12.9 % in the other nine months;
  mean speed while moving -4.87 % against -3.00 %). No seed earns more in the
  weather than without it.
- **Which seam has the reach**, measured by neutralising one at a time: the
  breakdown threshold ~4.4 points of the 4.95, the two solver seams ~2.1, the
  winter friction ~0.9, the heat expiry ~0.6 (the parts exceed the whole
  because they compete for the same lost time on the same chaotic line - the
  table settles the ORDER). The solver seams are bounded by physics rather
  than by a table: at 358 t loaded this train needs 7.0 kN of rolling and
  2.4 kN of drag against 43.2 kN of traction at its top speed, so a frosty
  January's extra 3.4 kN cannot slow the cruise by one metre per second - it
  costs the ramps, and the train is at top speed on only 16.1 % of its moving
  ticks.
- **The seams are not too weak: a permanent winter costs 26.4 %.** What is
  small is how much of the year the expensive sky owns - under the harsh rule
  frost holds 9.6 % of Dec/Jan/Feb region-days (3.1 % of the year), because
  its weight is 14 and never boosted while rain's 20 is multiplied by up to
  2.4 by the neighbour pull.
- **The route to 8-15 % was measured and refused**, and the refusal is the
  entry worth reading (D-203): frost weight 14 -> 90 makes 70 % of winter days
  frost and the effect 9.30 %. Refused for three reasons - and **the first of
  them was a DEFECT, which is what made this bundle's re-band inadmissible
  until bundle 5 fixed it** (see below). The other two stand: the constant
  would have been set FROM the run the band then validates (D-197's defect),
  and it changes what "harsh" MEANS everywhere to move one line's number.

### Bundle 5 - the sky gets a climate, and the band is re-measured (D-204)

D-203's re-band rested on a bug, so bundle 5 fixed the bug first and measured
second. Three files under `src/`, no bump, no migration edit, no snapshot byte,
no protocol field, no atlas cell, no i18n string - and every pin re-verified by
running.

- **The frost gate is the SEASON's own winter curve, read forwards** (D-204,
  the D-202 device inverted). M18 shipped two winter calendars: the season's
  climate-aware severity, and `WEATHER_FROST_SEASON`, a twelve-entry month
  table with no climate term at all. That table is deleted;
  `frostSeasonFactor(month, climate)` divides the ONE severity by
  `WEATHER_FROST_FULL_SEVERITY`, which is a temperate January's own severity
  computed from the two tables - so **a temperate January is EXACTLY
  unchanged** while the tropics become an exact zero (measured: zero frosty
  region-days over a harsh game year) and the arctic freezes harder AND longer
  (5.2 % of region-days against temperate 3.1 % and desert 0.8 %). Height is
  deliberately not a parameter: a weather cell covers a 16x16 REGION and is
  not a place, so the gate is read at `SEA_LEVEL` and the height half of the
  season goes on entering at the vehicle's tile and at the snow line. One
  hemisphere, verified rather than assumed - the latitude term is a monotone
  gradient inside a climate, never an equator.
- **Re-measured: 4.36 % against D-203's 4.95 %** on the identical off
  baseline, so the fix moved it 0.59 points DOWNWARD and **the gap to 8-15 %
  was never the tropics.** The band stays 3-7 % and now rests on a
  measurement. The channel decomposition was re-run and is sharper AND
  different: the breakdown threshold carries ~3.8 of the 4.36 points and
  everything else is inside the noise, with two channels measuring NEGATIVE -
  a chaotic one-train line reshuffles its year around which day a breakdown
  lands on, so D-203's four positive channels summing to eight were never
  separable. Ceiling unchanged in meaning: a permanent winter costs 25.24 %.
- **Two of M18's four seams are structurally inert on the reference line** -
  a coal mine is neither farm nor forestry, and coal does not perish - which
  is a property of the scenario and is now written down.
- **Heat is still climate-blind, and that is the named residual.** Frost could
  be fixed by REUSING a table; heat cannot - there is no summer term to reuse
  (`SEASON_CLIMATE_AMPLITUDE` is the harvest swing and is zero in the
  tropics, which would forbid a tropical heat wave), so giving heat a climate
  means inventing one. **M23's climate sets are where that booking belongs**,
  and the frost-weight sweep in D-203 is still the map for whoever raises the
  band there.
- Verified by running: canonical pin `5a2a6cf73f4107bb`, corpus
  `c0a021f5d1ee8619`, soak `e6c5e33d8e7607ec` at 698 commands, all eight
  scenarios hash-identical with their audits, scenario 2 at 249,980 EUR and
  payback year 6, scenario 5 at 1,119,720 EUR. Main bundle 934,926 ->
  **935,002 B** against the 950,000 B budget.

Measured (reference machine): bundle 1 tick p50 1.296 / p99 2.841 ms,
bundle 2 p50 1.613 / p99 2.934 ms, bundle 3 p50 1.702 / 1.554 / 1.650 /
1.542 and p99 3.796 / 3.456 / 3.239 / 3.156 over four runs, bundle 4
p50 1.531 / 1.508 and p99 3.006 / 3.225 over two, bundle 5 p50 1.431 /
1.548 / 1.449 and p99 3.108 / 3.890 / 2.768 over three, against the
M10 baseline
1.45 / 3.26 on a row that allows +0.15 - the reference fleet runs the
rule off throughout, and the ON-path per-vehicle cost (one array read,
two table reads, a `baseHeight`) is NOT measured on that fixture, which
D-201 says. **Main bundle 924,308 -> 926,473 -> 927,719 -> 934,751 ->
934,926 -> 935,002 B, and bundle 3 raised the budget 930,000 -> 950,000 B
with that measurement beside it** (D-192's rule, D-202): bundle 2's share
was five constant tables that reach the main chunk because the interface
imports `constants.ts`, bundle 3's is the two new render modules, the atlas
repaint and the MapView scheduler, bundle 4's 175 B are unexplained -
it changed no file under `src/`, and the discrepancy is written down
rather than smoothed away - and bundle 5's +76 B are the new pure function
and the derived constant, which cost a little more than the deleted
twelve-entry table saved.

## Still outstanding

- **The two named walls of D-158.** A passenger pile a fleet merely
  MATCHES pays the decay floor for ever - every town of 2,500+ pins its
  pile at the 2,000-unit cap even under the probe's sized fleets. And the
  rail/expansive personalities are solvent but stagnant: the rail review
  honestly closes a line whose economics sag in year three, and the
  company never rebuilds (thin offer, graveyard rule, a retry that could
  not afford its train). Both have their baseline traces in D-158.
- **Half the sky has a climate now; the other half does not** (D-204).
  Frost is fixed - `frostSeasonFactor` is the season's own climate-aware
  curve, the tropics are an exact zero and the arctic is harder and longer.
  **HEAT is still indexed by month alone**, so an arctic July can be a heat
  wave, and it could not be fixed the same way because the season has no
  summer term to reuse. **M23's climate sets are where that booking
  belongs.** Fixing frost did NOT close M18's band gap (4.95 % -> 4.36 %,
  the wrong way): what bounds the effect is the share of the year the
  expensive sky owns, and the frost-weight sweep in D-203 is still the map
  for raising it - honestly, in M23, not by tuning a constant here.
- **Undo and redo** (section 17.2). See D-114.
- The installer BUILDS: `npm run build:desktop` produced both bundles in about
  eight minutes, and Tauri fetched WiX and NSIS itself. Neither is signed, so
  Windows shows a SmartScreen warning on a machine that has not seen the binary
  before. Installing and playing it through is the acceptance step that is the
  user's to run.

## Drawing the world (after M9)

- **Shape, not tint** (D-117). Seventeen industries used to share one white box
  with a colour multiplied over it, which leaves only the hue as information.
  They are drawn in their own colours now, and what tells them apart is the
  outline: a headframe, a derrick, cooling towers, a north-light hall. The same
  argument gave the three town zones three shapes rather than three colours.
- The atlas cell has THREE height steps of headroom. It had one, and everything
  taller than a crate was silently cut off at the top.
- **`MapView` reads `anchorY`.** Where the ground sits inside an atlas cell used
  to be an unwritten agreement between two files, and it broke the moment the
  atlas grew.
- **A cargo nothing accepts is a dead end** (D-118). `tests/unit/deliveries.spec.ts`
  walks the whole chain table and asks who takes each output; it found that
  nobody took electronics. What a town accepts is EXPORTED from the simulation
  now, not copied into the interface.
- **The connect tool asks before it charges** (D-119) - the only build in the
  game that does. It plans with the same `planTrack` the command runs, so the
  price on screen and the price on the bill cannot disagree.
