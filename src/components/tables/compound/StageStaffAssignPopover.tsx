'use client';

/**
 * Staff adapter over {@link AssigneeCombobox} for Pick / Packed / All staff.
 * Lane filter and floor-role persist stay here; the panel is the SoT.
 */

import { useEffect, useMemo, useState } from 'react';
import { StaffAvatar } from '@/components/identity';
import { AssigneeCombobox, type AssigneeComboboxRow } from '@/design-system/components/AssigneeCombobox';
import { getActiveStaff, peekActiveStaff, type StaffMember } from '@/lib/staffCache';
import type { CompoundStageAssignRole, StaffLaneRoleNotice } from './compound-row-model';
import {
  applyStaffLaneRole,
  oppositeStaffLane,
  staffLaneEmptyLabel,
  staffLaneFaceLabel,
  staffLaneRosterFaces,
  staffMatchesStageLane,
  type StageStaffLane,
} from './staff-stage-lane';

export type StageStaffAssignPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Accessible name only — never painted as a panel eyebrow. */
  label: string;
  /** Lane this combo assigns. `all` is the actions-column roster (role edit only). */
  role: StageStaffLane;
  selectedStaffId: number | null;
  onCommit?: (staffId: number | null, staffName: string | null) => void;
  onSetLaneRole?: (
    staffId: number,
    role: CompoundStageAssignRole,
    staffName: string,
    notice?: StaffLaneRoleNotice,
  ) => void;
};

type StaffRow = StaffMember;

export function StageStaffAssignPopover({
  open,
  onClose,
  anchorRef,
  label,
  role,
  selectedStaffId,
  onCommit,
  onSetLaneRole,
}: StageStaffAssignPopoverProps) {
  const warm = peekActiveStaff();
  const [options, setOptions] = useState<StaffRow[]>(() => warm ?? []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(() => !warm);
  const [rosterMode, setRosterMode] = useState(false);
  const rosterAll = role === 'all';
  const canRoster = Boolean(onSetLaneRole);
  const inRoster = rosterAll || (canRoster && rosterMode);
  const faces = staffLaneRosterFaces(role);

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
      if (!inRoster) {
        if (selectedStaffId != null && row.id === selectedStaffId) {
          // Keep the current assignee visible even if their floor role drifted.
        } else if (!staffMatchesStageLane(row, role)) {
          return false;
        }
      }
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    });
  }, [options, query, role, selectedStaffId, inRoster]);

  const rows: AssigneeComboboxRow[] = filtered.map((row) => ({
    id: row.id,
    name: row.name,
    selected: selectedStaffId === row.id,
    assignable: staffMatchesStageLane(row, role),
    leading: <StaffAvatar staffId={row.id} name={row.name} size="sm" colorRing alt="" />,
    faces: faces.map((face) => ({
      id: face,
      label: staffLaneFaceLabel(face),
      checked: staffMatchesStageLane(row, face),
    })),
  }));

  const pick = (row: AssigneeComboboxRow) => {
    if (!onCommit || rosterAll || inRoster) return;
    const member = options.find((item) => item.id === row.id);
    if (!member || !staffMatchesStageLane(member, role)) return;
    const next = selectedStaffId === row.id ? null : row.id;
    onCommit(next, next == null ? null : row.name);
    onClose();
  };

  const setFace = (row: AssigneeComboboxRow, faceId: string, eligible: boolean) => {
    const face = faceId as CompoundStageAssignRole;
    const lane = eligible ? face : oppositeStaffLane(face);
    setOptions((prev) =>
      prev.map((member) => (member.id === row.id ? applyStaffLaneRole(member, lane) : member)),
    );
    onSetLaneRole?.(row.id, lane, row.name, {
      face,
      eligible,
    });
    if (!eligible && !rosterAll && selectedStaffId === row.id) {
      onCommit?.(null, null);
    }
  };

  const emptyMessage =
    options.length === 0 ? 'No staff' : query.trim() ? 'No matches' : staffLaneEmptyLabel(role);

  return (
    <AssigneeCombobox
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label={label}
      testId={rosterAll ? 'stage-staff-roster-popover' : 'stage-staff-assign-popover'}
      query={query}
      onQueryChange={setQuery}
      rows={rows}
      loading={loading}
      emptyMessage={emptyMessage}
      roster={inRoster}
      showAllStaff={canRoster && !rosterAll}
      onAllStaff={() => setRosterMode((next) => !next)}
      onSelect={pick}
      onFaceChange={setFace}
    />
  );
}
