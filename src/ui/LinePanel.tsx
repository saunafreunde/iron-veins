import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { LineMarker } from '../shared/protocol';
import { CommandKind } from '../sim/commands/types';
import { TICKS_PER_DAY } from '../sim/constants';
import { vehicleSpec } from '../sim/vehicles/catalog';
import { ListPanel, type Column } from './ListPanel';
import { OrderEditor, toSpec } from './OrderEditor';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The line list and the line detail of section 12.2 - the L key's panel.
 *
 * Every number shown here was recomputed from the stores on the worker side
 * (lines/metrics.ts): the panel displays, it never accumulates. The round
 * time comes from the measured D-077 legs, and while any leg is still the
 * straight-line 54 km/h seed the figure is MARKED as an estimate - a guess
 * with the same face as a measurement would be worse than no number.
 */

/** A line's display name. Lines have no free names; the id is the name. */
function lineName(line: LineMarker): string {
  return t('ui.line.name', { line: line.id + 1 });
}

/** Round time in whole game days, the unit the player plans in. */
function roundDays(line: LineMarker): number {
  return Math.round(line.roundTicks / TICKS_PER_DAY);
}

function roundLabel(line: LineMarker): string {
  if (line.stops.length < 2) return '—';
  const days = t('ui.line.roundDays', { days: roundDays(line) });
  // The D-077 estimate marker: a tilde before the figure, spelled out in the
  // detail panel below.
  return line.roundMeasured ? days : `~${days}`;
}

export function LinePanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const lines = useSimStore((s) => s.lines);
  const selectedLineId = useSimStore((s) => s.selectedLineId);
  const setSelectedLine = useSimStore((s) => s.setSelectedLine);

  const selected = lines.find((line) => line.id === selectedLineId);

  const columns: ReadonlyArray<Column<LineMarker>> = [
    { key: 'name', labelKey: 'ui.list.name', render: lineName, sortBy: (l) => l.id },
    {
      key: 'vehicles',
      labelKey: 'ui.line.vehicles',
      render: (l) => `${l.vehicleIds.length}`,
      sortBy: (l) => l.vehicleIds.length,
    },
    {
      key: 'utilisation',
      labelKey: 'ui.line.utilisation',
      render: (l) => `${Math.round(l.utilisation * 100)} %`,
      sortBy: (l) => l.utilisation,
    },
    {
      key: 'profit',
      labelKey: 'ui.line.profitYear',
      render: (l) => formatMoney(l.profitPerYearCt),
      sortBy: (l) => l.profitPerYearCt,
      className: (l) => (l.profitPerYearCt < 0 ? 'row__meta value--danger' : 'row__meta'),
    },
    {
      key: 'round',
      labelKey: 'ui.line.roundTime',
      render: roundLabel,
      sortBy: (l) => l.roundTicks,
    },
  ];

  return (
    <>
      <ListPanel
        titleKey="ui.list.lines"
        rows={lines}
        columns={columns}
        idOf={(line) => line.id}
        searchText={lineName}
        onSelect={(line) => setSelectedLine(line.id === selectedLineId ? null : line.id)}
        selectedId={selectedLineId}
        filters={[
          {
            key: 'unprofitable',
            labelKey: 'ui.line.unprofitable',
            matches: (line) => line.profitPerYearCt < 0,
          },
          {
            key: 'uncrewed',
            labelKey: 'ui.line.uncrewed',
            matches: (line) => line.vehicleIds.length === 0,
          },
        ]}
      />
      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => client.send({ kind: CommandKind.CreateLine })}
        >
          {t('ui.line.create')}
        </button>
      </div>
      {selected !== undefined && <LineDetail client={client} line={selected} />}
    </>
  );
}

/** Stops, rules and metrics of one line - and its shared order editor. */
function LineDetail({
  client,
  line,
}: {
  readonly client: SimClient;
  readonly line: LineMarker;
}): ReactElement {
  const stations = useSimStore((s) => s.stations);
  const fleet = useSimStore((s) => s.fleet);
  const mapSize = useSimStore((s) => s.mapSize);
  const setSelectedLine = useSimStore((s) => s.setSelectedLine);
  const setSelectedVehicle = useSimStore((s) => s.setSelectedVehicle);

  // The editor's mode filtering and refit choices follow the line's first
  // vehicle; an uncrewed line edits freely and the sim validates on assign.
  const leadVehicle = fleet.find((vehicle) => vehicle.id === line.vehicleIds[0]) ?? null;

  return (
    <section className="panel">
      <h2 className="panel__title">{lineName(line)}</h2>

      <dl className="readout">
        <div>
          <dt>{t('ui.line.vehicles')}</dt>
          <dd className="value value--mono">{line.vehicleIds.length}</dd>
        </div>
        <div>
          <dt>{t('ui.line.utilisation')}</dt>
          <dd className="value value--mono">{Math.round(line.utilisation * 100)} %</dd>
        </div>
        <div>
          <dt>{t('ui.line.profitYear')}</dt>
          <dd className={line.profitPerYearCt < 0 ? 'value value--danger' : 'value'}>
            {formatMoney(line.profitPerYearCt)}
          </dd>
        </div>
        <div>
          <dt>{t('ui.line.roundTime')}</dt>
          <dd className="value value--mono">{roundLabel(line)}</dd>
        </div>
      </dl>
      {/* The 54 km/h straight-line fallback leg, VISIBLY named an estimate
          (D-077): until every leg has been driven, the round time is a seed,
          not a measurement. */}
      {!line.roundMeasured && line.stops.length >= 2 && (
        <p className="panel__hint">{t('ui.line.roundEstimate')}</p>
      )}

      {line.stops.length > 0 && (
        <>
          <span className="field__label field__label--spaced">{t('ui.line.stops')}</span>
          <ul className="list">
            {line.stops.map((stop, index) => (
              <li key={`${stop.stationId}-${index}`}>
                <span className="row">
                  <span>
                    {index + 1}.{' '}
                    {stations.find((s) => s.id === stop.stationId)?.name ??
                      t('ui.order.goneStation')}
                  </span>
                  <span className="row__meta">
                    {t('ui.line.waiting', { units: stop.waitingUnits })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {line.vehicleIds.length > 0 && (
        <>
          <span className="field__label field__label--spaced">{t('ui.line.crew')}</span>
          <div className="button-row">
            {line.vehicleIds.map((vehicleId) => {
              const vehicle = fleet.find((entry) => entry.id === vehicleId);
              return (
                <button
                  key={vehicleId}
                  type="button"
                  className="button"
                  onClick={() => setSelectedVehicle(vehicleId)}
                >
                  {vehicle === undefined ? `#${vehicleId}` : t(vehicleSpec(vehicle.specId).nameKey)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* The per-line auto-renewal of section 11.3 - the rule D-093 parked on
          the company until lines existed lives HERE now. */}
      <label className="panel__hint">
        <input
          type="checkbox"
          checked={line.autoRenew}
          onChange={(event) =>
            client.send({
              kind: CommandKind.SetAutoRenew,
              lineId: line.id,
              enabled: event.target.checked,
            })
          }
        />{' '}
        {t('ui.line.autoRenew')}
      </label>

      <OrderEditor
        orders={line.orders}
        vehicle={leadVehicle}
        stations={stations}
        mapSize={mapSize}
        labelKey="ui.line.orders"
        onSend={(next) =>
          client.send({
            kind: CommandKind.SetLineOrders,
            lineId: line.id,
            orders: next.map(toSpec),
          })
        }
      />

      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            client.send({ kind: CommandKind.DeleteLine, lineId: line.id });
            setSelectedLine(null);
          }}
        >
          {t('ui.line.delete')}
        </button>
      </div>
    </section>
  );
}
