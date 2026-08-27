'use client';

/**
 * Unbox Displays → Ticket topic — presence-exclusive body.
 *
 * Strip cell is "Ticket". No Chat · Claim tab row on the topic plate:
 * - No linked ticket → {@link ReceivingClaimPanel} with body **Create | Link**
 *   flush combobox (`ClaimModeSelect`, ⌥1/⌥2) — shared photos · claim type ·
 *   subject · body · recipients (Pairing no longer hosts a Tickets avenue).
 * - Linked ticket → Chat only
 *
 * Nest: `ticket` leaf (+ `claimMode` while on the claim surface).
 * `ticketAction` is derived from linked-ticket presence, not a verb switcher.
 *
 * **Column fill:** Displays uses `DISPLAYS_FLUSH_HOST` (`px-0`) — Claim / Chat
 * sit edge-to-edge. Chat stream + floating composer own `DISPLAYS_BODY_INSET`;
 * this host never wraps the whole detail in that gutter. Host has no bottom
 * inset (pinned footers sit flush).
 *
 * **Chrome:** Claim mounts `chrome="display"` — no gray title / PO restatement /
 * X. Topic plate names Ticket; StationContextBar owns carton identity;
 * column `→|` owns dismiss. Modal hosts keep `chrome="modal"`.
 */

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { ReceivingClaimPanel } from '../ReceivingClaimPanel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode } from '../claim/claim-types';

export function TicketDisplayHost({
  row,
  ticketId,
  claimMode,
  onCloseClaim,
  onCloseTicket,
  onClaimTicketCreated,
  onClaimTicketUnlinked,
  returnClaimPrefill,
  /**
   * QC / All-good reply presets on the composer. Unbox and Testing Ticket
   * Displays pass `false`; Arrival / Support keep the default on.
   */
  showReplyPresets = true,
}: {
  row: ReceivingLineRow;
  ticketId: number | null | undefined;
  claimMode: ClaimModalMode;
  onCloseClaim: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated: (ticketNumber: string) => void;
  onClaimTicketUnlinked: () => void;
  returnClaimPrefill?: string | null;
  showReplyPresets?: boolean;
}) {
  const hasTicket = ticketId != null;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-0"
      data-testid="unbox-ticket-display"
    >
      <div className="min-h-0 flex-1">
        {hasTicket ? (
          // Host stays flush (`DISPLAYS_FLUSH_HOST`). Stream rows + composer own
          // `DISPLAYS_BODY_INSET` — never pad the whole detail (chrome plates
          // must read edge-to-edge).
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <SupportTicketDetail
              ticketId={ticketId}
              onBack={onCloseTicket}
              receivingId={row.receiving_id ?? undefined}
              embedded
              hideRequesterBand={false}
              // Ticket chat is messages-only (no floor timeline merge).
              mergeFloorTimeline={false}
              showReplyPresets={showReplyPresets}
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
