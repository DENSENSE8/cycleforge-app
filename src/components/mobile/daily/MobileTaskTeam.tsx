'use client';

/**
 * WHO is on the task — read-only on the record (owner 2026-10-03: "adding staff must be behind the
 * three dots"). `MobileTaskPeople` paints the faces: the lead wears a name (+ "lead" when there are
 * others), everyone else a face. `MobileTaskAddPerson` is the ⋯ menu's "Add Person…" sheet: the
 * house `AssigneeComboboxPanel`, rows painted with `StaffAvatar`. Writes
 * `PATCH /api/tasks/[id] { assigneeStaffIds }`.
 */

import { useEffect, useMemo, useState } from 'react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import type { TaskDeskPerson } from '@/lib/tasks/task-desk-row';
import { useSetTaskOwners } from '@/lib/tasks/use-my-tasks';

export function MobileTaskPeople({ people }: { people: readonly TaskDeskPerson[] }) {
  if (people.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-role-caption" data-disclosure-slot="people">
      {people.map((person, index) =>
        index === 0 ? (
          <span key={person.id} className="inline-flex shrink-0 items-center gap-1 text-text-default">
            <StaffAvatar staffId={person.id} name={person.name} size="xs" alt="" />
            <StaffBadge staffId={person.id} name={person.name} />
            {people.length > 1 ? <span className="text-text-muted">lead</span> : null}
          </span>
        ) : (
          <StaffAvatar key={person.id} staffId={person.id} name={person.name} size="xs" alt={person.name} className="shrink-0" />
        ),
      )}
    </span>
  );
}

export function MobileTaskAddPerson({
  taskId,
  people,
  open,
  onOpenChange,
}: {
  taskId: number;
  people: readonly TaskDeskPerson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOwners = useSetTaskOwners();
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<StaffMember[] | null>(null);

  useEffect(() => {
    if (!open || staff) return;
    let active = true;
    getActiveStaff()
      .then((rows) => active && setStaff([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => active && setStaff([]));
    return () => {
      active = false;
    };
  }, [open, staff]);

  const memberIds = useMemo(() => people.map((p) => p.id), [people]);
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined} data-testid="mobile-task-add-person">
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Add Person</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <AssigneeComboboxPanel
            query={query}
            onQueryChange={setQuery}
            rows={rows}
            loading={staff == null}
            emptyMessage={staff == null ? 'Loading staff…' : 'Everyone is already on it'}
            roster={false}
            onSelect={(row) => {
              setOwners.mutate(
                { taskId, assigneeStaffIds: [...memberIds, row.id] },
                { onSuccess: () => onOpenChange(false) },
              );
              setQuery('');
            }}
          />
          {setOwners.error ? (
            <p role="alert" className="pt-2 text-role-micro text-text-danger">
              {setOwners.error.message}
            </p>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
