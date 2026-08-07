import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { VehicleMarker } from '../shared/protocol';
import { inflatedCostCt } from '../sim/cargo/payment';
import { cargoSpec } from '../sim/cargo/types';
import { CommandKind } from '../sim/commands/types';
import {
  DEADLOCK_WARN_TICKS,
  REFIT_COST_SHARE,
  TICK_SECONDS,
  MAX_TRAIN_LENGTH_M,
} from '../sim/constants';
import { isAirModule, ModuleKind } from '../sim/station/types';
import {
  availableRailVehicles,
  availableVehicles,
  RailRole,
  vehicleSpec,
  VehicleKind,
} from '../sim/vehicles/catalog';
import { aggregateConsist, validateConsist } from '../sim/vehicles/consist';
import { VehicleState, VEHICLE_STATE_KEYS } from '../sim/vehicles/VehicleStore';
import { OrderEditor, toSpec } from './OrderEditor';
import { refitTargets, standsInDepot } from './refit';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';
import { stationAtTile } from './TilePanel';
import { VehicleDetail } from './VehicleDetail';

/**
 * Buying vehicles and giving them their orders.
 *
 * The order editor (OrderEditor.tsx, shared with the line panel) covers the
 * full grammar of section 12.1; every edit compiles the WHOLE list into ONE
 * SetVehicleOrders command - the sim never sees a half-changed schedule. A
 * vehicle on a LINE shows the line's list read-only here: the line panel is
 * where a shared schedule is edited, and an explicit private edit would take
 * the vehicle off its line (section 12.2).
 *
 * A train is assembled before it is bought: the panel shows what the
 * composition weighs, how long it is and how fast it will go, because those
 * three numbers are the whole decision (section 11.2).
 */

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
          {/* The M14 vehicle detail: statistics, manifest, depot call and
              follow camera - shown for whatever the click selected. */}
          <VehicleDetail client={client} vehicle={selected} />
          {selected.lineId >= 0 ? (
            <LineMembership client={client} vehicle={selected} />
          ) : (
            <>
              <OrderEditor
                orders={selected.orders}
                vehicle={selected}
                stations={stations}
                mapSize={mapSize}
                labelKey="ui.fleet.orders"
                activeIndex={selected.orderIndex}
                onSend={(next) =>
                  client.send({
                    kind: CommandKind.SetVehicleOrders,
                    vehicleId: selected.id,
                    orders: next.map(toSpec),
                  })
                }
              />
              <AssignRow client={client} vehicle={selected} />
            </>
          )}
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
 * What the panel says about a vehicle that RUNS A LINE: its schedule is the
 * line's, edited in the line panel - and the release button is the way back
 * to a private list (section 12.2).
 */
function LineMembership({
  client,
  vehicle,
}: {
  readonly client: SimClient;
  readonly vehicle: VehicleMarker;
}): ReactElement {
  const setSelectedLine = useSimStore((s) => s.setSelectedLine);
  const toggleList = useSimStore((s) => s.toggleList);
  const openList = useSimStore((s) => s.openList);

  return (
    <div className="button-row">
      <span className="panel__hint">
        {t('ui.fleet.onLine', { line: vehicle.lineId + 1 })}
      </span>
      <button
        type="button"
        className="button"
        onClick={() => {
          setSelectedLine(vehicle.lineId);
          if (openList !== 'lines') toggleList('lines');
        }}
      >
        {t('ui.fleet.showLine')}
      </button>
      <button
        type="button"
        className="button"
        onClick={() =>
          client.send({ kind: CommandKind.ReleaseVehicleFromLine, vehicleId: vehicle.id })
        }
      >
        {t('ui.fleet.releaseFromLine')}
      </button>
    </div>
  );
}

/** Put a private vehicle on one of the company's lines (section 12.2). */
function AssignRow({
  client,
  vehicle,
}: {
  readonly client: SimClient;
  readonly vehicle: VehicleMarker;
}): ReactElement | null {
  const lines = useSimStore((s) => s.lines);
  if (lines.length === 0) return null;

  return (
    <div className="button-row">
      <span className="panel__hint">{t('ui.fleet.assignToLine')}</span>
      {lines.map((line) => (
        <button
          key={line.id}
          type="button"
          className="button"
          onClick={() =>
            client.send({
              kind: CommandKind.AssignVehicleToLine,
              vehicleId: vehicle.id,
              lineId: line.id,
            })
          }
        >
          {t('ui.line.name', { line: line.id + 1 })}
        </button>
      ))}
    </div>
  );
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
