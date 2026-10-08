'use client';

/** The ONE staff-task verb on an open desk record: Assign task (you, or anyone, from the same picker). */

import { useEffect } from 'react';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useThrowTask } from '@/hooks/useThrowTask';
import type { ThrowTarget } from '@/lib/tasks/throw-targets';
import { ClipboardList } from '@/components/Icons';
import { InlineStageAssign } from '@/design-system/components/record-ledger/InlineStageAssign';

/** The record key for Assign task. */
const RECORD_TASK_HOTKEY = 'a';

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
 * as task" were duplicates). It morphs into the composer, whose "Who does it"
 * picker starts on you and takes anyone.
 */
export function buildRecordTaskVerb(target: RecordTaskTarget): RecordActionVerb {
  return {
    id: 'task',
    label: 'Assign task',
    icon: <ClipboardList />,
    hotkey: RECORD_TASK_HOTKEY,
    display: (done) => <RecordTaskForm key={String(target.entityId ?? target.label)} target={target} onDone={done} />,
  };
}

/** The task composer body — a strip verb's morph, or inline in a record (Stock's "Send to staff" group). */
export function RecordTaskForm({
  target,
  onDone,
}: {
  target: RecordTaskTarget;
  onDone: () => void;
}) {
  const task = useThrowTask({ onThrown: () => onDone() });
  const { setPicked, setProjectName, assignees, toggleAssigneeById } = task;
  const { entityType, entityId, label } = target;
  // The phone reads Send at the 44px touch rung.
  const { isMobile } = useUIModeOptional();

  // The record IS the task's target — no scan / resolve step on this surface.
  useEffect(() => {
    if (entityType == null) setProjectName(label);
    else setPicked({ entityType, entityId, label });
  }, [setPicked, setProjectName, entityType, entityId, label]);

  const lead = assignees[0] ?? null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void task.submit();
      }}
    >
      {/* ONE person, through the house staff picker (avatar + name) — never a grid of name bubbles. */}
      <div className="flex items-center gap-2 text-role-caption">
        <span className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>Who does it</span>
        <InlineStageAssign
          label="staff"
          role="all"
          selectedStaffId={lead?.id ?? null}
          assignedName={lead?.name ?? null}
          onCommit={(staffId, staffName) => {
            for (const person of assignees) if (person.id !== staffId) toggleAssigneeById(person.id, person.name);
            if (staffId != null && staffName && !assignees.some((person) => person.id === staffId)) toggleAssigneeById(staffId, staffName);
          }}
          testId="record-task-assignee"
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>What needs doing</span>
        <textarea
          value={task.note}
          onChange={(event) => task.setNote(event.target.value)}
          rows={4}
          data-testid="record-task-note"
          className={cn('w-full resize-y border border-border-default bg-surface-card p-2 text-role-body', focusRing('control'))}
        />
      </label>
      <label className="flex items-center gap-2 text-role-caption text-text-default">
        <Checkbox checked={task.urgent} onCheckedChange={(value) => task.setUrgent(value === true)} data-testid="record-task-urgent" />
        Urgent
      </label>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-role-caption text-text-muted">{task.missing ?? ''}</span>
        <Button type="submit" variant="ink" size={isMobile ? 'lg' : 'sm'} disabled={!task.canThrow} loading={task.throwing} data-testid="record-task-submit">
          Assign task
        </Button>
      </div>
    </form>
  );
}
