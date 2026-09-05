'use client';

/**
 * Page-level overlays for the tech dashboard: repair details + testing claim
 * modal. Assign to… is hosted in ReceivingLineRailShell (AssigneeCombobox),
 * not a Dialog. Carton "look" navigates to `/carton/[id]` (decision 2a) —
 * editable ReceivingDetailsStack is no longer mounted from the inbound feed.
 */

import { AnimatePresence } from '@/design-system/motion';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { RepairDetailsPanel } from '@/components/repair/RepairDetailsPanel';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TechRepairPanel } from '@/components/tech/useTechDetailOverlays';

interface TechDashboardOverlaysProps {
  repairPanel: TechRepairPanel | null;
  onCloseRepair: () => void;
  loadingRepair: boolean;
  testingClaimRow: ReceivingLineRow | null;
  onCloseClaim: () => void;
  onClaimFiled: () => void;
}

export function TechDashboardOverlays({
  repairPanel,
  onCloseRepair,
  loadingRepair,
  testingClaimRow,
  onCloseClaim,
  onClaimFiled,
}: TechDashboardOverlaysProps) {
  return (
    <>
      {loadingRepair && (
        <div className="fixed inset-0 bg-scrim/20 z-panelBackdrop flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin pointer-events-auto" />
        </div>
      )}
      <AnimatePresence>
        {repairPanel && (
          <RepairDetailsPanel
            repair={repairPanel.record}
            assignmentId={repairPanel.assignmentId}
            assignedTechId={repairPanel.assignedTechId}
            onClose={onCloseRepair}
            onUpdate={onCloseRepair}
          />
        )}
      </AnimatePresence>

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
    </>
  );
}
