import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { CommandKind } from '../sim/commands/types';
import { availableVehicles, vehicleSpec, VehicleKind } from '../sim/vehicles/catalog';
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
 */

/** OrderTarget.Station / OrderLoad.Partial / OrderUnload.All as plain values. */
const ORDER_STATION = 0;
const ORDER_LOAD_PARTIAL = 1;
const ORDER_UNLOAD_ALL = 0;

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
  const isDepotTile =
    station !== undefined &&
    selectedTile !== null &&
    station.modules.some((m) => m.x === selectedTile.x && m.y === selectedTile.y && m.kind === 2);

  const selected = fleet.find((vehicle) => vehicle.id === selectedVehicleId);
  const buyable = availableVehicles(VehicleKind.Road, year);

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

      {isDepotTile ? (
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
      ) : (
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
                <span>{t(vehicleSpec(vehicle.specId).nameKey)}</span>
                <span className="row__meta">
                  {t(VEHICLE_STATE_KEYS[vehicle.state] ?? '')} · {vehicle.cargoUnits}/
                  {vehicle.capacity} · {formatMoney(vehicle.earnedCt)}
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
