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
  the test. The bus line scenario prints why it earns what it earns.

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

## M5 - industry chains

Industries produce, accept and transform cargo on the calendar, and the loop
closes back into town growth.

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

M4 and M5 were built before `SPEC.md` was in the repository, from the repo's own
record plus genre convention. Against the actual text they are **partial**. This
is the honest list, and it is work, not commentary.

**M4 (section 9 of SPEC.md).** Delivered: all four signal types, block
segmentation, path versus block claiming, one-way signals the pathfinder
respects, the deadlock clock, and the regression network of 19.5. Missing:

- **THE DEFECT (D-073), which is why M4 is not signed off.** A train's body is
  only exclusive where it has been granted a section, so two trains can still
  stack on unsignalled track - most reliably at a depot - and once stacked
  neither can ever claim again. The regression network reaches this state and
  therefore asserts only half its criterion. The fix is to make a train's body
  exclusive at all times, which changes unsignalled track for every existing
  test and needs the depot case taught explicitly.
- **Automatic signalling** when dragging a route (default every 12 tiles).
- **The F3 overlay showing block boundaries, occupancy and reservations.** F3
  currently shows the state hash only. The spec calls this overlay a *learning
  tool* and requires it in the release build. The block index it needs now
  exists and can be rebuilt on the main thread from the shared map buffer; the
  reservations would have to travel in the snapshot.
- **The deadlock WARNING.** The clock is recorded per train; nothing surfaces
  it yet, because there is no message log until M8.

**M5 (sections 7 and 10 of SPEC.md).** Delivered: production, the service gate,
the monthly level, acceptance, town demand, refit. Missing:

- **Cargo has no destination.** Section 7.4 is the heart of the milestone: a
  `CargoStack` carries `zielStationId`, every station keeps a connection table
  of reachable destinations and expected remaining times, and waiting cargo
  picks the vehicle that gets it there soonest - including via a transfer. None
  of that exists; cargo is currently taken by whoever stops.
- **The M5 acceptance case** - forest to sawmill to town with a lorry feeder
  onto a freight train, billed proportionally - therefore cannot be shown.
- **Industry closure**: 24 months without collection closes an industry, with
  warnings at 12 and 20 (D-069 records the cut; the spec asks for it).
- **Output store full drops production to 25 %** with a log warning. Production
  currently just stops.
- **Primary industries fluctuate** +/-25 % on a five-year sine from the LUT.
- **New industries appear** once per game year in under-served regions.
- **Station modules**: freight terminal, canopy and cold store all exist in the
  spec with concrete effects. Only stops, bays and depots are built.
- **The expansion rule differs**: spec is +10 % at 80 % collected over 12
  months; built is +25 points at 85 % with a 3-month dead band.
- **Production is booked in 30 daily slices, not once per month** as section 7.3
  requires. Defensible, but it is a departure and needs its own entry.

**The freight recalibration (D-066) rests on a test I invented**, not on the
mandated one. Section 19.4 makes balancing scenario 2 - coal mine to power
plant, 45 tiles, one train of eight wagons, payback in 4 to 7 game years - the
authority over exactly those numbers. Until that scenario exists, the freight
figures are a considered guess.

**Balancing scenarios still missing** (section 19.4): 2 (rail freight), 3 (full
chain, 80k-200k EUR a year), 4 (bankruptcy from doing nothing, year 6 to 9), 5
(AI company), 6 (mine closes after 24 months).

## Still outstanding

- The **minimap** (owed since M1) and **vehicle selection on the map** (M2).
- **Balancing scenarios 2, 3, 4 and 5** of section 19.4. The chain scenarios own
  the freight figures that M5 set by first draft.
- **Industry opening and closure** at runtime (D-069).
- The **industry panel**: production level and stock are simulated but nothing
  shows them.

Then M6 (water) onwards.
