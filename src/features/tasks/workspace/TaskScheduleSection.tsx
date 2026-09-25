'use client';

/**
 * Task evidence — **Schedule & owner**: when it is due, when to be reminded,
 * how urgent, and who holds it.
 *
 * The reminder is an absolute instant (`work_assignments.remind_at`). The
 * presets are relative to the DUE instant because that is how an operator
 * thinks about it ("an hour before it's due"), but what is stored is the
 * instant — the phone apps schedule a local notification for exactly it from
 * `GET /api/v1/reminders`, and a task with a due date but no reminder still
 * rings at the due instant there.
 */

import { useEffect, useState } from 'react';
import { StaffAvatar } from '@/components/identity';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { TextField } from '@/design-system/primitives';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { DateTimeValue } from '@/design-system/components/DateTimeValue';
import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { TASK_ASSIGNEES_MAX, TASK_PROJECT_NAME_MAX } from '@/lib/tasks/create-task-core';
import { TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { cn } from '@/utils/_cn';
import type { TaskDeskPatch } from '../useTaskDesk';

const MINUTE = 60_000;

const REMIND_BEFORE_DUE: ReadonlyArray<{ label: string; minutes: number }> = [
  { label: 'At due', minutes: 0 },
  { label: '15 min before', minutes: 15 },
  { label: '1 hr before', minutes: 60 },
  { label: '1 day before', minutes: 1440 },
];

/** Tomorrow, 8:00 on this browser's wall — the "first thing" reminder. */
function tomorrowMorning(nowMs: number): Date {
  const next = new Date(nowMs);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next;
}

const SMALL_VERB = 'min-h-0 py-1';

function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

export function TaskScheduleSection({
  row,
  nowMs,
  pending,
  onPatch,
}: {
  row: TaskDeskRow;
  nowMs: number;
  pending: boolean;
  onPatch: (patch: TaskDeskPatch) => void;
}) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [roster, setRoster] = useState<StaffRecipient[] | null>(null);
  const [projectDraft, setProjectDraft] = useState(row.projectName ?? '');
  useEffect(() => setProjectDraft(row.projectName ?? ''), [row.id, row.projectName]);
  useEffect(() => {
    if (!membersOpen || roster != null) return;
    let active = true;
    fetch('/api/auth/staff-picker', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { staff?: StaffRecipient[] } | null) => {
        if (active) setRoster(body?.staff ?? []);
      })
      .catch(() => { if (active) setRoster([]); });
    return () => { active = false; };
  }, [membersOpen, roster]);
  const assignees = row.assignees;
  const saveProject = () => {
    const next = projectDraft.trim() || null;
    if (next !== row.projectName) onPatch({ projectName: next });
  };
  const due = row.deadlineAtMs;

  return (
    <EvidenceSection label="Schedule & owner" testId="task-schedule">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-role-caption text-mode-muted">Due</span>
          <div className="flex items-center gap-2">
            <DateTimePickerField
              value={due != null ? new Date(due) : undefined}
              onChange={(next) => onPatch({ deadlineAt: next.toISOString() })}
              placeholder="No due date"
              disabled={pending}
              className="min-w-0 flex-1"
            />
            {due != null ? (
              <button
                type="button"
                className={cn(evidenceVerbClass(false), SMALL_VERB)}
                disabled={pending}
                onClick={() => onPatch({ deadlineAt: null })}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-role-caption text-mode-muted">Remind me</span>
          <div className="flex items-center gap-2">
            <DateTimePickerField
              value={row.remindAtMs != null ? new Date(row.remindAtMs) : undefined}
              onChange={(next) => onPatch({ remindAt: next.toISOString() })}
              placeholder={due != null ? 'At the due time' : 'No reminder'}
              disabled={pending}
              className="min-w-0 flex-1"
            />
            {row.remindAtMs != null ? (
              <button
                type="button"
                className={cn(evidenceVerbClass(false), SMALL_VERB)}
                disabled={pending}
                onClick={() => onPatch({ remindAt: null })}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Reminder presets">
            {due != null
              ? REMIND_BEFORE_DUE.map((preset) => {
                  const at = due - preset.minutes * MINUTE;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={cn(evidenceVerbClass(row.remindAtMs === at), SMALL_VERB)}
                      disabled={pending || at < nowMs}
                      onClick={() => onPatch({ remindAt: iso(at) })}
                    >
                      {preset.label}
                    </button>
                  );
                })
              : null}
            <button
              type="button"
              className={cn(evidenceVerbClass(false), SMALL_VERB)}
              disabled={pending}
              onClick={() => onPatch({ remindAt: tomorrowMorning(nowMs).toISOString() })}
            >
              Tomorrow 8 AM
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-role-caption text-mode-muted">Priority</span>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              className={cn(evidenceVerbClass(row.urgency === 'urgent'), SMALL_VERB)}
              aria-pressed={row.urgency === 'urgent'}
              disabled={pending}
              onClick={() => onPatch({ priority: TASK_PRIORITY.urgent })}
            >
              Urgent
            </button>
            <button
              type="button"
              className={cn(evidenceVerbClass(row.urgency === 'normal'), SMALL_VERB)}
              aria-pressed={row.urgency === 'normal'}
              disabled={pending}
              onClick={() => onPatch({ priority: TASK_PRIORITY.normal })}
            >
              Normal
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-role-caption text-mode-muted">Project</span>
          <TextField
            label="Project name"
            value={projectDraft}
            onChange={setProjectDraft}
            onBlur={saveProject}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            maxLength={TASK_PROJECT_NAME_MAX}
            disabled={pending}
          />
          <span className="text-role-caption text-mode-muted">Assigned team</span>
          <div className="flex flex-wrap gap-2">
            {assignees.map((person, index) => (
              <span key={person.id} className="inline-flex items-center gap-1 text-role-caption text-mode-ink">
                <StaffAvatar staffId={person.id} name={person.name} size="sm" colorRing alt="" />
                {person.name}{index === 0 ? ' · Lead' : ''}
              </span>
            ))}
          </div>
          <button type="button" className={cn(evidenceVerbClass(membersOpen), 'justify-start')} disabled={pending} onClick={() => setMembersOpen((open) => !open)}>
            {membersOpen ? 'Done editing team' : 'Edit team'}
          </button>
          {membersOpen ? (
            <div role="group" aria-label="Task team" className="max-h-44 overflow-y-auto">
              {roster == null ? <span className="text-role-caption text-mode-muted">Loading staff…</span> : [...assignees, ...roster.filter((person) => !assignees.some((member) => member.id === person.id))].map((person) => {
                const selected = assignees.some((member) => member.id === person.id);
                return (
                  <label key={person.id} className="flex items-center gap-2 px-2 py-1.5 text-role-caption text-mode-ink">
                    <Checkbox
                      checked={selected}
                      disabled={pending || (selected ? assignees.length <= 1 : assignees.length >= TASK_ASSIGNEES_MAX)}
                      onCheckedChange={() => onPatch({
                        assigneeStaffIds: selected
                          ? assignees.filter((member) => member.id !== person.id).map((member) => member.id)
                          : [...assignees.map((member) => member.id), person.id],
                      })}
                      aria-label={`Assign ${person.name}`}
                    />
                    {person.name}
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <EvidenceFacts>
          {/* NULL on every row written before `assigned_by_staff_id` existed —
              the honest face is a dash, not the current user. */}
          <EvidenceFact label="From">{row.assignedBy?.name ?? '—'}</EvidenceFact>
          <EvidenceFact label="Handed over">
            <DateTimeValue value={new Date(row.assignedAtMs).toISOString()} />
          </EvidenceFact>
          <EvidenceFact label="Started">
            <DateTimeValue value={iso(row.startedAtMs)} fallback="Not started" />
          </EvidenceFact>
          <EvidenceFact label="Completed">
            <DateTimeValue value={iso(row.completedAtMs)} fallback="—" />
          </EvidenceFact>
        </EvidenceFacts>
      </div>
    </EvidenceSection>
  );
}
