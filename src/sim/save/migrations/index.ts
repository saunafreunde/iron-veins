import { LEDGER_HISTORY_MONTHS, TILE_PUBLIC } from '../../constants';
import { ACCOUNT_COUNT } from '../../economy/ledger';
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
 * M6 gave the company the accounts of section 14.1.
 *
 * A version 12 world had one lump of upkeep and no ledger at all. The lump is
 * entered as INFRASTRUCTURE upkeep and the fleet half as zero, because the
 * fleet's share is recomputed from the vehicles on the first yearly hook
 * anyway - guessing at a split here would be wrong for one game month and
 * would then be overwritten.
 *
 * The history starts empty rather than being invented. A chart that shows two
 * flat years and then real data is honest; one that shows fabricated data is
 * not.
 */
const v12_to_v13: SaveMigration = (payload) => {
  const inner = state(payload);
  const company = inner['company'];
  if (typeof company !== 'object' || company === null || Array.isArray(company)) {
    throw new SaveFormatError('save.state.company: expected an object');
  }
  const previous = company as Record<string, unknown>;
  const upkeep = typeof previous['upkeepPerYearCt'] === 'number' ? previous['upkeepPerYearCt'] : 0;
  const zeros = (length: number): number[] => new Array<number>(length).fill(0);

  const next: Record<string, unknown> = { ...previous };
  delete next['upkeepPerYearCt'];

  return {
    ...payload,
    state: {
      ...inner,
      company: {
        ...next,
        vehicleUpkeepPerYearCt: 0,
        infrastructureUpkeepPerYearCt: upkeep,
        accounts: zeros(ACCOUNT_COUNT),
        yearAccounts: zeros(ACCOUNT_COUNT),
        lastYearAccounts: zeros(ACCOUNT_COUNT),
        monthHistory: zeros(LEDGER_HISTORY_MONTHS * ACCOUNT_COUNT),
        historyCursor: 0,
        valueHistory: [],
        accumulatedDepreciationCt: 0,
      },
    },
  };
};

/**
 * M6 priced the energy a fleet burns, which needs a work accumulator per
 * vehicle. A version 13 world has burned nothing that anybody counted, so every
 * vehicle starts the next month with a clean meter.
 */
const v13_to_v14: SaveMigration = (payload) => {
  const inner = state(payload);
  const vehicles = inner['vehicles'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      vehicles: vehicles.map((vehicle) => ({
        ...(vehicle as Record<string, unknown>),
        workJ: 0,
      })),
    },
  };
};

/**
 * M6 made inflation switchable (section 14.2) and added the auto-renewal
 * switch of 11.3. Every world before version 15 ran with inflation ON, because
 * the revenue side has been inflated since M2 - so on is what those saves
 * actually mean - and without auto-renewal, which did not exist.
 */
const v14_to_v15: SaveMigration = (payload) => {
  const inner = state(payload);
  const company = inner['company'];
  if (typeof company !== 'object' || company === null || Array.isArray(company)) {
    throw new SaveFormatError('save.state.company: expected an object');
  }
  return {
    ...payload,
    state: {
      ...inner,
      inflation: true,
      // Off, because a save taken before the switch existed was played without
      // it and turning it on would spend the player's money for them.
      company: { ...(company as Record<string, unknown>), autoRenew: false },
    },
  };
};

/**
 * M7 gave stations a runway occupancy list. A version 15 world had no airports,
 * so every station starts with none - which is also what a station without an
 * airport has after the change.
 */
const v15_to_v16: SaveMigration = (payload) => {
  const inner = state(payload);
  const stations = inner['stations'];
  if (!Array.isArray(stations)) throw new SaveFormatError('save.state.stations: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      stations: stations.map((station) => ({
        ...(station as Record<string, unknown>),
        runwayFreeTick: [],
      })),
    },
  };
};

/**
 * M8 gave the game a news log. A version 16 world was never told anything, so
 * its log is empty - inventing entries for events it did not record would be
 * writing history rather than migrating it.
 */
const v16_to_v17: SaveMigration = (payload) => {
  const inner = state(payload);
  return { ...payload, state: { ...inner, news: [] } };
};

/**
 * M8 made the game multi-company (section 15).
 *
 * A version 17 world had exactly one company and it was the player's, so it
 * becomes company 0 and the list has one entry. Every tile it built becomes
 * PUBLIC rather than the player's: the layer did not exist, so the file cannot
 * say who laid which piece of track, and public is the reading that changes
 * nothing about what the player may do with their own map - a public tile is
 * demolishable by anyone, which is precisely the rule that applied before.
 *
 * Every command in the log was issued by the player, because there was nobody
 * else to issue one.
 */
const v17_to_v18: SaveMigration = (payload) => {
  const inner = state(payload);

  const company = inner['company'];
  if (typeof company !== 'object' || company === null) {
    throw new SaveFormatError('save.state.company: expected the single company of version 17');
  }
  const rest = { ...inner };
  delete rest['company'];

  const map = rest['map'];
  if (typeof map !== 'object' || map === null) {
    throw new SaveFormatError('save.state.map: expected the tile layers');
  }
  const layers = map as Record<string, unknown>;
  const terrain = layers['terrain'];
  if (!(terrain instanceof Uint8Array)) {
    throw new SaveFormatError('save.state.map.terrain: expected a byte array');
  }

  // A payload with no log at all is left as it is rather than rejected: the
  // decoder validates the log itself, and saying so twice in two places means
  // saying it differently in one of them.
  const log = payload['commandLog'];
  const stamped = Array.isArray(log)
    ? log.map((entry) => ({ ...(entry as Record<string, unknown>), companyId: 0 }))
    : log;

  return {
    ...payload,
    commandLog: stamped,
    state: {
      ...rest,
      companies: [{ ...(company as Record<string, unknown>), id: 0 }],
      map: { ...layers, owner: new Uint8Array(terrain.length).fill(TILE_PUBLIC) },
    },
  };
};

/**
 * M8 gave every town a council (section 13.3).
 *
 * A version 18 town had no opinion of anybody. It starts with none here too:
 * the rating is recomputed from the map and the traffic at the end of the next
 * month anyway, and inventing a history of campaigns and demolitions that never
 * happened would be worse than a town that has not made its mind up yet.
 */
const v18_to_v19: SaveMigration = (payload) => {
  const inner = state(payload);
  const towns = inner['towns'];
  if (!Array.isArray(towns)) throw new SaveFormatError('save.state.towns: expected an array');

  return {
    ...payload,
    state: {
      ...inner,
      towns: towns.map((town) => ({
        ...(town as Record<string, unknown>),
        transportedByCompany: [],
        councilRating: [],
        councilGoodwill: [],
        exclusiveCompanyId: -1,
        exclusiveUntilTick: 0,
        measureReadyTick: [],
      })),
    },
  };
};

/**
 * M8 added the carbon levy of section 14.3.
 *
 * That is a tenth ledger account, so every row in every company's books grows
 * by one - including the twenty-four month history, which is a FLAT ring and
 * has to be re-laid row by row rather than padded at the end. Getting that
 * wrong would not throw; it would silently shear every historical month by one
 * account and the finance panel would show plausible nonsense.
 *
 * The levy itself does not exist before the year 2000, so a save from any
 * earlier year loses nothing by starting its carbon account at zero. The
 * setting is ON, because that is the default a new game gets and a save that
 * predates the choice cannot express one.
 */
const v19_to_v20: SaveMigration = (payload) => {
  const inner = state(payload);
  const companies = inner['companies'];
  if (!Array.isArray(companies)) {
    throw new SaveFormatError('save.state.companies: expected an array');
  }
  const oldCount = ACCOUNT_COUNT - 1;

  const widen = (value: unknown, path: string): number[] => {
    if (!Array.isArray(value)) throw new SaveFormatError(`${path}: expected an array`);
    return [...(value as number[]), 0];
  };

  return {
    ...payload,
    state: {
      ...inner,
      emissions: true,
      companies: companies.map((entry, index) => {
        const company = entry as Record<string, unknown>;
        const history = company['monthHistory'];
        if (!Array.isArray(history)) {
          throw new SaveFormatError(`save.state.companies[${index}].monthHistory: expected an array`);
        }
        const months = history.length / oldCount;
        const relaid: number[] = [];
        for (let month = 0; month < months; month++) {
          for (let account = 0; account < oldCount; account++) {
            relaid.push((history as number[])[month * oldCount + account] ?? 0);
          }
          relaid.push(0);
        }
        return {
          ...company,
          accounts: widen(company['accounts'], `save.state.companies[${index}].accounts`),
          yearAccounts: widen(company['yearAccounts'], `save.state.companies[${index}].yearAccounts`),
          lastYearAccounts: widen(
            company['lastYearAccounts'],
            `save.state.companies[${index}].lastYearAccounts`,
          ),
          monthHistory: relaid,
          co2ThisYearKg: 0,
          co2LastYearKg: 0,
        };
      }),
    },
  };
};

/**
 * M8 added the tenders of section 14.4. A version 20 world had none, and the
 * monthly review puts the first offers on the board within a game month.
 */
const v20_to_v21: SaveMigration = (payload) => {
  const inner = state(payload);
  return { ...payload, state: { ...inner, contracts: [], nextContractId: 0 } };
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
  [12, v12_to_v13],
  [13, v13_to_v14],
  [14, v14_to_v15],
  [15, v15_to_v16],
  [16, v16_to_v17],
  [17, v17_to_v18],
  [18, v18_to_v19],
  [19, v19_to_v20],
  [20, v20_to_v21],
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
