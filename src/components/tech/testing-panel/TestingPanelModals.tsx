import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { ReceivingAuditRail } from '@/components/receiving/workspace/ReceivingAuditRail';
import { SendPhotoNoteRail } from '@/components/receiving/workspace/SendPhotoNoteRail';
import { MovePhotosBetweenPoRail } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';
import type { TestingController } from './testing-panel-types';

/**
 * Testing panel's secondary surfaces. SKU pairing lives in the pairing section tab.
 *
 * Audit / photo-note / move-photos are NON-MODAL `RightRailHost` occupants — a
 * bench operator reads them BESIDE the carton, and the centered overlay they
 * used to be dimmed it. The claim WIZARD stays a blocking modal: it is a
 * decision that must be finished or abandoned, not reference material.
 */
export function TestingPanelModals({
  c,
  row,
}: {
  c: TestingController;
  row: ReceivingLineRow;
}) {
  const qc = useQueryClient();
  return (
    <>
      <ReceivingClaimModal
        open={c.claimOpen}
        row={row}
        initialMode={c.claimInitialMode}
        onClose={() => c.setClaimOpen(false)}
        onTicketCreated={(tk) => {
          toast.success(`Claim filed — ${tk}`);
          invalidateSupportContextCaches(qc);
          if (row.receiving_id != null) {
            patchReceivingRailTicketByCarton(qc, row.receiving_id, tk);
          }
          dispatchLineUpdated({ id: row.id, zendesk_ticket: tk });
          invalidateReceivingFeeds(qc);
        }}
        onTicketUnlinked={() => {
          invalidateSupportContextCaches(qc);
          if (row.receiving_id != null) {
            patchReceivingRailTicketByCarton(qc, row.receiving_id, null);
          }
          dispatchLineUpdated({ id: row.id, zendesk_ticket: null });
          invalidateReceivingFeeds(qc);
        }}
      />

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
