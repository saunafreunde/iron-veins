import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { OrderMarker, StationMarker, VehicleMarker } from '../shared/protocol';
import { inflatedCostCt } from '../sim/cargo/payment';
import { cargoSpec } from '../sim/cargo/types';
import { CommandKind, type OrderSpec } from '../sim/commands/types';
import {
  DEADLOCK_WARN_TICKS,
  REFIT_COST_SHARE,
  TICK_SECONDS,
  TICKS_PER_DAY,
  MAX_TRAIN_LENGTH_M,
} from '../sim/constants';
import { WAYPOINT_KIND_KEYS, waypointServes } from '../sim/map/waypoints';
import { isAirModule, ModuleKind } from '../sim/station/types';
import {
  availableRailVehicles,
  availableVehicles,
  RailRole,
  vehicleSpec,
  VehicleKind,
} from '../sim/vehicles/catalog';
import { aggregateConsist, validateConsist } from '../sim/vehicles/consist';
import {
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
  VehicleState,
  VEHICLE_STATE_KEYS,
} from '../sim/vehicles/VehicleStore';
import { refitTargets, standsInDepot } from './refit';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';
import { stationAtTile } from './TilePanel';

/**
 * Buying vehicles and giving them their orders.
 *
 * The order editor covers the full grammar of section 12.1: stop rows that can
 * be reordered and removed, per-stop load/unload/refit/dwell, depot and
 * waypoint targets, and a conditional-jump row per order. Every edit compiles
 * the WHOLE list into ONE SetVehicleOrders command - the sim never sees a
 * half-changed schedule.
 *
 * A train is assembled before it is bought: the panel shows what the
 * composition weighs, how long it is and how fast it will go, because those
 * three numbers are the whole decision (section 11.2).
 */

function kmh(speedMs: number): number {
  return Math.round(speedMs * 3.6);
}

/** Marker -> wire form, verbatim: the marker already carries the full grammar. */
function toSpec(order: OrderMarker): OrderSpec {
  return { ...order };
}

/** Translation keys per OrderLoad value. */
const LOAD_KEYS: readonly string[] = [
  'ui.order.load.full',
  'ui.order.load.partial',
  'ui.order.load.none',
  'ui.order.load.fullAny',
];

/** Translation keys per OrderUnload value. */
const UNLOAD_KEYS: readonly string[] = [
  'ui.order.unload.all',
  'ui.order.unload.none',
  'ui.order.unload.transfer',
  'ui.order.unload.forced',
];

/** Condition kinds in menu order; index 0 is "no condition" (-1). */
const CONDITION_CHOICES: ReadonlyArray<{ readonly kind: number; readonly labelKey: string }> = [
  { kind: OrderConditionKind.None, labelKey: 'ui.order.cond.none' },
  { kind: OrderConditionKind.LoadPercent, labelKey: 'ui.order.cond.load' },
  { kind: OrderConditionKind.Reliability, labelKey: 'ui.order.cond.reliability' },
  { kind: OrderConditionKind.AgeYears, labelKey: 'ui.order.cond.age' },
  { kind: OrderConditionKind.WaitingDays, labelKey: 'ui.order.cond.waiting' },
  { kind: OrderConditionKind.DateYear, labelKey: 'ui.order.cond.date' },
];

/**
 * The comparators, as mathematics rather than words - one symbol per
 * OrderComparator value, language-neutral like the signal arrows.
 */
const COMPARATOR_SYMBOLS: readonly string[] = ['<', '≤', '=', '≠', '≥', '>'];

/** Dwell choices offered by the editor, in game days. */
const WAIT_DAY_CHOICES: readonly number[] = [0, 1, 2, 3, 5, 10, 15, 30];

/** Assemble-and-buy panel, shown when the selected tile is a rail depot. */
function TrainBuilder({
  client,
  x,
  y,
}: {
  readonly client: SimClient;
  readonly x: number;
  readonly y: number;
}): ReactElement {
  const year = useSimStore((s) => s.year);
  const cashCt = useSimStore((s) => s.cashCt);
  const draft = useSimStore((s) => s.trainDraft);
  const addUnit = useSimStore((s) => s.addTrainUnit);
  const removeUnit = useSimStore((s) => s.removeTrainUnit);
  const clearDraft = useSimStore((s) => s.clearTrainDraft);

  const traction = availableRailVehicles(RailRole.Traction, year);
  const wagons = availableRailVehicles(RailRole.Wagon, year);
  const problem = validateConsist(draft, year);
  const summary = aggregateConsist(draft);
  const affordable = summary.priceCt <= cashCt;

  return (
    <>
      <span className="field__label">{t('ui.train.assemble')}</span>
      <div className="button-row">
        {traction.map((spec) => (
          <button key={spec.id} type="button" className="button" onClick={() => addUnit(spec.id)}>
            {t(spec.nameKey)} ({formatMoney(spec.priceCt)})
          </button>
        ))}
      </div>

      <span className="field__label field__label--spaced">{t('ui.train.wagons')}</span>
      <div className="button-row">
        {wagons.map((spec) => (
          <button key={spec.id} type="button" className="button" onClick={() => addUnit(spec.id)}>
            {t(spec.nameKey)} ({formatMoney(spec.priceCt)})
          </button>
        ))}
      </div>

      <span className="field__label field__label--spaced">
        {t('ui.train.draft', { count: draft.length })}
      </span>
      {draft.length === 0 ? (
        <p className="panel__hint">{t('ui.train.draftEmpty')}</p>
      ) : (
        <>
          <div className="button-row">
            {draft.map((specId, index) => (
              <button
                key={`${specId}-${index}`}
                type="button"
                className="button"
                onClick={() => removeUnit(index)}
              >
                {index + 1}. {t(vehicleSpec(specId).nameKey)} ✕
              </button>
            ))}
          </div>

          <dl className="readout">
            <div>
              <dt>{t('ui.train.length')}</dt>
              <dd
                className={
                  summary.lengthM > MAX_TRAIN_LENGTH_M ? 'value value--danger' : 'value value--mono'
                }
              >
                {Math.round(summary.lengthM)} / {MAX_TRAIN_LENGTH_M} m
              </dd>
            </div>
            <div>
              <dt>{t('ui.train.mass')}</dt>
              <dd className="value value--mono">{Math.round(summary.massKg / 1000)} t</dd>
            </div>
            <div>
              <dt>{t('ui.train.tractive')}</dt>
              <dd className="value value--mono">{Math.round(summary.tractiveN / 1000)} kN</dd>
            </div>
            <div>
              <dt>{t('ui.train.speed')}</dt>
              <dd className="value value--mono">{kmh(summary.maxSpeedMs)} km/h</dd>
            </div>
            <div>
              <dt>{t('ui.train.price')}</dt>
              <dd className={affordable ? 'value' : 'value value--danger'}>
                {formatMoney(summary.priceCt)}
              </dd>
            </div>
          </dl>
        </>
      )}

      {problem !== null && draft.length > 0 && (
        <p className="panel__hint value--danger">{t(problem)}</p>
      )}

      <div className="button-row">
        <button
          type="button"
          className="button button--active"
          disabled={problem !== null || !affordable}
          onClick={() => {
            client.send({ kind: CommandKind.BuyTrain, x, y, specIds: [...draft] });
            clearDraft();
          }}
        >
          {t('ui.train.buy')}
        </button>
        <button type="button" className="button" onClick={clearDraft}>
          {t('ui.train.clear')}
        </button>
      </div>
    </>
  );
}

export function FleetPanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const fleet = useSimStore((s) => s.fleet);
  const stations = useSimStore((s) => s.stations);
  const selectedTile = useSimStore((s) => s.selectedTile);
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const setSelectedVehicle = useSimStore((s) => s.setSelectedVehicle);
  const year = useSimStore((s) => s.year);
  const mapSize = useSimStore((s) => s.mapSize);

  const station =
    selectedTile === null ? undefined : stationAtTile(stations, selectedTile.x, selectedTile.y);
  const moduleHere =
    station === undefined || selectedTile === null
      ? undefined
      : station.modules.find((m) => m.x === selectedTile.x && m.y === selectedTile.y);
  const isRoadDepot = moduleHere?.kind === ModuleKind.RoadDepot;
  const isRailDepot = moduleHere?.kind === ModuleKind.RailDepot;
  const isShipyard = moduleHere?.kind === ModuleKind.ShipDepot;
  const isAirport = moduleHere !== undefined && isAirModule(moduleHere.kind);

  const selected = fleet.find((vehicle) => vehicle.id === selectedVehicleId);
  const buyable = availableVehicles(VehicleKind.Road, year);
  const buyableShips = availableVehicles(VehicleKind.Ship, year);
  const buyableAircraft = availableVehicles(VehicleKind.Aircraft, year);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.fleet.title')}</h2>

      {isRoadDepot && (
        <>
          <span className="field__label">{t('ui.fleet.buyHere')}</span>
          <div className="button-row">
            {buyable.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="button"
                onClick={() =>
                  client.send({
                    kind: CommandKind.BuyRoadVehicle,
                    x: selectedTile!.x,
                    y: selectedTile!.y,
                    specId: spec.id,
                  })
                }
              >
                {t(spec.nameKey)} ({formatMoney(spec.priceCt)})
              </button>
            ))}
          </div>
        </>
      )}

      {isRailDepot && selectedTile !== null && (
        <TrainBuilder client={client} x={selectedTile.x} y={selectedTile.y} />
      )}

      {isShipyard && (
        <>
          <span className="field__label">{t('ui.fleet.buyHere')}</span>
          <div className="button-row">
            {buyableShips.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="button"
                onClick={() =>
                  client.send({
                    kind: CommandKind.BuyShip,
                    x: selectedTile!.x,
                    y: selectedTile!.y,
                    specId: spec.id,
                  })
                }
              >
                {t(spec.nameKey)} ({formatMoney(spec.priceCt)})
              </button>
            ))}
          </div>
        </>
      )}

      {isAirport && (
        <>
          <span className="field__label">{t('ui.fleet.buyHere')}</span>
          <div className="button-row">
            {buyableAircraft.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="button"
                onClick={() =>
                  client.send({
                    kind: CommandKind.BuyAircraft,
                    x: selectedTile!.x,
                    y: selectedTile!.y,
                    specId: spec.id,
                  })
                }
              >
                {t(spec.nameKey)} ({formatMoney(spec.priceCt)})
              </button>
            ))}
          </div>
        </>
      )}

      {!isRoadDepot && !isRailDepot && !isShipyard && !isAirport && (
        <p className="panel__hint">{t('ui.fleet.selectDepot')}</p>
      )}

      {fleet.length === 0 ? (
        <p className="panel__hint">{t('ui.fleet.empty')}</p>
      ) : (
        <ul className="list">
          {fleet.map((vehicle) => (
            <li key={vehicle.id}>
              <button
                type="button"
                className={vehicle.id === selectedVehicleId ? 'row row--active' : 'row'}
                onClick={() => setSelectedVehicle(vehicle.id)}
              >
                <span>
                  {t(vehicleSpec(vehicle.specId).nameKey)}
                  {vehicle.consist.length > 1 &&
                    ` ${t('ui.fleet.plusWagons', { count: vehicle.consist.length - 1 })}`}
                </span>
                <span
                  className={
                    vehicle.waitingTicks >= DEADLOCK_WARN_TICKS
                      ? 'row__meta value--danger'
                      : 'row__meta'
                  }
                >
                  {vehicle.waitingTicks >= DEADLOCK_WARN_TICKS
                    ? t('ui.fleet.stuck', {
                        minutes: Math.round((vehicle.waitingTicks * TICK_SECONDS) / 60),
                      })
                    : t(VEHICLE_STATE_KEYS[vehicle.state] ?? '')}{' '}
                  · {vehicle.cargoUnits}/{vehicle.capacity} · {kmh(vehicle.maxSpeedMs)} km/h ·{' '}
                  {formatMoney(vehicle.earnedCt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected !== undefined && (
        <>
          <OrderEditor
            client={client}
            vehicle={selected}
            stations={stations}
            mapSize={mapSize}
          />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() =>
                client.send({
                  kind: CommandKind.SetVehicleOrders,
                  vehicleId: selected.id,
                  orders: [],
                })
              }
            >
              {t('ui.fleet.clearOrders')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                client.send({
                  kind: CommandKind.SetVehicleRunning,
                  vehicleId: selected.id,
                  running: selected.state === VehicleState.Stopped,
                })
              }
            >
              {selected.state === VehicleState.Stopped ? t('ui.fleet.start') : t('ui.fleet.stop')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                client.send({ kind: CommandKind.SellVehicle, vehicleId: selected.id });
                setSelectedVehicle(null);
              }}
            >
              {t('ui.fleet.sell')}
            </button>
          </div>

          <RefitRow client={client} vehicle={selected} mapSize={mapSize} year={year} />
        </>
      )}
    </section>
  );
}

/**
 * The order editor of section 12.1.
 *
 * Every control mutates a COPY of the marker's order list and sends the whole
 * of it as one SetVehicleOrders command; the panel re-renders when the worker
 * echoes the change back. The sim stays the only authority - an edit it
 * refuses simply never comes back, and the toast names the reason.
 */
function OrderEditor({
  client,
  vehicle,
  stations,
  mapSize,
}: {
  readonly client: SimClient;
  readonly vehicle: VehicleMarker;
  readonly stations: readonly StationMarker[];
  readonly mapSize: number;
}): ReactElement {
  const selectedTile = useSimStore((s) => s.selectedTile);
  const orders = vehicle.orders;

  const send = (next: readonly OrderMarker[]): void => {
    client.send({
      kind: CommandKind.SetVehicleOrders,
      vehicleId: vehicle.id,
      orders: next.map(toSpec),
    });
  };

  const patch = (index: number, changes: Partial<OrderMarker>): void => {
    send(orders.map((order, i) => (i === index ? { ...order, ...changes } : order)));
  };

  const swap = (index: number, other: number): void => {
    if (other < 0 || other >= orders.length) return;
    const next = [...orders];
    const held = next[index]!;
    next[index] = next[other]!;
    next[other] = held;
    // Jump targets follow the orders they point at, so a reorder cannot
    // silently bend a condition to another stop.
    send(
      next.map((order) => {
        if (order.condKind === OrderConditionKind.None) return order;
        const jump = order.condJumpTo === index ? other : order.condJumpTo === other ? index : order.condJumpTo;
        return { ...order, condJumpTo: jump };
      }),
    );
  };

  const remove = (index: number): void => {
    const next = orders.filter((_, i) => i !== index);
    // A jump past the removed order moves up one; one AT it lands on whatever
    // follows. Cleared entirely when the list shrinks past its target.
    send(
      next.map((order) => {
        if (order.condKind === OrderConditionKind.None) return order;
        let jump = order.condJumpTo;
        if (jump > index) jump--;
        if (jump >= next.length) {
          return { ...order, condKind: OrderConditionKind.None, condComparator: 0, condValue: 0, condJumpTo: 0 };
        }
        return { ...order, condJumpTo: jump };
      }),
    );
  };

  const append = (order: OrderMarker): void => {
    send([...orders, order]);
  };

  /** What a click on the map has selected, translated into an order target. */
  const tileIndex = selectedTile === null ? -1 : selectedTile.y * mapSize + selectedTile.x;
  const stationHere =
    selectedTile === null ? undefined : stationAtTile(stations, selectedTile.x, selectedTile.y);
  const depotKind =
    vehicle.kind === VehicleKind.Train
      ? ModuleKind.RailDepot
      : vehicle.kind === VehicleKind.Ship
        ? ModuleKind.ShipDepot
        : ModuleKind.RoadDepot;
  const depotHere =
    stationHere !== undefined &&
    selectedTile !== null &&
    stationHere.modules.some(
      (m) => m.x === selectedTile.x && m.y === selectedTile.y && m.kind === depotKind,
    );
  const waypointHere =
    selectedTile !== null && waypointServes(selectedTile.waypoint, vehicle.kind);

  const targetLabel = (order: OrderMarker): string => {
    if (order.target === OrderTarget.Station) {
      return stations.find((s) => s.id === order.targetId)?.name ?? t('ui.order.goneStation');
    }
    const x = order.targetId % mapSize;
    const y = (order.targetId / mapSize) | 0;
    if (order.target === OrderTarget.Depot) return t('ui.order.depotAt', { x, y });
    return t('ui.order.waypointAt', { x, y });
  };

  return (
    <>
      <span className="field__label field__label--spaced">
        {t('ui.fleet.orders', { count: orders.length })}
      </span>

      {orders.map((order, index) => (
        <div className="order-row" key={index}>
          <div className="button-row">
            <span className="value">
              {index + 1}. {targetLabel(order)}
            </span>
            <button
              type="button"
              className="button"
              disabled={index === 0}
              onClick={() => swap(index, index - 1)}
            >
              ▲
            </button>
            <button
              type="button"
              className="button"
              disabled={index === orders.length - 1}
              onClick={() => swap(index, index + 1)}
            >
              ▼
            </button>
            <button type="button" className="button" onClick={() => remove(index)}>
              ✕
            </button>
          </div>

          {order.target === OrderTarget.Station && (
            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={() => patch(index, { load: (order.load + 1) % LOAD_KEYS.length })}
              >
                {t('ui.order.load')}: {t(LOAD_KEYS[order.load] ?? '')}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => patch(index, { unload: (order.unload + 1) % UNLOAD_KEYS.length })}
              >
                {t('ui.order.unload')}: {t(UNLOAD_KEYS[order.unload] ?? '')}
              </button>
              <RefitChoice vehicle={vehicle} order={order} index={index} patch={patch} />
            </div>
          )}

          <div className="button-row">
            <label className="panel__hint">
              {t('ui.order.wait')}{' '}
              <select
                value={Math.round(order.waitTicks / TICKS_PER_DAY)}
                onChange={(event) =>
                  patch(index, { waitTicks: Number(event.target.value) * TICKS_PER_DAY })
                }
              >
                {WAIT_DAY_CHOICES.map((days) => (
                  <option key={days} value={days}>
                    {t('ui.order.waitDays', { days })}
                  </option>
                ))}
              </select>
            </label>
            <ConditionRow order={order} index={index} count={orders.length} patch={patch} />
          </div>
        </div>
      ))}

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={stationHere === undefined}
          onClick={() =>
            stationHere !== undefined &&
            append({
              target: OrderTarget.Station,
              targetId: stationHere.id,
              load: OrderLoad.Partial,
              unload: OrderUnload.All,
              refitTo: -1,
              waitTicks: 0,
              condKind: OrderConditionKind.None,
              condComparator: 0,
              condValue: 0,
              condJumpTo: 0,
            })
          }
        >
          {stationHere === undefined
            ? t('ui.fleet.pickStation')
            : t('ui.fleet.addStop', { name: stationHere.name })}
        </button>
        {depotHere && (
          <button
            type="button"
            className="button"
            onClick={() =>
              append({
                target: OrderTarget.Depot,
                targetId: tileIndex,
                load: OrderLoad.None,
                unload: OrderUnload.None,
                refitTo: -1,
                waitTicks: 0,
                condKind: OrderConditionKind.None,
                condComparator: 0,
                condValue: 0,
                condJumpTo: 0,
              })
            }
          >
            {t('ui.fleet.addDepot')}
          </button>
        )}
        {waypointHere && selectedTile !== null && (
          <button
            type="button"
            className="button"
            onClick={() =>
              append({
                target: OrderTarget.Waypoint,
                targetId: tileIndex,
                load: OrderLoad.None,
                unload: OrderUnload.None,
                refitTo: -1,
                waitTicks: 0,
                condKind: OrderConditionKind.None,
                condComparator: 0,
                condValue: 0,
                condJumpTo: 0,
              })
            }
          >
            {t('ui.fleet.addWaypoint', {
              kind: t(WAYPOINT_KIND_KEYS[selectedTile.waypoint] ?? ''),
            })}
          </button>
        )}
      </div>
    </>
  );
}

/** The per-order refit choice: the cargos this vehicle can be converted to. */
function RefitChoice({
  vehicle,
  order,
  index,
  patch,
}: {
  readonly vehicle: VehicleMarker;
  readonly order: OrderMarker;
  readonly index: number;
  readonly patch: (index: number, changes: Partial<OrderMarker>) => void;
}): ReactElement | null {
  const targets = refitTargets(vehicle);
  if (targets.length < 2) return null;

  return (
    <label className="panel__hint">
      {t('ui.order.refit')}{' '}
      <select
        value={order.refitTo}
        onChange={(event) => patch(index, { refitTo: Number(event.target.value) })}
      >
        <option value={-1}>{t('ui.order.refitNone')}</option>
        {targets.map(({ cargo }) => (
          <option key={cargo} value={cargo}>
            {t(cargoSpec(cargo).nameKey)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The conditional jump of one order: kind, comparator, value, target. */
function ConditionRow({
  order,
  index,
  count,
  patch,
}: {
  readonly order: OrderMarker;
  readonly index: number;
  readonly count: number;
  readonly patch: (index: number, changes: Partial<OrderMarker>) => void;
}): ReactElement {
  const jumpChoices: number[] = [];
  for (let i = 0; i < count; i++) jumpChoices.push(i);

  return (
    <label className="panel__hint">
      {t('ui.order.condition')}{' '}
      <select
        value={order.condKind}
        onChange={(event) => {
          const kind = Number(event.target.value);
          if (kind === OrderConditionKind.None) {
            patch(index, { condKind: kind, condComparator: 0, condValue: 0, condJumpTo: 0 });
          } else {
            patch(index, { condKind: kind });
          }
        }}
      >
        {CONDITION_CHOICES.map((choice) => (
          <option key={choice.kind} value={choice.kind}>
            {t(choice.labelKey)}
          </option>
        ))}
      </select>
      {order.condKind !== OrderConditionKind.None && (
        <>
          {' '}
          <select
            value={order.condComparator}
            onChange={(event) => patch(index, { condComparator: Number(event.target.value) })}
          >
            {COMPARATOR_SYMBOLS.map((symbol, value) => (
              <option key={symbol} value={value}>
                {symbol}
              </option>
            ))}
          </select>{' '}
          <input
            type="number"
            className="order-row__value"
            defaultValue={order.condValue}
            key={`${conditionKeyOf(order)}:${order.condValue}`}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value !== order.condValue) {
                patch(index, { condValue: value });
              }
            }}
          />{' '}
          {t('ui.order.jumpTo')}{' '}
          <select
            value={order.condJumpTo}
            onChange={(event) => patch(index, { condJumpTo: Number(event.target.value) })}
          >
            {jumpChoices.map((target) => (
              <option key={target} value={target}>
                {target + 1}
              </option>
            ))}
          </select>
        </>
      )}
    </label>
  );
}

/** A stable-enough key for the uncontrolled value input of one condition. */
function conditionKeyOf(order: OrderMarker): string {
  return `${order.target}:${order.targetId}:${order.condKind}`;
}

/**
 * The refit choice of section 11: a depot action, one button per cargo the
 * vehicle can be converted to. Shown exactly when the sim would accept the
 * command - which, per D-076, includes a freshly bought vehicle that is
 * Stopped on its depot tile and has never moved.
 */
function RefitRow({
  client,
  vehicle,
  mapSize,
  year,
}: {
  readonly client: SimClient;
  readonly vehicle: VehicleMarker;
  readonly mapSize: number;
  readonly year: number;
}): ReactElement | null {
  const stations = useSimStore((s) => s.stations);
  if (!standsInDepot(vehicle, stations, mapSize)) return null;

  const targets = refitTargets(vehicle);
  // One possible cargo means there is nothing to choose.
  if (targets.length < 2) return null;

  // The same arithmetic as the command: a share of the purchase price, at
  // this year's price level (section 14.2).
  const priceCt =
    vehicle.consist.length > 0
      ? aggregateConsist(vehicle.consist).priceCt
      : vehicleSpec(vehicle.specId).priceCt;
  const refitCt = inflatedCostCt(Math.round(priceCt * REFIT_COST_SHARE), year, true);

  return (
    <>
      <span className="field__label field__label--spaced">
        {t('ui.fleet.refit', { price: formatMoney(refitCt) })}
      </span>
      {vehicle.cargoUnits > 0 && <p className="panel__hint">{t('ui.fleet.refitNotEmpty')}</p>}
      <div className="button-row">
        {targets.map(({ cargo, capacity }) => (
          <button
            key={cargo}
            type="button"
            className="button"
            disabled={vehicle.cargoUnits > 0}
            onClick={() =>
              client.send({ kind: CommandKind.RefitVehicle, vehicleId: vehicle.id, cargo })
            }
          >
            {t(cargoSpec(cargo).nameKey)} ({capacity})
          </button>
        ))}
      </div>
    </>
  );
}
