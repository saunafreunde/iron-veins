import {
  MAX_TICK,
  SCORE_CARGO_FULL_UNITS,
  SCORE_MEDAL_WEIGHTS,
  SCORE_NETWORK_FULL_SHARE,
  SCORE_TERM_MAX_POINTS,
  SCORE_VALUE_FULL_CT,
} from '../constants';
import { CARGO_COUNT } from '../cargo/types';
import { companyValueCt } from '../economy/ledger';
import { companyNetworkValue } from '../economy/networkValue';
import type { World } from '../World';
import { goalsOutcome, overallMedal } from './GoalStore';
import { GameEnd, GoalMedal, GoalOutcome, GoalStatus } from './types';

/**
 * The end of the game and what it was worth (SPEC2 M17).
 *
 * Two questions, one module, because they are the same question asked twice:
 * *is it over* and *how did it go*. Both are READINGS of state that is already
 * saved and hashed - the goal verdicts of D-193, the company's books, the
 * lifetime tonnage - and neither is stored anywhere. That is deliberate and it
 * is what keeps the milestone free of a second save bump: a score computed
 * from hashed state is the same number on every machine that holds that state,
 * so writing it down would only create a second place for it to be wrong.
 *
 * Nothing in `src/sim` reads either function. They are called from the worker's
 * publish pass, once a game day, on the way to the interface - the same footing
 * as `companyNetworkValue` in the monthly books. They allocate, and are allowed
 * to: they run beside `postMonthly`, never inside `tick()` (law #7).
 */

/**
 * Where the player's game stands.
 *
 * The order of the four tests is the whole content of the function, so it is
 * worth stating why it is that order:
 *
 * - **Won comes first, even over a winding-up.** A verdict is FINAL (D-193):
 *   once every goal has been achieved the medals are hashed state and nothing
 *   later can take them away. A company that met every goal and then went
 *   broke has won the scenario and lost the company, and the screen says both -
 *   the score's value and network terms collapse on their own.
 * - **Bankrupt comes before Lost**, because a wound-up company leaves goals
 *   sitting Open for ever (only `SurviveUntil` fails early), so the goal
 *   outcome would report "still running" for a game that is unmistakably over.
 * - **Century comes last.** It is the honest answer for a sandbox game and for
 *   a scenario whose goals nobody decided: the world simply ran out of years.
 */
export function gameEndOf(world: World): GameEnd {
  const outcome = goalsOutcome(world.goals);
  if (outcome === GoalOutcome.Won) return GameEnd.Won;
  if (world.playerCompany.bankrupt) return GameEnd.Bankrupt;
  if (outcome === GoalOutcome.Lost) return GameEnd.Lost;
  if (world.tick >= MAX_TICK) return GameEnd.Century;
  return GameEnd.Running;
}

/** One term of the score: what it measured, and what that was worth. */
export interface ScoreTerm {
  /** 0..1, the share of the term's full mark that was reached. */
  readonly share: number;
  /** `share * SCORE_TERM_MAX_POINTS`, rounded. [points] */
  readonly points: number;
  /**
   * The figure the share came from, in the term's own unit - cents for value,
   * units for cargo, a ratio for goals and network value. The screen and the
   * balancing scenario both print it, so the score can say WHY.
   */
  readonly measured: number;
}

/** The final score, term by term, so that it can be explained. */
export interface Score {
  /** Medals earned against every goal at gold. */
  readonly goals: ScoreTerm;
  /** Company value at the FIRST year's prices, against the full mark. */
  readonly value: ScoreTerm;
  /** Earned revenue over the closed-form ceiling (D-187). */
  readonly network: ScoreTerm;
  /** Units delivered over the company's lifetime. */
  readonly cargo: ScoreTerm;
  /** The sum of the four. [points] */
  readonly total: number;
  /** How many goals the world carries; zero means the goal term is unearnable. */
  readonly goalCount: number;
  /** Goals achieved so far. */
  readonly goalsAchieved: number;
  /** The weakest band every goal earned, or None while any is open or failed. */
  readonly medal: GoalMedal;
}

/** A share clamped into 0..1, so a term can never go negative or run away. */
function share(measured: number, full: number): number {
  if (!(measured > 0) || full <= 0) return 0;
  return measured >= full ? 1 : measured / full;
}

function term(measured: number, full: number): ScoreTerm {
  const reached = share(measured, full);
  return { share: reached, points: Math.round(reached * SCORE_TERM_MAX_POINTS), measured };
}

/**
 * Score the player's company as the game stands.
 *
 * Every term is a share of its own full mark and every full mark is a constant
 * with a measured origin (`constants.ts`), which is what the balancing scenario
 * `tests/balance/gameScore.spec.ts` owns: it plays a competent quarter century
 * and asserts that the four terms come out commensurate. A formula whose value
 * term is nine tenths of the total is a formula that only asks how rich the
 * player is, and the other three would be decoration.
 */
export function companyScore(world: World): Score {
  const goals = world.goals;
  const company = world.playerCompany;

  let earnedWeight = 0;
  let achieved = 0;
  for (let at = 0; at < goals.count; at++) {
    if (goals.status[at] !== GoalStatus.Achieved) continue;
    achieved++;
    earnedWeight += SCORE_MEDAL_WEIGHTS[goals.medal[at]!] ?? 0;
  }
  // Against every goal at gold, so two goals and eight are scored alike. A
  // world with no goals earns nothing here and the screen says which quarter
  // of the score was not on offer.
  const goalTerm = term(earnedWeight, goals.count * (SCORE_MEDAL_WEIGHTS[GoalMedal.Gold] ?? 1));

  // Quoted at the price level of the first year, or a company would read as
  // improving simply because the century wore on - D-187's rule for the
  // network-value denominator, applied to a figure the score compares against
  // a fixed constant.
  const valueCt = companyValueCt(company) / world.costFactor;

  let delivered = 0;
  for (let cargo = 0; cargo < CARGO_COUNT; cargo++)
    delivered += company.cargoDeliveredUnits[cargo]!;

  const valueTerm = term(valueCt, SCORE_VALUE_FULL_CT);
  const networkTerm = term(companyNetworkValue(world, company.id).share, SCORE_NETWORK_FULL_SHARE);
  // The one term a winding-up cannot erase: the fleet is auctioned and the
  // network value with it, but what the company DELIVERED is a lifetime tally
  // and stays. It is why a bankruptcy screen can still say what the company
  // achieved before it failed.
  const cargoTerm = term(delivered, SCORE_CARGO_FULL_UNITS);

  return {
    goals: goalTerm,
    value: valueTerm,
    network: networkTerm,
    cargo: cargoTerm,
    total: goalTerm.points + valueTerm.points + networkTerm.points + cargoTerm.points,
    goalCount: goals.count,
    goalsAchieved: achieved,
    medal: overallMedal(goals),
  };
}
