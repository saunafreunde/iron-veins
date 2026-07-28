import type { Cargo } from '../cargo/types';

/**
 * The shape of a vehicle entry, shared by every catalogue (section 11.5).
 *
 * Kept apart from the catalogues themselves so that road, rail and later water
 * and air can each own their table without any of them importing another.
 *
 * All names in those tables are invented type designations. No real
 * manufacturer, series or model name appears anywhere in this project; that is
 * a legal requirement, not a stylistic one.
 */

export const VehicleKind = {
  Train: 0,
  Road: 1,
  Ship: 2,
  Aircraft: 3,
} as const;
export type VehicleKind = (typeof VehicleKind)[keyof typeof VehicleKind];

/**
 * What a rail vehicle contributes to a train.
 *
 * Traction units pull and may carry; wagons only carry. The distinction cannot
 * be derived from the tractive effort being zero - a control car would look
 * like a wagon, and reading intent out of a number is exactly the kind of
 * implicit rule that goes wrong three milestones later.
 */
export const RailRole = {
  /** Not a rail vehicle. */
  None: 0,
  Traction: 1,
  Wagon: 2,
} as const;
export type RailRole = (typeof RailRole)[keyof typeof RailRole];

export type PowerSource = 'steam' | 'diesel' | 'electric' | 'hydrogen' | 'battery';

export interface VehicleSpec {
  readonly id: number;
  readonly nameKey: string;
  readonly kind: VehicleKind;
  readonly railRole: RailRole;
  readonly introYear: number;
  readonly retireYear: number;
  readonly priceCt: number;
  readonly upkeepCtPerYear: number;
  /**
   * Mass of the vehicle itself. Road vehicles carry a laden figure, rail
   * vehicles the tare mass - a wagon's payload outweighs it two to three times
   * over and is added on loading. See DECISIONS.md D-045.
   * [kg]
   */
  readonly massKg: number;
  readonly lengthM: number;
  /** Starting tractive effort; zero for a wagon. [N] */
  readonly tractiveN: number;
  readonly powerW: number;
  readonly maxSpeedMs: number;
  readonly capacity: Partial<Record<Cargo, number>>;
  readonly refittable: readonly Cargo[];
  readonly power: PowerSource;
  readonly needsCatenary: boolean;
  readonly hasCooling: boolean;
  /** Reliability when new, 0..10000. */
  readonly reliability0: number;
  readonly lifetimeYears: number;
  /** Emissions used by the environmental rating from 2000 on. [kg/km] */
  readonly co2PerKm: number;
}

/** km/h to m/s, so a table can be written in the unit it is designed in. */
export function kmh(value: number): number {
  return value / 3.6;
}
