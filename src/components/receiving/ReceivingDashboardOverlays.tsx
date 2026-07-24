'use client';

/**
 * Page-level overlays for `/receiving` that sit beside the right-pane column: the
 * carton details stack (with lazy enrich) and the single-line support-claim modal
 * from the bulk bar. Pure presentational; state + handlers come from the
 * dashboard's hooks.
 */

import { AnimatePresence } from 'framer-motion';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { ReceivingDetailsStack } from '@/components/station/ReceivingDetailsStack';
import { toast } from '@/lib/toast';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

interface ReceivingDashboardOverlaysProps {
  overlayLog: ReceivingDetailsLog | null;
  onCloseOverlayLog: () => void;
  onOverlayLogUpdated: () => void;
  onOverlayLogDeleted: () => void;
  claimRow: ReceivingLineRow | null;
  onCloseClaim: () => void;
  onClaimFiled: () => void;
}

export function ReceivingDashboardOverlays({
  overlayLog,
  onCloseOverlayLog,
  onOverlayLogUpdated,
  onOverlayLogDeleted,
  claimRow,
  onCloseClaim,
  onClaimFiled,
}: ReceivingDashboardOverlaysProps) {
  return (
    <>
      <AnimatePresence>
        {overlayLog ? (
          <ReceivingDetailsStack
            log={overlayLog}
            onClose={onCloseOverlayLog}
            onUpdated={onOverlayLogUpdated}
            onDeleted={onOverlayLogDeleted}
          />
        ) : null}
      </AnimatePresence>

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
