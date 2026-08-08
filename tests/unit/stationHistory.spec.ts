import { decode, encode } from '@msgpack/msgpack';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addCargo } from '../../src/sim/cargo/stack';
import { depositAtStation } from '../../src/sim/cargo/routing';
import { Cargo, CARGO_COUNT } from '../../src/sim/cargo/types';
import {
  STATION_CARGO_CAPACITY,
  STATION_HISTORY_MONTHS,
  TICKS_PER_MONTH,
} from '../../src/sim/constants';
import { SAVE_VERSION } from '../../src/sim/save/format';
import { SAVE_MIGRATIONS } from '../../src/sim/save/migrations';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import {
  historySlot,
  rollStationHistories,
  recordStationCargo,
  STATION_HISTORY_FIELD_COUNT,
  STATION_HISTORY_SIZE,
  STATION_MONTH_COUNTER_SIZE,
  StationHistoryField,
} from '../../src/sim/station/history';
import { hashWorld } from '../../src/sim/World';
import { buildTransferNetwork, runTicks } from '../helpers/transferNetwork';

/**
 * The per-station cargo-history ring of SPEC2 M14 - the milestone's one
 * SAVE_VERSION bump (v25, Z5). The tests hold the four promises the bundle
 * makes: the ring is written by the world's own monthly hook from real
 * traffic, it wraps after twelve months, it survives a save round trip and
 * is covered by the world digest, and a v24 save arrives with the zeroed
 * ring a pre-M14 world honestly had.
 */

const GAME_VERSION = 'test';

/** The save format the ring was introduced in (M14's one Z5 bump). */
const RING_SAVE_VERSION = 25;

/** Ring value of station `station` for (monthsAgo, cargo, field). */
function ringAt(
  station: { readonly history: Int32Array; readonly historyCursor: number },
  monthsAgo: number,
  cargo: number,
  field: StationHistoryField,
): number {
  return station.history[historySlot(station, monthsAgo, cargo, field)]!;
}

describe('the ring on the three-line transfer network', () => {
  it('records collections and deliveries through the monthly hook', () => {
    const network = buildTransferNetwork();
    const world = network.world;

    // Two full months: the first fills, the monthly hook closes it, the
    // second proves the accumulators start over.
    runTicks(network, 2 * TICKS_PER_MONTH + 50);

    // Passengers were COLLECTED at the interchange's feeder end - the ring
    // of station A must show them in a completed month.
    const a = world.stations[network.stations.a]!;
    let collectedA = 0;
    for (let monthsAgo = 0; monthsAgo < STATION_HISTORY_MONTHS; monthsAgo++) {
      collectedA += ringAt(a, monthsAgo, Cargo.Passengers, StationHistoryField.Collected);
    }
    expect(collectedA).toBeGreaterThan(0);

    // And somewhere in the network they were DELIVERED.
    let delivered = 0;
    for (const station of world.stations) {
      for (let monthsAgo = 0; monthsAgo < STATION_HISTORY_MONTHS; monthsAgo++) {
        delivered += ringAt(station, monthsAgo, Cargo.Passengers, StationHistoryField.Delivered);
      }
    }
    expect(delivered).toBeGreaterThan(0);

    // Two month boundaries have passed: the cursor moved exactly twice.
    expect(a.historyCursor).toBe(2);
  });

  it('books cargo turned away at a full station as expired', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    const station = world.stations[network.stations.a]!;

    addCargo(station.waiting, {
      cargo: Cargo.Passengers,
      amount: STATION_CARGO_CAPACITY,
      createdTick: 0,
      originStationId: station.id,
      destinationStationId: network.stations.b,
      paidFromX: station.x,
      paidFromY: station.y,
    });
    const taken = depositAtStation(world, station, Cargo.Passengers, 50);

    expect(taken).toBe(0);
    expect(
      station.monthCounters[
        Cargo.Passengers * STATION_HISTORY_FIELD_COUNT + StationHistoryField.Expired
      ],
    ).toBe(50);
  });
});

describe('the ring mechanics', () => {
  it('rounds the running month into the slot and clears the accumulators', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    const station = world.stations[0]!;

    recordStationCargo(station, StationHistoryField.Collected, Cargo.Passengers, 2.6);
    rollStationHistories(world);

    expect(ringAt(station, 0, Cargo.Passengers, StationHistoryField.Collected)).toBe(3);
    expect(
      station.monthCounters[
        Cargo.Passengers * STATION_HISTORY_FIELD_COUNT + StationHistoryField.Collected
      ],
    ).toBe(0);
    expect(station.historyCursor).toBe(1);
  });

  it('wraps after twelve months, overwriting the oldest', () => {
    const network = buildTransferNetwork();
    const world = network.world;
    const station = world.stations[0]!;

    // Thirteen months, each collecting its own month number of coal.
    for (let month = 1; month <= STATION_HISTORY_MONTHS + 1; month++) {
      recordStationCargo(station, StationHistoryField.Collected, Cargo.Coal, month);
      rollStationHistories(world);
    }

    // Newest completed month is 13, the oldest surviving one is 2 - month 1
    // fell off the ring exactly as a thirteenth month must push it out.
    expect(ringAt(station, 0, Cargo.Coal, StationHistoryField.Collected)).toBe(
      STATION_HISTORY_MONTHS + 1,
    );
    expect(
      ringAt(station, STATION_HISTORY_MONTHS - 1, Cargo.Coal, StationHistoryField.Collected),
    ).toBe(2);
    // Thirteen rolls moved the cursor once around and one further.
    expect(station.historyCursor).toBe(1);
  });
});

describe('the ring in the save (from v25 on)', () => {
  it('travels in every format from the one that introduced it', () => {
    // M14's one bump (SPEC2 Z5): the cargo-history ring owns v25. The current
    // SAVE_VERSION is pinned once, in save.spec.ts - what belongs here is that
    // the ring exists from its own version onwards and keeps its shape.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(RING_SAVE_VERSION);
    expect(SAVE_MIGRATIONS.has(RING_SAVE_VERSION - 1)).toBe(true);
    expect(STATION_HISTORY_SIZE).toBe(
      STATION_HISTORY_MONTHS * CARGO_COUNT * STATION_HISTORY_FIELD_COUNT,
    );
  });

  it('survives a save round trip bit for bit', () => {
    const network = buildTransferNetwork();
    runTicks(network, TICKS_PER_MONTH + 50);
    const before = hashWorld(network.world);

    const loaded = decodeSave(encodeSave(network.world, network.queue, GAME_VERSION));

    expect(hashWorld(loaded.world)).toBe(before);
    const original = network.world.stations[0]!;
    const restored = loaded.world.stations[0]!;
    expect([...restored.history]).toEqual([...original.history]);
    expect(restored.historyCursor).toBe(original.historyCursor);
    expect([...restored.monthCounters]).toEqual([...original.monthCounters]);
    // The typed blocks are rebuilt, never aliased into the decoded payload.
    expect(restored.history).toBeInstanceOf(Int32Array);
    expect(restored.monthCounters).toBeInstanceOf(Float64Array);
  });

  it('is covered by the world digest, cursor and accumulators included', () => {
    const network = buildTransferNetwork();
    runTicks(network, 100);
    const station = network.world.stations[0]!;
    const before = hashWorld(network.world);

    station.history[0] = station.history[0]! + 1;
    const bentRing = hashWorld(network.world);
    station.history[0] = station.history[0]! - 1;

    station.historyCursor = (station.historyCursor + 1) % STATION_HISTORY_MONTHS;
    const bentCursor = hashWorld(network.world);
    station.historyCursor =
      (station.historyCursor + STATION_HISTORY_MONTHS - 1) % STATION_HISTORY_MONTHS;

    station.monthCounters[0] = station.monthCounters[0]! + 0.5;
    const bentCounters = hashWorld(network.world);
    station.monthCounters[0] = station.monthCounters[0]! - 0.5;

    expect(bentRing).not.toBe(before);
    expect(bentCursor).not.toBe(before);
    expect(bentCounters).not.toBe(before);
    expect(hashWorld(network.world)).toBe(before);
  });

  it('gives a v24 station the zeroed ring a pre-M14 world had', () => {
    const network = buildTransferNetwork();
    runTicks(network, TICKS_PER_MONTH + 50);

    // A v24 container around the same played game: the fields M14 added are
    // stripped, exactly as the v24 encoder never wrote them.
    const payload = decode(
      unzlibSync(encodeSave(network.world, network.queue, GAME_VERSION)),
    ) as Record<string, unknown>;
    payload['saveVersion'] = 24;
    const state = payload['state'] as Record<string, unknown>;
    state['stations'] = (state['stations'] as Record<string, unknown>[]).map((station) => {
      const stripped = { ...station };
      delete stripped['history'];
      delete stripped['historyCursor'];
      delete stripped['monthCounters'];
      return stripped;
    });

    const loaded = decodeSave(zlibSync(encode(payload)));
    for (const station of loaded.world.stations) {
      expect(station.history.length).toBe(STATION_HISTORY_SIZE);
      expect([...station.history].every((slot) => slot === 0)).toBe(true);
      expect(station.historyCursor).toBe(0);
      expect(station.monthCounters.length).toBe(STATION_MONTH_COUNTER_SIZE);
      expect([...station.monthCounters].every((counter) => counter === 0)).toBe(true);
    }
  });

  it('keeps real months when a current state rides an old container', () => {
    // The corpus trick: a CURRENT state wrapped in a v24 container must not
    // have its recorded months flattened back to zero by the migration.
    const network = buildTransferNetwork();
    runTicks(network, TICKS_PER_MONTH + 50);
    const before = hashWorld(network.world);

    const payload = decode(
      unzlibSync(encodeSave(network.world, network.queue, GAME_VERSION)),
    ) as Record<string, unknown>;
    payload['saveVersion'] = 24;
    payload['worldDigest'] = '';

    const loaded = decodeSave(zlibSync(encode(payload)));
    expect(hashWorld(loaded.world)).toBe(before);
  });
});
