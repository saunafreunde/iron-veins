import { NEWS_LOG_SIZE } from '../constants';

/**
 * The news log of section 17.1: what the game tells the player, and where.
 *
 * Every class of event the simulation has been recording silently since M4 ends
 * up here - a train that has been stuck for a minute, a works about to close, a
 * company three months in the red. Those clocks all existed; nothing surfaced
 * them, and a warning nobody can see is not a warning.
 *
 * Three things make an entry useful rather than noise:
 *
 *  - a CATEGORY, so the list can be filtered. A player watching for signalling
 *    trouble does not want to read about town growth;
 *  - a TILE, so a click can jump to it. An event the player cannot find is a
 *    riddle rather than information;
 *  - a translation KEY and its parameters rather than a sentence, because every
 *    user-visible string in this project goes through `t()` and a log is no
 *    exception.
 *
 * The log is a ring. It is state the player reads, so it is saved; it is bounded
 * so that a hundred year game cannot grow it without limit.
 */

export const NewsCategory = {
  /** Money: loans, bankruptcy, the year's result. */
  Finance: 0,
  /** Industry: openings, closures and the warnings before them. */
  Industry: 1,
  /** Vehicles: breakdowns, obsolescence, replacements. */
  Fleet: 2,
  /** The network: trains stuck at signals, cargo written off. */
  Network: 3,
  /** Towns and their councils. */
  Town: 4,
} as const;
export type NewsCategory = (typeof NewsCategory)[keyof typeof NewsCategory];

export const NEWS_CATEGORY_COUNT = 5;

/** Translation keys for the filter buttons, indexed by category. */
export const NEWS_CATEGORY_KEYS: readonly string[] = [
  'news.category.finance',
  'news.category.industry',
  'news.category.fleet',
  'news.category.network',
  'news.category.town',
];

/** How loud an entry is. The UI colours by it; nothing else reads it. */
export const NewsSeverity = {
  Info: 0,
  Warning: 1,
  Alarm: 2,
} as const;
export type NewsSeverity = (typeof NewsSeverity)[keyof typeof NewsSeverity];

export interface NewsEntry {
  /** Tick the event happened, which is what the UI shows as a date. */
  readonly tick: number;
  readonly category: NewsCategory;
  readonly severity: NewsSeverity;
  /** i18n key; the message itself never appears in the simulation. */
  readonly messageKey: string;
  /** Substitutions for that key. Numbers and strings only, so it serialises. */
  readonly params: Readonly<Record<string, number | string>>;
  /** Where to jump to, or -1 when the event has no place. */
  readonly tileIndex: number;
}

/**
 * A bounded, ordered log.
 *
 * Entries are appended and the oldest fall off the front. An array with a shift
 * rather than a ring buffer with a cursor: a hundred entries shifted a few times
 * a game month is nothing, and the ordering is then simply the array's - which
 * is one fewer thing to get wrong when it is read, saved and hashed.
 */
export class NewsLog {
  private readonly entries: NewsEntry[] = [];

  /**
   * Bumped on every entry, so the worker can tell whether the log moved without
   * comparing it. Not saved and not hashed: no rule reads it, exactly like
   * `TileMap.revision`, and a change token that took part in the hash would
   * make two identical worlds differ over how they were reached.
   */
  revision = 0;

  /** Newest last. */
  get all(): readonly NewsEntry[] {
    return this.entries;
  }

  post(entry: NewsEntry): void {
    this.revision++;
    this.entries.push(entry);
    if (this.entries.length > NEWS_LOG_SIZE) this.entries.shift();
  }

  /**
   * Post an entry unless the same message about the same place is already the
   * most recent one.
   *
   * The clocks that feed this log tick every day, and a warning that repeats
   * itself daily is how a log becomes something players close and never open
   * again.
   */
  postOnce(entry: NewsEntry): void {
    const last = this.entries[this.entries.length - 1];
    if (
      last !== undefined &&
      last.messageKey === entry.messageKey &&
      last.tileIndex === entry.tileIndex
    ) {
      return;
    }
    this.post(entry);
  }

  /** Serialised form: the entries, oldest first. */
  toData(): NewsEntry[] {
    return this.entries.map((entry) => ({ ...entry, params: { ...entry.params } }));
  }

  loadData(saved: readonly NewsEntry[]): void {
    this.entries.length = 0;
    for (const entry of saved) this.post({ ...entry, params: { ...entry.params } });
  }
}
