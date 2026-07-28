import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { StationMarker } from '../shared/protocol';
import {
  RAIL_DEPOT_COST_CT,
  RAIL_PLATFORM_COST_CT,
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  SIGNAL_COST_CT,
  TERRAFORM_COST_PER_STEP_CT,
} from '../sim/constants';
import { TERRAIN_NAME_KEYS } from '../sim/map/terrain';
import { RAIL_TYPE_COST_CT, RailType } from '../sim/map/track';
import { useSimStore, type Tool } from './store';

/** Tools of M1 and M2. Rail, water and air join the list with their milestones. */
const TOOLS: ReadonlyArray<{ readonly id: Tool; readonly labelKey: string }> = [
  { id: 'none', labelKey: 'ui.tool.select' },
  { id: 'road', labelKey: 'ui.tool.road' },
  { id: 'track', labelKey: 'ui.tool.track' },
  { id: 'stop', labelKey: 'ui.tool.stop' },
  { id: 'depot', labelKey: 'ui.tool.depot' },
  { id: 'platform', labelKey: 'ui.tool.platform' },
  { id: 'raildepot', labelKey: 'ui.tool.railDepot' },
  { id: 'signal', labelKey: 'ui.tool.signal' },
  { id: 'demolish', labelKey: 'ui.tool.demolish' },
  { id: 'raise', labelKey: 'ui.tool.raise' },
  { id: 'lower', labelKey: 'ui.tool.lower' },
  { id: 'level', labelKey: 'ui.tool.level' },
];

/** Price shown under the active tool, so the cost is known before the click. */
function priceHint(tool: Tool): string {
  switch (tool) {
    case 'road':
      return t('ui.tool.priceRoad', { amount: formatMoney(ROAD_COST_PER_TILE_CT) });
    case 'track':
      return t('ui.tool.priceTrack', {
        amount: formatMoney(RAIL_TYPE_COST_CT[RailType.Plain]!),
      });
    case 'stop':
      return t('ui.tool.priceStop', { amount: formatMoney(ROAD_STOP_COST_CT) });
    case 'depot':
      return t('ui.tool.priceDepot', { amount: formatMoney(ROAD_DEPOT_COST_CT) });
    case 'platform':
      return t('ui.tool.pricePlatform', { amount: formatMoney(RAIL_PLATFORM_COST_CT) });
    case 'raildepot':
      return t('ui.tool.priceRailDepot', { amount: formatMoney(RAIL_DEPOT_COST_CT) });
    case 'signal':
      return t('ui.tool.priceSignal', { amount: formatMoney(SIGNAL_COST_CT) });
    case 'raise':
    case 'lower':
    case 'level':
      return t('ui.tool.priceTerraform', { amount: formatMoney(TERRAFORM_COST_PER_STEP_CT) });
    case 'demolish':
      return t('ui.tool.priceDemolish');
    case 'none':
      return t('ui.tool.hintSelect');
  }
}

/** Station whose modules cover a tile, if any. */
export function stationAtTile(
  stations: readonly StationMarker[],
  x: number,
  y: number,
): StationMarker | undefined {
  return stations.find((station) => station.modules.some((m) => m.x === x && m.y === y));
}

export function TilePanel(): ReactElement {
  useSimStore((s) => s.locale);
  const hovered = useSimStore((s) => s.hoveredTile);
  const selected = useSimStore((s) => s.selectedTile);
  const tool = useSimStore((s) => s.tool);
  const setTool = useSimStore((s) => s.setTool);
  const towns = useSimStore((s) => s.towns);
  const stations = useSimStore((s) => s.stations);
  const roadAnchor = useSimStore((s) => s.roadAnchor);
  const trackPreview = useSimStore((s) => s.trackPreview);

  const tile = hovered ?? selected;
  const town = tile !== null && tile.townId >= 0 ? towns[tile.townId] : undefined;
  const station = tile === null ? undefined : stationAtTile(stations, tile.x, tile.y);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.tile.title')}</h2>

      <div className="button-row">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === tool ? 'button button--active' : 'button'}
            onClick={() => setTool(entry.id)}
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </div>
      <p className="panel__hint">{priceHint(tool)}</p>
      {(tool === 'road' || tool === 'track') && (
        <p className="panel__hint">
          {roadAnchor === null
            ? t('ui.tool.roadFirst')
            : t('ui.tool.roadSecond', { x: roadAnchor.x, y: roadAnchor.y })}
        </p>
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
        </dl>
      )}

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
              <dd className={station.rating < 40 ? 'value value--warning' : 'value'}>
                {station.rating}
              </dd>
            </div>
            <div>
              <dt>{t('ui.station.waiting')}</dt>
              <dd className="value value--mono">{station.waiting}</dd>
            </div>
            <div>
              <dt>{t('ui.station.modules')}</dt>
              <dd className="value value--mono">{station.modules.length}</dd>
            </div>
          </dl>
          {station.rating < 40 && <p className="panel__hint">{t('ui.station.lowRating')}</p>}
        </>
      )}
    </section>
  );
}
