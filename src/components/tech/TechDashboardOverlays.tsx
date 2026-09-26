'use client';

/** Page-level overlays for the tech dashboard: */

import { AnimatePresence } from '@/design-system/motion';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { TechRepairRail } from '@/components/tech/TechRepairRail';
import { TestingAssignDialog } from '@/components/tech/TestingAssignDialog';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TechRepairPanel } from '@/components/tech/useTechDetailOverlays';

interface TechDashboardOverlaysProps {
  repairPanel: TechRepairPanel | null;
  onCloseRepair: () => void;
  loadingRepair: boolean;
  testingClaimRow: ReceivingLineRow | null;
  onCloseClaim: () => void;
  onClaimFiled: () => void;
  testingAssignRows: ReceivingLineRow[] | null;
  onCloseAssign: () => void;
  onAssignPick: (techId: number) => void;
}

export function TechDashboardOverlays({
  repairPanel,
  onCloseRepair,
  loadingRepair,
  testingClaimRow,
  onCloseClaim,
  onClaimFiled,
  testingAssignRows,
  onCloseAssign,
  onAssignPick,
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
          <TechRepairRail
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

      <TestingAssignDialog
        open={testingAssignRows != null && testingAssignRows.length > 0}
        count={testingAssignRows?.length ?? 0}
        onClose={onCloseAssign}
        onPick={onAssignPick}
      />
    </>
  );
}
