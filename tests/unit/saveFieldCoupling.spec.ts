import { beforeAll, describe, expect, it } from 'vitest';
import { GoalKind, GoalMedal, GoalStatus } from '../../src/sim/goals/types';
import { parseSaveFile, SAVE_MAGIC, SAVE_VERSION } from '../../src/sim/save/format';
import { scheduleDigest } from '../../src/sim/save/schedule';
import { hashWorld, World } from '../../src/sim/World';
import roadFixture from '../determinism/fixtures/road-line-commands.json';
import { advance, createScenario, parseScenarioFixture } from '../determinism/runner';

/**
 * The third coupling test of SPEC2 M10, enforcing Z2: every field that is
 * SERIALISED into a save must be COVERED - by the validator refusing a save
 * without it, and by either `hashWorld` or the validator noticing when its
 * value changes. The audit walks a REAL encoded payload rather than a written
 * list of fields, so a field added to `toData()`/`encodeSave` anywhere joins
 * the audit by existing - the failure mode this closes is the audit-flagged
 * planning error "derived, no save change" combined with "world rule": state
 * that travels in the file but that neither the digest nor the parser watches.
 *
 * Two passes over every leaf of the payload:
 *
 *  - DELETION (object fields only): remove the field, expect `parseSaveFile`
 *    to refuse the save. A field the parser does not miss is a field the
 *    parser does not cover. Array ELEMENTS are exempt - list lengths vary
 *    between saves by design, so a shorter list is a different save, not a
 *    parser hole.
 *  - PERTURBATION (every leaf): change the value, then either the validator
 *    throws or the reloaded world must hash differently. A change that loads
 *    cleanly into the SAME hash is state the determinism suite cannot see.
 *
 * Exceptions live in the two allowlists below, each entry with its reason,
 * and a stale entry - one that stops matching a real finding - fails the
 * audit too, exactly like i18n.spec.ts fails an orphaned translation key.
 */

const SEED = 424_242;
/** Two game months: monthly hooks fired, the bus mid-route, stations visited. */
const AUDIT_TICKS = 12_000;

/**
 * Fields the PARSER knowingly ignores. Everything here must also be justified
 * against the perturbation pass or be hashed.
 */
const PARSER_IGNORED: readonly { path: string; reason: string }[] = [
  {
    path: 'state.stations[].acceptedCargo',
    reason:
      'derived from the map on load (see save/entities.ts); written only so the shape matches',
  },
  {
    path: 'state.stations[].servedIndustries',
    reason: 'derived from the map on load, exactly like the land masses',
  },
  {
    path: 'state.news[].params.*',
    reason: 'message-specific substitution keys; the record itself is required, its keys vary',
  },
  {
    path: 'state.ai[].project.railTrains',
    reason:
      'absent in every save written before M11 stage C2 and parsed to 1, the single track ' +
      'the old AI laid (the D-146 wire pattern, D-153); the value itself is hashed, so the ' +
      'change probe still watches it',
  },
  {
    path: 'checkpoints[].scheduleDigest',
    reason:
      'absent in every recording written before M16 bundle 4 and parsed to the empty string, ' +
      'which is the recorded fact "this mark committed to no schedule" - verification then ' +
      'answers with a bracket instead of a tick rather than inventing a commitment (D-191); ' +
      'the value itself is shape-checked, so the change probe still watches it',
  },
  {
    path: 'replay.scheduleDigest',
    reason: 'the same commitment for the part-year tail no checkpoint covers (D-191)',
  },
];

/**
 * Leaves whose value may change without the validator or `hashWorld`
 * noticing. This list is the WHOLE budget of unwatched save content.
 */
const UNHASHED: readonly { path: string; reason: string }[] = [
  {
    path: 'state.stations[].acceptedCargo',
    reason: 'derived on load; the decoder overwrites whatever the file says',
  },
  {
    path: 'state.stations[].servedIndustries',
    reason: 'derived on load; the decoder overwrites whatever the file says',
  },
  {
    path: 'gameVersion',
    reason: 'container metadata naming the build (D-131); not world state, never hashed',
  },
  {
    path: 'commandLog[].*',
    reason:
      'the log is history, not state: replay verification, not the world digest, judges it (D-131)',
  },
  {
    path: 'commandsExecuted',
    reason:
      'the replay cursor into that log - container bookkeeping of the same family; range-checked ' +
      'against the log length, but its exact value is not world state and cannot be in the digest',
  },
  {
    path: 'checkpoints[].payload',
    reason:
      'a recorded past, not the present state: the checkpoint carries its own digest and is ' +
      'verified when it is RESTORED, because decompressing the whole ring to open one save would ' +
      'charge every load for a jump nobody asked for (D-188)',
  },
  {
    path: 'replay.finalTick',
    reason:
      'the claim a recording makes about where it ends; replay verification judges it, and a ' +
      'claim that disagrees with the re-simulation is what a divergence report is made of (D-131)',
  },
  {
    path: 'scenario.*',
    reason:
      'the `.ironscenario` metadata block, UNHASHED by construction and on purpose (SPEC2 ' +
      'Fehlerkatalog 35): a briefing typo must never become a desync, so title, author, ' +
      'briefing, goal captions, lock list, date span and reference hash are all outside the ' +
      'world digest. Unhashed is not unchecked - the parser validates every one of them, which ' +
      'is why several of these leaves refuse a change instead of surviving it - and the ' +
      'boundary has its own audit with a meta-test in tests/unit/scenarioCoupling.spec.ts',
  },
];

type PathSegment = string | number;

interface Leaf {
  readonly path: readonly PathSegment[];
  readonly normalized: string;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function collectLeaves(value: unknown, path: PathSegment[], normalized: string, out: Leaf[]): void {
  if (value === null || value === undefined) {
    throw new Error(`audit: ${normalized} is ${String(value)} - give the section a representative`);
  }
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  ) {
    out.push({ path: [...path], normalized });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      // An empty list is itself the leaf: perturbation gives it one element.
      out.push({ path: [...path], normalized });
      return;
    }
    // The first element stands for all of them - every element of a section
    // shares one encoder and one decoder, so one representative is enough.
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

function valueAt(root: unknown, path: readonly PathSegment[]): unknown {
  const container = containerAt(root, path);
  const last = path[path.length - 1]!;
  return typeof last === 'number'
    ? (container as unknown[])[last]
    : (container as Record<string, unknown>)[last];
}

function setAt(root: unknown, path: readonly PathSegment[], value: unknown): void {
  const container = containerAt(root, path);
  const last = path[path.length - 1]!;
  if (typeof last === 'number') (container as unknown[])[last] = value;
  else (container as Record<string, unknown>)[last] = value;
}

function perturbed(value: unknown, normalized: string): unknown {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}X`;
  if (typeof value === 'boolean') return !value;
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value);
    copy[0] = copy[0]! ^ 1;
    return copy;
  }
  if (Array.isArray(value) && value.length === 0) return [0];
  throw new Error(`audit: no perturbation for ${normalized}`);
}

function matches(normalized: string, entry: string): boolean {
  if (entry.endsWith('*')) return normalized.startsWith(entry.slice(0, -1));
  return normalized === entry;
}

/** Object fields the parser accepts a save WITHOUT - raw, before allowlists. */
function deletionFindings(payload: unknown, leaves: readonly Leaf[]): string[] {
  const findings: string[] = [];
  for (const leaf of leaves) {
    const last = leaf.path[leaf.path.length - 1]!;
    if (typeof last !== 'string') continue;
    const clone = structuredClone(payload);
    Reflect.deleteProperty(containerAt(clone, leaf.path) as object, last);
    try {
      parseSaveFile(clone);
      findings.push(leaf.normalized);
    } catch {
      // Covered: the parser refuses a save without the field.
    }
  }
  return findings;
}

/** Leaves whose change survives load into an UNCHANGED hash - raw. */
function perturbationFindings(
  payload: unknown,
  baseHash: string,
  leaves: readonly Leaf[],
): string[] {
  const findings: string[] = [];
  for (const leaf of leaves) {
    const clone = structuredClone(payload);
    setAt(clone, leaf.path, perturbed(valueAt(clone, leaf.path), leaf.normalized));
    try {
      const file = parseSaveFile(clone);
      const world = World.fromData(file.state);
      if (hashWorld(world) === baseHash) findings.push(leaf.normalized);
    } catch {
      // Covered: the validator (or the load itself) refuses the change.
    }
  }
  return findings;
}

// ---------------------------------------------------------------- the payload

let payload: Record<string, unknown>;
let leaves: Leaf[];
let baseHash: string;

beforeAll(() => {
  const scenario = createScenario(SEED, parseScenarioFixture(roadFixture));
  advance(scenario, AUDIT_TICKS, []);
  const world = scenario.world;
  const state = world.toData();

  // The played line guarantees most sections a representative; what the game
  // has not produced by now is given a synthetic one, because a section with
  // no representative is a section this audit does not see.
  expect(state.companies.length).toBeGreaterThan(0);
  expect(state.towns.length).toBeGreaterThan(0);
  expect(state.industries.length).toBeGreaterThan(0);
  expect(state.stations.length).toBeGreaterThanOrEqual(2);
  expect(state.vehicles.length).toBeGreaterThan(0);
  expect(state.stations[0]!.modules.length).toBeGreaterThan(0);
  expect(state.stations[0]!.waiting.length).toBeGreaterThan(0);
  expect(state.stations[0]!.visitTicks.length).toBeGreaterThan(0);
  expect(state.vehicles[0]!.orders.length).toBeGreaterThan(0);
  expect(state.cargoLinks.length).toBeGreaterThan(0);

  if (state.stations[0]!.runwayFreeTick.length === 0) {
    state.stations[0]!.runwayFreeTick.push(AUDIT_TICKS);
  }
  if (state.vehicles[0]!.cargo.length === 0) {
    state.vehicles[0]!.cargo.push({
      cargo: 0,
      amount: 2.5,
      createdTick: AUDIT_TICKS - 500,
      originStationId: 0,
      destinationStationId: 1,
      paidFromX: 10.5,
      paidFromY: 20.5,
    });
  }
  if (state.news.length === 0) {
    state.news.push({
      tick: AUDIT_TICKS - 100,
      category: 0,
      severity: 1,
      messageKey: 'news.audit.probe',
      params: { name: 'Probe', amount: 7 },
      tileIndex: -1,
    });
  }
  if (state.contracts.length === 0) {
    state.contracts.push({
      id: state.nextContractId,
      cargo: 1,
      townId: 0,
      amountUnits: 25.5,
      offeredTick: 100,
      deadlineTick: 90_000,
      bonusCt: 250_000,
      acceptedBy: [0],
      progress: [3.5],
      completedBy: -1,
    });
    state.nextContractId += 1;
  }
  if (state.ai.length === 0) {
    state.ai.push({
      companyId: 0,
      personality: 1,
      nextDecisionTick: AUDIT_TICKS + 100,
      lastBuildTick: -1,
      reviews: [{ lineId: 0, reviewTick: AUDIT_TICKS + 5_000, earnedAtReviewCt: 250 }],
      project: {
        stage: 1,
        fromX: 1,
        fromY: 2,
        toX: 3,
        toY: 4,
        depotX: 5,
        depotY: 6,
        rail: false,
        cargo: 0,
        specIds: [200],
        startedTick: 50,
        railTrains: 1,
        lineId: -1,
      },
    });
  }
  if (state.goals.length === 0) {
    // A representative goal of SPEC2 M17 - a world only carries goals when a
    // scenario gave it some, and the recorded road fixture has none. Achieved
    // rather than open, so the verdict fields (medal, completion date) are
    // walked as the values the parser actually cross-checks.
    state.goals.push({
      kind: GoalKind.CompanyValueBy,
      subjectA: -1,
      subjectB: -1,
      threshold: 200_000_000,
      goldTick: 720_000,
      silverTick: 1_296_000,
      bronzeTick: 1_800_000,
      progress: 250_000_000,
      holdDays: 3,
      status: GoalStatus.Achieved,
      medal: GoalMedal.Silver,
      completedTick: 900_000,
    });
  }
  if (state.lines.length === 0) {
    // A representative line of section 12.2, with a full-grammar order so
    // every LineSave leaf is walked and probed.
    state.lines.push({
      id: 0,
      ownerId: 0,
      autoRenew: true,
      taktTicks: 4_000,
      taktOffsetTicks: 600,
      orders: [
        {
          target: 0,
          targetId: 0,
          load: 1,
          unload: 0,
          refitTo: 2,
          waitTicks: 200,
          condKind: 1,
          condComparator: 4,
          condValue: 60,
          condJumpTo: 0,
        },
      ],
    });
  }

  payload = {
    magic: SAVE_MAGIC,
    saveVersion: SAVE_VERSION,
    gameVersion: 'audit',
    seed: world.seed,
    tick: world.tick,
    // Rides along unverified: the audit compares recomputed hashes, never this
    // string, so the synthetic sections above do not have to re-record it.
    worldDigest: hashWorld(world),
    state,
    commandLog: scenario.queue.log.map((envelope) => ({
      tick: envelope.tick,
      seq: envelope.seq,
      companyId: envelope.companyId,
      command: JSON.parse(JSON.stringify(envelope.command)) as unknown,
    })),
    commandsExecuted: scenario.queue.executedCount,
    logBaseTick: 0,
    // The M16 sections need representatives like every other section that the
    // played fixture leaves empty. The audit walks the CONTAINER, and it never
    // decodes a checkpoint payload, so a short blob under a real-looking
    // digest exercises exactly the fields the parser reads. Tick 0 because the
    // ring may not reach past the recording, and this world is two months old.
    checkpoints: [
      {
        tick: 0,
        worldDigest: hashWorld(world),
        payload: new Uint8Array([1, 2, 3]),
        scheduleDigest: scheduleDigest(scenario.queue.log, 0, 0),
      },
    ],
    replay: {
      finalTick: world.tick,
      finalHash: hashWorld(world),
      scheduleDigest: scheduleDigest(scenario.queue.log, 0, world.tick),
    },
    // The M17 metadata block needs a representative like every other section a
    // played fixture leaves empty - and it needs one MORE than the others do:
    // a section this audit never walks is a section whose absence from the
    // digest is an assumption rather than a finding. One caption, because the
    // state above carries exactly one goal and the parser holds the two to the
    // same count.
    scenario: {
      title: 'Audit-Szenario',
      author: 'Audit',
      briefing: { de: 'Bauen Sie eine Linie.', en: 'Build one line.' },
      goals: [{ de: 'Firmenwert erreichen', en: 'Reach the company value' }],
      lockedRules: ['goals', 'inflation'],
      fromTick: 0,
      toTick: 720_000,
      referenceFinalHash: hashWorld(world),
    },
  };

  leaves = [];
  collectLeaves(payload, [], '', leaves);
  baseHash = hashWorld(World.fromData(parseSaveFile(payload).state));
});

// ----------------------------------------------------------------- the audits

describe('coupling: every serialised field is parsed and watched', () => {
  it('enumerates a payload with every section represented', () => {
    // ~40 leaves would mean the walk broke, not that the save shrank.
    expect(leaves.length).toBeGreaterThan(100);
    const normalized = leaves.map((leaf) => leaf.normalized);
    expect(normalized).toContain('state.vehicles[].orders[].targetId');
    expect(normalized).toContain('state.map.trackBits');
    expect(normalized).toContain('state.ai[].project.stage');
  });

  it('the parser refuses a save missing any field it claims to cover', () => {
    const raw = deletionFindings(payload, leaves);
    const open = raw.filter(
      (finding) => !PARSER_IGNORED.some((entry) => matches(finding, entry.path)),
    );
    expect(open).toEqual([]);

    // A stale allowlist entry is a finding too (i18n.spec.ts precedent).
    for (const entry of PARSER_IGNORED) {
      expect(
        raw.some((finding) => matches(finding, entry.path)),
        `PARSER_IGNORED entry "${entry.path}" no longer matches anything`,
      ).toBe(true);
    }
  });

  it('every field change is seen by the validator or by hashWorld', () => {
    const raw = perturbationFindings(payload, baseHash, leaves);
    const open = raw.filter((finding) => !UNHASHED.some((entry) => matches(finding, entry.path)));
    expect(open).toEqual([]);

    for (const entry of UNHASHED) {
      expect(
        raw.some((finding) => matches(finding, entry.path)),
        `UNHASHED entry "${entry.path}" no longer matches anything`,
      ).toBe(true);
    }
  });

  it('meta: detects a planted field that nobody parses or hashes', () => {
    const plantedPayload = structuredClone(payload);
    (plantedPayload['state'] as Record<string, unknown>)['planted'] = 1;
    const plantedLeaf: Leaf = { path: ['state', 'planted'], normalized: 'state.planted' };

    // The parser does not miss it when it is gone...
    expect(deletionFindings(plantedPayload, [plantedLeaf])).toEqual(['state.planted']);
    // ...and neither validator nor digest notices when it changes.
    expect(perturbationFindings(plantedPayload, baseHash, [plantedLeaf])).toEqual([
      'state.planted',
    ]);
  });
});
