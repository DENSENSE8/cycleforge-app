'use client';

/** The ONE staff-task verb on an open desk record: Assign task (you, or anyone, from the same picker). */

import { useEffect, useId, useState } from 'react';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { TextField } from '@/design-system/primitives/TextField';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { cn } from '@/utils/_cn';
import { useThrowTask } from '@/hooks/useThrowTask';
import type { ThrowTarget } from '@/lib/tasks/throw-targets';
import { ASSIGN_TASK_HOTKEY } from '@/lib/keyboard/key-registry';
import { ClipboardList } from '@/components/Icons';
import { StaffPickList } from '@/components/staff-assign/StaffPickList';

/**
 * The record a task is thrown at — `label` names it in the composer (`Order 113-…`, `PO 15-…`).
 * A record kind tasks cannot anchor to (a stock pair: not an urgency target) throws a
 * STANDALONE task instead, its title the label (`C-02-01-2-00 · TMP-H5YM4`).
 */
type RecordTaskTarget =
  | Pick<ThrowTarget, 'entityType' | 'entityId' | 'label'>
  | { entityType: null; entityId: null; label: string };

/**
 * Assign task — one verb (operator 2026-10-08: "Add task" and "Send to staff
 * as task" were duplicates). It opens the composer in the centered dialog
 * every record form shares; its "Who does it" list starts on you and takes anyone.
 */
export function buildRecordTaskVerb(target: RecordTaskTarget): RecordActionVerb {
  return {
    id: 'task',
    label: 'Assign task',
    icon: <ClipboardList />,
    hotkey: ASSIGN_TASK_HOTKEY,
    dialog: (done) => <RecordTaskForm key={String(target.entityId ?? target.label)} target={target} onDone={done} />,
  };
}

/**
 * The task composer — the dialog's body: who (in-place staff list, search
 * focused, Enter picks and moves on to the note), what, urgent, then Assign
 * task (⌘/Ctrl+Enter from the note). A thrown task shows the done face.
 */
function RecordTaskForm({
  target,
  onDone,
}: {
  target: RecordTaskTarget;
  onDone: () => void;
}) {
  const [thrown, setThrown] = useState(false);
  const task = useThrowTask({ onThrown: () => setThrown(true) });
  const { setPicked, setProjectName, assignees, toggleAssigneeById } = task;
  const { entityType, entityId, label } = target;
  const noteId = useId();
  // The phone reads Send at the 44px touch rung.
  const { isMobile } = useUIModeOptional();

  // The record IS the task's target — no scan / resolve step on this surface.
  useEffect(() => {
    if (entityType == null) setProjectName(label);
    else setPicked({ entityType, entityId, label });
  }, [setPicked, setProjectName, entityType, entityId, label]);

  const lead = assignees[0] ?? null;

  // The composer keeps its assignees after a send: the done face names them.
  if (thrown) {
    const to = assignees.map((person) => person.name).join(', ');
    return <VerbDoneState title="Task assigned" detail={to ? `${to} · ${label}` : label} onDone={onDone} testId="record-task-done" />;
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void task.submit();
      }}
    >
      {/* ONE person, through the in-place staff list (avatar + name) — never a grid of name bubbles. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>Who does it{lead ? ` · ${lead.name}` : ''}</span>
        <StaffPickList
          role="all"
          selectedStaffId={lead?.id ?? null}
          onPick={(staffId, staffName) => {
            for (const person of assignees) if (person.id !== staffId) toggleAssigneeById(person.id, person.name);
            if (!assignees.some((person) => person.id === staffId)) toggleAssigneeById(staffId, staffName);
            document.getElementById(noteId)?.focus({ preventScroll: true });
          }}
          ariaLabel="Who does it"
          testId="record-task-assignee"
          className="min-h-0 flex-1"
        />
      </div>
      <TextField
        id={noteId}
        label="What needs doing"
        multiline
        rows={3}
        value={task.note}
        onChange={task.setNote}
        data-testid="record-task-note"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void task.submit();
          }
        }}
      />
      <label className="flex items-center gap-2 text-role-caption text-text-default">
        <Checkbox checked={task.urgent} onCheckedChange={(value) => task.setUrgent(value === true)} data-testid="record-task-urgent" />
        Urgent
      </label>
      <div className="flex items-center gap-2 border-t border-border-soft pt-3">
        <span className="min-w-0 flex-1 text-role-caption text-text-muted">{task.missing ?? ''}</span>
        <Button type="submit" variant="ink" size={isMobile ? 'lg' : 'md'} disabled={!task.canThrow} loading={task.throwing} data-testid="record-task-submit">
          Assign task
        </Button>
      </div>
    </form>
  );
}
