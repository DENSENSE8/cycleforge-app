'use client';

/**
 * To Ship inspector **View** topic cluster — sheet layout / refine chrome that
 * used to live on Band 3. Composes existing controls (no forks).
 *
 * Order: paint · drill · compare · filters · Priority · staff · portal.
 * There is no Hide/Show metrics entry: the KPI band it toggled was removed on
 * 2026-08-29 (`docs/todo/one-sheet-table-sot-PLAN.md` § 3.5).
 */

import { useSearchParams } from 'next/navigation';
import { isPrePackOrderView, type DashboardOrderView } from '@/utils/dashboard-search-state';
import { OutboundExactFilters } from '@/components/dashboard/OutboundFilterStrip';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { OrdersRowPaintChrome } from '@/components/outbound/orders/OrdersRowPaintChrome';
import { OrdersDrillChrome } from '@/components/outbound/orders/OrdersDrillChrome';
import { OrdersCompareChrome } from '@/components/outbound/orders/OrdersCompareChrome';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  ORDERS_COMPARE_LAYOUT_PARAM,
  parseOrdersCompareLayout,
} from '@/lib/shipping/orders-compare-layout';
import { cn } from '@/utils/_cn';

function asFilterMode(view: DashboardOrderView): 'unshipped' | 'tested' | 'packed' | 'shipped' {
  if (view === 'tested' || view === 'packed' || view === 'shipped') return view;
  return 'unshipped';
}

export function OrdersViewTopicsCluster({
  className,
  /** When true, hide paint (needs selection) — still honest for View-only. */
  hidePaint = false,
}: {
  className?: string;
  hidePaint?: boolean;
}) {
  const { setControlsEl } = useOrdersViewChrome();
  const { orderView } = useDashboardSearchController();
  const { sort, setSort } = useQueueDisplaySort();
  const searchParams = useSearchParams();
  const isCompare =
    parseOrdersCompareLayout(searchParams.get(ORDERS_COMPARE_LAYOUT_PARAM)) !== 'single';
  const mode = asFilterMode(orderView);
  // Drill + paint are orthogonal to multi-pane compare — hide while split/quad.
  const showDrillPaint = !hidePaint && !isCompare;

  return (
    <div
      className={cn('flex shrink-0 items-center gap-1', className)}
      role="group"
      aria-label="Orders view topics"
      data-testid="orders-view-topics"
      data-orders-view-topics=""
    >
      {showDrillPaint ? <OrdersRowPaintChrome /> : null}
      {showDrillPaint ? <OrdersDrillChrome /> : null}
      <OrdersCompareChrome />
      <OutboundExactFilters mode={mode} />
      {isPrePackOrderView(orderView) ? (
        <QueueSortSwitch sort={sort} onChange={setSort} variant="icon" />
      ) : null}
      <StaffFilterButton iconOnly align="end" />
      {/* Grid-owned ▦ and lane-owned date controls portal here. Staff is a
          direct View-topic peer, matching Unbox History. */}
      <div
        ref={setControlsEl}
        className="contents"
        data-orders-view-controls=""
      />
    </div>
  );
}
