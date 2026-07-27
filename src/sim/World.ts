import { executeCommand } from './commands/execute';
import type { CommandQueue } from './commands/queue';
import type { CommandEnvelope, CommandOutcome } from './commands/types';
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  START_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  type Difficulty,
} from './constants';
import { bookMonthlyInterest, closeFinancialYear, createCompany } from './economy/company';
import { Fnv1a64 } from './hash';
import { Rng } from './rng';
import type { CompanyState, GameDate, NewGameParams, RngState } from './types';

/** Receives the result of every executed command, for UI feedback and logging. */
export type CommandOutcomeSink = (envelope: CommandEnvelope, outcome: CommandOutcome) => void;

/** Plain, serialisable image of the whole simulation state. */
export interface WorldStateData {
  tick: number;
  seed: number;
  difficulty: Difficulty;
  rng: RngState;
  company: CompanyState;
}

/**
 * Container of all simulation state.
 *
 * `step()` is the single entry point that advances time. It runs at a fixed
 * 20 Hz and never looks at wall-clock time - the scheduler in SimWorker decides
 * how often it is called, and that decision must not influence the outcome.
 */
export class World {
  tick = 0;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly rng: Rng;
  readonly company: CompanyState;

  constructor(params: NewGameParams) {
    this.seed = params.seed | 0;
    this.difficulty = params.difficulty;
    this.rng = Rng.fromSeed(this.seed);
    this.company = createCompany(params.companyName, params.companyColorIndex, params.difficulty);
  }

  /**
   * Advance the world by exactly one tick.
   *
   * Order matters and is part of the deterministic contract:
   *   1. every command scheduled for the current tick is executed,
   *   2. the tick counter advances,
   *   3. calendar hooks fire for the boundaries the new tick has crossed.
   * Booking the month before closing the year makes the December interest land
   * in the year that is being closed.
   */
  step(queue: CommandQueue, sink: CommandOutcomeSink | null): void {
    this.drainCommands(queue, sink);
    this.tick++;

    if (this.tick % TICKS_PER_MONTH === 0) {
      bookMonthlyInterest(this.company, this.difficulty);
    }
    if (this.tick % TICKS_PER_YEAR === 0) {
      closeFinancialYear(this.company);
    }
  }

  /**
   * Execute every command scheduled for the current tick without advancing
   * time. Called by `step()`, and separately by the scheduler while the game is
   * paused so that renaming the company or taking a loan works in pause - the
   * command is still stamped and logged for the current tick, so a replay
   * produces exactly the same world.
   */
  drainCommands(queue: CommandQueue, sink: CommandOutcomeSink | null): void {
    let due = queue.shiftDue(this.tick);
    while (due !== null) {
      const outcome = executeCommand(this, due.command);
      if (sink !== null) sink(due, outcome);
      due = queue.shiftDue(this.tick);
    }
  }

  /** Current calendar position. */
  get date(): GameDate {
    return calendarFromTick(this.tick);
  }

  /** Capture the state for serialisation. Deep enough that the copy is independent. */
  toData(): WorldStateData {
    return {
      tick: this.tick,
      seed: this.seed,
      difficulty: this.difficulty,
      rng: this.rng.getState(),
      company: { ...this.company },
    };
  }

  /** Rebuild a world from a captured state. */
  static fromData(data: WorldStateData): World {
    const world = new World({
      seed: data.seed,
      difficulty: data.difficulty,
      companyName: data.company.name,
      companyColorIndex: data.company.colorIndex,
    });
    world.tick = data.tick;
    world.rng.setState(data.rng);
    world.company.cashCt = data.company.cashCt;
    world.company.loanCt = data.company.loanCt;
    world.company.profitThisYearCt = data.company.profitThisYearCt;
    world.company.lastYearProfitCt = data.company.lastYearProfitCt;
    world.company.fixedAssetsCt = data.company.fixedAssetsCt;
    return world;
  }
}

/** Calendar position for a tick count. Months and days are zero based. */
export function calendarFromTick(tick: number): GameDate {
  const totalDays = (tick / TICKS_PER_DAY) | 0;
  const dayOfYear = totalDays % DAYS_PER_YEAR;
  return {
    year: START_YEAR + ((totalDays / DAYS_PER_YEAR) | 0),
    month: (dayOfYear / DAYS_PER_MONTH) | 0,
    day: dayOfYear % DAYS_PER_MONTH,
  };
}

/**
 * 64 bit fingerprint of the complete simulation state.
 *
 * Fed in a fixed field order; adding state means adding it here, otherwise the
 * determinism test silently stops covering it. Strings are framed with their
 * length so that "ab" + "c" cannot collide with "a" + "bc".
 */
export function hashWorld(world: World): string {
  const h = new Fnv1a64();
  h.u32(world.tick);
  h.u32(world.seed);
  h.u32(world.difficulty);

  const rng = world.rng.getState();
  h.u32(rng[0]).u32(rng[1]).u32(rng[2]).u32(rng[3]);

  const c = world.company;
  h.u32(c.name.length).str(c.name);
  h.u32(c.colorIndex);
  h.int(c.cashCt);
  h.int(c.loanCt);
  h.int(c.profitThisYearCt);
  h.int(c.lastYearProfitCt);
  h.int(c.fixedAssetsCt);

  return h.digest();
}
