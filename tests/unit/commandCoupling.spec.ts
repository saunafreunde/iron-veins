import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandKind, type Command } from '../../src/sim/commands/types';
import { parseCommand } from '../../src/sim/save/format';

/**
 * The two command coupling tests of SPEC2 M10, in the self-auditing style of
 * i18n.spec.ts: the audits walk the REAL CommandKind table and the REAL
 * interface sources, so a command kind added anywhere turns this file red
 * until the kind has a UI issuer (or a documented reason not to) and until the
 * one command parser round-trips it. Each audit is a pure function over its
 * inputs, and the meta-tests below feed it a planted violation to prove it
 * actually fires - an audit that cannot fail is a comment, not a test.
 */

const UI_DIR = fileURLToPath(new URL('../../src/ui/', import.meta.url));

// ------------------------------------------------- (a) CommandKind <-> UI issuer

/**
 * Kinds that deliberately have no interface issuer.
 *
 * A kind that only the AI or a dev tool may issue gets an entry HERE, with the
 * reason, instead of silently having no button - and the audit fails a stale
 * entry, so the list cannot outlive its reasons.
 *
 * The five entries below are the scenario workshop's own commands (SPEC2 M22).
 * They are here for exactly ONE bundle: M22 bundle 1 ships the simulation half
 * - the kinds, the parser, the `editorMode` rule, the save bump - and bundle 2
 * ships `src/ui/editor/` with the palette that issues them. Splitting it that
 * way is what keeps the save bump and its pin re-record in one reviewable
 * change; the allowlist is the honest way to say "not yet" rather than to
 * weaken the audit, and **bundle 2 deletes these five lines**. An entry that is
 * still here when the palette exists is a red build, because the audit fails a
 * kind that IS issued and is listed.
 */
const NO_UI_ISSUER: readonly string[] = [
  'TerraformBrushRegion',
  'PlaceTownSeed',
  'PlaceIndustryAt',
  'PaintForest',
  'PaintRiver',
];

/**
 * Command construction sites: `kind: CommandKind.X` is how a command literal
 * is built. Mere mentions (audio mapping, tutorial predicates, switch cases)
 * compare with `===` or `case` and do not match this pattern.
 */
function extractIssuedKinds(sources: readonly string[]): Set<string> {
  const issued = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/kind:\s*CommandKind\.(\w+)/g)) {
      issued.add(match[1]!);
    }
  }
  return issued;
}

function auditUiIssuers(
  kindNames: readonly string[],
  issued: ReadonlySet<string>,
  allowlist: readonly string[],
): string[] {
  const violations: string[] = [];
  for (const name of kindNames) {
    const allowed = allowlist.includes(name);
    if (!issued.has(name) && !allowed) {
      violations.push(`CommandKind.${name} has no UI issuer and is not on the NO_UI_ISSUER list`);
    }
    if (issued.has(name) && allowed) {
      violations.push(`CommandKind.${name} is on the NO_UI_ISSUER list but the UI issues it`);
    }
  }
  for (const name of allowlist) {
    if (!kindNames.includes(name)) {
      violations.push(`NO_UI_ISSUER lists "${name}", which is not a CommandKind`);
    }
  }
  return violations;
}

function readUiSources(): string[] {
  return readdirSync(UI_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => readFileSync(join(UI_DIR, name), 'utf-8'));
}

describe('coupling: every CommandKind has a UI issuer', () => {
  const kindNames = Object.keys(CommandKind).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const issued = extractIssuedKinds(readUiSources());

  it('finds no unissuable command kind', () => {
    expect(auditUiIssuers(kindNames, issued, NO_UI_ISSUER)).toEqual([]);
  });

  it('actually reads issuers out of the interface sources', () => {
    // The audit is only as good as its extraction: if the construction pattern
    // ever changes shape, `issued` collapses to nothing and the audit above
    // would drown in false alarms - but a silent regex mismatch that matched
    // SOME kinds could hide real gaps. Anchor to a known issuer.
    expect(issued).toContain('BuildRoad');
    expect(issued.size).toBeGreaterThanOrEqual(kindNames.length - NO_UI_ISSUER.length);
  });

  it('meta: flags a planted kind that has no issuer', () => {
    const violations = auditUiIssuers([...kindNames, 'PlantedCommand'], issued, NO_UI_ISSUER);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('PlantedCommand');
  });

  it('meta: flags a stale allowlist entry', () => {
    const violations = auditUiIssuers(kindNames, issued, ['BuildRoad', 'NotAKind']);
    expect(violations).toContain(
      'CommandKind.BuildRoad is on the NO_UI_ISSUER list but the UI issues it',
    );
    expect(violations).toContain('NO_UI_ISSUER lists "NotAKind", which is not a CommandKind');
  });
});

// --------------------------------------------- (b) CommandKind <-> runner parser

/**
 * One representative command per kind, every field set to a non-default value.
 *
 * Typed as a complete Record over the kind names, so a NEW CommandKind is a
 * compile error right here until its sample exists - and the runtime audit
 * below covers the same ground for the meta-test, because a type error cannot
 * be planted and observed by a running test.
 */
const SAMPLES: Record<keyof typeof CommandKind, Command> = {
  SetCompanyName: { kind: CommandKind.SetCompanyName, name: 'Sample AG' },
  SetCompanyColor: { kind: CommandKind.SetCompanyColor, colorIndex: 3 },
  TakeLoan: { kind: CommandKind.TakeLoan, amountCt: 2_000_000 },
  RepayLoan: { kind: CommandKind.RepayLoan, amountCt: 1_000_000 },
  RaiseLand: { kind: CommandKind.RaiseLand, x: 12, y: 34 },
  LowerLand: { kind: CommandKind.LowerLand, x: 13, y: 35 },
  LevelLand: { kind: CommandKind.LevelLand, x: 14, y: 36 },
  BuildRoad: { kind: CommandKind.BuildRoad, x1: 1, y1: 2, x2: 9, y2: 8 },
  DemolishRoad: { kind: CommandKind.DemolishRoad, x: 5, y: 6 },
  BuildRoadStop: { kind: CommandKind.BuildRoadStop, x: 7, y: 8, moduleKind: 1 },
  BuyRoadVehicle: { kind: CommandKind.BuyRoadVehicle, x: 9, y: 10, specId: 200 },
  SellVehicle: { kind: CommandKind.SellVehicle, vehicleId: 4 },
  SetVehicleOrders: {
    kind: CommandKind.SetVehicleOrders,
    vehicleId: 5,
    // Field order matches what parseCommand emits, because the round trip
    // below compares JSON text. Every 12.1 field carries a non-default value.
    orders: [
      {
        target: 0,
        targetId: 2,
        load: 1,
        unload: 3,
        refitTo: 4,
        waitTicks: 600,
        condKind: 1,
        condComparator: 5,
        condValue: 80,
        condJumpTo: 1,
      },
      {
        target: 2,
        targetId: 300,
        load: 2,
        unload: 1,
        refitTo: -1,
        waitTicks: 0,
        condKind: -1,
        condComparator: 0,
        condValue: 0,
        condJumpTo: 0,
      },
    ],
  },
  SetVehicleRunning: { kind: CommandKind.SetVehicleRunning, vehicleId: 6, running: true },
  SendVehicleToDepot: { kind: CommandKind.SendVehicleToDepot, vehicleId: 6 },
  BuildTrack: {
    kind: CommandKind.BuildTrack,
    x1: 3,
    y1: 4,
    x2: 30,
    y2: 40,
    railType: 2,
    assistant: false,
    signalSpacing: 6,
  },
  DemolishTrack: { kind: CommandKind.DemolishTrack, x: 15, y: 16 },
  BuildRailStop: { kind: CommandKind.BuildRailStop, x: 17, y: 18, moduleKind: 3 },
  BuyTrain: { kind: CommandKind.BuyTrain, x: 19, y: 20, specIds: [1, 40, 40, 41] },
  BuildSignal: { kind: CommandKind.BuildSignal, x: 21, y: 22, signalKind: 1, direction: 3 },
  DemolishSignal: { kind: CommandKind.DemolishSignal, x: 23, y: 24 },
  RefitVehicle: { kind: CommandKind.RefitVehicle, vehicleId: 7, cargo: 2 },
  BuildStationModule: { kind: CommandKind.BuildStationModule, x: 25, y: 26, moduleKind: 6 },
  SetAutoRenew: { kind: CommandKind.SetAutoRenew, lineId: 3, enabled: true },
  BuildWaterStop: { kind: CommandKind.BuildWaterStop, x: 27, y: 28, moduleKind: 8 },
  BuyShip: { kind: CommandKind.BuyShip, x: 29, y: 30, specId: 320 },
  BuildAirport: { kind: CommandKind.BuildAirport, x: 31, y: 32, moduleKind: 11 },
  BuyAircraft: { kind: CommandKind.BuyAircraft, x: 33, y: 34, specId: 340 },
  BuyExclusiveRights: { kind: CommandKind.BuyExclusiveRights, townId: 3 },
  ApplyTownMeasure: { kind: CommandKind.ApplyTownMeasure, townId: 4, measure: 1 },
  DemolishBuilding: { kind: CommandKind.DemolishBuilding, x: 35, y: 36 },
  AcceptContract: { kind: CommandKind.AcceptContract, contractId: 9 },
  AcceptSupplyContract: { kind: CommandKind.AcceptSupplyContract, contractId: 11 },
  BuildWaypoint: { kind: CommandKind.BuildWaypoint, x: 37, y: 38 },
  DemolishWaypoint: { kind: CommandKind.DemolishWaypoint, x: 39, y: 40 },
  CreateLine: { kind: CommandKind.CreateLine },
  DeleteLine: { kind: CommandKind.DeleteLine, lineId: 2 },
  SetLineOrders: {
    kind: CommandKind.SetLineOrders,
    lineId: 1,
    orders: [
      {
        target: 0,
        targetId: 4,
        load: 1,
        unload: 0,
        refitTo: 2,
        waitTicks: 400,
        condKind: 3,
        condComparator: 4,
        condValue: 5,
        condJumpTo: 0,
      },
    ],
  },
  AssignVehicleToLine: { kind: CommandKind.AssignVehicleToLine, vehicleId: 8, lineId: 1 },
  ReleaseVehicleFromLine: { kind: CommandKind.ReleaseVehicleFromLine, vehicleId: 8 },
  SetLineTakt: { kind: CommandKind.SetLineTakt, lineId: 2, taktTicks: 4_000, offsetTicks: 600 },
  SetTransferNode: { kind: CommandKind.SetTransferNode, stationId: 5, transferNode: true },
  TerraformBrushRegion: {
    kind: CommandKind.TerraformBrushRegion,
    x: 41,
    y: 42,
    radius: 3,
    direction: -1,
  },
  PlaceTownSeed: { kind: CommandKind.PlaceTownSeed, x: 43, y: 44, sizeClass: 1 },
  PlaceIndustryAt: { kind: CommandKind.PlaceIndustryAt, x: 45, y: 46, industryType: 7 },
  PaintForest: { kind: CommandKind.PaintForest, x: 47, y: 48, radius: 2 },
  PaintRiver: { kind: CommandKind.PaintRiver, x: 49, y: 50, radius: 1 },
};

function auditParserRoundTrip(
  kindTable: Readonly<Record<string, number>>,
  samples: Readonly<Partial<Record<string, Command>>>,
): string[] {
  const violations: string[] = [];
  const names = Object.keys(kindTable).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const name of names) {
    const sample = samples[name];
    if (sample === undefined) {
      violations.push(`CommandKind.${name} has no round-trip sample`);
      continue;
    }
    if (sample.kind !== kindTable[name]) {
      violations.push(`sample for CommandKind.${name} carries kind ${sample.kind}`);
      continue;
    }
    // Through JSON exactly as a fixture travels, then through the ONE parser.
    let parsed: Command;
    try {
      parsed = parseCommand(JSON.parse(JSON.stringify(sample)), `sample.${name}`);
    } catch (error) {
      violations.push(
        `CommandKind.${name} does not parse: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }
    if (JSON.stringify(parsed) !== JSON.stringify(sample)) {
      violations.push(`CommandKind.${name} does not round-trip: got ${JSON.stringify(parsed)}`);
    }
  }
  return violations;
}

describe('coupling: every CommandKind round-trips through parseCommand', () => {
  it('parses every kind of the real table back to its sample', () => {
    expect(auditParserRoundTrip(CommandKind, SAMPLES)).toEqual([]);
  });

  it('refuses a kind the game does not have', () => {
    expect(() => parseCommand({ kind: 999 }, 'sample.unknown')).toThrowError(
      /999 is not a known command/,
    );
  });

  it('meta: flags a planted kind that has no sample and no parser case', () => {
    const planted = { ...CommandKind, PlantedCommand: 999 };
    const missing = auditParserRoundTrip(planted, SAMPLES);
    expect(missing).toEqual(['CommandKind.PlantedCommand has no round-trip sample']);

    const withSample = auditParserRoundTrip(planted, {
      ...SAMPLES,
      PlantedCommand: { kind: 999 } as unknown as Command,
    });
    expect(withSample).toHaveLength(1);
    expect(withSample[0]).toContain('CommandKind.PlantedCommand does not parse');
  });

  it('meta: flags a sample that drifted to another kind', () => {
    const violations = auditParserRoundTrip(CommandKind, {
      ...SAMPLES,
      TakeLoan: SAMPLES.RepayLoan,
    });
    expect(violations).toEqual(['sample for CommandKind.TakeLoan carries kind 4']);
  });
});
