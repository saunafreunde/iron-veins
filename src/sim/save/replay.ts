import { CommandQueue } from '../commands/queue';
import type { CommandEnvelope } from '../commands/types';
import { calendarFromTick, hashWorld, World } from '../World';
import { restoreCheckpoint, tryRestoreCheckpoint, type CheckpointRing } from './checkpoints';
import { SaveFormatError, SAVE_VERSION, type Checkpoint, type ReplayClaim } from './format';
import {
  checkpointSegmentStart,
  claimSegmentStart,
  retainedScheduleDigest,
  scheduleDigest,
  type ScheduleCommitment,
} from './schedule';
import { decodeSave, encodeSave, type LoadedGame } from './serialize';

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
 *
 * The goals travel as DESCRIPTORS, which is what `World.create` takes: a
 * genesis world has been asked the same questions and has answered none of
 * them, so `GoalStore.add` enters each one Open with no medal. Passing them is
 * not optional detail - goals are hashed world state (D-193), so a genesis
 * rebuilt without them would be a different world at tick 0 and every scenario
 * whose log had to be replayed from a reconstruction would diverge on its first
 * comparison.
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
    goals: world.goals.toData(),
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
  // A playback reads its log and writes nothing back into it: the AI's own
  // moves are already recorded there and the interface must not be able to
  // add one (SPEC2 M16, D-189).
  queue.seal();
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
 *
 * A save this build had to MIGRATE is deliberately NOT run through here: the
 * only end hash available for one is a hash THIS build computed over a state
 * the writing build never committed to, and a claim like that is a claim about
 * nobody's world. Such a save is shelved as it stands and watched from its
 * reconstructed genesis instead - playable, and honest about being unjudgeable
 * (SPEC2 M16 B2, D-189).
 */
export function encodeReplay(
  world: World,
  queue: CommandQueue,
  ring: CheckpointRing,
  gameVersion: string,
): Uint8Array {
  const claim: ReplayClaim = {
    finalTick: world.tick,
    finalHash: hashWorld(world),
    // The part-year tail no checkpoint covers - the one bracket in which a
    // command could otherwise be moved unseen (D-191).
    scheduleDigest: retainedScheduleDigest(queue, claimSegmentStart(world.tick), world.tick),
  };
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

/** Bytes that are a recording, and the decoded game they describe. */
export interface ConvertedReplay {
  /** The recording: the input unchanged, or a freshly encoded `.ironreplay`. */
  readonly bytes: Uint8Array;
  /** The game those bytes decode to - what `replayMeta` describes it from. */
  readonly loaded: LoadedGame;
  /** False when the input was handed back untouched. */
  readonly converted: boolean;
}

/**
 * Turn a file into a recording - the ONE conversion, behind every door that
 * offers one (SPEC2 M16: the shelf's import, "export replay from save", and
 * the crash bundle of M10/D-132).
 *
 * Two of the three cases hand the file back UNCHANGED, and both for the same
 * reason: re-encoding it would restamp it with this build's version and turn
 * somebody else's recording into one this build claims to have made.
 *
 *  - a file that already IS a `.ironreplay`;
 *  - a save from an older format. It migrates and plays from its
 *    reconstructed genesis (SPEC2 M16's "Alt-Saves bleiben abspielbar"), and
 *    it makes no claim about its end, so verification refuses it by name
 *    rather than reporting a divergence that is really a version gap (E-11).
 *
 * A save of THIS format is converted: it carries a ring and a log this build
 * wrote, which is everything a claim needs to be honest (D-189).
 *
 * It lives here rather than in the worker because a crash bundle is assembled
 * by the MAIN thread, over a worker that is already dead (D-132) - two doors
 * onto one conversion, never two conversions.
 */
export function replayFromSaveBytes(bytes: Uint8Array): ConvertedReplay {
  const loaded = decodeSave(bytes);
  if (loaded.replay !== null || loaded.saveVersion !== SAVE_VERSION) {
    return { bytes, loaded, converted: false };
  }
  const replayBytes = encodeReplay(loaded.world, loaded.queue, loaded.ring, loaded.gameVersion);
  return { bytes: replayBytes, loaded: decodeSave(replayBytes), converted: true };
}

/**
 * A recording whose command log contradicts what the recording committed to.
 *
 * Two different kinds of contradiction live here, and the difference between
 * them is the whole of D-191:
 *
 *  - **order** (`tickOrder`, `sequence`). `CommandQueue.enqueue` stamps every
 *    envelope with the next sequence number and refuses a tick older than the
 *    last one, so within ONE recording the retained log is contiguous in `seq`
 *    and non-decreasing in `tick` by construction - a trim keeps both, because
 *    it drops a prefix and renumbers nothing (D-188). An entry inserted or
 *    removed breaks one of the two.
 *  - **schedule**. An entry MOVED to another tick inside the same bracket
 *    breaks NEITHER: the sequence is untouched and the ticks still rise. D-189
 *    claimed otherwise and was wrong. Only a commitment in the FILE can see
 *    that, and since the correction bundle there is one: every mark carries
 *    the schedule digest of its own segment (`save/schedule.ts`).
 *
 * It is a LOCATOR, never the verdict: what decides whether a recording
 * reproduces is the hash comparison, and this only ever explains - or refuses
 * to explain - a divergence the hashes already found.
 */
export interface ReplayLogBreak {
  readonly kind: 'tickOrder' | 'sequence' | 'schedule';
  /** Index into the retained log of the entry that breaks the order; -1 for a schedule break. */
  readonly index: number;
  readonly tick: number;
  readonly seq: number;
  /** The segment a schedule break was found in; the entry's own tick otherwise. */
  readonly fromTick: number;
  readonly toTick: number;
  /** Translation key naming what broke. */
  readonly reasonKey: string;
}

/**
 * The evidence behind a `divergedAt` verdict.
 *
 * An exact tick is only ever reported with one of these attached, and every
 * field of it is MEASURED rather than argued:
 *
 *  - `matchedHash` is the hash reached at `tick` by two independent
 *    re-simulations from the checkpoint at `fromTick`: the recording's own log,
 *    and a control that is handed NO commands at all. The recording committed
 *    to the schedule of that segment and it says there is exactly one command
 *    in it, at `tick` - so the recording, too, ran no command before `tick`,
 *    and the control IS the recorded trajectory there. The two agreeing is
 *    therefore the literal statement "the re-simulation reproduces the
 *    recording up to `tick`".
 *  - `hashAfter` and `controlHashAfter` are the same two worlds one tick
 *    later, with and without that command. They differ from the recording's
 *    own next state by the contradiction the bracket end already showed: the
 *    state at `tick` was the recorded one, no other command runs before the
 *    bracket end, and the bracket end disagreed - so `tick` is where the two
 *    part.
 */
export interface DivergenceProof {
  /** The first tick at which the re-simulation and the recording part. */
  readonly tick: number;
  /** The committed state the two re-simulations started from. */
  readonly fromTick: number;
  /** What both re-simulations reach at {@link tick} - the recorded state there. */
  readonly matchedHash: string;
  /** The recording's own log, one tick on. */
  readonly hashAfter: string;
  /** The control, one tick on: the world had that command not been there. */
  readonly controlHashAfter: string;
}

/**
 * What a verification found - the four answers it is allowed to give.
 *
 * The taxonomy is the correction D-191 makes to D-189. A single
 * `firstDivergentTick` had to answer four different questions at once, so it
 * answered three of them with a confident number that was not true: a bracket
 * dressed as a tick, a retimed command reported at the tick the tamper chose,
 * and a broken FILE reported as a diverged SIM.
 *
 *  - `verified` - every commitment the recording made was reproduced.
 *  - `divergedAt` - the tick is PROVEN, and the proof is attached.
 *  - `divergedInBracket` - the world provably parted somewhere in
 *    `[fromTick, toTick)` and this build cannot honestly go finer. `whyKey`
 *    says what stopped it, because "we could not narrow" and "the file's
 *    timings cannot be trusted" are very different findings.
 *  - `corruptRecording` - the file contradicts ITSELF, so there is nothing to
 *    compare. Never reported as a tick: no tick diverged.
 */
export type ReplayVerdict =
  | { readonly kind: 'verified' }
  | { readonly kind: 'divergedAt'; readonly tick: number; readonly proof: DivergenceProof }
  | {
      readonly kind: 'divergedInBracket';
      readonly fromTick: number;
      readonly toTick: number;
      /** Translation key of the sentence saying why it could not be narrowed. */
      readonly whyKey: string;
    }
  | {
      readonly kind: 'corruptRecording';
      /** Field path of the self-contradicting part, e.g. `save.checkpoints[2]`. */
      readonly where: string;
      /** Tick the contradicting claim stands at. */
      readonly tick: number;
      /** Translation key naming the contradiction. */
      readonly whatKey: string;
      /** The failing detail in plain text, for a bug report. */
      readonly detail: string;
    };

/** What a verification found. */
export interface ReplayVerification {
  /** The answer. Everything else here is the evidence behind it. */
  readonly verdict: ReplayVerdict;
  /** True exactly when the verdict is `verified` - every commitment reproduced. */
  readonly ok: boolean;
  /** Calendar years of the ticks the verdict names, for the sentence on screen. */
  readonly years: readonly number[];
  /** Newest committed tick that still agreed - the floor of the bracket. */
  readonly lastMatchingTick: number;
  /** The hash the recording claims at the committed tick that disagreed. */
  readonly expectedHash: string;
  /** The hash this build reached there. */
  readonly actualHash: string;
  /** Ticks that were compared, in order - the ring's granularity plus the end. */
  readonly checkedTicks: readonly number[];
  /** Where the re-simulation started from. */
  readonly startedAtTick: number;
  /** The recording's own log contradicting itself or its commitments, or null. */
  readonly logBreak: ReplayLogBreak | null;
  /** Translation key of the sentence the panel prints for this verdict. */
  readonly reasonKey: string;
}

/** The sentence each verdict prints; one key per kind, so the panel cannot invent one. */
const VERDICT_KEYS: Record<ReplayVerdict['kind'], string> = {
  verified: 'ui.replay.verify.ok',
  divergedAt: 'ui.replay.verify.divergedAt',
  divergedInBracket: 'ui.replay.verify.bracket',
  corruptRecording: 'ui.replay.verify.corrupt',
};

/**
 * Walk the retained log against everything the recording committed about it,
 * and return the first contradiction, or null.
 *
 * Two passes, and the second one is what D-189 lacked:
 *
 *  - the STEP from one entry to the next, which catches an entry inserted or
 *    removed. The first entry sets the baseline rather than being checked
 *    against zero: a trimmed recording legitimately starts at a sequence
 *    number well above zero (`trimBefore` deliberately does not renumber).
 *  - the SCHEDULE of every committed segment, recomputed from the log and
 *    compared with the digest the mark carries. This is the only thing that
 *    can see a command MOVED inside a bracket, and a recording that carries no
 *    commitment for a segment is simply not asked about it - `verifyReplay`
 *    then refuses the exactness claim instead (`ui.replay.bracket.uncommitted`).
 */
export function checkLogIntegrity(
  log: readonly CommandEnvelope[],
  commitments: readonly ScheduleCommitment[],
): ReplayLogBreak | null {
  for (let i = 1; i < log.length; i++) {
    const previous = log[i - 1]!;
    const entry = log[i]!;
    if (entry.tick < previous.tick) {
      return {
        kind: 'tickOrder',
        index: i,
        tick: entry.tick,
        seq: entry.seq,
        fromTick: entry.tick,
        toTick: entry.tick,
        reasonKey: 'ui.replay.break.tickOrder',
      };
    }
    if (entry.seq !== previous.seq + 1) {
      return {
        kind: 'sequence',
        index: i,
        tick: entry.tick,
        seq: entry.seq,
        fromTick: entry.tick,
        toTick: entry.tick,
        reasonKey: 'ui.replay.break.sequence',
      };
    }
  }

  for (let i = 0; i < commitments.length; i++) {
    const commitment = commitments[i]!;
    if (scheduleDigest(log, commitment.fromTick, commitment.toTick) === commitment.digest) continue;
    return {
      kind: 'schedule',
      index: -1,
      tick: commitment.fromTick,
      seq: -1,
      fromTick: commitment.fromTick,
      toTick: commitment.toTick,
      reasonKey: 'ui.replay.break.schedule',
    };
  }
  return null;
}

/**
 * Every schedule a recording committed to and that this build can recompute.
 *
 * A commitment is skipped for exactly two reasons, and both of them are the
 * absence of evidence rather than the presence of a problem: the mark carries
 * no digest (a recording written before the commitment existed), or its
 * segment reaches under `logBaseTick` and the log no longer holds it.
 */
export function scheduleCommitmentsOf(loaded: LoadedGame): ScheduleCommitment[] {
  const commitments: ScheduleCommitment[] = [];
  const baseTick = loaded.queue.baseTick;
  const ring = loaded.ring.all;
  for (let i = 0; i < ring.length; i++) {
    const entry = ring[i]!;
    const fromTick = checkpointSegmentStart(entry.tick);
    if (entry.scheduleDigest === '' || fromTick < baseTick) continue;
    commitments.push({
      fromTick,
      toTick: entry.tick,
      digest: entry.scheduleDigest,
      where: `save.checkpoints[${i}]`,
    });
  }
  const claim = loaded.replay;
  if (claim !== null && claim.scheduleDigest !== '') {
    const fromTick = claimSegmentStart(claim.finalTick);
    if (fromTick >= baseTick) {
      commitments.push({
        fromTick,
        toTick: claim.finalTick,
        digest: claim.scheduleDigest,
        where: 'save.replay',
      });
    }
  }
  return commitments;
}

/** The ticks inside a bracket that carry a command - the only candidates. */
function candidateTicks(
  log: readonly CommandEnvelope[],
  fromTick: number,
  toTick: number,
): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < log.length; i++) {
    const tick = log[i]!.tick;
    // The floor is INCLUSIVE: a checkpoint holds the world before its own tick
    // ran, so a command stamped with it is still ahead of the state that
    // matched. The ceiling is exclusive for the same reason.
    if (tick < fromTick || tick >= toTick) continue;
    if (ticks[ticks.length - 1] !== tick) ticks.push(tick);
  }
  return ticks;
}

/**
 * Try to PROVE that `tick` is where the re-simulation and the recording part,
 * by re-simulating the bracket twice. Returns null when the proof does not
 * come off, and a null answer is never dressed up as an exact tick.
 *
 * The two runs both start from the checkpoint at `fromTick`, whose world the
 * running comparison has already matched. One is handed the recording's log,
 * the other nothing at all. Up to `tick` they must agree - the committed
 * schedule says the only command of the segment is the one at `tick` - and
 * their agreeing is the measurement that says the re-simulation is still ON the
 * recorded trajectory there. Then one tick more, with and without that command.
 *
 * Neither run is the playback the player is watching and neither touches the
 * world the running comparison used: this is a diagnosis, and it runs on the
 * failure path only.
 */
export function proveDivergentTick(
  loaded: LoadedGame,
  fromTick: number,
  tick: number,
): DivergenceProof | null {
  const entry = loaded.ring.at(fromTick);
  // No committed state to re-simulate from: the bracket floor is a state this
  // build reached rather than one the recording put its name to, and a proof
  // that starts from an unverified world proves nothing.
  if (entry === null || tick < fromTick) return null;

  const recorded = restoreCheckpoint(entry);
  const recordedQueue = new CommandQueue();
  recordedQueue.loadLog(loaded.queue.log, 0, loaded.queue.baseTick);
  recordedQueue.seekToTick(fromTick);
  recordedQueue.seal();

  // The control is the same world with an empty, sealed queue: no logged
  // command, and no AI move re-derived on top of one either (D-189).
  const control = restoreCheckpoint(entry);
  const controlQueue = new CommandQueue();
  controlQueue.seal();

  while (recorded.tick < tick) recorded.step(recordedQueue, null);
  while (control.tick < tick) control.step(controlQueue, null);
  const matchedHash = hashWorld(recorded);
  if (matchedHash !== hashWorld(control)) return null;

  recorded.step(recordedQueue, null);
  control.step(controlQueue, null);
  return {
    tick,
    fromTick,
    matchedHash,
    hashAfter: hashWorld(recorded),
    controlHashAfter: hashWorld(control),
  };
}

/**
 * Narrow a divergence from the bracket the ring commits to down to the tick,
 * when - and only when - the recording allows it to be PROVEN.
 *
 * The chain of conditions is the argument, written out:
 *
 *  1. the log must not contradict itself or its own commitments, or the
 *     executed sequence is not the recorded one and nothing below holds;
 *  2. the bracket must be covered by a schedule commitment, or the file's
 *     command ticks are the tamper's word for when the commands ran (this is
 *     the retiming D-189 believed it had ruled out);
 *  3. exactly one command tick may lie in it. None means the divergence cannot
 *     be explained by an input at all - it is then a difference between two
 *     simulations and can begin anywhere; several means saying which one it was
 *     would be a guess that is wrong whenever the tamper is the second one;
 *  4. the resimulation proof has to come off (`proveDivergentTick`).
 */
export function narrowDivergence(
  loaded: LoadedGame,
  fromTick: number,
  toTick: number,
  logBreak: ReplayLogBreak | null,
): ReplayVerdict {
  const bracket = (whyKey: string): ReplayVerdict => ({
    kind: 'divergedInBracket',
    fromTick,
    toTick,
    whyKey,
  });

  if (logBreak !== null) {
    return bracket(
      logBreak.kind === 'schedule' ? 'ui.replay.bracket.schedule' : 'ui.replay.bracket.logBreak',
    );
  }
  const covered = scheduleCommitmentsOf(loaded).some(
    (commitment) => commitment.fromTick <= fromTick && commitment.toTick >= toTick,
  );
  if (!covered) return bracket('ui.replay.bracket.uncommitted');

  const candidates = candidateTicks(loaded.queue.log, fromTick, toTick);
  if (candidates.length === 0) return bracket('ui.replay.bracket.noCommands');
  if (candidates.length > 1) return bracket('ui.replay.bracket.multipleCommands');

  const proof = proveDivergentTick(loaded, fromTick, candidates[0]!);
  if (proof === null) return bracket('ui.replay.bracket.unproven');
  return { kind: 'divergedAt', tick: proof.tick, proof };
}

/** One thing a recording committed to: a world hash at a tick. */
interface Mark {
  readonly tick: number;
  readonly hash: string;
  /** The ring entry behind it, or null for the end claim (which has no payload). */
  readonly checkpoint: Checkpoint | null;
  readonly where: string;
}

/**
 * Ask a failing checkpoint whether it agrees with ITSELF.
 *
 * A checkpoint carries a payload and a digest of that payload, so a claim this
 * build cannot reproduce has two possible readings and they are told apart
 * here rather than guessed: if the payload hashes to the digest, the mark is a
 * coherent recorded state and the disagreement is a real divergence; if it does
 * not - or the payload is not a world at all, or stands at another tick - the
 * FILE is broken, and a broken file has no divergent tick to name.
 *
 * Returns null when the checkpoint is self-consistent (or is the end claim,
 * which carries nothing to check itself against).
 */
function checkpointSelfContradiction(
  entry: Checkpoint | null,
): { readonly whatKey: string; readonly detail: string } | null {
  if (entry === null) return null;
  const result = tryRestoreCheckpoint(entry);
  if (result.ok) return null;
  return {
    whatKey:
      result.fault === 'digest'
        ? 'ui.replay.corrupt.checkpointDigest'
        : 'ui.replay.corrupt.checkpointPayload',
    detail: result.message,
  };
}

/**
 * Re-simulate a recording and compare it against what it claims.
 *
 * The running comparison happens at every checkpoint the ring carries and at
 * the final tick - each of those is a hash the recording committed to on the
 * way, so a divergence is LOCATED rather than only announced. What the
 * correction bundle adds is what happens at the first mark that disagrees, and
 * it is two questions rather than one (D-191):
 *
 *  - **is the file even self-consistent?** A checkpoint whose payload does not
 *    hash to its own digest is a broken recording, not a diverged simulation,
 *    and reporting a tick for it would be a confident answer to a question
 *    nobody asked. The same is true one step further out: if a LATER
 *    commitment is reproduced by the very trajectory that failed this one,
 *    then this build is on the recorded trajectory and the mark it failed is a
 *    claim about nobody's world. That lookahead is deliberately ONE mark deep
 *    - it costs one more bracket of re-simulation, and a diagnosis may cost
 *    that; a full walk of a quarter century after every divergence may not.
 *  - **can the bracket be narrowed to a tick, provably?** That is
 *    {@link narrowDivergence}, and it answers with the bracket - saying why -
 *    far more often than D-189's version did.
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
  const logBreak = checkLogIntegrity(loaded.queue.log, scheduleCommitmentsOf(loaded));

  const marks: Mark[] = [];
  const ring = loaded.ring.all;
  for (let i = 0; i < ring.length; i++) {
    const entry = ring[i]!;
    if (entry.tick > startedAtTick) {
      marks.push({
        tick: entry.tick,
        hash: entry.worldDigest,
        checkpoint: entry,
        where: `save.checkpoints[${i}]`,
      });
    }
  }
  marks.push({
    tick: claim.finalTick,
    hash: claim.finalHash,
    checkpoint: null,
    where: 'save.replay',
  });

  const checkedTicks: number[] = [];
  let lastMatchingTick = startedAtTick;
  let failedMark: Mark | null = null;
  let failedFrom = startedAtTick;
  let failedHash = '';

  const verdictOf = (verdict: ReplayVerdict, expected: string, actual: string) =>
    finish(verdict, {
      lastMatchingTick,
      expectedHash: expected,
      actualHash: actual,
      checkedTicks,
      startedAtTick,
      logBreak,
    });

  for (const mark of marks) {
    while (world.tick < mark.tick) world.step(queue, null);
    checkedTicks.push(mark.tick);
    const actual = hashWorld(world);

    if (actual === mark.hash) {
      if (failedMark !== null) {
        // The trajectory that failed the earlier mark reproduces this one, so
        // it is the recorded trajectory and the earlier claim is not.
        return verdictOf(
          {
            kind: 'corruptRecording',
            where: failedMark.where,
            tick: failedMark.tick,
            whatKey: 'ui.replay.corrupt.checkpointUnreachable',
            detail:
              `the recording claims ${failedMark.hash} at tick ${failedMark.tick} and this ` +
              `build reaches ${failedHash} there, yet the same re-simulation reproduces the ` +
              `recording's own hash at tick ${mark.tick}`,
          },
          failedMark.hash,
          failedHash,
        );
      }
      lastMatchingTick = mark.tick;
      continue;
    }

    if (failedMark === null) {
      failedMark = mark;
      failedFrom = lastMatchingTick;
      failedHash = actual;
      const contradiction = checkpointSelfContradiction(mark.checkpoint);
      if (contradiction !== null) {
        return verdictOf(
          {
            kind: 'corruptRecording',
            where: mark.where,
            tick: mark.tick,
            whatKey: contradiction.whatKey,
            detail: contradiction.detail,
          },
          mark.hash,
          actual,
        );
      }
      // One mark of lookahead, and no more: see the note above.
      continue;
    }
    break;
  }

  if (failedMark === null) {
    return verdictOf({ kind: 'verified' }, claim.finalHash, claim.finalHash);
  }
  return verdictOf(
    narrowDivergence(loaded, failedFrom, failedMark.tick, logBreak),
    failedMark.hash,
    failedHash,
  );
}

/** Assemble the verification around a verdict - one place decides the key and the years. */
function finish(
  verdict: ReplayVerdict,
  evidence: {
    lastMatchingTick: number;
    expectedHash: string;
    actualHash: string;
    checkedTicks: readonly number[];
    startedAtTick: number;
    logBreak: ReplayLogBreak | null;
  },
): ReplayVerification {
  const ticks =
    verdict.kind === 'divergedAt'
      ? [verdict.tick]
      : verdict.kind === 'divergedInBracket'
        ? [verdict.fromTick, verdict.toTick]
        : verdict.kind === 'corruptRecording'
          ? [verdict.tick]
          : [];
  return {
    verdict,
    ok: verdict.kind === 'verified',
    years: ticks.map((tick) => calendarFromTick(tick).year),
    lastMatchingTick: evidence.lastMatchingTick,
    expectedHash: evidence.expectedHash,
    actualHash: evidence.actualHash,
    checkedTicks: evidence.checkedTicks,
    startedAtTick: evidence.startedAtTick,
    // A log whose own numbering is broken but that still reproduces every
    // committed hash is reported as reproducing: the hashes are the authority
    // and they say the world is the recorded one (the break is then the
    // recording's bookkeeping, not its history).
    logBreak: evidence.logBreak,
    reasonKey: VERDICT_KEYS[verdict.kind],
  };
}
