import {
  EMPTY_PROFILE,
  ProfileStatus,
  readProfileData,
  type ProfileData,
  type ProfileRead,
} from './profileData';

/**
 * Where `profile.json` lives, and the two rules about writing it (SPEC2 M24).
 *
 * The sibling of `Storage.ts`, built the same way and for the same reason: this
 * file and `Platform.ts` are the only places allowed to import `@tauri-apps/*`,
 * so everything above asks for "the profile" and never learns whether that is
 * `%APPDATA%/IronVeins/profile.json` or a key in `localStorage`.
 *
 * It is deliberately NOT a slot on the save shelf. A save is a world and is
 * listed, thumbnailed, rotated and exported; a profile is one small file that
 * belongs to the installation, is never chosen from a list, and must not be
 * something a player can load the wrong version of.
 *
 * **Reading it can never throw.** A profile that cannot be read costs the
 * player their medals; it must never cost them the game, so there is no rethrow
 * anywhere in this file - the same posture `readSettings` has had since M9, and
 * for the harder case: a settings file is written every time a checkbox moves,
 * a profile is written once a campaign stage.
 */

const PROFILE_FILE = 'profile.json';
const PROFILE_KEY = 'ironveins.profile';

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * True once a profile from a NEWER build has been read.
 *
 * Module state rather than a parameter on {@link writeProfile}, because every
 * caller of that function would otherwise have to remember to pass it and
 * exactly one forgetting it destroys the file. It is set by
 * {@link readProfile}, which every door goes through at boot.
 */
let frozen = false;

/** Whether this build has decided not to write the profile back. */
export function profileIsFrozen(): boolean {
  return frozen;
}

/** Only for tests: forget what the last read decided. */
export function resetProfileFreeze(): void {
  frozen = false;
}

/** Read the profile, or an empty one when there is nothing readable to read. */
export async function readProfile(): Promise<ProfileRead> {
  const result = await readRaw();
  frozen = result.status === ProfileStatus.Future;
  return result;
}

async function readRaw(): Promise<ProfileRead> {
  try {
    if (hasTauriRuntime()) {
      const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(PROFILE_FILE, { baseDir: BaseDirectory.AppData }))) {
        return readProfileData(undefined);
      }
      const text = await readTextFile(PROFILE_FILE, { baseDir: BaseDirectory.AppData });
      return readProfileData(JSON.parse(text));
    }
    const text = window.localStorage.getItem(PROFILE_KEY);
    return readProfileData(text === null ? undefined : JSON.parse(text));
  } catch {
    // Unparseable, unreadable, or no storage at all. All three are the same
    // answer: this player has nothing remembered, and the game starts.
    return { profile: EMPTY_PROFILE, status: ProfileStatus.Recovered };
  }
}

/**
 * Write the profile back, unless a newer build wrote it first.
 *
 * Returns whether anything was written, so a caller that cares can say so - and
 * so the refusal is a value rather than a silence somebody has to guess at.
 */
export async function writeProfile(profile: ProfileData): Promise<boolean> {
  if (frozen) return false;

  const text = JSON.stringify(profile);
  try {
    if (hasTauriRuntime()) {
      const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(PROFILE_FILE, text, { baseDir: BaseDirectory.AppData });
      return true;
    }
    window.localStorage.setItem(PROFILE_KEY, text);
    return true;
  } catch {
    return false;
  }
}
