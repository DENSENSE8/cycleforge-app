'use client';

/**
 * Pass-pick sheet — pick another picker for this order. Commits on tap.
 * Sign-in SwitchStaffSheet is a different job (pinless act-as switch).
 */

import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StaffChoiceRowButton } from '@/components/auth/StaffChoiceRowButton';
import { SearchField, Inset, Stack } from '@/design-system/primitives';
import { staffMatchesStageLane } from '@/components/tables/compound/staff-stage-lane';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import type { WorkOrderRow } from '@/components/work-orders/types';

export function MobileToShipPickerSheet({
  row,
  open,
  onClose,
  onPass,
}: {
  row: WorkOrderRow | null;
  open: boolean;
  onClose: () => void;
  onPass: (staff: { id: number; name: string }) => void;
}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setReady(false);
      return;
    }
    let active = true;
    void getActiveStaff().then((rows) => {
      if (!active) return;
      setStaff(rows);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const pickers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const lane = staff.filter((member) => staffMatchesStageLane(member, 'technician'));
    const pool = lane.length > 0 ? lane : staff;
    const filtered = needle
      ? pool.filter((member) => member.name.toLowerCase().includes(needle))
      : pool;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [query, staff]);

  if (!row) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      forceVariant="sheet"
      title="Pass pick"
      scrollBody
      level={1}
    >
      <div data-testid="to-ship-pass-pick">
        <Inset space="field">
          <Stack space="tight">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search picker"
              tone="neutral"
              hideUnderline
            />
            {!ready ? (
              <p className="text-role-eyebrow text-text-muted">Loading staff…</p>
            ) : pickers.length === 0 ? (
              <p className="text-role-eyebrow text-text-muted">
                {query.trim() ? 'No matching pickers.' : 'No pickers on the roster.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pickers.map((member) => (
                  <li key={member.id}>
                    <StaffChoiceRowButton
                      staffId={member.id}
                      name={member.name}
                      role={member.role || 'Picker'}
                      isRecent={member.id === row.techId}
                      ariaLabel={`Pass pick to ${member.name}`}
                      onPick={() => onPass({ id: member.id, name: member.name })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        </Inset>
      </div>
    </BottomSheet>
  );
}
