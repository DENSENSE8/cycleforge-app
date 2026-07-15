'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import type { UseClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import type { FiledTicket } from '@/components/receiving/workspace/claim/claim-types';
import { TicketThreadCard } from '@/components/support/TicketThreadCard';
import { SendPhotoNoteModal } from '@/components/receiving/workspace/SendPhotoNoteModal';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

/**
 * Comment on the line's linked Zendesk ticket straight from the testing page —
 * reuses the shared {@link ClaimTicketReply} composer (internal note by default,
 * or a public reply that emails the customer). Reply state is owned by the
 * parent TestingPanel so the station terminal dock can drive send.
 *
 * Rendered only when the line has a Zendesk-native linked ticket; the linkage
 * itself is shown by the carton header's ticket chip. External Zendesk link
 * lives on the SectionTabsSlider rightSlot (Claim tab).
 */
export function TestingTicketReplyCard({
  ticketId,
  ticketNumber,
  ticketUrl,
  failed,
  onFileClaim,
  reply,
  row,
}: {
  /** Zendesk-native ticket id (providerTicketId) — the thread route's key. */
  ticketId: number | null;
  /** Display number, e.g. "#9395". */
  ticketNumber?: string;
  /** Deep link to the ticket in Zendesk, if known. */
  ticketUrl?: string | null;
  /** True if the line or any unit has a 'TESTING_FAILED' verdict. */
  failed?: boolean;
  /** Callback to open the file claim modal. */
  onFileClaim: () => void;
  /** Panel-owned reply controller — drives the terminal FloatingButton. */
  reply: UseClaimTicketReply;
  /** Carton row — needed to open SendPhotoNoteModal with PO photos. */
  row: ReceivingLineRow;
}) {
  const [photoNoteOpen, setPhotoNoteOpen] = useState(false);
  const filedTicket: FiledTicket | undefined =
    ticketId && ticketNumber
      ? { id: ticketId, number: ticketNumber, url: ticketUrl ?? null }
      : undefined;

  if (!ticketId && !failed) {
    return null;
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-2xl border border-border-soft bg-surface-card p-3 shadow-sm text-role-caption">
        {!ticketId ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-6">
            <p className="max-w-sm text-center text-role-caption text-text-muted">
              This unit failed testing but has no support ticket attached.
            </p>
            <Button onClick={onFileClaim} variant="danger">
              File claim
            </Button>
          </div>
        ) : (
          <TicketThreadCard
            ticketId={ticketId}
            replyProps={
              filedTicket
                ? {
                    reply,
                    filedTicket,
                    sendPlacement: 'terminal',
                    onAttachPhotos: () => setPhotoNoteOpen(true),
                  }
                : undefined
            }
            className="border-none"
          />
        )}
      </div>

      {ticketId != null ? (
        <SendPhotoNoteModal
          open={photoNoteOpen}
          row={row}
          onClose={() => setPhotoNoteOpen(false)}
          defaultTicket={{ id: ticketId, subject: null }}
          lockTicket
        />
      ) : null}
    </>
  );
}
