/**
 * Pure claim-seller-message ref helper — client-safe.
 *
 * Split out of `receiving-claim-seller-message.ts` (which owns the DB
 * reads/writes via `tenancy/db`) so client chrome like ticket seller-message
 * menu rows can import refs without pulling Neon into the client bundle.
 * The DB module re-exports this, so server callers keep their path.
 */
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
