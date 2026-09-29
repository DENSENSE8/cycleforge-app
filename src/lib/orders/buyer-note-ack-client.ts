'use client';

import { requestConfirm } from '@/design-system/components/confirm';
import { BUYER_NOTE_HOLD_CODE } from '@/lib/orders/buyer-note-interlock';

/**
 * Show the held order's buyer note and, when the operator acknowledges it, record the ack.
 * Resolves true only when the ack was recorded — the caller may then resend the held write.
 */
export async function acknowledgeBuyerNote(hold: { orderRowId: number; buyerNote: string }): Promise<boolean> {
  const acknowledged = await requestConfirm({
    title: 'Buyer note — read before packing',
    description: hold.buyerNote,
    confirmLabel: 'I read it — continue',
    cancelLabel: 'Not yet',
    tone: 'primary',
  });
  if (!acknowledged) return false;
  const ack = await fetch(`/api/orders/${hold.orderRowId}/buyer-note/ack`, { method: 'POST' });
  return ack.ok;
}

/** Client half of the buyer-note interlock (`src/lib/orders/buyer-note-interlock.ts`). */
export async function sendWithBuyerNoteAck(send: () => Promise<Response>): Promise<Response> {
  const first = await send();
  if (first.status !== 409) return first;
  const hold = (await first
    .clone()
    .json()
    .catch(() => null)) as { code?: string; orderRowId?: number; buyerNote?: string } | null;
  if (hold?.code !== BUYER_NOTE_HOLD_CODE || !hold.orderRowId || !hold.buyerNote) return first;
  if (!(await acknowledgeBuyerNote({ orderRowId: hold.orderRowId, buyerNote: hold.buyerNote }))) return first;
  return send();
}
