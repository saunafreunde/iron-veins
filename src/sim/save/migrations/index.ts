import { SaveFormatError, SAVE_VERSION } from '../format';

/**
 * A migration rewrites a decoded save payload from version N to version N+1.
 * It works on the raw decoded object, not on typed state, because the shape of
 * an old save is by definition not the current shape.
 */
export type SaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

/** The `state` sub-object of a payload, or an empty one if it is missing. */
function state(payload: Record<string, unknown>): Record<string, unknown> {
  const value = payload['state'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveFormatError('save.state: expected an object');
  }
  return value as Record<string, unknown>;
}

function tileCount(payload: Record<string, unknown>): number {
  const size = state(payload)['mapSize'];
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    throw new SaveFormatError('save.state.mapSize: cannot migrate without a map size');
  }
  return size * size;
}

/** M2 added stations and vehicles. A version 2 world simply had none. */
const v2_to_v3: SaveMigration = (payload) => {
  const next = state(payload);
  return { ...payload, state: { ...next, stations: [], vehicles: [] } };
};

/**
 * M3 added the two rail layers. A version 3 world had no track, so zero-filled
 * layers are not an invention - they are exactly what that world contained.
 */
const v3_to_v4: SaveMigration = (payload) => {
  const tiles = tileCount(payload);
  const inner = state(payload);
  const map = inner['map'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new SaveFormatError('save.state.map: expected an object');
  }
  return {
    ...payload,
    state: {
      ...inner,
      map: {
        ...(map as Record<string, unknown>),
        trackBits: new Uint8Array(tiles),
        railType: new Uint8Array(tiles),
      },
    },
  };
};

/**
 * M3 gave vehicles a composition and a running distance-to-go. Everything that
 * existed in a version 4 world was a road vehicle, which has neither.
 */
const v4_to_v5: SaveMigration = (payload) => {
  const inner = state(payload);
  const vehicles = inner['vehicles'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      vehicles: vehicles.map((vehicle) => ({
        ...(vehicle as Record<string, unknown>),
        consist: [],
        routeRemainingM: 0,
      })),
    },
  };
};

/**
 * M3 finished with bridges and tunnels. A version 5 world had neither, so both
 * layers are simply empty - which is what "no structures anywhere" is.
 */
const v5_to_v6: SaveMigration = (payload) => {
  const tiles = tileCount(payload);
  const inner = state(payload);
  const map = inner['map'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new SaveFormatError('save.state.map: expected an object');
  }
  return {
    ...payload,
    state: {
      ...inner,
      map: {
        ...(map as Record<string, unknown>),
        structure: new Uint8Array(tiles),
        structureHeight: new Uint8Array(tiles),
      },
    },
  };
};

/**
 * M4 added signals and the two reservation indices a train carries. A version 6
 * world had no signals, so it held no reservations either - the sentinel -1 is
 * exactly what "this train has claimed nothing" means.
 */
const v6_to_v7: SaveMigration = (payload) => {
  const tiles = tileCount(payload);
  const inner = state(payload);
  const map = inner['map'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new SaveFormatError('save.state.map: expected an object');
  }
  const vehicles = inner['vehicles'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      map: { ...(map as Record<string, unknown>), signal: new Uint8Array(tiles) },
      vehicles: vehicles.map((vehicle) => ({
        ...(vehicle as Record<string, unknown>),
        reservedFromIndex: -1,
        reservedToIndex: -1,
      })),
    },
  };
};

/**
 * M5 gave industries a production state and towns two delivery counters. A
 * version 7 world had industries that did nothing, which is exactly an empty
 * yard at the starting level.
 */
const v7_to_v8: SaveMigration = (payload) => {
  const inner = state(payload);
  const industries = inner['industries'];
  const towns = inner['towns'];
  if (!Array.isArray(industries)) {
    throw new SaveFormatError('save.state.industries: expected an array');
  }
  if (!Array.isArray(towns)) throw new SaveFormatError('save.state.towns: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      industries: industries.map((industry) => ({
        ...(industry as Record<string, unknown>),
        inputStock0: 0,
        inputStock1: 0,
        outputStock0: 0,
        outputStock1: 0,
        productionLevel: 100,
        producedThisMonth: 0,
        collectedThisMonth: 0,
        monthsSinceLevelChange: 0,
      })),
      towns: towns.map((town) => ({
        ...(town as Record<string, unknown>),
        goodsDeliveredThisMonth: 0,
        foodDeliveredThisMonth: 0,
      })),
    },
  };
};

/**
 * M4 finished with path signals: a train now also records the block a block
 * signal let it into, and how long it has been waiting. A version 8 world had
 * neither, and -1 is what "nothing claimed, not waiting" means.
 */
const v8_to_v9: SaveMigration = (payload) => {
  const inner = state(payload);
  const vehicles = inner['vehicles'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      vehicles: vehicles.map((vehicle) => ({
        ...(vehicle as Record<string, unknown>),
        reservedBlockTile: -1,
        waitingSinceTick: -1,
      })),
    },
  };
};

/**
 * M5 gave cargo a destination and the network a measured connection table
 * (section 7.4).
 *
 * A version 9 world had neither. Every parcel in it is entered with no
 * destination rather than being guessed at: the daily sweep gives each of them
 * one from the connections the loaded fleet turns out to be running, which is
 * the same answer the world would have reached had it always had them. The
 * table itself starts empty and is measured again from the first trips.
 */
const v9_to_v10: SaveMigration = (payload) => {
  const inner = state(payload);
  const vehicles = inner['vehicles'];
  const stations = inner['stations'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');
  if (!Array.isArray(stations)) throw new SaveFormatError('save.state.stations: expected an array');

  const route = (stack: unknown): Record<string, unknown> => ({
    ...(stack as Record<string, unknown>),
    destinationStationId: -1,
  });
  const stacks = (value: unknown, where: string): Record<string, unknown>[] => {
    if (!Array.isArray(value)) throw new SaveFormatError(`${where}: expected an array`);
    return value.map(route);
  };

  return {
    ...payload,
    state: {
      ...inner,
      cargoLinks: [],
      stations: stations.map((station) => ({
        ...(station as Record<string, unknown>),
        waiting: stacks(
          (station as Record<string, unknown>)['waiting'],
          'save.state.stations[].waiting',
        ),
      })),
      vehicles: vehicles.map((vehicle) => ({
        ...(vehicle as Record<string, unknown>),
        lastStationId: -1,
        lastArrivalTick: -1,
        cargo: stacks((vehicle as Record<string, unknown>)['cargo'], 'save.state.vehicles[].cargo'),
      })),
    },
  };
};

/**
 * M5 finished with industry closure and the support modules of section 10.
 *
 * A version 10 world had industries that could never close, so every one of
 * them is open, has never missed a collection, and opened when the map did.
 * `serviceAverage` starts at zero rather than at what the industry deserves:
 * the expansion rule needs a year of evidence either way, and inventing that
 * evidence would hand a loaded save an expansion it had not earned.
 */
const v10_to_v11: SaveMigration = (payload) => {
  const inner = state(payload);
  const industries = inner['industries'];
  if (!Array.isArray(industries)) {
    throw new SaveFormatError('save.state.industries: expected an array');
  }

  return {
    ...payload,
    state: {
      ...inner,
      industries: industries.map((industry) => ({
        ...(industry as Record<string, unknown>),
        serviceAverage: 0,
        serviceMonths: 0,
        monthsWithoutCollection: 0,
        open: true,
        openedTick: 0,
      })),
    },
  };
};

/**
 * M6 work brought the bankruptcy countdown of section 14.2 forward, because
 * balancing scenario 4 cannot be measured without it.
 *
 * A version 11 world had no countdown. Every company in one is entered as
 * solvent and not overdrawn, which is what "this rule did not exist yet"
 * means - a company that happens to be in the red gets its twelve months from
 * the moment the save is loaded rather than being wound up on the spot.
 */
const v11_to_v12: SaveMigration = (payload) => {
  const inner = state(payload);
  const company = inner['company'];
  if (typeof company !== 'object' || company === null || Array.isArray(company)) {
    throw new SaveFormatError('save.state.company: expected an object');
  }
  return {
    ...payload,
    state: {
      ...inner,
      company: {
        ...(company as Record<string, unknown>),
        monthsInDebt: 0,
        bankrupt: false,
      },
    },
  };
};

/**
 * Registry keyed by the version a migration reads (section 19.1).
 *
 * There is deliberately no entry for 1 -> 2: a version 1 world had no map at
 * all, so a migration could only invent one, and handing the player a world
 * that is not the one they saved is worse than refusing to load it.
 */
export const SAVE_MIGRATIONS: ReadonlyMap<number, SaveMigration> = new Map<number, SaveMigration>([
  [2, v2_to_v3],
  [3, v3_to_v4],
  [4, v4_to_v5],
  [5, v5_to_v6],
  [6, v6_to_v7],
  [7, v7_to_v8],
  [8, v8_to_v9],
  [9, v9_to_v10],
  [10, v10_to_v11],
  [11, v11_to_v12],
]);

/**
 * Bring a decoded payload from `fromVersion` up to `toVersion`.
 * Lookups happen by explicit version number, never by iterating the map, so the
 * order of registration cannot influence the result.
 */
export function migrateSavePayload(
  payload: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = SAVE_VERSION,
  migrations: ReadonlyMap<number, SaveMigration> = SAVE_MIGRATIONS,
): Record<string, unknown> {
  if (fromVersion > toVersion) {
    throw new SaveFormatError(
      `This save was written by a newer version of the game (save format ${fromVersion}, ` +
        `this build understands ${toVersion}).`,
    );
  }

  let current = payload;
  for (let version = fromVersion; version < toVersion; version++) {
    const migration = migrations.get(version);
    if (migration === undefined) {
      throw new SaveFormatError(
        `No migration registered from save format ${version} to ${version + 1}.`,
      );
    }
    current = migration(current);
    current['saveVersion'] = version + 1;
  }
  return current;
}
