import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import { CommandKind } from '../sim/commands/types';
import { AUTO_SIGNAL_SPACING_TILES } from '../sim/constants';
import { RailType } from '../sim/map/track';
import { ModuleKind } from '../sim/station/types';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The confirmation step for a station-to-station railway.
 *
 * Nothing is charged until the button is pressed. That is the entire reason
 * this panel exists: every other build in the game bills on the click, which
 * is fine for one tile of road and wrong for a line that can cost more than a
 * company has.
 */
export function ConnectPanel({ client }: { readonly client: SimClient }): ReactElement | null {
  useSimStore((s) => s.locale);
  const plan = useSimStore((s) => s.connectPlan);
  const error = useSimStore((s) => s.connectError);
  const anchor = useSimStore((s) => s.connectAnchor);
  const stations = useSimStore((s) => s.stations);
  const cashCt = useSimStore((s) => s.cashCt);
  const autoSignal = useSimStore((s) => s.autoSignal);
  const clear = useSimStore((s) => s.clearConnect);

  if (plan === null && error === null && anchor === null) return null;

  if (plan === null) {
    const from = stations.find((station) => station.id === anchor);
    return (
      <>
        <span className="field__label field__label--spaced">{t('ui.connect.title')}</span>
        {error !== null ? (
          <p className="panel__hint value--danger">{t(error)}</p>
        ) : (
          <p className="panel__hint">
            {t('ui.connect.pickSecond', { station: from?.name ?? '' })}
          </p>
        )}
        <button type="button" className="button" onClick={clear}>
          {t('ui.cancel')}
        </button>
      </>
    );
  }

  const affordable = plan.totalCostCt <= cashCt;

  return (
    <>
      <span className="field__label field__label--spaced">{t('ui.connect.title')}</span>
      <p className="panel__hint">
        {plan.fromName} → {plan.toName}
      </p>

      <dl className="readout">
        <div>
          <dt>{t('ui.preview.length')}</dt>
          <dd className="value value--mono">{Math.round(plan.lengthM)} m</dd>
        </div>
        <div>
          <dt>{t('ui.preview.grade')}</dt>
          <dd className="value value--mono">{Math.round(plan.maxGradePermille)} ‰</dd>
        </div>
        <div>
          <dt>{t('ui.preview.radius')}</dt>
          <dd className="value value--mono">
            {Number.isFinite(plan.minRadiusM)
              ? `${Math.round(plan.minRadiusM)} m`
              : t('ui.preview.straight')}
          </dd>
        </div>
        <div>
          <dt>{t('ui.preview.speed')}</dt>
          <dd className="value value--mono">{Math.round(plan.maxSpeedMs * 3.6)} km/h</dd>
        </div>
        <div>
          <dt>{t('ui.connect.structures')}</dt>
          <dd className="value value--mono">
            {plan.bridges} / {plan.tunnels}
          </dd>
        </div>
        <div>
          <dt>{t('ui.connect.platforms')}</dt>
          <dd className="value value--mono">{plan.platforms.length}</dd>
        </div>
        <div>
          <dt>{t('ui.connect.trackCost')}</dt>
          <dd className="value value--mono">{formatMoney(plan.trackCostCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.connect.total')}</dt>
          <dd className={affordable ? 'value value--mono' : 'value value--mono value--danger'}>
            {formatMoney(plan.totalCostCt)}
          </dd>
        </div>
      </dl>

      {!affordable && <p className="panel__hint value--danger">{t('ui.connect.tooDear')}</p>}

      <div className="button-row">
        <button
          type="button"
          className="button button--active"
          disabled={!affordable}
          onClick={() => {
            // The track first, then the platforms: a platform needs rails under
            // it, and the queue runs these in the order they are sent.
            client.send({
              kind: CommandKind.BuildTrack,
              x1: plan.fromX,
              y1: plan.fromY,
              x2: plan.toX,
              y2: plan.toY,
              railType: RailType.Plain,
              // The flag the plan was PRICED with, not the live toggle: the
              // preview and the bill must not part company (D-119).
              assistant: plan.assistant,
              signalSpacing: autoSignal ? AUTO_SIGNAL_SPACING_TILES : 0,
            });
            for (const platform of plan.platforms) {
              client.send({
                kind: CommandKind.BuildRailStop,
                x: platform.x,
                y: platform.y,
                moduleKind: ModuleKind.RailPlatform,
              });
            }
            clear();
          }}
        >
          {t('ui.connect.confirm', { price: formatMoney(plan.totalCostCt) })}
        </button>
        <button type="button" className="button" onClick={clear}>
          {t('ui.cancel')}
        </button>
      </div>
    </>
  );
}
