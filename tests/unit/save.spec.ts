import { encode } from '@msgpack/msgpack';
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind } from '../../src/sim/commands/types';
import { Difficulty, LOAN_STEP_CT, MapClimate, TICKS_PER_MONTH } from '../../src/sim/constants';
import { SAVE_MAGIC, SAVE_VERSION, SaveFormatError } from '../../src/sim/save/format';
import {
  migrateSavePayload,
  SAVE_MIGRATIONS,
  type SaveMigration,
} from '../../src/sim/save/migrations';
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

  it('names the field that is broken', () => {
    const { world, queue } = playedWorld();
    const loaded = decodeSave(encodeSave(world, queue, GAME_VERSION));
    const broken = {
      magic: SAVE_MAGIC,
      saveVersion: SAVE_VERSION,
      gameVersion: GAME_VERSION,
      seed: loaded.world.seed,
      tick: loaded.world.tick,
      state: { ...loaded.world.toData(), rng: [1, 2, 3] },
      commandLog: [],
      commandsExecuted: 0,
    };
    expect(() => decodeSave(pack(broken))).toThrow(/save\.state\.rng/);
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
      state: loaded.world.toData(),
      commandLog: [],
      commandsExecuted: 0,
    };
    expect(() => decodeSave(pack(broken))).toThrow(/disagrees/);
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
    // released build onwards it also requires a migration.
    expect(SAVE_VERSION).toBe(16);
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
    expect((state['company'] as Record<string, unknown>)['bankrupt']).toBe(false);
    expect(migrated['saveVersion']).toBe(SAVE_VERSION);
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
