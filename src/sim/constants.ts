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

/** Half width of the initial built-up area per town size. [tiles] */
export const TOWN_START_RADIUS = [10, 6, 3] as const;

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

/** Nominal annual interest rate per difficulty, booked monthly. [1/year] */
export const LOAN_INTEREST_RATE_PER_YEAR: readonly number[] = [0.04, 0.04, 0.065];

// ---------------------------------------------------------------- economy

/** Inflation applied to revenue and costs alike, per game year. [1/year] */
export const INFLATION_PER_YEAR = 0.018;

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

/** Production is booked in this many slices per month, like town output. */
export const INDUSTRY_PRODUCTION_SLICES_PER_MONTH = 30;

/**
 * Production level, in percent of the base figure.
 *
 * An industry that is well served grows, one that is not shrinks - but never to
 * nothing, so a line that was abandoned can be picked up again.
 */
export const INDUSTRY_LEVEL_START = 100;
export const INDUSTRY_LEVEL_MIN = 25;
export const INDUSTRY_LEVEL_MAX = 200;
export const INDUSTRY_LEVEL_STEP = 25;

/**
 * Share of what was produced that has to be collected for the level to move.
 *
 * The ratio divides by the UNGATED production, so an industry served by a
 * station rated 50 can never exceed 0.5 and can never reach the growth
 * threshold. That single choice is the death spiral of section 10.1 applied to
 * freight: a second train pays for itself in tonnage, not just in trips.
 */
export const INDUSTRY_GROWTH_RATIO = 0.85;
export const INDUSTRY_DECLINE_RATIO = 0.45;

/**
 * Months an industry holds its level before it may move again.
 *
 * One game month is five real minutes at 1x. Without the dead band a single
 * missed month would halve a line and the player would never see why; with it,
 * the level only moves on a settled trend.
 */
export const INDUSTRY_LEVEL_HYSTERESIS_MONTHS = 3;

/** How much of one cargo an industry holds before it stops taking more. [units] */
export const INDUSTRY_STOCK_CAP = 500;

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

/** Waiting-time term: full marks below this age, zero above the second. [days] */
export const RATING_WAIT_GOOD_DAYS = 2;
export const RATING_WAIT_BAD_DAYS = 20;
export const RATING_WAIT_MAX = 30;

/** Frequency term: vehicle visits counted over this window. [days] */
export const RATING_FREQUENCY_WINDOW_DAYS = 20;
export const RATING_FREQUENCY_MAX = 20;
export const RATING_FREQUENCY_SATURATION_VISITS = 40;

export const RATING_EQUIPMENT_MAX = 15;
export const RATING_RELIABILITY_MAX = 10;
export const RATING_OVERFLOW_PENALTY_MAX = 15;

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

/** Reliability of a new vehicle, and its yearly decay. [0..10000] */
export const RELIABILITY_MAX = 10_000;
export const RELIABILITY_DECAY_PER_YEAR = 400;
export const RELIABILITY_SERVICE_GAIN = 600;

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

/** Default spacing when the assistant signals a route for you. [tiles] */
export const AUTO_SIGNAL_SPACING_TILES = 12;

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

// ----------------------------------------------------------------- fixed point

/** Fractional bits of the Q16.16 fixed point format used by the trig tables. */
export const FIXED_POINT_BITS = 16;

/** 1.0 expressed in Q16.16. */
export const FIXED_POINT_ONE = 1 << FIXED_POINT_BITS; // 65_536

/** Entries of the sine lookup table (one full turn). Must stay a power of two. */
export const TRIG_TABLE_SIZE = 4096;
