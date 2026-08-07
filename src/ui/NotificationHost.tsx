import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatGameDate, t } from '../i18n';
import type { NewsMarker } from '../shared/protocol';
import {
  formatNewsMessage,
  newNewsEntries,
  NOTIFICATION_FRESH_TICKS,
  routeNotification,
  severityClass,
} from './notifications';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/** How long a toast card stays before it dismisses itself. [ms, wall clock] */
const TOAST_CARD_LIFETIME_MS = 8000;

/** How long the ticker keeps showing its line after the last entry. [ms] */
const TICKER_LIFETIME_MS = 20_000;

/** Cards on screen at once; older ones fall off the bottom of the stack. */
const MAX_TOAST_CARDS = 4;

interface ToastCard {
  readonly id: number;
  readonly entry: NewsMarker;
  /** A pause-routed card stays until dismissed - it explains the stop. */
  readonly sticky: boolean;
}

/**
 * The notification host of SPEC2 M14: consumes the news delta, executes the
 * routing decisions of `notifications.ts`, and renders the one-line ticker
 * strip and the toast cards. Everything sim-side is already done - the log
 * is spam-free by `postOnce` - so this component is pure presentation over
 * the store (D-110), and the pause it issues is speed control, never a
 * command (D-004).
 */
export function NotificationHost({ client }: { readonly client: SimClient }): ReactElement | null {
  useSimStore((s) => s.locale);
  const news = useSimStore((s) => s.news);
  const ready = useSimStore((s) => s.ready);
  const settings = useSimStore((s) => s.settings);
  const mapSize = useSimStore((s) => s.mapSize);
  const centre = useSimStore((s) => s.centreOnTile);

  const [toasts, setToasts] = useState<readonly ToastCard[]>([]);
  const [tickerEntry, setTickerEntry] = useState<NewsMarker | null>(null);

  /** The news array the last delta was taken against, or null before sync. */
  const seen = useRef<readonly NewsMarker[] | null>(null);
  const nextCardId = useRef(0);

  // A new world starts with a clean slate: the first news it sends is its
  // backlog, and a backlog is read in the panel, never toasted.
  useEffect(() => {
    if (!ready) {
      seen.current = null;
      setToasts([]);
      setTickerEntry(null);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = news;
      return;
    }
    const fresh = newNewsEntries(seen.current, news);
    seen.current = news;
    if (fresh.length === 0) return;

    // Read, not subscribed: subscribing to the tick would re-render this
    // component twenty times a second for a freshness check that only
    // matters when the news list itself moved.
    const tick = useSimStore.getState().tick;
    let pause = false;
    let ticker: NewsMarker | null = null;
    const cards: ToastCard[] = [];
    for (const entry of fresh) {
      // The freshness window is the second guard behind the delta: however
      // the sync races the ready flip, months-old entries are backlog.
      if (tick - entry.tick > NOTIFICATION_FRESH_TICKS) continue;
      const routed = routeNotification(settings.notifications[entry.category] ?? 0, entry.severity);
      if (routed.ticker) ticker = entry;
      if (routed.toast) {
        cards.push({ id: nextCardId.current++, entry, sticky: routed.pause });
      }
      if (routed.pause) pause = true;
    }

    if (ticker !== null) setTickerEntry(ticker);
    if (cards.length > 0) {
      setToasts((current) => [...cards.reverse(), ...current].slice(0, MAX_TOAST_CARDS));
    }
    if (pause) client.setSpeed(0);
  }, [news, ready, settings, client]);

  // Non-sticky cards retire themselves; the check runs on a coarse interval
  // rather than one timeout per card.
  useEffect(() => {
    if (toasts.every((card) => card.sticky)) return;
    const timer = window.setTimeout(() => {
      setToasts((current) =>
        current.length > 0 ? current.filter((card) => card.sticky) : current,
      );
    }, TOAST_CARD_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  // The ticker line fades once it has had its say.
  useEffect(() => {
    if (tickerEntry === null) return;
    const timer = window.setTimeout(() => setTickerEntry(null), TICKER_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [tickerEntry]);

  const jump = (entry: NewsMarker): void => {
    if (entry.tileIndex < 0 || mapSize === 0) return;
    centre(entry.tileIndex % mapSize, Math.floor(entry.tileIndex / mapSize));
  };

  if (tickerEntry === null && toasts.length === 0) return null;

  return (
    <>
      {tickerEntry !== null && (
        <button type="button" className="newsticker" onClick={() => jump(tickerEntry)}>
          <span className="newsticker__date">
            {formatGameDate(tickerEntry.year, tickerEntry.month, tickerEntry.day)}
          </span>
          <span className={severityClass(tickerEntry.severity)}>
            {formatNewsMessage(tickerEntry)}
          </span>
        </button>
      )}

      {toasts.length > 0 && (
        <div className="toaststack">
          {toasts.map((card) => (
            <div key={card.id} className="toastcard" role="status">
              <button type="button" className="toastcard__body" onClick={() => jump(card.entry)}>
                <span className="row__meta">
                  {card.sticky && <strong>{t('ui.notify.pausedTag')} · </strong>}
                  {formatGameDate(card.entry.year, card.entry.month, card.entry.day)}
                </span>
                <span className={severityClass(card.entry.severity)}>
                  {formatNewsMessage(card.entry)}
                </span>
              </button>
              <button
                type="button"
                className="toastcard__close"
                aria-label={t('ui.close')}
                onClick={() =>
                  setToasts((current) => current.filter((other) => other.id !== card.id))
                }
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
