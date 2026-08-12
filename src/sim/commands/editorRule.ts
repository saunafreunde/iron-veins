import { bookExpense } from '../economy/company';
import type { World } from '../World';

/**
 * The ONE gate on the `editorMode` world rule (SPEC2 M22).
 *
 * `weather/effects.ts` is the model: exactly one file outside the rule's own
 * declaration knows that a world can have it, every function in it answers with
 * the pre-rule behaviour on its first line when the rule is off, and every
 * caller reads the rule through here rather than testing `world.editorMode`
 * itself. A rule consulted in twenty places is a rule that grows a twenty-first
 * meaning nobody wrote down.
 *
 * What the rule turns off is exactly TWO things, and the list is the whole
 * list:
 *
 *  - **funds.** The workshop is not a company with a bank account. Every
 *    command still COMPUTES its price, because SPEC2 M22 prices the new kinds
 *    by the D-119 preview pattern and a preview that quotes nothing teaches the
 *    author nothing about the world they are shaping; what changes is that the
 *    price is neither compared against the balance nor booked against it.
 *  - **ownership.** Every tile of a pre-start world is public or the author's,
 *    and a workshop that refused to move a competitor's ground would be
 *    refusing to edit the world it exists to edit.
 *
 * What it deliberately does NOT turn off - and `tests/unit/editorCommands.spec.ts`
 * holds every one of them - is everything that decides whether an edit is
 * PHYSICALLY possible or POLITICALLY allowed: water, slope, the height limit,
 * occupied ground, the terraform cascade's own obstruction guard (E-11), the
 * town council of 13.3 and exclusive building rights. Those are what the map
 * IS; suspending them would let the workshop write states the simulation cannot
 * express, and a scenario is a save (D-194) that has to load.
 *
 * The rule reaches nothing outside commands: no tick, no monthly hook, no
 * pathfinder, no draw. It is a property of what an ISSUER is allowed to ask
 * for, which is why it lives beside `execute.ts` and not in the world model.
 */

/** True when this world is a workshop rather than a game. */
export function editorMode(world: World): boolean {
  return world.editorMode;
}

/**
 * Can the acting company pay `chargeCt`?
 *
 * The one funds question in the command layer. In a workshop every price is
 * affordable; everywhere else this is the comparison the game has made since
 * M2, unchanged term for term.
 */
export function affordable(world: World, chargeCt: number): boolean {
  if (world.editorMode) return true;
  return chargeCt <= world.company.cashCt;
}

/**
 * The budget a command that spends as it goes may consume.
 *
 * `levelTile` and the workshop's own dig both take a ceiling rather than asking
 * once, because they stop where the money stops. In a workshop there is no
 * ceiling, and `Number.MAX_SAFE_INTEGER` is the honest way to say so - not
 * `Infinity`, which would make `costCt + estimate > budget` compare a finite
 * sum against a non-number and turn a bounded loop into a floating point
 * argument.
 */
export function buildBudgetCt(world: World): number {
  if (world.editorMode) return Number.MAX_SAFE_INTEGER;
  return world.company.cashCt;
}

/**
 * Book a construction expense - or, in a workshop, book nothing.
 *
 * The one booking site the command layer has. Nothing else about the accounts
 * changes: a workshop world still has a company, still has its starting
 * capital, and still shows it, because an author who exports a scenario is
 * exporting the money the PLAYER will start with.
 */
export function chargeBuild(world: World, chargeCt: number): void {
  if (world.editorMode) return;
  bookExpense(world.company, chargeCt);
}

/**
 * Pay a demolition refund back - or, in a workshop, pay nothing back.
 *
 * "Free" has to mean free in BOTH directions, and this is the half that is easy
 * to forget: a workshop that charged nothing for a road and refunded half of it
 * on the way out would let an author print money by laying and clearing track,
 * and what a scenario ships is the cash the PLAYER starts with. So the two
 * halves are one decision and one pair of functions.
 */
export function refundBuild(world: World, refundCt: number): void {
  if (world.editorMode) return;
  world.company.cashCt += refundCt;
}

/**
 * May the acting company work on a tile owned by `owner`?
 *
 * `TILE_PUBLIC` and the company's own id have always been allowed; the rule
 * adds nothing else and removes the question entirely inside a workshop.
 */
export function ownershipWaived(world: World): boolean {
  return world.editorMode;
}
