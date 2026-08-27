'use client';

/**
 * Orders List | Drill chrome — icon menu over the WMS-wide drill SoT.
 * Orthogonal to compare (`clayout`). Entering drill clears compare params.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronsRight, List } from '@/components/Icons';
import { ToolbarIconMenu } from '@/components/ui/ToolbarIconMenu';
import {
  ORDERS_DRILL_ORDER_PARAM,
  parseOrdersDrillLayout,
  writeOrdersDrillParams,
  type OrdersDrillLayout,
} from '@/lib/shipping/orders-drill-layout';
import { clearOrdersCompareParams } from '@/lib/shipping/orders-compare-layout';

const LAYOUT_OPTS = [
  { id: 'drill' as const, label: 'Drill', icon: ChevronsRight },
  { id: 'list' as const, label: 'List', icon: List },
];

export function OrdersDrillChrome({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const layout = parseOrdersDrillLayout(
    searchParams.get('olayout'),
  );

  const setLayout = (next: OrdersDrillLayout) => {
    const params = new URLSearchParams(searchParams.toString());
    const drillOrder =
      next === 'drill' ? params.get(ORDERS_DRILL_ORDER_PARAM) : null;
    writeOrdersDrillParams(params, next, drillOrder);
    if (next === 'list') params.delete(ORDERS_DRILL_ORDER_PARAM);
    if (next === 'drill') clearOrdersCompareParams(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <ToolbarIconMenu
      className={className}
      value={layout}
      onChange={setLayout}
      options={LAYOUT_OPTS}
      ariaLabel="Orders table layout"
      tooltipLabel={layout === 'drill' ? 'Drill' : 'List'}
      testId="orders-drill-chrome"
    />
  );
}
