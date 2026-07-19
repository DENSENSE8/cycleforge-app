/**
 * Re-export scan helpers from the platform-agnostic support ticket registry.
 */
import { resolveSupportTicketToReceiving } from '@/lib/support/tickets';

export {
  looksLikeTicketScan,
  parseTicketScanValue,
  resolveSupportTicketToReceiving,
} from '@/lib/support/tickets';
// Type from the light refs module directly (its SoT) — the client-safe half of
// the tickets split; also lets knip see the usage through the `export *` chain.
export { type TicketReceivingRef } from '@/lib/support/ticket-refs';

/** @deprecated use resolveSupportTicketToReceiving */
export async function resolveTicketToReceiving(
  orgId: string,
  ticketId: number,
): Promise<{ receivingId: number; lineId?: number } | null> {
  const hit = await resolveSupportTicketToReceiving(orgId, String(ticketId));
  if (!hit) return null;
  return { receivingId: hit.receivingId, lineId: hit.lineId };
}
