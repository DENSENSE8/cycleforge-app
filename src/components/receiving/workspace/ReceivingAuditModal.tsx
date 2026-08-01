'use client';

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { ReceivingAuditPanel } from './ReceivingAuditPanel';

/**
 * Carton audit log overlay for non-Unbox hosts (Testing, carton read).
 * Unbox mounts {@link ReceivingAuditPanel} in {@link ReceivingToolPushStack}.
 */
export function ReceivingAuditModal({
  open,
  onClose,
  receivingId,
}: {
  open: boolean;
  onClose: () => void;
  receivingId: number;
}) {
  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="receiving-audit-modal-size"
      minWidth={420}
      minHeight={420}
      className="-mt-8 h-[min(86vh,44rem)] w-[min(94vw,40rem)]"
      aria-labelledby="receiving-audit-title"
    >
      <ReceivingAuditPanel open={open} onClose={onClose} receivingId={receivingId} />
    </RightPaneOverlay>
  );
}
