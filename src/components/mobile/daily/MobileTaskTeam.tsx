'use client';

/**
 * The task sheet's TEAM row — who is on it (lead first), and the phone's way
 * to add another owner (DoD 2026-09-29: several owners on a ticket follow-up,
 * desktop AND phone). The picker is the house `AssigneeComboboxPanel`, rows
 * painted with `StaffAvatar` — the same panel the phone composer's owner step
 * uses. Writes `PATCH /api/tasks/[id] { assigneeStaffIds }`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import type { TaskDeskPerson } from '@/lib/tasks/task-desk-row';
import { useSetTaskOwners } from '@/lib/tasks/use-my-tasks';

export function MobileTaskTeam({ taskId, people }: { taskId: number; people: readonly TaskDeskPerson[] }) {
  const setOwners = useSetTaskOwners();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<StaffMember[] | null>(null);

  useEffect(() => {
    if (!adding || staff) return;
    let active = true;
    getActiveStaff()
      .then((rows) => active && setStaff([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => active && setStaff([]));
    return () => {
      active = false;
    };
  }, [adding, staff]);

  const memberIds = people.map((p) => p.id);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (staff ?? [])
      .filter((m) => !memberIds.includes(m.id) && (!needle || m.name.toLowerCase().includes(needle)))
      .map((m) => ({
        id: m.id,
        name: m.name,
        selected: false,
        leading: <StaffAvatar staffId={m.id} name={m.name} size="sm" colorRing alt="" />,
      }));
  }, [memberIds, query, staff]);

  return (
    <div className="border-b border-border-hairline px-1 py-2" data-testid="mobile-task-team">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-caption text-text-muted">
        <span className="font-semibold text-text-default">Team:</span>
        {people.map((person, index) => (
          <span key={person.id} className="inline-flex items-center gap-1 text-text-default">
            <StaffAvatar staffId={person.id} name={person.name} size="xs" alt="" />
            <StaffBadge staffId={person.id} name={person.name} />
            {index === 0 ? <span className="text-text-muted">(lead)</span> : null}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-text-default"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Add person
        </button>
      </div>
      {adding ? (
        <div className="pt-1">
          <AssigneeComboboxPanel
            query={query}
            onQueryChange={setQuery}
            rows={rows}
            loading={staff == null}
            emptyMessage={staff == null ? 'Loading staff…' : 'Everyone is already on it'}
            roster={false}
            onSelect={(row) => {
              setOwners.mutate({ taskId, assigneeStaffIds: [...memberIds, row.id] });
              setAdding(false);
              setQuery('');
            }}
          />
        </div>
      ) : null}
      {setOwners.error ? (
        <p role="alert" className="pt-1 text-role-micro text-text-danger">
          {setOwners.error.message}
        </p>
      ) : null}
    </div>
  );
}
