import { costFactor } from '../cargo/payment';
import {
  ECONOMY_COAL_DECLINE_FROM_YEAR,
  ECONOMY_COAL_FLOOR,
  ECONOMY_CONTAINER_AFTER,
  ECONOMY_CONTAINER_BEFORE,
  ECONOMY_CONTAINER_BOOM_FROM_YEAR,
  ECONOMY_CONTAINER_BOOM_SPAN_YEARS,
  ECONOMY_COST_SENSITIVITY,
  ECONOMY_CURVE_LENGTH,
  ECONOMY_CURVE_YEARS,
  ECONOMY_CYCLE_AMPLITUDE,
  ECONOMY_CYCLE_PERIOD_YEARS,
  ECONOMY_ENERGY_ERA_YEARS,
  ECONOMY_ENERGY_SHOCK_MAX,
  ECONOMY_ENERGY_SHOCK_SPAN_YEARS,
  ECONOMY_FACTOR_MAX_PERMILLE,
  ECONOMY_FACTOR_MIN_PERMILLE,
  ECONOMY_GROUP_AMPLITUDE,
  ECONOMY_GROUP_COUNT,
  ECONOMY_GROUP_OF_CARGO,
  ECONOMY_GROUP_PERIOD_YEARS,
  ECONOMY_PERMILLE_ONE,
  ECONOMY_ROW_COUNT,
  ECONOMY_ROW_CYCLE,
  ECONOMY_ROW_ENERGY,
  ECONOMY_YEAR_JITTER,
  EconomyGroup,
  END_YEAR,
  START_YEAR,
} from '../constants';
import { sinTurns } from '../math';
import type { Rng } from '../rng';

/**
 * The century curve of SPEC2 M21 (E-09): what the economy does over the whole
 * playable span, decided ONCE at world genesis.
 *
 * E-09 settles the shape of this before a line of it was written, and the two
 * halves of that decision are what this file is:
 *
 *  - **Drawn at genesis, saved and hashed.** The whole table comes out of the
 *    named `economy` stream in `World.create` and is then a constant for the
 *    life of the world. A monthly hook that drew its own recession would put a
 *    stochastic system on the calendar - every save/load boundary a chance to
 *    fork, every new subsystem a chance to move somebody else's draws
 *    (Fehlerkatalog 25) - and a closed-form "what year is it" function beside
 *    it would be a second mechanic saying the same thing (the juror veto E-09
 *    records).
 *  - **The hooks LOOK IT UP and never draw.** Every reader below is a pure
 *    function of (table, year) returning a NUMBER that some already existing
 *    line multiplies into an already existing quantity: the delivery tariff,
 *    `World.costCt`, the `INDUSTRY_FLUCTUATION_*` sine and the monthly energy
 *    bill. There is no fifth seam and nothing here writes, remembers or draws.
 *
 * **This file is the ONE gate on the economy world rule.** A world with the
 * rule off has an EMPTY table, and every reader returns exactly 1 on its first
 * line - `x * 1 === x` is exact in IEEE-754, so a world with the rule off is
 * not merely unlikely to differ from a pre-M21 world, it is arithmetically
 * identical to one (Fehlerkatalog 34). The gate is the TABLE rather than a
 * boolean read at each seam, which is why there is no way to hold the rule off
 * and a curve at the same time: the parser refuses that pair.
 */

/**
 * The table itself: `ECONOMY_ROW_COUNT` rows of `ECONOMY_CURVE_YEARS`
 * multipliers in per mille, row major - or nothing at all.
 *
 * `rows` is replaced exactly twice in the worst case over a world's whole life
 * (once at genesis, once by a load) and never inside a tick, so law #7 is not
 * in question; the readers below are index arithmetic and allocate nothing.
 */
export class EconomyCurve {
  /** Per-mille multipliers, or a zero-length array in a world with no rule. */
  rows: Int16Array = new Int16Array(0);

  /** Whether this world has a century at all. */
  get active(): boolean {
    return this.rows.length > 0;
  }

  /** Draw the whole century from the named stream. Genesis only. */
  generate(stream: Rng): void {
    this.rows = buildEconomyCurve(stream);
  }

  /** Adopt the century a save carries. The parser has checked its shape. */
  load(saved: readonly number[]): void {
    this.rows = saved.length === 0 ? new Int16Array(0) : Int16Array.from(saved);
  }

  /** The table as the save format carries it: plain integers, never a view. */
  toData(): number[] {
    const out: number[] = [];
    for (let at = 0; at < this.rows.length; at++) out.push(this.rows[at]!);
    return out;
  }
}

/**
 * One row's multiplier for a calendar year, or exactly 1 without a curve.
 *
 * Years outside the playable span clamp to the ends rather than throwing: the
 * span is 1950-2050 and `endless` (E-15, M23) will run past it, and a century
 * that stops having an opinion is better than one that reads past its table.
 */
export function economyRowFactor(curve: EconomyCurve, row: number, year: number): number {
  const rows = curve.rows;
  if (rows.length === 0) return 1;
  let index = year - START_YEAR;
  if (index < 0) index = 0;
  else if (index >= ECONOMY_CURVE_YEARS) index = ECONOMY_CURVE_YEARS - 1;
  return rows[row * ECONOMY_CURVE_YEARS + index]! / ECONOMY_PERMILLE_ONE;
}

/**
 * The tariff seam: what one cargo's delivery pays this year, relative to its
 * `baseRateCt`.
 *
 * Both halves of E-09's "Nachfrage-/Raten-Multiplikator" land here, because in
 * this economy they are the same number: what a company is paid for hauling a
 * tonne of coal in 2035 IS the demand for coal in 2035, expressed at the one
 * seam section 7.5 already has.
 */
export function economyRateFactor(curve: EconomyCurve, cargo: number, year: number): number {
  if (curve.rows.length === 0) return 1;
  const group = ECONOMY_GROUP_OF_CARGO[cargo] ?? EconomyGroup.Town;
  return economyRowFactor(curve, group, year);
}

/** The business cycle itself - a recession under 1, a boom over it. */
export function economyCycleFactor(curve: EconomyCurve, year: number): number {
  return economyRowFactor(curve, ECONOMY_ROW_CYCLE, year);
}

/**
 * The `costCt` seam: the cycle, damped by {@link ECONOMY_COST_SENSITIVITY}.
 *
 * Not the raw cycle, because a building bill does not swing as far as a freight
 * rate - and the damping is what makes the slump the cheap time to build.
 */
export function economyCostFactor(curve: EconomyCurve, year: number): number {
  if (curve.rows.length === 0) return 1;
  return 1 + (economyCycleFactor(curve, year) - 1) * ECONOMY_COST_SENSITIVITY;
}

/**
 * A cost at this year's price level AND this year's economy, in whole cents.
 *
 * The ONE formula, called by `World.costCt` for the bill and by the interface
 * for the build preview. Two formulas that agree today is how a preview and a
 * bill come to disagree from game year two (D-092), so there is one - rounded
 * once, at the end, on both sides.
 */
export function economyCostCt(
  baseCt: number,
  year: number,
  inflation: boolean,
  curve: EconomyCurve,
): number {
  return Math.round(baseCt * costFactor(year, inflation) * economyCostFactor(curve, year));
}

/**
 * The industry seam: what the worldwide cycle does to a primary industry's
 * monthly output.
 *
 * E-09 asks for the recession and boom windows to modulate the existing
 * `INDUSTRY_FLUCTUATION_*` sine rather than to add a second swing, so this is
 * the raw cycle and `industryBaseOutput` multiplies it into the same
 * expression - the mine's own five-year sine keeps its shape and the century
 * decides how much the whole world is buying.
 */
export function economyOutputFactor(curve: EconomyCurve, year: number): number {
  return economyCycleFactor(curve, year);
}

/** The energy seam: what a megajoule costs this year, relative to its table. */
export function economyEnergyFactor(curve: EconomyCurve, year: number): number {
  return economyRowFactor(curve, ECONOMY_ROW_ENERGY, year);
}

/**
 * The overseas seam: how much box traffic a harbour container terminal is
 * offered this year, relative to `PORT_CONTAINER_TEU_PER_MONTH`.
 *
 * The FIFTH reader, and the first that does not scale a quantity the game
 * already had - it decides whether a quantity exists at all. D-236 said "four
 * seams and no fifth" about the bundle that drew the century; the invariant
 * that sentence protects is that every reader of the curve lives in THIS file,
 * and it still does. Two things are deliberately different from the four
 * above, and both are the reason containers were a dead cargo type:
 *
 *  - **Its identity is ZERO, not one.** The other four multiply something that
 *    exists without a century; this one is a source. A world with no curve has
 *    no overseas trade at all, which is exactly the pre-M21 world in which
 *    nothing ever produced a container - so the balance anchor of Fehlerkatalog
 *    34 ("Konjunktur: aus") is untouched by construction rather than by luck.
 *  - **It is hard-gated at {@link ECONOMY_CONTAINER_BOOM_FROM_YEAR}.** The
 *    curve's own container row is worth `ECONOMY_CONTAINER_BEFORE` from 1950
 *    on, because a box that IS carried before the trade exists is still worth
 *    something to carry; but nothing may PRODUCE one. E-09 says the trade
 *    booms "ab ~1970", and a port quietly handling boxes in 1951 would make
 *    that sentence decoration.
 */
export function economyContainerFactor(curve: EconomyCurve, year: number): number {
  if (curve.rows.length === 0) return 0;
  if (year < ECONOMY_CONTAINER_BOOM_FROM_YEAR) return 0;
  return economyRowFactor(curve, EconomyGroup.Containers, year);
}

/**
 * One row as a series of `[year, factor]` for a chart, oldest first.
 *
 * Pure, allocating, and never called from the simulation: this is what the
 * statistics centre reads so the century is INSPECTABLE, which is the last
 * clause of E-09's own sentence. It lives beside the generator rather than in
 * `src/ui` so that what the player is shown and what the tariff is multiplied
 * by cannot come apart.
 */
export function economySeries(curve: EconomyCurve, row: number): number[] {
  const out: number[] = [];
  if (curve.rows.length === 0) return out;
  for (let index = 0; index < ECONOMY_CURVE_YEARS; index++) {
    out.push(curve.rows[row * ECONOMY_CURVE_YEARS + index]! / ECONOMY_PERMILLE_ONE);
  }
  return out;
}

/** Calendar year of series index `index`. */
export function economySeriesYear(index: number): number {
  return START_YEAR + index;
}

// ------------------------------------------------------------- the generator

/**
 * Draw the whole century.
 *
 * The draw ORDER is the contract: three cycle phases, one phase per group, one
 * shock per energy era, then one jitter per row per year walked row major.
 * Written as fixed loops over fixed-size tables, so the sequence is a property
 * of the code rather than of the order a map happens to iterate in (law #3) -
 * and every year's value is built from `+ - * /` and the `sinTurns` lookup
 * table, never `Math.sin`, because `Math.sin` is not bit exact across engines
 * (law #4) and this table is hashed.
 */
function buildEconomyCurve(stream: Rng): Int16Array {
  const rows = new Int16Array(ECONOMY_CURVE_LENGTH);

  const cyclePhase = new Float64Array(ECONOMY_CYCLE_PERIOD_YEARS.length);
  for (let wave = 0; wave < cyclePhase.length; wave++) cyclePhase[wave] = stream.nextFloat();

  const groupPhase = new Float64Array(ECONOMY_GROUP_COUNT);
  for (let group = 0; group < ECONOMY_GROUP_COUNT; group++) groupPhase[group] = stream.nextFloat();

  // One shock per era, at a drawn year inside it and a drawn size. Both drawn
  // before anything is written, so the number of draws depends on the span and
  // on nothing the values produce.
  const eras = Math.ceil(ECONOMY_CURVE_YEARS / ECONOMY_ENERGY_ERA_YEARS);
  const shockYear = new Float64Array(eras);
  const shockSize = new Float64Array(eras);
  for (let era = 0; era < eras; era++) {
    shockYear[era] = era * ECONOMY_ENERGY_ERA_YEARS + stream.nextInt(ECONOMY_ENERGY_ERA_YEARS);
    shockSize[era] = stream.nextFloat() * ECONOMY_ENERGY_SHOCK_MAX;
  }

  // The shared cycle first: the group rows multiply it in, so it has to exist
  // before them.
  const cycle = new Float64Array(ECONOMY_CURVE_YEARS);
  for (let index = 0; index < ECONOMY_CURVE_YEARS; index++) {
    let value = 1;
    for (let wave = 0; wave < ECONOMY_CYCLE_PERIOD_YEARS.length; wave++) {
      const turns = index / ECONOMY_CYCLE_PERIOD_YEARS[wave]! + cyclePhase[wave]!;
      value += ECONOMY_CYCLE_AMPLITUDE[wave]! * sinTurns(turns);
    }
    cycle[index] = value;
  }

  for (let row = 0; row < ECONOMY_ROW_COUNT; row++) {
    for (let index = 0; index < ECONOMY_CURVE_YEARS; index++) {
      const year = START_YEAR + index;
      const jitter = 1 + (stream.nextFloat() * 2 - 1) * ECONOMY_YEAR_JITTER;
      let value: number;
      if (row === ECONOMY_ROW_CYCLE) {
        value = cycle[index]! * jitter;
      } else if (row === ECONOMY_ROW_ENERGY) {
        let shock = 0;
        for (let era = 0; era < eras; era++) {
          const distance = Math.abs(index - shockYear[era]!);
          if (distance >= ECONOMY_ENERGY_SHOCK_SPAN_YEARS) continue;
          shock += shockSize[era]! * (1 - distance / ECONOMY_ENERGY_SHOCK_SPAN_YEARS);
        }
        value = (1 + shock) * jitter;
      } else {
        const turns = index / ECONOMY_GROUP_PERIOD_YEARS[row]! + groupPhase[row]!;
        const own = 1 + ECONOMY_GROUP_AMPLITUDE[row]! * sinTurns(turns);
        value = structuralTrend(row, year) * own * cycle[index]! * jitter;
      }
      rows[row * ECONOMY_CURVE_YEARS + index] = clampPermille(value * ECONOMY_PERMILLE_ONE);
    }
  }
  return rows;
}

/**
 * The two trends E-09 names by name, and 1 for every other group.
 *
 * They are NOT drawn: a century in which coal might not decline is a century in
 * which the milestone's own acceptance sentence is a coin toss, and the game's
 * point is that the world moves under a network that was right when it was
 * built. What the stream decides is everything around them - when the slumps
 * fall, how deep, what the energy price does - so two seeds are two different
 * centuries with the same two structural facts.
 */
function structuralTrend(group: number, year: number): number {
  if (group === EconomyGroup.Coal) {
    if (year <= ECONOMY_COAL_DECLINE_FROM_YEAR) return 1;
    const span = END_YEAR - ECONOMY_COAL_DECLINE_FROM_YEAR;
    const done = (year - ECONOMY_COAL_DECLINE_FROM_YEAR) / span;
    return 1 + (ECONOMY_COAL_FLOOR - 1) * (done > 1 ? 1 : done);
  }
  if (group === EconomyGroup.Containers) {
    if (year <= ECONOMY_CONTAINER_BOOM_FROM_YEAR) return ECONOMY_CONTAINER_BEFORE;
    const done = (year - ECONOMY_CONTAINER_BOOM_FROM_YEAR) / ECONOMY_CONTAINER_BOOM_SPAN_YEARS;
    return (
      ECONOMY_CONTAINER_BEFORE +
      (ECONOMY_CONTAINER_AFTER - ECONOMY_CONTAINER_BEFORE) * (done > 1 ? 1 : done)
    );
  }
  return 1;
}

/** Round to a per-mille integer inside the band the parser enforces. */
function clampPermille(permille: number): number {
  const rounded = Math.round(permille);
  if (rounded < ECONOMY_FACTOR_MIN_PERMILLE) return ECONOMY_FACTOR_MIN_PERMILLE;
  if (rounded > ECONOMY_FACTOR_MAX_PERMILLE) return ECONOMY_FACTOR_MAX_PERMILLE;
  return rounded;
}
