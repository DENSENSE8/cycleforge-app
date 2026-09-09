'use client';

import { useCallback, useState, useEffect } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { ShortageDesk } from '@/components/outbound/orders/ShortageDesk';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';
import { cn } from '@/utils/_cn';

export function ShortageDeskShell({
  firstPaintRows,
}: {
  firstPaintRows: ShippedOrder[];
}) {
  const [primaryReady, setPrimaryReady] = useState(false);
  const onPrimaryPainted = useCallback(() => setPrimaryReady(true), []);

  useSurfacePaintMark('shortage:chrome', true);
  useEffect(() => {
    if (primaryReady || firstPaintRows.length > 0) {
      markTier1Priority('orders', 'primary');
    }
  }, [primaryReady, firstPaintRows.length]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
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
        <ShortageDesk onPrimaryPainted={onPrimaryPainted} />
      </div>
    </div>
  );
}
