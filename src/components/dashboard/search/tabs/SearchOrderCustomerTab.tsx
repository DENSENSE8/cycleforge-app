'use client';

import type { ShippedOrder } from '@/types/orders';
import {
  SearchOrderFactList,
  SearchOrderFactRow,
  SearchOrderTabFrame,
} from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderCustomerTab({ order }: { order: ShippedOrder }) {
  const customerId = order.customer_id;
  if (customerId == null) {
    return (
      <SearchOrderTabFrame
        title="Customer"
        empty={{
          title: 'No customer linked',
          body: 'Buyer identity is not linked on this order yet.',
        }}
      />
    );
  }

  return (
    <SearchOrderTabFrame title="Customer" description="Linked buyer record for this order.">
      <SearchOrderFactList>
        <SearchOrderFactRow label="Customer ID" value={String(customerId)} mono />
        <SearchOrderFactRow label="Order #" value={order.order_id} mono />
        <SearchOrderFactRow label="Account source" value={order.account_source} />
      </SearchOrderFactList>
    </SearchOrderTabFrame>
  );
}
