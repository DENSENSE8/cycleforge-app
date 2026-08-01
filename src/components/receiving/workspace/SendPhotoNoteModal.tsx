'use client';

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { SendPhotoNotePanel } from './SendPhotoNotePanel';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

/**
 * Send-photos-to-ticket modal for non-Unbox hosts (Testing, claim lock-ticket).
 * Unbox mounts {@link SendPhotoNotePanel} in {@link ReceivingToolPushStack}.
 */
export function SendPhotoNoteModal({
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
  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="receiving-photo-note-size"
      minWidth={460}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,52rem)]"
      aria-label="Send photos to a ticket"
    >
      <SendPhotoNotePanel
        open={open}
        row={row}
        onClose={onClose}
        defaultTicket={defaultTicket}
        lockTicket={lockTicket}
      />
    </RightPaneOverlay>
  );
}

export default SendPhotoNoteModal;
