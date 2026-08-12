import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { CommandQueue } from '../../src/sim/commands/queue';
import { Difficulty, MapClimate } from '../../src/sim/constants';
import { GoalKind } from '../../src/sim/goals/types';
import { parseSaveFile } from '../../src/sim/save/format';
import { encodeScenario } from '../../src/sim/save/scenario';
import { SCENARIO_LOCKABLE_RULES, type ScenarioMeta } from '../../src/sim/save/scenarioMeta';
import { decodeSave } from '../../src/sim/save/serialize';
import type { NewGameParams } from '../../src/sim/types';
import { hashWorld, World } from '../../src/sim/World';
import { decode } from '@msgpack/msgpack';
import { unzlibSync } from 'fflate';

/**
 * The metadata coupling test of SPEC2 M17 (Fehlerkatalog 35, DECISIONS.md
 * D-194), in the self-auditing style of `commandCoupling.spec.ts`: every audit
 * here is a pure function over its inputs, and every one of them is fed a
 * planted violation below to prove it fires. An audit that cannot fail is a
 * comment, not a test.
 *
 * Three boundaries, and they answer three different questions:
 *
 *  (a) BEHAVIOUR - can a change to the metadata move the world hash? The audit
 *      perturbs every leaf of a real encoded `.ironscenario` and compares. The
 *      meta-test hands it a hash function that has the briefing folded INTO it
 *      and requires the audit to report exactly that leaf, which is the literal
 *      sentence SPEC2 asks for: planting a briefing field into the hash turns
 *      the build red.
 *  (b) REACH - can the simulation even SEE the block? The audit walks
 *      `src/sim` and fails the day a file outside `src/sim/save/` names the
 *      metadata vocabulary. (a) proves the digest does not read it today; this
 *      proves nothing else does either, which is the stronger statement - a
 *      briefing that reached a pathfinder would desync without ever touching
 *      `hashWorld` (the D-176/D-186 pattern).
 *  (c) VOCABULARY - is every rule a scenario may pin actually a RULE? The audit
 *      holds `SCENARIO_LOCKABLE_RULES` against the real `NewGameParams`, the
 *      real saved world state and the real `AppSettings`, so D-110's split and
 *      Z2's "a world rule is saved, hashed, migrated" are checked rather than
 *      remembered.
 */

const GAME_VERSION = '0.1.0';
const SIM_DIR = fileURLToPath(new URL('../../src/sim/', import.meta.url));

// ------------------------------------------- (a) metadata never enters the hash

type PathSegment = string | number;

interface Leaf {
  readonly path: readonly PathSegment[];
  readonly normalized: string;
}

/** Load a payload and fingerprint the world it describes. */
type Probe = (payload: Record<string, unknown>) => string;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function collectLeaves(value: unknown, path: PathSegment[], normalized: string, out: Leaf[]): void {
  if (value === null || value === undefined) {
    throw new Error(`audit: ${normalized} is ${String(value)} - give the field a representative`);
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    out.push({ path: [...path], normalized });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`audit: ${normalized} is empty - a section with no representative is unseen`);
    }
    // The first element stands for all of them: one encoder, one decoder.
    path.push(0);
    collectLeaves(value[0], path, `${normalized}[]`, out);
    path.pop();
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort(byText)) {
    path.push(key);
    collectLeaves(record[key], path, normalized === '' ? key : `${normalized}.${key}`, out);
    path.pop();
  }
}

function containerAt(root: unknown, path: readonly PathSegment[]): unknown {
  let node: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    node =
      typeof segment === 'number'
        ? (node as unknown[])[segment]
        : (node as Record<string, unknown>)[segment];
  }
  return node;
}

function setAt(root: unknown, path: readonly PathSegment[], value: unknown): void {
  const container = containerAt(root, path);
  const last = path[path.length - 1]!;
  if (typeof last === 'number') (container as unknown[])[last] = value;
  else (container as Record<string, unknown>)[last] = value;
}

function valueAt(root: unknown, path: readonly PathSegment[]): unknown {
  const container = containerAt(root, path);
  const last = path[path.length - 1]!;
  return typeof last === 'number'
    ? (container as unknown[])[last]
    : (container as Record<string, unknown>)[last];
}

/**
 * Replacements for the leaves a blind perturbation could not reach.
 *
 * Both of these are fields the PARSER constrains, and appending an X to them
 * would only ever prove that the parser refuses nonsense - which is a different
 * test. What has to be probed here is a change the file is allowed to make: a
 * different valid rule (still ascending, so the list still parses) and a
 * different valid digest.
 */
const PERTURBATION: Readonly<Record<string, unknown>> = {
  'scenario.lockedRules[]': 'difficulty',
  'scenario.referenceFinalHash': '0123456789abcdef',
};

function perturbed(leaf: Leaf, value: unknown): unknown {
  const override = PERTURBATION[leaf.normalized];
  if (override !== undefined) return override;
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}X`;
  if (typeof value === 'boolean') return !value;
  throw new Error(`audit: no perturbation for ${leaf.normalized}`);
}

/**
 * Leaves of the metadata block whose change moves the world hash.
 *
 * A perturbation the parser REFUSES is not a finding: the file was rejected, so
 * no world was loaded and no hash was moved. That is the honest reading and it
 * is also the conservative one - it can only ever hide a violation behind a
 * refusal, never invent one, and the meta-test below perturbs a field the
 * parser happily accepts.
 */
function auditMetadataOutsideHash(
  payload: Record<string, unknown>,
  leaves: readonly Leaf[],
  hashOf: Probe,
): string[] {
  const base = hashOf(payload);
  const findings: string[] = [];
  for (const leaf of leaves) {
    const clone = structuredClone(payload);
    setAt(clone, leaf.path, perturbed(leaf, valueAt(clone, leaf.path)));
    let hash: string;
    try {
      hash = hashOf(clone);
    } catch {
      continue;
    }
    if (hash !== base) findings.push(leaf.normalized);
  }
  return findings;
}

/** The honest probe: parse the container, build the world, hash the world. */
const worldHashProbe: Probe = (payload) => hashWorld(World.fromData(parseSaveFile(payload).state));

/**
 * The defect, made real: a `hashWorld` that folded the briefing in.
 *
 * This is what Fehler 35 describes - somebody adds the scenario title and the
 * German briefing to the digest "so that a scenario is identified by what it
 * says" - and it is exactly what the audit has to catch.
 */
const leakyProbe: Probe = (payload) => {
  const file = parseSaveFile(payload);
  const block = file.scenario;
  return (
    hashWorld(World.fromData(file.state)) + (block === null ? '' : block.title + block.briefing.de)
  );
};

let payload: Record<string, unknown>;
let leaves: Leaf[];

beforeAll(() => {
  const world = World.create({
    seed: 515_151,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: 128,
    companyName: 'Pruefbahn',
    companyColorIndex: 1,
    inflation: true,
    goals: [
      {
        kind: GoalKind.TownPopulationReach,
        subjectA: -1,
        subjectB: -1,
        threshold: 4_000,
        goldTick: 720_000,
        silverTick: 1_296_000,
        bronzeTick: 1_800_000,
      },
    ],
  });
  const queue = new CommandQueue();
  for (let i = 0; i < 400; i++) world.step(queue, null);

  const block: ScenarioMeta = {
    title: 'Gebirgslogistik',
    author: 'Iron Veins',
    briefing: { de: 'Ueber den Pass, oder gar nicht.', en: 'Over the pass, or not at all.' },
    goals: [{ de: 'Eine Stadt auf 4000', en: 'One town to 4,000' }],
    // Two rules, so a perturbation of the first still has room to stay
    // ascending - the list is the one leaf whose shape the parser constrains.
    lockedRules: ['emissions', 'inflation'],
    fromTick: 0,
    toTick: 1_800_000,
    referenceFinalHash: hashWorld(world),
  };

  payload = decode(unzlibSync(encodeScenario(world, queue, GAME_VERSION, block))) as Record<
    string,
    unknown
  >;

  leaves = [];
  collectLeaves(payload['scenario'], ['scenario'], 'scenario', leaves);
});

describe('coupling: scenario metadata never enters the world hash', () => {
  it('walks every leaf of the block', () => {
    expect(leaves.map((leaf) => leaf.normalized).sort(byText)).toEqual([
      'scenario.author',
      'scenario.briefing.de',
      'scenario.briefing.en',
      'scenario.fromTick',
      'scenario.goals[].de',
      'scenario.goals[].en',
      'scenario.lockedRules[]',
      'scenario.referenceFinalHash',
      'scenario.title',
      'scenario.toTick',
    ]);
  });

  it('finds no metadata leaf that moves the world hash', () => {
    expect(auditMetadataOutsideHash(payload, leaves, worldHashProbe)).toEqual([]);
  });

  it('meta: turns red when a briefing field is planted into the hash', () => {
    const findings = auditMetadataOutsideHash(payload, leaves, leakyProbe).sort(byText);
    expect(findings).toEqual(['scenario.briefing.de', 'scenario.title']);
  });

  it('probes leaves the parser constrains rather than only the free ones', () => {
    // Without the two overrides above, the lock list and the reference hash
    // would be refused by the parser on every perturbation and would be
    // silently skipped - present in the walk, absent from the evidence.
    const constrained = leaves.filter((leaf) => PERTURBATION[leaf.normalized] !== undefined);
    expect(constrained).toHaveLength(2);
    for (const leaf of constrained) {
      const clone = structuredClone(payload);
      setAt(clone, leaf.path, perturbed(leaf, valueAt(clone, leaf.path)));
      expect(() => worldHashProbe(clone), leaf.normalized).not.toThrow();
    }
  });

  it('the block really does travel in the file it is hashed against', () => {
    // A leaf that never reached the container would pass the audit for the
    // wrong reason. The decoded scenario is the one the encoder wrote.
    const loaded = decodeSave(
      encodeScenario(
        World.fromData(parseSaveFile(payload).state),
        new CommandQueue(),
        GAME_VERSION,
        parseSaveFile(payload).scenario!,
      ),
    );
    expect(loaded.scenario?.title).toBe('Gebirgslogistik');
  });
});

// ------------------------------- (b) the simulation cannot reach the metadata

/**
 * Names that mean "this file reads the scenario metadata block".
 *
 * Not the bare word "scenario": the balancing scenarios and the determinism
 * scenarios have carried it since M6 and mean something else entirely. These
 * are the identifiers of the block itself.
 */
const METADATA_VOCABULARY: readonly string[] = [
  'ScenarioMeta',
  'scenarioMeta',
  'lockedRules',
  'referenceFinalHash',
  'isRuleLocked',
];

/** Where the block is allowed to be named, relative to `src/sim/`. */
const METADATA_HOME = 'save/';

function auditMetadataReach(sources: ReadonlyMap<string, string>): string[] {
  const findings: string[] = [];
  for (const name of [...sources.keys()].sort(byText)) {
    if (name.startsWith(METADATA_HOME)) continue;
    const source = sources.get(name)!;
    for (const word of METADATA_VOCABULARY) {
      if (source.includes(word)) {
        findings.push(`${name} names the scenario metadata (${word})`);
      }
    }
  }
  return findings;
}

function readSimSources(): Map<string, string> {
  const sources = new Map<string, string>();
  for (const entry of readdirSync(SIM_DIR, { recursive: true, encoding: 'utf-8' })) {
    const name = entry.split('\\').join('/');
    if (!name.endsWith('.ts')) continue;
    sources.set(name, readFileSync(join(SIM_DIR, entry), 'utf-8'));
  }
  return sources;
}

describe('coupling: the simulation cannot read the scenario metadata', () => {
  const sources = readSimSources();

  it('reads the real simulation sources', () => {
    expect(sources.size).toBeGreaterThan(50);
    expect(sources.has('World.ts')).toBe(true);
    expect(sources.has('save/scenarioMeta.ts')).toBe(true);
  });

  it('finds the vocabulary only under src/sim/save', () => {
    expect(auditMetadataReach(sources)).toEqual([]);
  });

  it('meta: flags a simulation file that reads the block', () => {
    const planted = new Map(sources);
    planted.set('cargo/router.ts', 'function cost(meta: ScenarioMeta) { return 1; }');
    expect(auditMetadataReach(planted)).toEqual([
      'cargo/router.ts names the scenario metadata (ScenarioMeta)',
    ]);
  });
});

// ------------------------------------------ (c) only world rules are lockable

/**
 * Every field of `NewGameParams`, typed complete.
 *
 * A new world rule is a COMPILE error right here until somebody decides whether
 * a scenario may pin it - which is the point: E-06's "two parallel concepts"
 * failure in miniature is a rule that exists on the new-game screen and cannot
 * be locked because nobody noticed it was added.
 */
const NEW_GAME_FIELDS: Record<keyof Required<NewGameParams>, true> = {
  seed: true,
  difficulty: true,
  climate: true,
  startYear: true,
  endless: true,
  mapSize: true,
  companyName: true,
  companyColorIndex: true,
  inflation: true,
  aiCompanies: true,
  emissions: true,
  occupancyPenalty: true,
  signalPenalty: true,
  roadCongestion: true,
  weather: true,
  elections: true,
  economy: true,
  editorMode: true,
  goals: true,
};

/** `NewGameParams` fields a scenario deliberately may NOT pin, with reasons. */
const NOT_LOCKABLE: readonly { field: string; reason: string }[] = [
  {
    field: 'companyName',
    reason:
      "the player's own name for their company, not a rule of the world - a scenario that " +
      'pinned it would be dictating who the player is',
  },
  {
    field: 'companyColorIndex',
    reason: 'the same, one field over',
  },
  {
    field: 'editorMode',
    reason:
      'the rule of the WORKSHOP a scenario was made in, not of the world it ships (SPEC2 M22). ' +
      'A scenario that pinned it would hand every player a game in which nothing costs anything ' +
      'and no ground belongs to anybody - the opposite of what a locked rule is for, which is ' +
      'to guarantee the author the conditions the goals were calibrated under',
  },
  {
    field: 'aiCompanies',
    reason:
      'not a top-level field of the saved state: the ROSTER is the lock, because a scenario ' +
      'ships a world whose competitors already exist and cannot be added to afterwards (the ' +
      'D-108 argument for why a company may not join in year 20)',
  },
];

function auditLockableRules(
  fields: Readonly<Record<string, true>>,
  lockable: readonly string[],
  notLockable: readonly { field: string; reason: string }[],
  stateKeys: ReadonlySet<string>,
  settingKeys: ReadonlySet<string>,
): string[] {
  const findings: string[] = [];
  const lockedSet = new Set(lockable);

  for (let i = 0; i < lockable.length; i++) {
    const name = lockable[i]!;
    if (i > 0 && !(lockable[i - 1]! < name)) {
      findings.push(`SCENARIO_LOCKABLE_RULES is not ascending at "${name}"`);
    }
    if (fields[name] !== true) {
      findings.push(`SCENARIO_LOCKABLE_RULES names "${name}", which is not a NewGameParams field`);
    }
    if (!stateKeys.has(name)) {
      findings.push(
        `"${name}" is lockable but is not a field of the saved world state - a rule is saved, ` +
          'hashed and migrated (Z2)',
      );
    }
    if (settingKeys.has(name)) {
      findings.push(`"${name}" is lockable but is an AppSettings field - a setting is not a rule`);
    }
  }

  for (const name of Object.keys(fields).sort(byText)) {
    const excused = notLockable.some((entry) => entry.field === name);
    if (!lockedSet.has(name) && !excused) {
      findings.push(`NewGameParams field "${name}" is neither lockable nor listed with a reason`);
    }
    if (lockedSet.has(name) && excused) {
      findings.push(`"${name}" is both lockable and listed as not lockable`);
    }
  }
  for (const entry of notLockable) {
    if (fields[entry.field] !== true) {
      findings.push(`NOT_LOCKABLE lists "${entry.field}", which is not a NewGameParams field`);
    }
  }
  return findings;
}

describe('coupling: a scenario may pin world rules and nothing else', () => {
  const stateKeys = new Set(
    Object.keys(
      World.create({
        seed: 1,
        difficulty: Difficulty.Normal,
        climate: MapClimate.Temperate,
        mapSize: 64,
        companyName: 'Schluesselbahn',
        companyColorIndex: 0,
      }).toData(),
    ),
  );
  const settingKeys = new Set(Object.keys(DEFAULT_SETTINGS));

  it('holds the real table against the real rules, state and settings', () => {
    expect(
      auditLockableRules(
        NEW_GAME_FIELDS,
        SCENARIO_LOCKABLE_RULES,
        NOT_LOCKABLE,
        stateKeys,
        settingKeys,
      ),
    ).toEqual([]);
  });

  it('reads real key sets rather than empty ones', () => {
    expect(stateKeys.has('inflation')).toBe(true);
    expect(stateKeys.has('goals')).toBe(true);
    expect(settingKeys.has('dayNight')).toBe(true);
  });

  it('meta: flags a setting smuggled into the lock table', () => {
    const findings = auditLockableRules(
      NEW_GAME_FIELDS,
      [...SCENARIO_LOCKABLE_RULES, 'dayNight'],
      NOT_LOCKABLE,
      stateKeys,
      settingKeys,
    );
    expect(findings).toContain(
      'SCENARIO_LOCKABLE_RULES names "dayNight", which is not a NewGameParams field',
    );
    expect(findings).toContain(
      '"dayNight" is lockable but is an AppSettings field - a setting is not a rule',
    );
  });

  it('meta: flags a new world rule nobody decided about', () => {
    // `mapGen` is the generator-preset record SPEC2 M23 asks for in a LATER
    // bundle; until it exists it is a name this build does not know, which is
    // exactly what the planted field has to be. (It used to be `weather`, then
    // `startYear` - M18 and M23 bundle 1 made those real, which is the audit
    // working: each was a compile error here until somebody decided whether a
    // scenario may pin it.)
    const findings = auditLockableRules(
      { ...NEW_GAME_FIELDS, mapGen: true },
      SCENARIO_LOCKABLE_RULES,
      NOT_LOCKABLE,
      stateKeys,
      settingKeys,
    );
    expect(findings).toEqual([
      'NewGameParams field "mapGen" is neither lockable nor listed with a reason',
    ]);
  });

  it('meta: flags a stale exemption', () => {
    const findings = auditLockableRules(
      NEW_GAME_FIELDS,
      SCENARIO_LOCKABLE_RULES,
      [...NOT_LOCKABLE, { field: 'inflation', reason: 'stale' }],
      stateKeys,
      settingKeys,
    );
    expect(findings).toContain('"inflation" is both lockable and listed as not lockable');
  });

  it('meta: flags a rule that is not saved state', () => {
    const findings = auditLockableRules(
      { ...NEW_GAME_FIELDS, aiCompanies: true },
      [...SCENARIO_LOCKABLE_RULES, 'aiCompanies'].sort(byText),
      NOT_LOCKABLE.filter((entry) => entry.field !== 'aiCompanies'),
      stateKeys,
      settingKeys,
    );
    expect(findings).toContain(
      '"aiCompanies" is lockable but is not a field of the saved world state - a rule is saved, ' +
        'hashed and migrated (Z2)',
    );
  });
});
