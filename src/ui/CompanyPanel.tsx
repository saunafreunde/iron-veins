import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import { CommandKind } from '../sim/commands/types';
import { MAX_COMPANY_NAME_LENGTH } from '../sim/constants';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

export function CompanyPanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const companyName = useSimStore((s) => s.companyName);
  const companyColorIndex = useSimStore((s) => s.companyColorIndex);
  const [draftName, setDraftName] = useState(companyName);

  // The simulation owns the name; the field follows whenever it changes there
  // (rename accepted, save loaded, later: another player renamed the company).
  useEffect(() => {
    setDraftName(companyName);
  }, [companyName]);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.company.title')}</h2>

      <label className="field">
        <span className="field__label">{t('ui.company.name')}</span>
        <input
          className="field__input"
          type="text"
          value={draftName}
          maxLength={MAX_COMPANY_NAME_LENGTH}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="button"
        onClick={() => client.send({ kind: CommandKind.SetCompanyName, name: draftName })}
      >
        {t('ui.company.rename')}
      </button>

      <span className="field__label field__label--spaced">{t('ui.company.color')}</span>
      <div className="swatches">
        {COMPANY_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            aria-label={`${t('ui.company.color')} ${index + 1}`}
            aria-pressed={index === companyColorIndex}
            className={index === companyColorIndex ? 'swatch swatch--active' : 'swatch'}
            style={{ background: color }}
            onClick={() => client.send({ kind: CommandKind.SetCompanyColor, colorIndex: index })}
          />
        ))}
      </div>
    </section>
  );
}
