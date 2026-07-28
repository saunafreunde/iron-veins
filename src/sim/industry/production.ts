import type { Cargo } from '../cargo/types';
import {
  INDUSTRY_BASE_OUTPUT_PER_MONTH,
  INDUSTRY_DECLINE_RATIO,
  INDUSTRY_GROWTH_RATIO,
  INDUSTRY_INPUT_PER_BATCH,
  INDUSTRY_LEVEL_HYSTERESIS_MONTHS,
  INDUSTRY_LEVEL_MAX,
  INDUSTRY_LEVEL_MIN,
  INDUSTRY_LEVEL_STEP,
  INDUSTRY_OUTPUT_PER_BATCH,
  INDUSTRY_PRODUCTION_SLICES_PER_MONTH,
  INDUSTRY_STOCK_CAP,
} from '../constants';
import { stationRating } from '../station/types';
import { depositAtStation } from '../cargo/routing';
import type { World } from '../World';
import { coveredShareOf } from './catchment';
import { industrySpec, type Industry } from './types';

/**
 * Industry production, collection and expansion (section 6).
 *
 * Three passes, on two clocks. Twice a day: make something out of what has been
 * delivered, then hand what a station can carry over to it. Once a month: look
 * at how much of the month's output actually left, and move the production
 * level accordingly.
 *
 * The one arithmetic choice that carries the whole design is in
 * `reviewIndustries`: the ratio divides by the UNGATED production. An industry
 * served by a badly rated station cannot reach the growth threshold no matter
 * how long it waits, because the gate took the rest before it ever moved. That
 * is the death spiral of section 10.1 applied to freight, and it is what makes
 * a second train pay for itself in tonnage rather than only in trips.
 */

/** Stock of one input slot. Two slots is the whole catalogue's arity. */
function inputStock(industry: Industry, slot: number): number {
  return slot === 0 ? industry.inputStock0 : industry.inputStock1;
}

function setInputStock(industry: Industry, slot: number, value: number): void {
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
  for (let slot = 0; slot < spec.inputs.length; slot++) {
    if (spec.inputs[slot] !== cargo) continue;
    const space = INDUSTRY_STOCK_CAP - inputStock(industry, slot);
    return space > 0 ? space : 0;
  }
  return 0;
}

/** Put delivered cargo into the right slot; returns what was actually taken. */
export function deliverToIndustry(industry: Industry, cargo: Cargo, amount: number): number {
  const spec = industrySpec(industry.type);
  for (let slot = 0; slot < spec.inputs.length; slot++) {
    if (spec.inputs[slot] !== cargo) continue;
    const space = INDUSTRY_STOCK_CAP - inputStock(industry, slot);
    const taken = amount < space ? amount : space;
    if (taken <= 0) return 0;
    setInputStock(industry, slot, inputStock(industry, slot) + taken);
    return taken;
  }
  return 0;
}

/**
 * One slice of production for every industry. Called once per game day.
 *
 * The recipe minimum is evaluated per slice rather than per month, so a mill
 * whose coal arrives on the twenty-ninth can still use it that month.
 */
export function produceIndustryCargo(world: World): void {
  for (const industry of world.industries) {
    const spec = industrySpec(industry.type);
    const inputs = INDUSTRY_INPUT_PER_BATCH[industry.type]!;
    const outputs = INDUSTRY_OUTPUT_PER_BATCH[industry.type]!;

    const target =
      (INDUSTRY_BASE_OUTPUT_PER_MONTH[industry.type]! * industry.productionLevel) /
      100 /
      INDUSTRY_PRODUCTION_SLICES_PER_MONTH;
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
      const room = (INDUSTRY_STOCK_CAP - outputStock(industry, slot)) / per;
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
 * Hand finished output to the stations that serve the industry.
 *
 * The difference from town production is one `min(1, ...)`: a town's stations
 * share a fixed output between them, so the rating only redistributes. Here the
 * combined weight CAPS what leaves the gate, so a badly served mine genuinely
 * ships less - and the rest stays in its yard where the player can see it.
 */
export function collectIndustryOutput(world: World): void {
  if (world.stations.length === 0) return;

  for (const industry of world.industries) {
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

      setOutputStock(industry, slot, available - offered);
      if (slot === 0) industry.collectedThisMonth += shipped;
    }
  }
}

/**
 * Monthly: move the production level, then reset the counters.
 *
 * The dead band between the two thresholds is what stops an industry
 * oscillating around a boundary, and the hysteresis is what stops one bad month
 * halving a line that is otherwise working.
 */
export function reviewIndustries(world: World): void {
  for (const industry of world.industries) {
    const produced = industry.producedThisMonth;
    const ratio = produced > 0 ? industry.collectedThisMonth / produced : 0;

    industry.monthsSinceLevelChange++;
    if (industry.monthsSinceLevelChange >= INDUSTRY_LEVEL_HYSTERESIS_MONTHS) {
      let level = industry.productionLevel;
      if (ratio >= INDUSTRY_GROWTH_RATIO) level += INDUSTRY_LEVEL_STEP;
      else if (ratio <= INDUSTRY_DECLINE_RATIO) level -= INDUSTRY_LEVEL_STEP;

      if (level < INDUSTRY_LEVEL_MIN) level = INDUSTRY_LEVEL_MIN;
      if (level > INDUSTRY_LEVEL_MAX) level = INDUSTRY_LEVEL_MAX;
      if (level !== industry.productionLevel) {
        industry.productionLevel = level;
        industry.monthsSinceLevelChange = 0;
      }
    }

    industry.producedThisMonth = 0;
    industry.collectedThisMonth = 0;
  }
}
