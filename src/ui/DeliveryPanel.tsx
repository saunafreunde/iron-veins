import type { ReactElement } from 'react';
import { t } from '../i18n';
import type { IndustryMarker } from '../shared/protocol';
import { cargoSpec } from '../sim/cargo/types';
import { deliveryRoutes, supplyRoutes, type CargoRoute } from './deliveries';
import { useSimStore } from './store';

/**
 * What this works makes, what it needs, and where either can go.
 *
 * The panel a player wants the moment they click an industry. Every row is a
 * button that jumps the camera to the target, because "the sawmill is 34 tiles
 * away" is only half an answer - the other half is being shown which one.
 */
export function DeliveryPanel({ industry }: { readonly industry: IndustryMarker }): ReactElement {
  useSimStore((s) => s.locale);
  const industries = useSimStore((s) => s.industries);
  const towns = useSimStore((s) => s.towns);
  const stations = useSimStore((s) => s.stations);
  const centre = useSimStore((s) => s.centreOnTile);

  const outputs = deliveryRoutes(industry, industries, towns, stations);
  const inputs = supplyRoutes(industry, industries, stations);

  const section = (routes: readonly CargoRoute[], titleKey: string, emptyKey: string) => {
    if (routes.length === 0) {
      return (
        <>
          <span className="field__label field__label--spaced">{t(titleKey)}</span>
          <p className="panel__hint">{t(emptyKey)}</p>
        </>
      );
    }
    return (
      <>
        <span className="field__label field__label--spaced">{t(titleKey)}</span>
        {routes.map((route) => (
          <div key={route.cargo}>
            <span className="row__meta">{t(cargoSpec(route.cargo).nameKey)}</span>
            {route.targets.length === 0 ? (
              <p className="panel__hint value--warning">{t('ui.delivery.noTarget')}</p>
            ) : (
              <ul className="list">
                {route.targets.map((target) => (
                  <li key={`${target.kind}-${target.x}-${target.y}`}>
                    <button type="button" className="row" onClick={() => centre(target.x, target.y)}>
                      <span>
                        {target.kind === 'town' ? target.name : t(target.name)}
                        {target.served && ' ✓'}
                      </span>
                      <span className="row__meta">
                        {t('ui.delivery.distance', { tiles: target.distanceTiles })}
                        {target.served ? ` · ${t('ui.delivery.served')}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </>
    );
  };

  return (
    <>
      {section(outputs, 'ui.delivery.outTitle', 'ui.delivery.outNone')}
      {section(inputs, 'ui.delivery.inTitle', 'ui.delivery.inNone')}
      <p className="panel__hint">{t('ui.delivery.hint')}</p>
    </>
  );
}
