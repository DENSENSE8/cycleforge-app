'use client';

import type { ShippedOrder } from '@/types/orders';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { SearchOrderTabFrame } from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderTimelineTab({ order }: { order: ShippedOrder }) {
  if (!order.id) {
    return (
      <SearchOrderTabFrame
        title="Timeline"
        empty={{ title: 'No activity', body: 'Activity will appear once this order is loaded.' }}
      />
    );
  }

  const serials = [
    ...new Set(
      String(order.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  return (
    <SearchOrderTabFrame
      title="Timeline"
      description="Audit, station, and serial journey for this order."
    >
      <div className="space-y-4">
        <OrderTimelineSection orderId={Number(order.id)} />
        {serials.map((sn) => (
          <SerialJourneySection
            key={sn}
            serialNumber={sn}
            title={serials.length > 1 ? `Item Journey · ${sn}` : 'Item Journey'}
            density="compact"
          />
        ))}
      </div>
    </SearchOrderTabFrame>
  );
}
