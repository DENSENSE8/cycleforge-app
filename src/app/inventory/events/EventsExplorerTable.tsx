'use client';

/** Admin › Inventory events explorer — the PAGE feed for `/inventory/events`. */

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

  /** Within-route param mutation: */
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

  /** Is the server still answering the text in the box? */
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
