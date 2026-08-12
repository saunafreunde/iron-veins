import {
  COUNCIL_PROFILE_WEIGHT,
  ELECTION_STREAM_NAME,
  ELECTION_TERM_YEARS,
  TICKS_PER_YEAR,
} from '../constants';
import { reportElection } from '../news/report';
import { streamSalt } from '../rng';
import { COUNCIL_PROFILE_COUNT, CouncilProfile } from './council';
import type { World } from '../World';

/**
 * Council elections (SPEC.md 13.3 completed by SPEC2 M20).
 *
 * Every {@link ELECTION_TERM_YEARS} years every town votes, and what it elects
 * is a PROFILE: how much this council minds the noise a company makes and how
 * much it rewards a clean fleet. Nothing else about the rating moves - the
 * stations, the traffic carried, the demolitions and the goodwill are the same
 * facts they were the day before - so an election is the one thing in the game
 * that changes what a company is worth to a town without the company doing
 * anything at all.
 *
 * **The draws come from the named election stream and never from `world.rng`**
 * (Z3, D-106). This is the exact mistake D-106 was written for and it is worth
 * spelling out rather than referring to: the gameplay stream is what the
 * breakdown roll of 11.3 draws from once per eligible vehicle per game day, so
 * a single extra draw taken here would shift every later breakdown in every
 * existing seed - the balance scenarios, the soak recording and every save a
 * player has would run a different future for a reason that has nothing to do
 * with politics. The salt is the stream's own name folded with the ELECTION
 * NUMBER, which is what makes each ballot a different sequence (D-128's
 * tender-review precedent, one period further out than the weather's day).
 *
 * **The draw count is fixed at one per town per election** and is a function of
 * the town count alone - never of what was drawn - so the stream's position
 * after an election is knowable from the world's shape.
 *
 * **A world with the rule off returns on the first line.** No stream is
 * constructed, no draw is taken and no profile is written, so every town keeps
 * the balanced council it was born with, both profile factors stay exactly 1
 * and the rating arithmetic is the pre-M20 arithmetic term for term (the D-201
 * device). That inertness is what lets the rule ship off by default without
 * re-banding a suite that was measured without it (Fehlerkatalog 34).
 */

/**
 * How many elections have been held by `tick`, i.e. the number of the NEXT
 * one minus one. Tick zero is not an election - a world starts with the
 * council it starts with.
 */
export function electionsHeldBy(tick: number): number {
  return Math.floor(tick / (ELECTION_TERM_YEARS * TICKS_PER_YEAR));
}

/** Ticks until the next ballot, from `tick`. */
export function ticksToNextElection(tick: number): number {
  const term = ELECTION_TERM_YEARS * TICKS_PER_YEAR;
  return term - (tick % term);
}

/**
 * Hold an election in every town, if this tick is one.
 *
 * Called from the yearly hook. The test is on the tick rather than on a saved
 * countdown for the reason D-231 gave for the growth cursor: the tick is
 * already saved and hashed, so a stored term counter would be a second source
 * of truth for a pure function of the first (the D-174 pattern). What IS saved
 * is the RESULT - `Town.councilProfile` - because a result is a fact about the
 * world and not an observation about the clock.
 */
export function runElections(world: World): void {
  if (!world.elections) return;
  if (world.tick === 0 || world.tick % (ELECTION_TERM_YEARS * TICKS_PER_YEAR) !== 0) return;

  const election = electionsHeldBy(world.tick);
  const stream = world.streamFor((streamSalt(ELECTION_STREAM_NAME) + election) | 0);

  let total = 0;
  for (let profile = 0; profile < COUNCIL_PROFILE_COUNT; profile++) {
    total += COUNCIL_PROFILE_WEIGHT[profile]!;
  }

  for (let t = 0; t < world.towns.length; t++) {
    const town = world.towns[t]!;
    // One draw per town, taken before anything is decided, so the count is a
    // function of the town list and of nothing the ballot produced (Z3).
    let pick = stream.nextFloat() * total;
    // Balanced is the fallback and a real one: its weight is the largest of
    // the three, so the loop only fails to pick when floating point leaves a
    // sliver at the very top of the range.
    let chosen: number = CouncilProfile.Balanced;
    for (let profile = 0; profile < COUNCIL_PROFILE_COUNT; profile++) {
      pick -= COUNCIL_PROFILE_WEIGHT[profile]!;
      if (pick < 0) {
        chosen = profile;
        break;
      }
    }
    const previous = town.councilProfile;
    town.councilProfile = chosen;
    // Reported where both results are in hand, exactly as the storm warning is
    // (D-202): a council RE-ELECTED unchanged is not news, and reporting one
    // would put the same sentence about the same town in the log twenty-five
    // times a century.
    if (chosen !== previous) reportElection(world, town, chosen);
  }
}
