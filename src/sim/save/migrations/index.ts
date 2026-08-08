import { LEDGER_HISTORY_MONTHS, TILE_PUBLIC } from '../../constants';
import { ACCOUNT_COUNT } from '../../economy/ledger';
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
          history: previous['history'] ?? new Array<number>(STATION_HISTORY_SIZE).fill(0),
          historyCursor: previous['historyCursor'] ?? 0,
          monthCounters:
            previous['monthCounters'] ?? new Array<number>(STATION_MONTH_COUNTER_SIZE).fill(0),
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
 * M15 made the two route-cost terms of SPEC.md 8.4 world rules (SPEC2 M15,
 * the milestone's one Z5 bump): `occupancyPenalty`, which charges the train
 * pathfinder for a section another train has claimed, and `signalPenalty`,
 * which charges it for passing a signal.
 *
 * Both enter a version 25 world as OFF, and that is not a convenient default
 * but the only true one: those worlds were driven by a pathfinder that had
 * neither term, so every route in the file was chosen without them. Turning
 * either on here would silently re-route a loaded save's whole fleet at the
 * first departure and move the balance bands of M6 under a player who changed
 * nothing (SPEC2 Fehlerkatalog 34).
 *
 * Fields already present are kept, so the corpus trick of wrapping a CURRENT
 * state in an old container cannot flatten a real rule back to off.
 */
const v25_to_v26: SaveMigration = (payload) => {
  const inner = state(payload);
  return {
    ...payload,
    state: {
      ...inner,
      occupancyPenalty: inner['occupancyPenalty'] ?? false,
      signalPenalty: inner['signalPenalty'] ?? false,
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
