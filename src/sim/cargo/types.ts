/**
 * The eighteen cargo types of section 7.1.
 *
 * The numbers are starting values. The balancing tests of section 19.4 are the
 * authority on them - when a test leaves its tolerance band, this table gets
 * adjusted, never the test.
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
    baseRateCt: 210,
    graceDays: 30,
    decayPerDay: 0.004,
    needsCooling: false,
  },
  {
    id: Cargo.IronOre,
    nameKey: 'cargo.ironOre',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 240,
    graceDays: 30,
    decayPerDay: 0.004,
    needsCooling: false,
  },
  {
    id: Cargo.Steel,
    nameKey: 'cargo.steel',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 420,
    graceDays: 22,
    decayPerDay: 0.008,
    needsCooling: false,
  },
  {
    id: Cargo.Wood,
    nameKey: 'cargo.wood',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 260,
    graceDays: 26,
    decayPerDay: 0.006,
    needsCooling: false,
  },
  {
    id: Cargo.Planks,
    nameKey: 'cargo.planks',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 400,
    graceDays: 22,
    decayPerDay: 0.008,
    needsCooling: false,
  },
  {
    id: Cargo.Grain,
    nameKey: 'cargo.grain',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 300,
    graceDays: 14,
    decayPerDay: 0.018,
    needsCooling: false,
  },
  {
    id: Cargo.Livestock,
    nameKey: 'cargo.livestock',
    unitKey: 'cargo.unit.head',
    baseRateCt: 520,
    graceDays: 6,
    decayPerDay: 0.055,
    needsCooling: true,
  },
  {
    id: Cargo.Food,
    nameKey: 'cargo.food',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 640,
    graceDays: 8,
    decayPerDay: 0.048,
    needsCooling: true,
  },
  {
    id: Cargo.Goods,
    nameKey: 'cargo.goods',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 900,
    graceDays: 12,
    decayPerDay: 0.022,
    needsCooling: false,
  },
  {
    id: Cargo.Oil,
    nameKey: 'cargo.oil',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 350,
    graceDays: 26,
    decayPerDay: 0.006,
    needsCooling: false,
  },
  {
    id: Cargo.Chemicals,
    nameKey: 'cargo.chemicals',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 700,
    graceDays: 16,
    decayPerDay: 0.02,
    needsCooling: true,
  },
  {
    id: Cargo.Plastics,
    nameKey: 'cargo.plastics',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 560,
    graceDays: 20,
    decayPerDay: 0.012,
    needsCooling: false,
  },
  {
    id: Cargo.Electronics,
    nameKey: 'cargo.electronics',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 1500,
    graceDays: 10,
    decayPerDay: 0.035,
    needsCooling: false,
  },
  {
    id: Cargo.Gravel,
    nameKey: 'cargo.gravel',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 150,
    graceDays: 30,
    decayPerDay: 0.003,
    needsCooling: false,
  },
  {
    id: Cargo.Cement,
    nameKey: 'cargo.cement',
    unitKey: 'cargo.unit.tonne',
    baseRateCt: 260,
    graceDays: 24,
    decayPerDay: 0.007,
    needsCooling: false,
  },
  {
    id: Cargo.Containers,
    nameKey: 'cargo.containers',
    unitKey: 'cargo.unit.teu',
    baseRateCt: 1100,
    graceDays: 18,
    decayPerDay: 0.015,
    needsCooling: false,
  },
];

/** Spec of a cargo type. */
export function cargoSpec(cargo: Cargo): CargoSpec {
  return CARGO_SPECS[cargo]!;
}
