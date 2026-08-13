import { useEffect, useRef, useState, type ReactElement } from 'react';
import { t } from '../i18n';
import type { NewsMarker } from '../shared/protocol';
import { ACHIEVEMENTS, countNews, newlyEarnedAchievements } from './achievements';
import { newNewsEntries } from './notifications';
import { useSimStore } from './store';

/** How long an earned-achievement card stays on screen. [ms, wall clock] */
const CARD_LIFETIME_MS = 9000;

/** Cards at once; an older one falls off rather than growing the stack. */
const MAX_CARDS = 3;

/**
 * What watches for an achievement, and what says so (SPEC2 M24).
 *
 * Mounted beside `NotificationHost` and built the same way, because it consumes
 * the same seam: the news log arrives WHOLE on every change, `newNewsEntries`
 * is the delta, and a new world resets the reader. Two differences, and both
 * are deliberate:
 *
 *  - the FIRST sync is counted rather than skipped. The notification host
 *    treats a loaded backlog as history nobody should be toasted about, which
 *    is right for a toast; but a save loaded with twelve industry openings in
 *    its log has earned "Industriezeitalter", and refusing it because the
 *    player took a break would be the achievement punishing them for saving;
 *  - the goals are read as well, because half of what SPEC2 M24 asks for is
 *    triggered by the M17 goal machine and a goal is not a news entry.
 *
 * Everything it decides is decided by `achievements.ts`, which is pure; this
 * component only chooses WHEN to ask and shows the answer. Nothing here reaches
 * the simulation - the whole mechanism is a reader of two outputs (D-110).
 */
export function AchievementHost(): ReactElement | null {
  useSimStore((s) => s.locale);
  const news = useSimStore((s) => s.news);
  const goals = useSimStore((s) => s.goals);
  const ready = useSimStore((s) => s.ready);
  const unlockAchievements = useSimStore((s) => s.unlockAchievements);

  const [cards, setCards] = useState<readonly { readonly id: string; readonly key: number }[]>([]);

  /** This world's news tally, thrown away with the world. */
  const tally = useRef(new Map<string, number>());
  /** The news array the last delta was taken against, or null before sync. */
  const seen = useRef<readonly NewsMarker[] | null>(null);
  const nextCardKey = useRef(0);

  useEffect(() => {
    if (ready) return;
    // A new world counts its own news from zero: the tally is a property of the
    // world, and what survives is the profile's set of earned ids.
    tally.current = new Map();
    seen.current = null;
    setCards([]);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    if (seen.current === null) {
      countNews(tally.current, news);
    } else {
      countNews(tally.current, newNewsEntries(seen.current, news));
    }
    seen.current = news;

    const store = useSimStore.getState();
    const earned = newlyEarnedAchievements(
      { newsCounts: tally.current, goals },
      new Set(Object.keys(store.achievements)),
    );
    if (earned.length === 0) return;

    unlockAchievements(earned, store.year);
    setCards((previous) => {
      const next = [
        ...previous,
        ...earned.map((id) => ({ id, key: nextCardKey.current++ })),
      ];
      return next.slice(Math.max(0, next.length - MAX_CARDS));
    });
  }, [ready, news, goals, unlockAchievements]);

  useEffect(() => {
    if (cards.length === 0) return;
    const timer = window.setTimeout(() => setCards((current) => current.slice(1)), CARD_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [cards]);

  if (cards.length === 0) return null;

  return (
    <div className="toaststack toaststack--achievements" role="status">
      {cards.map((card) => {
        const achievement = ACHIEVEMENTS.find((one) => one.id === card.id);
        if (achievement === undefined) return null;
        return (
          <div key={card.key} className="toastcard">
            <span className="toastcard__body">
              <span className="row__meta">{t('ui.achievements.earned')}</span>
              <span className="saves__name">{t(achievement.titleKey)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
