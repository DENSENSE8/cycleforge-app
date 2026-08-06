'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { SendPhotoNotePanel } from './SendPhotoNotePanel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Send-photos-to-ticket for non-Unbox hosts (Testing, Triage, claim
 * lock-ticket) — a NON-MODAL `RightRailHost` occupant (`detail:photo-note`).
 *
 * Picking which photos go on a ticket is done AGAINST the carton on screen, so
 * the centered overlay it used to be hid its own reference material. Unbox keeps
 * Unbox Displays Photos→Send.
 */
export function SendPhotoNoteRail({
  open,
  row,
  onClose,
  defaultTicket,
  lockTicket = false,
}: {
  open: boolean;
  row: ReceivingLineRow;
  onClose: () => void;
  defaultTicket?: { id: number; subject?: string | null };
  lockTicket?: boolean;
}) {
  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:photo-note"
      // Station edge: /unbox, /triage and /testing already push this edge with
      // `UnboxPushColumn`, and two push mechanisms on one edge is exactly what
      // the right-rail store exists to prevent. Stays a float pending the
      // right-edge ownership ruling.
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Send photos"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <SendPhotoNotePanel
          open
          row={row}
          onClose={onClose}
          defaultTicket={defaultTicket}
          lockTicket={lockTicket}
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
