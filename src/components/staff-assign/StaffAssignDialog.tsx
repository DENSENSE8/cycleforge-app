'use client';

/**
 * Assign a staffer to a selection — the dock verbs' centered dialog (operator
 * 2026-10-08: never a popover anchored to the button). {@link StaffPickList}
 * paints the lane's roster in place, search focused; Enter picks and writes,
 * and a landed write turns the dialog to its done face.
 */

import { useState } from 'react';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { useSettleOnClose } from '@/design-system/components/record-action-strip/useSettleOnClose';
import { StaffPickList } from './StaffPickList';
import type { StageStaffLane } from './staff-stage-lane';

export function StaffAssignDialog({
  role,
  caption,
  doneTitle,
  testId,
  onAssign,
  done,
  onSettled,
}: {
  role: StageStaffLane;
  /** What the write touches — "Assign a picker to 3 orders". */
  caption: string;
  /** The done face's title — "Picker assigned"; the staffer's name is its detail. */
  doneTitle: string;
  testId: string;
  /** The write; resolves true when it landed (a failure toasts its own words). */
  onAssign: (staffId: number, name: string) => Promise<boolean>;
  done: () => void;
  /** A host whose write empties its selection settles once the done face closes (`useSettleOnClose`). */
  onSettled?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(null);
  const landed = useSettleOnClose(onSettled);

  const assign = async (staffId: number, name: string) => {
    if (saving) return;
    setSaving(true);
    try {
      if (await onAssign(staffId, name)) {
        landed.current = true;
        setAssigned(name);
      }
    } finally {
      setSaving(false);
    }
  };

  if (assigned != null) {
    return <VerbDoneState title={doneTitle} detail={assigned} onDone={done} testId={`${testId}-done`} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid={testId}>
      <p className="text-role-caption text-text-soft">{caption}</p>
      <StaffPickList
        role={role}
        selectedStaffId={null}
        onPick={(staffId, name) => void assign(staffId, name)}
        ariaLabel={caption}
        testId={`${testId}-list`}
        className="flex-1"
      />
    </div>
  );
}
