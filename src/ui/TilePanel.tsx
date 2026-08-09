import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { IndustryMarker, StationMarker } from '../shared/protocol';
import {
  AUTO_SIGNAL_SPACING_TILES,
  CANOPY_COST_CT,
  AIRPORT_COST_CT,
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_STOCK_MONTHS,
  QUAY_COST_CT,
  SHIP_DEPOT_COST_CT,
  INDUSTRY_WARNING_MONTHS,
  COLD_STORE_COST_CT,
  FREIGHT_TERMINAL_COST_CT,
  RAIL_DEPOT_COST_CT,
  RAIL_PLATFORM_COST_CT,
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  SIGNAL_COST_CT,
  TERRAFORM_COST_PER_STEP_CT,
  WAYPOINT_COST_CT,
} from '../sim/constants';
import { inflatedCostCt } from '../sim/cargo/payment';
import { CommandKind } from '../sim/commands/types';
import { INDUSTRY_SPECS } from '../sim/industry/types';
import {
  isOneWay,
  SIGNAL_KIND_KEYS,
  signalDirection,
  signalKind,
  SignalKind,
} from '../sim/map/signals';
import { WAYPOINT_KIND_KEYS } from '../sim/map/waypoints';
import { TERRAIN_NAME_KEYS } from '../sim/map/terrain';
import { SCREEN_ARROWS } from './signalCycle';
import { platformLength, type ModuleKind, type Station } from '../sim/station/types';
import { RAIL_TYPE_COST_CT, RailType } from '../sim/map/track';
import { ConnectPanel } from './ConnectPanel';
import { CouncilPanel } from './CouncilPanel';
import { DeliveryPanel } from './DeliveryPanel';
import { StationXray } from './StationPanel';
import type { SimClient } from './SimClient';
import { useSimStore, type Tool } from './store';
import { TOOL_REGISTRY } from './tools';
import { Tooltip } from './Tooltip';

/**
 * Price shown under the active tool, so the cost is known before the click.
 *
 * Every figure passes through the same inflation the simulation charges at
 * (section 14.2), because a preview that disagrees with the bill is the exact
 * frustration section 17.3 exists to prevent.
 */
function priceHint(tool: Tool, year: number): string {
  const at = (baseCt: number): number => inflatedCostCt(baseCt, year, true);
  switch (tool) {
    case 'road':
      return t('ui.tool.priceRoad', { amount: formatMoney(at(ROAD_COST_PER_TILE_CT)) });
    case 'track':
      return t('ui.tool.priceTrack', {
        amount: formatMoney(at(RAIL_TYPE_COST_CT[RailType.Plain]!)),
      });
    case 'stop':
      // Both shapes, both prices (D-210): a stop on the carriageway, and the
      // same stop beside it with the one tile of road that reaches it.
      return t('ui.tool.priceStop', {
        amount: formatMoney(at(ROAD_STOP_COST_CT)),
        bay: formatMoney(at(ROAD_STOP_COST_CT + ROAD_COST_PER_TILE_CT)),
      });
    case 'depot':
      return t('ui.tool.priceDepot', {
        amount: formatMoney(at(ROAD_DEPOT_COST_CT)),
        bay: formatMoney(at(ROAD_DEPOT_COST_CT + ROAD_COST_PER_TILE_CT)),
      });
    case 'platform':
      return t('ui.tool.pricePlatform', { amount: formatMoney(at(RAIL_PLATFORM_COST_CT)) });
    case 'raildepot':
      return t('ui.tool.priceRailDepot', { amount: formatMoney(at(RAIL_DEPOT_COST_CT)) });
    case 'airstrip':
      return t('ui.tool.priceAirstrip', { amount: formatMoney(at(AIRPORT_COST_CT[0]!)) });
    case 'airport':
      return t('ui.tool.priceAirport', { amount: formatMoney(at(AIRPORT_COST_CT[1]!)) });
    case 'intlairport':
      return t('ui.tool.priceIntlAirport', { amount: formatMoney(at(AIRPORT_COST_CT[2]!)) });
    case 'quay':
      return t('ui.tool.priceQuay', { amount: formatMoney(at(QUAY_COST_CT)) });
    case 'shipdepot':
      return t('ui.tool.priceShipDepot', { amount: formatMoney(at(SHIP_DEPOT_COST_CT)) });
    case 'freightterminal':
      return t('ui.tool.priceFreightTerminal', {
        amount: formatMoney(at(FREIGHT_TERMINAL_COST_CT)),
      });
    case 'canopy':
      return t('ui.tool.priceCanopy', { amount: formatMoney(at(CANOPY_COST_CT)) });
    case 'coldstore':
      return t('ui.tool.priceColdStore', { amount: formatMoney(at(COLD_STORE_COST_CT)) });
    case 'signal':
      return t('ui.tool.priceSignal', { amount: formatMoney(at(SIGNAL_COST_CT)) });
    case 'pathsignal':
      return t('ui.tool.pricePathSignal', { amount: formatMoney(at(SIGNAL_COST_CT)) });
    case 'waypoint':
      return t('ui.tool.priceWaypoint', { amount: formatMoney(at(WAYPOINT_COST_CT)) });
    case 'raise':
    case 'lower':
    case 'level':
      return t('ui.tool.priceTerraform', { amount: formatMoney(at(TERRAFORM_COST_PER_STEP_CT)) });
    case 'demolish':
      return t('ui.tool.priceDemolish');
    case 'connect':
      return t('ui.tool.hintConnect');
    case 'none':
      return t('ui.tool.hintSelect');
  }
}

/** Industry whose footprint covers a tile, if any. */
function industryAtTile(
  industries: readonly IndustryMarker[],
  x: number,
  y: number,
): IndustryMarker | undefined {
  return industries.find((industry) => {
    const size = INDUSTRY_SPECS[industry.type]?.footprint ?? 1;
    return x >= industry.x && x < industry.x + size && y >= industry.y && y < industry.y + size;
  });
}

/** Station whose modules cover a tile, if any. */
export function stationAtTile(
  stations: readonly StationMarker[],
  x: number,
  y: number,
): StationMarker | undefined {
  return stations.find((station) => station.modules.some((m) => m.x === x && m.y === y));
}

export function TilePanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const hovered = useSimStore((s) => s.hoveredTile);
  const selected = useSimStore((s) => s.selectedTile);
  const tool = useSimStore((s) => s.tool);
  const year = useSimStore((s) => s.year);
  const setTool = useSimStore((s) => s.setTool);
  const autoSignal = useSimStore((s) => s.autoSignal);
  const setAutoSignal = useSimStore((s) => s.setAutoSignal);
  const assistant = useSimStore((s) => s.assistant);
  const setAssistant = useSimStore((s) => s.setAssistant);
  const towns = useSimStore((s) => s.towns);
  const stations = useSimStore((s) => s.stations);
  const industries = useSimStore((s) => s.industries);
  const roadAnchor = useSimStore((s) => s.roadAnchor);
  const trackPreview = useSimStore((s) => s.trackPreview);
  const roadStopPreview = useSimStore((s) => s.roadStopPreview);

  const tile = hovered ?? selected;
  const town = tile !== null && tile.townId >= 0 ? towns[tile.townId] : undefined;
  const station = tile === null ? undefined : stationAtTile(stations, tile.x, tile.y);
  const industry = tile === null ? undefined : industryAtTile(industries, tile.x, tile.y);

  const platformTiles =
    station === undefined
      ? 0
      : platformLength({
          modules: station.modules.map((module) => ({
            kind: module.kind as ModuleKind,
            tileIndex: 0,
            x: module.x,
            y: module.y,
          })),
        } as Station);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.tile.title')}</h2>

      <div className="button-row">
        {TOOL_REGISTRY.map((entry) => (
          <Tooltip key={entry.id} textKey={entry.tooltipKey}>
            <button
              type="button"
              className={entry.id === tool ? 'button button--active' : 'button'}
              onClick={() => setTool(entry.id)}
            >
              {t(entry.labelKey)}
            </button>
          </Tooltip>
        ))}
      </div>
      <p className="panel__hint">{priceHint(tool, year)}</p>
      {tool === 'track' && (
        <label className="panel__hint">
          <input
            type="checkbox"
            checked={autoSignal}
            onChange={(event) => setAutoSignal(event.target.checked)}
          />{' '}
          {t('ui.tool.autoSignal', { spacing: AUTO_SIGNAL_SPACING_TILES })}
        </label>
      )}
      {(tool === 'track' || tool === 'connect') && (
        <label className="panel__hint">
          <input
            type="checkbox"
            checked={assistant}
            onChange={(event) => setAssistant(event.target.checked)}
          />{' '}
          {t('ui.tool.assistant')}
        </label>
      )}
      {(tool === 'track' || tool === 'connect') && !assistant && (
        <p className="panel__hint">{t('ui.tool.manualHint')}</p>
      )}
      {(tool === 'signal' || tool === 'pathsignal') && (
        <p className="panel__hint">{t('ui.tool.signalCycleHint')}</p>
      )}
      {(tool === 'road' || tool === 'track') && (
        <p className="panel__hint">
          {roadAnchor === null
            ? t('ui.tool.roadFirst')
            : t('ui.tool.roadSecond', { x: roadAnchor.x, y: roadAnchor.y })}
        </p>
      )}

      {(tool === 'stop' || tool === 'depot') && roadStopPreview !== null && (
        <>
          <span className="field__label field__label--spaced">{t('ui.preview.title')}</span>
          {roadStopPreview.reasonKey !== null ? (
            <p className="panel__hint value--danger">{t(roadStopPreview.reasonKey)}</p>
          ) : (
            <dl className="readout">
              <div>
                <dt>{t('ui.preview.cost')}</dt>
                <dd className="value">{formatMoney(roadStopPreview.costCt)}</dd>
              </div>
              <div>
                <dt>{t('ui.preview.roadStopShape')}</dt>
                <dd className="value">
                  {t(roadStopPreview.bay ? 'ui.preview.roadStopBay' : 'ui.preview.roadStopThrough')}
                </dd>
              </div>
            </dl>
          )}
        </>
      )}

      {tool === 'track' && trackPreview !== null && (
        <>
          <span className="field__label field__label--spaced">{t('ui.preview.title')}</span>
          {trackPreview.reasonKey !== null ? (
            <p className="panel__hint value--danger">{t(trackPreview.reasonKey)}</p>
          ) : (
            <dl className="readout">
              <div>
                <dt>{t('ui.preview.cost')}</dt>
                <dd className="value">{formatMoney(trackPreview.costCt)}</dd>
              </div>
              <div>
                <dt>{t('ui.preview.length')}</dt>
                <dd className="value value--mono">{Math.round(trackPreview.lengthM)} m</dd>
              </div>
              <div>
                <dt>{t('ui.preview.radius')}</dt>
                <dd className="value value--mono">
                  {Number.isFinite(trackPreview.minRadiusM)
                    ? `${Math.round(trackPreview.minRadiusM)} m`
                    : t('ui.preview.straight')}
                </dd>
              </div>
              <div>
                <dt>{t('ui.preview.grade')}</dt>
                <dd className="value value--mono">{trackPreview.maxGradePermille.toFixed(0)} ‰</dd>
              </div>
              <div>
                <dt>{t('ui.preview.speed')}</dt>
                <dd className="value value--mono">
                  {Number.isFinite(trackPreview.maxSpeedMs)
                    ? `${Math.round(trackPreview.maxSpeedMs * 3.6)} km/h`
                    : '-'}
                </dd>
              </div>
            </dl>
          )}
        </>
      )}

      {tile === null ? (
        <p className="panel__hint">{t('ui.tile.none')}</p>
      ) : (
        <dl className="readout">
          <div>
            <dt>{t('ui.tile.position')}</dt>
            <dd className="value value--mono">
              {tile.x}, {tile.y}
            </dd>
          </div>
          <div>
            <dt>{t('ui.tile.height')}</dt>
            <dd className="value value--mono">{tile.height}</dd>
          </div>
          <div>
            <dt>{t('ui.tile.terrain')}</dt>
            <dd className="value">{t(TERRAIN_NAME_KEYS[tile.terrain] ?? '')}</dd>
          </div>
          <div>
            <dt>{t('ui.tile.town')}</dt>
            <dd className="value">{town?.name ?? t('ui.tile.openCountry')}</dd>
          </div>
          {signalKind(tile.signal) !== SignalKind.None && (
            <div>
              <dt>{t('ui.tile.signal')}</dt>
              <dd className="value">
                {t(SIGNAL_KIND_KEYS[signalKind(tile.signal)] ?? '')}
                {isOneWay(signalKind(tile.signal))
                  ? ` ${SCREEN_ARROWS[signalDirection(tile.signal)]}`
                  : ''}
              </dd>
            </div>
          )}
          {tile.waypoint !== 0 && (
            <div>
              <dt>{t('ui.tile.waypoint')}</dt>
              <dd className="value">{t(WAYPOINT_KIND_KEYS[tile.waypoint] ?? '')}</dd>
            </div>
          )}
        </dl>
      )}

      <ConnectPanel client={client} />

      {town !== undefined && <CouncilPanel town={town} client={client} />}

      {station !== undefined && (
        <>
          <span className="field__label field__label--spaced">{t('ui.station.title')}</span>
          <dl className="readout">
            <div>
              <dt>{t('ui.station.name')}</dt>
              <dd className="value">{station.name}</dd>
            </div>
            <div>
              <dt>{t('ui.station.rating')}</dt>
              <Tooltip textKey="ui.tooltip.station.rating">
                <dd tabIndex={0} className={station.rating < 40 ? 'value value--warning' : 'value'}>
                  {station.rating}
                </dd>
              </Tooltip>
            </div>
            <div>
              <dt>{t('ui.station.modules')}</dt>
              <dd className="value value--mono">{station.modules.length}</dd>
            </div>
            {platformTiles > 0 && (
              <div>
                <dt>{t('ui.station.platform')}</dt>
                <dd className="value value--mono">{platformTiles}</dd>
              </div>
            )}
          </dl>
          {/* The "Umsteigeknoten" mark of section 12.3 - per STATION, and
              only its owner may flip it, so the box shows on own stations. */}
          {station.ownerId === 0 && (
            <label className="panel__hint">
              <input
                type="checkbox"
                checked={station.transferNode}
                onChange={(event) =>
                  client.send({
                    kind: CommandKind.SetTransferNode,
                    stationId: station.id,
                    transferNode: event.target.checked,
                  })
                }
              />{' '}
              {t('ui.station.transferNode')}
            </label>
          )}
          {/* The x-ray of SPEC2 M14: five terms, the dominant loss named,
              waiting per cargo, and the twelve-month history ring. */}
          <StationXray station={station} />
        </>
      )}

      {industry !== undefined && (
        <>
          <span className="field__label field__label--spaced">{t('ui.industry.title')}</span>
          <dl className="readout">
            <div>
              <dt>{t('ui.tile.terrain')}</dt>
              <dd className="value">{t(INDUSTRY_SPECS[industry.type]?.nameKey ?? '')}</dd>
            </div>
            <div>
              <dt>{t('ui.industry.level')}</dt>
              <Tooltip textKey="ui.tooltip.industry.level">
                <dd tabIndex={0} className="value value--mono">
                  {industry.level} %
                </dd>
              </Tooltip>
            </div>
            <div>
              <dt>{t('ui.industry.stock')}</dt>
              <Tooltip
                textKey="ui.tooltip.industry.stock"
                params={{ months: INDUSTRY_STOCK_MONTHS }}
              >
                <dd tabIndex={0} className="value value--mono">
                  {industry.stock}
                </dd>
              </Tooltip>
            </div>
            <div>
              <dt>{t('ui.industry.service')}</dt>
              <Tooltip textKey="ui.tooltip.industry.service">
                <dd
                  tabIndex={0}
                  className={industry.service < 50 ? 'value value--warning' : 'value'}
                >
                  {industry.service} %
                </dd>
              </Tooltip>
            </div>
          </dl>
          {!industry.open && <p className="panel__hint value--danger">{t('ui.industry.closed')}</p>}
          {industry.open && industry.neglectedMonths >= INDUSTRY_WARNING_MONTHS[0]! && (
            <p className="panel__hint value--danger">
              {t('ui.industry.closureWarning', {
                months: industry.neglectedMonths,
                left: INDUSTRY_CLOSURE_MONTHS - industry.neglectedMonths,
              })}
            </p>
          )}
          <DeliveryPanel industry={industry} />
        </>
      )}
    </section>
  );
}
