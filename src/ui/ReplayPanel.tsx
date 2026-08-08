import { useEffect, type ReactElement } from 'react';
import { t } from '../i18n';
import { COMPANY_COLORS } from '../shared/palette';
import { SAVE_VERSION } from '../sim/save/format';
import { TICKS_PER_YEAR } from '../sim/constants';
import {
  exportReplayNamed,
  importReplayFile,
  playReplayNamed,
  refreshReplays,
  removeReplayNamed,
} from './replays';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The replay theatre of SPEC2 M16 - a browser and a playback bar.
 *
 * Two components, because they answer two different questions. The BROWSER is
 * a full-screen overlay: which recordings are there, what is in them, and
 * which of them this build may judge. The BAR is what replaces the sidebar
 * while one is playing: where in the recording we are, which years can be
 * jumped to, whether it verifies, and the way out.
 *
 * Neither of them can change the world. That is not a promise made here - the
 * playback queue is sealed and the worker refuses commands by name (D-189) -
 * but the interface says the same thing by not offering any: while a recording
 * plays, the build tools and every panel that issues a command are gone.
 *
 * Nothing here imports the simulation for a VALUE. The years a chip and a
 * verdict are labelled with travel in the metadata and in the verdict, because
 * the calendar lives in `src/sim` and a static import of it pulls the whole
 * world into the main bundle (measured: +248 kB, D-191). The sim reaches the
 * main thread through the dynamic import in `sessionReplay.ts` and nowhere
 * else.
 */

/** The years a recording covers, as the browser prints them. */
function spanLabel(startYear: number, endYear: number, years: number): string {
  return t('ui.replay.span', { from: startYear, to: endYear, years: years.toFixed(1) });
}

export function ReplayBrowser({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const replays = useSimStore((s) => s.replays);
  const ready = useSimStore((s) => s.ready);
  const error = useSimStore((s) => s.replayError);

  useEffect(() => {
    void refreshReplays();
  }, []);

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.replay.title')}</h2>
      <p className="panel__hint">{t('ui.replay.intro')}</p>

      <div className="button-row">
        {ready && (
          <button
            type="button"
            className="button button--active"
            onClick={() => client.exportReplay('')}
          >
            {t('ui.replay.fromRunning')}
          </button>
        )}
        <button type="button" className="button" onClick={() => void importReplayFile(client)}>
          {t('ui.replay.import')}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>

      {error !== null && (
        <p className="panel__hint value--danger">
          {t(error.reasonKey)} {error.detail}
        </p>
      )}

      {replays.length === 0 ? (
        <p className="panel__hint">{t('ui.replay.empty')}</p>
      ) : (
        <ul className="saves">
          {replays.map((entry) => (
            <li key={entry.name} className="saves__row">
              <span className="saves__text">
                <span className="saves__name">{entry.label === '' ? entry.name : entry.label}</span>
                <span className="row__meta">
                  {spanLabel(entry.startYear, entry.endYear, entry.years)} ·{' '}
                  {t('ui.replay.recordedBy', {
                    version: entry.gameVersion,
                    format: entry.saveVersion,
                  })}
                </span>
                <span className="row__meta">
                  {t('ui.replay.companies', { names: entry.companies.join(', ') })}
                </span>
                {!entry.verifiable && (
                  <span className="row__meta value--warning">
                    {t('ui.replay.notVerifiableHint', { format: SAVE_VERSION })}
                  </span>
                )}
              </span>

              <span className="button-row">
                <button
                  type="button"
                  className="button button--active"
                  onClick={() => {
                    void playReplayNamed(client, entry.name).then((ok) => {
                      if (ok) onClose();
                    });
                  }}
                >
                  {t('ui.replay.play')}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void exportReplayNamed(entry.name)}
                >
                  {t('ui.save.export')}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void removeReplayNamed(entry.name)}
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

/**
 * The verdict of "Replay prüfen", as the four different things it can be.
 *
 * A divergent tick and a broken file are printed differently on purpose
 * (D-191): the first is a statement about the SIMULATION and comes with the
 * proof behind it, the second is a statement about the FILE and deliberately
 * names no tick at all.
 */
function VerdictLine(): ReactElement | null {
  const checking = useSimStore((s) => s.replayChecking);
  const result = useSimStore((s) => s.replayVerification);
  const error = useSimStore((s) => s.replayError);

  if (checking) return <p className="panel__hint">{t('ui.replay.checking')}</p>;
  if (error !== null) {
    return (
      <p className="panel__hint value--danger">
        {t(error.reasonKey)} {error.detail}
      </p>
    );
  }
  if (result === null) return null;

  const verdict = result.verdict;
  if (verdict.kind === 'verified') {
    return (
      <p className="panel__hint value--success">
        {t('ui.replay.verify.ok', { ticks: result.checkedTicks.length })}
      </p>
    );
  }

  const hashes = (
    <p className="row__meta">
      {t('ui.replay.verify.hashes', { expected: result.expectedHash, actual: result.actualHash })}
    </p>
  );

  if (verdict.kind === 'corruptRecording') {
    return (
      <div className="panel__hint value--danger">
        <p>
          {t('ui.replay.verify.corrupt', {
            where: verdict.where,
            tick: verdict.tick,
            year: result.years[0] ?? 0,
          })}
        </p>
        <p className="row__meta">{t(verdict.whatKey)}</p>
        {hashes}
      </div>
    );
  }

  if (verdict.kind === 'divergedAt') {
    return (
      <div className="panel__hint value--danger">
        <p>
          {t('ui.replay.verify.divergedAt', {
            tick: verdict.tick,
            year: result.years[0] ?? 0,
            from: verdict.proof.fromTick,
          })}
        </p>
        <p className="row__meta">
          {t('ui.replay.verify.proof', {
            tick: verdict.tick,
            matched: verdict.proof.matchedHash,
            after: verdict.proof.hashAfter,
          })}
        </p>
        {hashes}
      </div>
    );
  }

  return (
    <div className="panel__hint value--danger">
      <p>
        {t('ui.replay.verify.bracket', {
          from: verdict.fromTick,
          to: verdict.toTick,
          fromYear: result.years[0] ?? 0,
          toYear: result.years[1] ?? 0,
        })}
      </p>
      <p className="row__meta">{t(verdict.whyKey)}</p>
      {hashes}
      {result.logBreak !== null && (
        <p className="row__meta">
          {t(result.logBreak.reasonKey, {
            tick: result.logBreak.tick,
            seq: result.logBreak.seq,
            index: result.logBreak.index,
            from: result.logBreak.fromTick,
            to: result.logBreak.toTick,
          })}
        </p>
      )}
    </div>
  );
}

export function ReplayBar({ client }: { readonly client: SimClient }): ReactElement | null {
  useSimStore((s) => s.locale);
  const meta = useSimStore((s) => s.replay);
  const tick = useSimStore((s) => s.tick);
  const checking = useSimStore((s) => s.replayChecking);

  if (meta === null) return null;

  const jumps = meta.jumps;
  const span = Math.max(1, meta.finalTick - meta.baseTick);
  const progress = Math.min(100, Math.round(((tick - meta.baseTick) / span) * 100));

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.replay.playing')}</h2>

      <p className="row__meta">
        {spanLabel(meta.startYear, meta.endYear, meta.years)} ·{' '}
        {t('ui.replay.recordedBy', { version: meta.gameVersion, format: meta.saveVersion })}
      </p>
      {/* The companies of the recording in their own liveries - the same
          swatch the status bar wears, so a competitor's colour on the map is
          the colour beside its name here. */}
      <ul className="replay-cast">
        {meta.companies.map((company, index) => (
          <li key={index} className="replay-cast__row">
            <span
              className="statusbar__swatch"
              style={{ background: COMPANY_COLORS[company.colorIndex] }}
              aria-hidden="true"
            />
            <span>{company.name}</span>
            {company.ai && <span className="row__meta">{t('ui.replay.rival')}</span>}
          </li>
        ))}
      </ul>
      <p className="row__meta">
        {t('ui.replay.position', {
          tick,
          finalTick: meta.finalTick,
          percent: progress,
          commands: meta.commandCount,
        })}
      </p>
      <progress className="progress" value={tick - meta.baseTick} max={span} />

      <p className="panel__hint">{t('ui.replay.jumpHint')}</p>
      <div className="button-row">
        {jumps.map((jump) => (
          <button
            key={jump.tick}
            type="button"
            className={
              tick >= jump.tick && tick < jump.tick + TICKS_PER_YEAR ? 'chip chip--active' : 'chip'
            }
            onClick={() => client.seekReplay(jump.tick)}
          >
            {jump.year}
          </button>
        ))}
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={!meta.verifiable || checking}
          onClick={() => client.verifyReplay()}
        >
          {t('ui.replay.verifyButton')}
        </button>
        <button type="button" className="button button--active" onClick={() => client.exitReplay()}>
          {t('ui.replay.leave')}
        </button>
      </div>

      {!meta.verifiable && (
        <p className="panel__hint value--warning">
          {t('ui.replay.notVerifiableHint', { format: SAVE_VERSION })}
        </p>
      )}

      <VerdictLine />
    </section>
  );
}
