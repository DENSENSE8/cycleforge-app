'use client';

/**
 * The phone's Alert sheet (R7) — the desk's `TaskAlertButton` twin, opened from the record's ⋯ menu
 * ("Send Alert…", owner 2026-10-03: secondary verbs live behind the three dots). "Alert <people> to
 * follow up" (default the owners other than me; any other active staffer can be added — owner
 * 2026-09-30: "I should not be able to alert myself"), optional note + follow-up-by, and a preview
 * of the contacts the task links, which ride on every recipient's inbox row.
 *
 * `taskAlertRecipients` decides whether the menu offers it: only when someone other than me owns it.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bell, Plus, X } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InboxContactLinks } from '@/components/ui/InboxContactLinks';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { TASK_ALERT_NOTE_MAX } from '@/lib/tasks/task-alerts';
import type { TaskDeskPerson } from '@/lib/tasks/task-desk-row';
import { taskAlertDueChoices, taskAlertHeadline, useSendTaskAlert, useTaskAlertContacts } from '@/lib/tasks/use-task-alert';
import { toast } from '@/lib/toast';

/** The owners an alert goes to by default — everyone on the task but me. */
export function taskAlertRecipients(people: readonly TaskDeskPerson[], selfId: number | null): TaskDeskPerson[] {
  return people.filter((person) => person.id !== selfId);
}

export function MobileTaskAlert({
  taskId,
  recipients,
  selfId,
  ticketNumber,
  open,
  onOpenChange,
}: {
  taskId: number;
  /** `taskAlertRecipients(row.assignees, selfId)` — non-empty, or the menu never offers it. */
  recipients: TaskDeskPerson[];
  selfId: number | null;
  ticketNumber: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Send Alert</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {/* Remounted per open: recipients, note and due time start fresh every time. */}
          {open ? (
            <AlertForm taskId={taskId} people={recipients} selfId={selfId} ticketNumber={ticketNumber} onDone={() => onOpenChange(false)} />
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function AlertForm({
  taskId,
  people,
  selfId,
  ticketNumber,
  onDone,
}: {
  taskId: number;
  /** The owners other than me — the default recipients. */
  people: TaskDeskPerson[];
  selfId: number | null;
  ticketNumber: number | null;
  onDone: () => void;
}) {
  const send = useSendTaskAlert(taskId);
  const contacts = useTaskAlertContacts(taskId, ticketNumber);
  const [recipients, setRecipients] = useState<TaskDeskPerson[]>(people);
  const [picking, setPicking] = useState(people.length === 0);
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const choices = taskAlertDueChoices();

  useEffect(() => {
    if (!picking || staff) return;
    let active = true;
    getActiveStaff()
      .then((rows) => active && setStaff([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => active && setStaff([]));
    return () => {
      active = false;
    };
  }, [picking, staff]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (staff ?? [])
      .filter((m) => m.id !== selfId && !recipients.some((r) => r.id === m.id) && (!needle || m.name.toLowerCase().includes(needle)))
      .map((m) => ({ id: m.id, name: m.name, leading: <StaffAvatar staffId={m.id} name={m.name} size="sm" colorRing alt="" /> }));
  }, [query, recipients, selfId, staff]);

  return (
    <div className="flex flex-col gap-4 pb-2" data-testid="mobile-task-alert-sheet">
      <section className="flex flex-col gap-2" aria-label="Who to alert">
        <div className="flex flex-wrap items-center gap-2 text-role-caption font-semibold text-text-default">
          {recipients.map((person) => (
            <span key={person.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-sunken pl-1 pr-1">
              <StaffAvatar staffId={person.id} name={person.name} size="xs" alt="" />
              <StaffBadge staffId={person.id} name={person.name} />
              <button
                type="button"
                aria-label={`Don’t alert ${person.name}`}
                onClick={() => setRecipients((prev) => prev.filter((r) => r.id !== person.id))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ))}
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-text-default"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add person
          </button>
        </div>
        {picking ? (
          <AssigneeComboboxPanel
            query={query}
            onQueryChange={setQuery}
            rows={rows}
            loading={staff == null}
            emptyMessage={staff == null ? 'Loading staff…' : 'Everyone is already on it'}
            roster={false}
            onSelect={(row) => {
              setRecipients((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, { id: row.id, name: row.name }]));
              setQuery('');
              setPicking(false);
            }}
          />
        ) : null}
      </section>
      <section className="flex flex-col gap-1.5" aria-label="Contacts sent with the alert" data-testid="mobile-task-alert-contacts">
        <span className="text-role-caption font-semibold text-text-muted">Sends with</span>
        {contacts.length > 0 ? (
          <InboxContactLinks contacts={contacts} surface="phone" />
        ) : (
          <span className="text-role-caption text-text-muted">No contacts linked — add them under Linked records.</span>
        )}
      </section>
      <TextField label="Note (optional)" value={note} onChange={setNote} multiline rows={3} maxLength={TASK_ALERT_NOTE_MAX} />
      <section className="flex flex-col gap-2" aria-label="Follow up by">
        <span className="text-role-caption font-semibold text-text-muted">Follow up by</span>
        <div className="flex flex-wrap items-center gap-2">
          {choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant={dueAt === choice.iso ? 'primary' : 'secondary'}
              aria-pressed={dueAt === choice.iso}
              onClick={() => setDueAt(dueAt === choice.iso ? null : choice.iso)}
            >
              {choice.label}
            </Button>
          ))}
          <DateTimePickerField
            value={dueAt ? new Date(dueAt) : undefined}
            onChange={(next) => setDueAt(next.toISOString())}
            placeholder="Pick a time"
          />
        </div>
      </section>
      <Button
        variant="primary"
        size="lg"
        className="min-h-12 w-full"
        icon={<Bell aria-hidden className="h-5 w-5" />}
        loading={send.isPending}
        disabled={recipients.length === 0}
        onClick={() =>
          send.mutate(
            { staffIds: recipients.map((r) => r.id), note: note.trim() || null, dueAt },
            {
              onSuccess: (res) => {
                toast.success(res.staffIds.length === 1 ? 'Alert sent' : `Alerted ${res.staffIds.length} people`);
                onDone();
              },
              onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not send the alert.'),
            },
          )
        }
        data-testid="mobile-task-alert-send"
      >
        {taskAlertHeadline(recipients.map((r) => r.name))}
      </Button>
    </div>
  );
}
