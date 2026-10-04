'use client';

/**
 * QC bench: the open line's QC tech (`receiving_line_testing.assigned_tech_id`)
 * — avatar + name on the identity row's trailing slot, click to (re)assign
 * through the house staff picker ({@link StageStaffAssignPopover}, full roster).
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives/Button';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import { UNASSIGNED_MARK_CLASS } from '@/components/outbound/orders/outbound-orders-ledger-editors';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { patchLineQcAssignee } from '@/lib/qc/qc-assignee-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function TestingQcAssignee({
  lineId,
  assignedTechId,
}: {
  lineId: number;
  assignedTechId: number | null;
}) {
  const qc = useQueryClient();
  const { getStaffName } = useStaffNameMap();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = assignedTechId ? getStaffName(assignedTechId) : null;

  const commit = async (staffId: number | null) => {
    setOpen(false);
    if (staffId === assignedTechId) return;
    // Optimistic: the open line and the browse rows swap at once.
    dispatchLineUpdated({ id: lineId, assigned_tech_id: staffId });
    try {
      await patchLineQcAssignee(lineId, staffId);
    } catch (error) {
      dispatchLineUpdated({ id: lineId, assigned_tech_id: assignedTechId });
      toast.error(error instanceof Error ? error.message : 'Could not assign QC');
    } finally {
      void qc.invalidateQueries({ queryKey: ['testing-workspace'] });
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="ghost"
        radius="flush"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={assignedTechId ? `Reassign QC (${name})` : 'Assign QC'}
        data-testid="testing-qc-assignee"
        onClick={() => setOpen((v) => !v)}
        className={cn('h-full min-w-0 max-w-48 justify-start gap-1.5 px-1.5 hover:bg-mode-hover', focusRing('cell'))}
      >
        <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>QC</span>
        {assignedTechId ? (
          <StaffAvatar staffId={assignedTechId} name={name} avatarPhotoId={null} size="xs" colorRing face="record" alt={name ?? undefined} />
        ) : (
          <span aria-hidden className={UNASSIGNED_MARK_CLASS} />
        )}
        <span className={cn('min-w-0 truncate text-role-caption', assignedTechId ? 'text-mode-ink' : 'text-mode-muted')}>
          {assignedTechId ? name : 'Assign'}
        </span>
      </Button>
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label="QC tech"
        role="all"
        selectedStaffId={assignedTechId}
        onCommit={(staffId) => void commit(staffId)}
      />
    </>
  );
}
