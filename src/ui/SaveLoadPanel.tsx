import { useEffect, useState, type ReactElement } from 'react';
import { formatGameDate, formatMoney, t } from '../i18n';
import { hasBackup, readSave } from '../platform/Storage';
import { SaveSlotKind } from '../shared/protocol';
import {
  exportNamed,
  importAndLoad,
  lastLoadName,
  loadBackupNamed,
  loadNamed,
  refreshSaves,
  removeNamed,
} from './saves';
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
  /** A conversion asked for HERE fails here, not on a screen nobody opened. */
  const replayError = useSimStore((s) => s.replayError);
  const ready = useSimStore((s) => s.ready);
  const [label, setLabel] = useState('');
  /** The save whose `.bak` the failed load can fall back to, or null. */
  const [backupFor, setBackupFor] = useState<string | null>(null);

  useEffect(() => {
    void refreshSaves();
  }, []);

  // When a load fails, look for the backup the last write of that save kept.
  // Only a shelf entry has one - an imported file leaves lastLoadName null.
  useEffect(() => {
    const name = loadError === null ? null : lastLoadName();
    if (name === null) {
      setBackupFor(null);
      return;
    }
    let cancelled = false;
    void hasBackup(name).then((present) => {
      if (!cancelled) setBackupFor(present ? name : null);
    });
    return () => {
      cancelled = true;
    };
  }, [loadError]);

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
      {/* What the dialog behind that button accepts. A scenario the workshop
          exported opens here like any other file, and until the M22 correction
          bundle it did not - so the sentence naming it is part of the fix. */}
      <p className="panel__hint">{t('ui.save.importHint')}</p>

      {loadError !== null && (
        <div className="panel__hint value--danger">
          <p>
            {t(loadError.reasonKey)} {loadError.detail}
          </p>
          {backupFor !== null && (
            <div className="button-row">
              <span>{t('ui.save.backupOffer')}</span>
              <button
                type="button"
                className="button button--active"
                onClick={() => {
                  void loadBackupNamed(client, backupFor).then((ok) => {
                    if (ok) onClose();
                  });
                }}
              >
                {t('ui.save.loadBackup')}
              </button>
            </div>
          )}
        </div>
      )}

      {replayError !== null && (
        <p className="panel__hint value--danger">
          {t(replayError.reasonKey)} {replayError.detail}
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
                  {formatGameDate(entry.year, entry.month, 0)} · {formatMoney(entry.companyValueCt)}{' '}
                  · {t(SLOT_KEYS[entry.slot] ?? '')}
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
                {/* "Play as replay" (SPEC2 M16's acceptance sentence: EVERY
                    save playable as a recording in ONE click). The same
                    conversion as the button beside it - the worker's, since it
                    is the only side that may decode a world - but it enters
                    playback in the same message, instead of shelving a file
                    the player then has to go and find on the F2 screen. */}
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    void readSave(entry.name).then((bytes) => {
                      if (bytes !== null) client.makeReplay(bytes, entry.label, true);
                    });
                  }}
                >
                  {t('ui.save.playReplay')}
                </button>
                {/* "Export replay from save": every save carries its own
                    command log and, since v27, its checkpoint ring, so ANY
                    save can become a recording. Kept beside the play button
                    because shelving without watching is its own errand - a
                    file to hand somebody else. */}
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    void readSave(entry.name).then((bytes) => {
                      if (bytes !== null) client.makeReplay(bytes, entry.label, false);
                    });
                  }}
                >
                  {t('ui.save.exportReplay')}
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
