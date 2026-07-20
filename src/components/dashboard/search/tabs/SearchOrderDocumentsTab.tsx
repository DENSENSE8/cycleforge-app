'use client';

import type { ShippedOrder } from '@/types/orders';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { SearchOrderTabFrame } from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderDocumentsTab({ order }: { order: ShippedOrder }) {
  if (!order.id) {
    return (
      <SearchOrderTabFrame
        title="Documents"
        empty={{ title: 'No documents', body: 'This order has no document surface yet.' }}
      />
    );
  }

  return (
    <SearchOrderTabFrame title="Documents" description="Labels, slips, and attached files.">
      <OrderDocumentsSection
        orderId={Number(order.id)}
        orderRef={order.order_id || `order-${order.id}`}
        readOnly
      />
    </SearchOrderTabFrame>
  );
}
