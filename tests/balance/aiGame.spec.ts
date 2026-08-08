import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { Difficulty, MapClimate, TICKS_PER_YEAR, TILE_PUBLIC } from '../../src/sim/constants';
import { PERSONALITY_COUNT, Personality } from '../../src/sim/ai/types';
import { hashWorld, World } from '../../src/sim/World';
import { hashTwin } from './determinism';

/**
 * The acceptance criterion of M8: a twenty-five year game against three AI
 * companies runs through with no player input, and the competitors build
 * plausible, DISTINGUISHABLE networks.
 *
 * "Distinguishable" is the part worth testing, because it is the part that is
 * easy to fake: five personalities that all optimise the same number produce
 * five identical companies. So the run is measured - who laid rail, who laid
 * road, who borrowed - and the measurements are printed, the way the balancing
 * scenarios print theirs.
 */

const YEARS = 25;
const MAP_SIZE = 256;

interface Measured {
  readonly name: string;
  readonly personality: number;
  readonly roadTiles: number;
  readonly railTiles: number;
  readonly stations: number;
  readonly vehicles: number;
  readonly lines: number;
  readonly loanCt: number;
  readonly valueCt: number;
  readonly bankrupt: boolean;
}

function measure(world: World, companyId: number): Measured {
  const map = world.map;
  let roadTiles = 0;
  let railTiles = 0;
  for (let tile = 0; tile < map.tileCount; tile++) {
    if (map.owner[tile] !== companyId) continue;
    if (map.trackBits[tile] !== 0) railTiles++;
    else if (map.roadBits[tile] !== 0) roadTiles++;
  }

  let vehicles = 0;
  for (let id = 0; id < world.vehicles.count; id++) {
    if (world.vehicles.alive[id] === 1 && world.vehicles.ownerId[id] === companyId) vehicles++;
  }

  const company = world.companyOf(companyId);
  const state = world.ai.find((entry) => entry.companyId === companyId);
  return {
    name: company.name,
    personality: state?.personality ?? -1,
    roadTiles,
    railTiles,
    stations: world.stations.filter((station) => station.ownerId === companyId).length,
    vehicles,
    // Real line entities since M11 (E-06): a competitor's lines are counted
    // where everybody's are, in the world's own store.
    lines: world.lines.ownedBy(companyId).length,
    loanCt: company.loanCt,
    valueCt: company.cashCt - company.loanCt + company.fixedAssetsCt,
    bankrupt: company.bankrupt,
  };
}

function play(years: number, seed = 4_711): { world: World; queue: CommandQueue } {
  const world = World.create({
    seed,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: MAP_SIZE,
    companyName: 'Spielerbahn',
    companyColorIndex: 0,
    aiCompanies: 3,
  });
  const queue = new CommandQueue();
  for (let tick = 0; tick < years * TICKS_PER_YEAR; tick++) world.step(queue, null);
  return { world, queue };
}

/**
 * The twenty-five year world is played ONCE and shared: every long test in
 * this file reads it and none of them writes, and replaying the same
 * deterministic quarter century three times was most of the suite's wall
 * time.
 */
let sharedRun: { world: World; queue: CommandQueue } | null = null;
function quarterCentury(): { world: World; queue: CommandQueue } {
  sharedRun ??= play(YEARS);
  return sharedRun;
}

/**
 * The floors of M11 stage C2 (DECISIONS.md D-156), in cents, pinned under
 * the measured run so a regression of the kind that stage fixed - a
 * personality that stops building, a renewal that eats a company, a loan
 * churn - goes red by name rather than shifting a printed number nobody
 * reads. Measured on this seed at M11: road solvent at 544,857 EUR with a
 * six-vehicle line, rail alive at -15,142 EUR (its train frozen by the
 * braking defect D-156 names), the town network wound up at 96,512 EUR.
 *
 * **The rail floor was re-banded in SPEC2 M19 bundle 1 (D-207), with both
 * measurements taken on the same machine an hour apart.** The passenger trade
 * became two fare classes, the towns of this generated map carry commercial
 * zones, and the ROAD company - which runs the bus lines - therefore earns the
 * business premium, builds ten more tiles of road (345 -> 355) and finishes at
 * 550,942 EUR instead of 544,857. The three competitors share one world, so
 * from there every later decision is a different decision: this run's rail
 * company buys and writes off one train (~144,000 EUR of depreciated asset)
 * that the M11 run never bought, and ends at -159,142 EUR instead of -15,142.
 *
 * What the floor is FOR is unchanged and still holds: at both figures the rail
 * personality is the stagnant husk D-158 names as an open bottleneck - no
 * line, no vehicle, two stations - and neither run is a company that stopped
 * building. The floor is set from the measured run exactly as the original was
 * (that is stated rather than hidden), one and a half times below it, so it
 * still catches a rail company that loses its starting capital AND its whole
 * credit line.
 */
const VALUE_FLOOR_CT: ReadonlyMap<number, number> = new Map([
  [Personality.Rail, -250_000_00],
  [Personality.Road, 400_000_00],
  [Personality.TownNetwork, 0],
]);

describe('M8 acceptance: twenty-five years against three competitors', () => {
  it('runs through without the player touching anything', () => {
    const { world } = quarterCentury();

    expect(world.date.year).toBe(1950 + YEARS);
    expect(world.companies.length).toBe(4);
    expect(world.ai.length).toBe(3);

    const rows = world.ai.map((state) => measure(world, state.companyId));
    for (const row of rows) {
      console.log(
        `${row.name} (personality ${row.personality}): ` +
          `${row.lines} lines, ${row.railTiles} rail, ${row.roadTiles} road, ` +
          `${row.stations} stations, ${row.vehicles} vehicles, ` +
          `loan ${Math.round(row.loanCt / 100)}, value ${Math.round(row.valueCt / 100)}` +
          (row.bankrupt ? ' [wound up]' : ''),
      );
    }

    // Somebody built something. A twenty-five year game in which no competitor
    // ever laid a rail is a decision cycle that does not work, however tidy the
    // code is.
    const builders = rows.filter((row) => row.stations > 0);
    expect(builders.length).toBeGreaterThan(0);
  });

  it('holds the measured solvency count and the per-personality value floors', () => {
    // ASSERTED, not narrated (M11 stage C2, D-156): the printed table above
    // stayed green through every regression this stage dug out, because a
    // printed number fails nobody's build.
    const { world } = quarterCentury();
    const rows = world.ai.map((state) => measure(world, state.companyId));

    // Solvency: at most one competitor may be wound up, and at least two
    // must finish the quarter century alive - the measured run has the town
    // network wound up and the other two still standing.
    const woundUp = rows.filter((row) => row.bankrupt);
    expect(woundUp.length).toBeLessThanOrEqual(1);
    expect(rows.length - woundUp.length).toBeGreaterThanOrEqual(2);

    // Value floors per personality, pinned under the measured run.
    for (const row of rows) {
      const floor = VALUE_FLOOR_CT.get(row.personality as Personality);
      if (floor === undefined) continue;
      expect(row.valueCt).toBeGreaterThanOrEqual(floor);
    }

    // And the winner is a real network, not the degenerate pile the 4.05M
    // note in the project history warns about: its fleet works several
    // stations, with a sane vehicles-per-station density.
    const best = rows.reduce((a, b) => (b.valueCt > a.valueCt ? b : a));
    expect(best.bankrupt).toBe(false);
    expect(best.lines).toBeGreaterThanOrEqual(1);
    expect(best.vehicles).toBeGreaterThanOrEqual(2);
    expect(best.stations).toBeGreaterThanOrEqual(2);
    expect(best.vehicles).toBeLessThanOrEqual(best.stations * 6);
  });

  it('builds networks that can be told apart', () => {
    const { world } = quarterCentury();
    const rows = world.ai.map((state) => measure(world, state.companyId));

    // Every competitor got its own personality - three drawn from five without
    // replacement, which is the whole reason personalities exist.
    const personalities = new Set(rows.map((row) => row.personality));
    expect(personalities.size).toBe(rows.length);
    for (const row of rows) {
      expect(row.personality).toBeGreaterThanOrEqual(0);
      expect(row.personality).toBeLessThan(PERSONALITY_COUNT);
    }

    // And the networks themselves differ. Two companies with identical tile
    // counts, station counts and fleet sizes would mean the personality is a
    // label rather than a behaviour.
    const shapes = new Set(rows.map((row) => `${row.railTiles}:${row.roadTiles}:${row.stations}`));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('plays by the same rules the player does', () => {
    const { world } = quarterCentury();

    for (const state of world.ai) {
      const company = world.companyOf(state.companyId);
      // No resource bonus: a competitor's money came from its own revenue and
      // its own credit line, so it can be overdrawn and it can be wound up.
      expect(company.cashCt + company.fixedAssetsCt).toBeLessThan(1_000_000_000_00);
      expect(company.id).toBeGreaterThan(0);
    }

    // Everything a competitor built is marked as its own on the map, exactly as
    // a player's is - which is also what a council reads as noise.
    const map = world.map;
    let ownedByAi = 0;
    for (let tile = 0; tile < map.tileCount; tile++) {
      const owner = map.owner[tile]!;
      if (owner !== TILE_PUBLIC && owner > 0) ownedByAi++;
    }
    console.log(`tiles owned by competitors: ${ownedByAi}`);
  });

  it('is reproducible: the same seed plays the same game', () => {
    const first = play(5);
    const second = play(5);
    expect(hashWorld(second.world)).toBe(hashWorld(first.world));
  });

  it('leaves every command it issued in the replay log', () => {
    const { queue } = play(3);

    // The player did nothing, so every command in the log is a competitor's -
    // and there IS a log, which is what "uses the same commands as the player"
    // has to mean if it means anything.
    expect(queue.log.length).toBeGreaterThan(0);
    for (const envelope of queue.log) expect(envelope.companyId).toBeGreaterThan(0);
  });

  // The quarter century itself, not the five-year probe above: costly enough
  // to be one of the two scenarios the default run skips (see
  // ./determinism.ts), and covered on every push by the CI `soak` job and by
  // the long-run fixture, which replays exactly this game against the
  // sixteen hashes its checkpoint ring committed to.
  hashTwin(
    'aiGame',
    () => [quarterCentury().world],
    () => [play(YEARS).world],
  );
});
