/**
 * When QC should auto-open Ticket Displays for contextual detail (history /
 * claim) — never a centre "needs attention" banner. Pure predicate; no UI.
 */

import { unitStatusToVerdict } from '@/components/receiving/workspace/TestingStatusPills';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';

type TestingTicketContextOpen = {
  open: boolean;
  claimMode: ClaimModalMode;
};

/**
 * Linked ticket → open Ticket Displays (history/chat).
 * Failed / retest with no ticket → open Ticket Displays on claim create.
 * Otherwise leave Displays closed (ops-flow middle only).
 */
export function resolveTestingTicketContextOpen(
  row: ReceivingLineRow,
  hasLinkedTicket: boolean,
): TestingTicketContextOpen {
  if (hasLinkedTicket) {
    return { open: true, claimMode: 'create' };
  }

  const serials = Array.isArray(row.serials) ? row.serials : [];
  const needsClaim = serials.some((s) => {
    const v = unitStatusToVerdict(s.current_status);
    return v === 'TESTING_FAILED' || v === 'TEST_AGAIN';
  });

  if (needsClaim) {
    return { open: true, claimMode: 'create' };
  }

  return { open: false, claimMode: 'create' };
}
