/**
 * Receiving line → shared item qty. One map for Unbox, Arrival, Testing,
 * shipping ProgressBadge, and every other scan-station host.
 *
 * Got is quantity_received (0 when missing). Listed is quantity_expected.
 * `receive: true` paints remaining and keeps Open off emerald.
 */

import type { ItemRecordQuantity } from '@/design-system/components/item-record';

export function receivingQty(line: {
  quantity_received?: number | null;
  quantity_expected?: number | null;
}): ItemRecordQuantity {
  const received = Number(line.quantity_received);
  const expectedRaw = line.quantity_expected;
  const expected =
    typeof expectedRaw === 'number' && Number.isFinite(expectedRaw) ? expectedRaw : null;
  return {
    counted: Number.isFinite(received) ? received : 0,
    expected,
    receive: true,
  };
}
