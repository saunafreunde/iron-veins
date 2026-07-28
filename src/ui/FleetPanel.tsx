import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { CommandKind } from '../sim/commands/types';
import { DEADLOCK_WARN_TICKS, TICK_SECONDS, MAX_TRAIN_LENGTH_M } from '../sim/constants';
import { ModuleKind } from '../sim/station/types';
import {
  availableRailVehicles,
  availableVehicles,
  RailRole,
  vehicleSpec,
  VehicleKind,
} from '../sim/vehicles/catalog';
import { aggregateConsist, validateConsist } from '../sim/vehicles/consist';
import { VehicleState, VEHICLE_STATE_KEYS } from '../sim/vehicles/VehicleStore';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';
import { stationAtTile } from './TilePanel';

/**
 * Buying vehicles and giving them their orders.
 *
 * Orders are built by pointing at a station on the map and appending it, which
 * is the smallest thing that is genuinely usable. The full order editor of
 * section 12 - conditional jumps, refits, timetables - belongs with the
 * milestones that need them.
 *
 * A train is assembled before it is bought: the panel shows what the
 * composition weighs, how long it is and how fast it will go, because those
 * three numbers are the whole decision (section 11.2).
 */

/** OrderTarget.Station / OrderLoad.Partial / OrderUnload.All as plain values. */
const ORDER_STATION = 0;
const ORDER_LOAD_PARTIAL = 1;
const ORDER_UNLOAD_ALL = 0;

function kmh(speedMs: number): number {
  return Math.round(speedMs * 3.6);
}

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

  const station =
    selectedTile === null ? undefined : stationAtTile(stations, selectedTile.x, selectedTile.y);
  const moduleHere =
    station === undefined || selectedTile === null
      ? undefined
      : station.modules.find((m) => m.x === selectedTile.x && m.y === selectedTile.y);
  const isRoadDepot = moduleHere?.kind === ModuleKind.RoadDepot;
  const isRailDepot = moduleHere?.kind === ModuleKind.RailDepot;
  const isShipyard = moduleHere?.kind === ModuleKind.ShipDepot;

  const selected = fleet.find((vehicle) => vehicle.id === selectedVehicleId);
  const buyable = availableVehicles(VehicleKind.Road, year);
  const buyableShips = availableVehicles(VehicleKind.Ship, year);

  const appendOrder = (): void => {
    if (selected === undefined || station === undefined) return;
    const stops = [...selected.orderStationIds, station.id];
    client.send({
      kind: CommandKind.SetVehicleOrders,
      vehicleId: selected.id,
      orders: stops.map((id) => ({
        target: ORDER_STATION,
        targetId: id,
        load: ORDER_LOAD_PARTIAL,
        unload: ORDER_UNLOAD_ALL,
      })),
    });
  };

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

      {!isRoadDepot && !isRailDepot && !isShipyard && (
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
          <span className="field__label field__label--spaced">
            {t('ui.fleet.orders', { count: selected.orderStationIds.length })}
          </span>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={station === undefined}
              onClick={appendOrder}
            >
              {station === undefined
                ? t('ui.fleet.pickStation')
                : t('ui.fleet.addStop', { name: station.name })}
            </button>
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
        </>
      )}
    </section>
  );
}
