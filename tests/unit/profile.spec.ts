import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  profileIsFrozen,
  readProfile,
  resetProfileFreeze,
  writeProfile,
} from '../../src/platform/Profile';
import {
  EMPTY_PROFILE,
  PROFILE_MIGRATIONS,
  PROFILE_VERSION,
  ProfileStatus,
  readProfileData,
  type ProfileData,
} from '../../src/platform/profileData';
import { GoalMedal } from '../../src/sim/goals/types';
import { loadProfile, profileOf } from '../../src/ui/profile';
import { useSimStore } from '../../src/ui/store';

/**
 * `profile.json` v1 (SPEC2 M24): the player's own file, versioned, with its own
 * migration chain, on the main thread through `src/platform`, and OUTSIDE the
 * save and the hash.
 *
 * Two properties are worth more than everything else here and both are asserted
 * end to end rather than argued:
 *
 *  1. **a corrupt profile never blocks the start.** Every shape a file can be
 *     that is not a profile - a syntax error, a number, an array, null, a
 *     profile whose blocks are rubbish - reads as something the game can use;
 *  2. **a profile from a FUTURE build is read and never written back.** This
 *     build takes what it recognises and freezes the file, because overwriting
 *     it would throw away whatever the newer build had put there.
 *
 * The third property is the constitutional one: nothing under `src/sim` may
 * know this file exists. A simulation that read a player's medals would produce
 * a different world for a different player from the same seed.
 */

const SIM_DIR = fileURLToPath(new URL('../../src/sim/', import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}${name}`;
    if (statSync(path).isDirectory()) out.push(...sourceFiles(`${path}/`));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

// ---------------------------------------------------------- the pure reader

describe('reading a profile', () => {
  it('has exactly one migration per version below the current one', () => {
    // The chain is the mechanism, not a comment about a future one: version 1
    // is reachable from version 0 (an unversioned file), and every version this
    // build can meet has a step out of it.
    expect(PROFILE_MIGRATIONS.length).toBe(PROFILE_VERSION);
    for (let from = 0; from < PROFILE_VERSION; from++) {
      expect(typeof PROFILE_MIGRATIONS[from], `no migration from v${from}`).toBe('function');
    }
  });

  it('reads nothing at all as a new player', () => {
    const read = readProfileData(undefined);
    expect(read.status).toBe(ProfileStatus.Fresh);
    expect(read.profile).toEqual(EMPTY_PROFILE);
  });

  it('reads anything that is not a profile as an empty one', () => {
    for (const raw of ['nonsense', 42, true, [1, 2, 3], []]) {
      const read = readProfileData(raw);
      expect(read.status, JSON.stringify(raw)).toBe(ProfileStatus.Recovered);
      expect(read.profile, JSON.stringify(raw)).toEqual(EMPTY_PROFILE);
    }
    // `null` is what an empty file parses to, and an empty file is a player
    // with nothing rather than a damaged one.
    expect(readProfileData(null).status).toBe(ProfileStatus.Fresh);
  });

  it('brings an unversioned file forward through the chain', () => {
    const read = readProfileData({
      campaign: { 'eisenadern-01': GoalMedal.Gold },
      achievements: { 'first-year': 1953 },
    });

    expect(read.status).toBe(ProfileStatus.Migrated);
    expect(read.profile.version).toBe(PROFILE_VERSION);
    expect(read.profile.campaign['eisenadern-01']).toBe(GoalMedal.Gold);
    expect(read.profile.achievements['first-year']).toBe(1953);
    expect(read.profile.scenarios).toEqual({});
  });

  it('reads its own output back unchanged', () => {
    const once = readProfileData({
      version: PROFILE_VERSION,
      campaign: { 'eisenadern-04': GoalMedal.Silver },
      scenarios: { busline: GoalMedal.Bronze },
      achievements: { storm: 1971 },
    });
    expect(once.status).toBe(ProfileStatus.Current);

    const twice = readProfileData(JSON.parse(JSON.stringify(once.profile)));
    expect(twice.status).toBe(ProfileStatus.Current);
    expect(twice.profile).toEqual(once.profile);
  });

  it('keeps what a FUTURE profile says and refuses nothing about it', () => {
    // A newer build's file: the version is beyond this one, and the blocks it
    // shares with v1 are still readable. Reading them is what lets a player who
    // ran a newer build see their own progress here.
    const read = readProfileData({
      version: PROFILE_VERSION + 7,
      campaign: { 'eisenadern-09': GoalMedal.Gold },
      scenarios: {},
      achievements: { 'gold-goal': 1988 },
      somethingNewer: { whatever: true },
    });

    expect(read.status).toBe(ProfileStatus.Future);
    expect(read.profile.campaign['eisenadern-09']).toBe(GoalMedal.Gold);
    expect(read.profile.achievements['gold-goal']).toBe(1988);
  });

  it('defaults one rotten block without losing the others', () => {
    const read = readProfileData({
      version: PROFILE_VERSION,
      campaign: { 'eisenadern-02': GoalMedal.Bronze },
      scenarios: 'this used to be an object',
      achievements: [1, 2, 3],
    });

    expect(read.profile.campaign['eisenadern-02']).toBe(GoalMedal.Bronze);
    expect(read.profile.scenarios).toEqual({});
    expect(read.profile.achievements).toEqual({});
  });

  it('drops a medal that was never a medal rather than guessing at it', () => {
    // `normaliseSettings`' own posture on a volume of two: out of range is
    // rejected, because guessing what a 7 meant is worse than forgetting it.
    const read = readProfileData({
      version: PROFILE_VERSION,
      campaign: { good: GoalMedal.Silver, high: 7, low: -1, text: 'gold', fraction: 1.5 },
    });
    expect(Object.keys(read.profile.campaign)).toEqual(['good']);
  });
});

// ------------------------------------------------------ the file, end to end

/** A `localStorage` that lives in this test and nowhere else. */
function fakeWindow(): { store: Map<string, string> } {
  const store = new Map<string, string>();
  const shim = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  (globalThis as unknown as { window?: unknown }).window = shim;
  return { store };
}

const KEY = 'ironveins.profile';

describe('the profile as a file', () => {
  beforeEach(() => {
    resetProfileFreeze();
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    resetProfileFreeze();
  });

  it('writes what it read and reads what it wrote', async () => {
    const { store } = fakeWindow();

    expect((await readProfile()).status).toBe(ProfileStatus.Fresh);
    expect(
      await writeProfile({
        version: PROFILE_VERSION,
        campaign: { 'eisenadern-01': GoalMedal.Gold },
        scenarios: { busline: GoalMedal.Silver },
        achievements: { 'first-year': 1951 },
      }),
    ).toBe(true);

    expect(store.has(KEY)).toBe(true);
    const read = await readProfile();
    expect(read.status).toBe(ProfileStatus.Current);
    expect(read.profile.campaign['eisenadern-01']).toBe(GoalMedal.Gold);
    expect(read.profile.scenarios['busline']).toBe(GoalMedal.Silver);
    expect(read.profile.achievements['first-year']).toBe(1951);
  });

  it('starts the game on a file that is not JSON at all', async () => {
    const { store } = fakeWindow();
    store.set(KEY, '{"campaign": {oh dear');

    const read = await readProfile();
    expect(read.status).toBe(ProfileStatus.Recovered);
    expect(read.profile).toEqual(EMPTY_PROFILE);
    // And a recovered profile is writable: the player carries on from nothing
    // rather than being locked out of ever keeping anything again.
    expect(profileIsFrozen()).toBe(false);
    expect(await writeProfile(EMPTY_PROFILE)).toBe(true);
  });

  it('starts the game with no storage of any kind', async () => {
    // Neither a Tauri runtime nor a `window`: the read throws inside and is
    // answered with an empty profile instead of an exception at boot.
    delete (globalThis as unknown as { window?: unknown }).window;
    const read = await readProfile();
    expect(read.status).toBe(ProfileStatus.Recovered);
    expect(read.profile).toEqual(EMPTY_PROFILE);
    expect(await writeProfile(EMPTY_PROFILE)).toBe(false);
  });

  it('reads a future profile and then refuses to overwrite it', async () => {
    const { store } = fakeWindow();
    const newer = JSON.stringify({
      version: PROFILE_VERSION + 1,
      campaign: { 'eisenadern-12': GoalMedal.Gold },
      scenarios: {},
      achievements: {},
      chronicle: ['a block this build has never heard of'],
    });
    store.set(KEY, newer);

    const read = await readProfile();
    expect(read.status).toBe(ProfileStatus.Future);
    expect(read.profile.campaign['eisenadern-12']).toBe(GoalMedal.Gold);
    expect(profileIsFrozen()).toBe(true);

    expect(await writeProfile({ ...EMPTY_PROFILE })).toBe(false);
    // Byte for byte what the newer build left, including the block this build
    // cannot read: nothing was lost by running an older game once.
    expect(store.get(KEY)).toBe(newer);
  });
});

// ------------------------------------------------- store, boot and writer

describe('the profile and the store', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    resetProfileFreeze();
    useSimStore.setState({ campaignCompleted: {}, scenarioMedals: {}, achievements: {} });
  });

  it('hydrates the three fields at boot and writes them back when they move', async () => {
    const { store } = fakeWindow();
    store.set(
      KEY,
      JSON.stringify({
        version: PROFILE_VERSION,
        campaign: { 'eisenadern-01': GoalMedal.Silver },
        scenarios: {},
        achievements: { 'first-year': 1951 },
      }),
    );

    await loadProfile();
    expect(useSimStore.getState().campaignCompleted['eisenadern-01']).toBe(GoalMedal.Silver);
    expect(useSimStore.getState().achievements['first-year']).toBe(1951);

    // A booking from anywhere at all reaches the file: the writer subscribes
    // to the fields rather than sitting at a call site somebody can forget.
    useSimStore.getState().recordScenarioMedal('busline', GoalMedal.Gold);
    useSimStore.getState().unlockAchievements(['storm'], 1966);
    await Promise.resolve();

    const written = JSON.parse(store.get(KEY)!) as ProfileData;
    expect(written.version).toBe(PROFILE_VERSION);
    expect(written.scenarios['busline']).toBe(GoalMedal.Gold);
    expect(written.achievements['storm']).toBe(1966);
    expect(written.campaign['eisenadern-01']).toBe(GoalMedal.Silver);
  });

  it('keeps the year an achievement was FIRST earned in, and re-earns nothing', () => {
    const store = useSimStore.getState();
    store.unlockAchievements(['storm'], 1966);
    const first = useSimStore.getState().achievements;
    store.unlockAchievements(['storm'], 1999);
    // The identical object, which is what lets the writer subscribe to it
    // without writing the file on every news delta.
    expect(useSimStore.getState().achievements).toBe(first);
    expect(useSimStore.getState().achievements['storm']).toBe(1966);
  });

  it('maps exactly the three store fields into the file', () => {
    useSimStore.setState({
      campaignCompleted: { a: 1 },
      scenarioMedals: { b: 2 },
      achievements: { c: 1950 },
    });
    expect(profileOf(useSimStore.getState())).toEqual({
      version: PROFILE_VERSION,
      campaign: { a: 1 },
      scenarios: { b: 2 },
      achievements: { c: 1950 },
    });
  });

  it('survives a world reset, because progress is not a world', () => {
    useSimStore.getState().unlockAchievements(['storm'], 1966);
    useSimStore.getState().recordScenarioMedal('busline', GoalMedal.Bronze);
    useSimStore.getState().resetWorld();
    expect(useSimStore.getState().achievements['storm']).toBe(1966);
    expect(useSimStore.getState().scenarioMedals['busline']).toBe(GoalMedal.Bronze);
  });
});

// ------------------------------------------------------- the constitution

describe('the profile is outside the simulation', () => {
  it('is never mentioned under src/sim', () => {
    // The whole point of a profile living on the main thread: a world is a
    // function of its seed and its commands, never of who is playing it.
    const offenders: string[] = [];
    for (const file of sourceFiles(SIM_DIR)) {
      const text = readFileSync(file, 'utf8');
      if (/profile\.json|ProfileData|readProfileData/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('is not part of the save format either', () => {
    // `SAVE_VERSION` never hears about it (SPEC2 M24's ledger row): the file is
    // its own format with its own version, and the two chains never meet.
    const save = readFileSync(
      fileURLToPath(new URL('../../src/sim/save/format.ts', import.meta.url)),
      'utf8',
    );
    expect(save).not.toContain('profile');
  });
});
