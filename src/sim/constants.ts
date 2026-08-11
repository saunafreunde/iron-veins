/**
 * Every magic number of the simulation lives here, annotated with its unit and
 * where it comes from. Nothing outside this file may hard-code a game constant.
 */

// ---------------------------------------------------------------- world scale

/** Edge length of one map tile. [m] */
export const TILE_SIZE_M = 50;

/**
 * Ground distance of a diagonal step. Roads run orthogonally, but track has
 * eight directions, so half of a rail route's steps are this long rather than
 * one tile. Treating them as equal would make diagonal lines 41 % too fast.
 * [m]
 */
export const TILE_DIAGONAL_M = TILE_SIZE_M * Math.sqrt(2);

/** Vertical distance between two height levels. [m] */
export const HEIGHT_STEP_M = 8;

/** Number of distinct terrain height levels (0..15). */
export const HEIGHT_LEVELS = 16;

/** Highest usable height level. */
export const MAX_HEIGHT = HEIGHT_LEVELS - 1;

/**
 * Height level of the sea surface. Everything at or below it is water, so the
 * playable land occupies levels 4..15.
 */
export const SEA_LEVEL = 3;

/** Selectable map edge lengths in tiles. */
export const MAP_SIZES = [256, 512, 1024, 2048] as const;

/**
 * Smallest map edge length a world may HOLD, as opposed to be started with.
 * [tiles]
 *
 * The new-game screen offers `MAP_SIZES`; this is the wider rule the save
 * format enforces, and the balancing and unit fixtures live inside it (64 and
 * 128 tile worlds). Below it the layer lengths stop being meaningful and a
 * station catchment covers the whole map.
 */
export const MAP_SIZE_MIN = 64;

/**
 * Largest map edge length a world may hold. [tiles]
 *
 * 2048^2 tiles is four million, which is what the SharedArrayBuffer layout and
 * the section 21 budgets were measured against.
 */
export const MAP_SIZE_MAX = 2048;

/** Default map edge length - 1024 tiles is 51.2 x 51.2 km. */
export const DEFAULT_MAP_SIZE = 1024;

// ------------------------------------------------------------ map generation

/** Octaves of the base height noise. */
export const TERRAIN_NOISE_OCTAVES = 6;

/** Amplitude ratio between two successive octaves. */
export const TERRAIN_NOISE_PERSISTENCE = 0.5;

/** Frequency ratio between two successive octaves. */
export const TERRAIN_NOISE_LACUNARITY = 2.0;

/** Wavelength of the first octave, as a fraction of the map edge. */
export const TERRAIN_NOISE_BASE_WAVELENGTH = 0.35;

/**
 * Fraction of the map edge over which the height field fades into the sea, so
 * the playable area is bounded by ocean instead of running off the border.
 */
export const MAP_EDGE_FALLOFF = 0.12;

/** Thermal erosion passes applied to the raw height field. */
export const EROSION_PASSES = 40;

/** Steepest slope erosion leaves standing: one height level per tile. */
export const EROSION_TALUS = 1 / HEIGHT_LEVELS;

/** Fraction of the excess height moved downhill per erosion pass. */
export const EROSION_RATE = 0.5;

// -------------------------------------------------------------- climate

/**
 * One climate per game, chosen in the start menu - never mixed on one map.
 * A single map that contains arctic, desert and jungle at once reads as noise
 * and makes the industry chains impossible to reason about.
 */
export const MapClimate = {
  Temperate: 0,
  Arctic: 1,
  Tropical: 2,
  Desert: 3,
} as const;
export type MapClimate = (typeof MapClimate)[keyof typeof MapClimate];

/** Sea level temperature at the middle of the map, per climate. [degC] */
export const CLIMATE_BASE_TEMPERATURE_C: readonly number[] = [12, -6, 26, 24];

/** Temperature spread between the northern and southern map edge. [degC] */
export const CLIMATE_LATITUDE_RANGE_C: readonly number[] = [16, 12, 8, 10];

/** Shift applied to the moisture field, per climate. [0..1] */
export const CLIMATE_MOISTURE_BIAS: readonly number[] = [0, -0.05, 0.25, -0.35];

/** Temperature drop per height level. [degC] */
export const TEMPERATURE_LAPSE_C_PER_LEVEL = 1;

/** Wavelength of the moisture noise, as a fraction of the map edge. */
export const MOISTURE_NOISE_WAVELENGTH = 0.25;

export const MOISTURE_NOISE_OCTAVES = 4;

/** Biome thresholds, read top to bottom in climate.ts. */
export const SNOW_TEMPERATURE_C = 0;
export const ALPINE_TEMPERATURE_C = 5;
export const DESERT_TEMPERATURE_C = 26;
export const DESERT_MOISTURE_MAX = 0.35;
export const MARSH_MOISTURE_MIN = 0.78;
export const FOREST_MOISTURE_MIN = 0.55;
export const GRASS_MOISTURE_MIN = 0.32;

/** Height level above which bare rock and snow take over regardless of climate. */
export const ALPINE_HEIGHT = 13;

/** River sources per map, scaled between these bounds by map area. */
export const RIVER_SOURCES_MIN = 12;
export const RIVER_SOURCES_MAX = 25;

/** Lowest height level that may spawn a river source. */
export const RIVER_SOURCE_MIN_HEIGHT = 10;

/** Catchment thresholds at which a river widens to 2 and 3 tiles. */
export const RIVER_WIDTH_2_CATCHMENT = 3;
export const RIVER_WIDTH_3_CATCHMENT = 8;

/** One town per this many tiles, clamped to the bounds below. */
export const TILES_PER_TOWN = 7_500;
export const TOWN_COUNT_MIN = 40;
export const TOWN_COUNT_MAX = 140;

/** Poisson disc radius between two town centres. [tiles] */
export const TOWN_MIN_DISTANCE = 24;

/** A town centre may not sit on ground steeper than this. [height levels] */
export const TOWN_MAX_SLOPE = 1;

/** Share of cities / towns / villages, and their starting population. */
export const TOWN_SIZE_SHARES = [0.08, 0.25, 0.67] as const;
export const TOWN_START_POPULATION = [8_000, 2_500, 400] as const;

/**
 * Half width of the area a town CLAIMS per size class. [tiles]
 *
 * This is the "Stadtgebiet" of section 13.3 - what the council rates a company
 * on and what exclusive building rights cover - and it is deliberately larger
 * than the ground the town has actually built on. How far the STREETS reach is
 * derived from the buildings the town has to house (D-216), not from this
 * table.
 */
export const TOWN_START_RADIUS = [10, 6, 3] as const;

/**
 * Rings of slack added to the outermost ring that can still take a plot, when
 * the built-up half width is derived. [tiles]
 *
 * Origin: a plot's street lies at most one Chebyshev ring further out than the
 * plot itself, so exactly one ring closes the gap between "the last house" and
 * "the street it stands on". Anything larger puts back the empty outer blocks
 * D-216 exists to remove.
 */
export const TOWN_BUILT_RADIUS_MARGIN = 1;

/** Spacing of the main roads inside a town. [tiles] */
export const TOWN_MAIN_ROAD_SPACING_MIN = 6;
export const TOWN_MAIN_ROAD_SPACING_MAX = 9;

/** Steepest ground a town road may climb. [height levels per tile] */
export const TOWN_ROAD_MAX_SLOPE = 2;

/** One industry per this many tiles. */
export const TILES_PER_INDUSTRY = 6_000;

/** Minimum distance between two industries. [tiles] */
export const INDUSTRY_MIN_DISTANCE = 8;

/** A generated map must offer a starting pair of towns this far apart. [tiles] */
export const START_PAIR_MIN_DISTANCE = 20;
export const START_PAIR_MAX_DISTANCE = 60;

/** How many consecutive seeds are tried before generation gives up. */
export const MAPGEN_MAX_SEED_RETRIES = 20;

// ------------------------------------------------------------- terraforming

/**
 * Cost of moving one tile corner by one height level. Chosen so that levelling
 * a hill for a station costs noticeably less than routing around it, but
 * flattening a mountain range is never the cheap option.
 * [cent per corner per level]
 */
export const TERRAFORM_COST_PER_STEP_CT = 250 * 100;

/** Multiplier applied when the affected tile is rock. */
export const TERRAFORM_ROCK_SURCHARGE = 2.5;

/** Multiplier applied when the affected tile is water (reclamation). */
export const TERRAFORM_WATER_SURCHARGE = 4.0;

/**
 * Largest number of corners one terraform action may move.
 *
 * Because neighbouring corners must stay within one level of each other,
 * raising a corner on a hillside drags every corner further down the slope with
 * it - on a uniform hillside that chain runs to the bottom of the hill. Without
 * a cap a single click would relandscape a whole valley. 24 corners is roughly
 * a two tile radius: enough to smooth a bumpy building site, far too little to
 * move a mountain, and the player shapes larger areas by working outwards from
 * flat ground, which is how it reads in play anyway.
 *
 * The value is set so that raising one corner four levels out of flat ground
 * still works: that cone is 7 x 7 = 49 corners. A fifth level would need 81 and
 * is refused, as is any drag along a hillside - that spreads in two dimensions
 * and passes the cap after a handful of tiles.
 */
export const MAX_TERRAFORM_CORNERS = 60;

// ------------------------------------------------------------ simulation clock

/** Fixed simulation frequency. [Hz] */
export const TICK_HZ = 20;

/** Duration of one simulation tick in wall-clock milliseconds. [ms] */
export const TICK_MS = 1000 / TICK_HZ;

/** Duration of one simulation tick in seconds - the `dt` of all physics. [s] */
export const TICK_SECONDS = 1 / TICK_HZ;

/** One game day equals 10 s of real time at speed 1x. [ticks] */
export const TICKS_PER_DAY = 200;

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH; // 6_000
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR; // 72_000

/** First playable year. */
export const START_YEAR = 1950;

/** Last playable year (inclusive). */
export const END_YEAR = 2050;

/**
 * Highest tick the calendar can reach. 101 playable years fit into an Int32
 * with three orders of magnitude to spare, so `tick` stays a plain Int32
 * everywhere (snapshot buffer, save file, hash).
 */
export const MAX_TICK = (END_YEAR - START_YEAR + 1) * TICKS_PER_YEAR; // 7_272_000

/**
 * ---------------------------------------------------------------------------
 * TIME DECOUPLING - read this before touching anything time related.
 * ---------------------------------------------------------------------------
 * Vehicle motion and the calendar run on two different clocks, on purpose:
 *
 *  - TICK TIME (real time) drives vehicle physics, loading, signal reservations.
 *    A train at 160 km/h covers 44.4 m per real second, i.e. 2.22 m per tick.
 *  - GAME TIME (calendar) drives dates, vehicle age, industry production, town
 *    growth, financial reports, loan interest and cargo decay.
 *
 * Worked example, kept here because it is the number that makes the whole
 * economy intuitive:
 *   A 60 tile run is 60 * 50 m = 3_000 m.
 *   At 44.4 m/s that is 67.6 s of real time = 1_352 ticks = 6.8 game days.
 * That is why decay grace periods are measured in days rather than hours, and
 * why a 500 tile line is almost always economically worse than an 80 tile one.
 *
 * Moving vehicles on the calendar clock makes a train cross the map in a single
 * frame. Running the calendar on the tick clock makes a game year take eight
 * hours. Both are wrong.
 */

/** Selectable simulation speeds; index 0 is pause. [ticks per real second / TICK_HZ] */
export const SPEED_FACTORS = [0, 1, 2, 5, 20] as const;

/** Index into {@link SPEED_FACTORS} used when a fresh game starts. */
export const DEFAULT_SPEED_INDEX = 1;

/**
 * Hard ceiling on ticks executed inside one scheduler wake-up. Protects against
 * a spiral of death when the host stalls (tab throttling, breakpoint, swap).
 */
export const MAX_TICKS_PER_FRAME = 40;

/**
 * How often the world state hash is refreshed for the debug overlay. Hashing
 * touches the whole state, so it runs once per game day rather than per tick.
 */
export const STATE_HASH_INTERVAL_TICKS = TICKS_PER_DAY;

/**
 * Distance between two replay checkpoints: one game year (SPEC2 M16). [ticks]
 *
 * One year is the cadence SPEC2 names, and it is the one the three purposes of
 * the ring agree on: a scrubber jumps by years, tail verification wants the
 * newest one, and log compaction trims whole years off the command log. Tick 0
 * satisfies it too, which is what makes the genesis of a game a checkpoint
 * like any other rather than a special case.
 */
export const CHECKPOINT_INTERVAL_TICKS = TICKS_PER_YEAR; // 72_000

/**
 * How many checkpoints a ring keeps, the base one included. [checkpoints]
 *
 * A checkpoint is a whole world state, so the ring is priced in save files:
 * measured on the 25-year AI game (256 map) one compressed payload is 25-40 kB,
 * and on the 1024 reference world it is the size of that world's save, ~190 kB.
 * Sixteen therefore costs ~0.6 MB there and ~3 MB on the biggest world the game
 * ships - a bounded price for sixteen game years of instant scrubbing, against
 * an unbounded one for keeping every year of a century.
 *
 * The oldest entry is never evicted (see `CheckpointRing`): it is the tick the
 * retained command log starts from, and dropping it would orphan every command
 * before the second checkpoint.
 */
export const CHECKPOINT_RING_CAPACITY = 16;

// ------------------------------------------------------------------- money

/** All monetary amounts are integer cents (law #5). */
export const CENTS_PER_EURO = 100;

export const Difficulty = {
  Easy: 0,
  Normal: 1,
  Hard: 2,
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Starting capital per difficulty. [cent] */
export const START_CAPITAL_CT: readonly number[] = [
  800_000 * CENTS_PER_EURO,
  500_000 * CENTS_PER_EURO,
  250_000 * CENTS_PER_EURO,
];

// -------------------------------------------------------------------- loans

/** Credit line floor - available even to a company with no profit and no assets. [cent] */
export const LOAN_MIN_LIMIT_CT = 300_000 * CENTS_PER_EURO;

/** Absolute credit ceiling regardless of company size. [cent] */
export const LOAN_MAX_LIMIT_CT = 30_000_000 * CENTS_PER_EURO;

/** Loans are granted in 10_000 EUR steps so the UI stays readable. [cent] */
export const LOAN_STEP_CT = 10_000 * CENTS_PER_EURO;

/** Credit line grows with 2.5x the annual profit ... */
export const LOAN_LIMIT_PROFIT_FACTOR = 2.5;

/** ... plus 0.3x the book value of the fixed assets. */
export const LOAN_LIMIT_ASSET_FACTOR = 0.3;

/**
 * Bankruptcy, per section 14.2: three months in the red is a warning, twelve
 * is a forced auction of the fleet and the end of the game. [months]
 *
 * The gap between the two is the point. A company that has one bad winter gets
 * a year to trade out of it; one that never does is wound up, and the fleet is
 * sold rather than vanishing, so the player can see what it was worth.
 */
export const BANKRUPTCY_WARNING_MONTHS = 3;
export const BANKRUPTCY_MONTHS = 12;

/** Nominal annual interest rate per difficulty, booked monthly. [1/year] */
export const LOAN_INTEREST_RATE_PER_YEAR: readonly number[] = [0.04, 0.04, 0.065];

// ------------------------------------------------------------------- energy

/**
 * What a megajoule of USEFUL work costs, by energy carrier (section 14.1).
 *
 * Indexed by PowerSource. The figure is the price of the fuel divided by how
 * much of it reaches the drawbar, so the two effects the account exists to show
 * are folded into one number: a steam locomotive turns about eight percent of
 * what it burns into work and an electric one about ninety, which is why
 * electrification is worth paying for and why it is the whole point of having
 * this account at all.
 *
 * The absolute level is set by balancing scenario 2, which is the authority
 * section 19.4 names: the first draft of these numbers put the coal line at the
 * very edge of its payback band with nothing to spare. The RATIOS between them
 * are the part that is not negotiable - steam dearest, then hydrogen, diesel,
 * battery, electric - because those are what make electrification worth paying
 * for, which is the whole reason the account exists.
 * [cent per megajoule of work at the drawbar]
 */
export const ENERGY_COST_CT_PER_MJ: readonly number[] = [
  170, // steam: cheap coal, dreadful efficiency
  62, // diesel
  25, // electric
  92, // hydrogen
  36, // battery
];

// ------------------------------------------------------------------ AI (15)

/**
 * How often a competitor thinks, in ticks (section 15).
 *
 * Twenty seconds of real time at normal speed. Fast enough that a company
 * reacts inside a game month, slow enough that five of them cost nothing
 * measurable per tick.
 */
export const AI_DECISION_INTERVAL_TICKS = 400;

/**
 * Shortest haul a competitor will consider. [tiles]
 *
 * SPEC.md section 15 names 15, and it is not only a spec figure: a station's
 * catchment is `STATION_CATCHMENT_SCAN_RADIUS` tiles across, so two stops much
 * closer than this serve the same buildings and the line carries its own
 * passengers in a circle.
 */
export const AI_MIN_DISTANCE = 15;

/**
 * Longest haul a competitor will consider. [tiles]
 *
 * SPEC.md section 15 - "Alle Paare (Quelle, Senke) mit Distanz 15-120 Tiles" -
 * and that IS its origin: it is a spec figure, written when the opportunity
 * list had no profitability test at all, so the distance window WAS the test.
 * D-221 built the real one, which makes this a proxy standing beside the
 * instrument it stood in for. **D-222 measured raising it and did not ship
 * it**, and the measurement is recorded here so the next pass starts from it
 * rather than from the idea:
 *
 *  - What the window costs. Over the eight sweep seeds at game start on 256
 *    maps, of the 51 (source, sink) pairs whose sink accepts what the source
 *    makes, **21 are further apart than 120 tiles**; the per-seed median
 *    accepting pair is 33-168. Opening the window alone takes the industry
 *    offer from 5 paying road candidates to 14 and 5 rail to 6 - everything
 *    else refused by the profit floor and the drain gate, not by distance -
 *    and on three seeds the pair it refused was the only industrial business
 *    on the map. It also bounds `onwardLegExists`, so it kills complete chains
 *    whose NEXT leg is beyond it (seed 4712: IronOre->SteelMill at 83 tiles,
 *    refused because SteelMill->MachineFactory is 163).
 *  - Where an honest window would sit. The game's own **economic horizon** -
 *    the longest haul at which `projectLine` can clear AI_MIN_PROFIT_MARGIN
 *    for ANY cargo, swept tile by tile over all twenty cargoes, both modes,
 *    five source sizes and six decades of catalogue - is **233 tiles** (gravel
 *    by road, 1970 catalogue on; 206 in 1950).
 *  - Why it is still 120. At 240 the balance suite refuses it: scenario 5's
 *    road company falls **1,022,084 -> 797,873 EUR**, 0.27 % under D-158's
 *    measured floor, and stops compounding through its year-21 renewal - not
 *    through any mechanism in its own line, but because the rail company on
 *    the same 512 map now competes for the same ground. The bands own the
 *    constants (D-087), and this one says no.
 *
 * Two things that were tried on the way and are NOT the answer, so nobody
 * spends the day again: charging `rate`'s ranking the honest transit decay
 * (D-122's reverted term, retried because D-221 separated ranking from the
 * build decision so a uniform depression can no longer stop a build) changed
 * scenario 5 by **not one cent** - the order really does not move; and
 * relaxing AI_MIN_ARRIVAL_FACTOR is pointless, see that constant.
 */
export const AI_MAX_DISTANCE = 120;

/**
 * Capital a competitor wants before it builds, as a multiple of the estimate.
 * Section 15 names 1.4; the personalities move it either way.
 */
export const AI_BUILD_CAPITAL_FACTOR = 1.4;

/**
 * How far down the ranked opportunity list one cycle will look.
 *
 * Deep, and that matters more than it sounds. The list is sorted by return per
 * euro, not by price, so the best entries are routinely the ones a small
 * company cannot afford yet - and a competitor that gave up after the first
 * eight sat on a hundred thousand pounds for twenty-four years while a hundred
 * cheaper opportunities went past (measured; balancing scenario 5).
 */
export const AI_CANDIDATES_TRIED = 60;

/**
 * Lines one competitor will run at once.
 *
 * Twenty-five years is long enough to build a network, and section 19.4's
 * fifth scenario expects one: a company capped at six lines cannot reach the
 * value that scenario asks for however well each line runs.
 */
export const AI_MAX_LINES = 20;

/**
 * Densest service a competitor SIZES a fleet for: one departure per game day.
 * [ticks]
 *
 * The AI sizes a fleet with the 12.3 advisor - `ceil(round / interval)` - and
 * the interval it feeds in is how often a vehicle planned AI_TAKT_UTILISATION
 * full must leave to lift what the source makes in a month
 * (`load * utilisation * TICKS_PER_MONTH / output`). A very large source
 * would push that interval towards zero and the formula towards an unbounded
 * fleet; a departure a day is where the floor sits, because a cadence below
 * one day buys rating-frequency nothing (the rating window of section 10.2
 * is measured in days) and the station pile is capped anyway. The interval
 * sizes the FLEET only - the takt the line then runs is the fleet's own
 * spacing (see fleetFor in ai/ai.ts), never this figure.
 */
export const AI_SERVICE_INTERVAL_MIN_TICKS = TICKS_PER_DAY;

/**
 * Share of a load's value that must survive the DRIVE for a pair to be
 * offered at all: `timeFactor(cargo, one-way days at nominal speed) >= 0.5`.
 *
 * A feasibility gate, not a pricing term. D-122 tried charging the revenue
 * ESTIMATE for transit decay and reverted it - the term depressed every
 * candidate instead of reordering them - and that stands. This gate is
 * different: it removes only the pairs where even a FRESH load arrives with
 * most of its value gone, which no ranking should ever see. Measured on the
 * scenario-5 trace (512 map, seed 4711): the road company's top candidate
 * was a 123-tile grain haul - 44 days one-way against grain's 14-day grace,
 * arrival factor 0.46 - and every vehicle put on it earned the 10 % floor
 * while the estimate had quoted it fresh.
 *
 * **Since D-221 the FRESH half of this gate refuses nothing, and D-222
 * measured it rather than assuming it**: over the eight sweep seeds at game
 * start, industry pairs and town pairs, road and rail, with the distance
 * window both at 120 and lifted, the candidate list is IDENTICAL with
 * `arrivesAlive` on and off - every pair it drops the profitability floor
 * drops too, because `projectLine` charges the real transit decay properly.
 * It stays because it is a cheap early-out in front of an expensive
 * projection, and because it is the gate that keeps a pair out of the RANKING
 * where D-122 forbids the same term. What it is NOT is the reason the industry
 * personalities see an empty list: on the eight seeds the fresh gate drops
 * **zero** industry pairs. The survivors are dropped by the STALE branch of
 * the rot gate below (a farm making 307 units a month against six lorries at
 * sixty-five tiles - that refusal is correct) and by the floor.
 */
export const AI_MIN_ARRIVAL_FACTOR = 0.5;

/**
 * Share of a town's inhabitants a competitor assumes it could carry in a month.
 *
 * It used to be a "generous on purpose" 0.5 - fine while the figure only
 * RANKED pairs, wrong the moment stage C2 made it SIZE fleets and GATE pairs:
 * a town really deposits `PASSENGERS_PER_INHABITANT_PER_MONTH` (0.35) times
 * the station-rating share (about half on a decently served stop), roughly
 * 0.18 per inhabitant - so the old figure overstated every town's traffic
 * close to threefold, over-fleeted every bus line and let the lift gate pass
 * towns whose real queue the fleet could never drain. This is the honest
 * expectation, and the two constants it is derived from are named above.
 */
export const AI_TOWN_OUTPUT_SHARE = 0.18;

/**
 * Share of a departure's capacity the AI plans to FILL when it sizes a
 * fleet. [share, 0..1]
 *
 * Not 1.0, deliberately. A fleet sized so that the deposits between two
 * departures exactly fill the vehicle leaves no room to eat a backlog: the
 * pile that built up while the line was under construction is then recycled
 * for ever, and oldest-first keeps every load a month stale at the 10 % floor
 * (measured on the scenario-5 trace - matched lift, permanent floor). Half a
 * vehicle of headroom per departure is what balancing scenario 1's own
 * healthy line runs at: its buses leave with deposits-per-visit around a
 * third of capacity, drain the pile whole at every call, and earn near the
 * fresh rate - the calibrated profile this figure copies. A SIZING headroom
 * only: it doubles the fleet the demand interval asks for, and it must never
 * discount what a fleet can physically lift (the rot gate in ai/evaluate.ts
 * learned that the measured way).
 */
export const AI_TAKT_UTILISATION = 0.5;

/**
 * What a competitor assumes its train and its lorry cost, for the ESTIMATE.
 *
 * Rough figures rather than a catalogue lookup: the estimate ranks pairs and
 * does not have to be right, it has to be right about which is better. What it
 * cannot do is leave them out - the vehicles and the stops are the same money
 * on a fifteen tile line as on a sixty tile one, and pretending a line costs
 * only its rails sent a competitor to build the shortest thing on the map.
 * [cent]
 */
export const AI_TRAIN_PRICE_CT = 220_000 * CENTS_PER_EURO;
export const AI_LORRY_PRICE_CT = 30_000 * CENTS_PER_EURO;

/** Line speed a competitor assumes when it estimates a line's throughput. [m/s] */
export const AI_NOMINAL_SPEED_MS = 14;

/**
 * Tiles a vehicle covers in a game MONTH, derived rather than guessed.
 *
 * This is the two-clocks trap of section 5.2 walking straight into the AI's own
 * arithmetic. Vehicles move on the TICK clock: a month is 6000 ticks, a tick is
 * fifty milliseconds, so a month is three hundred seconds of driving - and at
 * fourteen metres a second that is 4200 metres, or eighty-four tiles.
 *
 * It was 1200, a figure that can only come from reckoning the month in CALENDAR
 * hours. Fourteen times too high, and it was the whole reason a competitor
 * preferred lines eighty tiles long: the estimate credited them with seven
 * round trips a month where one train manages one every other month.
 */
export const AI_TILES_PER_MONTH =
  (AI_NOMINAL_SPEED_MS * TICKS_PER_MONTH * TICK_MS) / 1000 / TILE_SIZE_M;

/**
 * Ticks a vehicle needs per tile at the nominal speed.
 *
 * The other half of being honest about time. A parcel on a long line is not
 * fresh when it arrives: it waited at the station and then rode for weeks, and
 * section 7.5 pays it accordingly. An estimate that quotes every load at the
 * full fresh rate values a line across the map far above what it will ever
 * earn - which is exactly what it did.
 */
export const AI_TICKS_PER_TILE = TILE_SIZE_M / AI_NOMINAL_SPEED_MS / (TICK_MS / 1000);
export const AI_MAX_VEHICLES_PER_LINE = 6;

/**
 * Most trains a competitor puts on one railway.
 *
 * The AI's railway is a one-way oval (the shape D-082 proved and the takt
 * fixture pinned): trains circulate, follow, and never meet head on. TWO is
 * what that fixture measured over five game years with zero deadlocks; every
 * further train stands in the D-074 queue behind a loading one - the stations
 * sit on the ring, so a third train buys waiting, not throughput.
 */
export const AI_RAIL_MAX_TRAINS = 2;

/**
 * The railway a competitor's PROFITABILITY test is quoted for: one train on
 * one track. [trains, tracks]
 *
 * Not AI_RAIL_MAX_TRAINS and not the oval's double way, and the difference is
 * measured rather than assumed. `enqueueInfrastructure` lays D-153's one-way
 * oval only where two straight clear rows fit the whole span, and on generated
 * terrain they do not: over the eight sweep seeds, twenty-five years each,
 * **every single railway the AI built was the single-track fallback with one
 * train** - `BuyTrain` accepted exactly once per rail company, ten of ten, and
 * `AiProject.railTrains` 1 every time. `projectLine` was quoting two trains
 * over a double way, so the line that was PRICED was never the line that got
 * BUILT: half the lift, and the review then judged the real one. Measured on
 * the closing review of every rail line the eight seeds produced, earnings
 * against the fleet upkeep alone came to 0.61-0.99 of what was owed, against a
 * projection of 1.3-1.9 times the whole bill.
 *
 * Quoting the fallback is also the SAFE direction: where the oval does fit the
 * line gets two trains over two tracks and beats its own projection. This is
 * the D-219 lesson one file along - a filter and the builder it filters for
 * must not disagree about what is being built.
 */
export const AI_RAIL_PROJECTED_TRAINS = 1;
export const AI_RAIL_PROJECTED_TRACKS = 1;

/** Cargo waiting at a line's first stop before it is reinforced. [units] */
export const AI_REINFORCE_WAITING = 300;

/**
 * How long a competitor waits after a build attempt before trying again.
 *
 * A game month. Three cycles - six game days - let a company put six lines down
 * before the first had carried anything, and it was bankrupt inside five years
 * with a network it could not pay for.
 */
export const AI_RETRY_TICKS = TICKS_PER_MONTH;

/**
 * Cash a competitor keeps back before it repays a loan. [cent]
 *
 * Enough for a few months of upkeep. Repaying down to nothing and then being
 * unable to pay the wage bill is a worse mistake than the interest.
 */
export const AI_CASH_RESERVE_CT = 200_000_00;

/**
 * How long a line is given before it is judged, and how long between reviews.
 * [ticks]
 *
 * Half a year. Shorter and a line is closed before its industry has got going;
 * a whole year and a dead line - one whose works has shut and whose vehicles
 * are waiting for a load that will never come - is paid for through two more
 * seasons, which is most of what killed the first competitors that were
 * measured over twenty-five years.
 */
export const AI_LINE_REVIEW_TICKS = TICKS_PER_YEAR / 2;

/**
 * Share of the fleet's NOMINAL monthly lift a source may demand before the
 * pair is dropped as unliftable. [share, 0..1]
 *
 * The lift gate compares a source's assumed monthly output against what the
 * largest allowed fleet could carry at AI_NOMINAL_SPEED_MS - and the nominal
 * round is about HALF the real one (measured on the scenario-5 trace: 14
 * nominal days against 27-29 driven days on a 25-tile bus line; 36 against
 * ~90 on the 100-tile grain haul - corners, slopes, loading and the takt
 * dwell are all invisible to a straight line at 14 m/s). A gate at the
 * nominal figure therefore admits pairs the real fleet can only just match -
 * and a queue the fleet merely MATCHES never drains, so oldest-first keeps
 * every load a month stale at the 10 % floor for ever (the M5 oversupply
 * rule). Half the nominal lift is the real lift; demanding the source fit
 * inside it is what lets the queue actually drain.
 */
export const AI_LIFT_REAL_SHARE = 0.5;

/**
 * How much the largest allowed fleet's real lift must EXCEED a decaying
 * source's monthly output for the pair to be worth serving. [factor]
 *
 * Matching the output is not enough, and the scenario-5 trace measured why:
 * a six-bus line whose real lift (613/month) sat two percent over the town's
 * deposits ran for ever against a standing pile pinned at thirty days of
 * age - oldest-first loading turns a backlog the fleet cannot OUT-lift into
 * a conveyor of month-old passengers, every one of them at the 10 % decay
 * floor, and the line earned less than half its own upkeep. A pile only
 * stops costing when the fleet can genuinely eat it: half again over the
 * deposits clears a month's backlog in two months and then keeps the pile
 * young. Applies to cargo that decays; a coal pile a month old pays face
 * value and needs no margin (the stale-arrival branch of the gate).
 */
export const AI_DRAIN_MARGIN = 1.5;

/**
 * How far a line's projected monthly revenue must clear the whole monthly
 * bill it creates before a competitor will build it at all. [factor]
 *
 * The floor `startProject` never had. `rate` scores revenue per unit of
 * capital, which is a RANKING with no bottom, and `startProject` then asked
 * only whether the company could AFFORD the build - so the best of a list of
 * loss-makers was built, and built again, until the money was gone. Measured
 * over eleven quarter-century AI games (the four `aiGame` sweep seeds, four
 * unplayed seeds and scenario 5's three personalities), 114 lines were built
 * and reviewed 492 times, and the outcome sorts almost perfectly by the
 * projection of `projectLine`:
 *
 * | projected margin | lines | ever covered their whole monthly bill |
 * | ---------------- | ----- | ------------------------------------- |
 * | under 0.9        |    77 | 7 (9 %)                               |
 * | 0.9 and over     |    37 | 17 (46 %)                             |
 * | 2.0 and over     |     4 | 4 (100 %)                             |
 *
 * The value was NOT read off that table - picking the column that flatters a
 * band is exactly what this project does not do. It was the reciprocal of the
 * measured optimism of the projection itself: over all 114 lines the MEDIAN
 * one realised **0.815** of its projected margin at its best review window
 * (quartiles 0.54 and 1.47), so a projection of 1 / 0.815 = **1.23** is what
 * the median line needs in order to cover its bill in fact. Rounded to 1.25.
 *
 * **1.25 was a principled derivation with exactly ONE point measured, and
 * D-229 swept the constant instead: fifteen values from 0.60 to 3.00, sixteen
 * seeds x three competitors x twenty-five years each, plus scenario 5's three
 * personalities at every value. 1.25 is not where the game is best, and the
 * median-realisation argument is not wrong - it answers a question with the
 * wrong quantile in it.** The curve, per value (48 companies; "crewed" = a
 * company that finishes the quarter century running a line with a fleet;
 * "husk" = stations standing with no fleet at all):
 *
 * | floor | value EUR  | wound up | crewed | seeds | vehicles | husks | idle |
 * | ----- | ---------- | -------- | ------ | ----- | -------- | ----- | ---- |
 * | 0.60  | 10,768,464 |       14 |      7 |  7/16 |       48 |    31 |   10 |
 * | 0.95  | 14,122,339 |        8 |      5 |  5/16 |       48 |    34 |    9 |
 * | 1.25  | 21,254,922 |        3 |      9 |  8/16 |       90 |    26 |   13 |
 * | 1.55  | 24,814,668 |        0 |      8 |  8/16 |       78 |    12 |   28 |
 * | 1.90  | 25,422,832 |        0 |     12 | 11/16 |       99 |     8 |   28 |
 * | 2.00  | 25,597,942 |        0 |     13 | 11/16 |      105 |     6 |   29 |
 * | 2.35  | 26,727,677 |        1 |     13 | 11/16 |      114 |     4 |   31 |
 * | 2.60  | 24,616,844 |        0 |     10 |  9/16 |       72 |     7 |   31 |
 * | 3.00  | 24,606,487 |        0 |      7 |  6/16 |       48 |     8 |   33 |
 *
 * **2.00 is the SMALLEST floor that reaches the plateau maximum of the
 * property that was optimised** - competitors that finish running a business -
 * and the plateau (1.90 - 2.35) is broad, so the choice is not a peak-fit. The
 * money is not made by inaction, which is the trap a total-value objective
 * falls into and is measured here rather than assumed: against the 24,000,000
 * EUR the 48 companies start with, the field at 1.25 DESTROYS 2,745,078 and at
 * 2.00 CREATES 1,597,942. What the higher floor costs is stated too:
 * competitors that never build anything at all rise 13 -> 29 of 48, and one
 * world of sixteen (seed 131313) ends with no competitor infrastructure at all
 * against none at 1.25.
 *
 * **The re-derivation, and the disagreement that is the finding.** The same
 * instrument D-221 used, re-run over 51 quarter centuries at a near-unfiltered
 * floor of 0.60 (182 lines, every one of them reviewed): the median line
 * realises **0.603** of its projection, and the projection at which the MEDIAN
 * line covers its whole monthly bill in fact is **1.257** - which reproduces
 * 1.25 on a sample sixty percent larger, so D-221's arithmetic stands. What
 * the sweep says is that the median is the wrong statistic: a line that misses
 * does not merely fail to compound, it consumes the capital, the review cycle
 * and one of the company's AI_MAX_LINES slots, and the fourteen windings-up at
 * the bottom of the table are that asymmetry priced. The THIRD QUARTILE of the
 * same measurement - the projection at which three quarters of built lines
 * cover their bill - is **2.26**, and it lands inside the sweep's plateau.
 * Coverage by projected band on that unfiltered sample: under 0.9 18 %,
 * 0.9-1.25 40 %, 1.25-1.9 53 %, 1.9-2.6 75 %, 2.6 and over 88 %.
 *
 * **The sensitivity this comment used to state is REFUTED, and that is why it
 * is quoted rather than deleted.** It read: "seed 2's expansive company builds
 * at 1.435 and 1.488 and seed 3's rail company at 1.881, so a floor above
 * 1.435 would stop two of scenario 5's three personalities building at all."
 * Measured: at 2.00 the rail company goes from a 228,581 EUR husk with no line
 * and no vehicle to **1,802,165 EUR with 3 lines, 18 vehicles and 6 stations**,
 * and the expansive company from **-241,375 [wound up]** to **2,153,604 EUR
 * with 4 lines and 23 vehicles**. Refusing the line a company would have built
 * does not stop the company; it sends it to the next candidate, later, with
 * its capital intact. The road company is unmoved to the euro at every floor
 * from 0.80 to 2.60.
 *
 * **What this constant does NOT buy, measured at all fifteen values: a railway
 * competitor.** Rail lines alive and trains alive are ZERO at every floor from
 * 0.60 to 3.00. The rail question is D-228's, and it is affordability, not
 * this floor.
 */
export const AI_MIN_PROFIT_MARGIN = 2.0;

/**
 * How far off the straight corridor the AI's road planner may look, per side.
 * [tiles]
 *
 * The BuildRoad command lays an L and rejects the WHOLE run on the first
 * blocked tile - right for a player who can see the map, fatal for an AI that
 * cannot: measured on the scenario-5 trace, every town-to-town road the road
 * personality ordered was refused (a building or a lake on the L), the stops
 * and buses were bought anyway, and six lines in a row ran their whole review
 * period in KEIN_WEG. The AI therefore walks a breadth-first search around
 * the obstacles first and orders the road it actually found, run by run. The
 * search is bounded to the corridor box inflated by this margin: one town
 * radius (TOWN_START_RADIUS is 10) plus slack, so a road can round the town
 * it starts in but cannot wander across the map.
 */
export const AI_ROAD_DETOUR_MARGIN = 16;

/** Wagons a competitor puts behind a locomotive. */
export const AI_RAIL_WAGONS = 5;

/**
 * Tiles of platform a competitor builds at each end.
 *
 * A locomotive and five wagons is about seventy metres, which is two tiles. A
 * shorter platform works only the share of the train that fits, minus forty
 * percent (section 10) - which is what balancing scenario 2 measured when it
 * was built with one.
 */
export const AI_PLATFORM_TILES = 2;

/**
 * Shortest route a competitor will lay rail over. [tiles]
 *
 * Two platforms of two tiles, a shed and an overrun tile at each end have to
 * fit on it, and a line shorter than that is a line whose platforms would sit
 * on top of each other.
 */
export const AI_RAIL_MIN_TILES = 8;

/**
 * Signal spacing on the AI's railway, in tiles.
 *
 * The automatic signalling of section 9.4 lays ONE-WAY signals facing the way
 * the line was drawn. On the single out-and-back track the AI used to build
 * that was fatal - the return trip was refused by the very signals meant to
 * help (D-115) - and the spacing stood at ZERO. Since M11 stage C2 the AI
 * builds a one-way OVAL: the outbound row is drawn from A to B, the return
 * row from B to A, and one-way signals along the drawn direction are then
 * exactly right on both. Eight tiles matches the takt fixture that proved
 * the shape over five game years with two trains.
 */
export const AI_SIGNAL_SPACING = 8;

/**
 * How far the corridor row of an AI railway may sit from either end's stop
 * anchor, across the corridor. [tiles]
 *
 * The AI lays the takt fixture's oval verbatim: two straight parallel one-way
 * rows with both platforms on the outbound row. That needs one straight row
 * that serves BOTH industries: the stop anchor is at most 3 tiles from its
 * industry (stopTileNear), the catchment is measured over
 * STATION_CATCHMENT_SCAN_RADIUS = 12, and 8 keeps the platform inside the
 * catchment with a tile of slack. A pair whose ends sit further apart across
 * every candidate row is skipped, not bent around - the L-shaped and
 * free-form ovals were tried first and refused every candidate on real
 * terrain (the offset copy of an assistant-planned route lands on hills,
 * water and its own outbound track).
 */
export const AI_RAIL_CORRIDOR_SKEW_MAX = 8;

/**
 * Overrun beyond the outermost platform to the oval's end connector. [tiles]
 *
 * The takt fixture keeps its loop connectors four tiles clear of the
 * platforms; three is the minimum that leaves a signal's worth of plain line
 * between a platform end and the connector junction (D-055: a signal stands
 * only on plain line).
 */
export const AI_RAIL_LOOP_MARGIN = 3;

/**
 * Distance between the oval's outbound and return rows. [tiles]
 *
 * Two, exactly the takt fixture (ROW 30 / ROW2 32): the empty row between
 * the two keeps the end connectors three tiles long - long enough that the
 * connector's middle tile is plain line a claim can end on.
 */
export const AI_RAIL_OVAL_GAP = 2;

/**
 * What a pair already served by somebody is worth, as a share.
 *
 * Not zero: section 15 asks for existing service to be taken into account, and
 * a competitor's stop at one end of a good chain does not make the chain bad.
 */
export const AI_RIVAL_PENALTY = 0.4;

/**
 * What a sink that PRODUCES something of its own is worth, as a share.
 *
 * A factory that is supplied but whose output nobody collects shuts down in
 * twenty-four months (section 7.3), and when it does, the line feeding it has
 * nowhere to send its cargo and its vehicles wait for a load that never comes.
 * That is not a bug in either rule - it is what a one-legged chain is - and a
 * competitor that cannot see it builds the same doomed line for a century.
 *
 * So terminal sinks - a power station, a town - are strongly preferred, and a
 * producing one is a fallback rather than a first choice.
 */
export const AI_PRODUCING_SINK_PENALTY = 0.25;

/**
 * What the NEXT leg of a chain the company already feeds is worth, as a
 * multiplier.
 *
 * It is the most valuable thing a competitor can build and the easiest thing
 * for it to miss. A works it supplies but never collects from shuts down in
 * twenty-four months and takes the line feeding it with it, so finishing the
 * chain is worth far more than the tonnage alone says.
 */
export const AI_CHAIN_BONUS = 5;

// ---------------------------------------------------------- contracts (14.4)

/** How many tenders stand open at once (section 14.4). */
export const CONTRACT_MIN_OPEN = 2;
export const CONTRACT_MAX_OPEN = 5;

/** The size of an order, and the step it is rounded to. [units] */
export const CONTRACT_MIN_AMOUNT = 400;
export const CONTRACT_MAX_AMOUNT = 2_400;
export const CONTRACT_AMOUNT_STEP = 200;

/** How long a company has to deliver. [months] */
export const CONTRACT_MONTHS_MIN = 9;
export const CONTRACT_MONTHS_MAX = 18;

/**
 * What the bonus is worth against the ordinary freight revenue for the same
 * tonnage - "typisch 1,5x" in section 14.4, as a bonus ON TOP of the fares the
 * deliveries earn anyway.
 */
export const CONTRACT_BONUS_FACTOR = 0.5;

/** What failing one costs, as a share of the bonus that was on offer. */
export const CONTRACT_PENALTY_SHARE = 0.3;

/** Council goodwill lost in the destination town for failing a contract. */
export const CONTRACT_RATING_MALUS = 10;

// -------------------------------------------------------- environment (14.3)

/**
 * Carbon per megajoule of USEFUL work, by energy carrier.
 *
 * Indexed by PowerSource, exactly as ENERGY_COST_CT_PER_MJ is, and derived the
 * same way: the carbon in the fuel divided by how much of it reaches the
 * drawbar. That is why steam is so far above everything else - it is not that
 * coal is uniquely dirty, it is that a steam locomotive wastes ninety per cent
 * of it.
 *
 * Electric is not zero. The grid of 1950 burned coal too, and a figure of zero
 * would say the game believes electrification is free of consequence rather
 * than very much better. [kg CO2 per megajoule of work at the drawbar]
 */
export const CO2_KG_PER_MJ: readonly number[] = [
  1.15, // steam
  0.42, // diesel
  0.09, // electric
  0.31, // hydrogen
  0.12, // battery
];

export const KG_PER_TONNE = 1000;

/** The first year a carbon levy exists at all (section 14.3). */
export const CO2_LEVY_FROM_YEAR = 2000;

/** Up to this year the levy is flat; after it, it climbs. */
export const CO2_LEVY_RISE_FROM_YEAR = 2005;

/** The levy between 2000 and 2005. [cent per tonne] */
export const CO2_LEVY_CT_PER_TONNE = 2_500;

/** How much it climbs each year after 2005. [cent per tonne per year] */
export const CO2_LEVY_RISE_PER_YEAR = 900;

/** The first year electrification is subsidised. Same year as the levy. */
export const CO2_GRANT_FROM_YEAR = 2000;

/** Share of an electrification bill the state pays back. */
export const CO2_ELECTRIFICATION_GRANT_SHARE = 0.4;

/**
 * A fleet at or below this carbon intensity is treated as clean by a town
 * council (section 14.3). [kg CO2 per megajoule]
 *
 * Set between the diesel and the electric figure, so the bonus is what a
 * company gets for having electrified rather than for existing.
 */
export const COUNCIL_GREEN_INTENSITY = 0.2;

/** Rating points a town adds for a clean fleet. */
export const COUNCIL_GREEN_BONUS = 8;

/**
 * Megajoules in a joule, the other way up. Work is accumulated in joules
 * because that is what force times distance gives, and priced in megajoules
 * because that is a number a human can read.
 */
export const JOULES_PER_MJ = 1_000_000;

// ------------------------------------------------------------------- news

/**
 * Entries the news log keeps (section 17.1).
 *
 * Two hundred is a few game years of ordinary events and a fraction of a
 * megabyte in the save. Older entries fall off the front: a log nobody can
 * scroll to the end of is a log nobody reads.
 */
export const NEWS_LOG_SIZE = 200;

// ---------------------------------------------------------------- accounting

/**
 * Months the cash-flow chart of section 14.1 looks back over.
 *
 * Twenty-four is two game years, which is exactly the comparison the
 * profit-and-loss view is specified to offer, so one window serves both.
 */
export const LEDGER_HISTORY_MONTHS = 24;

/** Game years of company value kept for the value history. */
export const COMPANY_VALUE_YEARS = 25;

// ---------------------------------------------------------------- economy

/** Inflation applied to revenue and costs alike, per game year. [1/year] */
export const INFLATION_PER_YEAR = 0.018;

/**
 * Distance a cargo rate is quoted over: a rate is euros per unit per this
 * many tiles (section 7.5). [tiles]
 *
 * It was a literal `/ 100` inside the payment formula until SPEC2 M15 needed
 * the same figure a second time - the closed-form revenue ceiling of D-066,
 * which is that formula run backwards over a whole year. Two copies of the
 * quantity a rate is quoted over would be two definitions of what a tariff
 * MEANS, so it is one constant with a unit and an origin.
 */
export const PAYMENT_DISTANCE_TILES = 100;

/** Payment multiplier for cargo that arrives in half the grace period or less. */
export const FAST_DELIVERY_BONUS = 1.3;

/** Floor of the time factor: even very late cargo still pays a tenth. */
export const TIME_FACTOR_MIN = 0.1;

/** Payment multiplier when refrigerated cargo travels in an unrefrigerated vehicle. */
export const NO_COOLING_PENALTY = 0.55;

// ------------------------------------------------------------------- cargo

/** Cargo that finds no route waits this long before it is written off. [days] */
export const CARGO_MAX_WAIT_DAYS = 30;

/**
 * Share of an over-age pile written off per day, once past the grace period.
 *
 * Not the whole pile at once. Cargo merges into one stack per origin, so a
 * station at capacity would otherwise lose two thousand units in a single tick -
 * survivable for passengers, but the steady state of every under-served mine.
 */
export const CARGO_EXPIRY_FRACTION_PER_DAY = 0.1;

/** Units of cargo one waiting stack holds at most before the station is full. */
export const STATION_CARGO_CAPACITY = 2_000;

// ----------------------------------------------------------- cargo routing

/**
 * Completed trips a connection averages over (section 7.4).
 *
 * Eight is short enough that a line which has just been given a faster
 * locomotive is believed within one round of the timetable, and long enough
 * that one train held at a signal does not rewrite the map of the network.
 */
export const LINK_SAMPLE_COUNT = 8;

/**
 * Speed a leg is credited with until it has actually been driven once. [m/s]
 *
 * A connection has to have a time before the first vehicle has completed it, or
 * the first load of cargo ever produced would find no route and expire while the
 * line it needs is being driven for the first time. 54 km/h is roughly what a
 * road vehicle averages once stops are counted, and it is only ever a seed - the
 * first measurement replaces it.
 */
export const LINK_ESTIMATE_SPEED_MS = 15;

/**
 * A measured trip longer than this is thrown away rather than averaged. [ticks]
 *
 * A quarter game year. This is the outlier guard of last resort, NOT the
 * interruption filter: a stopped, sold or re-ordered vehicle is already
 * discarded by clearing its arrival clock (D-077). It stood at ten game DAYS
 * until M11, which silently made every leg beyond ~25 tiles unmeasurable -
 * scenario 2's own coal line ran on the 54 km/h seed for ever, and the
 * fleet advisor of section 12.3 ("gemessene Umlaufzeit") had nothing to
 * measure. A quarter year is three times the horizon past which cargo has
 * expired or decayed to the floor anyway - a leg slower than that needs no
 * honest mean, it needs a different line (M11 stage C, DECISIONS.md).
 */
export const LINK_SAMPLE_MAX_TICKS = TICKS_PER_YEAR / 4;

/**
 * How many destinations one batch of produced cargo is split between.
 *
 * One destination would send every passenger a town produces to the single
 * nearest stop, which is neither believable nor a network. Three is enough for
 * traffic to fan out and few enough that the split stays legible in the station
 * panel. Freight normally has one candidate anyway - there is usually only one
 * works that takes iron ore.
 */
export const CARGO_DESTINATION_FANOUT = 3;

/**
 * What a destination with no town of its own is worth to the gravity of
 * SPEC2 M19, in place of a population. [inhabitants]
 *
 * A quarter of the smallest town the generator places (the village row of
 * TOWN_START_POPULATION): a halt in open country pulls like a hamlet - not
 * like a city, and not like nothing. Nothing is what it would otherwise weigh,
 * and a candidate set in which every destination weighs nothing has no total
 * to normalise the split against at all.
 *
 * It is added to the population rather than replacing it, so it is also the
 * floor under a village that has shrunk: two candidates whose populations are
 * 5 and 10 are not a 1:2 split of a town's whole passenger output.
 */
export const GRAVITY_BASE_POPULATION = TOWN_START_POPULATION[2] / 4;

/**
 * Slack when deciding whether a vehicle carries a parcel closer to its
 * destination. [ticks]
 *
 * Purely to absorb floating point noise: the expected time IS the minimum over
 * exactly these sums, so the comparison would be exact but for rounding. It is
 * deliberately not a real detour allowance - cargo that accepts a detour can be
 * carried out and back on the same line and would then be paid for both legs.
 */
export const CARGO_ROUTE_EPSILON_TICKS = 1;

// -------------------------------------------------------- return journeys

/**
 * Months a station averages its passenger imbalance over (SPEC2 M19). [months]
 *
 * The same twelve-month window section 7.3 judges an industry on, and kept the
 * same way: ONE running number rather than a ring of twelve (D-079), a true
 * mean while the window is still filling and a rolling one afterwards. A
 * shorter window would make return traffic follow a single busy week; a longer
 * one would keep sending travellers home from a line that closed last winter.
 */
export const RETURN_MEAN_MONTHS = 12;

/**
 * Share of a station's unmatched arrivals that travel home again. [1]
 *
 * The remainder are the journeys that are genuinely one way: people who moved,
 * who arrived to stay, or who travelled on by some means the game does not
 * carry. The number is set from the CLOSED FORM and not from a measurement:
 * with a pure destination at one end of a shuttle, the steady state carries
 * `share` of the outbound flow back, so the flow asymmetry settles at
 * `1 - share`. SPEC2 M19 asks for an asymmetry under 30 %, which needs a share
 * over 0.7; 0.8 puts the ideal figure at 20 % and leaves the other ten points
 * for what the ideal leaves out - the twelve-month lag, decay at the platform,
 * and a line without the capacity to carry everybody home.
 *
 * It must stay strictly below 1. At 1 a closed loop of two stations sustains
 * itself for ever once its source dries up, which is not demand from nothing -
 * the conservation ledger still holds - but it is traffic with no origin. Below
 * 1 every loop decays geometrically without a source.
 */
export const RETURN_TRIP_SHARE = 0.8;

// ---------------------------------------------------------------- industry

/**
 * Industry output at level 100, before any service gate. [units per month]
 *
 * Indexed by IndustryType. A pure sink - the power plant, the merchant - uses
 * this as the amount it can take in, not put out.
 *
 * These are starting values. The chain balancing scenarios of section 19.4 own
 * them, exactly as the bus scenario owns the road figures.
 */
export const INDUSTRY_BASE_OUTPUT_PER_MONTH: readonly number[] = [
  300, // CoalMine
  250, // IronOreMine
  220, // OilWell
  280, // Forestry
  260, // Farm
  320, // GravelPit
  300, // PowerPlant (coal burnt)
  180, // SteelMill
  200, // Sawmill
  120, // FurnitureFactory
  110, // MachineFactory
  70, // ElectronicsFactory
  160, // FoodFactory
  170, // Refinery
  130, // PlasticsPlant
  200, // CementWorks
  200, // BuildersMerchant (cement taken in)
];

/**
 * Input units consumed per batch, per input slot of the recipe.
 *
 * The slots line up positionally with `IndustrySpec.inputs`. A primary industry
 * has an empty row and therefore runs on nothing.
 */
export const INDUSTRY_INPUT_PER_BATCH: readonly (readonly number[])[] = [
  [], // CoalMine
  [], // IronOreMine
  [], // OilWell
  [], // Forestry
  [], // Farm
  [], // GravelPit
  [1], // PowerPlant: coal
  [0.5, 1], // SteelMill: coal, iron ore
  [1.5], // Sawmill: wood
  [1.5], // FurnitureFactory: planks
  [1.5], // MachineFactory: steel
  [1, 1], // ElectronicsFactory: steel, plastics
  [1, 0.5], // FoodFactory: grain, livestock
  [1.2], // Refinery: oil
  [1.2], // PlasticsPlant: chemicals
  [1.5], // CementWorks: gravel
  [1], // BuildersMerchant: cement
];

/** Output units produced per batch, per output slot. */
export const INDUSTRY_OUTPUT_PER_BATCH: readonly (readonly number[])[] = [
  [1], // CoalMine: coal
  [1], // IronOreMine: iron ore
  [1], // OilWell: oil
  [1], // Forestry: wood
  [1, 0.35], // Farm: grain and livestock together
  [1], // GravelPit: gravel
  [], // PowerPlant: nothing
  [1], // SteelMill: steel
  [1], // Sawmill: planks
  [1], // FurnitureFactory: goods
  [1], // MachineFactory: goods
  [1], // ElectronicsFactory: electronics
  [1], // FoodFactory: food
  [1], // Refinery: chemicals
  [1], // PlasticsPlant: plastics
  [1], // CementWorks: cement
  [], // BuildersMerchant: nothing
];

/**
 * Production level, in percent of the base figure.
 *
 * An industry that is well served grows, one that is not shrinks - but never to
 * nothing, so a line that was abandoned can be picked up again.
 */
export const INDUSTRY_LEVEL_START = 100;
export const INDUSTRY_LEVEL_MAX = 200;
/** One expansion, in percentage points of the base rate (section 7.3). */
export const INDUSTRY_LEVEL_STEP = 10;

/**
 * Share of what an industry produced that has to be CARRIED AWAY for it to
 * expand (section 7.3).
 *
 * The ratio divides by the ungated production and counts only what left on a
 * vehicle, so it is bounded above by the collection gate - which is the station
 * rating. Reaching 80 % therefore means a station rated 80 or better, and that
 * takes a line with several vehicles on it. That is the death spiral of section
 * 10.1 applied to freight, pointing upwards: a second train pays for itself in
 * tonnage and not only in trips.
 *
 * There is deliberately no threshold below which a works SHRINKS - see D-086.
 */
export const INDUSTRY_GROWTH_RATIO = 0.8;

/**
 * Months of service the expansion rule judges, and the window the running
 * average covers (section 7.3: "at least 80 % collected over 12 months").
 *
 * It is also the dead band: an industry that has just moved holds its new level
 * for a year, so the level follows a settled trend and not one bad month.
 */
export const INDUSTRY_SERVICE_WINDOW_MONTHS = 12;

/** Months with nothing collected at all before an industry closes for good. */
export const INDUSTRY_CLOSURE_MONTHS = 24;

/** The two warnings on the way there. [months without a collection] */
export const INDUSTRY_WARNING_MONTHS: readonly number[] = [12, 20];

/**
 * What an industry still produces once its output store is full.
 *
 * Not zero: a yard that has stopped entirely looks the same as one that was
 * never built, and the player has to be able to see the difference between a
 * works nobody collects from and a works nobody supplies.
 */
export const INDUSTRY_FULL_STORE_RATE = 0.25;

/**
 * Share of the store at which the yard counts as full.
 *
 * Not the last unit. At exactly the cap there is no room for anything at all,
 * so a throttle would be invisible - production would simply be zero and the
 * player would never see the works winding down. At nine tenths the slowdown
 * happens while there is still something to see.
 */
export const INDUSTRY_STORE_FULL_SHARE = 0.9;

/**
 * Swing of a primary industry's base rate, and the period of that swing.
 *
 * A mine is not a metronome. The phase is taken from the industry id, so a
 * region does not boom and slump in unison, and the sine comes from the lookup
 * table of math.ts because Math.sin is not bit exact across engines.
 */
export const INDUSTRY_FLUCTUATION_AMPLITUDE = 0.25;
export const INDUSTRY_FLUCTUATION_PERIOD_YEARS = 5;

/**
 * Stock capacity, in months of the industry's own production (section 7.3).
 *
 * Per industry rather than a flat figure: eight months of a gravel pit is a
 * different quantity from eight months of an electronics works, and a flat cap
 * would make the small industries hoard and the large ones choke.
 */
export const INDUSTRY_STOCK_MONTHS = 8;

/** New industries that open per game year, in under-served regions. */
export const INDUSTRY_NEW_PER_YEAR = 1;

/** Attempts spent looking for a spot for one of them before giving up. */
export const INDUSTRY_OPENING_ATTEMPTS = 400;

// ----------------------------------------------------------------- stations

/** Catchment radius of a bare station, before any modules. [tiles] */
export const STATION_BASE_RADIUS = 4;

/** Every this many modules adds one tile of catchment radius. */
export const STATION_MODULES_PER_RADIUS = 3;

/** Hard cap on the catchment radius. [tiles] */
export const STATION_MAX_RADIUS = 10;

/** Modules within this distance of each other form one joint station. [tiles] */
export const STATION_JOIN_DISTANCE = 4;

/** Station rating starts here before any of the terms are added. */
export const STATION_RATING_BASE = 25;

/**
 * Waiting-time term: full marks below this age, zero above the second. [days]
 *
 * Recalibrated against balancing scenarios 2 and 3, which is what these numbers
 * are for. One day is ten seconds of real time and a vehicle covers 150 to 200
 * metres in it, so a 25 tile line is a TWENTY DAY round trip - cargo that is
 * two days old has essentially just been made, and nothing on any line in this
 * game is ever collected that fresh. Ten days is "the next vehicle took it",
 * forty-five is "three round trips went past without anybody calling".
 */
export const RATING_WAIT_GOOD_DAYS = 10;
export const RATING_WAIT_BAD_DAYS = 45;
export const RATING_WAIT_MAX = 30;

/**
 * Frequency term: vehicle visits counted over this window. [days]
 *
 * Same recalibration, and the same reason. Forty visits in twenty days is two a
 * day, which the time model makes physically impossible - a single vehicle on a
 * 25 tile line manages ONE. Four is a four-vehicle line, and that is what full
 * marks should mean.
 */
export const RATING_FREQUENCY_WINDOW_DAYS = 20;
export const RATING_FREQUENCY_MAX = 20;
export const RATING_FREQUENCY_SATURATION_VISITS = 4;

export const RATING_EQUIPMENT_MAX = 15;

/** A canopy is worth this much of the equipment term on its own (section 10). */
export const RATING_CANOPY_BONUS = 8;

export const RATING_RELIABILITY_MAX = 10;
export const RATING_OVERFLOW_PENALTY_MAX = 15;

/**
 * Months the per-station cargo-history ring remembers (SPEC2 M14). [months]
 *
 * Twelve completed months, one Int32 slot per month, cargo and counter -
 * enough for the station panel's bar history to show a full year of
 * collected/delivered/expired per cargo, small enough that the ring stays a
 * preallocated fixed-size block (architecture law #7).
 */
export const STATION_HISTORY_MONTHS = 12;

/**
 * Smallest dominant rating loss the station x-ray names in its warning
 * sentence (SPEC2 M14). [rating points]
 *
 * Below this every term is close to full marks and "Rating sinkt, weil ..."
 * would be noise about a station that is fine.
 */
export const RATING_XRAY_WARN_LOSS = 5;

// -------------------------------------------------------------------- towns

/** Inhabitants per tonne of goods demanded per month. */
export const TOWN_INHABITANTS_PER_GOODS = 900;
export const TOWN_INHABITANTS_PER_FOOD = 700;

/**
 * Passengers produced per inhabitant and month.
 *
 * Calibrated against balancing scenario 1. Note that what reaches the station
 * is this figure multiplied by the station rating, so a badly served stop sees
 * only a third of it - that gate is a large part of why the number looks high.
 */
export const PASSENGERS_PER_INHABITANT_PER_MONTH = 0.35;

/** Mail sacks produced per inhabitant and month. */
export const MAIL_PER_INHABITANT_PER_MONTH = 0.04;

/** Passenger and mail production is booked in this many slices per month. */
export const TOWN_PRODUCTION_SLICES_PER_MONTH = 30;

/**
 * Monthly town growth: a base rate lifted by how well each need is served.
 *
 * All three supply terms are shares in 0..1, so a town whose passengers, goods
 * and food are all fully carried grows at the base rate times one plus the sum
 * of the weights.
 */
export const TOWN_GROWTH_BASE_RATE = 0.0015;

// ------------------------------------------------------------- town council

/**
 * The town council of section 13.3, rating each company 0..100.
 *
 * A company the council has never heard of sits at the neutral value: it has
 * done nothing for the town and nothing to it. Everything else moves from
 * there, which is what makes the refusal threshold a punishment for behaviour
 * rather than the state every new company starts in.
 */
export const COUNCIL_RATING_NEUTRAL = 50;

/** Stations inside the town that earn the full service mark. [stations] */
export const COUNCIL_STATION_TARGET = 3;

/** Rating points for serving the town at all. */
export const COUNCIL_STATION_WEIGHT = 20;

/** Rating points for the share of the town's passengers actually carried. */
export const COUNCIL_TRANSPORT_WEIGHT = 30;

/** Rating points lost per track tile the company laid inside the town. */
export const COUNCIL_NOISE_PER_TILE = 0.6;

/** However much track is laid, noise alone cannot cost more than this. */
export const COUNCIL_NOISE_MAX = 25;

/** Goodwill lost for each town building knocked down. */
export const COUNCIL_DEMOLITION_PENALTY = 12;

/**
 * How much of the earned goodwill survives a month.
 *
 * A campaign that never wore off would mean buying the council once and owning
 * the town for the rest of the century; a grudge that never faded would mean
 * one demolished house costing a company the town for ever.
 */
export const COUNCIL_GOODWILL_DECAY_PER_MONTH = 0.9;

/** From this rating up, exclusive building rights can be bought. */
export const COUNCIL_EXCLUSIVE_MIN_RATING = 75;

/** Below this rating the council refuses building permits in the town. */
export const COUNCIL_REFUSAL_RATING = 25;

/** How long bought exclusive rights last. [months] */
export const COUNCIL_EXCLUSIVE_MONTHS = 12;

/** Price of exclusive rights, per inhabitant. [cent] */
export const COUNCIL_EXCLUSIVE_COST_CT_PER_HEAD = 400;

/**
 * The measures of section 13.3: plant trees, fund streets, and three sizes of
 * advertising campaign. Indexed by TownMeasure.
 */
export const TOWN_MEASURE_COST_CT: readonly number[] = [
  20_000_00, 80_000_00, 50_000_00, 140_000_00, 320_000_00,
];

/** Goodwill each measure buys, in rating points. */
export const TOWN_MEASURE_GOODWILL: readonly number[] = [6, 14, 10, 22, 40];

/** How long before the same measure can be bought again. [ticks] */
export const TOWN_MEASURE_COOLDOWN_TICKS: readonly number[] = [
  TICKS_PER_MONTH * 2,
  TICKS_PER_MONTH * 6,
  TICKS_PER_MONTH * 3,
  TICKS_PER_MONTH * 6,
  TICKS_PER_MONTH * 12,
];

/** Tiles of forest one planting turns over, at most. [tiles] */
export const TOWN_MEASURE_TREE_TILES = 12;

/** Tiles of new public street one funding round lays, at most. [tiles] */
export const TOWN_MEASURE_ROAD_TILES = 8;

/**
 * How far past the built-up area funded streets may reach. [tiles]
 *
 * A town that has filled its radius has no bare ground left between the houses,
 * and a measure that could only build where there was already room would do
 * nothing in exactly the towns worth courting. New streets go at the EDGE,
 * which is also where a town would put them.
 */
export const TOWN_MEASURE_ROAD_REACH = 2;

/** What it costs to clear a town building out of the way. [cent] */
export const BUILDING_DEMOLITION_COST_CT = 12_000_00;
export const TOWN_GROWTH_PASSENGER_WEIGHT = 0.55;
export const TOWN_GROWTH_GOODS_WEIGHT = 0.35;
export const TOWN_GROWTH_FOOD_WEIGHT = 0.35;

/**
 * Half width of the square scanned when a station works out what it serves.
 * The largest catchment radius plus slack. [tiles]
 */
export const STATION_CATCHMENT_SCAN_RADIUS = 12;

// ----------------------------------------------------------------- vehicles

/** Rolling resistance coefficient by surface. [1] */
export const ROLLING_RESISTANCE_RAIL = 0.002;
export const ROLLING_RESISTANCE_ROAD = 0.012;

/** Aerodynamic drag constant, F = k * v^2. [N s^2 / m^2] */
export const DRAG_TRAIN = 5.5;
export const DRAG_ROAD = 3.2;
export const DRAG_SHIP = 40.0;

/**
 * Air resistance of an aircraft. [kg/m]
 *
 * Low against a ship's forty, and it has to be: the term is k * v^2 and an
 * airliner's v is two hundred and fifty metres a second against a coaster's
 * six. At a ship's coefficient an aircraft would need three gigawatts to move.
 */
export const DRAG_AIR = 0.9;

/** Braking deceleration by vehicle class. [m/s^2] */
export const BRAKE_FREIGHT = 0.6;
export const BRAKE_PASSENGER = 1.0;
export const BRAKE_ROAD = 2.5;

/** Rotating masses add this much apparent inertia. [1] */
export const ROTATING_MASS_FACTOR = 1.06;

/** Gravity used by the longitudinal solver. [m/s^2] */
export const GRAVITY = 9.81;

/** Reaction distance added to the braking distance preview. [s] */
export const BRAKE_REACTION_SECONDS = 0.5;

/** Lateral acceleration a curve may impose, by vehicle class. [m/s^2] */
export const LATERAL_ACCEL_PASSENGER = 0.65;
export const LATERAL_ACCEL_FREIGHT = 1.0;
export const LATERAL_ACCEL_ROAD = 1.2;

/** How long loading one unit of cargo takes. [ticks per unit] */
export const LOAD_TICKS_PER_UNIT = 0.15;

/** Minimum stop at a station, even with nothing to exchange. [ticks] */
export const MIN_STATION_STOP_TICKS = 20;

/**
 * How often a vehicle that found no route tries again. [ticks]
 *
 * Five real seconds at 1x, staggered by vehicle id so a fleet stranded by one
 * demolished bridge does not run its searches in the same tick. A stranded
 * vehicle must not turn into a pathfinding load on the whole simulation.
 */
export const VEHICLE_REPATH_INTERVAL_TICKS = 100;

// ------------------------------------------------------- orders (section 12.1)

/**
 * Hard ceiling on the orders of one vehicle, sizing nothing but the sanity
 * check: `orderIndex` is a Uint8Array, so anything below 256 is safe, and no
 * hand-written schedule needs more than a few dozen entries.
 */
export const MAX_ORDERS_PER_VEHICLE = 64;

/**
 * Longest minimum dwell an order may demand (section 12.1 "Mindestaufenthalt").
 * One game month: a vehicle parked longer than that is a parked vehicle, which
 * is what the stop command is for. [ticks]
 */
export const MAX_ORDER_WAIT_TICKS = TICKS_PER_MONTH;

/**
 * How many conditional jumps are followed at one stop before the vehicle simply
 * runs the order it landed on (section 12.1). A cycle of orders whose
 * conditions are all true would otherwise spin for ever while the vehicle
 * stands at a platform; eight is more guard-chain than any real schedule uses.
 */
export const MAX_ORDER_JUMPS_PER_STOP = 8;

/** Reliability of a new vehicle, and its yearly decay. [0..10000] */
export const RELIABILITY_MAX = 10_000;
export const RELIABILITY_DECAY_PER_YEAR = 400;
export const RELIABILITY_SERVICE_GAIN = 600;

/**
 * What happens to a vehicle past its design life (section 11.3).
 *
 * Upkeep doubles and reliability falls twice as fast. Both at once is what
 * makes replacing a vehicle a decision rather than a formality: an old vehicle
 * still works, it just costs more and stops more often, and the player has to
 * weigh that against the price of a new one.
 */
export const OBSOLETE_UPKEEP_FACTOR = 2;
export const OBSOLETE_DECAY_FACTOR = 2;

/**
 * Age at which auto-renewal replaces a vehicle, as a share of its design life.
 *
 * Nine tenths, so a vehicle is replaced just BEFORE the doubled upkeep and the
 * doubled decay of obsolescence bite rather than just after - which is the
 * whole point of having the setting.
 */
export const AUTO_RENEW_LIFE_SHARE = 0.9;

/** Breakdown roll happens once per game day: rng < (max - reliability) / this. */
export const BREAKDOWN_DIVISOR = 40_000;

/** A broken down vehicle stands still for this long. [ticks] */
export const BREAKDOWN_MIN_TICKS = 40;
export const BREAKDOWN_MAX_TICKS = 120;

/**
 * Upper bound on vehicles per company, sizing the struct-of-arrays store.
 * Raising it past 32_767 also has to widen the Int16 reservation table in
 * `net/reservations.ts`.
 */
export const MAX_VEHICLES = 4_000;

/** Upper bound on stations per company. */
export const MAX_STATIONS = 1_000;

/**
 * Upper bound on lines across ALL companies, sizing the line store of section
 * 12.2 (SPEC2 M11). One store rather than one per company, because a line id
 * has to be unique game-wide - it is what a vehicle's `lineId` points at.
 * Six companies at the AI's twenty-line cap use 120; the rest is the player's
 * headroom. [lines]
 */
export const MAX_LINES = 256;

// ----------------------------------------------------- goals (SPEC2 M17)

/**
 * Upper bound on goals a world may carry, sizing the goal store.
 *
 * Eight is what a scenario briefing can state without becoming a list nobody
 * reads - the eight shipped scenarios of SPEC2 M17 carry between one and four
 * each - and it is what keeps the whole goal block inside the 64 bytes the
 * shared-resource ledger booked for it (SPEC2 6.1). [goals]
 */
export const MAX_GOALS = 8;

/**
 * Scale of the goal progress the snapshot carries: thousandths of the way to
 * the threshold, clamped to 0..1000.
 *
 * The same convention `SnapshotVehicle.ProgressMilli` uses, and for the same
 * reason - the channel is Int32 and a ratio needs a fixed denominator both
 * sides agree on. [1/1000]
 */
export const GOAL_PROGRESS_SCALE = 1_000;

/**
 * Longest a single `.ironscenario` metadata string may be - title, author,
 * briefing half or goal caption (SPEC2 M17).
 *
 * Two thousand characters is about a printed page, which is the most a
 * briefing panel can show before it becomes a document nobody reads; the eight
 * shipped scenarios use 300-900. It is a bound on a file somebody else wrote,
 * not a balancing figure: the block is UNHASHED, so it costs the world nothing
 * - but an unbounded string in a file the player was handed is a megabyte the
 * loader has no reason to accept. [characters]
 */
export const SCENARIO_TEXT_MAX_CHARS = 2_000;

// -------------------------------------------- the final score (SPEC2 M17)

/**
 * Points one quarter of the final score is worth at full marks.
 *
 * The score has four terms - goals, company value, network value, tonnage -
 * and each one is a SHARE of its own full mark rather than an open-ended sum.
 * That is what stops the score from being a wealth ranking with three
 * decorations attached: a player who is very rich and ran a bad network cannot
 * out-score a player who did all four adequately, because the value term
 * saturates. Four times this figure is the perfect game. [points]
 */
export const SCORE_TERM_MAX_POINTS = 2_500;

/**
 * Weight of a medal inside the goal term, indexed by `GoalMedal`
 * (None/Bronze/Silver/Gold). The term is the weight actually earned divided by
 * the weight every goal at gold would have carried, so a scenario with two
 * goals and one with eight are scored on the same scale. [weight]
 */
export const SCORE_MEDAL_WEIGHTS: readonly number[] = [0, 0.4, 0.7, 1];

/**
 * Company value that earns full marks in the value term, at the FIRST year's
 * prices. [cent]
 *
 * D-158 measured what this economy actually pays: a competently built network
 * on a generated map gains at most about 840,000 EUR over a quarter century,
 * on top of the 500,000 EUR of starting capital. Four million is therefore
 * roughly three times the measured competent result - a figure a hand-built
 * ideal chain reaches and a real map does not, which is what keeps the term
 * measuring instead of saturating.
 */
export const SCORE_VALUE_FULL_CT = 4_000_000 * CENTS_PER_EURO;

/**
 * Network value (D-187's earned-over-ceiling share) that earns full marks.
 *
 * The ceiling of D-066 is unreachable by construction - it assumes no loading
 * time and a full load in BOTH directions - so a share of one is not the right
 * full mark. Measured instead of guessed: the wood chain of balancing scenario
 * 3, three point-to-point shuttles that are almost never idle, reaches 20.1 %
 * over a quarter century. Full marks are therefore a network that also earns
 * on the return leg, which is the half of the ceiling's assumption a real
 * railway hardly ever gets.
 */
export const SCORE_NETWORK_FULL_SHARE = 0.35;

/**
 * Units delivered over a company's lifetime that earn full marks. [units]
 *
 * The one term that survives a winding-up, because `cargoDeliveredUnits` is a
 * lifetime tally and the fleet it was earned with is not. Calibrated on
 * D-195's own measurements: four buses between two towns deliver 21,400
 * passengers a game year, one coal train about 1,700 units, and the wood chain
 * measured 70,800 units over a quarter century.
 *
 * A passenger is a unit and a tonne is a unit, so a passenger operator reaches
 * this mark far sooner than a freight one. That is deliberate and not an
 * oversight: the term counts ACTIVITY, and what the freight was worth is
 * already the value term's job. Weighting units per cargo here would be a
 * second tariff table standing beside `cargoSpec.baseRateCt`, free to disagree
 * with it.
 */
export const SCORE_CARGO_FULL_UNITS = 250_000;

// ------------------------------------------------- timetable (section 12.3)

/**
 * Smallest takt a line may run: one game day. A denser grid than a station
 * stop would make every slot "now" and the wait degenerate to nothing, so the
 * command refuses anything below a day rather than pretending it means
 * something. [ticks]
 */
export const TAKT_MIN_TICKS = TICKS_PER_DAY;

/**
 * Largest takt: one game year. Past that a "timetable" is a parked fleet with
 * paperwork; the stop command is the honest way to park a vehicle. Sanity cap,
 * not balancing - section 12.3 names no bound. [ticks]
 */
export const TAKT_MAX_TICKS = TICKS_PER_YEAR;

/**
 * Hard ceiling on holding a departure for a connecting vehicle at a transfer
 * node - the "bis zu X Ticks" of section 12.3, which the section itself
 * demands as the guard against circular waiting. Two game days: long enough
 * to bridge a late feeder, short enough that a missed connection costs a
 * fraction of any sensible takt. [ticks]
 */
export const CONNECTION_WAIT_MAX_TICKS = 2 * TICKS_PER_DAY;

// ---------------------------------------------------------------- rail

/**
 * Node budget of the route assistant. Section 8.4 sets 20_000 for train
 * pathfinding; the builder searches over (tile, direction) pairs, which is
 * eight times the state space, so it gets a correspondingly larger budget.
 */
export const MAX_TRACK_SEARCH_NODES = 60_000;

/**
 * How far outside the bounding box of the two endpoints the assistant may
 * wander. Enough room to swing around a hill, not enough to cross the map.
 */
export const TRACK_SEARCH_MARGIN_TILES = 24;

/**
 * Node budget of the train pathfinder (section 8.4 sets 20_000). It searches
 * over (track tile, incoming direction), which is eight states per tile, so the
 * budget is eight times the tile figure for the same reach.
 */
export const MAX_RAIL_SEARCH_NODES = 160_000;

/**
 * What the train pathfinder charges for a section another train has claimed,
 * under the world rule `occupancyPenalty` (SPEC.md 8.4, SPEC2 M15). [s]
 *
 * SPEC2 M15 fixes the price at three seconds per reserved block, and three
 * seconds is deliberately far BELOW what meeting an occupied block really
 * costs: a train that runs up to one brakes to a stand and accelerates away
 * again, which at the 0.6 m/s^2 freight brake and a 25 m/s line speed is the
 * better part of a minute. Two reasons for the nudge rather than the true
 * price. The reservation the search reads is a SNAPSHOT taken now, and the
 * train arrives later - by then the block is usually free again. And priced at
 * its true cost, one claimed tile anywhere ahead would send a train around
 * half the map, which is the failure mode SPEC.md 22 calls a pathfinder that
 * outsmarts the player.
 */
export const RAIL_OCCUPANCY_PENALTY_SECONDS = 3;

/**
 * What the train pathfinder charges for passing a signal, under the world rule
 * `signalPenalty` (SPEC.md 8.4, SPEC2 M15). [s]
 *
 * A signal is a place a train MIGHT have to stop, so it is worth something,
 * but nothing like a stop. Half a second is about a third of the 1.7 s an
 * orthogonal tile costs at 30 m/s: enough to break a tie between two otherwise
 * equal routes in favour of the one with fewer stopping places, far too little
 * to push a train off a signalled main line onto an unsignalled siding - which
 * would be the exact opposite of what the occupancy term is for.
 */
export const RAIL_SIGNAL_PENALTY_SECONDS = 0.5;

/**
 * How long a train must have stood at a red before it reconsiders its route,
 * and how often it may do so afterwards. [ticks]
 *
 * The repath-storm guard of SPEC2 M15: the occupancy term above makes route
 * cost depend on LIVE occupancy, so a train that repathed every tick would run
 * an A* per tick per held train - and a busy junction holds a dozen. The wait
 * threshold is two real seconds at 1x, so a train held for the moment it takes
 * the train ahead to clear pays for no search at all; the interval is the five
 * real seconds the routeless retry has used since M2. Twelve reconsiderations
 * fit inside the 1,200-tick deadlock warning, so a train reroutes long before
 * the game calls it stuck.
 */
export const RAIL_SIGNAL_REPATH_MIN_WAIT_TICKS = 40;
export const RAIL_SIGNAL_REPATH_INTERVAL_TICKS = 100;

/**
 * Longest train that may be assembled.
 *
 * 400 m is eight tiles of track, which is also the longest platform anyone
 * builds by hand before the layout stops fitting between two towns. Longer
 * trains would make the head arrive at the next station while the tail is still
 * standing in the previous one, and modelling that properly needs the block
 * reservations of M4.
 * [m]
 */
export const MAX_TRAIN_LENGTH_M = 400;

/** Hard ceiling on the units in one train, sizing the consist arrays. */
export const MAX_CONSIST_UNITS = 32;

/**
 * How many route nodes ahead a train checks for curves and signals.
 *
 * The fastest traction unit tops out at 330 km/h = 91.7 m/s, and a freight
 * brake of 0.6 m/s^2 needs v^2/2b = 7_007 m to stop from there - 140 orthogonal
 * tiles. 160 leaves margin. The loop leaves early as soon as it is past its own
 * braking distance, so the full count is only ever paid by a train genuinely
 * doing 330.
 *
 * This is a COMFORT constant, not a correctness one: a signal beyond the
 * lookahead is still caught by the hard gate in the tile advance, which stops
 * the train at the section boundary rather than letting it run past.
 */
export const CURVE_LOOKAHEAD_MAX_NODES = 160;

/**
 * Speed below which a vehicle counts as having stopped. [m/s]
 * Used both to decide that a vehicle has finished its route and to decide that
 * a train held at a signal has come to a stand.
 */
export const STOPPED_SPEED_MS = 0.4;

// ----------------------------------------------------- weather (SPEC2 M18)

/**
 * The weather world rule of SPEC2 E-01: off, mild or harsh.
 *
 * A rule and not a setting (D-110), for the reason E-01 states: weather that
 * only the renderer knew about would be weather that lies - it rains and
 * nothing costs anything - and weather the simulation knew about without
 * hashing it would break architecture law #3. So it is chosen once on the
 * new-game screen, saved, hashed and migrated (Z2), exactly like inflation.
 *
 * OFF is the default and the only value a world written before M18 can have.
 * Every balancing band this game is measured against was measured without
 * weather, and a rule that ships on by default re-bands all of them inside the
 * milestone that introduces it (Fehlerkatalog 34).
 */
export const WeatherRule = {
  Off: 0,
  Mild: 1,
  Harsh: 2,
} as const;
export type WeatherRule = (typeof WeatherRule)[keyof typeof WeatherRule];

/** How many values {@link WeatherRule} has; the parser's range check. */
export const WEATHER_RULE_COUNT = 3;

/**
 * What one region cell of the weather field holds (SPEC2 M18).
 *
 * Five states, one Uint8 per region. They are deliberately WEATHER rather than
 * effects: what a storm costs is a multiplier looked up at an existing seam,
 * and the field says only what the sky is doing.
 */
export const WeatherCell = {
  Clear: 0,
  Rain: 1,
  Storm: 2,
  Frost: 3,
  Heat: 4,
} as const;
export type WeatherCell = (typeof WeatherCell)[keyof typeof WeatherCell];

/** How many values {@link WeatherCell} has. */
export const WEATHER_CELL_COUNT = 5;

/**
 * Edge length of the weather region grid, in cells (SPEC2 M18).
 *
 * SPEC2 names 16x16 regions, and the number is deliberately independent of the
 * map size: a 64 map and a 2048 map both have 256 regions, so the field is a
 * fixed-size preallocated array (law #7) and the save cost of the rule is 256
 * bytes on every world rather than a second megabyte-scale tile layer. One
 * region is 4 tiles across on the smallest map and 128 on the largest, which
 * is a weather FRONT either way rather than a per-tile shower. [cells]
 */
export const WEATHER_GRID_SIZE = 16;

/** Cells of the weather field. [cells] */
export const WEATHER_REGION_COUNT = WEATHER_GRID_SIZE * WEATHER_GRID_SIZE;

/**
 * Name of the weather RNG stream (Z3, D-106/D-128).
 *
 * Weather draws from `world.streamFor` and never from the shared gameplay
 * stream: a draw there would move every later breakdown roll and fork every
 * existing seed the moment a player switched the rule on. The salt is this
 * name folded together with the game day, because a periodic hook needs a
 * sequence that differs per invocation (D-128's tender-review precedent) AND a
 * name that cannot collide with another system's by an accident of call order.
 */
export const WEATHER_STREAM_NAME = 'weather';

/**
 * Relative weight of each {@link WeatherCell} before persistence, season and
 * neighbours, indexed by {@link WeatherRule} and then by cell. [dimensionless]
 *
 * The Off row is all zeros and is never read - the daily hook returns on its
 * first line for a world with the rule off - and it is written out rather than
 * omitted so the table can be indexed by the rule without a branch.
 *
 * The two playing rows are the design statement of the rule: MILD is a climate
 * where most days are clear and a storm is rare; HARSH is one where clear
 * weather is barely a majority and storms are a normal part of a season. The
 * numbers are relative weights of a single draw, not probabilities - the
 * factors below reshape them per cell - so what they fix is the RATIO between
 * the five skies and nothing else.
 *
 * **They were CHOSEN by looking at the distribution they produce**, and
 * `tests/unit/weather.spec.ts` then bands that distribution, so those bands are
 * a read-back of this table rather than evidence about it. The test says so and
 * carries the independent properties separately. Measured over five game years
 * (seed 424,242, 1,800 sampled days x 256 regions): mild 80.5 % clear / 17.0 %
 * rain / 1.2 % storm / 0.7 % frost / 0.6 % heat, harsh 52.4 / 33.5 / 8.3 / 3.2
 * / 2.5.
 */
export const WEATHER_BASE_WEIGHT: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0],
  [66, 21, 3, 6, 5],
  [40, 20, 8, 14, 12],
];

/**
 * How much more likely a region is to keep the sky it already has than to be
 * assigned it afresh. [multiplier on the current cell's weight]
 *
 * Weather that is redrawn independently every day is not weather, it is noise:
 * a storm has to last long enough for the player to see it arrive, cost
 * something and pass. Six against the base weights above keeps a region's sky
 * from one day to the next in 86.4 % of cases under the mild rule (measured
 * over five game years, seed 424,242), which is a spell of about a week rather
 * than a coin toss every morning.
 */
export const WEATHER_PERSISTENCE = 6;

/**
 * How much a wet orthogonal neighbour adds to this region's rain and storm
 * weight. [multiplier added per neighbour in Rain or Storm]
 *
 * This is what makes the field a WEATHER MAP rather than 256 independent
 * dice: fronts form and travel because a region beside a wet one is more
 * likely to turn wet itself. Neighbours are read from the PREVIOUS day, so the
 * pass has no dependence on the order it walks the grid in (law #3).
 *
 * Measured over the same five harsh game years: 42.5 % of orthogonal
 * neighbour pairs share a sky against the 40.3 % an independent scatter of the
 * SAME per-day distribution would give. Setting this constant to zero was run
 * and measured at 49.5 % against 49.8 % - no structure at all - which is what
 * makes the comparison in `weather.spec.ts` evidence about the pull rather
 * than about the weights it acts on.
 */
export const WEATHER_NEIGHBOUR_PULL = 0.35;

/**
 * Seasonal gate on Heat, one entry per calendar month (0 = January).
 * [multiplier on the base weight]
 *
 * A pure function of the calendar with no randomness and no state, which is
 * the shape SPEC2 M18 asks seasons to have. The hard zeros are load-bearing:
 * a weight of zero applies to the persistence bonus as well, so a heat wave
 * that is standing when the season ends CANNOT survive into a month whose gate
 * is zero - there is no heat in January, and that is a property rather than an
 * unlikely event.
 *
 * **Frost has no table here any more.** Its gate is
 * `weather/seasons.ts#frostSeasonFactor`, which reads the SEASON's own winter
 * severity, so the sky and the ground share one winter calendar and one climate
 * table (D-204). This row is deliberately NOT given the same treatment: the
 * season half has no summer term at all to reuse - `SEASON_CLIMATE_WINTER` is
 * about winter and `SEASON_CLIMATE_AMPLITUDE` is the harvest swing, which is
 * exactly zero in the tropics and would forbid a tropical heat wave - so
 * giving heat a climate would mean INVENTING a table rather than reusing one.
 * That booking belongs to M23's climate sets, and D-204 names it as the
 * residual it is.
 */
export const WEATHER_HEAT_SEASON: readonly number[] = [0, 0, 0, 0, 0.5, 1, 1, 1, 0.5, 0, 0, 0];

// --------------------------------------- what the weather costs (SPEC2 M18)

/**
 * The four tables below are the WHOLE economic reach of the weather rule.
 *
 * SPEC2 M18 spells the shape out: "sim effects exclusively as multiplier
 * lookups at existing seams". There is no new mechanic behind any of them -
 * each is a factor multiplied into a number the simulation already computed at
 * a place it already computed it, so a sky can make a journey dearer, a
 * failure likelier or a cargo age faster, and can do nothing else at all.
 *
 * **Clear is exactly 1 in every one of them, and that is load-bearing.** A
 * world with the rule off looks the sky up through `weatherCellAt`, which
 * answers Clear on its first line, so every factor is the multiplicative
 * identity and `x * 1 === x` exactly in IEEE-754. That is what makes "a v28
 * save loads and behaves exactly as before" a property of the arithmetic
 * rather than a hope, and it is why the canonical cross-OS pin did not move
 * when these effects were added.
 *
 * **The numbers are CHOSEN, in the shape of the weight table above, and
 * `tests/unit/weatherEffects.spec.ts` says which of its assertions are
 * read-backs of that choice and which are evidence about the machinery.**
 * What each row fixes is the RATIO between the five skies at one seam; the
 * reasoning per row is with the row.
 */

/**
 * What one sky does to the rolling resistance coefficient of the longitudinal
 * solver (section 11.1), indexed by {@link WeatherCell}.
 * [multiplier on ROLLING_RESISTANCE_RAIL / ROLLING_RESISTANCE_ROAD]
 *
 * Rolling resistance is what happens between a wheel and the ground, so the
 * skies that change the ground are the ones that count: a film of water and
 * the grit it carries costs a little, ice and packed snow cost a lot. Heat
 * leaves the wheel alone and is exactly 1 here - what heat costs is in the
 * cargo table below.
 *
 * A hull and a wing have no rolling resistance at all (D-096), so a ship and
 * an aircraft never read this row - their whole resistance is the drag term.
 */
export const WEATHER_ROLLING_FACTOR: readonly number[] = [
  1, // Clear - the identity
  1.05, // Rain
  1.1, // Storm
  1.3, // Frost - ice and packed snow, the winter failure
  1, // Heat
];

/**
 * What one sky does to the drag coefficient of the longitudinal solver,
 * indexed by {@link WeatherCell}. [multiplier on DRAG_TRAIN/ROAD/SHIP/AIR]
 *
 * Drag is the term that lives in the fluid, so wind is the only sky that has
 * anything to say to it - which is also why this is the row a SHIP feels
 * hardest: a hull's resistance is drag and nothing else (D-096), so a storm at
 * sea is the most expensive weather in the game. Frost and heat are exactly 1:
 * inventing a density correction for them would be inventing a mechanic, which
 * M18 forbids in as many words.
 */
export const WEATHER_DRAG_FACTOR: readonly number[] = [
  1, // Clear - the identity
  1.05, // Rain
  1.4, // Storm - the wind
  1, // Frost
  1, // Heat
];

/**
 * What one sky does to the daily breakdown chance of section 11.3, indexed by
 * {@link WeatherCell}. [multiplier on the chance, before the draw]
 *
 * This is the Z3 seam, and the discipline it is under is the whole reason it
 * is a multiplier on a THRESHOLD rather than anything else: the roll itself is
 * unchanged, one `nextFloat` per eligible vehicle per game day whatever the
 * sky, so the weather spends no draw of its own and cannot shift the shared
 * gameplay stream (Fehlerkatalog 25). The extremes are the failure weather -
 * frozen points and boiling engines - with the storm between them.
 */
export const WEATHER_BREAKDOWN_FACTOR: readonly number[] = [
  1, // Clear - the identity
  1.15, // Rain
  1.6, // Storm
  1.9, // Frost
  1.5, // Heat
];

/**
 * What one sky does to {@link CARGO_EXPIRY_FRACTION_PER_DAY}, indexed by
 * {@link WeatherCell}. [multiplier on the daily share written off]
 *
 * SPEC2 M18 names heat and names nothing else here, so four of the five
 * entries are exactly 1 and a test holds them there. A cold store still stops
 * perishable cargo spoiling outright and a canopy still holds back its third -
 * heat multiplies what is left, so the station modules of section 10 keep
 * exactly the meaning they had.
 */
export const WEATHER_EXPIRY_FACTOR: readonly number[] = [
  1, // Clear - the identity
  1, // Rain
  1, // Storm
  1, // Frost
  1.75, // Heat
];

// -------------------------------------------------- the seasons (SPEC2 M18)

/**
 * The season is a PURE FUNCTION of month, height and climate - no randomness,
 * no state, nothing saved (SPEC2 M18, E-01). The five constants below are the
 * whole of it; `src/sim/weather/seasons.ts` is the only file that reads them.
 *
 * Whether the SIMULATION consults that function is the weather rule, which is
 * a different question and is answered in `weather/effects.ts`: a world with
 * the rule off must behave exactly as it did before M18, and seasonal
 * production would move every balancing band in the game (Fehlerkatalog 34).
 * The function itself stays free of the rule so the renderer can read it for
 * the snow line without asking the simulation anything (Z1).
 */

/**
 * How much winter there is in each calendar month, 0 = January.
 * [percent of full winter severity]
 *
 * Integer percent so the table can be summed and compared exactly. The values
 * are deliberately short of 100 at the peak: the climate and the height
 * multiply this up, and a January that already saturated at sea level would
 * make an arctic mountain indistinguishable from a temperate lowland.
 */
export const SEASON_WINTER_SEVERITY_PERCENT: readonly number[] = [
  60, 55, 35, 12, 0, 0, 0, 0, 0, 10, 30, 55,
];

/**
 * How much winter a climate has, indexed by {@link MapClimate}.
 * [multiplier on the monthly severity]
 *
 * Tropical is a hard zero and is the reason `seasonalOutputFactor` can return
 * exactly 1 for a whole climate: a world that has no winter reads every one of
 * these tables and comes back with the identity.
 */
export const SEASON_CLIMATE_WINTER: readonly number[] = [
  1, // Temperate
  1.5, // Arctic
  0, // Tropical
  0.35, // Desert - cold nights, no snow on the road
];

/**
 * The winter severity at which the SKY's frost gate stands fully open.
 * [dimensionless, on the same scale as the severity of `winterFrictionFactor`]
 *
 * Not a new number: it is computed from the two tables above and is exactly the
 * severity of a January at the shore in the temperate climate - the month and
 * the climate the shipped frost gate was a flat 1 for. Dividing by it is what
 * lets the sky read the SEASON's winter curve (D-204) while a temperate
 * January keeps precisely the frost weight it had before, so the reference coal
 * line's own winter is not silently recalibrated by a fix aimed at the tropics.
 *
 * Derived rather than written out so the two cannot drift: change a month or a
 * climate above and this moves with it.
 */
export const WEATHER_FROST_FULL_SEVERITY =
  (SEASON_WINTER_SEVERITY_PERCENT[0]! / 100) * SEASON_CLIMATE_WINTER[MapClimate.Temperate]!;

/**
 * How much sharper a season gets per height level above {@link SEA_LEVEL}.
 * [addend to the climate multiplier, per level]
 *
 * ONE constant for both halves of the season - the friction and the harvest -
 * because it answers one question: how much more of the year the weather owns
 * as you climb. Playable land runs from level 4 to 15, so the top of the map
 * carries 0.72 more season than the shore.
 */
export const SEASON_HEIGHT_GAIN_PER_LEVEL = 0.06;

/**
 * What full winter severity adds to the rolling resistance coefficient.
 * [addend to the multiplier at severity 1]
 *
 * The season's friction and the sky's friction are separate multipliers on the
 * same coefficient on purpose: a frosty day in July is weather, a hard road in
 * January is the season, and a frosty day in January is both.
 */
export const SEASON_FRICTION_GAIN = 0.2;

/**
 * How strongly the harvest tables below are felt, indexed by
 * {@link MapClimate}. [multiplier on the table's deviation from 1]
 *
 * The factor is `1 + (table - 1) * amplitude`, so an amplitude of zero is a
 * year with no season in it and an amplitude of two doubles the swing. The
 * mean of the table is exactly 1, and an affine transform of a mean-1 table
 * has mean 1 whatever the amplitude - which is what makes a season move WHEN
 * a farm produces rather than how much it produces in a year.
 */
export const SEASON_CLIMATE_AMPLITUDE: readonly number[] = [
  1, // Temperate
  1.4, // Arctic - a short violent growing season
  0, // Tropical - no season at all
  0.6, // Desert
];

/**
 * Ceiling on the amplitude after the height gain. [dimensionless]
 *
 * Totality, not taste: the deepest month of the farm table is 40 percent, so
 * an amplitude above 1.666 would ask a farm for negative output. The cap keeps
 * every factor the function can return strictly positive for every month,
 * height and climate, which is a property `weatherEffects.spec.ts` walks in
 * full rather than sampling.
 */
export const SEASON_AMPLITUDE_MAX = 1.5;

/**
 * A farm's output over the year, one entry per calendar month (0 = January).
 * [percent of the flat monthly rate]
 *
 * Integer percent summing to exactly 1,200, so the year's total is exactly
 * what it was without seasons - a test asserts the sum rather than trusting
 * it. Sowing in spring, the harvest in August, and a winter that produces
 * little but is never zero (an industry that produced nothing is DORMANT
 * under D-086's closure clock, and a farm that stopped every January would
 * spend four months a year looking neglected).
 */
export const SEASON_FARM_OUTPUT_PERCENT: readonly number[] = [
  40, 40, 60, 90, 120, 140, 160, 170, 155, 110, 75, 40,
];

/**
 * A forestry's output over the year, on the same terms - integer percent
 * summing to exactly 1,200.
 *
 * A gentler swing than the farm's: timber grows all year and what the season
 * really moves is how well the ground carries a load out of the wood.
 */
export const SEASON_FORESTRY_OUTPUT_PERCENT: readonly number[] = [
  50, 50, 80, 110, 130, 140, 140, 140, 130, 110, 70, 50,
];

// -------------------------------------------------- road traffic (SPEC.md 8.4)

/**
 * What one road vehicle entering a tile adds to the congestion layer.
 * [layer units per entry]
 *
 * The layer is a Uint8 and 8.4's quantity is "vehicles per tile in the last
 * 200 ticks", which on a road tile is a small number: at 50 m tiles and
 * 20 m/s a vehicle needs 2.5 s to cross one, so an unobstructed single lane
 * passes about four vehicles per window. Counting one per entry would leave
 * the whole layer living in the bottom four values of a byte. Sixteen units
 * per entry spends the byte instead: a stored value divided by this constant
 * IS the specified vehicle count, and the ceiling of 255 is reached at sixteen
 * vehicles in the window - a tile nothing but a queue can produce.
 */
export const ROAD_CONGESTION_UNITS_PER_ENTRY = 16;

/**
 * How often the congestion layer decays. [ticks]
 *
 * One real second at 1x. Per-tick decay would be twenty times the sweeps for a
 * quantity measured over two hundred ticks, and a coarser epoch would make the
 * decay visibly stepped in the heat map. The phase is `tick % EPOCH`, so it is
 * a pure function of the saved tick and survives a save/load round trip
 * without a field of its own.
 */
export const ROAD_CONGESTION_EPOCH_TICKS = 20;

/**
 * Divisor of the per-epoch loss: a tile loses `ceil(value / DIVISOR)` units
 * every epoch. [1]
 *
 * Eleven makes the surviving fraction 10/11 per epoch, which over the 200 tick
 * window of 8.4 is (10/11)^10 = 0.386 - one over e, to two decimals. So the
 * layer is an exponential window with a time constant of 210 ticks, which is
 * the honest reading of "the last 200 ticks" for a quantity that has to decay
 * smoothly rather than fall off a cliff. Rounding the loss UP is what makes a
 * value reach zero in finite time instead of approaching it for ever, which is
 * what lets the dirty list of net/congestion.ts ever drop a tile.
 */
export const ROAD_CONGESTION_DECAY_DIVISOR = 11;

/**
 * How many tiles may carry congestion at once. [tiles]
 *
 * The dirty list is capped so that a 2048^2 benchmark map does not pay four
 * megabytes for a list that holds a few thousand entries, and the cap is a
 * REFUSAL rather than an eviction (the M13 particle-pool precedent): recording
 * a tile the sweep can never reach again would leave a phantom jam in the A*
 * costs for the rest of the game.
 *
 * It is deliberately above what the fleet can physically keep alive. One entry
 * decays to zero in eleven epochs, so a tile stays listed for at most about
 * 220 ticks; a road vehicle crosses a tile in 50 ticks at speed, so it keeps
 * at most five tiles alive at once. MAX_VEHICLES is 4_000, giving 20_000 tiles
 * for a fleet of nothing but road vehicles - and this cap is three times that.
 */
export const MAX_CONGESTED_TILES = 65_536;

/**
 * What one unit of congestion adds to a road A* step.
 * [tile equivalents per layer unit]
 *
 * The road pathfinder measures in tile equivalents (a flat tile is 1), so this
 * is where 8.4's congestion term meets the distance it competes with. One
 * sixteenth of a tile per vehicle in the window: four vehicles double the cost
 * of the tile they are on, so a jammed lane is worth a detour of one tile per
 * jammed tile, and a saturated tile is worth four. Exactly 1/64, which is a
 * power of two and therefore bit-exact in the Float32 score arrays (law #4).
 */
export const ROAD_CONGESTION_COST_PER_UNIT = 0.015625;

/**
 * How much of its top speed a road vehicle loses per unit of congestion AHEAD
 * of it. [fraction of top speed per layer unit]
 *
 * 0.0025 is four per cent per vehicle in the window - traffic a driver reacts
 * to rather than a wall. The vehicle's own entry is subtracted before this is
 * applied (net/congestion.ts), so a lone vehicle on an empty road is never
 * slowed by its own trail.
 */
export const ROAD_CONGESTION_SPEED_LOSS_PER_UNIT = 0.0025;

/**
 * Slowest a congested road may make a vehicle, as a fraction of its top speed.
 * [1]
 *
 * A jam in this game is a cost term and a queue, never a standstill: E-03
 * vetoes car-following, so nothing here models the gap between two vehicles
 * and a factor of zero would strand a lorry on a tile with no leader to wait
 * for. Just over a third of top speed is walking pace for a lorry and is
 * reached only where the layer is saturated.
 */
export const ROAD_CONGESTION_MIN_SPEED_FACTOR = 0.35;

// ------------------------------------------------------------------ signals

/**
 * Price and upkeep of one signal. [cent]
 *
 * A third of a plain track tile to build, and the 5 % of the build price a year
 * that plain track already carries. First-draft figures: balancing scenario 5
 * of section 19.4 owns the final numbers, the same posture D-041 took for the
 * lorry prices.
 */
export const SIGNAL_COST_CT = 300 * CENTS_PER_EURO;
export const SIGNAL_UPKEEP_CT_PER_YEAR = 15 * CENTS_PER_EURO;

/**
 * A waypoint marker (section 12.1): a post beside the track, a buoy on the
 * water, a sign at the roadside. Cheaper than a signal because it decides
 * nothing - it only names a tile a route has to pass through. First-draft
 * figures in the D-041 posture: nothing measures them yet. [cent]
 */
export const WAYPOINT_COST_CT = 200 * CENTS_PER_EURO;
export const WAYPOINT_UPKEEP_CT_PER_YEAR = 10 * CENTS_PER_EURO;

/**
 * How far short of a signal tile a held train's head comes to rest. [m]
 *
 * A tenth of a tile, so the train visibly stands before the boundary and the
 * snapshot's progress fraction never reads a full 1000 - which would draw it
 * sitting on the very tile it is being held out of.
 */
export const SIGNAL_STOP_OFFSET_M = 5;

/**
 * Largest block a block signal can claim in one go. [tiles]
 *
 * A bigger block is ten kilometres of rail with no signal on it, where block
 * signalling means nothing anyway; such a signal falls back to claiming the
 * train's own route, which is what a path signal does.
 */
export const MAX_BLOCK_CLAIM_TILES = 4_096;

/**
 * How long a train may sit at a signal with no progress before the game says
 * so. [ticks]
 *
 * One real minute at 1x. Section 9.3: the game helps the player FIND a
 * deadlock, it never resolves one - an automatic fix would hide real bugs and
 * rob the player of the one lesson signals exist to teach.
 */
export const DEADLOCK_WARN_TICKS = 1_200;

/**
 * How many trains stuck on ONE piece of track make it a bottleneck rather
 * than an unlucky single train. [trains]
 *
 * Two, because two is the smallest number that is a QUEUE: one train held at
 * a red is the ordinary 9.3 warning and says nothing about capacity, while a
 * second train waiting for the identical tile says demand for that tile
 * exceeds what it can pass. The threshold is deliberately not a throughput
 * figure - the throughput counters are a derived instrument the news may
 * never read (SPEC2 M15, D-186).
 */
export const BOTTLENECK_MIN_WAITERS = 2;

// ------------------------------------------- throughput meter (SPEC2 M15)

/**
 * Train passes over one tile in a game month that the utilisation heat map
 * draws as fully used. [train passes per tile per month]
 *
 * A game month is TICKS_PER_MONTH / 20 = 300 seconds of vehicle time, so a
 * block's monthly capacity is 300 s divided by its cycle time. At the
 * assistant's default spacing (AUTO_SIGNAL_SPACING_TILES = 12 tiles = 600 m)
 * and a modest freight speed of 20 m/s a train needs 30 s to clear a block,
 * which is ten passes a month; twelve is that with the headroom a shorter
 * block buys. Everything above it saturates the ramp, which is what a heat
 * map is for - the exact figure above "full" is not information.
 */
export const THROUGHPUT_FULL_SCALE_PASSES = 12;

/**
 * How many tiles may carry a throughput count at once. [tiles]
 *
 * The same argument as MAX_CONGESTED_TILES: the meter keeps the tiles that
 * carry something so the monthly clear walks a list instead of the map, and
 * the list is capped rather than grown. 65,536 is more track than MAX_VEHICLES
 * trains can drive over in one game month (a train covers at most ~480 tiles
 * in 300 s), and past it the meter REFUSES rather than evicting - a recorded
 * tile the clear can never reach again would keep a phantom reading on the
 * heat map for the rest of the game (the M13 particle-pool precedent).
 */
export const MAX_METERED_TILES = 65_536;

/**
 * Node budget for one ship search.
 *
 * Larger than the road budget because open water is an eight-connected graph
 * with no roads to funnel the search: a strait a hundred tiles away is reached
 * by expanding a fan, not a corridor.
 */
export const MAX_WATER_SEARCH_NODES = 40_000;

/** Default spacing when the assistant signals a route for you. [tiles] */
export const AUTO_SIGNAL_SPACING_TILES = 12;

/**
 * How close a station has to be for automatic signalling to place a PATH
 * signal rather than a block signal. [tiles]
 *
 * A station throat is the one shape where two trains can cross on routes that
 * never touch, and a block signal there would take the whole throat for one of
 * them (section 9.4).
 */
export const AUTO_SIGNAL_STATION_RADIUS = 4;

/**
 * Bound on the backward walk that finds the tiles a train's body still covers.
 * The longest legal train divided by the tile size, plus one for the tile the
 * tail has only partly left.
 */
export const MAX_TRAIN_OCCUPIED_TILES = MAX_TRAIN_LENGTH_M / TILE_SIZE_M + 1;

// -------------------------------------------------------------- construction

/**
 * Road construction prices.
 *
 * Calibrated against balancing scenario 1 (section 19.4), not chosen by feel:
 * a 25 tile bus line with two buses between two towns of 1,200 has to pay for
 * itself within two to four game years. See DECISIONS.md for why the absolute
 * scale ends up small next to the starting capital.
 */
export const ROAD_COST_PER_TILE_CT = 200 * CENTS_PER_EURO;

/** Yearly upkeep of one road tile. [cent] */
export const ROAD_UPKEEP_PER_TILE_CT = 10 * CENTS_PER_EURO;

/** Price of a bus stop or lorry bay. [cent] */
export const ROAD_STOP_COST_CT = 2_000 * CENTS_PER_EURO;
export const ROAD_STOP_UPKEEP_CT = 200 * CENTS_PER_EURO;

/** Price of a road depot. [cent] */
export const ROAD_DEPOT_COST_CT = 3_000 * CENTS_PER_EURO;
export const ROAD_DEPOT_UPKEEP_CT = 300 * CENTS_PER_EURO;

/**
 * Price of one rail platform tile and of a rail depot.
 *
 * A platform is dearer than a bus stop by roughly the factor track is dearer
 * than road, so that the choice between the two modes stays a question of
 * throughput rather than of which one happens to be cheap this milestone.
 * [cent]
 */
export const RAIL_PLATFORM_COST_CT = 9_000 * CENTS_PER_EURO;
export const RAIL_PLATFORM_UPKEEP_CT = 900 * CENTS_PER_EURO;

export const RAIL_DEPOT_COST_CT = 14_000 * CENTS_PER_EURO;
export const RAIL_DEPOT_UPKEEP_CT = 1_400 * CENTS_PER_EURO;

/**
 * The three support modules of section 10, which stand beside the line rather
 * than on it.
 *
 * Priced against what each one buys. A freight terminal turns over a goods yard
 * half again as fast and is the dearest; a canopy is worth eight rating points
 * and a third off cargo spoilage; a cold store is narrow - it only matters for
 * food, livestock and chemicals - so it is the cheapest of the three but has
 * the highest upkeep, because a cold store runs on electricity.
 */
export const FREIGHT_TERMINAL_COST_CT = 18_000 * CENTS_PER_EURO;
export const FREIGHT_TERMINAL_UPKEEP_CT = 1_600 * CENTS_PER_EURO;

export const CANOPY_COST_CT = 9_000 * CENTS_PER_EURO;
export const CANOPY_UPKEEP_CT = 700 * CENTS_PER_EURO;

export const COLD_STORE_COST_CT = 12_000 * CENTS_PER_EURO;
export const COLD_STORE_UPKEEP_CT = 2_100 * CENTS_PER_EURO;

/**
 * The water modules of section 10.
 *
 * A quay is dearer than a rail platform and much dearer than a lorry bay: it is
 * built into the sea bed, and a port is meant to be a commitment rather than
 * something dotted along a coast. The shed is where ships are bought.
 */
export const QUAY_COST_CT = 26_000 * CENTS_PER_EURO;
export const QUAY_UPKEEP_CT = 2_200 * CENTS_PER_EURO;

export const SHIP_DEPOT_COST_CT = 34_000 * CENTS_PER_EURO;
export const SHIP_DEPOT_UPKEEP_CT = 2_600 * CENTS_PER_EURO;

/**
 * The three airport sizes of M7, indexed by AirportSize.
 *
 * They differ in what they cost, how many aircraft can be worked at once, and
 * how long a landing occupies the runway. An airstrip is a field with a shed;
 * an international airport is an investment that only pays with a real network
 * behind it - which is the decision the three sizes exist to pose.
 */
export const AIRPORT_COST_CT: readonly number[] = [
  48_000 * CENTS_PER_EURO,
  140_000 * CENTS_PER_EURO,
  340_000 * CENTS_PER_EURO,
];

export const AIRPORT_UPKEEP_CT: readonly number[] = [
  4_200 * CENTS_PER_EURO,
  11_000 * CENTS_PER_EURO,
  24_000 * CENTS_PER_EURO,
];

/** Runways, and therefore aircraft that can be on the ground at once. */
export const AIRPORT_RUNWAYS: readonly number[] = [1, 2, 4];

/**
 * Ticks one landing occupies a runway (section 8.4).
 *
 * A bigger airport turns an aircraft round faster because it has the taxiways
 * and the stands to do it, not because its runway is shorter.
 */
export const AIRPORT_RUNWAY_TICKS: readonly number[] = [120, 90, 60];

/**
 * Aircraft that may hold over one airport before the rest are turned away
 * (section 8.4 gives four).
 *
 * A holding aircraft burns fuel and earns nothing, which is the pressure that
 * makes a second runway worth buying. Beyond the stack an aircraft simply waits
 * where it is rather than vanishing - there is no fuel exhaustion in this game
 * and inventing one would be a punishment nobody asked for.
 */
export const AIRPORT_HOLDING_SLOTS = 4;

/** A freight terminal multiplies the time a stop takes by this (section 10). */
export const FREIGHT_TERMINAL_LOAD_FACTOR = 1 / 1.5;

/** A canopy leaves this share of the daily spoilage at a station standing. */
export const CANOPY_DECAY_FACTOR = 0.7;

/**
 * What a train longer than the platform still manages to load (section 10).
 *
 * The share of the train that fits, and then a further forty percent off: the
 * part hanging off the end has to be shunted into place and worked separately,
 * which is slow enough that a player should lengthen the platform instead.
 */
export const PLATFORM_OVERHANG_PENALTY = 0.4;

/**
 * Bridges and tunnels (section 8.3).
 *
 * A tile of bridge costs ten times a tile of plain track, a tile of tunnel
 * sixteen. Both prices rise further with the span, so that crossing a river at
 * the narrows is worth the detour and boring straight through a range never is.
 * [cent per tile]
 */
export const BRIDGE_COST_PER_TILE_CT = 9_000 * CENTS_PER_EURO;
export const BRIDGE_UPKEEP_PER_TILE_CT = 450 * CENTS_PER_EURO;

export const TUNNEL_COST_PER_TILE_CT = 14_500 * CENTS_PER_EURO;
export const TUNNEL_UPKEEP_PER_TILE_CT = 350 * CENTS_PER_EURO;

/**
 * Longest span of each. A bridge is limited by what can stand up, a tunnel by
 * how far a train may run without a way out. [tiles from end to end]
 */
export const MAX_BRIDGE_SPAN_TILES = 12;
export const MAX_TUNNEL_SPAN_TILES = 20;

/** Refund when demolishing, as a share of the build price. */
export const DEMOLITION_REFUND = 0.25;

/**
 * What a vehicle fetches second hand when it is brand new, as a share of its
 * price; it falls to nothing over the design life. Buying the wrong vehicle
 * has to hurt, but not so much that nobody ever corrects a mistake.
 */
export const RESALE_SHARE = 0.6;

/**
 * Share of the purchase price a conversion costs. Enough that fitting the right
 * vehicle in the first place is worth doing, cheap enough that a line can be
 * repurposed when the chain around it changes.
 */
export const REFIT_COST_SHARE = 0.08;

// ------------------------------------------------------------------ company

/** Number of selectable company colours (Okabe-Ito palette, colour-blind safe). */
export const COMPANY_COLOR_COUNT = 8;

/** Upper bound for a player supplied company name. [UTF-16 code units] */
export const MAX_COMPANY_NAME_LENGTH = 40;

/** How many AI competitors a game can be started with (section 15). */
export const MAX_AI_COMPANIES = 5;

/** The player plus the most AI companies there can be. */
export const MAX_COMPANIES = MAX_AI_COMPANIES + 1;

/**
 * Owner value for a tile nobody built: town roads, and every tile of open
 * country. 255 rather than -1 because the layer is a Uint8Array, and company
 * ids never reach it.
 */
export const TILE_PUBLIC = 255;

// ----------------------------------------------------------------- fixed point

/** Fractional bits of the Q16.16 fixed point format used by the trig tables. */
export const FIXED_POINT_BITS = 16;

/** 1.0 expressed in Q16.16. */
export const FIXED_POINT_ONE = 1 << FIXED_POINT_BITS; // 65_536

/** Entries of the sine lookup table (one full turn). Must stay a power of two. */
export const TRIG_TABLE_SIZE = 4096;
