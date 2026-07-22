/**
 * Shared display-sort vocabulary for Pending (To Ship) + Testing queue headers.
 * Compact TOP switcher — Priority | Newest | Deadline — not swimlane DnD.
 * URL: `?sort=` (omit when `priority`, the default).
 */

export type QueueDisplaySort = 'priority' | 'newest' | 'deadline';

export const QUEUE_DISPLAY_SORT_OPTIONS: readonly {
  id: QueueDisplaySort;
  label: string;
  /** Short label for the chrome TabSwitch. */
  shortLabel: string;
}[] = [
  { id: 'priority', label: 'Priority (due soon)', shortLabel: 'Priority' },
  { id: 'newest', label: 'Newest first', shortLabel: 'Newest' },
  { id: 'deadline', label: 'By ship-by date', shortLabel: 'Deadline' },
] as const;

export function parseQueueDisplaySort(raw: string | null | undefined): QueueDisplaySort {
  if (raw === 'newest' || raw === 'deadline') return raw;
  return 'priority';
}

/** Write `?sort=` — delete when default so URLs stay clean. */
export function applyQueueDisplaySortParam(
  params: URLSearchParams,
  sort: QueueDisplaySort,
): void {
  if (sort === 'priority') params.delete('sort');
  else params.set('sort', sort);
}
