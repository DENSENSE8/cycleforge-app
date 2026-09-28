'use client';

/**
 * `/search?sel=order:<id|order#>` on the desk — the order RECORD itself, no
 * queue around it (a lookup is not a queue). The same `OrderRecordView` the
 * To-ship desk opens, so search and the desks stay one record (Shopify
 * order-details grammar: items → shipping → timeline · customer and facts).
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { DeskStageRecordHeader } from '@/design-system/components/DeskStageOverlay';
import { OrderRecordStatus, OrderRecordTitle, OrderRecordView } from '@/components/outbound/orders/OrderRecordView';
import { OrderRecordActionStrip } from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
import { useOrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { fetchOrderLookupData } from '@/lib/dashboard-table-data';
import { clearGlobalSearchPending, setGlobalSearchPending } from '@/lib/global-search-pending';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import {
  searchOrderByIdResolveQuery,
  searchOrderResolveQuery,
} from '@/lib/search/search-order-resolve-query';
import { getCurrentPSTDateKey } from '@/utils/date';
import { DESK_STAGE_FIXED_CLASS } from '@/design-system/tokens/desk-stage';
import { cn } from '@/utils/_cn';

export function SearchOrderRecord({
  orderId,
  onBack,
}: {
  orderId: string | number;
  /** Back to the results the operator searched; absent on a bare deep link. */
  onBack?: () => void;
}) {
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

  // The pk is known from `?sel` before the order resolves: start the record's
  // slowest read (timeline + photo peek, one key) now instead of after paint.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (resolveByPk) void queryClient.prefetchQuery(orderTimelineQuery(orderPk));
  }, [queryClient, resolveByPk, orderPk]);

  // Every line of this order. Keyed under `orders` so the inline edits'
  // optimistic patch (`useOrderAssignment`) lands on these rows too.
  const orderNumber = String(order?.order_id ?? '').trim();
  const linesQuery = useQuery({
    queryKey: ['orders', 'search-record-lines', orderNumber],
    queryFn: () => fetchOrderLookupData(orderNumber, { includeFba: true }),
    enabled: orderNumber.length > 0,
    staleTime: 0,
  });
  const records = useMemo(() => {
    const lines = (linesQuery.data ?? []).filter((line) => String(line.order_id ?? '').trim() === orderNumber);
    return lines.length > 0 ? lines : order ? [order] : [];
  }, [linesQuery.data, order, orderNumber]);
  // The record reads the LIVE row (optimistic edits land there).
  const record = order ? (records.find((line) => Number(line.id) === Number(order.id)) ?? order) : null;

  const commits = useOrdersQueueCommits();
  const { getStaffName } = useStaffNameMap();
  const todayKey = getCurrentPSTDateKey();

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (!resolving) primaryPaint?.onPrimaryPainted();
  }, [resolving, primaryPaint]);
  useEffect(() => {
    setGlobalSearchPending(resolving);
    return () => clearGlobalSearchPending();
  }, [resolving]);

  if (resolving) return <div className="min-h-0 flex-1" aria-busy />;

  if (!record) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-mode-canvas">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Order not found"
          description="No order matched this selection. Try another search hit."
        />
      </div>
    );
  }

  const orderRef = orderNumber || `#${record.id}`;
  return (
    <section
      aria-label={`Order ${orderRef}`}
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas"
      data-testid="search-order-record"
    >
      {/* The desk stage measure (max-w-6xl, centered) — the width To-ship's
          record opens at; the ground stays full-bleed around it. */}
      <div className={cn(DESK_STAGE_FIXED_CLASS, 'shrink-0')}>
        <DeskStageRecordHeader
          title={<OrderRecordTitle record={record} records={records} />}
          actions={<OrderRecordStatus record={record} records={records} />}
          onClose={onBack}
        />
        <div className="border-b border-border-hairline">
          <OrderRecordActionStrip key={record.id} record={record} viewKey="search.orders" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* The record's layout queries this container (2/3 + 1/3 at @4xl), as in `DeskRecordPlane`'s body. */}
        <div className={cn(DESK_STAGE_FIXED_CLASS, '@container flex flex-1 flex-col')}>
          <OrderRecordView
            viewKey="search.orders"
            record={record}
            records={records}
            todayKey={todayKey}
            getStaffName={getStaffName}
            commits={commits}
          />
        </div>
      </div>
    </section>
  );
}
