/**
 * Shared display-sort vocabulary for Pending (To Ship) + Testing queue headers.
 * Quiet trailing dropdown — composites (Priority | Newest | Deadline) plus
 * spreadsheet column sorts (Product A–Z, Days late, …). Never a solid TabSwitch
 * beside search.
 * URL: `?sort=` (omit when `priority`, the default); `?dir=asc|desc` only for
 * column sorts (omit when the column’s default direction).
 */

export type QueueDisplaySortComposite = 'priority' | 'newest' | 'deadline';

export type QueueDisplaySortColumn =
  | 'title'
  /** Derived days past ship-by (`Nd`). Replaced fused `sla` / civil-date face. */
  | 'age'
  | 'qty'
  | 'order'
  | 'tracking';

export type QueueDisplaySort = QueueDisplaySortComposite | QueueDisplaySortColumn;

export type QueueDisplaySortDir = 'asc' | 'desc';

const QUEUE_COLUMN_SORTS: readonly QueueDisplaySortColumn[] = [
  'title',
  'age',
  'qty',
  'order',
  'tracking',
] as const;

const COLUMN_SORT_SET = new Set<string>(QUEUE_COLUMN_SORTS);

/**
 * Retired `?sort=` values kept readable so shared/bookmarked links survive.
 * Fused `sla` and civil-date `date` resolve to the live Late (`age`) column.
 * Parse-only — never written back out, so these drain from live URLs on the
 * next sort interaction.
 */
const RETIRED_COLUMN_SORT_ALIASES: Readonly<Record<string, QueueDisplaySortColumn>> = {
  sla: 'age',
  date: 'age',
  // Cond column retired → inline Product tag; bookmarks fall back to product sort.
  condition: 'title',
};

export function isQueueColumnSort(sort: string): sort is QueueDisplaySortColumn {
  return COLUMN_SORT_SET.has(sort);
}

/**
 * COMPOUND track → the `?sort=` value it represents.
 *
 * ## Why this exists
 *
 * When To-Ship moved to the two-row compound row, its header keys changed from
 * the flat facts (`title`, `order`, …) to the compound tracks
 * (`fulfillment`, `item`, …). Nothing updated the sort vocabulary, so
 * `isQueueColumnSort` rejected every header key and **clicking a header
 * silently did nothing** — sorting was simply off on the desk, and stayed off
 * because the e2e that would have caught it was itself still clicking a flat
 * locator that resolved to zero elements.
 *
 * ## Why this is a restoration, not a new decision
 *
 * A compound track is a container for facts the flat model already sorted by:
 * `fulfillment` carries the order identity (`order`), `item` carries the
 * product title (`title`). Mapping them re-connects existing comparators —
 * `queue-row-compare.ts` needs no new case.
 *
 * `state` and `amount` are deliberately ABSENT. Neither had a column sort in the
 * flat model either (`QUEUE_COLUMN_SORTS` never listed `status` or `amount`), so
 * leaving them out preserves the shipped behaviour exactly rather than inventing
 * an ordering nobody has asked for. Adding one later means adding a comparator
 * case too, which is the point at which it is a product decision.
 */
export const COMPOUND_TRACK_SORT_KEYS: Readonly<Record<string, QueueDisplaySortColumn>> = {
  fulfillment: 'order',
  item: 'title',
};

/** The `?sort=` value a header key drives, or null when it does not sort. */
export function queueSortForColumnKey(key: string): QueueDisplaySortColumn | null {
  if (isQueueColumnSort(key)) return key;
  return COMPOUND_TRACK_SORT_KEYS[key] ?? null;
}

/** Header keys that sort — the descriptor's `isSortable` for this family. */
export function isQueueSortableColumnKey(key: string): boolean {
  return queueSortForColumnKey(key) != null;
}

function isQueueCompositeSort(sort: string): sort is QueueDisplaySortComposite {
  return sort === 'priority' || sort === 'newest' || sort === 'deadline';
}

/**
 * Default direction when first activating a column sort.
 *
 * `age` defaults to DESC: larger days-late first (most overdue on top). Other
 * fact columns stay ASC.
 */
export function defaultDirForQueueSort(sort: QueueDisplaySort): QueueDisplaySortDir | null {
  if (!isQueueColumnSort(sort)) return null;
  if (sort === 'age') return 'desc';
  return 'asc';
}

export const QUEUE_DISPLAY_SORT_OPTIONS: readonly {
  id: QueueDisplaySort;
  label: string;
  /** Short label for the chrome sort dropdown trigger. */
  shortLabel: string;
}[] = [
  { id: 'priority', label: 'Priority (due soon)', shortLabel: 'Priority' },
  { id: 'newest', label: 'Newest first', shortLabel: 'Newest' },
  { id: 'deadline', label: 'By ship-by date', shortLabel: 'Deadline' },
  { id: 'title', label: 'Product title', shortLabel: 'Product' },
  { id: 'age', label: 'Days late (most late first)', shortLabel: 'Days late' },
  { id: 'qty', label: 'Quantity', shortLabel: 'Qty' },
  { id: 'order', label: 'Order number', shortLabel: 'Order' },
  { id: 'tracking', label: 'Tracking number', shortLabel: 'Tracking' },
] as const;

export function parseQueueDisplaySort(raw: string | null | undefined): QueueDisplaySort {
  if (raw && isQueueCompositeSort(raw)) return raw;
  if (raw && isQueueColumnSort(raw)) return raw;
  if (raw && RETIRED_COLUMN_SORT_ALIASES[raw]) return RETIRED_COLUMN_SORT_ALIASES[raw];
  return 'priority';
}

/**
 * Resolve `?dir=` for the active sort. Composites have no direction (null).
 * Unknown / missing dir → column default.
 */
export function parseQueueDisplaySortDir(
  raw: string | null | undefined,
  sort: QueueDisplaySort,
): QueueDisplaySortDir | null {
  if (!isQueueColumnSort(sort)) return null;
  if (raw === 'asc' || raw === 'desc') return raw;
  return defaultDirForQueueSort(sort);
}

/** Write `?sort=` / `?dir=` — delete defaults so URLs stay clean. */
export function applyQueueDisplaySortParam(
  params: URLSearchParams,
  sort: QueueDisplaySort,
  dir?: QueueDisplaySortDir | null,
): void {
  if (sort === 'priority') params.delete('sort');
  else params.set('sort', sort);

  if (isQueueColumnSort(sort)) {
    const resolved = dir ?? defaultDirForQueueSort(sort)!;
    const def = defaultDirForQueueSort(sort)!;
    if (resolved === def) params.delete('dir');
    else params.set('dir', resolved);
  } else {
    params.delete('dir');
  }
}

/** Flip ASC ↔ DESC. */
export function flipQueueDisplaySortDir(dir: QueueDisplaySortDir): QueueDisplaySortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}
