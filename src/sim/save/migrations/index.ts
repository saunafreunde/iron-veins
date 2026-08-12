import { CARGO_COUNT } from '../../cargo/types';
import {
  LEDGER_HISTORY_MONTHS,
  TILE_PUBLIC,
  WEATHER_REGION_COUNT,
  WeatherRule,
} from '../../constants';
import { GoalKind } from '../../goals/types';
import { STATION_HISTORY_SIZE, STATION_MONTH_COUNTER_SIZE } from '../../station/history';
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
/**
 * How wide a row of accounts is at each version that changed the width, as
 * LITERALS - D-207's rule, and this pair is where it was still broken.
 *
 * Both account migrations below sized themselves from the LIVE `ACCOUNT_COUNT`,
 * so every milestone that adds an account silently rewrites what an old save is
 * migrated INTO: with ten accounts live, `v12_to_v13` wrote a ten-wide row into
 * a version 13 world that had nine, `v19_to_v20` then widened it to eleven, and
 * the parser - which wants exactly `ACCOUNT_COUNT` - refused the result. That
 * has been true since M8 added the tenth account; nothing caught it because the
 * save corpus starts at v22, above both steps. SPEC2 M21's eleventh account is
 * what made it worth writing down rather than deepening.
 */
const ACCOUNT_COUNT_V13 = 9;
const ACCOUNT_COUNT_V20 = 10;

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
        accounts: zeros(ACCOUNT_COUNT_V13),
        yearAccounts: zeros(ACCOUNT_COUNT_V13),
        lastYearAccounts: zeros(ACCOUNT_COUNT_V13),
        monthHistory: zeros(LEDGER_HISTORY_MONTHS * ACCOUNT_COUNT_V13),
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
  const oldCount = ACCOUNT_COUNT_V13;

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
          throw new SaveFormatError(
            `save.state.companies[${index}].monthHistory: expected an array`,
          );
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
          yearAccounts: widen(
            company['yearAccounts'],
            `save.state.companies[${index}].yearAccounts`,
          ),
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
 * M8 added the AI competitors of section 15.
 *
 * A version 21 world had no competitors, and it cannot be given any now: the
 * companies would have fifty years of catching up to do against a player who
 * has had the map to themselves. An empty roster is the honest reading - the
 * save was a single-company game and stays one.
 */
const v21_to_v22: SaveMigration = (payload) => {
  const inner = state(payload);
  return { ...payload, state: { ...inner, ai: [] } };
};

/**
 * M10 gave the save container a world digest (`hashWorld` at encode time,
 * verified at decode time).
 *
 * A version 22 save carries none, and none can be invented here: the digest is
 * computed from the LIVE world when a save is encoded, and a migration only
 * ever sees the raw payload. The empty string is the recorded fact "written
 * before the digest existed" and the decoder skips verification for it. This
 * migration touches only the container - the state object is passed through
 * untouched, so a migrated world hashes exactly as it did under version 22,
 * which `tests/unit/save.spec.ts` proves by hash identity (Fehlerkatalog 2:
 * the digest goes into the container, never into what is hashed).
 */
const v22_to_v23: SaveMigration = (payload) => ({ ...payload, worldDigest: '' });

/**
 * M11 brought the full order grammar of section 12.1, the waypoint layer,
 * and - Stage B of the SAME bump (SPEC2 Z5) - the line entities of section
 * 12.2 with everything that hangs off them.
 *
 * Stage A's half: a version 23 world had no waypoints, so the layer is
 * zero-filled, and its orders knew only target/load/unload - the new fields
 * get the values that mean "not used": no refit (-1), no minimum dwell (0),
 * no condition (condKind -1, companions 0).
 *
 * Stage B's half, and what "maps the old flags sensibly" means here:
 *
 *  - Every line an AI kept privately in its own state becomes a REAL line
 *    entity (E-06), ids handed out in roster order, carrying the order list
 *    its first vehicle was actually running - the schedule is moved, not
 *    reinvented. Its vehicles are assigned (`lineId`) and their private
 *    lists cleared, which is exactly the assigned state; their position in
 *    the identical list is kept, so nothing about any journey changes. The
 *    AI's review baseline per line moves into `reviews`, and a reinforcement
 *    project's `lineIndex` is translated to the entity id it now names.
 *  - The company-wide `autoRenew` flag of D-093 is REMOVED and mapped onto
 *    the lines migrated for that company. A company with the flag on and no
 *    lines - every human player's save, since players could not have lines -
 *    loses the switch, because there is nothing left to attach it to: the
 *    honest reading, stated in DECISIONS.md, is that renewal is a per-line
 *    rule now and a save from before lines simply has no lines yet.
 *
 * Stage C's half, still the SAME bump (Z5): the timetable of 12.3. A line
 * that predates takt runs none (`taktTicks` 0), a station is no transfer
 * node until somebody marks one, and a vehicle owes no slot and holds no
 * departure (-1/-1) and is not late (0). All of that is exactly what those
 * worlds contained - the takt machinery is provably inert at these defaults,
 * which is what keeps the corpus one-hash property standing.
 *
 * Nothing here invents behaviour: a migrated schedule runs exactly as it
 * did, which the hash-identity test of tests/unit/save.spec.ts holds for the
 * lineless case and the corpus holds for good. Fields that are already
 * present are kept, so re-wrapping a current state in an old container (the
 * corpus trick) cannot flatten real values back to defaults.
 */
const v23_to_v24: SaveMigration = (payload) => {
  const tiles = tileCount(payload);
  const inner = state(payload);
  const map = inner['map'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new SaveFormatError('save.state.map: expected an object');
  }
  const vehicles = inner['vehicles'];
  if (!Array.isArray(vehicles)) throw new SaveFormatError('save.state.vehicles: expected an array');
  const companies = inner['companies'];
  if (!Array.isArray(companies)) {
    throw new SaveFormatError('save.state.companies: expected an array');
  }
  const ai = inner['ai'];
  if (!Array.isArray(ai)) throw new SaveFormatError('save.state.ai: expected an array');

  const layers = map as Record<string, unknown>;
  const waypoint =
    layers['waypoint'] instanceof Uint8Array ? layers['waypoint'] : new Uint8Array(tiles);

  // The old company-wide renewal flags, remembered before they are removed.
  const renewedCompany = companies.map(
    (company) => (company as Record<string, unknown>)['autoRenew'] === true,
  );

  // Which line entity each vehicle joins, and the entities themselves.
  const vehicleLine = new Map<number, number>();
  const migratedLines: Record<string, unknown>[] = [];
  const defaultOrder = (order: unknown): Record<string, unknown> => {
    const entry = order as Record<string, unknown>;
    return {
      ...entry,
      refitTo: entry['refitTo'] ?? -1,
      waitTicks: entry['waitTicks'] ?? 0,
      condKind: entry['condKind'] ?? -1,
      condComparator: entry['condComparator'] ?? 0,
      condValue: entry['condValue'] ?? 0,
      condJumpTo: entry['condJumpTo'] ?? 0,
    };
  };
  const ordersOfVehicle = (vehicleId: number): Record<string, unknown>[] => {
    for (const vehicle of vehicles) {
      const record = vehicle as Record<string, unknown>;
      if (record['id'] !== vehicleId) continue;
      const orders = record['orders'];
      if (!Array.isArray(orders)) return [];
      return orders.map(defaultOrder);
    }
    return [];
  };

  const migratedAi = ai.map((entry) => {
    const previous = entry as Record<string, unknown>;
    // A state written by this version already: pass through.
    if (previous['reviews'] !== undefined) return previous;

    const companyId = previous['companyId'];
    const oldLines = Array.isArray(previous['lines']) ? previous['lines'] : [];
    const lineIds: number[] = [];
    const reviews: Record<string, unknown>[] = [];

    for (const oldLine of oldLines) {
      const line = oldLine as Record<string, unknown>;
      const lineId = migratedLines.length;
      lineIds.push(lineId);
      const vehicleIds = Array.isArray(line['vehicleIds']) ? (line['vehicleIds'] as number[]) : [];
      // The schedule the line's vehicles were actually running; the two-stop
      // shape the AI always ordered, reconstructed only if no vehicle is
      // left to read it from.
      const first = vehicleIds.length > 0 ? ordersOfVehicle(vehicleIds[0]!) : [];
      const orders =
        first.length > 0
          ? first
          : [
              {
                target: 0,
                targetId: line['fromStationId'] ?? 0,
                load: 1,
                unload: 1,
                refitTo: -1,
                waitTicks: 0,
                condKind: -1,
                condComparator: 0,
                condValue: 0,
                condJumpTo: 0,
              },
              {
                target: 0,
                targetId: line['toStationId'] ?? 0,
                load: 2,
                unload: 0,
                refitTo: -1,
                waitTicks: 0,
                condKind: -1,
                condComparator: 0,
                condValue: 0,
                condJumpTo: 0,
              },
            ];
      migratedLines.push({
        id: lineId,
        ownerId: companyId,
        autoRenew: typeof companyId === 'number' ? (renewedCompany[companyId] ?? false) : false,
        orders,
      });
      for (const vehicleId of vehicleIds) {
        if (typeof vehicleId === 'number') vehicleLine.set(vehicleId, lineId);
      }
      reviews.push({
        lineId,
        reviewTick: line['reviewTick'] ?? 0,
        earnedAtReviewCt: line['earnedAtReviewCt'] ?? 0,
      });
    }

    const next: Record<string, unknown> = { ...previous, reviews };
    delete next['lines'];
    const project = previous['project'];
    if (typeof project === 'object' && project !== null) {
      const oldProject = project as Record<string, unknown>;
      if (oldProject['lineId'] === undefined) {
        const lineIndex = oldProject['lineIndex'];
        const mapped =
          typeof lineIndex === 'number' && lineIndex >= 0 && lineIndex < lineIds.length
            ? lineIds[lineIndex]!
            : -1;
        const migratedProject: Record<string, unknown> = { ...oldProject, lineId: mapped };
        delete migratedProject['lineIndex'];
        next['project'] = migratedProject;
      }
    }
    return next;
  });

  // A payload with no station section is left as it is rather than rejected
  // here: the decoder validates the section itself, and saying so twice in
  // two places means saying it differently in one of them (the v17_to_v18
  // precedent for the command log).
  const stations = Array.isArray(inner['stations']) ? inner['stations'] : null;

  // Kept when present: the corpus wraps a CURRENT state in this container.
  const lines = Array.isArray(inner['lines'])
    ? (inner['lines'] as Record<string, unknown>[])
    : migratedLines;

  return {
    ...payload,
    state: {
      ...inner,
      map: { ...layers, waypoint },
      // Stage C: a line from before the timetable runs none.
      lines: lines.map((line) => ({
        ...line,
        taktTicks: line['taktTicks'] ?? 0,
        taktOffsetTicks: line['taktOffsetTicks'] ?? 0,
      })),
      // Stage C: no station was a transfer node before somebody could mark one.
      ...(stations === null
        ? {}
        : {
            stations: stations.map((station) => {
              const previous = station as Record<string, unknown>;
              return { ...previous, transferNode: previous['transferNode'] ?? false };
            }),
          }),
      ai: migratedAi,
      companies: companies.map((company) => {
        const previous = company as Record<string, unknown>;
        const next = { ...previous };
        delete next['autoRenew'];
        return next;
      }),
      vehicles: vehicles.map((vehicle) => {
        const previous = vehicle as Record<string, unknown>;
        const orders = previous['orders'];
        if (!Array.isArray(orders)) {
          throw new SaveFormatError('save.state.vehicles[].orders: expected an array');
        }
        const id = previous['id'];
        const assigned = typeof id === 'number' ? vehicleLine.get(id) : undefined;
        return {
          ...previous,
          lineId: assigned ?? previous['lineId'] ?? -1,
          // Stage C: no slot latched, no departure held, not late.
          taktDueTick: previous['taktDueTick'] ?? -1,
          connectionDeadlineTick: previous['connectionDeadlineTick'] ?? -1,
          taktDelayTicks: previous['taktDelayTicks'] ?? 0,
          // An assigned vehicle's list lives on its line; the private copy
          // goes, exactly as an AssignVehicleToLine leaves it.
          orders: assigned !== undefined ? [] : orders.map(defaultOrder),
        };
      }),
    },
  };
};

/**
 * M14 added the per-station cargo-history ring of the station x-ray (SPEC2
 * M14, the milestone's one Z5 bump). A version 24 world recorded no history,
 * so every station gets a zeroed ring, a cursor at slot 0 and zeroed
 * month-in-progress counters - which is exactly what that world knew about
 * its own past. Fields already present are kept, so the corpus trick of
 * wrapping a CURRENT state in an old container cannot flatten real months
 * back to zero.
 *
 * The statistics-centre bundle of the SAME milestone extended the SAME v25
 * payload with two per-vehicle fields - `breakdownCount` (the detail view's
 * lifetime tally) and `depotCall` (the outstanding "send to depot" diversion,
 * Z4) - so this migration defaults them too. One bump per milestone is the Z5
 * rule; a migration may grow while its milestone is still open, and the pin
 * and corpus were re-recorded under their own protocols when it did (D-181).
 * A v24 world had suffered breakdowns it never counted - the zero is what it
 * knew, exactly like the zeroed ring above - and could not have had a depot
 * call outstanding, because the command did not exist.
 */
const v24_to_v25: SaveMigration = (payload) => {
  const inner = state(payload);
  // A payload with no station section is left as it is rather than rejected
  // here: the decoder validates the section itself (the v17_to_v18 precedent).
  const stations = Array.isArray(inner['stations']) ? inner['stations'] : null;
  if (stations === null) return payload;

  // A missing vehicle section stays missing - the decoder is the one that
  // refuses it, and a migration must not turn a malformed save into an
  // acceptable empty one.
  const vehicles = Array.isArray(inner['vehicles']) ? inner['vehicles'] : null;

  return {
    ...payload,
    state: {
      ...inner,
      stations: stations.map((station) => {
        const previous = station as Record<string, unknown>;
        return {
          ...previous,
          // In the v25 LAYOUT, not in this build's - see CARGO_COUNT_V29.
          history: previous['history'] ?? new Array<number>(STATION_HISTORY_SIZE_V29).fill(0),
          historyCursor: previous['historyCursor'] ?? 0,
          monthCounters:
            previous['monthCounters'] ?? new Array<number>(STATION_MONTH_COUNTER_SIZE_V29).fill(0),
        };
      }),
      ...(vehicles === null
        ? {}
        : {
            vehicles: vehicles.map((vehicle) => {
              const previous = vehicle as Record<string, unknown>;
              return {
                ...previous,
                breakdownCount: previous['breakdownCount'] ?? 0,
                depotCall: previous['depotCall'] ?? 0,
              };
            }),
          }),
    },
  };
};

/**
 * M15 made the route costs of SPEC.md 8.4 world rules (SPEC2 M15, the
 * milestone's one Z5 bump): `occupancyPenalty`, which charges the train
 * pathfinder for a section another train has claimed, `signalPenalty`, which
 * charges it for passing a signal, and - the road half of the same section,
 * extending this migration IN PLACE rather than adding a v27 - the world rule
 * `roadCongestion` with the Uint8 congestion layer it records into.
 *
 * All three enter a version 25 world as OFF, and that is not a convenient
 * default but the only true one: those worlds were driven by pathfinders that
 * had none of the terms, so every route in the file was chosen without them.
 * Turning any of them on here would silently re-route a loaded save's whole
 * fleet at the first departure and move the balance bands of M6 under a player
 * who changed nothing (SPEC2 Fehlerkatalog 34).
 *
 * The layer is zeroed for the same reason the M11 waypoints and the M14
 * history rings were: a world with no congestion term recorded no traffic, so
 * zero is what it knew about its own past rather than an invention.
 *
 * Fields already present are kept, so the corpus trick of wrapping a CURRENT
 * state in an old container cannot flatten a real rule back to off or a real
 * layer back to zeros. A payload with no map section is passed through as it
 * is - the decoder is the one that refuses it (the v17_to_v18 precedent), and
 * a migration must not turn a malformed save into an acceptable one.
 */
const v25_to_v26: SaveMigration = (payload) => {
  const inner = state(payload);
  const map = inner['map'];
  const layers =
    typeof map === 'object' && map !== null && !Array.isArray(map)
      ? (map as Record<string, unknown>)
      : null;

  return {
    ...payload,
    state: {
      ...inner,
      occupancyPenalty: inner['occupancyPenalty'] ?? false,
      signalPenalty: inner['signalPenalty'] ?? false,
      roadCongestion: inner['roadCongestion'] ?? false,
      ...(layers === null
        ? {}
        : {
            map: {
              ...layers,
              congestion:
                layers['congestion'] instanceof Uint8Array
                  ? layers['congestion']
                  : new Uint8Array(tileCount(payload)),
            },
          }),
    },
  };
};

/**
 * M16 gave a recording a memory of its own past: the checkpoint ring, the tick
 * the retained command log starts from, and the claim a `.ironreplay` makes
 * about where it ends (SPEC2 M16, the milestone's one Z5 bump).
 *
 * All three live in the CONTAINER, never in the hashed state - they are
 * HISTORY, the family the command log belongs to, and history is judged by
 * replay verification rather than by the world digest (D-131). So this
 * migration spreads the container and passes `state` through by reference,
 * exactly as `v22_to_v23` did: the world a version 26 save means does not
 * move by one byte, and the migration test proves it by hash identity.
 *
 * A version 26 world recorded no checkpoints, so it gets none. That is not a
 * loss of anything: its command log is complete from tick 0 (`logBaseTick`
 * zero - nothing was ever trimmed), so it stays replayable by re-simulating
 * from the genesis its own parameters describe. What it does NOT get is a
 * verifiable replay, and that is D-131 rather than this migration: a recording
 * made under save version 26 is evidence about save version 26.
 *
 * Fields already present are kept, so the corpus trick of wrapping a CURRENT
 * container in an old version cannot flatten a real ring back to empty.
 *
 * M16's correction bundle EXTENDS this migration in place rather than adding a
 * v28 (Z5: v28 belongs to M17): every mark also carries a schedule digest now,
 * and a payload that has none is given the empty one - see
 * {@link withScheduleDigests} for why that is a fact and not a placeholder.
 */
const v26_to_v27: SaveMigration = (payload) => ({
  ...payload,
  logBaseTick: payload['logBaseTick'] ?? 0,
  checkpoints: withScheduleDigests(payload['checkpoints']),
  replay: withClaimScheduleDigest(payload['replay']),
});

/**
 * The empty schedule digest, entered where a recording carries none.
 *
 * M16's correction bundle added one hash per committed mark - the schedule of
 * the commands in the segment leading up to it (D-191) - and it did so INSIDE
 * version 27, because v27 is M16's one Z5 bump and this is M16's own defect.
 * A version 26 container carries no ring and no claim at all, so nothing here
 * fires for the migration's own case; what it does cover is the two ways a
 * v27-shaped payload can reach this code without the field - the corpus trick
 * of wrapping a CURRENT container in an old version header, and a recording
 * written by an earlier build of version 27.
 *
 * The empty string is not a placeholder to be filled in later: it is the
 * recorded fact that this mark committed to no schedule, and the verifier
 * answers with a bracket rather than a tick wherever it finds one. Inventing a
 * digest from the log the file carries would be the opposite - it would
 * certify whatever a tamper had already done.
 */
function withScheduleDigests(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.map((entry) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? { scheduleDigest: '', ...(entry as Record<string, unknown>) }
      : entry,
  );
}

/** The same for the end claim of a `.ironreplay`; a plain save has none. */
function withClaimScheduleDigest(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return { scheduleDigest: '', ...(value as Record<string, unknown>) };
}

/**
 * M17 gave a world something to be measured against: the goal machine (SPEC2
 * M17, the milestone's one Z5 bump - v28).
 *
 * Two things enter the hashed state, and both are entered as "nothing", which
 * is not a convenient default but the only true one:
 *
 *  - `goals` becomes the empty list. A world started before M17 was asked for
 *    nothing, and inventing a goal here would hand a player a scenario they
 *    never chose - and, worse, a medal the simulation never decided.
 *  - every company gets a zeroed `cargoDeliveredUnits`. Those companies DID
 *    deliver cargo; nobody counted it, and the count is not reconstructible
 *    from anything the file carries (the twelve-month station ring is a
 *    window, not a lifetime). Zero is what that world knew about itself - the
 *    same honesty the v24 -> v25 rings and the v25 -> v26 congestion layer
 *    were given.
 *
 * Fields already present are kept, so the corpus trick of wrapping a CURRENT
 * state in an old container cannot flatten a real goal list back to empty. A
 * payload with no state or no company section is passed through as it is: the
 * decoder is the one that refuses it (the v17_to_v18 precedent).
 *
 * M17's scenario bundle EXTENDS this migration in place rather than adding a
 * v29 (Z5: v28 is M17's one bump): the `.ironscenario` metadata block joins the
 * CONTAINER, beside the checkpoint ring and the replay claim rather than inside
 * the hashed state, because it is what a file says ABOUT itself
 * (Fehlerkatalog 35, `save/scenarioMeta.ts`). Null is the only honest entry -
 * a save is not a scenario, and no migration can invent a briefing - and
 * because it is a container field, not one byte of hashed world state moves:
 * the canonical pin and the corpus manifest stay where D-193 left them.
 */
const v27_to_v28: SaveMigration = (payload) => {
  const inner = state(payload);
  const companies = Array.isArray(inner['companies']) ? inner['companies'] : null;

  return {
    ...payload,
    scenario: payload['scenario'] ?? null,
    state: {
      ...inner,
      goals: inner['goals'] ?? [],
      ...(companies === null
        ? {}
        : {
            companies: companies.map((company) => {
              const previous = company as Record<string, unknown>;
              return {
                ...previous,
                // In the v28 LAYOUT, not in this build's - see CARGO_COUNT_V29.
                cargoDeliveredUnits:
                  previous['cargoDeliveredUnits'] ?? new Array<number>(CARGO_COUNT_V29).fill(0),
              };
            }),
          }),
    },
  };
};

/**
 * M18 made the environment simulation reality: the weather world rule of SPEC2
 * E-01 and the 16x16 region field it drives (M18's one Z5 bump - v29).
 *
 * Both enter a version 28 world as NOTHING, and as everywhere else in this file
 * that is the only true reading rather than a convenient one:
 *
 *  - `weather` becomes `WeatherRule.Off`. Those worlds were played by a
 *    simulation that had no weather at all, so every route, every breakdown
 *    roll and every cargo age in the file was produced without it. Entering
 *    Mild or Harsh here would give a loaded save a sky it never had and move
 *    the M6 bands under a player who changed nothing (Fehlerkatalog 34).
 *  - `weatherField` becomes all-clear. That is not an invention either: it is
 *    exactly what a world with the rule off holds for ever, because
 *    `updateWeather` returns on its first line and never writes a cell.
 *
 * Fields already present are kept, so the corpus trick of wrapping a CURRENT
 * state in an old container cannot flatten a real rule back to off or a real
 * sky back to clear. A payload with no state is refused by `state()` above; one
 * with a state but no map is passed through as it is, since the field's size
 * does not depend on the map (the whole point of a fixed 16x16 grid).
 *
 * Unlike v27 and v23 this bump MOVES hashed world state - one word for the rule
 * plus 256 bytes of field - so both pins were re-recorded under their own
 * protocols: the canonical cross-OS hash (D-137) and the corpus manifest
 * (D-130). That is the designed-for event, and the corpus is the evidence that
 * nothing but the new words moved: all eight fixtures still decode to ONE
 * world.
 */
const v28_to_v29: SaveMigration = (payload) => {
  const inner = state(payload);

  return {
    ...payload,
    state: {
      ...inner,
      weather: inner['weather'] ?? WeatherRule.Off,
      weatherField:
        inner['weatherField'] instanceof Uint8Array
          ? inner['weatherField']
          : new Uint8Array(WEATHER_REGION_COUNT),
    },
  };
};

// ------------------------------------------------- M19: the passenger classes

/**
 * `CARGO_COUNT` as every save format up to and including 29 knew it.
 *
 * SPEC2 M19 grew the cargo table by two (E-08), and that turned a latent trap
 * in this file into a real one: a migration must write the shape of ITS OWN
 * target version, never the shape this build happens to compile with. The
 * v24 -> v25 rings and the v27 -> v28 lifetime tally were sized from the live
 * constants, so a version 22 save would have arrived at `v29_to_v30` carrying
 * TWENTY-cargo rows that the remap below would have grown to twenty-two. Both
 * are pinned to this number now, and the corpus - which walks the whole chain
 * from 22 - is what proves it.
 */
const CARGO_COUNT_V29 = 18;

/**
 * The other two terms of the ring layout as versions 25..29 knew them, pinned
 * for the same reason and held against the live constants by
 * `tests/unit/save.spec.ts` - so the day a milestone changes the number of
 * months or of counters, this file is named rather than silently wrong.
 */
const STATION_HISTORY_MONTHS_V29 = 12;
const STATION_HISTORY_FIELDS_V29 = 3;

/** The station history ring in the v25..v29 layout (station/history.ts). */
const STATION_HISTORY_SIZE_V29 =
  STATION_HISTORY_MONTHS_V29 * CARGO_COUNT_V29 * STATION_HISTORY_FIELDS_V29;

/** The month-in-progress counters in the same layout. */
const STATION_MONTH_COUNTER_SIZE_V29 = CARGO_COUNT_V29 * STATION_HISTORY_FIELDS_V29;

/**
 * The return-journey ledger a version THIRTY station carries, pinned for
 * exactly the reason the numbers above are (station/returns.ts: four figures
 * per passenger class, two classes). `tests/unit/returnJourneys.spec.ts`
 * migrates a v29 station and holds the result against the LIVE constant, so a
 * milestone that adds a class or a figure fails there and is told to write its
 * own v30 -> v31 growth rather than silently moving this migration's target.
 */
const RETURN_STATE_SIZE_V30 = 8;

/**
 * The cargo id a version 29 save meant by 0.
 *
 * `Cargo.Passengers` is retired: the town splits its output into
 * `Cargo.CommuterPax` and `Cargo.BusinessPax`, and the class a world played
 * before M19 carried is the commuter - it was the fare every balancing band
 * was measured on, and the business premium is new money that world never
 * earned. Every other id keeps its number, which is the whole reason the
 * retired slot was not reused.
 *
 * The 18 is a literal for the same reason `CARGO_COUNT_V29` is: this function
 * writes the VERSION 30 shape, and version 30's commuter is 18 for ever. A
 * later milestone that renumbers the table would have to add its own
 * migration, not silently move this one's target under it.
 */
const CARGO_COMMUTER_PAX_V30 = 18;

function remapCargoId(id: number): number {
  return id === 0 ? CARGO_COMMUTER_PAX_V30 : id;
}

/** Remap a cargo id that may be the -1 "none" sentinel of an order refit. */
function remapOptionalCargoId(value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return value;
  return remapCargoId(value);
}

/**
 * Grow one CARGO_COUNT-sized row of figures into the new table.
 *
 * A row that is already the new length is left exactly as it is - the corpus
 * trick of wrapping a CURRENT state in an old version header must not shift a
 * real table sideways - and so is a row of any other length, which the decoder
 * is the one to refuse (the v17_to_v18 precedent).
 */
function growCargoRow(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== CARGO_COUNT_V29) return value;
  const grown = new Array<number>(CARGO_COUNT).fill(0);
  for (let cargo = 0; cargo < CARGO_COUNT_V29; cargo++) {
    grown[remapCargoId(cargo)] = value[cargo] as number;
  }
  return grown;
}

/**
 * The same for the twelve-month station ring, whose cargo index is the middle
 * one of three (`(month * CARGO_COUNT + cargo) * fields + field`).
 */
function growHistoryRing(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== STATION_HISTORY_SIZE_V29) return value;
  const grown = new Array<number>(STATION_HISTORY_SIZE).fill(0);
  for (let month = 0; month < STATION_HISTORY_MONTHS_V29; month++) {
    for (let cargo = 0; cargo < CARGO_COUNT_V29; cargo++) {
      const from = (month * CARGO_COUNT_V29 + cargo) * STATION_HISTORY_FIELDS_V29;
      const to = (month * CARGO_COUNT + remapCargoId(cargo)) * STATION_HISTORY_FIELDS_V29;
      for (let field = 0; field < STATION_HISTORY_FIELDS_V29; field++) {
        grown[to + field] = value[from + field] as number;
      }
    }
  }
  return grown;
}

/** The month in progress, same layout without the month index. */
function growMonthCounters(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== STATION_MONTH_COUNTER_SIZE_V29) return value;
  const grown = new Array<number>(STATION_MONTH_COUNTER_SIZE).fill(0);
  for (let cargo = 0; cargo < CARGO_COUNT_V29; cargo++) {
    const from = cargo * STATION_HISTORY_FIELDS_V29;
    const to = remapCargoId(cargo) * STATION_HISTORY_FIELDS_V29;
    for (let field = 0; field < STATION_HISTORY_FIELDS_V29; field++) {
      grown[to + field] = value[from + field] as number;
    }
  }
  return grown;
}

/**
 * Give a station the empty return-journey ledger of SPEC2 M19's third bundle.
 *
 * Zero is not a convenience: it is what a version 29 world knew about itself.
 * That world never generated a return journey, so its `Generated` is nought;
 * and it banked no credit for one either, because the ledger did not exist
 * while its travellers were arriving. A migrated world therefore starts owing
 * nobody a way home and earns the right to send people back as fresh
 * passengers arrive - which is the same posture every other defaulting
 * migration in this file takes.
 *
 * A ledger that is ALREADY the current shape is left exactly as it is, for the
 * reason `growCargoRow` leaves a grown row alone: the corpus trick of wrapping
 * a current state in an old version header must not wipe a real ledger.
 */
function fillReturnLedger(station: Record<string, unknown>): Record<string, unknown> {
  const existing = station['returnState'];
  const state =
    Array.isArray(existing) && existing.length === RETURN_STATE_SIZE_V30
      ? existing
      : new Array<number>(RETURN_STATE_SIZE_V30).fill(0);
  const months = station['returnMonths'];
  return { returnState: state, returnMonths: typeof months === 'number' ? months : 0 };
}

/** Rewrite the `refitTo` of one order list, leaving everything else alone. */
function remapOrders(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((order) =>
    typeof order === 'object' && order !== null && !Array.isArray(order)
      ? {
          ...(order as Record<string, unknown>),
          refitTo: remapOptionalCargoId((order as Record<string, unknown>)['refitTo']),
        }
      : order,
  );
}

/** Rewrite the cargo id of every stack in a waiting or carried list. */
function remapStacks(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((stack) =>
    typeof stack === 'object' && stack !== null && !Array.isArray(stack)
      ? {
          ...(stack as Record<string, unknown>),
          cargo: remapOptionalCargoId((stack as Record<string, unknown>)['cargo']),
        }
      : stack,
  );
}

function mapSection(inner: Record<string, unknown>, key: string, fn: (entry: unknown) => unknown) {
  const section = inner[key];
  return Array.isArray(section) ? { [key]: section.map(fn) } : {};
}

function withFields(entry: unknown, fields: Record<string, unknown>): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
  return { ...(entry as Record<string, unknown>), ...fields };
}

/**
 * M19 split the passenger trade into two fare classes (SPEC2 E-08, M19's one
 * Z5 bump - v30), and this is the first migration in the chain that REMAPS
 * rather than defaults.
 *
 * A version 29 world knew one kind of passenger. This build knows two -
 * `CommuterPax`, which a residential or industrial zone offers, and
 * `BusinessPax`, which a commercial zone offers at 1.6 times the fare - and
 * the old id is retired rather than reused, so that no OTHER cargo has to
 * change its number. Every number that named a cargo therefore moves, and
 * nothing else about the world does:
 *
 *  - every waiting and carried parcel, every vehicle refit, every order and
 *    line-order `refitTo`, the AI's project cargo, a tender's cargo and a
 *    cargo goal's subject become `CommuterPax` where they were `Passengers`;
 *  - the two CARGO_COUNT-sized tables - a company's lifetime delivery tally
 *    and every station's twelve-month ring plus its month in progress - grow
 *    by two slots, with the old passenger figures moved to the commuter slot
 *    and the business slots entered as zero. Zero is not a convenience here
 *    either: that world earned no business fares, because it had none.
 *
 * The milestone's THIRD bundle extends this same migration in place rather
 * than opening a v31 (Z5 gives one bump per milestone, and it is spent): every
 * station also gets the empty return-journey ledger of `station/returns.ts`.
 * See `fillReturnLedger` for why empty is the honest value and not a shortcut.
 *
 * The COMMAND LOG is deliberately not remapped. A log is history rather than
 * state (D-131) and it is judged only by a build of its own version, because
 * cross-version replay verification is refused rather than guessed (E-11,
 * D-191). Rewriting a recorded `refitTo` would be inventing a command the
 * player never gave.
 *
 * This bump moves hashed world state - two cargo table rows reach the digest
 * through every station ring and every company row - so both pins were
 * re-recorded under their own protocols (D-137, D-130) and the corpus is the
 * evidence that nothing but the split moved.
 */
const v29_to_v30: SaveMigration = (payload) => {
  const inner = state(payload);

  return {
    ...payload,
    state: {
      ...inner,
      ...mapSection(inner, 'stations', (station) =>
        withFields(station, {
          waiting: remapStacks((station as Record<string, unknown>)['waiting']),
          history: growHistoryRing((station as Record<string, unknown>)['history']),
          monthCounters: growMonthCounters((station as Record<string, unknown>)['monthCounters']),
          // The third bundle of the same milestone extends this migration IN
          // PLACE rather than adding a v31 (Z5: one bump per milestone).
          ...fillReturnLedger(station as Record<string, unknown>),
        }),
      ),
      ...mapSection(inner, 'vehicles', (vehicle) =>
        withFields(vehicle, {
          cargo: remapStacks((vehicle as Record<string, unknown>)['cargo']),
          refitCargo: remapOptionalCargoId((vehicle as Record<string, unknown>)['refitCargo']),
          orders: remapOrders((vehicle as Record<string, unknown>)['orders']),
        }),
      ),
      ...mapSection(inner, 'lines', (line) =>
        withFields(line, { orders: remapOrders((line as Record<string, unknown>)['orders']) }),
      ),
      ...mapSection(inner, 'companies', (company) =>
        withFields(company, {
          cargoDeliveredUnits: growCargoRow(
            (company as Record<string, unknown>)['cargoDeliveredUnits'],
          ),
        }),
      ),
      ...mapSection(inner, 'contracts', (contract) =>
        withFields(contract, {
          cargo: remapOptionalCargoId((contract as Record<string, unknown>)['cargo']),
        }),
      ),
      ...mapSection(inner, 'goals', (goal) => {
        const raw = goal as Record<string, unknown>;
        // Only a CargoDeliveredTotal goal names a cargo in `subjectA`; every
        // other kind names a town, a run of days, or nothing at all, and
        // remapping those would silently re-aim the goal at another town.
        return raw['kind'] === GoalKind.CargoDeliveredTotal
          ? withFields(goal, { subjectA: remapOptionalCargoId(raw['subjectA']) })
          : goal;
      }),
      ...mapSection(inner, 'ai', (entry) => {
        const raw = entry as Record<string, unknown>;
        const project = raw['project'];
        if (typeof project !== 'object' || project === null || Array.isArray(project)) return entry;
        return withFields(entry, {
          project: withFields(project, {
            cargo: remapOptionalCargoId((project as Record<string, unknown>)['cargo']),
          }),
        });
      }),
    },
  };
};

/**
 * Keep a number a payload already carries; write the default only where the
 * field is missing.
 *
 * `withFields` overwrites, which is right for a field that cannot exist yet and
 * wrong the moment the corpus trick wraps a CURRENT state in an old version
 * header - the same rule `growCargoRow` and `fillReturnLedger` follow, and the
 * reason "migrates a v22 save to v23 without moving the world hash" is a test
 * that can be trusted.
 */
function keptNumbers(entry: unknown, defaults: Record<string, number>): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
  const raw = entry as Record<string, unknown>;
  const filled: Record<string, unknown> = { ...raw };
  for (const key of Object.keys(defaults)) {
    const value = raw[key];
    filled[key] = typeof value === 'number' && Number.isFinite(value) ? value : defaults[key]!;
  }
  return filled;
}

/**
 * M20 gave a town a body and then the whole of SPEC.md 13.2's growth formula
 * (SPEC2 M20's one Z5 bump - v31, spent by bundle 1 and extended in place here).
 *
 * Bundle 1's field is the road budget: the cap of three tiles a month needs a
 * counter to be a cap at all. Bundle 2 adds the building-material term of 13.2
 * and its twelve-month passenger window - historical inputs to the monthly
 * growth decision, and therefore save state rather than figures rebuilt on load
 * (Z4, Fehlerkatalog 23).
 *
 * A version 30 town never built anything, had never been offered a tonne of
 * cement and had no window: zero and an EMPTY window are not defaults chosen
 * for convenience, they are exactly what that world knew about itself. An empty
 * window is also self-repairing rather than wrong - `supplyMonths` 0 makes the
 * first month a true mean of one month, so a loaded town is judged on the
 * months it has actually played instead of on twelve months of invented zeros.
 *
 * The growth CURSOR is deliberately not migrated in, because it is not stored:
 * the town whose turn it is comes from the game day and the town count
 * (`town/growth.ts`), both of which a version 30 save already carries. Later
 * bundles of this milestone - the council elections - extend THIS migration in
 * place rather than adding a v32 (Z5).
 */
const v30_to_v31: SaveMigration = (payload) => {
  const inner = state(payload);
  return {
    ...payload,
    state: {
      ...inner,
      // Bundle 3's world rule. `?? false` rather than an overwrite, for
      // `keptNumbers`' reason: the corpus trick wraps a CURRENT state in an old
      // container, and a world that says it holds elections must not be told
      // it does not.
      elections: inner['elections'] ?? false,
      ...mapSection(inner, 'towns', (town) =>
        withMeasureSlots(
          keptNumbers(town, {
            roadTilesThisMonth: 0,
            buildingMaterialThisMonth: 0,
            supplyProducedMean: 0,
            supplyTransportedMean: 0,
            supplyMonths: 0,
            // Bundle 3: the zone economy's own counter, the council that is
            // sitting, and the walls nobody has paid for yet. A version 30
            // town had taken no radios this month, had never faced an election
            // (so it is Balanced, which is what every town is born with) and
            // had no barrier - none of which is a convenient default: it is
            // exactly what that world knew about itself.
            electronicsDeliveredThisMonth: 0,
            councilProfile: COUNCIL_PROFILE_BALANCED_V31,
          }),
        ),
      ),
    },
  };
};

// -------------------------------------------------- M21: the century curve

/**
 * M21 gave the world a century (SPEC2 M21's one Z5 bump - v32, E-09).
 *
 * Both fields enter a version 31 world as NOTHING, and here more literally than
 * anywhere else in this file:
 *
 *  - `economy` becomes false. Those worlds were played by an economy with no
 *    century at all: every delivery, every build bill, every month of industry
 *    output and every energy bill in the file was produced on a flat one.
 *    Entering `true` would hand a loaded save a hundred years of recessions it
 *    never had and move every band in the game under a player who changed
 *    nothing (Fehlerkatalog 34).
 *  - `economyCurve` becomes an EMPTY table - not a table of neutral thousands.
 *    A world with the rule off does not have a flat century, it has no century,
 *    and the two are told apart on purpose: the parser refuses a save whose
 *    rule and table disagree, `hashWorld` hashes nothing for the pair, and that
 *    is what makes this the rare bump that leaves every pin, every corpus
 *    fixture and every scenario claim exactly where it was.
 *
 * Fields already present are kept, for the reason `v30_to_v31` gives: the
 * corpus trick wraps a CURRENT state in an old container, and a world that says
 * it has a century must not be told it has none - which here would not merely
 * flatten it, it would make the pair inconsistent and the load would be refused.
 *
 * **Bundle 3 EXTENDS this step in place** (Z5: one bump per milestone, and the
 * milestone's later bundles extend the migration the first one owns). Three
 * more things enter a version 31 world as nothing:
 *
 *  - an ELEVENTH ledger account, `ContractPenalties`, which widens every row of
 *    every company's books - including the flat twenty-four month ring, which
 *    has to be re-laid row by row exactly as `v19_to_v20` re-laid it for the
 *    tenth. A version 31 world booked its broken tenders to `Construction`, so
 *    entering zero is the truth about the account and not a rounding: nothing
 *    that was ever charged is moved out of the account it was charged to, which
 *    would rewrite a history the player has already read.
 *  - the SUPPLY board and the SUBSIDY board, both empty. Both exist only in a
 *    world whose `economy` rule is on, and the monthly review puts the first
 *    offers up within a game month of a load - so a century world that is
 *    reloaded gets its boards back, and a world without a century never has
 *    them at all.
 *
 * **Bundle 4 EXTENDS it again, in the same place and for the same reason**
 * (Z5): the INDUSTRY EVENT board, empty. A version 31 world had no strikes and
 * no record harvests, and entering an empty list is the whole truth about it -
 * an event is a thing that is HAPPENING, so a world that was not having one is
 * a world with none, and the monthly roll starts offering them a game month
 * after a century world is loaded.
 */
const v31_to_v32: SaveMigration = (payload) => {
  const inner = state(payload);
  const economy = inner['economy'] ?? false;
  const companies = inner['companies'];
  if (!Array.isArray(companies)) {
    throw new SaveFormatError('save.state.companies: expected an array');
  }

  return {
    ...payload,
    state: {
      ...inner,
      economy,
      economyCurve: Array.isArray(inner['economyCurve']) ? inner['economyCurve'] : [],
      supplyContracts: inner['supplyContracts'] ?? [],
      nextSupplyContractId: inner['nextSupplyContractId'] ?? 0,
      subsidies: inner['subsidies'] ?? [],
      nextSubsidyId: inner['nextSubsidyId'] ?? 0,
      industryEvents: inner['industryEvents'] ?? [],
      companies: companies.map((entry, index) =>
        widenAccounts(entry as Record<string, unknown>, index, ACCOUNT_COUNT_V20),
      ),
    },
  };
};

/** Row width of a company's books at version 32 - a literal, per D-207. */
const ACCOUNT_COUNT_V32 = 11;

/**
 * Add one zero account to every row of one company's books, re-laying the flat
 * monthly ring rather than padding it at the end.
 *
 * Written once because `v19_to_v20` and `v31_to_v32` do exactly the same thing
 * eleven versions apart, and getting the ring wrong does not throw - it shears
 * every historical month by one account and the finance panel shows plausible
 * nonsense.
 */
function widenAccounts(
  company: Record<string, unknown>,
  index: number,
  oldCount: number,
): Record<string, unknown> {
  const widen = (value: unknown, path: string): number[] => {
    if (!Array.isArray(value)) throw new SaveFormatError(`${path}: expected an array`);
    return [...(value as number[]), 0];
  };
  const history = company['monthHistory'];
  if (!Array.isArray(history)) {
    throw new SaveFormatError(`save.state.companies[${index}].monthHistory: expected an array`);
  }
  // A state that already carries the new width is a corpus fixture: the trick
  // that writes them wraps a CURRENT state in an old container, and widening
  // one of those would produce a twelve-wide row the parser refuses.
  const accounts = company['accounts'];
  if (Array.isArray(accounts) && accounts.length === ACCOUNT_COUNT_V32) return company;

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
  };
}

/**
 * The measure count on each side of this migration, as LITERALS.
 *
 * A migration writes the shape of its OWN target version and never the shape
 * the live constants happen to have - the trap D-207 found latent in
 * `v24_to_v25` and `v27_to_v28`, where a zero-fill sized from `CARGO_COUNT`
 * would have written today's width into a save that was on its way to a
 * version that did not have it. If a later milestone adds an eighth measure,
 * v31 still has seven and this step must still write seven.
 */
const TOWN_MEASURE_COUNT_V30 = 5;
const TOWN_MEASURE_COUNT_V31 = 7;

/** `CouncilProfile.Balanced`, written out for the same reason. */
const COUNCIL_PROFILE_BALANCED_V31 = 0;

/**
 * Re-lay `measureReadyTick` for the two measures SPEC2 M20 adds, and fill the
 * barrier list.
 *
 * The cooldown list is COMPANY-MAJOR with the measure count as its stride, so
 * growing the count from five to seven moves every company but the first: what
 * was company 1's tree cooldown at index 5 is company 0's sponsorship slot now.
 * A flat ring re-laid row by row, exactly like the tenth ledger account of
 * `v18_to_v19` - and getting it wrong would not throw, it would silently hand
 * one company another's cooldowns.
 *
 * The exposure is stated rather than papered over: a list THIS build wrote,
 * wrapped in a version 30 container by the corpus trick, cannot be told apart
 * from a real version 30 one and would be re-laid a second time. It does not
 * arise, and the reason is checkable rather than hopeful - no fixture in
 * `tests/corpus` and no world in `save.spec.ts` buys a town measure, so every
 * list that reaches this function through those doors is EMPTY and an empty
 * list is returned untouched. `tests/unit/save.spec.ts` asserts that emptiness
 * directly, so the day somebody gives a fixture a campaign the claim goes red
 * instead of the hash going quietly wrong.
 */
function withMeasureSlots(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
  const raw = entry as Record<string, unknown>;
  const filled: Record<string, unknown> = { ...raw };

  const barrier = raw['noiseBarrierUntilTick'];
  filled['noiseBarrierUntilTick'] = Array.isArray(barrier) ? barrier : [];

  const slots = raw['measureReadyTick'];
  if (!Array.isArray(slots) || slots.length === 0) return filled;
  // A list already this build's shape - the corpus trick again - is left
  // alone. A version 30 list is a multiple of the OLD stride and can only be
  // read one way; anything longer than the old stride would allow has already
  // been re-laid.
  const relaid: number[] = [];
  for (let index = 0; index < slots.length; index++) {
    const value = slots[index];
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
    const company = Math.floor(index / TOWN_MEASURE_COUNT_V30);
    const measure = index % TOWN_MEASURE_COUNT_V30;
    relaid[company * TOWN_MEASURE_COUNT_V31 + measure] = value;
  }
  for (let index = 0; index < relaid.length; index++) {
    if (relaid[index] === undefined) relaid[index] = 0;
  }
  filled['measureReadyTick'] = relaid;
  return filled;
}

/**
 * M22 gave the game a scenario workshop (SPEC2 M22's one Z5 bump - v33).
 *
 * One field, and it enters a version 32 world as `false` for a reason that is
 * the whole of it: `editorMode` suspends the funds check and the ownership
 * check, and every world ever recorded by this game was played by a company
 * that paid for what it built and owned the ground it stood on. Entering `true`
 * would hand a loaded save a world in which nothing costs anything - not merely
 * a different balance, a different set of ACCEPTED commands, which is law #3
 * broken in the file (Fehlerkatalog 24).
 *
 * The five new command kinds of the same milestone need nothing here: a command
 * kind is a number in a log, and a log written by an older build cannot contain
 * one that did not exist. History is judged only by a build of its own version
 * (D-131, E-11).
 *
 * A field already present is kept, for the reason `v30_to_v31` gives: the
 * corpus trick wraps a CURRENT state in an old container, and a workshop world
 * must not be told it is a game.
 */
const v32_to_v33: SaveMigration = (payload) => {
  const inner = state(payload);
  return {
    ...payload,
    state: { ...inner, editorMode: inner['editorMode'] ?? false },
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
  [12, v12_to_v13],
  [13, v13_to_v14],
  [14, v14_to_v15],
  [15, v15_to_v16],
  [16, v16_to_v17],
  [17, v17_to_v18],
  [18, v18_to_v19],
  [19, v19_to_v20],
  [20, v20_to_v21],
  [21, v21_to_v22],
  [22, v22_to_v23],
  [23, v23_to_v24],
  [24, v24_to_v25],
  [25, v25_to_v26],
  [26, v26_to_v27],
  [27, v27_to_v28],
  [28, v28_to_v29],
  [29, v29_to_v30],
  [30, v30_to_v31],
  [31, v31_to_v32],
  [32, v32_to_v33],
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
