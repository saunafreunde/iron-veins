import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { Difficulty, LOAN_STEP_CT, MapClimate } from '../../src/sim/constants';
import { GoalKind, type GoalSpec } from '../../src/sim/goals/types';
import { CheckpointRing } from '../../src/sim/save/checkpoints';
import { SaveFormatError, SAVE_VERSION, SCENARIO_EXTENSION } from '../../src/sim/save/format';
import { encodeReplay } from '../../src/sim/save/replay';
import { encodeScenario, verifyScenarioReference } from '../../src/sim/save/scenario';
import {
  isRuleLocked,
  SCENARIO_LOCKABLE_RULES,
  type ScenarioMeta,
} from '../../src/sim/save/scenarioMeta';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

/**
 * The `.ironscenario` format of SPEC2 M17 (DECISIONS.md D-194).
 *
 * A scenario is the save container with one UNHASHED metadata block, written
 * and read by the ONE serializer - "Szenario-Kompatibilitaet IST
 * Save-Kompatibilitaet". This file holds the four properties the format has to
 * have: it round-trips, its metadata cannot move the world hash, the rules it
 * pins survive being played and saved, and the reference hash it may name is
 * checked by M16's verifier rather than believed.
 *
 * The boundary itself - metadata may never enter `hashWorld` (Fehlerkatalog 35)
 * - has its own audit with a meta-test in `scenarioCoupling.spec.ts`.
 */

const GAME_VERSION = '0.1.0';
const MAP_SIZE = 128;
const SEED = 771_100;

/** Two goals, so the caption count is a real cross-check rather than 0 = 0. */
const GOALS: readonly GoalSpec[] = [
  {
    kind: GoalKind.CompanyValueBy,
    subjectA: -1,
    subjectB: -1,
    threshold: 200_000_000,
    goldTick: 720_000,
    silverTick: 1_296_000,
    bronzeTick: 1_800_000,
  },
  {
    kind: GoalKind.SurviveUntil,
    subjectA: -1,
    subjectB: -1,
    threshold: 1_800_000,
    goldTick: 1_800_000,
    silverTick: 1_800_000,
    bronzeTick: 1_800_000,
  },
];

function meta(overrides: Partial<ScenarioMeta> = {}): ScenarioMeta {
  return {
    title: 'Frachtrausch',
    author: 'Iron Veins',
    briefing: {
      de: 'Bringen Sie die Kohle zum Kraftwerk, bevor das Jahrhundert Sie einholt.',
      en: 'Get the coal to the power station before the century catches up with you.',
    },
    goals: [
      { de: 'Firmenwert 2 Mio. EUR', en: 'Company value of EUR 2m' },
      { de: 'Bis 1975 zahlungsfaehig bleiben', en: 'Stay solvent until 1975' },
    ],
    lockedRules: ['goals', 'inflation'],
    fromTick: 0,
    toTick: 1_800_000,
    referenceFinalHash: '',
    ...overrides,
  };
}

interface Game {
  readonly world: World;
  readonly queue: CommandQueue;
  readonly ring: CheckpointRing;
}

/** A world with goals and two rules on, played for `ticks` with a ring kept. */
function play(ticks: number): Game {
  const world = World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Szenariobahn',
    companyColorIndex: 3,
    inflation: true,
    emissions: true,
    goals: GOALS,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 2 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Szenariobahn AG' }, 500);
  queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, 1_500);

  const ring = new CheckpointRing();
  ring.record(world, queue);
  for (let i = 0; i < ticks; i++) world.step(queue, null);
  return { world, queue, ring };
}

/** The bytes of a scenario carrying the recording of the game it describes. */
function recordedScenario(game: Game, block: ScenarioMeta): Uint8Array {
  const recording = decodeSave(encodeReplay(game.world, game.queue, game.ring, GAME_VERSION));
  return encodeScenario(
    recording.world,
    recording.queue,
    GAME_VERSION,
    block,
    recording.ring,
    recording.replay,
  );
}

/** Decode, change one thing deep in the container, re-encode. */
function tampered(bytes: Uint8Array, edit: (payload: Record<string, unknown>) => void): Uint8Array {
  const payload = decode(unzlibSync(bytes)) as Record<string, unknown>;
  edit(payload);
  return zlibSync(encode(payload), { level: 6 });
}

// ------------------------------------------------------------- the round trip

describe('the .ironscenario container', () => {
  it('is a file extension of its own and a save format of the same number', () => {
    // The one place the two halves of "a superset, not a second format" can be
    // stated as one line: a different name on disk, the same version inside.
    expect(SCENARIO_EXTENSION).toBe('.ironscenario');
    // Whatever that number happens to be, the file a scenario writes carries
    // it - which is the claim, and it is read out of a real encoded scenario
    // rather than restated as the literal `save.spec.ts` already pins.
    const { world, queue } = play(200);
    const payload = decode(
      unzlibSync(encodeScenario(world, queue, GAME_VERSION, meta())),
    ) as Record<string, unknown>;
    expect(payload['saveVersion']).toBe(SAVE_VERSION);
  });

  it('round-trips a scenario through the one serializer', () => {
    const { world, queue } = play(600);
    const block = meta();
    const before = hashWorld(world);

    const loaded = decodeSave(encodeScenario(world, queue, GAME_VERSION, block));

    expect(loaded.scenario).toEqual(block);
    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.goals.count).toBe(GOALS.length);
    expect(loaded.queue.log).toHaveLength(queue.log.length);
  });

  it('carries no block for a plain save, and loads one that has none', () => {
    const { world, queue } = play(200);
    expect(decodeSave(encodeSave(world, queue, GAME_VERSION)).scenario).toBeNull();
  });

  it('keeps the briefing when the scenario is played on and saved again', () => {
    const { world, queue, ring } = play(400);
    const block = meta();
    const loaded = decodeSave(encodeScenario(world, queue, GAME_VERSION, block));

    for (let i = 0; i < 400; i++) loaded.world.step(loaded.queue, null);
    const again = decodeSave(
      encodeSave(loaded.world, loaded.queue, GAME_VERSION, ring, null, loaded.scenario),
    );

    expect(again.scenario).toEqual(block);
    expect(again.world.tick).toBe(800);
  });

  it('refuses a briefing that does not name every goal', () => {
    const { world, queue } = play(100);
    expect(() =>
      encodeScenario(world, queue, GAME_VERSION, meta({ goals: [{ de: 'Eins', en: 'One' }] })),
    ).toThrowError(SaveFormatError);

    // ... and the parser says the same thing about a file somebody else wrote.
    const bytes = encodeScenario(world, queue, GAME_VERSION, meta());
    expect(() =>
      decodeSave(
        tampered(bytes, (payload) => {
          (payload['scenario'] as Record<string, unknown>)['goals'] = [{ de: 'Eins', en: 'One' }];
        }),
      ),
    ).toThrowError(/captions for 2 goals/);
  });

  it('refuses metadata that is not metadata', () => {
    const { world, queue } = play(100);
    const bytes = encodeScenario(world, queue, GAME_VERSION, meta());
    const refuse = (edit: (block: Record<string, unknown>) => void, pattern: RegExp): void => {
      expect(() =>
        decodeSave(
          tampered(bytes, (payload) => edit(payload['scenario'] as Record<string, unknown>)),
        ),
      ).toThrowError(pattern);
    };

    refuse((block) => (block['title'] = ''), /non-empty/);
    refuse((block) => (block['briefing'] = { de: 'x' }), /briefing\.en/);
    refuse((block) => (block['lockedRules'] = ['dayNight']), /not a world rule/);
    refuse((block) => (block['lockedRules'] = ['inflation', 'goals']), /does not follow/);
    refuse((block) => (block['lockedRules'] = ['goals', 'goals']), /does not follow/);
    refuse((block) => (block['toTick'] = -1), /does not run forwards/);
    refuse((block) => (block['referenceFinalHash'] = 'nonsense'), /not a 64 bit hex digest/);
    refuse((block) => Reflect.deleteProperty(block, 'author'), /author: expected a string/);
  });
});

// ------------------------------------------------------- metadata and the hash

describe('scenario metadata and the world hash', () => {
  it('does not move the world hash, however different the briefing is', () => {
    const { world, queue } = play(600);
    const plain = decodeSave(encodeScenario(world, queue, GAME_VERSION, meta()));
    const other = decodeSave(
      encodeScenario(
        world,
        queue,
        GAME_VERSION,
        meta({
          title: 'Ein voellig anderes Szenario',
          author: 'Jemand anderes',
          briefing: { de: 'Anderer Text.', en: 'Different text.' },
          goals: [
            { de: 'Anders 1', en: 'Different 1' },
            { de: 'Anders 2', en: 'Different 2' },
          ],
          lockedRules: ['climate', 'emissions', 'seed'],
          fromTick: 72_000,
          toTick: 900_000,
          referenceFinalHash: hashWorld(world),
        }),
      ),
    );

    expect(hashWorld(other.world)).toBe(hashWorld(plain.world));
    expect(hashWorld(plain.world)).toBe(hashWorld(world));
    // ... and the two files really do differ, so the equality above is a
    // statement about the digest rather than about two identical byte streams.
    expect(other.scenario).not.toEqual(plain.scenario);
  });

  it('runs on identically after a load, whatever the briefing says', () => {
    const { world, queue } = play(400);
    const a = decodeSave(encodeScenario(world, queue, GAME_VERSION, meta()));
    const b = decodeSave(
      encodeScenario(world, queue, GAME_VERSION, meta({ title: 'Zweitname', author: 'X' })),
    );

    for (let i = 0; i < 500; i++) {
      a.world.step(a.queue, null);
      b.world.step(b.queue, null);
    }
    expect(hashWorld(b.world)).toBe(hashWorld(a.world));
  });
});

// ------------------------------------------------------------- locked rules

describe("a scenario's locked rules", () => {
  it('survive a save and a load, values and lock list alike', () => {
    const { world, queue, ring } = play(300);
    const block = meta({ lockedRules: ['emissions', 'goals', 'inflation'] });

    const loaded = decodeSave(encodeScenario(world, queue, GAME_VERSION, block));
    expect(loaded.scenario?.lockedRules).toEqual(['emissions', 'goals', 'inflation']);
    // The lock names the rules; the RULES themselves are hashed world state and
    // are what the loaded world actually runs on.
    expect(loaded.world.inflation).toBe(true);
    expect(loaded.world.emissions).toBe(true);
    expect(loaded.world.goals.count).toBe(GOALS.length);

    // Played on and put away again - the save a player makes INSIDE a scenario.
    for (let i = 0; i < 200; i++) loaded.world.step(loaded.queue, null);
    const again = decodeSave(
      encodeSave(loaded.world, loaded.queue, GAME_VERSION, ring, null, loaded.scenario),
    );
    expect(again.scenario?.lockedRules).toEqual(['emissions', 'goals', 'inflation']);
    expect(again.world.inflation).toBe(true);
    expect(again.world.emissions).toBe(true);
  });

  it('answer whether a given rule is pinned', () => {
    const block = meta({ lockedRules: ['goals', 'inflation'] });
    expect(isRuleLocked(block, 'inflation')).toBe(true);
    expect(isRuleLocked(block, 'goals')).toBe(true);
    expect(isRuleLocked(block, 'difficulty')).toBe(false);
    expect(isRuleLocked(meta({ lockedRules: [] }), 'inflation')).toBe(false);
  });

  it('accept every rule the table names, in the order the table states them', () => {
    const { world, queue } = play(100);
    const loaded = decodeSave(
      encodeScenario(world, queue, GAME_VERSION, meta({ lockedRules: SCENARIO_LOCKABLE_RULES })),
    );
    expect(loaded.scenario?.lockedRules).toEqual([...SCENARIO_LOCKABLE_RULES]);
  });
});

// ------------------------------------------------- the reference final hash

describe("a scenario's reference final hash", () => {
  it('verifies through M16 when the scenario ships the recording', () => {
    const game = play(3_000);
    const reference = hashWorld(game.world);
    const loaded = decodeSave(recordedScenario(game, meta({ referenceFinalHash: reference })));

    const check = verifyScenarioReference(loaded, GAME_VERSION);
    expect(check.verdict.kind).toBe('checked');
    expect(check.ok).toBe(true);
    if (check.verdict.kind === 'checked') {
      expect(check.verdict.verification.verdict.kind).toBe('verified');
      expect(check.verdict.verification.checkedTicks).toContain(game.world.tick);
    }
    expect(check.reasonKey).toBe('ui.replay.verify.ok');
  });

  it('is re-simulated rather than believed: a tampered log fails it', () => {
    const game = play(3_000);
    const reference = hashWorld(game.world);
    // The claim still says `reference`, and the metadata still agrees with the
    // claim - only what the recording DID was changed. Nothing but a real
    // re-simulation can see that, which is the whole reason the reference hash
    // goes through M16's verifier instead of a string comparison.
    const bytes = tampered(
      recordedScenario(game, meta({ referenceFinalHash: reference })),
      (payload) => {
        const log = payload['commandLog'] as Record<string, unknown>[];
        const entry = log[0]!['command'] as Record<string, unknown>;
        // A whole loan step more, because `takeLoan` rounds down to one - a
        // tamper the simulation absorbs is not a tamper.
        entry['amountCt'] = (entry['amountCt'] as number) + LOAN_STEP_CT;
      },
    );

    const check = verifyScenarioReference(decodeSave(bytes), GAME_VERSION);
    expect(check.verdict.kind).toBe('checked');
    expect(check.ok).toBe(false);
    if (check.verdict.kind === 'checked') {
      expect(check.verdict.verification.verdict.kind).not.toBe('verified');
    }
  });

  it('reports a metadata hash that disagrees with the recording, and runs nothing', () => {
    const game = play(1_000);
    const loaded = decodeSave(
      recordedScenario(game, meta({ referenceFinalHash: '0123456789abcdef' })),
    );

    const check = verifyScenarioReference(loaded, GAME_VERSION);
    expect(check.verdict.kind).toBe('claimMismatch');
    expect(check.ok).toBe(false);
    if (check.verdict.kind === 'claimMismatch') {
      expect(check.verdict.expected).toBe('0123456789abcdef');
      expect(check.verdict.claimed).toBe(hashWorld(game.world));
    }
    expect(check.reasonKey).toBe('ui.scenario.reference.mismatch');
  });

  it('reports a hash with no recording behind it', () => {
    const { world, queue } = play(300);
    const loaded = decodeSave(
      encodeScenario(world, queue, GAME_VERSION, meta({ referenceFinalHash: hashWorld(world) })),
    );

    const check = verifyScenarioReference(loaded, GAME_VERSION);
    expect(check.verdict.kind).toBe('noRecording');
    expect(check.ok).toBe(false);
    expect(check.reasonKey).toBe('ui.scenario.reference.noRecording');
  });

  it('reports a scenario that names no reference at all', () => {
    const { world, queue } = play(200);
    const loaded = decodeSave(encodeScenario(world, queue, GAME_VERSION, meta()));

    const check = verifyScenarioReference(loaded, GAME_VERSION);
    expect(check.verdict.kind).toBe('noReference');
    expect(check.ok).toBe(false);
    expect(check.reasonKey).toBe('ui.scenario.reference.none');
  });

  it('has a sentence in both catalogues for every answer it can give', () => {
    const keys = [
      'ui.scenario.reference.none',
      'ui.scenario.reference.noRecording',
      'ui.scenario.reference.mismatch',
    ] as const;
    for (const key of keys) {
      expect(de[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });
});
