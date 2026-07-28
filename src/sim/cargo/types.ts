/**
 * The eighteen cargo types of section 7.1.
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
 */

export const Cargo = {
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
} as const;
export type Cargo = (typeof Cargo)[keyof typeof Cargo];

export const CARGO_COUNT = 18;

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
];
