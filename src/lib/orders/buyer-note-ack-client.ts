'use client';

import { requestConfirm } from '@/design-system/components/confirm';
import { BUYER_NOTE_HOLD_CODE } from '@/lib/orders/buyer-note-interlock';

/** Client half of the buyer-note interlock (`src/lib/orders/buyer-note-interlock.ts`). */
export async function sendWithBuyerNoteAck(send: () => Promise<Response>): Promise<Response> {
  const first = await send();
  if (first.status !== 409) return first;
  const hold = (await first
    .clone()
    .json()
    .catch(() => null)) as { code?: string; orderRowId?: number; buyerNote?: string } | null;
  if (hold?.code !== BUYER_NOTE_HOLD_CODE || !hold.orderRowId || !hold.buyerNote) return first;

  const acknowledged = await requestConfirm({
    title: 'Buyer note — read before packing',
    description: hold.buyerNote,
    confirmLabel: 'I read it — continue',
    cancelLabel: 'Not yet',
    tone: 'primary',
  });
  if (!acknowledged) return first;

  const ack = await fetch(`/api/orders/${hold.orderRowId}/buyer-note/ack`, { method: 'POST' });
  if (!ack.ok) return first;
  return send();
}
