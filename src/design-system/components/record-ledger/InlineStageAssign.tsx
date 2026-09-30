'use client';

/**
 * A record step's assignee, assignable IN LINE (owner 2026-09-29): the step's
 * second line reads "Assign packer" (or the assignee's name) and a click opens
 * the house staff picker right there. Shared by the outbound Fulfillment rail
 * (Pick · Pack · QC) and the inbound Receiving rail (Tested).
 */

import { useRef, useState } from 'react';
import { User } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import type { StageStaffLane } from '@/components/tables/compound/staff-stage-lane';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function InlineStageAssign({
  label,
  role,
  selectedStaffId,
  assignedName,
  onCommit,
  testId,
}: {
  /** Who the step needs, lower case — "packer", "picker", "QC tech". */
  label: string;
  role: StageStaffLane;
  selectedStaffId: number | null;
  /** `---` = nobody. */
  assignedName: string | null;
  onCommit: (staffId: number | null, staffName: string | null) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const named = assignedName && assignedName !== '---' ? assignedName : null;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={named ? `Reassign ${label} — ${named}` : `Assign ${label}`}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ds-raw-button -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-mode-control px-1 text-left hover:bg-mode-hover',
          named ? 'text-mode-ink' : 'text-text-info',
          focusRing('control'),
        )}
      >
        {named ? (
          <StaffAvatar staffId={selectedStaffId} name={named} avatarPhotoId={null} size="xs" colorRing face="record" alt={named} />
        ) : (
          <User className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate underline decoration-dotted underline-offset-2">{named ?? `Assign ${label}`}</span>
      </button>
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={`Assign ${label}`}
        role={role}
        selectedStaffId={selectedStaffId}
        onCommit={onCommit}
      />
    </>
  );
}
