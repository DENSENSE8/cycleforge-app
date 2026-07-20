'use client';

/**
 * Persistent left column for Dashboard Search order detail — status, platform,
 * and key identifiers. Always visible while any tab is active on the right.
 */

import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { conditionLabel } from '@/lib/conditions';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import {
  SearchOrderFactList,
  SearchOrderFactRow,
} from '@/components/dashboard/search/SearchOrderTabFrame';

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

export function SearchOrderSummaryColumn({ order }: { order: ShippedOrder }) {
  const orderChannelLabel = useOrderChannelLabel();
  const platform = orderChannelLabel(order.order_id || '', order.account_source);
  const tracking = firstNonEmpty(
    order.shipping_tracking_number,
    ...(order.tracking_numbers ?? []),
  );
  const status = firstNonEmpty(
    order.latest_status_label,
    order.shipment_status,
    order.is_delivered ? 'Delivered' : '',
    order.is_shipped ? 'Shipped' : '',
    'Open',
  );

  return (
    <aside className="flex min-h-0 w-full flex-col border-b border-border-hairline bg-surface-card lg:w-[20rem] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="shrink-0 border-b border-border-hairline px-4 py-3">
        <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
          Summary
        </p>
        <p className="mt-1 truncate text-role-body font-bold text-text-default">
          {order.product_title || 'Order'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <SearchOrderFactList>
          <SearchOrderFactRow label="Status" value={status} />
          <SearchOrderFactRow label="Platform" value={platform} />
          <SearchOrderFactRow label="Order #" value={order.order_id} mono />
          <SearchOrderFactRow label="Tracking" value={tracking} mono />
          <SearchOrderFactRow label="SKU" value={order.sku} mono />
          <SearchOrderFactRow
            label="Condition"
            value={order.condition ? conditionLabel(order.condition, 'table') : ''}
          />
          <SearchOrderFactRow label="Serial" value={order.serial_number} mono />
          <SearchOrderFactRow
            label="Created"
            value={order.created_at ? formatDateTimePST(order.created_at) : ''}
          />
          <SearchOrderFactRow
            label="Ship by"
            value={order.ship_by_date ? formatDateTimePST(order.ship_by_date) : ''}
          />
        </SearchOrderFactList>
      </div>
    </aside>
  );
}
