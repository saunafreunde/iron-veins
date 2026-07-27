import type { ReactElement } from 'react';
import { formatGameDate, formatMoney, t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import { SPEED_FACTORS } from '../sim/constants';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

const SPEED_LABEL_KEYS = [
  'ui.speed.pause',
  'ui.speed.x1',
  'ui.speed.x2',
  'ui.speed.x5',
  'ui.speed.x20',
];

export function StatusBar({ client }: { readonly client: SimClient }): ReactElement {
  // Subscribing to the locale makes every formatter below rerun on a language switch.
  useSimStore((s) => s.locale);

  const companyName = useSimStore((s) => s.companyName);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const year = useSimStore((s) => s.year);
  const month = useSimStore((s) => s.month);
  const day = useSimStore((s) => s.day);
  const cashCt = useSimStore((s) => s.cashCt);
  const loanCt = useSimStore((s) => s.loanCt);
  const speedIndex = useSimStore((s) => s.speedIndex);
  const appVersion = useSimStore((s) => s.appVersion);

  return (
    <header className="statusbar">
      <div className="statusbar__brand">
        <span
          className="statusbar__swatch"
          style={{ background: COMPANY_COLORS[companyColorIndex] }}
          aria-hidden="true"
        />
        <span className="statusbar__company">{companyName}</span>
      </div>

      <dl className="statusbar__facts">
        <div>
          <dt>{t('ui.status.date')}</dt>
          <dd>{formatGameDate(year, month, day)}</dd>
        </div>
        <div>
          <dt>{t('ui.status.cash')}</dt>
          <dd className={cashCt < 0 ? 'value value--danger' : 'value'}>{formatMoney(cashCt)}</dd>
        </div>
        <div>
          <dt>{t('ui.status.loan')}</dt>
          <dd className={loanCt > 0 ? 'value value--warning' : 'value'}>{formatMoney(loanCt)}</dd>
        </div>
      </dl>

      <div className="statusbar__speed" role="group" aria-label={t('ui.status.speed')}>
        {SPEED_FACTORS.map((_factor, index) => (
          <button
            key={index}
            type="button"
            className={index === speedIndex ? 'speed speed--active' : 'speed'}
            onClick={() => client.setSpeed(index)}
          >
            {t(SPEED_LABEL_KEYS[index] ?? '')}
          </button>
        ))}
      </div>

      <span className="statusbar__version">{t('ui.status.version', { version: appVersion })}</span>
    </header>
  );
}
