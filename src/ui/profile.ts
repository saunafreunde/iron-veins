import { profileIsFrozen, readProfile, writeProfile } from '../platform/Profile';
import { PROFILE_VERSION, ProfileStatus, type ProfileData } from '../platform/profileData';
import { useSimStore, type SimUiState } from './store';

/**
 * The profile, from disk to the store and back (SPEC2 M24).
 *
 * The sibling of `settings.ts`, and deliberately the same shape: a `load` that
 * runs once at boot and a single writer. What differs is WHO decides to write.
 * A setting is written by the function that changes it, because a settings
 * screen has one door; the profile is moved by three unrelated things - a
 * campaign stage won, a scenario finished, an achievement earned - and every
 * one of them lives in a different component. So this file SUBSCRIBES to the
 * three fields instead: one writer, no call site that can forget it, and a
 * booking made from a place nobody has thought of yet is still persisted.
 *
 * Three rules the boot path keeps, and all three are about the first sentence
 * of SPEC2 M24's own acceptance clause - progress must survive a restart -
 * without ever being able to prevent one:
 *
 *  - reading happens BEFORE the subscription, so a hydration cannot write the
 *    file back over itself;
 *  - a profile that could not be read leaves an empty one, and the game starts;
 *  - a profile from a newer build is shown and never written (see `Profile.ts`),
 *    which this file surfaces as a flag the panel can say out loud rather than
 *    as a silent refusal.
 */

/** What the last boot read, for the achievements panel to be honest about. */
let lastStatus: ProfileStatus = ProfileStatus.Fresh;

/** The status the profile was read with at boot. */
export function profileStatus(): ProfileStatus {
  return lastStatus;
}

/** The three store fields that ARE the profile, as the file wants them. */
export function profileOf(state: SimUiState): ProfileData {
  return {
    version: PROFILE_VERSION,
    campaign: { ...state.campaignCompleted },
    scenarios: { ...state.scenarioMedals },
    achievements: { ...state.achievements },
  };
}

/** True once the boot path has armed the writer; a second call is a no-op. */
let subscribed = false;

/**
 * Read the profile at boot, put it in the store, and arm the writer.
 *
 * Awaited by nothing that draws: a player whose profile is slow to read sees
 * the game, and the medals arrive a frame later.
 */
export async function loadProfile(): Promise<void> {
  const read = await readProfile();
  lastStatus = read.status;
  useSimStore.getState().adoptProfile(read.profile);
  armProfileWriter();
}

/**
 * Write the profile whenever one of its three fields moves.
 *
 * The comparison is by IDENTITY, which is why the store's own actions return
 * the identical object when they change nothing (`unlockAchievements` is asked
 * on every news delta): a subscription that compared contents would rewrite the
 * file several times a game day for a file that changes a handful of times a
 * session.
 */
export function armProfileWriter(): void {
  if (subscribed) return;
  subscribed = true;
  useSimStore.subscribe((state, previous) => {
    if (
      state.campaignCompleted === previous.campaignCompleted &&
      state.scenarioMedals === previous.scenarioMedals &&
      state.achievements === previous.achievements
    ) {
      return;
    }
    void writeProfile(profileOf(state));
  });
}

/** Whether this build has decided not to write the profile back at all. */
export function profileFrozen(): boolean {
  return profileIsFrozen();
}
