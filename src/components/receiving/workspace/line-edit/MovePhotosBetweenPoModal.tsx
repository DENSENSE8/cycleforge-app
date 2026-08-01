'use client';

/**
 * Bidirectional photo move between POs — opened from More Actions → Photos /
 * gallery "Move to another PO" on non-Unbox hosts (Testing, etc.).
 *
 * Unbox mounts the same body in {@link ReceivingToolPushStack}.
 */

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { MovePhotosBetweenPoPanel } from './MovePhotosBetweenPoPanel';

export function MovePhotosBetweenPoModal({
  open,
  receivingId,
  onClose,
  onMoved,
}: {
  open: boolean;
  receivingId: number | null;
  onClose: () => void;
  onMoved?: () => void;
}) {
  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="receiving-move-photos-modal-size"
      minWidth={460}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,52rem)]"
      aria-label="Move photos"
    >
      <MovePhotosBetweenPoPanel
        open={open}
        receivingId={receivingId}
        onClose={onClose}
        onMoved={onMoved}
      />
    </RightPaneOverlay>
  );
}
