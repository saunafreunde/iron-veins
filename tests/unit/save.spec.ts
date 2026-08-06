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
    // released build onwards it also requires a migration. 24 is M11's single
    // bump (SPEC2 Z5); the milestone's later stages extend the v24 migration
    // rather than adding numbers.
    expect(SAVE_VERSION).toBe(24);
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
    expect(migrated['saveVersion']).toBe(SAVE_VERSION);
  });

  it('gives a v23 order the 12.1 defaults and keeps what is already set', () => {
    const payload = {
      magic: SAVE_MAGIC,
      saveVersion: 23,
      state: {
        mapSize: 64,
        map: { terrain: new Uint8Array(64 * 64) },
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
