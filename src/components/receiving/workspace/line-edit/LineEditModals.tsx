'use client';

/**
 * Page-level modals for non-Unbox hosts (Testing panel).
 *
 * Unbox mounts Move photos / Send photo note / Audit in
 * {@link ReceivingToolPushStack} instead — see LineEditPanel.
 */

import { ReceivingAuditModal } from '../ReceivingAuditModal';
import { SendPhotoNoteModal } from '../SendPhotoNoteModal';
import { MovePhotosBetweenPoModal } from './MovePhotosBetweenPoModal';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { UnboxLineController } from './unbox-line-controller';

interface LineEditModalsProps {
  row: ReceivingLineRow;
  c: UnboxLineController;
}

/** Overlay shells for Testing (and any host that still uses centered modals). */
export function LineEditModals({ row, c }: LineEditModalsProps) {
  return (
    <>
      {row.receiving_id != null ? (
        <ReceivingAuditModal
          open={c.auditOpen}
          onClose={() => c.setAuditOpen(false)}
          receivingId={row.receiving_id}
        />
      ) : null}
      <SendPhotoNoteModal
        open={c.photoNoteOpen}
        row={row}
        onClose={() => c.setPhotoNoteOpen(false)}
      />
      <MovePhotosBetweenPoModal
        key={c.movePhotosKey}
        open={c.movePhotosOpen}
        receivingId={row.receiving_id}
        onClose={() => c.setMovePhotosOpen(false)}
      />
    </>
  );
}
