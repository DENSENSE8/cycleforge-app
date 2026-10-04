'use client';

/**
 * R7 — the inline **Alert** verb: "Alert <people> to follow up", with an
 * optional note and a follow-up-by time. Sends `POST /api/tasks/[id]/alerts`
 * to the picked staff (default = the task's owners other than me; any other
 * active staffer can be added — owner 2026-09-30: "I should not be able to
 * alert myself"); each recipient
 * gets a durable `staff_inbox_items` row carrying the task's linked contacts
 * (previewed here) + an Ably `inbox_item` push, read in the header's top-left
 * personal line and the Inbox's Alerts tab. `A` opens it on the board.
 *
 *   ┌ Alert (●Michael ×) (●Ana ×) [+ Add] to follow up ┐
 *   │ Sends  customer@x.com · sales@ · Order 12345      │
 *   │ Note  Customer called back — needs a quote        │
 *   │ By  [Today 5 PM] [Tomorrow] [In 3 days] [📅]       │
 *   │                                    [Send ⌘↵]      │
 *   └───────────────────────────────────────────────────┘
 */

import { useMemo, useRef, useState } from 'react';
import { BellRing, Plus, X } from 'lucide-react';
import { DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { InboxContactLinks } from '@/components/ui/InboxContactLinks';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useAuth } from '@/contexts/AuthContext';
import { TASK_ALERT_NOTE_MAX } from '@/lib/tasks/task-alerts';
import { taskAlertDueChoices, taskAlertHeadline, useSendTaskAlert, useTaskAlertContacts } from '@/lib/tasks/use-task-alert';
import { toast } from '@/lib/toast';

/** The board's bare key for Alert (free on the board and in `?`; verified 2026-09-29). */
export const TASK_ALERT_KEY = 'a';

export function TaskAlertButton({
  taskId,
  ownerIds,
  ticketNumber,
  variant,
  open: openProp,
  onOpenChange,
}: {
  taskId: number;
  ownerIds: number[];
  /** The provider number of the ticket the task is about — the first contact after the emails. */
  ticketNumber: number | null;
  variant: 'row' | 'header';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <>
      {variant === 'header' ? (
        // The record band's verb face: icon + word + keycap when roomy, icon alone when compact.
        <DeskHeaderAction
          ref={anchorRef}
          size="sm"
          variant="secondary"
          icon={<BellRing />}
          label="Alert"
          shortcut={TASK_ALERT_KEY.toUpperCase()}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(!open)}
          data-testid="task-alert-header"
        />
      ) : (
        <HoverTooltip label="Alert" shortcut={TASK_ALERT_KEY.toUpperCase()} placement="below" asChild>
          <Button
            ref={anchorRef}
            size="sm"
            variant="secondary"
            icon={<BellRing aria-hidden />}
            onClick={(event) => {
              // A row verb must not also open the row under it.
              event.stopPropagation();
              setOpen(!open);
            }}
            aria-expanded={open}
            aria-haspopup="dialog"
            ariaLabel="Alert someone to follow up"
            className="h-6 px-2 text-[11px]"
            data-testid="task-alert-row"
          >
            Alert
          </Button>
        </HoverTooltip>
      )}
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        gap={4}
      >
        {/* Remounted per open: the note and the due time start fresh every time. */}
        {open ? <TaskAlertPanel taskId={taskId} ownerIds={ownerIds} ticketNumber={ticketNumber} onDone={() => setOpen(false)} /> : null}
      </AnchoredLayer>
    </>
  );
}

function TaskAlertPanel({
  taskId,
  ownerIds,
  ticketNumber,
  onDone,
}: {
  taskId: number;
  ownerIds: number[];
  ticketNumber: number | null;
  onDone: () => void;
}) {
  const { getStaffName } = useStaffNameMap();
  const { user } = useAuth();
  const selfId = user?.staffId ?? null;
  const send = useSendTaskAlert(taskId);
  const contacts = useTaskAlertContacts(taskId, ticketNumber);
  const directory = useActiveStaffDirectory();
  // The sender is never a recipient: when I'm the only owner, start empty with the picker open.
  const [recipients, setRecipients] = useState<number[]>(() => ownerIds.filter((id) => id !== selfId));
  const [picking, setPicking] = useState(() => !ownerIds.some((id) => id !== selfId));
  const [find, setFind] = useState('');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const choices = taskAlertDueChoices();
  const headline = taskAlertHeadline(recipients.map((id) => getStaffName(id)));
  const canSend = recipients.length > 0 && !send.isPending;
  const candidates = useMemo(() => {
    const needle = find.trim().toLowerCase();
    return directory
      .filter((staff) => staff.id !== selfId && !recipients.includes(staff.id) && (!needle || staff.name.toLowerCase().includes(needle)))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        leading: <StaffAvatar staffId={staff.id} name={staff.name} size="sm" colorRing alt="" />,
      }));
  }, [directory, find, recipients, selfId]);

  const submit = () => {
    if (!canSend) return;
    send.mutate(
      { staffIds: recipients, note: note.trim() || null, dueAt },
      {
        onSuccess: (res) => {
          toast.success(res.staffIds.length === 1 ? `Alerted ${getStaffName(res.staffIds[0])}` : `Alerted ${res.staffIds.length} people`);
          onDone();
        },
        onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not send the alert.'),
      },
    );
  };

  return (
    <div
      role="dialog"
      aria-label={headline}
      data-testid="task-alert-panel"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      className="flex w-80 flex-col gap-3 rounded-2xl border border-border-hairline bg-surface-card p-3 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.45)]"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-text-default" data-testid="task-alert-recipients">
        {recipients.length === 0 ? 'Pick who to alert' : 'Alert'}
        {recipients.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-1">
            <StaffAvatar staffId={id} name={getStaffName(id)} size="xs" alt="" />
            <StaffBadge staffId={id} name={getStaffName(id)} />
            <IconButton
              size="xs"
              radius="pill"
              ariaLabel={`Don’t alert ${getStaffName(id)}`}
              onClick={() => setRecipients((prev) => prev.filter((x) => x !== id))}
              icon={<X aria-hidden className="size-3" />}
            />
          </span>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus aria-hidden />}
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          className="h-6 px-1.5 text-role-micro"
          data-testid="task-alert-add-recipient"
        >
          Add
        </Button>
        {recipients.length === 0 ? null : 'to follow up'}
      </div>
      {picking ? (
        <div className="overflow-hidden rounded-xl border border-border-hairline">
          <AssigneeComboboxPanel
            query={find}
            onQueryChange={setFind}
            rows={candidates}
            loading={directory.length === 0}
            emptyMessage={directory.length === 0 ? 'Loading staff…' : 'Everyone is already on it'}
            roster={false}
            autoFocusSearch
            onEscape={() => setPicking(false)}
            onSelect={(row) => {
              setRecipients((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
              setFind('');
              setPicking(false);
            }}
          />
        </div>
      ) : null}
      <section className="flex flex-col gap-1" aria-label="Contacts sent with the alert" data-testid="task-alert-contacts">
        <span className="text-[11px] font-semibold text-text-muted">Sends with</span>
        {contacts.length > 0 ? (
          <InboxContactLinks contacts={contacts} surface="desk" />
        ) : (
          <span className="text-[11px] text-text-muted">No contacts linked — add them under the task’s Links.</span>
        )}
      </section>
      <TextField
        label="Note (optional)"
        value={note}
        onChange={setNote}
        multiline
        rows={3}
        maxLength={TASK_ALERT_NOTE_MAX}
        autoFocus={!picking}
      />
      <section className="flex flex-col gap-1.5" aria-label="Follow up by">
        <span className="text-[11px] font-semibold text-text-muted">Follow up by</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant={dueAt === choice.iso ? 'primary' : 'ghost'}
              aria-pressed={dueAt === choice.iso}
              onClick={() => setDueAt(dueAt === choice.iso ? null : choice.iso)}
              className="h-6 px-2 text-[11px]"
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
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <HoverTooltip label="Send" shortcut="⌘↵" placement="above" asChild>
          <Button
            size="sm"
            variant="primary"
            icon={<BellRing aria-hidden />}
            loading={send.isPending}
            disabled={!canSend}
            onClick={submit}
            data-testid="task-alert-send"
          >
            Send
          </Button>
        </HoverTooltip>
      </div>
    </div>
  );
}
