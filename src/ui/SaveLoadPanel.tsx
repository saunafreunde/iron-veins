import { useEffect, useState, type ReactElement } from 'react';
import { formatGameDate, formatMoney, t } from '../i18n';
import { SaveSlotKind } from '../shared/protocol';
import { exportNamed, importAndLoad, loadNamed, refreshSaves, removeNamed } from './saves';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The save and load screen of section 19.1.
 *
 * Every save carries a picture of the world it was taken in. Without one, a
 * load screen is a column of dates and a player who wants "the game where I
 * had just finished the coal line" has no way to find it - which is the only
 * reason a thumbnail is worth the bytes.
 */

const SLOT_KEYS: readonly string[] = ['ui.save.manual', 'ui.save.quick', 'ui.save.auto'];

export function SaveLoadPanel({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const saves = useSimStore((s) => s.saves);
  const loadError = useSimStore((s) => s.loadError);
  const ready = useSimStore((s) => s.ready);
  const [label, setLabel] = useState('');

  useEffect(() => {
    void refreshSaves();
  }, []);

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.save.title')}</h2>

      {ready && (
        <div className="button-row">
          <input
            className="list__search"
            placeholder={t('ui.save.labelPlaceholder')}
            value={label}
            maxLength={40}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button
            type="button"
            className="button button--active"
            onClick={() => {
              client.save(SaveSlotKind.Manual, label.trim());
              setLabel('');
            }}
          >
            {t('ui.save.saveNow')}
          </button>
        </div>
      )}

      <div className="button-row">
        <button type="button" className="button" onClick={() => void importAndLoad(client)}>
          {t('ui.save.import')}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>

      {loadError !== null && (
        <p className="panel__hint value--danger">
          {t(loadError.reasonKey)} {loadError.detail}
        </p>
      )}

      {saves.length === 0 ? (
        <p className="panel__hint">{t('ui.save.empty')}</p>
      ) : (
        <ul className="saves">
          {saves.map((entry) => (
            <li key={entry.name} className="saves__row">
              {entry.thumbnail === '' ? (
                <span className="saves__thumb saves__thumb--empty" aria-hidden="true" />
              ) : (
                <img className="saves__thumb" src={entry.thumbnail} alt="" />
              )}

              <span className="saves__text">
                <span className="saves__name">
                  {entry.label === '' ? t(SLOT_KEYS[entry.slot] ?? '') : entry.label}
                </span>
                <span className="row__meta">
                  {formatGameDate(entry.year, entry.month, 0)} ·{' '}
                  {formatMoney(entry.companyValueCt)} · {t(SLOT_KEYS[entry.slot] ?? '')}
                </span>
              </span>

              <span className="button-row">
                <button
                  type="button"
                  className="button button--active"
                  onClick={() => {
                    void loadNamed(client, entry.name).then((ok) => {
                      if (ok) onClose();
                    });
                  }}
                >
                  {t('ui.save.load')}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void exportNamed(entry.name)}
                >
                  {t('ui.save.export')}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void removeNamed(entry.name)}
                >
                  {t('ui.save.delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
