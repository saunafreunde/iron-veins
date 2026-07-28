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
