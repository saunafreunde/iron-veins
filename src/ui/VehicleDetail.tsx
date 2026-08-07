import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { OrderMarker, VehicleMarker } from '../shared/protocol';
import { CommandKind } from '../sim/commands/types';
import { RELIABILITY_MAX } from '../sim/constants';
import { OrderTarget } from '../sim/vehicles/VehicleStore';
import { manifestDisplayRows } from './manifest';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The vehicle detail of the M14 statistics centre (SPEC2 M14): age against
 * design life, reliability, the lifetime breakdown tally, running cost
 * against revenue, and the manifest with its paid-up-to distances - every
 * number computed by the simulation and shipped on the marker channel, never
 * re-derived here. Plus the two buttons the milestone ordered: "send to
 * depot" (the one-shot diversion command) and the follow camera (a render
 * fact, no sim contact).
 */
export function VehicleDetail({
  client,
  vehicle,
}: {
  readonly client: SimClient;
  readonly vehicle: VehicleMarker;
}): ReactElement {
  useSimStore((s) => s.locale);
  const stations = useSimStore((s) => s.stations);
  const mapSize = useSimStore((s) => s.mapSize);
  const followId = useSimStore((s) => s.followVehicleId);
  const setFollow = useSimStore((s) => s.setFollowVehicle);
  const following = followId === vehicle.id;

  const current =
    vehicle.orders.length === 0
      ? undefined
      : vehicle.orders[vehicle.orderIndex % vehicle.orders.length];
  const currentLabel = (order: OrderMarker): string => {
    if (order.target === OrderTarget.Station) {
      return stations.find((s) => s.id === order.targetId)?.name ?? t('ui.order.goneStation');
    }
    const x = order.targetId % mapSize;
    const y = (order.targetId / mapSize) | 0;
    return order.target === OrderTarget.Depot
      ? t('ui.order.depotAt', { x, y })
      : t('ui.order.waypointAt', { x, y });
  };

  const rows = manifestDisplayRows(vehicle.manifest, stations);
  const obsolete = vehicle.ageYears > vehicle.lifetimeYears;
  // Earnings against the SAME yearly cadence the upkeep figure has - an
  // honest comparison needs matching units, and a vehicle younger than a
  // year has no yearly rate worth printing.
  const perYearCt = vehicle.ageYears >= 1 ? vehicle.earnedCt / vehicle.ageYears : null;

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.vehicle.title')}</span>
      <dl className="readout">
        <div>
          <dt>{t('ui.vehicle.age')}</dt>
          <dd className={obsolete ? 'value value--warning' : 'value'}>
            {t('ui.vehicle.ageValue', {
              age: vehicle.ageYears.toFixed(1),
              life: vehicle.lifetimeYears,
            })}
            {obsolete && ` ${t('ui.vehicle.obsolete')}`}
          </dd>
        </div>
        <div>
          <dt>{t('ui.vehicle.reliability')}</dt>
          <dd className="value value--mono">
            {Math.round((vehicle.reliability / RELIABILITY_MAX) * 100)} %
          </dd>
        </div>
        <div>
          <dt>{t('ui.vehicle.breakdowns')}</dt>
          <dd className="value value--mono">{vehicle.breakdownCount}</dd>
        </div>
        <div>
          <dt>{t('ui.vehicle.upkeep')}</dt>
          <dd className="value value--warning">{formatMoney(vehicle.upkeepPerYearCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.vehicle.earned')}</dt>
          <dd className="value">
            {formatMoney(vehicle.earnedCt)}
            {perYearCt !== null &&
              ` (${t('ui.vehicle.earnedPerYear', { amount: formatMoney(perYearCt) })})`}
          </dd>
        </div>
        {current !== undefined && (
          <div>
            <dt>{t('ui.vehicle.currentOrder')}</dt>
            <dd className="value">
              {(vehicle.orderIndex % vehicle.orders.length) + 1}. {currentLabel(current)}
            </dd>
          </div>
        )}
      </dl>

      <span className="field__label field__label--spaced">{t('ui.vehicle.manifest')}</span>
      {rows.length === 0 ? (
        <p className="panel__hint">{t('ui.vehicle.manifestEmpty')}</p>
      ) : (
        <ul className="list">
          {rows.map((row, index) => (
            <li key={index}>
              <div className="row">
                <span>
                  {row.units} × {t(row.cargoKey)} →{' '}
                  {row.destinationName ?? t('ui.vehicle.noDestination')}
                </span>
                <span className="row__meta">
                  {t('ui.vehicle.parcelMeta', { days: row.ageDays, tiles: row.openTiles })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {vehicle.depotCall && <p className="panel__hint">{t('ui.vehicle.depotCallPending')}</p>}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={vehicle.depotCall}
          onClick={() =>
            client.send({ kind: CommandKind.SendVehicleToDepot, vehicleId: vehicle.id })
          }
        >
          {t('ui.vehicle.sendToDepot')}
        </button>
        <button
          type="button"
          className={following ? 'button button--active' : 'button'}
          onClick={() => setFollow(following ? null : vehicle.id)}
        >
          {following ? t('ui.vehicle.following') : t('ui.vehicle.follow')}
        </button>
      </div>
    </>
  );
}
