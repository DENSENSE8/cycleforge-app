'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { SendPhotoNotePanel } from './SendPhotoNotePanel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** Send-photos-to-ticket for non-Unbox hosts (Testing, Triage, claim lock-ticket) — a NON-MODAL `RightRailHost` occupant (`detail:photo-note`). */
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
      // Station edge:
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
