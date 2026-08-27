/**
 * Home → Daily find/refine — same job as Unbox History's Band 3: a query
 * string plus a named status filter, both URL-owned (`?q=` · `?filter=`).
 */

import type { DailyCheckItem } from '@/lib/daily-checks/types';

export const DAILY_STATUS_FILTERS = ['all', 'open', 'done'] as const;
export type DailyStatusFilter = (typeof DAILY_STATUS_FILTERS)[number];

export function parseDailyStatusFilter(raw: string | null): DailyStatusFilter {
  if (raw === 'open' || raw === 'done') return raw;
  return 'all';
}

export function filterDailyCheckItems(
  items: readonly DailyCheckItem[],
  doneIds: ReadonlySet<number>,
  query: string,
  status: DailyStatusFilter,
): DailyCheckItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (needle && !item.title.toLowerCase().includes(needle)) return false;
    if (status === 'open' && doneIds.has(item.id)) return false;
    if (status === 'done' && !doneIds.has(item.id)) return false;
    return true;
  });
}
