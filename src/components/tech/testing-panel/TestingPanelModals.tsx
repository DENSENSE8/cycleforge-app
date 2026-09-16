import { ReceivingAuditRail } from '@/components/receiving/workspace/ReceivingAuditRail';
import { SendPhotoNoteRail } from '@/components/receiving/workspace/SendPhotoNoteRail';
import { MovePhotosBetweenPoRail } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail';
import { TestingFailReasonSheet } from '@/components/tech/testing/TestingFailReasonSheet';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';

/**
 * Testing panel's secondary surfaces. SKU pairing lives in the pairing section tab.
 *
 * Audit / photo-note / move-photos are NON-MODAL `RightRailHost` occupants — a
 * bench operator reads them BESIDE the carton. Claim create/link/chat lives in
 * the Ticket Displays leaf ({@link TicketDisplayHost}) — never
 * `ReceivingClaimModal` over the middle triage surface.
 *
 * The fail-reason sheet is the one deliberate exception to that: it is not a
 * surface to read beside the work, it is a question that must be answered before
 * the verdict is allowed to land — the same standing Unbox's QA fail sheet has.
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

      <TestingFailReasonSheet
        open={c.pendingFail != null}
        unitLabel={c.pendingFail?.label ?? 'this unit'}
        onConfirm={c.confirmPendingFail}
        onClose={c.cancelPendingFail}
        busy={c.isMutating}
      />
    </>
  );
}
