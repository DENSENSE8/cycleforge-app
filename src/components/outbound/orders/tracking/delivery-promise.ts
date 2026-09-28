/** The record's delivery promise face — pure date math over the carrier facts. */

import { formatDateKeyMedium, formatDateKeyShort, toPSTDateKey } from '@/utils/date';

export interface DeliveryPromiseInput {
  estimatedDeliveryAt: string | null | undefined;
  deliveredAt: string | null | undefined;
  isDelivered?: boolean | null;
}

export type DeliveryPromiseFace =
  | { kind: 'delivered'; label: string; dateKey: string; late: boolean }
  | { kind: 'arrives'; label: string; dateKey: string; late: boolean };

/**
 * Delivered → "Delivered Sep 30" (late when it landed after the carrier's
 * estimate, if one is still known). Else an estimate → "Arrives Thu, Sep 30",
 * late once that day has passed undelivered. Null when neither fact exists.
 * Days are warehouse (Pacific) calendar days; `todayKey` is `YYYY-MM-DD`.
 */
export function deliveryPromiseFace(input: DeliveryPromiseInput, todayKey: string): DeliveryPromiseFace | null {
  const deliveredKey = toPSTDateKey(input.deliveredAt ?? null);
  const estimateKey = toPSTDateKey(input.estimatedDeliveryAt ?? null);
  if (deliveredKey) {
    return {
      kind: 'delivered',
      label: `Delivered ${formatDateKeyShort(deliveredKey)}`,
      dateKey: deliveredKey,
      late: !!estimateKey && deliveredKey > estimateKey,
    };
  }
  if (!estimateKey || input.isDelivered) return null;
  return {
    kind: 'arrives',
    label: `Arrives ${formatDateKeyMedium(estimateKey)}`,
    dateKey: estimateKey,
    late: estimateKey < todayKey,
  };
}
