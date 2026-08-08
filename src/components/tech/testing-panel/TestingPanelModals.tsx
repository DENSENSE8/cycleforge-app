import { ReceivingAuditRail } from '@/components/receiving/workspace/ReceivingAuditRail';
import { SendPhotoNoteRail } from '@/components/receiving/workspace/SendPhotoNoteRail';
import { MovePhotosBetweenPoRail } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TestingController } from './testing-panel-types';

/**
 * Testing panel's secondary surfaces. SKU pairing lives in the pairing section tab.
 *
 * Audit / photo-note / move-photos are NON-MODAL `RightRailHost` occupants — a
 * bench operator reads them BESIDE the carton. Claim create/link/chat lives in
 * the Ticket Displays leaf ({@link TicketDisplayHost}) — never
 * `ReceivingClaimModal` over the middle triage surface.
 */
export function TestingPanelModals({
  c,
  row,
}: {
  c: TestingController;
  row: ReceivingLineRow;
}) {
  return (
    <>
      {row.receiving_id != null ? (
        <ReceivingAuditRail open={c.auditOpen} onClose={() => c.setAuditOpen(false)} receivingId={row.receiving_id} />
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
