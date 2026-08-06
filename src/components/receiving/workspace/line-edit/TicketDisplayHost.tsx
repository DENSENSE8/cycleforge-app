'use client';

/**
 * Unbox Displays → Ticket topic — presence-exclusive body.
 *
 * Strip cell is "Ticket". No Chat · Claim tab row:
 * - No linked ticket → Claim (New ticket · Link existing)
 * - Linked ticket → Chat only
 *
 * URL: `?display=ticket` (+ `claimMode` while on the claim surface).
 * `ticketAction` is derived from linked-ticket presence, not a verb switcher.
 *
 * **Column fill:** Displays uses `DISPLAYS_FLUSH_HOST` (`px-0`) — Claim / Chat
 * sit edge-to-edge. Host has no bottom inset (pinned footers sit flush).
 *
 * **Chrome:** Claim mounts `chrome="display"` — no gray title / PO restatement /
 * X. Topic plate names Ticket; StationContextBar owns carton identity;
 * column `→|` owns dismiss. Modal hosts keep `chrome="modal"`.
 */

import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { ReceivingClaimPanel } from '../ReceivingClaimPanel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode } from '../claim/claim-types';
import { cn } from '@/utils/_cn';

export function TicketDisplayHost({
  row,
  ticketId,
  claimMode,
  onCloseClaim,
  onCloseTicket,
  onClaimTicketCreated,
  onClaimTicketUnlinked,
  returnClaimPrefill,
}: {
  row: ReceivingLineRow;
  ticketId: number | null | undefined;
  claimMode: ClaimModalMode;
  onCloseClaim: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated: (ticketNumber: string) => void;
  onClaimTicketUnlinked: () => void;
  returnClaimPrefill?: string | null;
}) {
  const hasTicket = ticketId != null;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-0"
      data-testid="unbox-ticket-display"
    >
      <div className="min-h-0 flex-1">
        {hasTicket ? (
          <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', DISPLAYS_BODY_INSET)}>
            <SupportTicketDetail
              ticketId={ticketId}
              onBack={onCloseTicket}
              receivingId={row.receiving_id ?? undefined}
              embedded
              hideRequesterBand={false}
            />
          </div>
        ) : (
          <ReceivingClaimPanel
            className="h-full min-h-0"
            chrome="display"
            row={row}
            open
            initialMode={claimMode}
            prefillReason={returnClaimPrefill ?? undefined}
            onClose={onCloseClaim}
            onTicketCreated={onClaimTicketCreated}
            onTicketUnlinked={onClaimTicketUnlinked}
          />
        )}
      </div>
    </div>
  );
}
