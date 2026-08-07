import { formatMoney, t } from '../i18n';
import type { NewsMarker } from '../shared/protocol';
import { NotificationMode } from '../shared/settings';
import { NewsSeverity } from '../sim/news/log';
import { TICKS_PER_DAY } from '../sim/constants';

/**
 * Notification routing (SPEC2 M14): what the interface DOES with a fresh news
 * entry - nothing, the one-line ticker, a toast card, or a toast plus pause.
 *
 * Pure presentation on top of the news log of section 15 (D-110): the log is
 * simulation state, `postOnce` already guarantees sim-side spam-freedom, and
 * nothing here reaches the simulation - the pause travels as speed CONTROL,
 * which never influences the world (D-004). The two functions below are the
 * whole of the logic; the host component only executes their answers.
 */

/** What the host should do with one routed entry. */
export interface RoutedNotification {
  readonly ticker: boolean;
  readonly toast: boolean;
  readonly pause: boolean;
}

const NOTHING: RoutedNotification = { ticker: false, toast: false, pause: false };
const TICKER: RoutedNotification = { ticker: true, toast: false, pause: false };
const TOAST: RoutedNotification = { ticker: false, toast: true, pause: false };
const TOAST_AND_PAUSE: RoutedNotification = { ticker: false, toast: true, pause: true };

/**
 * The routing decision for one entry: the category's mode crossed with the
 * entry's severity. `Pause` means "do not let me miss this": every entry
 * still gets a card, and anything above Info also stops the clock - an Info
 * line (a contract completed, a town milestone) is not worth a hard stop
 * even in a category the player armed.
 */
export function routeNotification(mode: number, severity: number): RoutedNotification {
  switch (mode) {
    case NotificationMode.Ticker:
      return TICKER;
    case NotificationMode.Toast:
      return TOAST;
    case NotificationMode.Pause:
      return severity === NewsSeverity.Info ? TOAST : TOAST_AND_PAUSE;
    default:
      return NOTHING;
  }
}

/**
 * Entries only routed while this recent - news older than this at the moment
 * it first reaches the interface is backlog, not an event. Two game days
 * covers every publish/marker cadence in the pipeline with a wide margin;
 * a loaded save's months-old log can never flood the screen through it.
 * [ticks]
 */
export const NOTIFICATION_FRESH_TICKS = 2 * TICKS_PER_DAY;

/**
 * The entries `next` carries that `previous` did not - the delta the router
 * consumes. The log travels WHOLE on every change (see `postNews`), so the
 * fresh tail is everything past the position of the previous newest entry.
 * An empty `previous` yields nothing: the first sync of a world is its
 * backlog, and a backlog is read in the news panel, not toasted.
 */
export function newNewsEntries(
  previous: readonly NewsMarker[],
  next: readonly NewsMarker[],
): NewsMarker[] {
  if (previous.length === 0 || next.length === 0) return [];
  const last = previous[previous.length - 1]!;

  // Scan from the end: the match is almost always within a step or two, and
  // the ring is bounded anyway.
  for (let i = next.length - 1; i >= 0; i--) {
    const entry = next[i]!;
    if (
      entry.tick === last.tick &&
      entry.category === last.category &&
      entry.messageKey === last.messageKey &&
      entry.tileIndex === last.tileIndex
    ) {
      return next.slice(i + 1);
    }
  }
  // The previous newest fell off the ring entirely (a burst larger than the
  // log). Everything strictly newer than it is the honest answer.
  return next.filter((entry) => entry.tick > last.tick);
}

/**
 * Render one news entry to a sentence, shared by the news panel, the ticker
 * and the toast cards. Two conventions the simulation side keeps to, because
 * it holds no prose: a STRING parameter is another translation key - an
 * industry's name, say - and a parameter named `...Ct` is money in cents.
 */
export function formatNewsMessage(entry: NewsMarker): string {
  const resolved: Record<string, string | number> = {};
  for (const key of Object.keys(entry.params).sort(byName)) {
    const value = entry.params[key]!;
    if (typeof value === 'string') resolved[key] = t(value);
    else resolved[key] = key.endsWith('Ct') ? formatMoney(value) : value;
  }
  return t(entry.messageKey, resolved);
}

/** CSS class for a severity, shared by the panel, ticker and toasts. */
export function severityClass(severity: number): string {
  if (severity === NewsSeverity.Alarm) return 'value--danger';
  if (severity === NewsSeverity.Warning) return 'value--warning';
  return '';
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
