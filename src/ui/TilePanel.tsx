import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { StationMarker } from '../shared/protocol';
import {
  ROAD_COST_PER_TILE_CT,
  ROAD_DEPOT_COST_CT,
  ROAD_STOP_COST_CT,
  TERRAFORM_COST_PER_STEP_CT,
} from '../sim/constants';
import { TERRAIN_NAME_KEYS } from '../sim/map/terrain';
import { useSimStore, type Tool } from './store';

/** Tools of M1 and M2. Rail, water and air join the list with their milestones. */
const TOOLS: ReadonlyArray<{ readonly id: Tool; readonly labelKey: string }> = [
  { id: 'none', labelKey: 'ui.tool.select' },
  { id: 'road', labelKey: 'ui.tool.road' },
  { id: 'stop', labelKey: 'ui.tool.stop' },
  { id: 'depot', labelKey: 'ui.tool.depot' },
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
    case 'stop':
      return t('ui.tool.priceStop', { amount: formatMoney(ROAD_STOP_COST_CT) });
    case 'depot':
      return t('ui.tool.priceDepot', { amount: formatMoney(ROAD_DEPOT_COST_CT) });
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
      {tool === 'road' && (
        <p className="panel__hint">
          {roadAnchor === null
            ? t('ui.tool.roadFirst')
            : t('ui.tool.roadSecond', { x: roadAnchor.x, y: roadAnchor.y })}
        </p>
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
