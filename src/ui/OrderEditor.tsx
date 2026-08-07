import type { ReactElement } from 'react';
import { t } from '../i18n';
import type { OrderMarker, StationMarker, VehicleMarker } from '../shared/protocol';
import { cargoSpec } from '../sim/cargo/types';
import { TICKS_PER_DAY } from '../sim/constants';
import { WaypointKind, WAYPOINT_KIND_KEYS, waypointServes } from '../sim/map/waypoints';
import { ModuleKind } from '../sim/station/types';
import { VehicleKind } from '../sim/vehicles/catalog';
import {
  OrderConditionKind,
  OrderLoad,
  OrderTarget,
  OrderUnload,
} from '../sim/vehicles/VehicleStore';
import { refitTargets } from './refit';
import { useSimStore } from './store';
import { stationAtTile } from './TilePanel';

/**
 * The order editor of section 12.1, shared by the fleet panel (a vehicle's
 * private schedule) and the line panel (a line's shared schedule) - one
 * editor, so the two grammars cannot drift apart.
 *
 * Every control mutates a COPY of the marker's order list and hands the whole
 * of it to `onSend`, which compiles it into ONE command; the panel re-renders
 * when the worker echoes the change back. The sim stays the only authority -
 * an edit it refuses simply never comes back, and the toast names the reason.
 */

/** Marker -> wire form, verbatim: the marker already carries the full grammar. */
export function toSpec(order: OrderMarker): OrderMarker {
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

/** A fresh, unconditional order with everything at its neutral default. */
function plainMarker(target: number, targetId: number, load: number, unload: number): OrderMarker {
  return {
    target,
    targetId,
    load,
    unload,
    refitTo: -1,
    waitTicks: 0,
    condKind: OrderConditionKind.None,
    condComparator: 0,
    condValue: 0,
    condJumpTo: 0,
  };
}

export function OrderEditor({
  orders,
  vehicle,
  stations,
  mapSize,
  labelKey,
  onSend,
}: {
  readonly orders: readonly OrderMarker[];
  /**
   * The vehicle the list belongs to, or null for a line that has no vehicle
   * yet - refit choices and mode filtering then wait until one is assigned,
   * and the sim validates the pairing when it is.
   */
  readonly vehicle: VehicleMarker | null;
  readonly stations: readonly StationMarker[];
  readonly mapSize: number;
  readonly labelKey: string;
  readonly onSend: (next: readonly OrderMarker[]) => void;
}): ReactElement {
  const selectedTile = useSimStore((s) => s.selectedTile);

  const patch = (index: number, changes: Partial<OrderMarker>): void => {
    onSend(orders.map((order, i) => (i === index ? { ...order, ...changes } : order)));
  };

  const swap = (index: number, other: number): void => {
    if (other < 0 || other >= orders.length) return;
    const next = [...orders];
    const held = next[index]!;
    next[index] = next[other]!;
    next[other] = held;
    // Jump targets follow the orders they point at, so a reorder cannot
    // silently bend a condition to another stop.
    onSend(
      next.map((order) => {
        if (order.condKind === OrderConditionKind.None) return order;
        const jump =
          order.condJumpTo === index ? other : order.condJumpTo === other ? index : order.condJumpTo;
        return { ...order, condJumpTo: jump };
      }),
    );
  };

  const remove = (index: number): void => {
    const next = orders.filter((_, i) => i !== index);
    // A jump past the removed order moves up one; one AT it lands on whatever
    // follows. Cleared entirely when the list shrinks past its target.
    onSend(
      next.map((order) => {
        if (order.condKind === OrderConditionKind.None) return order;
        let jump = order.condJumpTo;
        if (jump > index) jump--;
        if (jump >= next.length) {
          return {
            ...order,
            condKind: OrderConditionKind.None,
            condComparator: 0,
            condValue: 0,
            condJumpTo: 0,
          };
        }
        return { ...order, condJumpTo: jump };
      }),
    );
  };

  const append = (order: OrderMarker): void => {
    onSend([...orders, order]);
  };

  /** What a click on the map has selected, translated into an order target. */
  const tileIndex = selectedTile === null ? -1 : selectedTile.y * mapSize + selectedTile.x;
  const stationHere =
    selectedTile === null ? undefined : stationAtTile(stations, selectedTile.x, selectedTile.y);
  const depotKinds: readonly ModuleKind[] =
    vehicle === null
      ? [ModuleKind.RoadDepot, ModuleKind.RailDepot, ModuleKind.ShipDepot]
      : vehicle.kind === VehicleKind.Train
        ? [ModuleKind.RailDepot]
        : vehicle.kind === VehicleKind.Ship
          ? [ModuleKind.ShipDepot]
          : [ModuleKind.RoadDepot];
  const depotHere =
    stationHere !== undefined &&
    selectedTile !== null &&
    stationHere.modules.some(
      (m) =>
        m.x === selectedTile.x &&
        m.y === selectedTile.y &&
        depotKinds.includes(m.kind as ModuleKind),
    );
  const waypointHere =
    selectedTile !== null &&
    (vehicle === null
      ? selectedTile.waypoint !== WaypointKind.None
      : waypointServes(selectedTile.waypoint, vehicle.kind));

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
        {t(labelKey, { count: orders.length })}
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
              {vehicle !== null && (
                <RefitChoice vehicle={vehicle} order={order} index={index} patch={patch} />
              )}
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
            append(
              plainMarker(OrderTarget.Station, stationHere.id, OrderLoad.Partial, OrderUnload.All),
            )
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
              append(plainMarker(OrderTarget.Depot, tileIndex, OrderLoad.None, OrderUnload.None))
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
              append(plainMarker(OrderTarget.Waypoint, tileIndex, OrderLoad.None, OrderUnload.None))
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
