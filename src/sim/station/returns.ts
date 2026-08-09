import { depositReturns } from '../cargo/routing';
import { PASSENGER_CLASS_COUNT, passengerClassIndex } from '../cargo/types';
import {
  RETURN_MEAN_MONTHS,
  RETURN_TRIP_SHARE,
  TOWN_PRODUCTION_SLICES_PER_MONTH,
} from '../constants';
import type { World } from '../World';
import type { Station } from './types';

/**
 * Return journeys (SPEC2 M19: "Rueckreise-Erzeugung am Ziel").
 *
 * A traveller who arrives somewhere generally goes home again, and until this
 * bundle nobody in the game ever did: a town produced passengers, a vehicle
 * carried them to a destination, and there they stopped existing. A line into
 * a works, a quarry or a village that produces nothing of its own therefore
 * ran back empty for ever.
 *
 * Three decisions make up the whole of it.
 *
 * **1. It is generated at the DESTINATION from a running mean, never by
 * following a parcel.** SPEC2 says so, and the reason is the reason D-079
 * gives: what the rule needs is the SIZE of a flow, and a size is one number.
 * Remembering where each of a hundred thousand travellers came from would be
 * per-parcel state for an answer that is a rate. The mean is kept exactly the
 * way D-079 keeps the industry's twelve-month service window - one running
 * number, a TRUE mean while the window is still filling and a rolling one
 * afterwards - because started rolling from zero, a station serving a full
 * flow from its first day would read a third of it for two game years.
 *
 * **2. What is averaged is the IMBALANCE, not the arrivals.** A station's
 * monthly figure is what ARRIVED here minus what the town here offered of its
 * own accord, per class. That is the honest statement of the thing return
 * journeys exist for - more travellers reach this place than set out from it,
 * so somebody has to go home - and it has three consequences worth having:
 *
 *  - a station whose town sends out as many travellers as arrive generates
 *    NOTHING, so a route that is already balanced is very nearly a no-op.
 *    **"Very nearly" is the honest word and this entry once said "exactly"**:
 *    the first version of this comment claimed both stations of balancing
 *    scenario 1 generate nothing and that the 19.4 bands were therefore
 *    untouched BY CONSTRUCTION. They are not. Measured over that scenario's
 *    six years (D-215): 36.68 and 45.30 units of return traffic against
 *    32,519 and 32,684 arrivals - 0.113 % and 0.139 %. Its two towns are equal
 *    in population but its two STOPS are not equal in catchment (16 buildings
 *    against 22); and a mean over a MONTH cannot be zero on a line whose fleet
 *    clears a backlog in one month and falls behind in the next, whatever the
 *    two ends offer over a year. The band holds by MEASUREMENT with room to
 *    spare - payback still in game year 3 of a 2-4 year band - and
 *    `tests/balance/busline.spec.ts` bounds the share instead of denying it;
 *  - the rule cannot inflate a route that is already balanced, which averaging
 *    the arrivals alone would: every arrival would breed a return, every
 *    return would breed another, and the traffic on a shuttle would settle at
 *    `1 / (1 - share²)` times what the towns actually produce;
 *  - a return journey is deliberately NOT counted as a departure. Counting it
 *    would make this a controller for its own output - the emission would
 *    cancel the imbalance that produced it, and the steady state would sit at
 *    half the flow instead of `share` of it, whatever the share were set to.
 *
 * **3. Conservation is a LEDGER, not a hope.** The mean sets the RATE; two
 * lifetime counters per class set the TOTAL. `Credited` counts every passenger
 * of that class ever delivered here; `Generated` counts every return journey
 * ever created here; and an emission is clamped to their difference. So
 * `Generated <= Credited` holds at every tick of every world by construction:
 * demand never appears from nothing. The clamp is not decoration - a running
 * mean ALONE fails this badly. A station that receives a year of traffic and
 * is then cut off keeps a decaying mean for twelve more months, and the sum of
 * that decay is twelve times the mean: a full extra year of travellers with
 * nobody to have arrived. `tests/unit/returnJourneys.spec.ts` runs exactly
 * that starvation case.
 *
 * Cadence: the emission is once a game DAY, in the daily block of `World.step`
 * beside the town's own production, and the mean is rolled once a game MONTH
 * beside the M14 history ring. Nothing here is ever reached per tick, and both
 * hooks are allocation-free over preallocated blocks (law #7) - measured, in
 * the test file above, against a control that proves the instrument can see an
 * allocation.
 */

/** The four figures the ledger keeps per passenger class. */
export const ReturnField = {
  /** Running mean of the monthly imbalance, D-079 style. [units/month] */
  Mean: 0,
  /** The month in progress: arrivals here minus this town's own offer. [units] */
  MonthNet: 1,
  /** Every passenger of this class ever delivered here. [units] */
  Credited: 2,
  /** Every return journey of this class ever created here. [units] */
  Generated: 3,
} as const;
export type ReturnField = (typeof ReturnField)[keyof typeof ReturnField];

export const RETURN_FIELD_COUNT = 4;

/** Float64 slots one station's return ledger holds. */
export const RETURN_STATE_SIZE = RETURN_FIELD_COUNT * PASSENGER_CLASS_COUNT;

/** Slot of one (class, field) pair - the layout the save and the hash share. */
export function returnSlot(classIndex: number, field: ReturnField): number {
  return classIndex * RETURN_FIELD_COUNT + field;
}

/** A zeroed ledger, for new stations and for the v29 -> v30 migration. */
export function createReturnState(): Float64Array {
  return new Float64Array(RETURN_STATE_SIZE);
}

/**
 * Book passengers that have just ARRIVED here as their destination.
 *
 * Called from the delivery path and from nowhere else, so it counts exactly
 * what the M14 ring counts as `Delivered` and what a company books into its
 * lifetime tally - three counters written from one event, which is what lets
 * the conservation test triangulate rather than read one number twice.
 *
 * A parcel merely CHANGING LINES here is not an arrival and never reaches this
 * function: nobody who is still travelling needs a way home.
 */
export function creditPassengerArrival(station: Station, cargo: number, units: number): void {
  const index = passengerClassIndex(cargo);
  if (index < 0 || units <= 0) return;
  station.returnState[returnSlot(index, ReturnField.Credited)]! += units;
  station.returnState[returnSlot(index, ReturnField.MonthNet)]! += units;
}

/**
 * Book what the town HERE offered this station of its own accord.
 *
 * The offer rather than what the station had room for: a town whose stop is
 * full still wants to travel, and measuring the acceptance would make a
 * congested station look like a place nobody leaves and hand it return traffic
 * it has even less room for.
 */
export function notePassengerOffer(station: Station, cargo: number, units: number): void {
  const index = passengerClassIndex(cargo);
  if (index < 0 || units <= 0) return;
  station.returnState[returnSlot(index, ReturnField.MonthNet)]! -= units;
}

/** Arrivals here that have not yet been given a way home. [units] */
export function returnPoolUnits(station: Station, classIndex: number): number {
  const credited = station.returnState[returnSlot(classIndex, ReturnField.Credited)]!;
  const generated = station.returnState[returnSlot(classIndex, ReturnField.Generated)]!;
  return credited - generated;
}

/**
 * One day's return journeys, per class, before the ledger is consulted.
 * [units/day]
 *
 * A month's worth is `share` of the imbalance; a day's worth is that over the
 * same thirty slices the town's own production is booked in, so the two halves
 * of a station's passenger business arrive at the same cadence.
 */
export function returnRatePerDay(station: Station, classIndex: number): number {
  const mean = station.returnState[returnSlot(classIndex, ReturnField.Mean)]!;
  if (mean <= 0) return 0;
  return (mean * RETURN_TRIP_SHARE) / TOWN_PRODUCTION_SLICES_PER_MONTH;
}

/** One day's emission per class - preallocated, because the hook may not. */
const emission = new Float64Array(PASSENGER_CLASS_COUNT);

/**
 * The daily hook: every station sends home as many travellers as its mean says
 * and its ledger allows.
 *
 * Indexed loops over preallocated blocks throughout - the only thing that can
 * allocate is the cargo stack a deposit creates, which is the same allocation
 * the town's own production has always made at the same point in the same day.
 */
export function generateReturnJourneys(world: World): void {
  const stations = world.stations;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    let total = 0;

    for (let classIndex = 0; classIndex < PASSENGER_CLASS_COUNT; classIndex++) {
      let units = returnRatePerDay(station, classIndex);
      // THE conservation clamp: a journey home needs somebody to have arrived.
      const pool = returnPoolUnits(station, classIndex);
      if (units > pool) units = pool;
      if (units <= 0) units = 0;
      emission[classIndex] = units;
      total += units;
    }
    if (total <= 0) continue;

    // Nowhere to go is not a return journey: nobody sets out for nowhere, and
    // a pile with no destination would rot at the platform and drag the
    // station's own rating down for a line that has been cut. The credit stays
    // in the ledger for the day the line comes back.
    if (!depositReturns(world, station, emission[0]!, emission[1]!)) continue;

    // Debited by what was OFFERED rather than by what the station had room
    // for. A traveller turned away at a full platform still set out, and the
    // refusal is already booked as this station's overflow by the same deposit
    // that books the town's own - one treatment for both halves of the traffic.
    for (let classIndex = 0; classIndex < PASSENGER_CLASS_COUNT; classIndex++) {
      station.returnState[returnSlot(classIndex, ReturnField.Generated)]! += emission[classIndex]!;
    }
  }
}

/**
 * The monthly hook: close the month on every station's running mean.
 *
 * `returnMonths` counts the completed months up to the window length, and it is
 * what makes the mean a TRUE mean while the window fills (D-079's correction,
 * and the whole reason that entry exists): rolled from zero instead, a station
 * carrying a perfect flow from its first day would read 0.65 of it after twelve
 * months and generate two thirds of the return journeys it owes.
 *
 * Allocation-free by construction: indexed loops, one preallocated block per
 * station, no helper that returns an object.
 */
export function rollStationReturns(world: World): void {
  const stations = world.stations;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    const months =
      station.returnMonths < RETURN_MEAN_MONTHS ? station.returnMonths + 1 : RETURN_MEAN_MONTHS;

    for (let classIndex = 0; classIndex < PASSENGER_CLASS_COUNT; classIndex++) {
      const meanSlot = returnSlot(classIndex, ReturnField.Mean);
      const netSlot = returnSlot(classIndex, ReturnField.MonthNet);
      const mean = station.returnState[meanSlot]!;
      station.returnState[meanSlot] = mean + (station.returnState[netSlot]! - mean) / months;
      station.returnState[netSlot] = 0;
    }
    station.returnMonths = months;
  }
}
