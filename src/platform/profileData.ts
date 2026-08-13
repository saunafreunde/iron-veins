/**
 * `profile.json` - what the player keeps ACROSS games (SPEC2 M24).
 *
 * This file is the pure half: the shape, the version, the migration chain and
 * the reader that turns whatever is on disk into something the interface can
 * use. `Profile.ts` beside it is the input and output; it imports this and
 * nothing here imports it, so every rule below can be driven in a test without
 * a filesystem, a browser or a Tauri runtime.
 *
 * **It is outside the save and outside the hash, and that is the whole point.**
 * A save is a world; a profile is a PLAYER - which campaign stages they have
 * finished, which medal each scenario gave them, which achievements they have
 * earned. None of it may ever reach `src/sim`: a simulation that read a
 * player's medals would produce a different world for a different player from
 * the same seed, which is architecture law #3 broken by a file the game writes
 * for its own comfort. So the profile has its own version, its own migration
 * chain and its own file, and `SAVE_VERSION` never hears about it (SPEC2 M24's
 * ledger row: "kein Save-Bump noetig").
 *
 * **Three rules the reader keeps, and all three exist because a profile must
 * never be able to stop the game starting:**
 *
 *  1. anything that is not a profile reads as an EMPTY profile. A JSON file
 *     with a syntax error, a number, an array, null - all of them are
 *     `Recovered`, and the game starts with nothing remembered rather than not
 *     at all;
 *  2. a profile from a FUTURE build is read as far as it is recognisable and
 *     then FROZEN: this build takes the campaign stages, the medals and the
 *     achievements it understands, shows them, and refuses to write the file
 *     back. Overwriting it would silently throw away whatever the newer build
 *     had put in it, and a player who ran a newer build once has not asked for
 *     that;
 *  3. every field is validated one by one. A profile with a good version and a
 *     rotten `achievements` block keeps its campaign progress.
 */

/**
 * The version this build writes.
 *
 * Version 1 is the first VERSIONED profile; a file with no version at all is
 * version 0 by definition (there was never a released build that wrote one -
 * the chain's first link exists so that the mechanism is real and tested rather
 * than a comment promising a future migration).
 */
export const PROFILE_VERSION = 1;

/** What the player has kept. Every field is optional in the FILE, never here. */
export interface ProfileData {
  readonly version: number;
  /** Campaign stage id to the best `GoalMedal` it was ever finished with. */
  readonly campaign: Readonly<Record<string, number>>;
  /** Scenario id to the best `GoalMedal` it was ever finished with. */
  readonly scenarios: Readonly<Record<string, number>>;
  /** Achievement id to the calendar year of the game it was earned in. */
  readonly achievements: Readonly<Record<string, number>>;
}

/** A player who has never finished anything. */
export const EMPTY_PROFILE: ProfileData = {
  version: PROFILE_VERSION,
  campaign: {},
  scenarios: {},
  achievements: {},
};

/** How much of the file on disk survived being read. */
export const ProfileStatus = {
  /** There was no file: a new player. */
  Fresh: 0,
  /** A file of this build's own version, read whole. */
  Current: 1,
  /** An older version, brought forward by the migration chain. */
  Migrated: 2,
  /** Not a profile, or damaged past use: the player starts with nothing. */
  Recovered: 3,
  /** Written by a newer build: read as far as possible, never written back. */
  Future: 4,
} as const;
export type ProfileStatus = (typeof ProfileStatus)[keyof typeof ProfileStatus];

/** A profile and what reading it cost. */
export interface ProfileRead {
  readonly profile: ProfileData;
  readonly status: ProfileStatus;
}

/**
 * The migration chain, indexed by the version it migrates FROM.
 *
 * `PROFILE_MIGRATIONS[n]` takes a profile at version `n` and answers with one
 * at version `n + 1`, exactly like `src/sim/save/migrations` does for a world -
 * and for the same reason: a single "read whatever is there" function is how a
 * format loses the ability to say what it used to mean. The chain must have one
 * entry per version below {@link PROFILE_VERSION}, which `profile.spec.ts`
 * asserts rather than trusts.
 */
export const PROFILE_MIGRATIONS: readonly ((raw: Record<string, unknown>) => Record<
  string,
  unknown
>)[] = [
  /**
   * 0 -> 1: an unversioned file. There is nothing to move - version 1 IS the
   * first shape - so the migration's whole job is to stamp the version on, and
   * the validation below then decides what of the three blocks is usable.
   */
  (raw) => ({ ...raw, version: 1 }),
];

/**
 * Read whatever was on disk.
 *
 * `raw` is the PARSED JSON, or `undefined` when there was no file, or anything
 * at all when the file was not JSON - the caller hands over what it got and
 * this decides what it means.
 */
export function readProfileData(raw: unknown): ProfileRead {
  if (raw === undefined || raw === null) {
    return { profile: EMPTY_PROFILE, status: ProfileStatus.Fresh };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { profile: EMPTY_PROFILE, status: ProfileStatus.Recovered };
  }

  const record = raw as Record<string, unknown>;
  const version = record['version'];
  // A version that is not a whole number is not a version. It is treated as an
  // unversioned file rather than as a damaged one: the blocks may be perfectly
  // good, and the validation below is what decides that.
  const from =
    typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : 0;

  if (from > PROFILE_VERSION) {
    return { profile: validate(record, PROFILE_VERSION), status: ProfileStatus.Future };
  }

  let migrated = record;
  for (let at = from; at < PROFILE_VERSION; at++) {
    const step = PROFILE_MIGRATIONS[at];
    if (step === undefined) {
      // A gap in the chain is a bug in this file, not something a player did.
      // It must still not cost them the game: the profile is recovered empty.
      return { profile: EMPTY_PROFILE, status: ProfileStatus.Recovered };
    }
    migrated = step(migrated);
  }

  return {
    profile: validate(migrated, PROFILE_VERSION),
    status: from === PROFILE_VERSION ? ProfileStatus.Current : ProfileStatus.Migrated,
  };
}

/** Every block of a v1 profile, each one defaulted on its own. */
function validate(record: Record<string, unknown>, version: number): ProfileData {
  return {
    version,
    campaign: medalMap(record['campaign']),
    scenarios: medalMap(record['scenarios']),
    achievements: yearMap(record['achievements']),
  };
}

/**
 * A map of id to medal. A medal outside the four bands of `GoalMedal` is
 * dropped rather than clamped - guessing what a 7 meant is worse than
 * forgetting it, which is `normaliseSettings`' own posture on a volume of two.
 */
function medalMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (id.length === 0) continue;
    if (typeof value !== 'number' || !Number.isInteger(value)) continue;
    if (value < 0 || value > 3) continue;
    out[id] = value;
  }
  return out;
}

/** A map of id to the game year something was earned in. */
function yearMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (id.length === 0) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[id] = Math.round(value);
  }
  return out;
}
