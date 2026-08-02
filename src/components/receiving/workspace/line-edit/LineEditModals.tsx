'use client';

/**
 * Page-level tool surfaces for non-Unbox hosts (Triage).
 *
 * All three are NON-MODAL `RightRailHost` occupants now (`detail:receiving-audit`,
 * `detail:photo-note`, `detail:move-photos`) — the host's single-slot store keeps
 * them mutually exclusive, so rendering all three here is safe: only the one
 * whose `open` is true registers.
 *
 * Unbox mounts the same bodies in {@link ReceivingToolPushStack} instead — a
 * station-scoped push column that squeezes the workbench in-flow — see
 * LineEditPanel.
 */

import { ReceivingAuditRail } from '../ReceivingAuditRail';
import { SendPhotoNoteRail } from '../SendPhotoNoteRail';
import { MovePhotosBetweenPoRail } from './MovePhotosBetweenPoRail';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
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
