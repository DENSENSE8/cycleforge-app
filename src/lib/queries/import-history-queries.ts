'use client';

/**
 * Query factory for the per-day import record.
 *
 * Same law as `dashboard-queries.ts` / `caged-orders-queries.ts`: the key lives
 * beside the fetch so a prefetch and the `useQuery` that later mounts cannot
 * drift apart. The range is IN the key — stepping a day is a new cache entry,
 * which is what makes ◀ ▶ instant on a day already visited instead of a
 * refetch that blanks the table.
 */

import { queryOptions } from '@tanstack/react-query';
import type {
  ImportDayRange,
  ImportedOrderRecord,
} from '@/lib/orders/import-history-core';

export const IMPORT_HISTORY_QUERY_ROOT = 'order-import-history';

export interface ImportHistoryPayload {
  success: boolean;
  range: ImportDayRange;
  today: string;
  /** `[dayKey, records][]`, newest day first — SQL's grouping, not the client's. */
  days: [string, ImportedOrderRecord[]][];
  count: number;
  truncated: boolean;
  sources: { source: string; count: number }[];
}

const EMPTY: ImportHistoryPayload = {
  success: true,
  range: { from: '', to: '' },
  today: '',
  days: [],
  count: 0,
  truncated: false,
  sources: [],
};

export function importHistoryQuery(params: {
  range: ImportDayRange;
  source?: string | null;
  enabled?: boolean;
}) {
  const { range, source } = params;
  const search = new URLSearchParams({ from: range.from, to: range.to });
  if (source) search.set('source', source);

  return queryOptions({
    queryKey: [IMPORT_HISTORY_QUERY_ROOT, range.from, range.to, source ?? null] as const,
    enabled: params.enabled !== false && Boolean(range.from && range.to),
    queryFn: async (): Promise<ImportHistoryPayload> => {
      const res = await fetch(`/api/orders/imports?${search.toString()}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`/api/orders/imports → ${res.status}`);
      const json = (await res.json()) as Partial<ImportHistoryPayload>;
      return { ...EMPTY, ...json, days: Array.isArray(json.days) ? json.days : [] };
    },
    // A past day's imports cannot change. Today's can, so the surface refetches
    // on mount rather than trusting a stale window — but never on an interval:
    // this is a record, not a live queue.
    staleTime: 60_000,
  });
}
