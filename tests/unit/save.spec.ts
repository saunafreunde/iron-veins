import { encode } from '@msgpack/msgpack';
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import {
  Difficulty,
  LOAN_STEP_CT,
  MapClimate,
  TICKS_PER_MONTH,
  TILE_PUBLIC,
  WEATHER_REGION_COUNT,
  WeatherRule,
} from '../../src/sim/constants';
import {
  SAVE_MAGIC,
  SAVE_VERSION,
  SaveCorruptionError,
  SaveFormatError,
} from '../../src/sim/save/format';
import {
  migrateSavePayload,
  SAVE_MIGRATIONS,
  type SaveMigration,
} from '../../src/sim/save/migrations';
import { decode } from '@msgpack/msgpack';
import { unzlibSync } from 'fflate';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, World } from '../../src/sim/World';

const GAME_VERSION = '0.1.0';

const TEST_MAP_SIZE = 128;

function playedWorld(): { world: World; queue: CommandQueue } {
  const world = World.create({
    seed: 987_654,
    difficulty: Difficulty.Hard,
    climate: MapClimate.Temperate,
    mapSize: TEST_MAP_SIZE,
    companyName: 'Nordbahn',
    companyColorIndex: 2,
  });
  const queue = new CommandQueue();
  queue.enqueue({ kind: CommandKind.TakeLoan, amountCt: LOAN_STEP_CT * 5 }, 0);
  queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Nordbahn AG' }, 100);
  queue.enqueue({ kind: CommandKind.RepayLoan, amountCt: LOAN_STEP_CT }, TICKS_PER_MONTH + 10);

  for (let i = 0; i < TICKS_PER_MONTH + 50; i++) world.step(queue, null);
  return { world, queue };
}

describe('save round trip', () => {
  it('buys no town measure, which is what the v31 slot remap rests on', () => {
    // SPEC2 M20 bundle 3 grew `TOWN_MEASURE_COUNT` from five to seven, and the
    // cooldown list is company-major with that count as its stride - so
    // `v30_to_v31` re-lays it. A list THIS build wrote, wrapped in a version 30
    // container by the corpus trick, cannot be told apart from a real version
    // 30 one and would be re-laid a second time. The migration's comment says
    // the case does not arise because every list that reaches it through these
    // doors is empty; this is that claim, asserted rather than assumed.
    const { world } = playedWorld();
    for (const town of world.towns) {
      expect(town.measureReadyTick.length, town.name).toBe(0);
      expect(town.noiseBarrierUntilTick.length, town.name).toBe(0);
    }
  });

  it('restores a bit-identical world', () => {
    const { world, queue } = playedWorld();
    const before = hashWorld(world);

    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));

    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.world.tick).toBe(world.tick);
    expect(loaded.world.company).toEqual(world.company);
    expect(loaded.gameVersion).toBe(GAME_VERSION);
  });

  it('restores the command log and its execution position', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));

    expect(loaded.queue.log).toHaveLength(queue.log.length);
    expect(loaded.queue.executedCount).toBe(queue.executedCount);
    expect(loaded.queue.pendingCount).toBe(queue.pendingCount);
  });

  it('keeps running identically after a load', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));

    for (let i = 0; i < TICKS_PER_MONTH; i++) {
      world.step(queue, null);
      loaded.world.step(loaded.queue, null);
    }
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });

  it('compresses the tile layers substantially', () => {
    const { world, queue } = playedWorld();
    const bytes = encodeSave(world, queue, GAME_VERSION);

    const tiles = TEST_MAP_SIZE * TEST_MAP_SIZE;
    const corners = (TEST_MAP_SIZE + 1) * (TEST_MAP_SIZE + 1);
    // cornerHeight + 4 single-byte layers + 2 two-byte layers
    const rawLayerBytes = corners + tiles * 4 + tiles * 4;

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(rawLayerBytes / 4);
  });
});

describe('save validation', () => {
  function pack(payload: Record<string, unknown>): Uint8Array {
    return zlibSync(encode(payload));
  }

  it('rejects a foreign magic', () => {
    expect(() => decodeSave(pack({ magic: 'XXXX', saveVersion: SAVE_VERSION }))).toThrow(
      SaveFormatError,
    );
  });

  it('rejects data that is not a save file at all', () => {
    expect(() => decodeSave(new Uint8Array([1, 2, 3, 4]))).toThrow(SaveFormatError);
  });

  it('names the field that is broken, in the message and structurally', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));
    const broken = {
      magic: SAVE_MAGIC,
      saveVersion: SAVE_VERSION,
      gameVersion: GAME_VERSION,
      seed: loaded.world.seed,
      tick: loaded.world.tick,
      worldDigest: '',
      state: { ...loaded.world.toData(), rng: [1, 2, 3] },
      commandLog: [],
      commandsExecuted: 0,
    };
    let thrown: unknown = null;
    try {
      decodeSave(pack(broken));
    } catch (error) {
      thrown = error;
    }
    // The codec's error is structured: the failing field is a property, not
    // just a substring of the message, so the interface can say which SECTION
    // of the save died instead of refusing the whole file with a shrug.
    expect(thrown).toBeInstanceOf(SaveFormatError);
    expect((thrown as SaveFormatError).message).toMatch(/save\.state\.rng/);
    expect((thrown as SaveFormatError).path).toBe('save.state.rng');
    expect(thrown).not.toBeInstanceOf(SaveCorruptionError);
  });

  it('refuses a save whose header and state disagree', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));
    const broken = {
      magic: SAVE_MAGIC,
      saveVersion: SAVE_VERSION,
      gameVersion: GAME_VERSION,
      seed: loaded.world.seed,
      tick: loaded.world.tick + 1,
      worldDigest: '',
      state: loaded.world.toData(),
      commandLog: [],
      commandsExecuted: 0,
    };
    expect(() => decodeSave(pack(broken))).toThrow(/disagrees/);
  });
});

describe('the world digest (v23)', () => {
  function unpack(bytes: Uint8Array): Record<string, unknown> {
    return decode(unzlibSync(bytes)) as Record<string, unknown>;
  }

  it('is embedded in the container at encode time', () => {
    const { world, queue } = playedWorld();
    const expected = hashWorld(world);
    const payload = unpack(encodeSave(world, queue, GAME_VERSION));

    expect(payload['worldDigest']).toBe(expected);
    // The digest sits in the CONTAINER, never inside the hashed state - a
    // digest that contributed to itself could not exist (Fehlerkatalog 2).
    expect(payload['state']).not.toHaveProperty('worldDigest');
  });

  it('reports a tampered state as corruption, not as a format error', () => {
    const { world, queue } = playedWorld();
    const payload = unpack(encodeSave(world, queue, GAME_VERSION));

    // A tampered byte that stays type-correct sails through validation; the
    // digest is the only thing that can catch it.
    const state = payload['state'] as Record<string, unknown>;
    const companies = state['companies'] as Array<Record<string, unknown>>;
    companies[0]!['cashCt'] = (companies[0]!['cashCt'] as number) + 1;

    let thrown: unknown = null;
    try {
      decodeSave(zlibSync(encode(payload)));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SaveCorruptionError);
    expect((thrown as SaveCorruptionError).path).toBe('save.worldDigest');
  });

  it('reports a bit-flipped file as corruption', () => {
    const { world, queue } = playedWorld();
    const bytes = encodeSave(world, queue, GAME_VERSION);
    bytes[bytes.length >> 1] = bytes[bytes.length >> 1]! ^ 0xff;

    expect(() => decodeSave(bytes)).toThrow(SaveCorruptionError);
  });

  it('loads an intact save with its digest verified', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });

  it('does not judge a MIGRATED save by its old digest', () => {
    // A digest fingerprints the state as the WRITING build hashed it. After a
    // migration neither half survives - the state was rewritten and hashWorld
    // may cover more than the old function did - so an old save's digest
    // rides along unverified (D-131's version-pinning argument), instead of
    // every hashed-state migration refusing every healthy old save.
    const { world, queue } = playedWorld();
    const payload = unpack(encodeSave(world, queue, GAME_VERSION));
    payload['saveVersion'] = SAVE_VERSION - 1;
    payload['worldDigest'] = 'ffffffffffffffff';

    const loaded = decodeSave(zlibSync(encode(payload)));
    expect(hashWorld(loaded.world)).toBe(hashWorld(world));
  });
});

describe('save migrations', () => {
  const registry: ReadonlyMap<number, SaveMigration> = new Map<number, SaveMigration>([
    [1, (payload) => ({ ...payload, steppedTo2: true })],
    [2, (payload) => ({ ...payload, steppedTo3: true })],
  ]);

  it('applies every step in order and stamps the new version', () => {
    const result = migrateSavePayload({ magic: SAVE_MAGIC, saveVersion: 1 }, 1, 3, registry);
    expect(result['steppedTo2']).toBe(true);
    expect(result['steppedTo3']).toBe(true);
    expect(result['saveVersion']).toBe(3);
  });

  it('does nothing when the payload is already current', () => {
    const payload = { magic: SAVE_MAGIC, saveVersion: 3 };
    expect(migrateSavePayload(payload, 3, 3, registry)).toEqual(payload);
  });

  it('refuses saves from a newer build', () => {
    expect(() => migrateSavePayload({ saveVersion: 9 }, 9, 3, registry)).toThrow(
      /newer version of the game/,
    );
  });

  it('fails loudly when a step is missing', () => {
    expect(() => migrateSavePayload({ saveVersion: 1 }, 1, 3, new Map())).toThrow(
      /No migration registered from save format 1/,
    );
  });

  it('pins the current save version', () => {
    // Bumping SAVE_VERSION has to be a conscious act, because from the first
    // released build onwards it also requires a migration. 34 is M23's single
    // bump (SPEC2 Z5): the two era rules of E-15 own it - `startYear`, the
    // calendar year tick 0 falls in, and `endless`, whether the clock stops
    // after PLAYABLE_YEARS at all. The ~60 pre-1950 vehicle generations of the
    // same milestone need no migration of their own, for the reason v33's five
    // command kinds did not: a spec id is a number in a consist, and a save
    // written by an older build cannot contain one that did not exist (D-131,
    // E-11). Later M23 bundles extend this migration in place and add no
    // numbers.
    //
    // 33 was M22's: the scenario workshop - the `editorMode` world rule, which
    // suspends the funds and the ownership check and therefore decides whether
    // a COMMAND is accepted. 32 was M21's: the century curve of E-09 - the
    // `economy` world rule plus the table it decides. 31 was M20's: the
    // physical town growth of section 13.2, spent on the month's own street
    // budget.
    expect(SAVE_VERSION).toBe(34);
  });

  it('has a real migration for every step from version 2 on', () => {
    for (let version = 2; version < SAVE_VERSION; version++) {
      expect(SAVE_MIGRATIONS.get(version), `missing migration ${version}`).toBeDefined();
    }
  });
});

describe('the registered migrations', () => {
  /** A version 2 payload: a world with a map, but no stations and no rails. */
  function version2(): Record<string, unknown> {
    return {
      magic: SAVE_MAGIC,
      saveVersion: 2,
      state: {
        mapSize: 64,
        map: { terrain: new Uint8Array(64 * 64) },
        towns: [],
        industries: [],
        vehicles: [],
        company: {},
      },
    };
  }

  it('carries a pre-rail save all the way to the current format', () => {
    const migrated = migrateSavePayload(version2(), 2, SAVE_VERSION);
    const state = migrated['state'] as Record<string, unknown>;
    const map = state['map'] as Record<string, unknown>;

    expect(state['stations']).toEqual([]);
    expect(map['trackBits']).toEqual(new Uint8Array(64 * 64));
    expect(map['railType']).toEqual(new Uint8Array(64 * 64));
    expect(map['structure']).toEqual(new Uint8Array(64 * 64));
    expect(map['signal']).toEqual(new Uint8Array(64 * 64));
    // v18 turned the one company into a list, and the single company of a
    // version 2 world is the player at index 0.
    const companies = state['companies'] as Array<Record<string, unknown>>;
    expect(companies.length).toBe(1);
    expect(companies[0]!['id']).toBe(0);
    expect(companies[0]!['bankrupt']).toBe(false);
    expect(map['owner']).toEqual(new Uint8Array(64 * 64).fill(TILE_PUBLIC));
    // v23 added the container digest. A pre-v23 save carries none and the
    // migration cannot invent one, so the honest value is the empty string.
    expect(migrated['worldDigest']).toBe('');
    // v24 added the waypoint layer of M11; a pre-M11 world had no markers.
    expect(map['waypoint']).toEqual(new Uint8Array(64 * 64));
    // ...and the lines of 12.2, which a pre-M11 world could not have. The
    // company-wide renewal flag went with them (per-line since M11).
    expect(state['lines']).toEqual([]);
    expect('autoRenew' in companies[0]!).toBe(false);
    // v26 made the 8.4 route costs world rules (M15). A world driven by
    // pathfinders that had none of them is a world with all three switched
    // off - any other default would re-route its whole fleet on the first
    // departure - and its road traffic layer is empty, because nothing ever
    // recorded a vehicle entering a tile.
    expect(state['occupancyPenalty']).toBe(false);
    expect(state['signalPenalty']).toBe(false);
    expect(state['roadCongestion']).toBe(false);
    expect(map['congestion']).toEqual(new Uint8Array(64 * 64));
    expect(migrated['saveVersion']).toBe(SAVE_VERSION);
  });

  it('gives a v23 order the 12.1 defaults and keeps what is already set', () => {
    const payload = {
      magic: SAVE_MAGIC,
      saveVersion: 23,
      state: {
        mapSize: 64,
        map: { terrain: new Uint8Array(64 * 64) },
        companies: [{ id: 0, autoRenew: true }],
        ai: [],
        vehicles: [
          {
            id: 0,
            specId: 200,
            orders: [
              // The M5 shape a real v23 save carries...
              { target: 0, targetId: 1, load: 1, unload: 0 },
              // ...and a full record, as the corpus writes when it wraps a
              // CURRENT state in an old container: values must survive.
              {
                target: 2,
                targetId: 99,
                load: 3,
                unload: 2,
                refitTo: 4,
                waitTicks: 600,
                condKind: 1,
                condComparator: 5,
                condValue: 80,
                condJumpTo: 0,
              },
            ],
          },
        ],
      },
    };
    const migrated = migrateSavePayload(payload, 23, 24);
    const state = migrated['state'] as Record<string, unknown>;
    const vehicles = state['vehicles'] as Record<string, unknown>[];
    const orders = vehicles[0]!['orders'] as Record<string, unknown>[];

    expect(orders[0]).toEqual({
      target: 0,
      targetId: 1,
      load: 1,
      unload: 0,
      refitTo: -1,
      waitTicks: 0,
      condKind: -1,
      condComparator: 0,
      condValue: 0,
      condJumpTo: 0,
    });
    expect(orders[1]!['refitTo']).toBe(4);
    expect(orders[1]!['waitTicks']).toBe(600);
    expect(orders[1]!['condKind']).toBe(1);
    const map = state['map'] as Record<string, unknown>;
    expect(map['waypoint']).toEqual(new Uint8Array(64 * 64));

    // Stage B of the same bump: a v23 world had no lines, its vehicles ran no
    // line, and the company-wide renewal flag is gone - a player's save has
    // no line to map it onto (the migration's own comment says why).
    expect(state['lines']).toEqual([]);
    expect(vehicles[0]!['lineId']).toBe(-1);
    const companies = state['companies'] as Record<string, unknown>[];
    expect('autoRenew' in companies[0]!).toBe(false);
  });

  it("turns an AI competitor's private lines into real line entities (E-06)", () => {
    const order = (targetId: number): Record<string, unknown> => ({
      target: 0,
      targetId,
      load: 1,
      unload: 0,
    });
    const payload = {
      magic: SAVE_MAGIC,
      saveVersion: 23,
      state: {
        mapSize: 64,
        map: { terrain: new Uint8Array(64 * 64) },
        companies: [
          { id: 0, autoRenew: false },
          { id: 1, autoRenew: true },
        ],
        ai: [
          {
            companyId: 1,
            personality: 1,
            nextDecisionTick: 500,
            lastBuildTick: 0,
            lines: [
              {
                fromStationId: 0,
                toStationId: 1,
                depotTile: 70,
                rail: false,
                specIds: [200],
                cargo: 0,
                builtTick: 100,
                vehicleIds: [0],
                reviewTick: 6_000,
                earnedAtReviewCt: 12_345,
              },
            ],
            project: {
              stage: 2,
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
              lineIndex: 0,
            },
          },
        ],
        vehicles: [{ id: 0, specId: 200, orders: [order(0), order(1)] }],
      },
    };

    const migrated = migrateSavePayload(payload, 23, 24);
    const state = migrated['state'] as Record<string, unknown>;

    // The private line became THE line: entity 0, owned by company 1, with
    // the schedule its vehicle was running and the old company flag on it.
    const lines = state['lines'] as Record<string, unknown>[];
    expect(lines).toHaveLength(1);
    expect(lines[0]!['id']).toBe(0);
    expect(lines[0]!['ownerId']).toBe(1);
    expect(lines[0]!['autoRenew']).toBe(true);
    const lineOrders = lines[0]!['orders'] as Record<string, unknown>[];
    expect(lineOrders).toHaveLength(2);
    expect(lineOrders[0]!['targetId']).toBe(0);
    expect(lineOrders[0]!['refitTo']).toBe(-1);

    // Its vehicle is ASSIGNED: line id set, private list cleared.
    const vehicles = state['vehicles'] as Record<string, unknown>[];
    expect(vehicles[0]!['lineId']).toBe(0);
    expect(vehicles[0]!['orders']).toEqual([]);

    // The AI keeps only its judgement baseline, and the reinforcement
    // project now names the entity id.
    const ai = state['ai'] as Record<string, unknown>[];
    expect('lines' in ai[0]!).toBe(false);
    expect(ai[0]!['reviews']).toEqual([{ lineId: 0, reviewTick: 6_000, earnedAtReviewCt: 12_345 }]);
    const project = ai[0]!['project'] as Record<string, unknown>;
    expect(project['lineId']).toBe(0);
    expect('lineIndex' in project).toBe(false);
  });

  it('enters a v25 world with all three 8.4 rules off, and keeps a rule already set', () => {
    // The M15 bump. A world driven by pathfinders that had none of the terms
    // is a world with all of them off - and a state that already carries them
    // (the corpus wraps a CURRENT state in an old container) must not be
    // flattened. A payload with no map section is passed through rather than
    // rejected here; the decoder is what refuses it.
    const fresh = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 25, state: { mapSize: 64 } },
      25,
      26,
    );
    const freshState = fresh['state'] as Record<string, unknown>;
    expect(freshState['occupancyPenalty']).toBe(false);
    expect(freshState['signalPenalty']).toBe(false);
    expect(freshState['roadCongestion']).toBe(false);
    expect(freshState['map']).toBeUndefined();
    expect(fresh['saveVersion']).toBe(26);

    // With a map, the congestion layer of 8.4 arrives zeroed: a world with no
    // congestion term recorded no traffic, and zero is what it knew.
    const withMap = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 25,
        state: { mapSize: 64, map: { terrain: new Uint8Array(64 * 64) } },
      },
      25,
      26,
    );
    const layers = (withMap['state'] as Record<string, unknown>)['map'] as Record<string, unknown>;
    expect(layers['congestion']).toEqual(new Uint8Array(64 * 64));

    const played = new Uint8Array(64 * 64);
    played[17] = 96;
    const carried = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 25,
        state: {
          mapSize: 64,
          occupancyPenalty: true,
          signalPenalty: true,
          roadCongestion: true,
          map: { terrain: new Uint8Array(64 * 64), congestion: played },
        },
      },
      25,
      26,
    );
    const carriedState = carried['state'] as Record<string, unknown>;
    expect(carriedState['occupancyPenalty']).toBe(true);
    expect(carriedState['signalPenalty']).toBe(true);
    expect(carriedState['roadCongestion']).toBe(true);
    expect((carriedState['map'] as Record<string, unknown>)['congestion']).toBe(played);
  });

  it('gives a v26 save an empty ring and an untrimmed log, and keeps a real one', () => {
    // M16's bump is CONTAINER-only, like v23: the ring, the log base and the
    // replay claim are history, not state. A version 26 world recorded no
    // checkpoints, so it gets none - and its log is complete from tick 0,
    // which is what keeps it replayable by re-simulating from the genesis its
    // own parameters describe.
    const state = { mapSize: 64 };
    const fresh = migrateSavePayload({ magic: SAVE_MAGIC, saveVersion: 26, state }, 26, 27);
    expect(fresh['logBaseTick']).toBe(0);
    expect(fresh['checkpoints']).toEqual([]);
    expect(fresh['replay']).toBeNull();
    expect(fresh['saveVersion']).toBe(27);
    // Same object, not a copy: the migration has no business even looking at
    // the state it must not change.
    expect(fresh['state']).toBe(state);

    // The corpus trick - a CURRENT container wrapped in an old version - must
    // not flatten a real ring back to empty. What it DOES get, since M16's
    // correction bundle extended this migration in place, is the empty
    // schedule digest on every mark: the recorded fact "this mark committed to
    // no command times", which costs the exactness claim and nothing else
    // (D-191). A digest invented from the log the file carries would certify
    // whatever a tamper had already done.
    const ring = [{ tick: 0, worldDigest: '0123456789abcdef', payload: new Uint8Array([7]) }];
    const carried = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 26,
        state,
        logBaseTick: 72_000,
        checkpoints: ring,
        replay: { finalTick: 80_000, finalHash: 'fedcba9876543210' },
      },
      26,
      27,
    );
    expect(carried['logBaseTick']).toBe(72_000);
    expect(carried['checkpoints']).toEqual([{ ...ring[0]!, scheduleDigest: '' }]);
    expect(carried['replay']).toEqual({
      finalTick: 80_000,
      finalHash: 'fedcba9876543210',
      scheduleDigest: '',
    });
  });

  it('enters a v28 world with no weather and an all-clear sky, and keeps a real one', () => {
    // M18's bump. A world played before M18 had no weather at all, so the rule
    // enters as OFF and the field as all-clear - and the field is not an
    // invention: all-clear is exactly what a world with the rule off holds for
    // ever, because the daily hook returns on its first line and never writes
    // a cell.
    const fresh = migrateSavePayload(
      { magic: SAVE_MAGIC, saveVersion: 28, state: { mapSize: 64 } },
      28,
      29,
    );
    const freshState = fresh['state'] as Record<string, unknown>;
    expect(freshState['weather']).toBe(WeatherRule.Off);
    expect(freshState['weatherField']).toEqual(new Uint8Array(WEATHER_REGION_COUNT));
    expect(fresh['saveVersion']).toBe(29);

    // The corpus trick - a CURRENT state wrapped in an old version header -
    // must not flatten a real rule back to off or a real sky back to clear.
    const played = new Uint8Array(WEATHER_REGION_COUNT);
    played[9] = 2;
    const carried = migrateSavePayload(
      {
        magic: SAVE_MAGIC,
        saveVersion: 28,
        state: { mapSize: 64, weather: WeatherRule.Harsh, weatherField: played },
      },
      28,
      29,
    );
    const carriedState = carried['state'] as Record<string, unknown>;
    expect(carriedState['weather']).toBe(WeatherRule.Harsh);
    expect(carriedState['weatherField']).toBe(played);
  });

  it('migrates a v28 save to v29 into the world a fresh v29 save records', () => {
    // What "a v28 save loads and behaves exactly as before" is worth proving,
    // stated as the only thing that can be proved from inside one build: the
    // migrated world is the SAME world a v29 encoder writes for the identical
    // game. The rule and the field the migration enters are therefore not a
    // guess about the past - they are what this build calls a world with no
    // weather.
    //
    // The DIGEST of that world did move, once, when the rule and the field
    // joined `hashWorld` - the M15 event with a written protocol (D-137,
    // D-130). The corpus is the other half of this proof and holds it across
    // builds: eight fixtures written by eight different versions still decode
    // to ONE world.
    const { world, queue } = playedWorld();
    const current = world.toData();
    const v28State: Record<string, unknown> = { ...current };
    delete v28State['weather'];
    delete v28State['weatherField'];

    const v28 = {
      magic: SAVE_MAGIC,
      saveVersion: 28,
      gameVersion: GAME_VERSION,
      seed: world.seed,
      tick: world.tick,
      worldDigest: '',
      state: v28State,
      commandLog: queue.log,
      commandsExecuted: queue.executedCount,
      logBaseTick: 0,
      checkpoints: [],
      replay: null,
      scenario: null,
    };

    const migrated = decodeSave(zlibSync(encode(v28)));
    expect(migrated.world.weather).toBe(WeatherRule.Off);
    expect(hashWorld(migrated.world)).toBe(hashWorld(world));
  });

  it('migrates a v26 save to v27 without moving the world hash', () => {
    // The same proof v23 needed: a container-only bump must not change what a
    // world MEANS. A version 26 container around today's state is exactly what
    // the v26 encoder wrote - same fields, same order, minus the three the
    // checkpoint ring added.
    const { world, queue } = playedWorld();
    const before = hashWorld(world);

    const v26 = {
      magic: SAVE_MAGIC,
      saveVersion: 26,
      gameVersion: GAME_VERSION,
      seed: world.seed,
      tick: world.tick,
      worldDigest: before,
      state: world.toData(),
      commandLog: queue.log,
      commandsExecuted: queue.executedCount,
    };
    const loaded = decodeSave(zlibSync(encode(v26)));

    expect(hashWorld(loaded.world)).toBe(before);
    expect(loaded.ring.size).toBe(0);
    expect(loaded.queue.baseTick).toBe(0);
    expect(loaded.replay).toBeNull();
    expect(loaded.saveVersion).toBe(26);
  });

  it('migrates a v22 save to v23 without moving the world hash', () => {
    // Fehlerkatalog 2: the digest goes into the CONTAINER; the hashed world
    // state must not change meaning. A version 22 container around today's
    // state is exactly what the v22 encoder wrote - same fields, same order,
    // minus the digest - so decoding it exercises the real migration path,
    // and hash identity proves the migration is container-shape only.
    const { world, queue } = playedWorld();
    const before = hashWorld(world);

    const v22 = {
      magic: SAVE_MAGIC,
      saveVersion: 22,
      gameVersion: GAME_VERSION,
      seed: world.seed,
      tick: world.tick,
      state: world.toData(),
      commandLog: queue.log,
      commandsExecuted: queue.executedCount,
    };
    const loaded = decodeSave(zlibSync(encode(v22)));

    expect(hashWorld(loaded.world)).toBe(before);
  });

  it('passes the state through the v22 to v23 step untouched', () => {
    const state = { mapSize: 64 };
    const payload: Record<string, unknown> = { magic: SAVE_MAGIC, saveVersion: 22, state };
    const migrated = migrateSavePayload(payload, 22, 23);

    // Same object, not a copy: the migration has no business even looking at
    // the state it must not change.
    expect(migrated['state']).toBe(state);
    expect(migrated['worldDigest']).toBe('');
    expect(migrated['saveVersion']).toBe(23);
  });

  it('gives every vehicle of a version 4 world an empty composition', () => {
    const payload = {
      magic: SAVE_MAGIC,
      saveVersion: 4,
      state: { mapSize: 64, vehicles: [{ id: 0, specId: 200 }] },
    };
    const migrated = migrateSavePayload(payload, 4, 5);
    const vehicles = (migrated['state'] as Record<string, unknown>)['vehicles'] as Record<
      string,
      unknown
    >[];

    expect(vehicles[0]!['consist']).toEqual([]);
    expect(vehicles[0]!['routeRemainingM']).toBe(0);
    expect(vehicles[0]!['specId']).toBe(200);
  });
});
