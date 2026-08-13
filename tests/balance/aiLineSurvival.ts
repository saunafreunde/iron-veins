import { TICKS_PER_DAY, TICKS_PER_YEAR } from '../../src/sim/constants';
import type { World } from '../../src/sim/World';

/**
 * **What a difficulty level changes about an OPPONENT, measured on the
 * opponent rather than on its bank balance** (D-256).
 *
 * SPEC2 M24's Fertig-wenn asks that "ein Hard-KI-Lauf auf der Referenzkarte bei
 * gleichem Seed messbar hoeheren Firmenwert erreicht als Normal". Two bundles
 * measured that literally and both reported it unmet (D-252, D-253): at EQUAL
 * competitor capital, Hard finishes 5.6 % BELOW Normal in aggregate and above
 * it on only 5 of 16 seeds, with Easy on top of both. D-253 also named the
 * reason and did not take the instrument it implied:
 *
 *   what distinguishes Hard is a deeper chain look-ahead, and what a deeper
 *   chain test buys is a line that is STILL THERE in ten years (D-225's steel
 *   mill closed in 1958 and took the sink of two lines with it) - and a balance
 *   sheet at year twenty-five cannot tell a line that was never built from a
 *   line that died. It can only count the money.
 *
 * This module is that instrument: every line a competitor ever opens, with the
 * tick it opened on and the tick it was closed on (or `ALIVE`). From it come
 * the survival share, the mean age at which a line is opened, the mean life of
 * a line that DID close, and the exposure-controlled shares - and the four
 * together are what let D-256 say which readings of "the opposition did
 * better" hold and which are artefacts. Nothing here writes to the world.
 *
 * **The sampling cadence is exact by construction, not by luck.** A line is
 * observed once per game DAY; `AI_DECISION_INTERVAL_TICKS` is 400 ticks, i.e.
 * two game days, and a competitor issues at most one line command per cycle
 * (`advanceProject` and `closeDeadLine` both return as soon as they have
 * enqueued one), so no line can be opened and closed between two samples. Line
 * ids ARE recycled - `LineStore.create` takes the lowest dead slot - which is
 * why the key carries the OWNER as well as the id: a slot that changes hands
 * between two samples reads as one death and one birth, which is what it is.
 *
 * The counts are cross-checked against a completely different observer in
 * `aiDifficulty.spec.ts`: the accepted `CreateLine` commands of D-220's outcome
 * sink. Two instruments that disagree about how many lines were opened would
 * mean one of them is measuring something else.
 */

/** A line that had not been closed when the run ended. */
export const ALIVE = -1;

export interface LineLife {
  readonly ownerId: number;
  /** Game tick the line was first seen alive on. [ticks] */
  readonly openedTick: number;
  /** Game tick it was first seen gone on, or {@link ALIVE}. [ticks] */
  readonly closedTick: number;
}

export interface LineWatcher {
  /** Call once per tick, after `world.step`. */
  readonly sample: (world: World) => void;
  /** Call once at the end: closes the books on the lines still standing. */
  readonly finish: () => readonly LineLife[];
}

/** A watcher for one world. Watches every company but the player's. */
export function watchLines(): LineWatcher {
  const open = new Map<string, LineLife>();
  const lives: LineLife[] = [];
  const seen = new Set<string>();

  const sample = (world: World): void => {
    if (world.tick % TICKS_PER_DAY !== 0) return;
    seen.clear();
    for (let id = 0; id < world.lines.count; id++) {
      if (world.lines.alive[id] !== 1) continue;
      const ownerId = world.lines.ownerId[id]!;
      if (ownerId === world.playerCompanyId) continue;
      const key = `${ownerId}:${id}`;
      seen.add(key);
      if (!open.has(key)) open.set(key, { ownerId, openedTick: world.tick, closedTick: ALIVE });
    }
    for (const [key, life] of [...open]) {
      if (seen.has(key)) continue;
      lives.push({ ...life, closedTick: world.tick });
      open.delete(key);
    }
  };

  const finish = (): readonly LineLife[] => {
    for (const life of open.values()) lives.push(life);
    open.clear();
    // A total order over a list the report prints, so a failure reads the same
    // every run (law #3's habit, one layer out).
    return [...lives].sort((a, b) =>
      a.openedTick !== b.openedTick ? a.openedTick - b.openedTick : a.ownerId - b.ownerId,
    );
  };

  return { sample, finish };
}

export interface SurvivalReading {
  /** Lines a competitor ever opened. */
  readonly opened: number;
  /** How many of them were still standing when the run ended. */
  readonly alive: number;
  /** `alive / opened`, in per mille so the report can print integers. */
  readonly survivalPerMille: number;
  /** Mean game year a line was opened in. [game years] */
  readonly meanOpenedYear: number;
  /** Mean life of the lines that DID close. [game years] */
  readonly meanClosedLifeYears: number;
  /** Lines opened early enough to have had `EXPOSURE_YEARS` to die in. */
  readonly exposed: number;
  /** How many of THOSE were still standing. */
  readonly exposedAlive: number;
  /** `exposedAlive / exposed`, per mille. */
  readonly exposedSurvivalPerMille: number;
}

/**
 * How long a line must have been exposed to the risk of closing before its
 * survival says anything about judgement. [game years]
 *
 * Half the quarter century. The raw survival share counts a line opened in year
 * twenty-four as a survivor, so a level that opens its lines LATER scores
 * higher for that reason alone - and the levels do not open at the same time
 * (measured in D-256: mean opening year 7.82 Easy, 9.70 Normal, 10.60 Hard).
 * The exposure-controlled share asks only about lines that had at least this
 * long to fail, and it is the reading that separates "a line that lasts" from
 * "a line that was young when the clock stopped".
 */
export const EXPOSURE_YEARS = 12.5;

/** Read a batch of measured lives - one level's whole sweep - as one row. */
export function surviving(lives: readonly LineLife[], endTick: number): SurvivalReading {
  const opened = lives.length;
  let alive = 0;
  let openedTickSum = 0;
  let closedLifeSum = 0;
  let closed = 0;
  let exposed = 0;
  let exposedAlive = 0;
  const exposureTicks = EXPOSURE_YEARS * TICKS_PER_YEAR;

  for (const life of lives) {
    openedTickSum += life.openedTick;
    if (life.closedTick === ALIVE) alive++;
    else {
      closed++;
      closedLifeSum += life.closedTick - life.openedTick;
    }
    if (life.openedTick <= endTick - exposureTicks) {
      exposed++;
      const lifeTicks = (life.closedTick === ALIVE ? endTick : life.closedTick) - life.openedTick;
      if (lifeTicks >= exposureTicks) exposedAlive++;
    }
  }

  return {
    opened,
    alive,
    survivalPerMille: opened === 0 ? 0 : Math.round((1_000 * alive) / opened),
    meanOpenedYear: opened === 0 ? 0 : openedTickSum / opened / TICKS_PER_YEAR,
    meanClosedLifeYears: closed === 0 ? 0 : closedLifeSum / closed / TICKS_PER_YEAR,
    exposed,
    exposedAlive,
    exposedSurvivalPerMille: exposed === 0 ? 0 : Math.round((1_000 * exposedAlive) / exposed),
  };
}

/** One line of report, in the shape every balance scenario prints. */
export function survivalLine(name: string, reading: SurvivalReading): string {
  return (
    `${name.padEnd(6)} lines ${String(reading.opened).padStart(3)} opened, ` +
    `${String(reading.alive).padStart(3)} alive at year 25 ` +
    `(${(reading.survivalPerMille / 10).toFixed(1)} %), ` +
    `mean opened in year ${reading.meanOpenedYear.toFixed(2)}, ` +
    `mean life of a closed line ${reading.meanClosedLifeYears.toFixed(2)} yr, ` +
    `exposed ${reading.exposedAlive}/${reading.exposed} ` +
    `(${(reading.exposedSurvivalPerMille / 10).toFixed(1)} %)`
  );
}
