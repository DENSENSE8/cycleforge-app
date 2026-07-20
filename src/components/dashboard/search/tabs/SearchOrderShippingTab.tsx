'use client';

import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import {
  SearchOrderFactList,
  SearchOrderFactRow,
  SearchOrderTabFrame,
} from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderShippingTab({ order }: { order: ShippedOrder }) {
  const trackingRows = order.tracking_number_rows?.filter((r) => r.tracking?.trim()) ?? [];
  const trackingList =
    trackingRows.length > 0
      ? trackingRows.map((r) => r.tracking).join(', ')
      : order.shipping_tracking_number || (order.tracking_numbers ?? []).join(', ');

  return (
    <SearchOrderTabFrame
      title="Shipping"
      description="Carrier, tracking, and ship-out facts for this order."
    >
      <SearchOrderFactList>
        <SearchOrderFactRow label="Tracking" value={trackingList} mono />
        <SearchOrderFactRow label="Carrier" value={order.carrier} />
        <SearchOrderFactRow label="Tracking type" value={order.tracking_type} />
        <SearchOrderFactRow label="Shipment status" value={order.shipment_status} />
        <SearchOrderFactRow label="Latest status" value={order.latest_status_label} />
        <SearchOrderFactRow
          label="Latest event"
          value={order.latest_event_at ? formatDateTimePST(order.latest_event_at) : ''}
        />
        <SearchOrderFactRow
          label="Ship confirmed"
          value={order.ship_confirmed_at ? formatDateTimePST(order.ship_confirmed_at) : ''}
        />
        <SearchOrderFactRow label="Shipped by" value={order.shipped_out_by_name} />
        <SearchOrderFactRow
          label="Packed at"
          value={order.packed_at ? formatDateTimePST(order.packed_at) : ''}
        />
        <SearchOrderFactRow label="Packed by" value={order.packed_by_name} />
      </SearchOrderFactList>
    </SearchOrderTabFrame>
  );
}
