import type { ShippedTypeFilter } from '@/lib/shipping/shipped-filter/shipped-filter-constants';

/** First useful package page. Keeps the desk interactive while search still covers the full archive. */
export const SHIPPED_FEED_PAGE_SIZE = 100;

/** Immediate cards omit only deadline/photo fields; those hydrate after first paint. */
export const SHIPPED_FEED_PHASE = 'spine' as const;

/** Browser preference mirrored for server-side first paint. */
export const SHIPPED_FILTER_COOKIE = 'cf_shipped_filter';

export function parseShippedTypeFilter(value: unknown): ShippedTypeFilter {
  return value === 'orders' || value === 'sku' || value === 'fba' || value === 'all'
    ? value
    : 'all';
}
interface ShippedFeedQueryKeyOptions {
  weekStart?: string;
  weekEnd?: string;
  packedBy?: number;
  staffId?: number;
  shippedFilter?: string;
  carrier?: string | null;
  statusCategory?: string | null;
  exceptionsOnly?: boolean;
  searchTerm?: string;
  limit?: number;
  phase?: 'spine' | 'full';
  shippedTime?: {
    dateFrom: string;
    dateTo: string;
    timeFrom?: string;
    timeTo?: string;
  } | null;
  pickedBy?: number;
  /** `?channel` — comma-separated, lower-cased. Absent = no channel predicate. */
  channel?: string | null;
}

/** Cache-key contract shared by the RSC seed and the browser query factory. */
export function shippedFeedQueryKey({
  weekStart,
  weekEnd,
  packedBy,
  staffId,
  shippedFilter,
  carrier = null,
  statusCategory = null,
  exceptionsOnly = false,
  searchTerm = '',
  limit = SHIPPED_FEED_PAGE_SIZE,
  phase = 'full',
  shippedTime = null,
  pickedBy,
  channel = null,
}: ShippedFeedQueryKeyOptions = {}) {
  return [
    'dashboard-table',
    'shipped',
    {
      weekStart,
      weekEnd,
      packedBy,
      staffId,
      shippedFilter,
      carrier,
      statusCategory,
      exceptionsOnly,
      searchTerm,
      limit,
      phase,
      shippedTime: shippedTime ?? undefined,
      pickedBy,
      channel,
    },
  ] as const;
}
