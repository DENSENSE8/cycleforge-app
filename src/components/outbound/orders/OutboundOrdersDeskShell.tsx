'use client';

/**
 * Client shell for `/shipping/orders` — shows the SSR first-paint stand-in
 * until the interactive desk marks primary paint ready (seeded query settled).
 */

import { useCallback, useState, useEffect } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { OutboundOrdersDesk } from '@/components/outbound/orders/OutboundOrdersDesk';
import { ShippingOrdersAssistantContext } from '@/components/outbound/orders/ShippingOrdersAssistantContext';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';
import { cn } from '@/utils/_cn';

export function OutboundOrdersDeskShell({
  firstPaintRows,
}: {
  firstPaintRows: ShippedOrder[];
}) {
  const [primaryReady, setPrimaryReady] = useState(false);
  const onPrimaryPainted = useCallback(() => setPrimaryReady(true), []);

  useSurfacePaintMark('orders:chrome', true);
  useEffect(() => {
    if (primaryReady || firstPaintRows.length > 0) {
      markTier1Priority('orders', 'primary');
    }
  }, [primaryReady, firstPaintRows.length]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <ShippingOrdersAssistantContext />
      {!primaryReady ? (
        <div className="pointer-events-none absolute inset-0 z-0 flex min-h-0 flex-col">
          <OrdersQueueFirstPaint rows={firstPaintRows} className="min-h-0 flex-1" />
        </div>
      ) : null}
      <div
        className={cn(
          'relative z-10 flex min-h-0 w-full flex-1 flex-col',
          !primaryReady && 'opacity-0',
        )}
      >
        <OutboundOrdersDesk onPrimaryPainted={onPrimaryPainted} />
      </div>
    </div>
  );
}
