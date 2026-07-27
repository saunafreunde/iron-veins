import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { TERRAIN_NAME_KEYS } from '../sim/map/terrain';
import { TERRAFORM_COST_PER_STEP_CT } from '../sim/constants';
import { useSimStore, type Tool } from './store';

/** Terraforming tools of M1; track, road and station tools follow in M2/M3. */
const TOOLS: ReadonlyArray<{ readonly id: Tool; readonly labelKey: string }> = [
  { id: 'none', labelKey: 'ui.tool.select' },
  { id: 'raise', labelKey: 'ui.tool.raise' },
  { id: 'lower', labelKey: 'ui.tool.lower' },
  { id: 'level', labelKey: 'ui.tool.level' },
];

export function TilePanel(): ReactElement {
  useSimStore((s) => s.locale);
  const hovered = useSimStore((s) => s.hoveredTile);
  const selected = useSimStore((s) => s.selectedTile);
  const tool = useSimStore((s) => s.tool);
  const setTool = useSimStore((s) => s.setTool);
  const towns = useSimStore((s) => s.towns);

  const tile = hovered ?? selected;
  const town = tile !== null && tile.townId >= 0 ? towns[tile.townId] : undefined;

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
      <p className="panel__hint">
        {t('ui.tool.costHint', { amount: formatMoney(TERRAFORM_COST_PER_STEP_CT) })}
      </p>

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
    </section>
  );
}
