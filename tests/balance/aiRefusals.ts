import { CommandKind, RejectReason } from '../../src/sim/commands/types';
import type { CommandEnvelope, CommandOutcome } from '../../src/sim/commands/types';
import { OrderTarget } from '../../src/sim/vehicles/VehicleStore';
import type { World } from '../../src/sim/World';

/**
 * **What the AI acceptance runs could not see, for the whole project.**
 *
 * Both AI scenarios - `aiGame`'s quarter century against three competitors and
 * `aiCompany`'s scenario 5 - measured exactly one thing: the balance sheet at
 * year twenty-five. A competitor that ordered a railway it was never allowed to
 * build, every month for two hundred and fifty game months, produced a tidy
 * husk with a plausible-looking value and a green suite (D-219). A competitor
 * whose road runs were refused before they wrote their junctions produced buses
 * that lived their whole lives in `NoRoute`, and a green suite (D-218).
 *
 * The instrument that finds both is the one the diagnoses used: `World.step`'s
 * own outcome sink, counted per company and per command kind. It is a pure
 * observer - it reads what the command layer already decided and writes nothing
 * back - so the world a scenario watches is the world the soak fixture replays.
 *
 * Two guards are built on it, and neither is a band:
 *
 *  - {@link looping}: a kind issued {@link LOOP_ISSUES} times with not one
 *    accept among them is a planner ordering what the command layer exists to
 *    refuse. Red on D-219 by a factor of thirty.
 *  - {@link undeclared}: the set of (kind, reason) pairs the AI collects is
 *    DECLARED, with the reason each one is tolerated, and anything else is a
 *    defect until somebody measures it. The same shape as the project's other
 *    coupling audits (D-133, D-183). `BuildTrack/notYours` was never on any
 *    list and nothing could tell.
 */

/** Total order over report lines, so a failure reads the same every run. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Command ids read back as names, so a failure says what was refused. */
export const KIND_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(CommandKind).map(([name, id]) => [id as number, name] as const),
);

export interface KindOutcome {
  accepted: number;
  readonly rejected: Map<string, number>;
}

/** companyId -> CommandKind -> what became of the commands of that kind. */
export type CompanyOutcomes = ReadonlyMap<number, ReadonlyMap<number, KindOutcome>>;

export interface OutcomeRecorder {
  readonly outcomes: CompanyOutcomes;
  readonly sink: (envelope: CommandEnvelope, outcome: CommandOutcome) => void;
}

/** A recorder to hand to `World.step` for the length of a scenario. */
export function recordOutcomes(): OutcomeRecorder {
  const outcomes = new Map<number, Map<number, KindOutcome>>();
  const sink = (envelope: CommandEnvelope, outcome: CommandOutcome): void => {
    let perCompany = outcomes.get(envelope.companyId);
    if (perCompany === undefined) {
      perCompany = new Map<number, KindOutcome>();
      outcomes.set(envelope.companyId, perCompany);
    }
    let perKind = perCompany.get(envelope.command.kind);
    if (perKind === undefined) {
      perKind = { accepted: 0, rejected: new Map<string, number>() };
      perCompany.set(envelope.command.kind, perKind);
    }
    if (outcome.ok) perKind.accepted++;
    else
      perKind.rejected.set(outcome.reasonKey, (perKind.rejected.get(outcome.reasonKey) ?? 0) + 1);
  };
  return { outcomes, sink };
}

/**
 * **A schedule this company wrote, calling somewhere it does not own** - the
 * second observer over the same sink, and the one D-223 needed.
 *
 * The refusal profile above is blind to this by construction: taking a rival's
 * stop for your own produces no rejection at all. Every command involved is
 * ACCEPTED - the line is opened, the schedule is set, the vehicles are bought
 * and assigned - and what fails is `SetVehicleRunning`, once per vehicle, on a
 * seed nobody swept. A year-end audit is blind to it too: the review closes the
 * line that never moved, and by year twenty-five there is nothing left to look
 * at (measured - on seed 60613 at D-220's commit, the year-25 line list is
 * empty and the six refusals are the only trace).
 *
 * So it is watched where it happens, at the moment the orders are ACCEPTED.
 * Like {@link recordOutcomes} this reads what the command layer already decided
 * and writes nothing back.
 */
export function watchForeignStops(world: World): {
  readonly calls: string[];
  readonly sink: (envelope: CommandEnvelope, outcome: CommandOutcome) => void;
} {
  const calls: string[] = [];
  const sink = (envelope: CommandEnvelope, outcome: CommandOutcome): void => {
    if (!outcome.ok) return;
    const command = envelope.command;
    if (
      command.kind !== CommandKind.SetLineOrders &&
      command.kind !== CommandKind.SetVehicleOrders
    ) {
      return;
    }
    for (const order of command.orders) {
      if (order.target !== OrderTarget.Station) continue;
      const station = world.stations[order.targetId];
      if (station === undefined || station.ownerId === envelope.companyId) continue;
      calls.push(
        `company ${envelope.companyId} scheduled a stop at station ${station.id} ` +
          `of company ${station.ownerId} (tick ${world.tick})`,
      );
    }
  };
  return { calls, sink };
}

/**
 * How many times one company may issue one command KIND before the suite
 * insists that at least one of them was accepted.
 *
 * It is not a tuned number and it is not a band: the decision cycle re-plans
 * its best candidate every `AI_RETRY_TICKS` - one game month - so eight issues
 * of a kind with not one accept among them is at least eight months of the same
 * order going out and coming back. That is a LOOP, and it is what D-219 was:
 * 253 `BuildTrack` and 1,265 `BuildRailStop` from one company, none of them
 * ever accepted, over two hundred and fifty game months. Below eight, a
 * rejection is ordinary bad luck - a `BuyTrain` the company cannot afford this
 * month - and says nothing.
 */
export const LOOP_ISSUES = 8;

/**
 * **Every rejection a competitor is currently known to collect, with the reason
 * it is tolerated.**
 *
 * It is one table for both AI scenarios on purpose: what the AI orders and gets
 * refused for is a property of the AI, not of the fixture it is measured in.
 *
 * It is asserted in ONE direction, also on purpose: a reason that is seen but
 * not declared fails, a reason that is declared but not seen does not. A
 * two-seed run legitimately does not produce all of them, and a scenario with
 * one road company legitimately produces none of the rail ones.
 */
export const DECLARED_REFUSALS: ReadonlyMap<string, string> = new Map([
  [
    `BuildRoad|${RejectReason.NothingToDo}`,
    'a planned run whose tiles and joins are all already there - since D-218 ' +
      'this really is nothing to do, and the AI plans from "has road" (D-154)',
  ],
  [
    `BuildRoad|${RejectReason.NotYours}`,
    "a run that crosses a rival's road; `planRoadRuns` finds by BFS but does " +
      'not ask the owner - the road twin of D-219, not yet fixed',
  ],
  [
    `BuildRoadStop|${RejectReason.Occupied}`,
    'a stop planned onto a tile that already carries one; `clearStopTile` says ' +
      '"nobody else\'s" and never asked - D-219a measured the fix and REVERTED ' +
      'it (-281,115 EUR, zero living vehicles: the refusals brake suicidal ' +
      'building)',
  ],
  [
    `BuildRoadStop|${RejectReason.RoadNotYours}`,
    "the same scan reaching a rival's carriageway - the other half of D-219a",
  ],
  [
    `BuyRoadVehicle|${RejectReason.NeedsDepot}`,
    'buses ordered at a shed the refused build batch never laid; downstream of ' +
      'the two above and dies with them',
  ],
  [
    `BuyTrain|${RejectReason.InsufficientFunds}`,
    "the capital spent on way and stations with nothing left to crew them - D-158's " +
      'open bottleneck, verbatim',
  ],
  [
    `BuyRoadVehicle|${RejectReason.InsufficientFunds}`,
    'the road twin of the row above, and the same bottleneck: measured x4 on seed ' +
      '2718 against 8 accepted and x3 on 12345 against 21, both on the SECOND or ' +
      'third line of a company that had already spent on way and stops (D-223)',
  ],
]);

/**
 * **Deliberately NOT declared**, so it stays red if it ever returns:
 * `SetVehicleRunning|cmd.reject.noRouteToStop`. It was the whole visible trace
 * of D-223 - six buses of one company on seed 60613 - and a refusal whose cause
 * has been removed is a refusal this table must not learn to tolerate.
 */

/**
 * Commands one company ordered {@link LOOP_ISSUES} times or more without a
 * single acceptance - the D-219 signature, as readable lines.
 */
export function looping(outcomes: CompanyOutcomes): string[] {
  const loops: string[] = [];
  for (const [companyId, perKind] of outcomes) {
    for (const [kind, outcome] of perKind) {
      let rejected = 0;
      for (const count of outcome.rejected.values()) rejected += count;
      if (outcome.accepted > 0 || outcome.accepted + rejected < LOOP_ISSUES) continue;
      const reasons = [...outcome.rejected]
        .map(([reason, count]) => `${reason} x${count}`)
        .join(', ');
      loops.push(
        `company ${companyId} ${KIND_NAMES.get(kind) ?? kind}: ` +
          `${rejected} refused, 0 accepted (${reasons})`,
      );
    }
  }
  return loops.sort(byText);
}

/** Rejections nobody has diagnosed and written into {@link DECLARED_REFUSALS}. */
export function undeclared(outcomes: CompanyOutcomes): string[] {
  const rows: string[] = [];
  for (const [companyId, perKind] of outcomes) {
    for (const [kind, outcome] of perKind) {
      const name = KIND_NAMES.get(kind) ?? String(kind);
      for (const [reason, count] of outcome.rejected) {
        if (DECLARED_REFUSALS.has(`${name}|${reason}`)) continue;
        rows.push(`company ${companyId} ${name}|${reason} x${count}`);
      }
    }
  }
  return rows.sort(byText);
}

/** The refusal profile as printable lines, worst first - the trace itself. */
export function refusalTrace(outcomes: CompanyOutcomes): string[] {
  const rows: { line: string; count: number }[] = [];
  for (const [companyId, perKind] of outcomes) {
    for (const [kind, outcome] of perKind) {
      const name = KIND_NAMES.get(kind) ?? String(kind);
      for (const [reason, count] of outcome.rejected) {
        rows.push({
          line: `company ${companyId} ${name}|${reason} x${count} (accepted ${outcome.accepted})`,
          count,
        });
      }
    }
  }
  rows.sort((a, b) => b.count - a.count || byText(a.line, b.line));
  return rows.map((row) => row.line);
}
