'use client';

/**
 * Pending-order queue for `/m/checklist` — same pool as Picks
 * (`excludePacked`), with search on product title + item number via
 * `/api/orders?q=`. Tap opens the kit/QC editor for that order line.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { CaptureStack, useCaptureStackWindow, useCaptureStackQuery } from '@/design-system/components/capture-stack';
import { GridDegradedBox } from '@/design-system/components/grid';
import { PendingOrderRow } from '@/components/mobile/feed/rows/PendingOrderRow';
import { fetchPendingOrdersData } from '@/lib/dashboard-table-data';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export function MobileChecklistOrderQueue({
  initialQuery = '',
}: {
  /** Preserved `?q=` when returning from the editor. */
  initialQuery?: string;
}) {
  const router = useRouter();
  const [draftQ, setDraftQ] = useState(initialQuery);
  const [submittedQ, setSubmittedQ] = useState(initialQuery.trim());

  useEffect(() => {
    setDraftQ(initialQuery);
    setSubmittedQ(initialQuery.trim());
  }, [initialQuery]);

  const queryKey = [
    'mobile-checklist-pending',
    { searchQuery: submittedQ, packedBy: undefined, testedBy: undefined },
  ] as const;

  const { data, isLoading, isError, refetch } = useCaptureStackQuery<ShippedOrder>({
    queryKey,
    queryFn: () => fetchPendingOrdersData({ searchQuery: submittedQ }),
    realtime: { invalidation: { dashboard: true }, refreshDomains: ['orders.outbound'] },
  });

  const { rows, scrollRef } = useCaptureStackWindow(data, {
    limit: null,
    anchor: 'top',
    freshPulse: false,
  });

  const applySearch = useCallback(() => {
    const next = draftQ.trim();
    setSubmittedQ(next);
    const params = new URLSearchParams();
    if (next) params.set('q', next);
    const qs = params.toString();
    router.replace(qs ? `/m/checklist?${qs}` : '/m/checklist');
  }, [draftQ, router]);

  const openOrder = useCallback(
    (order: ShippedOrder) => {
      const params = new URLSearchParams();
      params.set('orderRowId', String(order.id));
      if (submittedQ) params.set('q', submittedQ);
      router.push(`/m/checklist?${params.toString()}`);
    },
    [router, submittedQ],
  );

  return (
    <div className={`flex h-full flex-col ${TOKENS.colors.background}`}>
      <div className="shrink-0 space-y-2 border-b border-border-hairline bg-surface-card px-4 py-3">
        <div>
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Checklists</p>
          <p className="mt-0.5 text-role-caption font-medium text-text-muted">
            Pending orders — filter by title or item #, then edit kit + QC.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            placeholder="Product title or item #"
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface-canvas px-3 py-3 text-role-body font-semibold text-text-default placeholder:text-text-faint"
            aria-label="Filter orders by product title or item number"
          />
          <Button
            variant="brand"
            size="sm"
            icon={<Search className="h-4 w-4" />}
            onClick={applySearch}
            className="h-auto shrink-0 rounded-2xl px-4"
            ariaLabel="Search orders"
          >
            Go
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isError && rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <GridDegradedBox
              message="Couldn't load the checklist queue."
              onRetry={() => {
                void refetch();
              }}
            />
          </div>
        ) : (
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
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                  {submittedQ ? 'No matches' : 'Nothing pending'}
                </p>
                <p className="max-w-[260px] text-xs font-medium text-blue-700/50">
                  {submittedQ
                    ? 'Try a different product title or item number.'
                    : 'No orders are waiting to be packed right now.'}
                </p>
              </div>
            }
            renderRow={(order, { variant, fresh }) => (
              <PendingOrderRow
                row={order}
                variant={variant}
                fresh={fresh}
                showItemNumber
                onTap={() => openOrder(order)}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
