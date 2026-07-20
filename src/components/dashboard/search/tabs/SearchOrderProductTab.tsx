'use client';

import { conditionLabel } from '@/lib/conditions';
import type { ShippedOrder } from '@/types/orders';
import {
  SearchOrderFactList,
  SearchOrderFactRow,
  SearchOrderTabFrame,
} from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderProductTab({ order }: { order: ShippedOrder }) {
  return (
    <SearchOrderTabFrame
      title="Product"
      description="Catalog and unit identity for the line on this order."
    >
      <SearchOrderFactList>
        <SearchOrderFactRow label="Title" value={order.product_title} />
        <SearchOrderFactRow label="SKU" value={order.sku} mono />
        <SearchOrderFactRow label="Item #" value={order.item_number} mono />
        <SearchOrderFactRow label="Quantity" value={order.quantity} />
        <SearchOrderFactRow
          label="Condition"
          value={order.condition ? conditionLabel(order.condition, 'table') : ''}
        />
        <SearchOrderFactRow label="Serial" value={order.serial_number} mono />
        <SearchOrderFactRow label="Tester" value={order.tester_name ?? order.tested_by_name} />
        <SearchOrderFactRow label="Packer" value={order.packed_by_name} />
        <SearchOrderFactRow
          label="Sale amount"
          value={
            order.sale_amount != null && order.sale_amount !== ''
              ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
              : ''
          }
        />
      </SearchOrderFactList>
    </SearchOrderTabFrame>
  );
}
