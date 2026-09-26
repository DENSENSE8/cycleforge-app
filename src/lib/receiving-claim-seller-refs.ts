/** Pure claim-seller-message ref helper — client-safe. */
import { normalizeReceivingTicketEntityRefs } from '@/lib/support/ticket-refs';

/** Unfound cartons use synthetic line id `-receiving_id`; seller rows are carton-scoped (line null). */
export function normalizeClaimSellerMessageRefs(args: {
  receivingId: number;
  lineId?: number | null;
}): { receivingId: number; lineId: number | null } {
  const { receivingId, lineId } = normalizeReceivingTicketEntityRefs({
    receivingId: args.receivingId,
    lineId: args.lineId,
  });
  if (receivingId == null) throw new Error('receivingId is required');
  return { receivingId, lineId };
}
