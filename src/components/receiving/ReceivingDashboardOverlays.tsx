'use client';

/**
 * Page-level overlays for `/receiving` / `/unbox` / `/triage` that sit beside
 * the right-pane column: the single-line support-claim modal from the bulk bar.
 */

import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

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
  if (!claimRow) return null;
  return (
    <ReceivingClaimModal
      open
      row={claimRow}
      onClose={onCloseClaim}
      onTicketCreated={(tk) => {
        toast.success(`Claim filed — ${tk}`);
        onClaimFiled();
      }}
    />
  );
}
