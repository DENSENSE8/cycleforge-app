'use client';

/** "Arrives Thu, Sep 30" / "Delivered Sep 30" beside the order's tracking. */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { deliveryPromiseFace } from './delivery-promise';

export function DeliveryPromise({ record, shipByDateKey }: { record: ShippedOrder; shipByDateKey: string | null }) {
  const face = deliveryPromiseFace(
    {
      estimatedDeliveryAt: record.estimated_delivery_at,
      deliveredAt: record.delivered_at,
      isDelivered: record.is_delivered,
    },
    getCurrentPSTDateKey(),
  );
  if (!face) return null;
  return (
    <span
      data-testid="delivery-promise"
      data-kind={face.kind}
      data-late={face.late || undefined}
      data-ship-by={shipByDateKey ?? undefined}
      className={cn(
        RECORD_LABEL_CLASS,
        'inline-flex items-baseline gap-1.5 whitespace-nowrap',
        face.kind === 'delivered' ? STATE_TONE_CLASSES.success.text : 'text-mode-ink',
        face.late && 'text-mode-warn',
      )}
    >
      {face.label}
      {face.late ? <span className="text-mode-warn">late</span> : null}
    </span>
  );
}
