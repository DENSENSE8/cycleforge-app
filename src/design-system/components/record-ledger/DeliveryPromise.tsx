'use client';

/**
 * "Arrives Thu, Sep 30" / "Delivered Sep 30" beside a record's tracking — the
 * carrier's promise (`shipping_tracking_numbers.estimated_delivery_at`), one
 * face for the outbound order and the inbound purchase.
 */

import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { deliveryPromiseFace, type DeliveryPromiseInput } from '@/lib/shipping/delivery-promise';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

export function DeliveryPromise({
  promise,
  shipByDateKey = null,
  testId = 'delivery-promise',
}: {
  promise: DeliveryPromiseInput;
  shipByDateKey?: string | null;
  testId?: string;
}) {
  const face = deliveryPromiseFace(promise, getCurrentPSTDateKey());
  if (!face) return null;
  return (
    <span
      data-testid={testId}
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
