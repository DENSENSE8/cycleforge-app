'use client';

/** Page-level overlays for the Quality Control bench: the claim modal and the assign dialog. */

import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { TestingAssignDialog } from '@/components/tech/TestingAssignDialog';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface TechDashboardOverlaysProps {
  testingClaimRow: ReceivingLineRow | null;
  onCloseClaim: () => void;
  onClaimFiled: () => void;
  testingAssignRows: ReceivingLineRow[] | null;
  onCloseAssign: () => void;
  onAssignPick: (techId: number) => void;
}

export function TechDashboardOverlays({
  testingClaimRow,
  onCloseClaim,
  onClaimFiled,
  testingAssignRows,
  onCloseAssign,
  onAssignPick,
}: TechDashboardOverlaysProps) {
  return (
    <>
      {testingClaimRow ? (
        <ReceivingClaimModal
          open
          row={testingClaimRow}
          onClose={onCloseClaim}
          onTicketCreated={(tk) => {
            toast.success(`Claim filed — ${tk}`);
            onClaimFiled();
          }}
        />
      ) : null}

      <TestingAssignDialog
        open={testingAssignRows != null && testingAssignRows.length > 0}
        count={testingAssignRows?.length ?? 0}
        onClose={onCloseAssign}
        onPick={onAssignPick}
      />
    </>
  );
}
