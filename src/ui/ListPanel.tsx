import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { t } from '../i18n';
import { clampRovingIndex, nextRovingIndex } from './roving';

/**
 * The list panel of section 17.1: sortable, filterable, searchable.
 *
 * One component for vehicles, stations, towns and industries, because the spec
 * asks for the same three things on all of them and four hand-written lists
 * would drift apart by the second one. With four hundred vehicles this is
 * "a precondition for playing", not a luxury - so it is built once, properly.
 */

export interface Column<T> {
  readonly key: string;
  readonly labelKey: string;
  /** What the cell shows. */
  readonly render: (row: T) => string;
  /**
   * What the column sorts by. Absent means the column is not sortable, which
   * is right for a free-text cell nobody would order by.
   */
  readonly sortBy?: (row: T) => number | string;
  /** Extra class on the cell, for the danger and warning colours. */
  readonly className?: (row: T) => string | undefined;
}

export interface ListPanelProps<T> {
  readonly titleKey: string;
  readonly rows: readonly T[];
  readonly columns: ReadonlyArray<Column<T>>;
  /** Stable identity, and the last resort of every sort comparison. */
  readonly idOf: (row: T) => number;
  /** Everything the search box looks through, lower-cased by the caller. */
  readonly searchText: (row: T) => string;
  readonly onSelect?: (row: T) => void;
  readonly selectedId?: number | null;
  /** Optional filters offered as buttons above the list. */
  readonly filters?: ReadonlyArray<{
    readonly key: string;
    readonly labelKey: string;
    readonly matches: (row: T) => boolean;
  }>;
}

export function ListPanel<T>({
  titleKey,
  rows,
  columns,
  idOf,
  searchText,
  onSelect,
  selectedId,
  filters,
}: ListPanelProps<T>): ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState<string | null>(null);
  // Roving focus (SPEC2 M25): the list is ONE tab stop and the arrow keys move
  // a cursor inside it. `cursor` is an index into the VISIBLE rows, so it is
  // clamped whenever a filter or a search shortens them.
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  // The searchable text is built once per row rather than once per keystroke:
  // it goes through t(), and translating inside the filter would do it again
  // for every row on every character typed.
  const indexed = useMemo(
    () => rows.map((row) => ({ row, text: searchText(row).toLowerCase() })),
    [rows, searchText],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filter = filters?.find((entry) => entry.key === filterKey);

    const kept = indexed
      .filter((entry) => needle === '' || entry.text.includes(needle))
      .filter((entry) => filter === undefined || filter.matches(entry.row))
      .map((entry) => entry.row);

    const column = columns.find((entry) => entry.key === sortKey);
    if (column?.sortBy === undefined) return kept;

    // A TOTAL order: ties fall back to the id, or rows jump about every time
    // the worker sends a fresh list (architecture law #14, applied to the UI).
    const by = column.sortBy;
    return [...kept].sort((a, b) => {
      const left = by(a);
      const right = by(b);
      if (left !== right) {
        const order = left < right ? -1 : 1;
        return descending ? -order : order;
      }
      return idOf(a) - idOf(b);
    });
  }, [indexed, search, filters, filterKey, columns, sortKey, descending, idOf]);

  const active = clampRovingIndex(cursor, visible.length);

  /**
   * Move the cursor and take the focus with it.
   *
   * The DOM focus is what a screen reader follows, so moving only the state
   * would give a sighted keyboard user a highlight and a blind one nothing.
   * The row is found through the list element rather than through a ref per
   * row: four hundred refs to move one focus is four hundred refs.
   */
  const moveCursor = (next: number): void => {
    setCursor(next);
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('button.row');
    rows?.[next]?.focus();
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
    const next = nextRovingIndex(active, event.key, visible.length);
    if (next === null) return;
    event.preventDefault();
    moveCursor(next);
  };

  const toggleSort = (key: string): void => {
    if (key === sortKey) setDescending(!descending);
    else {
      setSortKey(key);
      setDescending(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title">{t(titleKey)}</h2>

      <input
        className="list__search"
        type="search"
        value={search}
        placeholder={t('ui.list.search')}
        onChange={(event) => setSearch(event.target.value)}
      />

      {filters !== undefined && filters.length > 0 && (
        <div className="button-row">
          <button
            type="button"
            className={filterKey === null ? 'button button--active' : 'button'}
            onClick={() => setFilterKey(null)}
          >
            {t('ui.list.all')}
          </button>
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={entry.key === filterKey ? 'button button--active' : 'button'}
              onClick={() => setFilterKey(entry.key === filterKey ? null : entry.key)}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      )}

      <div className="button-row list__headers">
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            className={column.key === sortKey ? 'button button--active' : 'button'}
            disabled={column.sortBy === undefined}
            onClick={() => toggleSort(column.key)}
          >
            {t(column.labelKey)}
            {column.key === sortKey ? (descending ? ' ▾' : ' ▴') : ''}
          </button>
        ))}
      </div>

      <p className="panel__hint">
        {t('ui.list.count', { shown: visible.length, total: rows.length })}
      </p>

      {/* One tab stop for the whole list, the arrow keys inside it: the roving
          pattern of SPEC2 M25. `aria-activedescendant` is deliberately not
          used - the focus really moves to the row's own button, so Enter and
          Space keep the meaning the browser gives them. */}
      <ul className="list" ref={listRef} onKeyDown={onListKeyDown}>
        {visible.map((row, index) => (
          <li key={idOf(row)}>
            <button
              type="button"
              className={idOf(row) === selectedId ? 'row row--active' : 'row'}
              tabIndex={index === active ? 0 : -1}
              onFocus={() => setCursor(index)}
              onClick={() => onSelect?.(row)}
            >
              {columns.map((column) => (
                <span key={column.key} className={column.className?.(row) ?? 'row__meta'}>
                  {column.render(row)}
                </span>
              ))}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
