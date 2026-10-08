'use client';

/**
 * The staff picker painted IN PLACE (operator 2026-10-08: a form opens in the
 * ONE centered dialog, never a popover anchored to a button) — search focused
 * over the active roster, Enter picks the highlighted staffer. For a dialog
 * that asks "who" beside other fields (Mark fulfilled, Assign task); the
 * anchored {@link StageStaffAssignPopover} stays for in-line assigns on a record.
 */

import { useEffect, useState } from 'react';
import { StaffAvatar } from '@/components/identity';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { getActiveStaff, peekActiveStaff, type StaffMember } from '@/lib/staffCache';
import { staffLaneEmptyLabel, staffMatchesStageLane, type StageStaffLane } from './staff-stage-lane';

function rosterOf(members: readonly StaffMember[]): StaffMember[] {
  return members
    .filter((member) => Number.isFinite(member.id) && member.id > 0 && member.name.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function StaffPickList({
  role,
  selectedStaffId,
  onPick,
  ariaLabel,
  testId,
  className,
}: {
  /** Lane the list staffs; `all` is the full roster. */
  role: StageStaffLane;
  selectedStaffId: number | null;
  onPick: (staffId: number, name: string) => void;
  ariaLabel: string;
  testId: string;
  className?: string;
}) {
  const [roster, setRoster] = useState<StaffMember[]>(() => rosterOf(peekActiveStaff() ?? []));
  const [loading, setLoading] = useState(() => peekActiveStaff() == null);

  useEffect(() => {
    let cancelled = false;
    getActiveStaff()
      .then((members) => {
        if (!cancelled) setRoster(rosterOf(Array.isArray(members) ? members : []));
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The current pick stays listed even when their lane changed.
  const members = roster.filter((member) => member.id === selectedStaffId || staffMatchesStageLane(member, role));

  return (
    <IntakeCombobox
      surface="open"
      value={selectedStaffId == null ? null : String(selectedStaffId)}
      onChange={(value) => {
        const member = members.find((row) => String(row.id) === value);
        if (member) onPick(member.id, member.name);
      }}
      options={members.map((member) => ({
        value: String(member.id),
        label: member.name,
        icon: <StaffAvatar staffId={member.id} name={member.name} size="xs" colorRing alt="" />,
      }))}
      searchPlaceholder={loading ? 'Loading staff…' : 'Search staff…'}
      emptyMessage={loading ? 'Loading staff…' : staffLaneEmptyLabel(role)}
      ariaLabel={ariaLabel}
      testId={testId}
      optionTestId={(option) => `${testId}-${option.value}`}
      className={className}
    />
  );
}
