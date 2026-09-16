'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { SendPhotoNotePanel } from './SendPhotoNotePanel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/**
 * Send-photos-to-ticket for non-Unbox hosts (Testing, Triage, claim
 * lock-ticket) — a NON-MODAL `RightRailHost` occupant (`detail:photo-note`).
 *
 * Picking which photos go on a ticket is done AGAINST the carton on screen, so
 * the centered overlay it used to be hid its own reference material. Unbox keeps
 * Unbox Displays Photos→Send.
 *
 * **ONE band, `stance="standalone"` (2026-08-21).** Nothing routes into this
 * rail through an index — it opens straight off the photo toolbar / claim reply
 * — so it owes no Back, and it says so with the stance rather than by omitting
 * a header. The band's flex-1 cell carries the single-word title and its
 * trailing cell is reserved for the host's `⤢ ✕`.
 *
 * The panel is mounted in `chrome="display"` for the same reason: its `modal`
 * chrome painted an eyebrow (`Send photos`) over a PO restatement — a second
 * header line under the band — plus a panel-owned `X` beside the host's
 * singleton close. Carton identity is already on screen behind the rail, and
 * the ticket the note lands on is named in the body (locked ticket band /
 * picker) and restated on the macro floor above the CTA.
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
      // `StationDisplaysPushColumn`, and two push mechanisms on one edge is exactly what
      // the right-rail store exists to prevent. Stays a float pending the
      // right-edge ownership ruling.
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Send photos"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="standalone"
          title="Photos"
          ariaLabel="Send photos"
          testId="send-photo-note-rail"
          body={
            <SendPhotoNotePanel
              open
              row={row}
              onClose={onClose}
              defaultTicket={defaultTicket}
              lockTicket={lockTicket}
              chrome="display"
            />
          }
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
