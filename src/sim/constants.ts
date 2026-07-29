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
 * A vehicle that was stopped, sold off its orders or sent to a depot half way
 * would otherwise report a leg time of several game months and make the whole
 * network look unreachable.
 */
export const LINK_SAMPLE_MAX_TICKS = 10 * TICKS_PER_DAY;

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
 * Slack when deciding whether a vehicle carries a parcel closer to its
 * destination. [ticks]
 *
 * Purely to absorb floating point noise: the expected time IS the minimum over
 * exactly these sums, so the comparison would be exact but for rounding. It is
 * deliberately not a real detour allowance - cargo that accepts a detour can be
 * carried out and back on the same line and would then be paid for both legs.
 */
export const CARGO_ROUTE_EPSILON_TICKS = 1;

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
