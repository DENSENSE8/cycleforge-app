'use client';

/**
 * `/search?sel=order:<id|order#>` on the desk — the ON-THE-PHONE lookup
 * (docs/todo/support-call-desk-PLAN.md, Phase 1: "I'm on the phone and I
 * searched the order").
 *
 * Not a second order display: it mounts the To-ship {@link OutboundOrdersLedger}
 * over the searched order's lines (any state, shipped included) in the TRIAGE
 * mode, with the searched line open in the same `OrderRecordView` To-ship uses
 * (its `search` sections add the return / replacement labels) — customer,
 * price, labels, tracking, notes, platform, all
 * editable through the same commit waist. The ledger's find box searches every
 * order (order #, customer, email, tracking, SKU), so the caller's next order is
 * one type away. The phone keeps the compact dossier until the plan's Phase 6.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { OutboundOrdersLedger } from '@/components/outbound/orders/OutboundOrdersLedger';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { fetchOrderLookupData } from '@/lib/dashboard-table-data';
import { clearGlobalSearchPending, setGlobalSearchPending } from '@/lib/global-search-pending';
import { useRefreshSignal } from '@/lib/refresh/bus';
import {
  searchOrderByIdResolveQuery,
  searchOrderResolveQuery,
} from '@/lib/search/search-order-resolve-query';

/** Its own selection namespace: a tick here is not a To-ship selection. */
const SEARCH_ORDER_SELECTION_SCOPE = 'search-order-lookup';
const FIND_DEBOUNCE_MS = 250;
const NO_FILTERS: ToShipChrome['filter'] = { options: [], onToggle: () => {}, onClearAll: () => {} };

export function SearchOrderLedger({ orderId }: { orderId: string | number }) {
  const token = String(orderId ?? '').trim();
  const orderPk = Number(orderId);
  const resolveByPk = Number.isSafeInteger(orderPk) && orderPk > 0;
  const byIdQuery = useQuery({
    ...searchOrderByIdResolveQuery(resolveByPk ? orderPk : 0),
    enabled: resolveByPk,
  });
  const byTokenQuery = useQuery({
    ...searchOrderResolveQuery(token),
    enabled: !resolveByPk && token.length > 0,
  });
  const resolveQuery = resolveByPk ? byIdQuery : byTokenQuery;
  const resolved = resolveQuery.data;
  const resolving = (resolveQuery.isPending || resolveQuery.isLoading) && !resolved;
  const order = resolved?.status === 'ok' ? resolved.order : null;

  // The find text starts as the order's own number (every line of it) and is
  // the operator's once they type.
  const [typed, setTyped] = useState<string | null>(null);
  useEffect(() => setTyped(null), [token]);
  const find = typed ?? String(order?.order_id ?? '').trim();
  const [debounced, setDebounced] = useState(find);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(find), FIND_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [find]);

  const linesQuery = useQuery({
    queryKey: ['search-order-lookup', debounced.trim()],
    queryFn: () => fetchOrderLookupData(debounced),
    enabled: debounced.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const refetchLines = linesQuery.refetch;
  useRefreshSignal('orders.outbound', () => {
    void refetchLines();
  });
  const records = useMemo(() => linesQuery.data ?? (order ? [order] : []), [linesQuery.data, order]);

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (!resolving) primaryPaint?.onPrimaryPainted();
  }, [resolving, primaryPaint]);
  useEffect(() => {
    setGlobalSearchPending(resolving);
    return () => clearGlobalSearchPending();
  }, [resolving]);

  const chrome = useMemo<ToShipChrome>(
    () => ({
      search: {
        value: find,
        // Clearing the box goes back to the searched order, never to an empty ledger.
        onChange: (value: string) => setTyped(value.trim() ? value : null),
        placeholder: 'Order #, customer, email, tracking…',
      },
      filter: NO_FILTERS,
    }),
    [find],
  );
  const noop = useCallback(() => {}, []);

  if (resolving) return <div className="min-h-0 flex-1" aria-busy />;

  if (resolved?.status === 'fba' || !order) {
    const fba = resolved?.status === 'fba';
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title={fba ? 'FBA order' : 'Order not found'}
          description={
            fba
              ? 'Amazon fulfills this order. Open the FBA desk for channel-specific detail.'
              : 'No order matched this selection. Try another search hit.'
          }
        />
      </div>
    );
  }

  return (
    <ModeRegion
      mode="triage"
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas"
      data-testid="search-order-ledger"
    >
      <OutboundOrdersLedger
        mode="search"
        chrome={chrome}
        searchPending={linesQuery.isFetching || find.trim() !== debounced.trim()}
        records={records}
        loading={linesQuery.isLoading}
        onOpenRecord={noop}
        onCloseRecord={noop}
        railSelection={false}
        selectionScope={SEARCH_ORDER_SELECTION_SCOPE}
        searchEmptyTitle="No order found"
        searchResultLabel="order lines"
        clearSearchLabel="Back to this order"
        openRecordId={Number(order.id)}
      />
    </ModeRegion>
  );
}
