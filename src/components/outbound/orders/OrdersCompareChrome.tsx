'use client';

/**
 * Orders compare layout — icon menu in the triage band (1 / 2 / 4 panes).
 * Entering multi-pane clears drill params (mutually exclusive).
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ColumnsOne,
  ColumnsTwo,
  LayoutDashboard,
} from '@/components/Icons';
import { ToolbarIconMenu } from '@/components/ui/ToolbarIconMenu';
import {
  defaultOrdersComparePanes,
  parseOrdersCompareLayout,
  writeOrdersCompareParams,
  type OrdersCompareLayout,
  ORDERS_COMPARE_LAYOUT_PARAM,
} from '@/lib/shipping/orders-compare-layout';
import {
  ORDERS_DRILL_LAYOUT_PARAM,
  ORDERS_DRILL_ORDER_PARAM,
} from '@/lib/shipping/orders-drill-layout';

const LAYOUT_OPTS = [
  { id: 'single' as const, label: '1 pane', icon: ColumnsOne },
  { id: 'split' as const, label: '2 panes', icon: ColumnsTwo },
  { id: 'quad' as const, label: '4 panes', icon: LayoutDashboard },
];

export function OrdersCompareChrome({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const layout = parseOrdersCompareLayout(
    searchParams.get(ORDERS_COMPARE_LAYOUT_PARAM),
  );

  const setLayout = (next: OrdersCompareLayout) => {
    const params = new URLSearchParams(searchParams.toString());
    writeOrdersCompareParams(params, next, defaultOrdersComparePanes(next));
    if (next !== 'single') {
      params.delete(ORDERS_DRILL_LAYOUT_PARAM);
      params.delete(ORDERS_DRILL_ORDER_PARAM);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <ToolbarIconMenu
      className={className}
      value={layout}
      onChange={setLayout}
      options={LAYOUT_OPTS}
      ariaLabel="Orders compare layout"
      tooltipLabel={
        layout === 'quad' ? '4 panes' : layout === 'split' ? '2 panes' : '1 pane'
      }
      testId="orders-compare-chrome"
    />
  );
}
