import { describe, expect, it } from 'vitest';
import { Difficulty, MapClimate, WeatherRule } from '../../src/sim/constants';
import { GoalKind } from '../../src/sim/goals/types';
import { replayGenesis } from '../../src/sim/save/replay';
import type { NewGameParams } from '../../src/sim/types';
import { hashWorld, World } from '../../src/sim/World';

/**
 * `replayGenesis` carries EVERY world rule, and this file is the audit that
 * makes the next omission a red build.
 *
 * The function rebuilds the world a recording started from when the recording
 * has no genesis checkpoint. Every rule it forgets is a rule the reconstruction
 * quietly turns OFF - so a recording made in a world with that rule on
 * re-simulates under different physics and reports a desync that is the
 * rebuild's own. It has now happened three times: `weather` (found in M20 B3),
 * `elections` (added beside it), and `editorMode` (found by an independent
 * verifier after M22 closed, genesis hash 2ada8be4d4abf346 -> 1b67eea3e4c24e07,
 * which broke M22's own Fertig-wenn for exactly the maps the milestone exists
 * to make: a workshop world replayed as a game, so funds and ownership came
 * back and refused commands the author's world had accepted).
 *
 * Two halves, and the first is the one that cannot be forgotten:
 *
 *  - a COMPILE error. `GENESIS_RULES` is typed
 *    `Record<keyof Required<NewGameParams>, ...>`, so a new field does not
 *    build until somebody says how the reconstruction carries it.
 *  - a MEASUREMENT. Each entry sets its field to a value the default is not,
 *    and the rebuilt world has to read back the same value AND reach the same
 *    `hashWorld`. A rule that is hashed - which every rule is, by Z2 - cannot
 *    be dropped without the hash saying so.
 */

const SIZE = 64;

/** The world every probe starts from: every rule at its default. */
function baseParams(): NewGameParams {
  return {
    seed: 4_711,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: SIZE,
    companyName: 'Grundwelt AG',
    companyColorIndex: 0,
  };
}

/** One rule, the value that is not its default, and how to read it back off a world. */
interface RuleProbe {
  readonly value: Partial<NewGameParams>;
  readonly read: (world: World) => unknown;
}

/**
 * Every field of `NewGameParams`, with the probe that proves the
 * reconstruction carries it.
 *
 * There are no excuses in this table and there is deliberately no room for
 * one: `companyName` and `companyColorIndex` are not saved separately and are
 * read off the world as it stands (which `replayGenesis` documents as an
 * affordance rather than evidence), but they are still CARRIED, and a version
 * of the function that dropped them would be wrong in the same way as one that
 * drops a rule.
 */
const GENESIS_RULES: Record<keyof Required<NewGameParams>, RuleProbe> = {
  seed: { value: { seed: 90_210 }, read: (world) => world.seed },
  difficulty: {
    value: { difficulty: Difficulty.Hard },
    read: (world) => world.difficulty,
  },
  climate: { value: { climate: MapClimate.Tropical }, read: (world) => world.climate },
  startYear: { value: { startYear: 1880 }, read: (world) => world.startYear },
  endless: { value: { endless: true }, read: (world) => world.endless },
  mapSize: { value: { mapSize: 128 }, read: (world) => world.map.size },
  companyName: {
    value: { companyName: 'Werkstatt AG' },
    read: (world) => world.companies[0]!.name,
  },
  companyColorIndex: {
    value: { companyColorIndex: 3 },
    read: (world) => world.companies[0]!.colorIndex,
  },
  // Two of the rules default to ON rather than off (D-092), so their probe is
  // the flag turned DOWN - the value the default is not, whichever way round
  // that happens to be.
  inflation: { value: { inflation: false }, read: (world) => world.inflation },
  aiCompanies: { value: { aiCompanies: 2 }, read: (world) => world.ai.length },
  emissions: { value: { emissions: false }, read: (world) => world.emissions },
  occupancyPenalty: {
    value: { occupancyPenalty: true },
    read: (world) => world.occupancyPenalty,
  },
  signalPenalty: { value: { signalPenalty: true }, read: (world) => world.signalPenalty },
  roadCongestion: { value: { roadCongestion: true }, read: (world) => world.roadCongestion },
  weather: { value: { weather: WeatherRule.Harsh }, read: (world) => world.weather },
  elections: { value: { elections: true }, read: (world) => world.elections },
  economy: { value: { economy: true }, read: (world) => world.economy },
  editorMode: { value: { editorMode: true }, read: (world) => world.editorMode },
  goals: {
    value: {
      goals: [
        {
          kind: GoalKind.CompanyValueBy,
          subjectA: -1,
          subjectB: -1,
          threshold: 5_000_000,
          goldTick: 360_000,
          silverTick: 504_000,
          bronzeTick: 720_000,
        },
      ],
    },
    read: (world) => world.goals.count,
  },
};

describe('coupling: replayGenesis carries every world rule', () => {
  for (const [field, probe] of Object.entries(GENESIS_RULES)) {
    it(`carries "${field}" through the reconstruction`, () => {
      const params = { ...baseParams(), ...probe.value };
      const world = World.create(params);
      const plain = World.create(baseParams());

      // The probe has to be a probe: a value the default already has would
      // make this test pass for a function that carries nothing at all.
      expect(probe.read(world), `the probe for "${field}" changes nothing`).not.toEqual(
        probe.read(plain),
      );

      const rebuilt = replayGenesis(world);
      expect(probe.read(rebuilt), `"${field}" is dropped by replayGenesis`).toEqual(
        probe.read(world),
      );
      expect(hashWorld(rebuilt), `"${field}" moves the genesis hash`).toBe(hashWorld(world));
    });
  }

  it('reproduces a world with every rule set at once', () => {
    // The rules interact - the century curve draws from the seed, the goals are
    // hashed state, the AI roster is built at genesis - so carrying each one
    // alone is not the same claim as carrying all of them together.
    let params = baseParams();
    for (const probe of Object.values(GENESIS_RULES)) params = { ...params, ...probe.value };

    const world = World.create(params);
    const rebuilt = replayGenesis(world);
    expect(hashWorld(rebuilt)).toBe(hashWorld(world));
    for (const [field, probe] of Object.entries(GENESIS_RULES)) {
      expect(probe.read(rebuilt), field).toEqual(probe.read(world));
    }
  });
});
