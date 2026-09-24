'use client';

/**
 * Admin › Inventory events explorer — the PAGE feed for `/inventory/events`.
 *
 * The family is already registered (`inventory-events`). This file is the
 * mount: it spreads {@link useInventoryEventsSpreadsheet} onto DataTable.
 * Filters, pagination and SQL stay on the server page.
 *
 * ## The find box is the page's `?q=`, not a pass over one offset page
 *
 * Same shape as `@/app/settings/audit/AuditLogTable`, an RSC page whose
 * search is server-answered: the box writes
 * `?q=` through {@link useOptimisticUrlParam} — so the field paints on the
 * keystroke and the table is NOT remounted mid-word — the page reads that param
 * into its SQL and its COUNT, and the rows handed back here ARE the answer.
 * Declaring `answeredBy: 'server'` is what stops the engine running its own
 * substring pass over the hundred rows in hand: that pass could only narrow the
 * server's answer, and the server is matching 8.8k events this page never holds.
 *
 * The placeholder said "Filter this page of events…" and was honest while that
 * was true. It is now a lie, so it is gone with the limitation.
 *
 * ## Why the write deletes `?page=`
 *
 * Paging here is `LIMIT 100 OFFSET page*100` over ONE ordered list, and a
 * different query text is a different list. Keeping `?page=7` across a keystroke
 * would drop the operator 700 rows into a result set that may hold three — the
 * page would paint empty under a header counting matches. Every query write
 * therefore resets to the first page.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataTableSearch } from '@/components/tables/DataTable';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { useInventoryEventsSpreadsheet } from '@/components/inventory/events-grid/useInventoryEventsSpreadsheet';
import type { PulseEventRow } from '@/components/inventory/types';
import { INVENTORY_EVENTS_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';

const EVENTS_ROUTE = '/inventory/events';
const QUERY_PARAM = 'q';
const PAGE_PARAM = 'page';

export function EventsExplorerTable({
  events,
  emptyMessage,
}: {
  events: PulseEventRow[];
  emptyMessage: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** The COMMITTED query — what the rows in hand are the answer for. */
  const urlQuery = searchParams.get(QUERY_PARAM) ?? '';

  /**
   * Within-route param mutation: clone the current query string, rewrite this
   * one key, and emit in the route's DECLARED key order so
   * `SurfaceParamHygiene` (mounted by `app/inventory/layout.tsx`) sees a
   * canonical URL and fires no second reordering replace. `parseRouteParams`
   * keeps every other declared key, so the form's `event_type` / `station` /
   * `sku` / `unit` / `actor` / `since` / `until` survive a keystroke.
   */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_EVENTS_ROUTE_PARAMS, params).toString();
      router.replace(qs ? `${EVENTS_ROUTE}?${qs}` : EVENTS_ROUTE, { scroll: false });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: string) => {
    if (next.trim()) params.set(QUERY_PARAM, next);
    else params.delete(QUERY_PARAM);
    // See the module docblock: an offset is an address inside one ordered list.
    params.delete(PAGE_PARAM);
  }, []);

  const { value: query, setValue: setQuery } = useOptimisticUrlParam<string>({
    urlValue: urlQuery,
    replace,
    write,
  });

  /**
   * Is the server still answering the text in the box?
   *
   * `query` is the OPTIMISTIC value (painted the instant the operator types);
   * `urlQuery` only catches up when the soft-replace lands, which on this
   * `force-dynamic` page means the new rows have arrived. The gap between them
   * is the one honest "a request for this value is in flight" the RSC path
   * offers — there is no client fetch to ask. Compared TRIMMED because the
   * route's `paramText` schema trims what it writes; comparing raw, a box
   * holding a trailing space would hang the body in its loading face forever.
   */
  const searchPending = query.trim() !== urlQuery.trim();

  const search = useMemo<DataTableSearch>(
    () => ({
      value: query,
      onChange: setQuery,
      // Names the facts an operator reaches for by hand. The SQL also matches
      // the product title, both ends of a status or bin transition, the actor
      // and the note text, so this is the invitation, not the limit.
      placeholder: 'Search event, serial, SKU, bin…',
      answeredBy: 'server',
      pending: searchPending,
    }),
    [query, setQuery, searchPending],
  );

  const sheet = useInventoryEventsSpreadsheet({ events, emptyMessage, search });

  return (
    <div className="flex h-[70vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} />
    </div>
  );
}
