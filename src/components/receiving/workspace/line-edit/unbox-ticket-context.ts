/**
 * When Unbox should auto-open Ticket composer mode for contextual claim / chat —
 * never a centre advisory. Pure predicate; no UI.
 *
 * Arrival will port the same rules later; Unbox dogfoods first.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';

type UnboxTicketContextOpen = {
  open: boolean;
  claimMode: ClaimModalMode;
  /** Chat when linked; claim compose when opening Link/Create for an unlinked carton. */
  ticketAction: 'chat' | 'claim';
};

/**
 * Linked ticket → open Ticket composer mode (chat above the dock).
 * Unfound carton → Ticket mode on Link so tracking-seeded search runs
 * (empty seed may flip to Create inside the claim controller).
 * Otherwise leave Ticket mode closed (ops-flow middle only).
 */
export function resolveUnboxTicketContextOpen(
  row: ReceivingLineRow,
  hasLinkedTicket: boolean,
): UnboxTicketContextOpen {
  if (hasLinkedTicket) {
    return { open: true, claimMode: 'link', ticketAction: 'chat' };
  }

  if (shouldUseUnmatchedItemsSurface(row)) {
    return { open: true, claimMode: 'link', ticketAction: 'claim' };
  }

  return { open: false, claimMode: 'link', ticketAction: 'claim' };
}
