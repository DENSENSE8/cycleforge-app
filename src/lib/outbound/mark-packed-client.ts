/**
 * The ONE browser client for the Live feed's "Mark as packed…" dock verb
 * (`/api/orders/mark-packed`): the operator picks who packed it, this writes
 * the same PACK_COMPLETED a pack-station scan leaves. Skips (an order with no
 * shipment to key on) come back for the toast, not as failures.
 */

export interface MarkPackedSkipped {
  id: number;
  reason: string;
}

export interface MarkPackedResult {
  success: boolean;
  markedIds: number[];
  skipped: MarkPackedSkipped[];
}

export async function markPacked(orderIds: number[], packedByStaffId: number): Promise<MarkPackedResult> {
  const res = await fetch('/api/orders/mark-packed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, packedByStaffId }),
  });
  if (!res.ok) throw new Error(`mark-packed failed (${res.status})`);
  return res.json();
}
