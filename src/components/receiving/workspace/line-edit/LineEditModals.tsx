'use client';

/** Page-level tool surfaces for non-Unbox hosts (Triage). */

import { ReceivingAuditRail } from '../ReceivingAuditRail';
import { SendPhotoNoteRail } from '../SendPhotoNoteRail';
import { MovePhotosBetweenPoRail } from './MovePhotosBetweenPoRail';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { UnboxLineController } from './unbox-line-controller';

interface LineEditModalsProps {
  row: ReceivingLineRow;
  c: UnboxLineController;
}

/** Rail occupants for Triage (and any host that is not the Unbox push). */
export function LineEditModals({ row, c }: LineEditModalsProps) {
  return (
    <>
      {row.receiving_id != null ? (
        <ReceivingAuditRail
          open={c.auditOpen}
          onClose={() => c.setAuditOpen(false)}
          receivingId={row.receiving_id}
        />
      ) : null}
      <SendPhotoNoteRail
        open={c.photoNoteOpen}
        row={row}
        onClose={() => c.setPhotoNoteOpen(false)}
      />
      <MovePhotosBetweenPoRail
        key={c.movePhotosKey}
        open={c.movePhotosOpen}
        receivingId={row.receiving_id}
        onClose={() => c.setMovePhotosOpen(false)}
      />
    </>
  );
}
