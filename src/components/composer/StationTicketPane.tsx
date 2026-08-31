'use client';

/**
 * Ticket thread / claim surface that mounts ABOVE the station composer when
 * mode is Ticket. One textarea lives in {@link StationComposerHost}; this pane
 * never nests a second dock (`composerPlacement="host"`).
 */

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { ReceivingClaimPanel } from '@/components/receiving/workspace/ReceivingClaimPanel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import { cn } from '@/utils/_cn';

export function StationTicketPane({
  row,
  ticketId,
  claimMode = 'link',
  onCloseClaim,
  onClaimTicketCreated,
  onClaimTicketUnlinked,
  returnClaimPrefill,
  showReplyPresets = false,
  className,
}: {
  row: ReceivingLineRow;
  ticketId: number | null | undefined;
  claimMode?: ClaimModalMode;
  onCloseClaim?: () => void;
  onClaimTicketCreated?: (ticketNumber: string) => void;
  onClaimTicketUnlinked?: () => void;
  returnClaimPrefill?: string | null;
  showReplyPresets?: boolean;
  className?: string;
}) {
  const hasTicket = ticketId != null;

  return (
    <div
      className={cn(
        // A card in the well: the gutter above separates it, so no top rule.
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-card',
        className,
      )}
      data-testid="station-ticket-pane"
      data-has-ticket={hasTicket ? '1' : '0'}
    >
      {hasTicket ? (
        <SupportTicketDetail
          ticketId={ticketId}
          receivingId={row.receiving_id ?? undefined}
          embedded
          hideRequesterBand={false}
          mergeFloorTimeline={false}
          composerPlacement="host"
          showReplyPresets={showReplyPresets}
        />
      ) : (
        <ReceivingClaimPanel
          className="h-full min-h-0"
          chrome="display"
          row={row}
          open
          initialMode={claimMode}
          prefillReason={returnClaimPrefill ?? undefined}
          onClose={onCloseClaim ?? (() => undefined)}
          onTicketCreated={onClaimTicketCreated ?? (() => undefined)}
          onTicketUnlinked={onClaimTicketUnlinked ?? (() => undefined)}
        />
      )}
    </div>
  );
}
