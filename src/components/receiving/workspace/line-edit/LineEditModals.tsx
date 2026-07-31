'use client';

/**
 * Page-level modals for the LineEditPanel: carton audit log, photo note, move
 * photos. Claim opens as the Unbox push column (`ReceivingClaimStack`) — not
 * here.
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
