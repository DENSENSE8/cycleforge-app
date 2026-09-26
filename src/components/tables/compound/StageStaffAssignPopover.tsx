'use client';

/** Staff adapter over {@link AssigneeCombobox} for Pick / Pack / full roster. */

import { useEffect, useMemo, useState } from 'react';
import { StaffAvatar } from '@/components/identity';
import { AssigneeCombobox, type AssigneeComboboxRow } from '@/design-system/components/AssigneeCombobox';
import {
  getActiveStaff,
  peekActiveStaff,
  saveStaffFunctionalRole,
  type StaffMember,
} from '@/lib/staffCache';
import { toast } from '@/lib/toast';
import type { CompoundStageAssignRole } from './compound-row-model';
import {
  STAFF_LANE_FACES,
  staffLaneEmptyLabel,
  staffLaneFaceLabel,
  staffLaneFunctionalRole,
  staffMatchesStageLane,
  withStaffLane,
  type StageStaffLane,
} from './staff-stage-lane';

export type StageStaffAssignPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Accessible name only — never painted as a panel eyebrow. */
  label: string;
  /** Lane this combo assigns. `all` is the full roster. */
  role: StageStaffLane;
  selectedStaffId: number | null;
  onCommit?: (staffId: number | null, staffName: string | null) => void;
};

export function StageStaffAssignPopover({
  open,
  onClose,
  anchorRef,
  label,
  role,
  selectedStaffId,
  onCommit,
}: StageStaffAssignPopoverProps) {
  const warm = peekActiveStaff();
  const [options, setOptions] = useState<StaffMember[]>(() => warm ?? []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(() => !warm);
  const [rosterMode, setRosterMode] = useState(false);
  const rosterOnly = role === 'all' && !onCommit;
  // Lane combos always offer the roster; a full-roster assign has no lane to edit.
  const canRoster = role !== 'all';
  const inRoster = rosterOnly || (canRoster && rosterMode);
  const faces = role === 'all' ? STAFF_LANE_FACES : [role];

  useEffect(() => {
    if (!open) {
      setQuery('');
      setRosterMode(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cached = peekActiveStaff();
    if (cached) {
      setOptions(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        setOptions(
          (Array.isArray(members) ? members : [])
            .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((row) => {
      // Keep the current assignee visible even if their functional role changed.
      if (!inRoster && row.id !== selectedStaffId && !staffMatchesStageLane(row, role)) {
        return false;
      }
      return !q || row.name.toLowerCase().includes(q);
    });
  }, [options, query, role, selectedStaffId, inRoster]);

  const rows: AssigneeComboboxRow[] = filtered.map((row) => ({
    id: row.id,
    name: row.name,
    selected: selectedStaffId === row.id,
    assignable: Boolean(onCommit) && staffMatchesStageLane(row, role),
    leading: <StaffAvatar staffId={row.id} name={row.name} size="sm" colorRing alt="" />,
    faces: faces.map((face) => ({
      id: face,
      label: staffLaneFaceLabel(face),
      checked: staffMatchesStageLane(row, face),
    })),
  }));

  const pick = (row: AssigneeComboboxRow) => {
    if (!onCommit) return;
    const member = options.find((item) => item.id === row.id);
    if (!member || !staffMatchesStageLane(member, role)) return;
    const next = selectedStaffId === row.id ? null : row.id;
    onCommit(next, next == null ? null : row.name);
    onClose();
  };

  const setFace = (row: AssigneeComboboxRow, faceId: string, enabled: boolean) => {
    const lane = faceId as CompoundStageAssignRole;
    const before = options.find((member) => member.id === row.id);
    if (!before) return;
    setOptions((prev) =>
      prev.map((member) => (member.id === row.id ? withStaffLane(member, lane, enabled) : member)),
    );
    saveStaffFunctionalRole(row.id, staffLaneFunctionalRole(lane), enabled)
      .then((functionalRoles) => {
        setOptions((prev) =>
          prev.map((member) => (member.id === row.id ? { ...member, functionalRoles } : member)),
        );
      })
      .catch(() => {
        setOptions((prev) => prev.map((member) => (member.id === row.id ? before : member)));
        toast.error(`Could not update ${staffLaneFaceLabel(lane).toLowerCase()} for ${row.name}`);
      });
  };

  const emptyMessage =
    options.length === 0 ? 'No staff' : query.trim() ? 'No matches' : staffLaneEmptyLabel(role);

  return (
    <AssigneeCombobox
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label={label}
      testId={rosterOnly ? 'stage-staff-roster-popover' : 'stage-staff-assign-popover'}
      query={query}
      onQueryChange={setQuery}
      rows={rows}
      loading={loading}
      emptyMessage={emptyMessage}
      roster={inRoster}
      editRosterLabel={`${rosterMode ? 'Done editing' : 'Edit'} ${role === 'packer' ? 'packers' : 'pickers'}`}
      onEditRoster={canRoster ? () => setRosterMode((next) => !next) : undefined}
      onSelect={pick}
      onFaceChange={setFace}
    />
  );
}
