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
npm test                 # everything
npm run test:unit
npm run test:determinism # must never be red
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

  Scenario 5 (an AI company alone on a 512 map) belongs to M8, which is where AI
  companies arrive.

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

Still open across both, and none of it is M4 or M5:

- **The news log** (section 15, due with M8). Until it exists, an industry's
  closure warning is visible only in the tile panel and a stuck train only in
  the fleet list and the F3 overlay.
- **A reversing train** ("Wendezug") in the regression network. The pathfinder
  refuses a 180 degree turn, so a train that runs round its own train is not
  something the simulation can express yet.

## Still outstanding

- The **minimap** (owed since M1) and **vehicle selection on the map** (M2).
- **Balancing scenarios 2, 3, 4 and 5** of section 19.4. The chain scenarios own
  the freight figures that M5 set by first draft.
- **Industry opening and closure** at runtime (D-069).
- The **industry panel**: production level and stock are simulated but nothing
  shows them.

Then M6 (water) onwards.
