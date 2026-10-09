'use client';

/**
 * Unbox › Return order — the header tab a returned unit's scanned serial
 * opens: the order it left on as Search opens it (the same `OrderRecordView`,
 * the same lookup — its return reason above Fulfillment), read only
 * (`unbox.fulfilled-order`). The station never works the order from here.
 */

import { PackageCheck } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { DeskStageRecordHeader } from '@/design-system/components/DeskStageOverlay';
import { OrderRecordTitle, OrderRecordView } from '@/components/outbound/orders/OrderRecordView';
import { OrderRecordHeaderActions } from '@/components/outbound/orders/record-keys/OrderRecordHeaderActions';
import { useOrderRecordLookup } from '@/components/outbound/orders/useOrderRecordLookup';
import { useOrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getCurrentPSTDateKey } from '@/utils/date';

export function UnboxFulfilledOrderTask({
  order,
}: {
  /** The packed / shipped order the serial traced to (`useFulfilledReturnOrder`); null while the serial no longer traces. */
  order: ShippedOrder | null;
}) {
  const { record, records } = useOrderRecordLookup(order ? Number(order.id) : '');
  const commits = useOrdersQueueCommits();
  const { getStaffName } = useStaffNameMap();

  if (!order) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center" data-testid="unbox-fulfilled-order-empty">
        <EmptyState
          icon={<PackageCheck className="h-6 w-6 text-text-faint" />}
          title="No return order"
          description="The serial on this line does not trace to an order we packed or shipped."
        />
      </div>
    );
  }

  const shown = record ?? order;
  const orderRef = String(shown.order_id ?? '').trim() || `#${shown.id}`;
  const shownRecords = record ? records : [order];
  return (
    <section
      aria-label={`Return order ${orderRef}`}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="unbox-fulfilled-order"
    >
      <DeskStageRecordHeader
        title={<OrderRecordTitle record={shown} records={shownRecords} />}
        actions={<OrderRecordHeaderActions record={shown} records={shownRecords} viewKey="unbox.fulfilled-order" />}
      />
      {/* The record's layout queries this container (2/3 + 1/3 at @4xl), as in Search. */}
      <div className="@container flex flex-1 flex-col">
        <OrderRecordView
          viewKey="unbox.fulfilled-order"
          record={shown}
          records={shownRecords}
          todayKey={getCurrentPSTDateKey()}
          getStaffName={getStaffName}
          commits={commits}
        />
      </div>
    </section>
  );
}
