/**
 * Shared display-sort vocabulary for Pending (To Ship) + Testing queue headers.
 * Quiet trailing dropdown — composites (Priority | Newest | Deadline) plus
 * spreadsheet column sorts (Product A–Z, Ship by, …). Never a solid TabSwitch
 * beside search.
 * URL: `?sort=` (omit when `priority`, the default); `?dir=asc|desc` only for
 * column sorts (omit when the column’s default direction).
 */

export type QueueDisplaySortComposite = 'priority' | 'newest' | 'deadline';

export type QueueDisplaySortColumn =
  | 'title'
  | 'date'
  | 'age'
  | 'qty'
  | 'condition'
  | 'order'
  | 'tracking';

export type QueueDisplaySort = QueueDisplaySortComposite | QueueDisplaySortColumn;

export type QueueDisplaySortDir = 'asc' | 'desc';

const QUEUE_COLUMN_SORTS: readonly QueueDisplaySortColumn[] = [
  'title',
  'date',
  'age',
  'qty',
  'condition',
  'order',
  'tracking',
] as const;

const COLUMN_SORT_SET = new Set<string>(QUEUE_COLUMN_SORTS);

export function isQueueColumnSort(sort: string): sort is QueueDisplaySortColumn {
  return COLUMN_SORT_SET.has(sort);
}

function isQueueCompositeSort(sort: string): sort is QueueDisplaySortComposite {
  return sort === 'priority' || sort === 'newest' || sort === 'deadline';
}

/** Default direction when first activating a column sort. */
export function defaultDirForQueueSort(sort: QueueDisplaySort): QueueDisplaySortDir | null {
  if (!isQueueColumnSort(sort)) return null;
  // Most-late-first matches urgency scanning on the Age column.
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
  { id: 'date', label: 'Ship by date', shortLabel: 'Ship by' },
  { id: 'age', label: 'Days late', shortLabel: 'Age' },
  { id: 'qty', label: 'Quantity', shortLabel: 'Qty' },
  { id: 'condition', label: 'Condition', shortLabel: 'Cond' },
  { id: 'order', label: 'Order number', shortLabel: 'Order' },
  { id: 'tracking', label: 'Tracking number', shortLabel: 'Tracking' },
] as const;

export function parseQueueDisplaySort(raw: string | null | undefined): QueueDisplaySort {
  if (raw && isQueueCompositeSort(raw)) return raw;
  if (raw && isQueueColumnSort(raw)) return raw;
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
