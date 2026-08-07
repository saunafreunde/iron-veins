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

// ------------------------------------------------------------------ AI (15)

/**
 * How often a competitor thinks, in ticks (section 15).
 *
 * Twenty seconds of real time at normal speed. Fast enough that a company
 * reacts inside a game month, slow enough that five of them cost nothing
 * measurable per tick.
 */
export const AI_DECISION_INTERVAL_TICKS = 400;

/** Shortest and longest haul a competitor will consider. [tiles] */
export const AI_MIN_DISTANCE = 15;
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
 * Vehicles a new line starts with, and the most it can ever be given.
 *
 * ONE. A line's fleet is most of what it costs to open, and a competitor that
 * buys two of everything can afford half as many lines - which matters far more
 * than the frequency does, because an unfinished chain kills the works at the
 * end of it. Cargo piling up at the first stop is what buys the second vehicle,
 * and that is the reinforcement rule doing its job.
 */
export const AI_VEHICLES_PER_LINE = 1;

/**
 * Share of a town's inhabitants a competitor assumes it could carry in a month.
 *
 * Generous on purpose: a town is the one source that never runs dry, and what
 * really limits a passenger line is the station rating.
 */
export const AI_TOWN_OUTPUT_SHARE = 0.5;

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
 * Signal spacing on AI track, in tiles. ZERO: no automatic signalling.
 *
 * The automatic signalling of section 9.4 lays ONE-WAY signals facing the way
 * the line was drawn, which is exactly right for a main line worked in one
 * direction and exactly wrong for what a competitor builds: a single track
 * between two industries, worked out and back. The return trip is refused by
 * the very signals meant to help, the train sits in its shed with no route,
 * and the line is closed six months later as unprofitable. That was the whole
 * of the first company measured against balancing scenario 5.
 *
 * An unsignalled single line carries one train, which is what a new line has.
 * The line review closes it if a second one ever deadlocks against the first.
 */
export const AI_SIGNAL_SPACING = 0;

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
