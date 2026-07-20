import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { ReceivingAuditModal } from '@/components/receiving/workspace/ReceivingAuditModal';
import { SendPhotoNoteModal } from '@/components/receiving/workspace/SendPhotoNoteModal';
import { MovePhotosBetweenPoModal } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoModal';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { invalidateSupportContextCaches } from '@/hooks';
import type { TestingController } from './testing-panel-types';

/** The claim and audit overlays for the testing panel. SKU pairing lives in the pairing section tab. */
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
          dispatchLineUpdated({ id: row.id, zendesk_ticket: tk });
        }}
      />

      {row.receiving_id != null ? (
        <ReceivingAuditModal open={c.auditOpen} onClose={() => c.setAuditOpen(false)} receivingId={row.receiving_id} />
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
