/**
 * The cargo types of section 7.1 - eighteen of them until SPEC2 M19 split the
 * passenger trade into two classes and made it twenty.
 *
 * The numbers are starting values. The balancing tests of section 19.4 are the
 * authority on them - when a test leaves its tolerance band, this table gets
 * adjusted, never the test.
 *
 * The freight rates were raised fourfold in M5 against their first draft. The
 * revenue-ceiling test found that at the original figures NO freight vehicle
 * could cover its own upkeep on a line of any length: a bus carried 150
 * passengers at 950 a head while a lorry carried 14 tonnes of coal at 210, and
 * the passenger side is the one that is calibrated and in band. See
 * DECISIONS.md D-066.
 *
 * The two passenger classes of SPEC2 E-08 are OWN IDS and never per-parcel
 * attributes (Fehlerkatalog 28): own ids leave the stack merge key, the M5
 * routing, the rating, the tariff table, the refit validation and the D-118
 * dead-end walk exactly as they were, and they cost the fixed-size cargo
 * arrays exactly two entries.
 */

export const Cargo = {
  /**
   * RETIRED in SPEC2 M19 and kept only so no other cargo has to change its
   * number.
   *
   * Nothing produces it since the town split its passenger output into
   * CommuterPax and BusinessPax, and the v29 -> v30 migration rewrites every
   * parcel, refit, order, ring slot and lifetime tally that carried it to
   * CommuterPax. The id stays because a cargo id is a NUMBER in every save
   * ever written: renumbering the seventeen cargoes above it would rewrite
   * every capacity map, every history ring index and every stack in one go,
   * for the sake of a slot that costs two table rows.
   *
   * `tests/unit/deliveries.spec.ts` holds the retirement: no industry and no
   * town may produce it, so it can never become a dead end.
   */
  Passengers: 0,
  Mail: 1,
  Coal: 2,
  IronOre: 3,
  Steel: 4,
  Wood: 5,
  Planks: 6,
  Grain: 7,
  Livestock: 8,
  Food: 9,
  Goods: 10,
  Oil: 11,
  Chemicals: 12,
  Plastics: 13,
  Electronics: 14,
  Gravel: 15,
  Cement: 16,
  Containers: 17,
  /**
   * The commuter (SPEC2 M19, E-08). What a residential or industrial zone
   * offers: the same traveller balancing scenario 1 was calibrated on, at the
   * same rate and the same patience, under a new number.
   */
  CommuterPax: 18,
  /**
   * The business traveller (SPEC2 M19, E-08). What a COMMERCIAL zone offers:
   * pays 1.6 times the commuter fare and loses that premium twice as fast, so
   * a slow line carrying business passengers earns barely more than a fast one
   * carrying commuters - which is how speed becomes money on the passenger
   * side (SPEC.md section 1, pillar 2).
   */
  BusinessPax: 19,
} as const;
export type Cargo = (typeof Cargo)[keyof typeof Cargo];

export const CARGO_COUNT = 20;

/**
 * The passenger classes of SPEC2 M19, ascending.
 *
 * They share a vehicle's seats: a coach refitted to one of them loads that
 * class first and fills the rest of its room with the other (see
 * `vehicles/update.ts`). The list is what every "is this a passenger" test in
 * the simulation reads, so a third class would be one entry rather than a
 * grep - and it is fixed-size, because it is walked inside the tick.
 */
export const PASSENGER_CLASSES: readonly Cargo[] = [Cargo.CommuterPax, Cargo.BusinessPax];

/** True for the passenger classes of SPEC2 M19 - and never for the retired id. */
export function isPassengerClass(cargo: number): boolean {
  return cargo === Cargo.CommuterPax || cargo === Cargo.BusinessPax;
}

/**
 * The other passenger class, or -1 for anything that is not one.
 *
 * The shared-seat rule of D-207 asks exactly this question once per stop, and
 * asking it through a function rather than through a conditional keeps the
 * "who shares a seat with whom" decision in one place.
 */
export function otherPassengerClass(cargo: number): number {
  if (cargo === Cargo.CommuterPax) return Cargo.BusinessPax;
  if (cargo === Cargo.BusinessPax) return Cargo.CommuterPax;
  return -1;
}

export interface CargoSpec {
  readonly id: Cargo;
  /** i18n key of the cargo name. */
  readonly nameKey: string;
  /** i18n key of the unit (person, sack, tonne, head, TEU). */
  readonly unitKey: string;
  /** Payment per unit over 100 tiles, before time and epoch factors. [cent] */
  /**
   * Payment per unit over one hundred tiles, before every other factor. [cent]
   *
   * The two passenger-side rates are what balancing scenario 1 is calibrated
   * on. Every freight rate was multiplied by ten against scenario 2, which is
   * the scenario section 19.4 names as the authority over exactly these numbers
   * - see DECISIONS.md D-087 for what the measurement was.
   */
  readonly baseRateCt: number;
  /** Days in transit before the payment starts to decay. [days] */
  readonly graceDays: number;
  /** Share of the payment lost per day beyond the grace period. [1/day] */
  readonly decayPerDay: number;
  /** True when the cargo needs a refrigerated vehicle to keep its full value. */
  readonly needsCooling: boolean;
}

export const CARGO_SPECS: readonly CargoSpec[] = [
  {
    id: Cargo.Passengers,
    nameKey: 'cargo.passengers',
    unitKey: 'cargo.unit.person',
    baseRateCt: 950,
    graceDays: 4,
    decayPerDay: 0.05,
    needsCooling: false,
  },
  {
    id: Cargo.Mail,
    nameKey: 'cargo.mail',
    unitKey: 'cargo.unit.sack',
    baseRateCt: 780,
    graceDays: 3,
    decayPerDay: 0.065,
    needsCooling: false,
  },
  {
    id: Cargo.Coal,
    nameKey: 'cargo.coal',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 8_400,
    graceDays: 30,
    decayPerDay: 0.004,
    needsCooling: false,
  },
  {
    id: Cargo.IronOre,
    nameKey: 'cargo.ironOre',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 9_600,
    graceDays: 30,
    decayPerDay: 0.004,
    needsCooling: false,
  },
  {
    id: Cargo.Steel,
    nameKey: 'cargo.steel',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 16_800,
    graceDays: 22,
    decayPerDay: 0.008,
    needsCooling: false,
  },
  {
    id: Cargo.Wood,
    nameKey: 'cargo.wood',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 10_400,
    graceDays: 26,
    decayPerDay: 0.006,
    needsCooling: false,
  },
  {
    id: Cargo.Planks,
    nameKey: 'cargo.planks',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 16_000,
    graceDays: 22,
    decayPerDay: 0.008,
    needsCooling: false,
  },
  {
    id: Cargo.Grain,
    nameKey: 'cargo.grain',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 12_000,
    graceDays: 14,
    decayPerDay: 0.018,
    needsCooling: false,
  },
  {
    id: Cargo.Livestock,
    nameKey: 'cargo.livestock',
    unitKey: 'cargo.unit.head',
    baseRateCt: 20_800,
    graceDays: 6,
    decayPerDay: 0.055,
    needsCooling: true,
  },
  {
    id: Cargo.Food,
    nameKey: 'cargo.food',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 25_600,
    graceDays: 8,
    decayPerDay: 0.048,
    needsCooling: true,
  },
  {
    id: Cargo.Goods,
    nameKey: 'cargo.goods',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 36_000,
    graceDays: 12,
    decayPerDay: 0.022,
    needsCooling: false,
  },
  {
    id: Cargo.Oil,
    nameKey: 'cargo.oil',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 14_000,
    graceDays: 26,
    decayPerDay: 0.006,
    needsCooling: false,
  },
  {
    id: Cargo.Chemicals,
    nameKey: 'cargo.chemicals',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 28_000,
    graceDays: 16,
    decayPerDay: 0.02,
    needsCooling: true,
  },
  {
    id: Cargo.Plastics,
    nameKey: 'cargo.plastics',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 22_400,
    graceDays: 20,
    decayPerDay: 0.012,
    needsCooling: false,
  },
  {
    id: Cargo.Electronics,
    nameKey: 'cargo.electronics',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 60_000,
    graceDays: 10,
    decayPerDay: 0.035,
    needsCooling: false,
  },
  {
    id: Cargo.Gravel,
    nameKey: 'cargo.gravel',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 6_000,
    graceDays: 30,
    decayPerDay: 0.003,
    needsCooling: false,
  },
  {
    id: Cargo.Cement,
    nameKey: 'cargo.cement',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 10_400,
    graceDays: 24,
    decayPerDay: 0.007,
    needsCooling: false,
  },
  {
    id: Cargo.Containers,
    nameKey: 'cargo.containers',
    unitKey: 'cargo.unit.teu',
    // A loaded twenty-foot container is fourteen tonnes of goods, and it was
    // priced as if it were one. See CARGO_TONNES_PER_UNIT.
    baseRateCt: 120_000,
    graceDays: 18,
    decayPerDay: 0.015,
    needsCooling: false,
  },
  {
    id: Cargo.CommuterPax,
    nameKey: 'cargo.commuterPax',
    unitKey: 'cargo.unit.person',
    // Literally the retired passenger row above. Balancing scenario 1 is
    // calibrated on these three numbers (D-039), the class split must not
    // move them, and `tests/unit/deliveries.spec.ts` holds the two rows
    // together so a future edit cannot separate them by accident.
    baseRateCt: 950,
    graceDays: 4,
    decayPerDay: 0.05,
    needsCooling: false,
  },
  {
    id: Cargo.BusinessPax,
    nameKey: 'cargo.businessPax',
    unitKey: 'cargo.unit.person',
    // 1.6x the commuter fare and twice the decay beyond the same grace
    // period - SPEC2 M19's two split constants, and the only two numbers the
    // class split invents. The grace period is deliberately the commuter's:
    // doubling the decay is what makes a slow line lose the premium, and
    // halving the grace as well would have taken it away before the line's
    // speed could decide anything.
    baseRateCt: 1_520,
    graceDays: 4,
    decayPerDay: 0.1,
    needsCooling: false,
  },
];

/** Spec of a cargo type. */
export function cargoSpec(cargo: Cargo): CargoSpec {
  return CARGO_SPECS[cargo]!;
}

/**
 * What one unit of each cargo weighs, indexed by {@link Cargo}. [t]
 *
 * Only trains use this: a loaded freight train weighs three times what its
 * wagons do, and that is precisely why it needs a second locomotive to get over
 * a pass. Road vehicle masses in the catalogue are laden figures already, so
 * adding a payload there would silently make every bus of M2 heavier than the
 * balancing scenario was calibrated against (DECISIONS.md D-045).
 *
 * Units that are not tonnes get a plausible conversion: a passenger with
 * luggage 80 kg, a mail sack 30 kg, a head of livestock 500 kg, a loaded
 * twenty-foot container 14 t.
 */
export const CARGO_TONNES_PER_UNIT: readonly number[] = [
  0.08, // Passengers
  0.03, // Mail
  1, // Coal
  1, // IronOre
  1, // Steel
  1, // Wood
  1, // Planks
  1, // Grain
  0.5, // Livestock
  1, // Food
  1, // Goods
  1, // Oil
  1, // Chemicals
  1, // Plastics
  1, // Electronics
  1, // Gravel
  1, // Cement
  14, // Containers
  0.08, // CommuterPax - a passenger with luggage, exactly as the retired row
  0.08, // BusinessPax - the same person in a better seat
];
