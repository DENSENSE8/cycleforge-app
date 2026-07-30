'use client';

/**
 * Page-level overlays for `/receiving` that sit beside the right-pane column.
 * Carton "look" navigates to `/carton/[id]` (decision 2a) — editable
 * ReceivingDetailsStack is no longer mounted here. Claim modal remains.
 */

import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

interface ReceivingDashboardOverlaysProps {
  claimRow: ReceivingLineRow | null;
  onCloseClaim: () => void;
  onClaimFiled: () => void;
}

export function ReceivingDashboardOverlays({
  claimRow,
  onCloseClaim,
  onClaimFiled,
}: ReceivingDashboardOverlaysProps) {
  return (
    <>
      {claimRow ? (
        <ReceivingClaimModal
          open
          row={claimRow}
          onClose={onCloseClaim}
          onTicketCreated={(tk) => {
            toast.success(`Claim filed — ${tk}`);
            onClaimFiled();
          }}
        />
      ) : null}
    </>
  );
}
