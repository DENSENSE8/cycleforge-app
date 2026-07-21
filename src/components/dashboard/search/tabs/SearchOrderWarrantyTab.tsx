'use client';

import type { ShippedOrder } from '@/types/orders';
import { OrderWarrantySection } from '@/components/shipped/details-panel/OrderWarrantySection';
import { SearchOrderTabFrame } from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderWarrantyTab({ order }: { order: ShippedOrder }) {
  return (
    <SearchOrderTabFrame title="Warranty" description="Coverage and claims for this order.">
      <OrderWarrantySection order={order} />
    </SearchOrderTabFrame>
  );
}
