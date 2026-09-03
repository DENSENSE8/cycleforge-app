'use client';

/**
 * Ticket thread / claim surface above the station composer. One textarea lives
 * in {@link StationComposerHost}; this pane never nests a second dock
 * (`composerPlacement="host"`).
 *
 * A filed ticket shows in EVERY composer mode (ruling 2026-08-31), so touching
 * the thread hands the composer to Ticket and takes focus — see
 * {@link useTicketThreadActivation}, which the Displays mount shares.
 */

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { useTicketThreadActivation } from './useTicketThreadActivation';
import { ReceivingClaimPanel } from '@/components/receiving/workspace/ReceivingClaimPanel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';
import { cn } from '@/utils/_cn';

export function StationTicketPane({
  row,
  ticketId,
  claimMode = 'create',
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
  const onThreadActivate = useTicketThreadActivation(hasTicket);

  return (
    <div
      onClick={onThreadActivate}
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
