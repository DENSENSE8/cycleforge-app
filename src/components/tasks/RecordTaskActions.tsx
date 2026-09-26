'use client';

/**
 * Staff task verbs on an open desk record: "Add task" (a task linked to this
 * record, yours until you hand it on) and "Send to staff as task" (the same
 * task, addressed to someone else). One composer on the house create path —
 * `useThrowTask` → `POST /api/tasks` with the record's `entityType` /
 * `entityId` — so the task lands in the assignee's list and inbox exactly as a
 * task thrown from anywhere else does.
 *
 * {@link buildRecordTaskVerbs} hands the two verbs to the record's action strip
 * (the composer is the verb's display); {@link RecordTaskActions} is the older
 * in-record button pair + inset composer. Any task entity kind
 * (`TaskEntityType`: order, receiving carton, support ticket) uses them; the
 * record IS the task's target, so there is no scan / resolve step here.
 */

import { useEffect, useRef, useState } from 'react';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useThrowTask } from '@/hooks/useThrowTask';
import type { ThrowTarget } from '@/lib/tasks/throw-targets';

export type RecordTaskKind = 'mine' | 'staff';

const TASK_TITLE: Record<RecordTaskKind, string> = { mine: 'Add task', staff: 'Send to staff as task' };

/** The record a task is thrown at — `label` names it in the composer (`Order 113-…`, `PO 15-…`). */
export type RecordTaskTarget = Pick<ThrowTarget, 'entityType' | 'entityId' | 'label'>;

/** "Add task" · "Send to staff as task" as strip verbs; each morphs into the composer. */
export function buildRecordTaskVerbs(target: RecordTaskTarget): RecordActionVerb[] {
  return (Object.keys(TASK_TITLE) as RecordTaskKind[]).map((kind) => ({
    id: `task-${kind}`,
    label: TASK_TITLE[kind],
    placement: 'overflow',
    display: (done) => <RecordTaskForm key={`${kind}:${target.entityId}`} kind={kind} target={target} onDone={done} />,
  }));
}

export function RecordTaskActions({ target }: { target: RecordTaskTarget }) {
  const [kind, setKind] = useState<RecordTaskKind | null>(null);
  return (
    <>
      <div className="flex gap-2 p-4" data-testid="record-tasks">
        {(Object.keys(TASK_TITLE) as RecordTaskKind[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-haspopup="dialog"
            data-testid={`record-task-${key}`}
            className={cn(evidenceVerbClass(), 'flex-1 border-mode-ink')}
            onClick={() => setKind(key)}
          >
            {TASK_TITLE[key]}
          </button>
        ))}
      </div>
      <DeskStageOverlay
        open={kind != null}
        onClose={() => setKind(null)}
        title={kind ? TASK_TITLE[kind] : 'Task'}
        subtitle={`Linked to ${target.label}`}
        fill="inset"
        testId="record-task-composer"
      >
        {kind ? <RecordTaskForm key={kind} kind={kind} target={target} onDone={() => setKind(null)} /> : null}
      </DeskStageOverlay>
    </>
  );
}

export function RecordTaskForm({
  kind,
  target,
  onDone,
}: {
  kind: RecordTaskKind;
  target: RecordTaskTarget;
  onDone: () => void;
}) {
  const task = useThrowTask({ onThrown: () => onDone() });
  const { setPicked, staff, assignees, toggleAssigneeById } = task;
  const { entityType, entityId, label } = target;

  // The record IS the task's target — no scan / resolve step on this surface.
  useEffect(() => {
    setPicked({ entityType, entityId, label });
  }, [setPicked, entityType, entityId, label]);

  // "Send to staff": the creator starts unticked (the hook preselects you).
  const clearedSelf = useRef(false);
  useEffect(() => {
    if (kind !== 'staff' || clearedSelf.current || !staff || assignees.length !== 1) return;
    clearedSelf.current = true;
    toggleAssigneeById(assignees[0]!.id, assignees[0]!.name);
  }, [kind, staff, assignees, toggleAssigneeById]);

  const picked = new Set(assignees.map((person) => person.id));

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void task.submit();
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className={cn(RECORD_LABEL_CLASS, 'mb-1 text-text-muted')}>Who does it</legend>
        <div className="flex flex-wrap gap-1.5" data-testid="record-task-assignees">
          {staff == null ? (
            <span className="text-role-caption text-text-muted">Loading staff…</span>
          ) : (
            staff.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-pressed={picked.has(person.id)}
                onClick={() => toggleAssigneeById(person.id, person.name)}
                className={cn(
                  'ds-raw-button border px-2 py-1 text-role-caption',
                  focusRing('control'),
                  picked.has(person.id)
                    ? 'border-text-default bg-text-default text-surface-card'
                    : 'border-border-default text-text-default hover:bg-surface-canvas',
                )}
              >
                {person.name}
              </button>
            ))
          )}
        </div>
      </fieldset>
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
        <Button type="submit" variant="ink" size="sm" disabled={!task.canThrow} loading={task.throwing} data-testid="record-task-submit">
          {kind === 'staff' ? 'Send task' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}
