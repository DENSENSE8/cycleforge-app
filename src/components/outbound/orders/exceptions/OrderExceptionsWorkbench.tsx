'use client';

/**
 * **Order exceptions** — the held-order queue, on the ONE outbound grid.
 * `exceptions` sections — through `DeskRecordPlane` (owner 2026-09-25): in
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { OutboundOrdersLedger } from '@/components/outbound/orders/OutboundOrdersLedger';
import { useToShipChrome } from '@/components/unshipped/useToShipChrome';
import { exceptionRowToQueueRow } from '@/lib/queries/caged-orders-queries';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import {
  ORDER_EXCEPTION_CATEGORIES,
  sortExceptionQueueRows,
  type OrderExceptionCategory,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';
import { ExceptionResolveSection } from './ExceptionResolveSection';

interface ExceptionsPayload {
  ok: boolean;
  count: number;
  exceptions: OrderExceptionRow[];
}

/**
 * Its OWN selection scope, never the dashboard's. A tick here must not appear
 * in the To-ship rail's selection — same rows, different question.
 */
const EXCEPTIONS_SELECTION_SCOPE = 'order-exceptions';

export function OrderExceptionsWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedParam = Number(searchParams.get('order'));
  const selectedId = Number.isFinite(selectedParam) && selectedParam > 0 ? selectedParam : null;
  // Desk-local, like every Shipping view: the sidebar box writes the in-memory
  // desk store for this path, never a URL param.
  const [search, setSearch] = useDeskSearch(SHIPPING_EXCEPTIONS_PATH);
  const rawCategory = searchParams.get('category');
  const category: OrderExceptionCategory | null = ORDER_EXCEPTION_CATEGORIES.includes(
    rawCategory as OrderExceptionCategory,
  )
    ? (rawCategory as OrderExceptionCategory)
    : null;

  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /** One writer for the URL bits this surface owns; sort has its own hook. */
  const patchParams = useCallback(
    (delta: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(delta)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${SHIPPING_EXCEPTIONS_PATH}?${qs}` : SHIPPING_EXCEPTIONS_PATH, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const query = useQuery({
    queryKey: ['order-exceptions', 'actionable', category, debounced],
    queryFn: async (): Promise<ExceptionsPayload> => {
      const params = new URLSearchParams({ scope: 'actionable' });
      if (category) params.set('category', category);
      if (debounced.trim()) params.set('q', debounced.trim());
      const res = await fetch(`/api/orders/exceptions?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Could not load exceptions (${res.status})`);
      return (await res.json()) as ExceptionsPayload;
    },
    staleTime: 0,
  });

  const exceptions = useMemo(
    () => sortExceptionQueueRows(query.data?.exceptions ?? []),
    [query.data],
  );

  // Memoized: this list is the input to the grouped row model, so an
  // unmemoized re-derive would re-identify every row on every render.
  const records = useMemo(() => exceptions.map(exceptionRowToQueueRow), [exceptions]);

  const openRecord = useCallback(
    (record: ShippedOrder) => patchParams({ order: String(record.id) }),
    [patchParams],
  );

  /** Leave the record, paint the queue: the plane's ✕ and Esc land here. */
  const closeRecord = useCallback(() => patchParams({ order: null }), [patchParams]);

  /**
   * After a write: refetch. A RESOLVED row leaves the actionable set, and the
   * ledger's selection closes a record whose row left the queue — the operator
   * gets the queue back rather than being pushed at an arbitrary neighbour.
   */
  const { refetch } = query;
  const handleChanged = useCallback(() => {
    void refetch();
  }, [refetch]);
  const resolveRecord = useCallback(
    (record: ShippedOrder) => {
      const row = exceptions.find((r) => r.id === Number(record.id));
      return row ? <ExceptionResolveSection key={row.id} row={row} onChanged={handleChanged} /> : null;
    },
    [exceptions, handleChanged],
  );
  const toShipChrome = useToShipChrome();
  const chrome = useMemo(
    () => ({
      ...toShipChrome,
      search: {
        value: search,
        onChange: setSearch,
        placeholder: 'Filter orders…',
      },
    }),
    [search, setSearch, toShipChrome],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      {query.isError ? (
        <div
          className="border-b border-border-danger bg-surface-danger px-6 py-2 text-role-caption font-semibold text-text-danger"
          data-testid="exceptions-error"
        >
          {(query.error as Error)?.message ?? 'Could not load exceptions.'}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="exceptions-queue">
        <OutboundOrdersLedger
          viewKey="shipping.exceptions"
          chrome={chrome}
          searchPending={query.isFetching || search.trim() !== debounced.trim()}
          records={records}
          loading={query.isLoading}
          onOpenRecord={openRecord}
          onCloseRecord={closeRecord}
          openRecordId={selectedId}
          resolveRecord={resolveRecord}
          railSelection={false}
          selectionScope={EXCEPTIONS_SELECTION_SCOPE}
          searchEmptyTitle="No held order found"
          searchResultLabel="held orders"
          clearSearchLabel="Show all held orders"
        />
      </div>
    </div>
  );
}
