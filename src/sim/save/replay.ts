import { CommandQueue } from '../commands/queue';
import { hashWorld, World } from '../World';
import { restoreCheckpoint, type CheckpointRing } from './checkpoints';
import { SaveFormatError, SAVE_VERSION, type ReplayClaim } from './format';
import { encodeSave, type LoadedGame } from './serialize';

/**
 * The replay half of the save format (SPEC2 M16).
 *
 * A `.ironreplay` is the save container with three things settled: the state
 * is the world at the tick the retained log STARTS from, `commandsExecuted` is
 * zero because none of that log has been applied to it, and a
 * {@link ReplayClaim} says where the recording ends and what it hashes to
 * there. Playback restores a checkpoint and runs forward; verification runs
 * forward and compares.
 */

/**
 * A recording this build must not judge (E-11, D-131).
 *
 * Cross-version verification is REFUSED with both versions named - never
 * attempted, approximated, or reported as a desync. A refusal tells the truth
 * ("this build cannot judge that recording"); an attempt would file false
 * desync reports against code that works, and a desync detector that cries
 * wolf is one nobody reads (Fehlerkatalog 38).
 */
export class ReplayVersionError extends Error {
  readonly recordedSaveVersion: number;
  readonly recordedGameVersion: string;
  readonly currentSaveVersion: number;
  readonly currentGameVersion: string;

  constructor(recorded: { saveVersion: number; gameVersion: string }, currentGameVersion: string) {
    super(
      `This replay was recorded by Iron Veins ${recorded.gameVersion} (save format ` +
        `${recorded.saveVersion}); this build is ${currentGameVersion} (save format ` +
        `${SAVE_VERSION}). Replay verification is refused across versions: what "valid" ` +
        'means changed between them, so a comparison would report a desync that is not one.',
    );
    this.name = 'ReplayVersionError';
    this.recordedSaveVersion = recorded.saveVersion;
    this.recordedGameVersion = recorded.gameVersion;
    this.currentSaveVersion = SAVE_VERSION;
    this.currentGameVersion = currentGameVersion;
  }
}

/**
 * Whether this build may verify that recording, and why not when it may not.
 *
 * Version pinning is per PAIR: the app version and the save format version
 * both have to match, because the constants the balancing tests own live in
 * the app and the shape of the world lives in the format. Loading is a
 * different question with a different answer - an older save is migrated and
 * played on, which is why this predicate is asked only by verification.
 */
export function replayRefusal(
  recorded: { saveVersion: number; gameVersion: string },
  currentGameVersion: string,
): ReplayVersionError | null {
  if (recorded.saveVersion === SAVE_VERSION && recorded.gameVersion === currentGameVersion) {
    return null;
  }
  return new ReplayVersionError(recorded, currentGameVersion);
}

/**
 * The world a game started from, rebuilt from the parameters it carries.
 *
 * This is the fallback for a recording made before the checkpoint ring
 * existed: it has no genesis checkpoint and never will, but every world rule,
 * the seed, the map size and the climate are saved state, so `World.create`
 * reproduces its first tick exactly - the same reproduction the determinism
 * suite has relied on since M0.
 *
 * Two parameters are NOT saved separately and are read off the world as it
 * stands: the player company's name and colour, both of which a command can
 * have changed since. A reconstruction is therefore only as good as those two,
 * and a recording that needs it is a recording from another save version -
 * which verification refuses anyway (D-131). It is a playback affordance, not
 * evidence.
 */
export function replayGenesis(world: World): World {
  return World.create({
    seed: world.seed,
    difficulty: world.difficulty,
    climate: world.climate,
    mapSize: world.map.size,
    companyName: world.companies[0]!.name,
    companyColorIndex: world.companies[0]!.colorIndex,
    inflation: world.inflation,
    emissions: world.emissions,
    occupancyPenalty: world.occupancyPenalty,
    signalPenalty: world.signalPenalty,
    roadCongestion: world.roadCongestion,
    aiCompanies: world.ai.length,
  });
}

/** Where a playback starts: a world at `world.tick` and a queue pointed at it. */
export interface ReplayStart {
  readonly world: World;
  readonly queue: CommandQueue;
}

/**
 * The cheapest honest starting point for reaching `targetTick`.
 *
 * Preference order: a checkpoint newer than the state the file holds, then
 * that state itself when it is not already past the target (a replay's state
 * IS its base, so this is the free path), then the newest checkpoint at or
 * before the target, and finally the genesis - reconstructed for a recording
 * that predates the ring.
 *
 * The queue is a fresh one over the same log, seeked to the first command of
 * the starting tick: a checkpoint holds the world BEFORE its own tick ran
 * (`step` drains the tick it is entering), so the command stamped with that
 * tick is still due.
 *
 * The world handed back may be the file's OWN world rather than a copy -
 * stepping it consumes the loaded game, and a caller that wants to keep it
 * decodes again.
 */
export function replayStartAt(loaded: LoadedGame, targetTick: number): ReplayStart {
  const base = loaded.queue.baseTick;
  const fileTick = loaded.world.tick;
  const checkpoint = loaded.ring.bestFor(targetTick);

  let world: World;
  if (checkpoint !== null && checkpoint.tick > fileTick) world = restoreCheckpoint(checkpoint);
  else if (fileTick <= targetTick) world = loaded.world;
  else if (checkpoint !== null) world = restoreCheckpoint(checkpoint);
  else if (base === 0) world = replayGenesis(loaded.world);
  else world = restoreFromBase(loaded);

  const queue = new CommandQueue();
  queue.loadLog(loaded.queue.log, 0, base);
  queue.seekToTick(world.tick);
  return { world, queue };
}

/** The world the retained log starts at - the base checkpoint of a trimmed recording. */
function restoreFromBase(loaded: LoadedGame): World {
  const base = loaded.ring.at(loaded.queue.baseTick);
  if (base === null) {
    throw new SaveFormatError(
      `save.logBaseTick: the log starts at ${loaded.queue.baseTick} but no checkpoint stands ` +
        'there; the recording cannot be replayed from its own beginning',
      'save.logBaseTick',
    );
  }
  return restoreCheckpoint(base);
}

/**
 * Build a `.ironreplay` out of a running game - the "export replay from save"
 * of SPEC2 M16.
 *
 * The claim is taken from the world as it stands: this is where the recording
 * ends and this is what it hashes to there. Everything else the replay needs
 * it already has - the log, the ring, and a base state that is either the
 * genesis checkpoint, the base checkpoint of a compacted log, or (for a game
 * that started before the ring existed) the reconstructed genesis.
 */
export function encodeReplay(
  world: World,
  queue: CommandQueue,
  ring: CheckpointRing,
  gameVersion: string,
): Uint8Array {
  const claim: ReplayClaim = { finalTick: world.tick, finalHash: hashWorld(world) };
  const base = queue.baseTick;

  let baseWorld: World;
  if (world.tick === base) {
    baseWorld = world;
  } else {
    const checkpoint = ring.at(base);
    if (checkpoint !== null) baseWorld = restoreCheckpoint(checkpoint);
    else if (base === 0) baseWorld = replayGenesis(world);
    else {
      throw new SaveFormatError(
        `save.logBaseTick: the log starts at ${base} but no checkpoint stands there`,
        'save.logBaseTick',
      );
    }
  }

  const replayQueue = new CommandQueue();
  replayQueue.loadLog(queue.log, 0, base);
  return encodeSave(baseWorld, replayQueue, gameVersion, ring, claim);
}

/** What a verification found. */
export interface ReplayVerification {
  /** True when every checkpoint and the final hash matched. */
  readonly ok: boolean;
  /** First tick whose hash disagreed, or -1 when none did. */
  readonly firstDivergentTick: number;
  /** The hash the recording claims at {@link firstDivergentTick}. */
  readonly expectedHash: string;
  /** The hash this build reached there. */
  readonly actualHash: string;
  /** Ticks that were compared, in order - the ring's granularity plus the end. */
  readonly checkedTicks: readonly number[];
  /** Where the re-simulation started from. */
  readonly startedAtTick: number;
}

/**
 * Re-simulate a recording and compare it against what it claims.
 *
 * The comparison happens at every checkpoint the ring carries and at the final
 * tick, so a divergence is located to the year rather than only announced -
 * each checkpoint is a hash the recording committed to on the way. That is the
 * granularity the ring gives; narrowing it further inside a year is a
 * bisection over the same mechanism.
 *
 * Refuses a recording from another version before touching a single command
 * (E-11, D-131).
 */
export function verifyReplay(loaded: LoadedGame, currentGameVersion: string): ReplayVerification {
  const refusal = replayRefusal(loaded, currentGameVersion);
  if (refusal !== null) throw refusal;

  const claim = loaded.replay;
  if (claim === null) {
    throw new SaveFormatError(
      'save.replay: this file makes no claim about where it ends, so there is nothing to verify',
      'save.replay',
    );
  }

  const start = replayStartAt(loaded, loaded.queue.baseTick);
  const world = start.world;
  const queue = start.queue;
  const startedAtTick = world.tick;

  const marks: { tick: number; hash: string }[] = [];
  for (const entry of loaded.ring.all) {
    if (entry.tick > startedAtTick) marks.push({ tick: entry.tick, hash: entry.worldDigest });
  }
  marks.push({ tick: claim.finalTick, hash: claim.finalHash });

  const checkedTicks: number[] = [];
  for (const mark of marks) {
    while (world.tick < mark.tick) world.step(queue, null);
    checkedTicks.push(mark.tick);
    const actual = hashWorld(world);
    if (actual !== mark.hash) {
      return {
        ok: false,
        firstDivergentTick: mark.tick,
        expectedHash: mark.hash,
        actualHash: actual,
        checkedTicks,
        startedAtTick,
      };
    }
  }

  return {
    ok: true,
    firstDivergentTick: -1,
    expectedHash: claim.finalHash,
    actualHash: claim.finalHash,
    checkedTicks,
    startedAtTick,
  };
}
