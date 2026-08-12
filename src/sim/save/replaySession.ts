import { CommandQueue } from '../commands/queue';
import { CHECKPOINT_INTERVAL_TICKS, TICKS_PER_YEAR } from '../constants';
import { calendarFromTick, type World } from '../World';
import { restoreCheckpoint, type CheckpointRing } from './checkpoints';
import { SaveFormatError } from './format';
import { replayRefusal, replayStartAt, verifyReplay, type ReplayVerification } from './replay';
import { decodeSave, type LoadedGame } from './serialize';

/**
 * The playback half of SPEC2 M16: a recording opened, scrubbed and verified.
 *
 * The session owns exactly three things - the bytes of the recording, the
 * world it currently stands at, and the SEALED queue feeding that world from
 * the log. Everything a replay theatre does is one of three operations on
 * those: step (the scheduler's ordinary tick loop, at whatever speed the
 * player picked), seek (restore the nearest checkpoint and run forward), and
 * verify (re-simulate a SECOND, independent world and compare it against what
 * the recording claims).
 *
 * It lives under `src/sim` rather than in the worker because none of it may
 * touch a wall clock or a file, and because a class the worker owns is a class
 * no test can reach: the worker is globals and timers, and every rule here is
 * worth a test of its own.
 */

/** One company of a recording, as the browser lists it. */
export interface ReplayCompanyMeta {
  readonly name: string;
  readonly colorIndex: number;
  /** True for a competitor of section 15, false for the player's company. */
  readonly ai: boolean;
}

/**
 * What the replay browser shows about a recording without playing it.
 *
 * Assembled from the BASE world plus the container: a recording knows its own
 * seed, map, companies and log, and the ring says which years can be jumped to
 * instantly. Nothing here is guessed - `verifiable` is `replayRefusal` read
 * forwards, so the browser greys out exactly what the verifier would refuse.
 */
export interface ReplayMeta {
  /** Build that recorded it - the version triple, e.g. "0.1.0" (E-11). */
  readonly gameVersion: string;
  /** Save format the recording was written in. */
  readonly saveVersion: number;
  readonly seed: number;
  readonly mapSize: number;
  /** Tick the retained log starts from; 0 unless the log was compacted. */
  readonly baseTick: number;
  /** Tick the recording ends at. */
  readonly finalTick: number;
  /** Length of the recording in game years, one decimal. */
  readonly years: number;
  readonly startYear: number;
  readonly endYear: number;
  readonly companies: readonly ReplayCompanyMeta[];
  /** Ticks a jump lands on exactly - the ring, oldest first. */
  readonly checkpointTicks: readonly number[];
  /**
   * The scrub chips: the jump ticks with the calendar year each lands in.
   *
   * The label travels WITH the tick because the calendar lives in the
   * simulation and the panel is on the other side of the worker boundary -
   * asking it to compute the year would pull `World` into the main bundle for
   * one modulo (measured at +248 kB when it did).
   */
  readonly jumps: readonly ReplayJump[];
  readonly commandCount: number;
  /** Whether this build may judge the recording at all (E-11, D-131). */
  readonly verifiable: boolean;
}

/** One scrub chip: where it lands, and the year it is labelled with. */
export interface ReplayJump {
  readonly tick: number;
  readonly year: number;
}

/** Reasons a file cannot be opened as a recording, as translation keys. */
export const REPLAY_NOT_A_RECORDING = 'ui.replay.notARecording';

/**
 * The refusal a command meets while a recording is playing.
 *
 * The interface may not author state inside a replay: a command that reached
 * the world would make the playback a different game from the recorded one and
 * every hash after it a lie. The queue refuses it structurally (it is sealed)
 * and the worker says so with this key, so the player sees a sentence rather
 * than a silence.
 */
export const REPLAY_COMMAND_REFUSAL = 'ui.replay.readOnly';

/** Length of a recording in game years, one decimal - never negative. */
function yearsBetween(baseTick: number, finalTick: number): number {
  const span = finalTick - baseTick;
  if (span <= 0) return 0;
  return Math.round((span / TICKS_PER_YEAR) * 10) / 10;
}

/**
 * Everything the browser shows about a decoded recording.
 *
 * Takes the decoded game rather than the bytes so that a caller which has one
 * already - the conversion path - does not decode a world twice.
 */
export function replayMeta(loaded: LoadedGame, currentGameVersion: string): ReplayMeta {
  const baseTick = loaded.queue.baseTick;
  const finalTick = loaded.replay === null ? loaded.world.tick : loaded.replay.finalTick;
  const aiCompanyIds = new Set<number>();
  for (const state of loaded.world.ai) aiCompanyIds.add(state.companyId);
  const checkpointTicks = loaded.ring.all.map((entry) => entry.tick);
  // The recording's OWN calendar (SPEC2 E-15): a replay of an 1880 game is
  // dated in the 1880s, and `startYear` on this record is the year the SPAN
  // begins - a different question from the world rule the world carries.
  const worldStartYear = loaded.world.startYear;

  return {
    gameVersion: loaded.gameVersion,
    saveVersion: loaded.saveVersion,
    seed: loaded.world.seed,
    mapSize: loaded.world.map.size,
    baseTick,
    finalTick,
    years: yearsBetween(baseTick, finalTick),
    startYear: calendarFromTick(baseTick, worldStartYear).year,
    endYear: calendarFromTick(finalTick, worldStartYear).year,
    companies: loaded.world.companies.map((company) => ({
      name: company.name,
      colorIndex: company.colorIndex,
      ai: aiCompanyIds.has(company.id),
    })),
    checkpointTicks,
    jumps: jumpTicksOf(checkpointTicks, baseTick, finalTick).map((tick) => ({
      tick,
      year: replayCheckpointYear(tick, worldStartYear),
    })),
    commandCount: loaded.queue.log.length,
    // A recording with no claim cannot be verified whatever the versions say -
    // there is nothing to compare the re-simulation against (D-189).
    verifiable: loaded.replay !== null && replayRefusal(loaded, currentGameVersion) === null,
  };
}

/**
 * The years a scrubber offers, given a recording's ring.
 *
 * The ring is the answer and the whole answer: a year it holds is a DECODE
 * away, a year it has evicted is re-simulated from the newest checkpoint below
 * it, and the base is always in there because eviction never takes entry zero
 * (D-188). Exported so the panel and the tests read the same rule.
 */
export function replayJumpTicks(meta: ReplayMeta): readonly number[] {
  return jumpTicksOf(meta.checkpointTicks, meta.baseTick, meta.finalTick);
}

/** The same rule over the raw ring, for the meta that is assembled from it. */
function jumpTicksOf(
  checkpointTicks: readonly number[],
  baseTick: number,
  finalTick: number,
): number[] {
  const ticks: number[] = [];
  for (const tick of checkpointTicks) {
    if (tick >= baseTick && tick <= finalTick) ticks.push(tick);
  }
  if (ticks.length === 0) ticks.push(baseTick);
  return ticks;
}

export class ReplaySession {
  private readonly bytes: Uint8Array;
  private readonly gameVersion: string;
  private readonly ring: CheckpointRing;
  private currentWorld: World;
  private currentQueue: CommandQueue;

  readonly meta: ReplayMeta;

  private constructor(
    bytes: Uint8Array,
    gameVersion: string,
    loaded: LoadedGame,
    meta: ReplayMeta,
  ) {
    this.bytes = bytes;
    this.gameVersion = gameVersion;
    this.ring = loaded.ring;
    this.meta = meta;
    const start = replayStartAt(loaded, meta.baseTick);
    this.currentWorld = start.world;
    this.currentQueue = start.queue;
  }

  /**
   * Open a recording for playback.
   *
   * A plain save is accepted as well as a `.ironreplay` - it carries a world,
   * a log and possibly a ring, which is everything a playback needs. What it
   * does not carry is a claim, so it plays and refuses verification, and
   * {@link ReplayMeta.verifiable} says so before the button is pressed.
   */
  static open(bytes: Uint8Array, currentGameVersion: string): ReplaySession {
    const loaded = decodeSave(bytes);
    if (loaded.replay === null && loaded.queue.log.length === 0) {
      throw new SaveFormatError(
        'save.commandLog: this file records no commands at all, so there is nothing to play',
        'save.commandLog',
      );
    }
    return new ReplaySession(
      bytes,
      currentGameVersion,
      loaded,
      replayMeta(loaded, currentGameVersion),
    );
  }

  /** The world the playback stands at. Replaced whole by a {@link seek}. */
  get world(): World {
    return this.currentWorld;
  }

  /** The sealed queue feeding that world from the log. */
  get queue(): CommandQueue {
    return this.currentQueue;
  }

  /** Tick the recording ends at - the scheduler's stop line. */
  get finalTick(): number {
    return this.meta.finalTick;
  }

  /** True once the playback has reached the end of the recording. */
  get atEnd(): boolean {
    return this.currentWorld.tick >= this.meta.finalTick;
  }

  /**
   * Jump to `tick`: restore the newest checkpoint at or before it and run the
   * remainder forward.
   *
   * The ring is what makes this cheap, and it is also what makes it EXACT: a
   * jump to a year the ring holds decodes a state the recording committed to,
   * so it lands on that tick with the recorded hash and not one tick either
   * side of it. Between checkpoints the remainder is re-simulated, which is
   * the same mechanism one step finer.
   *
   * A recording with no usable checkpoint below the target - one made before
   * the ring existed - falls back to the container's own state and, failing
   * that, to the reconstructed genesis (D-188); that path decodes the file
   * again, which is why it is the fallback and not the rule.
   */
  seek(tick: number): void {
    const target = Math.min(Math.max(tick, this.meta.baseTick), this.meta.finalTick);
    const checkpoint = this.ring.bestFor(target);

    let world: World;
    let queue: CommandQueue;
    if (checkpoint !== null && checkpoint.tick >= this.meta.baseTick) {
      world = restoreCheckpoint(checkpoint);
      queue = new CommandQueue();
      queue.loadLog(this.currentQueue.log, 0, this.meta.baseTick);
      queue.seekToTick(world.tick);
      queue.seal();
    } else {
      const start = replayStartAt(decodeSave(this.bytes), target);
      world = start.world;
      queue = start.queue;
    }

    while (world.tick < target) world.step(queue, null);
    this.currentWorld = world;
    this.currentQueue = queue;
  }

  /**
   * "Replay prüfen": re-simulate the whole recording and compare.
   *
   * Deliberately on a SECOND world decoded from the same bytes rather than on
   * the one being watched: a verification that consumed the playback would
   * leave the player at the end of the recording every time they asked whether
   * it was genuine, and a verification that started from wherever the player
   * happened to have scrubbed to would check a suffix and call it the whole.
   */
  verify(): ReplayVerification {
    return verifyReplay(decodeSave(this.bytes), this.gameVersion);
  }
}

/**
 * The calendar year a jump lands in - what a scrub chip is labelled with.
 *
 * A checkpoint tick is a multiple of `CHECKPOINT_INTERVAL_TICKS`, which IS one
 * game year, so this is a year boundary by construction and never a label that
 * reads "1957" for a state inside 1958.
 */
export function replayCheckpointYear(tick: number, worldStartYear: number): number {
  return calendarFromTick(tick - (tick % CHECKPOINT_INTERVAL_TICKS), worldStartYear).year;
}
