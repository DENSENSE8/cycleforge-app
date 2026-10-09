'use client';

/**
 * `/search?sel=order:<id|order#>` on the desk — the order RECORD itself, no
 * queue around it (a lookup is not a queue). The same `OrderRecordView` the
 * To-ship desk opens, so search and the desks stay one record (Shopify
 * order-details grammar: items → shipping → timeline · customer and facts).
 */

import { useEffect } from 'react';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { DeskStageRecordHeader } from '@/design-system/components/DeskStageOverlay';
import { OrderRecordTitle, OrderRecordView } from '@/components/outbound/orders/OrderRecordView';
import { OrderRecordHeaderActions } from '@/components/outbound/orders/record-keys/OrderRecordHeaderActions';
import { useOrderRecordLookup } from '@/components/outbound/orders/useOrderRecordLookup';
import { useOrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { clearGlobalSearchPending, setGlobalSearchPending } from '@/lib/global-search-pending';
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
  const { resolving, record, records } = useOrderRecordLookup(orderId);

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

  const orderRef = String(record.order_id ?? '').trim() || `#${record.id}`;
  return (
    <section
      aria-label={`Order ${orderRef}`}
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas"
      data-testid="search-order-record"
    >
      {/* The desk stage measure (max-w-6xl, centered) — the width To-ship's
          record opens at; the ground stays full-bleed around it. */}
      <div className={cn(DESK_STAGE_FIXED_CLASS, 'shrink-0')}>
        {/* Title, the order's statuses and photo count top right, close: the record's verbs paint in its Actions panel (operator 2026-10-08). */}
        <DeskStageRecordHeader
          title={<OrderRecordTitle record={record} records={records} />}
          actions={<OrderRecordHeaderActions record={record} records={records} viewKey="search.orders" />}
          onClose={onBack}
        />
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
