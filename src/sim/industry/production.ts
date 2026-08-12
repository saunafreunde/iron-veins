import type { Cargo } from '../cargo/types';
import { depositAtStation } from '../cargo/routing';
import {
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_FULL_STORE_RATE,
  INDUSTRY_GROWTH_RATIO,
  INDUSTRY_INPUT_PER_BATCH,
  INDUSTRY_LEVEL_MAX,
  INDUSTRY_LEVEL_STEP,
  INDUSTRY_OUTPUT_PER_BATCH,
  INDUSTRY_SERVICE_WINDOW_MONTHS,
  INDUSTRY_STORE_FULL_SHARE,
} from '../constants';
import { economyOutputFactor } from '../economy/curve';
import { stationRating } from '../station/types';
import { seasonalOutputAt } from '../weather/effects';
import type { World } from '../World';
import { coveredShareOf } from './catchment';
import { closeIndustry } from './lifecycle';
import { industryBaseOutput, industrySpec, industryStockCap, type Industry } from './types';

/**
 * Industry production, collection and expansion (section 7.3).
 *
 * Two clocks. Once a month: make something out of what has been delivered, then
 * look at how much of the year's output actually left and move the production
 * level. Once a day: hand what the stations can carry over to them.
 *
 * Production is monthly and collection is daily on purpose. Booking production
 * per tick is the balancing mistake section 7.3 names by name; collecting only
 * once a month would put a mine's whole output on the platform in a single tick
 * and leave it there ageing for four weeks.
 *
 * The one arithmetic choice that carries the whole design is in
 * `reviewIndustries`: the ratio divides by the UNGATED production. An industry
 * served by a badly rated station cannot reach the growth threshold no matter
 * how long it waits, because the gate took the rest before it ever moved. That
 * is the death spiral of section 10.1 applied to freight, and it is what makes
 * a second train pay for itself in tonnage rather than only in trips.
 */

/**
 * Stock of one input slot. Two slots is the whole catalogue's arity.
 *
 * Exported for the supply contracts of SPEC2 M21, which are the only thing
 * outside this file that may touch an input shed - and they touch it through
 * these two and never through the fields, so the slot rule stays in one place.
 */
export function inputStock(industry: Industry, slot: number): number {
  return slot === 0 ? industry.inputStock0 : industry.inputStock1;
}

export function setInputStock(industry: Industry, slot: number, value: number): void {
  if (slot === 0) industry.inputStock0 = value;
  else industry.inputStock1 = value;
}

function outputStock(industry: Industry, slot: number): number {
  return slot === 0 ? industry.outputStock0 : industry.outputStock1;
}

function setOutputStock(industry: Industry, slot: number, value: number): void {
  if (slot === 0) industry.outputStock0 = value;
  else industry.outputStock1 = value;
}

/** Room left for one more unit of a cargo an industry consumes, or 0. */
export function inputSpaceFor(industry: Industry, cargo: Cargo): number {
  const spec = industrySpec(industry.type);
  const cap = industryStockCap(industry.type);
  for (let slot = 0; slot < spec.inputs.length; slot++) {
    if (spec.inputs[slot] !== cargo) continue;
    const space = cap - inputStock(industry, slot);
    return space > 0 ? space : 0;
  }
  return 0;
}

/** Put delivered cargo into the right slot; returns what was actually taken. */
export function deliverToIndustry(industry: Industry, cargo: Cargo, amount: number): number {
  if (!industry.open) return 0;
  const spec = industrySpec(industry.type);
  const cap = industryStockCap(industry.type);
  for (let slot = 0; slot < spec.inputs.length; slot++) {
    if (spec.inputs[slot] !== cargo) continue;
    const space = cap - inputStock(industry, slot);
    const taken = amount < space ? amount : space;
    if (taken <= 0) return 0;
    setInputStock(industry, slot, inputStock(industry, slot) + taken);
    return taken;
  }
  return 0;
}

/** True while an output slot is as good as full (section 7.3). */
export function outputStoreFull(industry: Industry): boolean {
  const spec = industrySpec(industry.type);
  if (spec.outputs.length === 0) return false;
  const full = industryStockCap(industry.type) * INDUSTRY_STORE_FULL_SHARE;
  for (let slot = 0; slot < spec.outputs.length; slot++) {
    if (outputStock(industry, slot) >= full) return true;
  }
  return false;
}

/**
 * One month of production for every industry (section 7.3).
 *
 * `amount = min(base rate x level, what the delivered input pays for, the room
 * the output shed has left)`, and a full shed throttles the whole thing to a
 * quarter rather than stopping it - a yard that has halted looks exactly like
 * one that was never supplied, and the player has to be able to tell those two
 * apart.
 */
export function produceIndustryCargo(world: World): void {
  // The century of SPEC2 M21 (E-09), looked up ONCE for the whole monthly
  // pass: it is a property of the year, not of an industry, and this hook is
  // the reader - it never draws (Z3). Exactly 1 without the economy rule.
  const cycle = economyOutputFactor(world.economyCurve, world.date.year);
  for (const industry of world.industries) {
    if (!industry.open) continue;
    const spec = industrySpec(industry.type);
    const inputs = INDUSTRY_INPUT_PER_BATCH[industry.type]!;
    const outputs = INDUSTRY_OUTPUT_PER_BATCH[industry.type]!;
    const cap = industryStockCap(industry.type);

    // The season decides what the land yields this month, before the shed
    // decides whether it is worth making (SPEC2 M18). A pure function of
    // month, height and climate - no randomness, no state - and exactly 1 for
    // every industry but a farm and a forestry, and for every world whose
    // weather rule is off.
    let target =
      ((industryBaseOutput(industry, world.tick, cycle) * industry.productionLevel) / 100) *
      seasonalOutputAt(world, industry.type, industry.x, industry.y);
    if (outputStoreFull(industry)) target *= INDUSTRY_FULL_STORE_RATE;
    if (target <= 0) continue;

    // How many batches the delivered input can pay for ...
    let batches = target;
    for (let slot = 0; slot < inputs.length; slot++) {
      const per = inputs[slot]!;
      if (per <= 0) continue;
      const affordable = inputStock(industry, slot) / per;
      if (affordable < batches) batches = affordable;
    }
    // ... and how many the output shed still has room for. A pure sink has no
    // outputs and is therefore never blocked by its own stock.
    for (let slot = 0; slot < outputs.length; slot++) {
      const per = outputs[slot]!;
      if (per <= 0) continue;
      const room = (cap - outputStock(industry, slot)) / per;
      if (room < batches) batches = room;
    }
    if (batches <= 0) continue;

    for (let slot = 0; slot < inputs.length; slot++) {
      setInputStock(industry, slot, inputStock(industry, slot) - batches * inputs[slot]!);
    }
    for (let slot = 0; slot < outputs.length; slot++) {
      setOutputStock(industry, slot, outputStock(industry, slot) + batches * outputs[slot]!);
    }

    // The ungated figure: what it made, not what got away.
    industry.producedThisMonth += batches;
    if (spec.outputs.length === 0) industry.collectedThisMonth += batches;
  }
}

/**
 * Hand finished output to the stations that serve the industry. Once a day.
 *
 * The difference from town production is one `min(1, ...)`: a town's stations
 * share a fixed output between them, so the rating only redistributes. Here the
 * combined weight CAPS what leaves the gate, so a badly served mine genuinely
 * ships less - and the rest stays in its yard where the player can see it.
 */
export function collectIndustryOutput(world: World): void {
  if (world.stations.length === 0) return;

  for (const industry of world.industries) {
    if (!industry.open) continue;
    const spec = industrySpec(industry.type);
    if (spec.outputs.length === 0) continue;

    let totalWeight = 0;
    for (const station of world.stations) {
      if (!station.servedIndustries.includes(industry.id)) continue;
      const covered = coveredShareOf(station, industry);
      if (covered <= 0) continue;
      totalWeight += (stationRating(station, world.tick) / 100) * covered;
    }
    if (totalWeight <= 0) continue;

    const gate = totalWeight < 1 ? totalWeight : 1;

    for (let slot = 0; slot < spec.outputs.length; slot++) {
      const available = outputStock(industry, slot);
      if (available <= 0) continue;
      const offered = available * gate;
      let shipped = 0;

      for (const station of world.stations) {
        if (!station.servedIndustries.includes(industry.id)) continue;
        const covered = coveredShareOf(station, industry);
        if (covered <= 0) continue;
        const share = ((stationRating(station, world.tick) / 100) * covered) / totalWeight;
        shipped += depositAtStation(world, station, spec.outputs[slot]!, offered * share);
      }

      // What the stations had room for is deliberately NOT booked as
      // collection: an industry is judged on what left on a VEHICLE, not on
      // what was set down on a platform (D-085). The figure is still worth
      // having - it is the difference between "nobody collects" and "the
      // station is full" - so it goes back into the yard rather than being
      // lost.
      setOutputStock(industry, slot, available - offered + (offered - shipped));
    }
  }
}

/**
 * Monthly: move the production level, count the months in which nothing left,
 * close what nobody has served for two years, then reset the counters.
 *
 * The expansion rule is section 7.3's: at least eighty percent collected over
 * twelve months buys ten more points of production level, up to two hundred.
 * That twelve month window is also the dead band - an industry that has just
 * moved holds its new level for a year - so the level follows a settled trend
 * and never one good month.
 */
export function reviewIndustries(world: World): void {
  for (const industry of world.industries) {
    if (!industry.open) {
      industry.producedThisMonth = 0;
      industry.collectedThisMonth = 0;
      continue;
    }

    const produced = industry.producedThisMonth;
    // An industry that made nothing AND has nothing standing in its yard is
    // dormant, not neglected. A steel mill nobody has ever supplied would
    // otherwise spend its first two years failing to be collected from and
    // then close - taking every factory on the map with it inside two game
    // years.
    //
    // The second half of that test is what makes the difference: a mine whose
    // yard is full has throttled itself to a standstill (section 7.3), so it
    // produces nothing either - and it is the very case the closure rule is
    // about.
    const idle = produced <= 0 && outputStock(industry, 0) <= 0 && outputStock(industry, 1) <= 0;
    if (idle) {
      industry.collectedThisMonth = 0;
      industry.monthsSinceLevelChange++;
      continue;
    }
    const ratio = produced > 0 ? industry.collectedThisMonth / produced : 0;

    // The twelve month window of section 7.3, kept as one running number rather
    // than a ring of twelve figures (DECISIONS.md D-079).
    //
    // While the window is still filling it is a true mean of the months so far,
    // and only afterwards a rolling one. Starting the rolling form from zero
    // would mean twelve perfect months averaged 0.65 and an industry served
    // faultlessly from the day it opened could not expand for two years.
    const window = INDUSTRY_SERVICE_WINDOW_MONTHS;
    const seen = industry.serviceMonths < window ? industry.serviceMonths : window - 1;
    industry.serviceAverage = (industry.serviceAverage * seen + ratio) / (seen + 1);
    if (industry.serviceMonths < window) industry.serviceMonths++;

    if (industry.collectedThisMonth > 0) industry.monthsWithoutCollection = 0;
    else industry.monthsWithoutCollection++;

    industry.monthsSinceLevelChange++;
    if (
      industry.monthsSinceLevelChange >= window &&
      industry.serviceAverage >= INDUSTRY_GROWTH_RATIO
    ) {
      // Section 7.3 moves the level in ONE direction: good service expands a
      // works, and nothing shrinks it. A decline rule used to sit here and it
      // had to go (DECISIONS.md D-086): what a line can carry away is bounded
      // by the collection gate, so a brand new line - whose station has not
      // been visited yet and is therefore rated low - drove every industry it
      // served straight to the floor before it had a chance to prove itself.
      // Neglect is punished by the closure clock, which is what the spec uses.
      const level = industry.productionLevel + INDUSTRY_LEVEL_STEP;
      industry.productionLevel = level > INDUSTRY_LEVEL_MAX ? INDUSTRY_LEVEL_MAX : level;
      industry.monthsSinceLevelChange = 0;
    }

    industry.producedThisMonth = 0;
    industry.collectedThisMonth = 0;

    if (industry.monthsWithoutCollection >= INDUSTRY_CLOSURE_MONTHS) closeIndustry(world, industry);
  }
}
