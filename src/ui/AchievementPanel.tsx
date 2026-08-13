import type { ReactElement } from 'react';
import { t } from '../i18n';
import { ProfileStatus } from '../platform/profileData';
import { ACHIEVEMENTS } from './achievements';
import { profileStatus } from './profile';
import { useSimStore } from './store';

/**
 * What the player has collected across every game (SPEC2 M24).
 *
 * The one screen in the game that is not about the running world: the
 * achievements, the campaign stages finished and the medal every shipped
 * scenario gave up, all of it read out of `profile.json` at boot and written
 * back whenever it moves (`ui/profile.ts`).
 *
 * Locked entries are shown, dimmed, with their condition spelled out. A hidden
 * achievement is a riddle, and this game's own posture on riddles is the news
 * log's: a warning nobody can see is not a warning.
 *
 * The one thing it says out loud that a player would otherwise never learn: a
 * profile written by a NEWER build is being read and will not be written back
 * (`ProfileStatus.Future`). Silence there would look like progress that keeps
 * disappearing.
 */
export function AchievementPanel({ onClose }: { readonly onClose: () => void }): ReactElement {
  useSimStore((s) => s.locale);
  const earned = useSimStore((s) => s.achievements);
  const campaign = useSimStore((s) => s.campaignCompleted);
  const scenarios = useSimStore((s) => s.scenarioMedals);

  const status = profileStatus();
  const count = Object.keys(earned).length;

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.achievements.title')}</h2>
      <p className="panel__hint">{t('ui.achievements.intro')}</p>

      <div className="button-row">
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>

      <p className="row__meta">
        {t('ui.achievements.progress', { done: count, of: ACHIEVEMENTS.length })} ·{' '}
        {t('ui.achievements.kept', {
          stages: Object.keys(campaign).length,
          scenarios: Object.keys(scenarios).length,
        })}
      </p>

      {status === ProfileStatus.Future && (
        <p className="value value--warning">{t('ui.achievements.future')}</p>
      )}
      {status === ProfileStatus.Recovered && (
        <p className="value value--warning">{t('ui.achievements.recovered')}</p>
      )}

      <ul className="saves">
        {ACHIEVEMENTS.map((achievement) => {
          const year = earned[achievement.id];
          return (
            <li
              key={achievement.id}
              className={year === undefined ? 'saves__row achievement--locked' : 'saves__row'}
            >
              <span className="saves__text">
                <span className="saves__name">{t(achievement.titleKey)}</span>
                <span className="row__meta">{t(achievement.descriptionKey)}</span>
              </span>
              <span className="row__meta">
                {year === undefined
                  ? t('ui.achievements.locked')
                  : t('ui.achievements.earnedIn', { year })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
