'use client';

/** Station Displays → Ticket topic for Arrival, Testing and other remaining hosts. */

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { useTicketThreadActivation } from '@/components/composer/useTicketThreadActivation';
import { ReceivingClaimPanel } from '../ReceivingClaimPanel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ClaimModalMode } from '../claim/claim-types';

export function TicketDisplayHost({
  row,
  receivingId,
  ticketId,
  claimMode = 'create',
  onCloseClaim = () => {},
  onCloseTicket,
  onClaimTicketCreated = () => {},
  onClaimTicketUnlinked = () => {},
  returnClaimPrefill,
  /**
   * QC / All-good reply presets on the composer. Unbox and Testing Ticket
   * Displays pass `false`; Arrival / Support keep the default on.
   */
}: {
  /** Required only for the claim/create face; linked-ticket readers may use the host without adapting a foreign record shape. */
  row?: ReceivingLineRow;
  receivingId?: number | null;
  ticketId: number | null | undefined;
  claimMode?: ClaimModalMode;
  onCloseClaim?: () => void;
  onCloseTicket: () => void;
  onClaimTicketCreated?: (ticketNumber: string) => void;
  onClaimTicketUnlinked?: () => void;
  returnClaimPrefill?: string | null;
}) {
  const hasTicket = ticketId != null;
  // This is the mount the operator actually clicks — the Displays column — so it carries the same activation as the centre pane.
  const onThreadActivate = useTicketThreadActivation(hasTicket);

  return (
    <div
      onClick={onThreadActivate}
      className="flex h-full min-h-0 flex-col gap-0"
      data-testid="unbox-ticket-display"
    >
      <div className="min-h-0 flex-1">
        {hasTicket ? (
          // Host stays flush (`DISPLAYS_FLUSH_HOST`).
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <p
              className="shrink-0 border-b border-border-hairline px-3 py-1.5 text-role-micro text-text-muted"
              data-testid="ticket-display-composer-cue"
            >
              Tap a message to reply from the Ticket composer.
            </p>
            <SupportTicketDetail
              ticketId={ticketId}
              onBack={onCloseTicket}
              receivingId={receivingId ?? row?.receiving_id ?? undefined}
              embedded
              // Ticket chat is messages-only (no floor timeline merge).
              mergeFloorTimeline={false}
              composerPlacement="host"
            />
          </div>
        ) : row ? (
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
        ) : null}
      </div>
    </div>
  );
}
