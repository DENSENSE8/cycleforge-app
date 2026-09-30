'use client';

/**
 * The roster beside the Staff schedule record on /operations?mode=staff. It
 * was the old rail's picker (`StaffScheduleSidebarPanel`); the contextual
 * sidebar now owns its filters (Find → `?search=`, Show → `?staffView=`), so
 * this is only the list — in the stage, left of the schedule it opens.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { AdminPickerRow, useAdminUrlState } from './shared';
import { matchesStaffRosterFilter } from './staff-management/hooks/useStaffScheduleFilters';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { getStaffColorHex } from '@/utils/staff-colors';

interface StaffRow {
  id: number;
  name: string;
  role: string;
  active: boolean;
  employee_id: string | null;
  color_hex?: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function StaffPickerPane() {
  const { searchParams, setParam } = useAdminUrlState();
  const search = (searchParams.get('search') ?? '').trim().toLowerCase();
  const staffView = searchParams.get('staffView') ?? 'all';
  const selected = searchParams.get('staffId') ?? '';

  const { data: staff = [], isLoading } = useQuery<StaffRow[]>({
    queryKey: qk.staff.all,
    queryFn: async () => {
      const res = await fetch('/api/staff?active=false');
      if (!res.ok) throw new Error('Failed to load staff');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const rows = useMemo(
    () => staff.filter((member) => matchesStaffRosterFilter(member, search, staffView)),
    [staff, search, staffView],
  );

  return (
    <nav
      aria-label="Staff"
      data-testid="operations-staff-picker"
      className="h-full w-72 shrink-0 overflow-y-auto border-r border-border-soft bg-surface-card p-2"
    >
      <ul className="space-y-1.5">
        {isLoading ? (
          <li className="px-2 py-6 text-center text-xs text-text-faint">Loading staff…</li>
        ) : rows.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-text-faint">No matches.</li>
        ) : (
          rows.map((row) => (
            <li key={row.id}>
              <AdminPickerRow
                selected={selected === String(row.id)}
                onPick={() => setParam((p) => p.set('staffId', String(row.id)))}
                leading={
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-role-caption font-semibold text-white"
                    style={{ backgroundColor: getStaffColorHex(row) }}
                  >
                    {initials(row.name)}
                  </div>
                }
                title={row.name}
                subtitle={row.role.replace(/_/g, ' ')}
                trailing={
                  <HoverTooltip label={row.active ? 'Active' : 'Inactive'} asChild focusable={false}>
                    <span className={`h-2 w-2 rounded-full ${row.active ? 'bg-emerald-500' : 'bg-border-emphasis'}`} />
                  </HoverTooltip>
                }
              />
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}
