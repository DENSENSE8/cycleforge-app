'use client';

/**
 * Mobile picker queue — `/m/pick`.
 *
 * The phone view of the dashboard `?pending=` table: the same pending orders
 * (fetchPendingOrdersData → /api/orders?excludePacked=true), rendered through
 * the shared mobile feed primitives (useCaptureStackQuery → useCaptureStackWindow →
 * CaptureStack + PendingOrderRow). Header lives in the shell.
 */

import { Package } from '@/components/Icons';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { CaptureStack, useCaptureStackWindow, useCaptureStackQuery } from '@/design-system/components/capture-stack';
import { GridDegradedBox } from '@/design-system/components/grid';
import { PendingOrderRow } from '@/components/mobile/feed/rows/PendingOrderRow';
import { fetchPendingOrdersData } from '@/lib/dashboard-table-data';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { useRouter } from 'next/navigation';

// Shares the dashboard pending cache (and its realtime invalidation) by reusing
// the same warmed query key the dashboard prefetches.
const PENDING_QUERY_KEY = ['dashboard-table', 'pending', { searchQuery: '', packedBy: undefined, testedBy: undefined }] as const;

export default function RedesignedMobilePickQueue() {
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useCaptureStackQuery<ShippedOrder>({
    queryKey: PENDING_QUERY_KEY,
    queryFn: () => fetchPendingOrdersData({}),
    realtime: { invalidation: { dashboard: true }, refreshDomains: ['orders.outbound'] },
  });

  // Queue reads top-down in deadline/priority order — no reverse, no auto-scroll.
  const { rows, scrollRef } = useCaptureStackWindow(data, { limit: null, anchor: 'top', freshPulse: false });

  // Fourth settled state: failed fetch + nothing to show → Retry, never "Nothing pending".
  if (isError && rows.length === 0) {
    return (
      <div className={`flex h-full flex-col items-center justify-center ${TOKENS.colors.background}`}>
        <GridDegradedBox
          message="Couldn't load the pick queue."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${TOKENS.colors.background}`}>
      <CaptureStack<ShippedOrder>
        rows={rows}
        isLoading={isLoading}
        scrollRef={scrollRef}
        expandLast={false}
        getId={(row) => row.id}
        className="pt-2 pb-3"
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Package className="mb-1 h-10 w-10 text-blue-200" />
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">Nothing pending</p>
            <p className="max-w-[260px] text-xs font-medium text-blue-700/50">
              No orders are waiting to be picked right now.
            </p>
          </div>
        }
        renderRow={(order, { variant, fresh }) => (
          <PendingOrderRow
            row={order}
            variant={variant}
            fresh={fresh}
            onTap={() => router.push(`/m/orders/${encodeURIComponent(order.order_id || String(order.id))}`)}
          />
        )}
      />
    </div>
  );
}
