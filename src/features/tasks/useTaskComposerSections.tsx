'use client';

/**
 * The TASK half of the Daily agenda composer, as {@link TriageSectionSpec}s.
 *
 * ## Why the sections are a hook and not a component
 *
 * The agenda composer is ONE stage with a type switch at the top: pick
 * *Daily checklist* and the stage shows the checklist fields, pick *Task* and
 * it shows these three. A component would bring its own host, its own rail and
 * its own header, and the stage would nest two chromes. Handing back section
 * specs lets the stage stay one host with one CTA — which is the whole point
 * of consolidating the display (operator 2026-09-22).
 *
 * Resolving a record, loading the roster, POSTing the task and reporting a
 * degraded amplifier are {@link useThrowTask} — the same sequence the
 * chord-summoned `ThrowTaskPanel` runs. This module chooses where the fields
 * sit and nothing else.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { AlertTriangle, Check, Inbox, Loader2, Package, Search, Ticket } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import type { TriageSectionSpec } from '@/design-system/components/TriageScrollLayout';
import { Button, Switch, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  triagePanelControl,
  TRIAGE_PANEL_INNER_CORNER,
} from '@/design-system/tokens/triage-panel';
import { useThrowTask, throwTargetKey, type ThrowTaskMode } from '@/hooks/useThrowTask';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX } from '@/lib/tasks/create-task-core';
import { cn } from '@/utils/_cn';

export interface TaskComposerSections {
  sections: TriageSectionSpec[];
  /** What is still missing, in words, or null when the task can be thrown. */
  missing: string | null;
  canThrow: boolean;
  throwing: boolean;
  submit: () => void;
  /** Focus the record field — the stage calls this when Task is picked. */
  focusFirstField: () => void;
}

export function useTaskComposerSections({
  onCreated,
  active,
  mode = 'record',
}: {
  /** The thrown task's id (null if the response did not carry one). */
  onCreated: (taskId: number | null) => void;
  /** False while the checklist half is showing — do not steal the caret. */
  active: boolean;
  /**
   * Which record the composer is anchoring to. `ticket` asks for a helpdesk
   * number instead of a scan; everything below it — assignee, deadline,
   * priority, note — is the same handoff either way, which is why the type
   * switch mounts ONE set of sections rather than a second form.
   */
  mode?: ThrowTaskMode;
}): TaskComposerSections {
  const fieldId = useId();
  const composer = useThrowTask({ onThrown: onCreated, mode });
  const {
    raw,
    setRaw,
    resolve,
    targets,
    picked,
    setPicked,
    staff,
    assignees,
    toggleAssignee,
    projectName,
    setProjectName,
    note,
    setNote,
    urgent,
    setUrgent,
    deadline,
    setDeadline,
    throwing,
    canThrow,
    runResolve,
    submit,
  } = composer;

  const scanRef = useRef<HTMLInputElement>(null);

  const focusFirstField = useCallback(() => scanRef.current?.focus(), []);

  useEffect(() => {
    if (active) scanRef.current?.focus();
  }, [active]);

  /**
   * The disabled CTA names what is missing rather than sitting dead — the
   * operator should never have to guess which field is holding it.
   */
  const ticketMode = mode === 'ticket';
  const missing = !picked
    ? ticketMode
      ? 'Find the ticket first'
      : 'Find a record first'
    : assignees.length === 0
      ? 'Pick who it goes to'
      : null;

  const sections: TriageSectionSpec[] = [
    {
      id: 'task-record',
      label: ticketMode ? 'Ticket' : 'Record',
      children: (
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runResolve();
            }}
            className="flex items-end gap-2"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={`${fieldId}-record`}>
                {ticketMode ? 'Ticket number' : 'Scan or paste tracking, PO, order'}
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
                  aria-hidden
                />
                <Input
                  id={`${fieldId}-record`}
                  ref={scanRef}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className={triagePanelControl('pl-7 font-mono')}
                  data-testid="task-composer-record"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="secondary"
              className={triagePanelControl()}
              disabled={!raw.trim() || resolve.status === 'resolving'}
            >
              {resolve.status === 'resolving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                'Find'
              )}
            </Button>
          </form>

          {resolve.status === 'idle' ? (
            <p className="text-role-caption text-text-faint">
              {ticketMode
                ? 'The number on the helpdesk thread — 48120. A leading hash is fine.'
                : 'A task points at a record — an order or a carton.'}
            </p>
          ) : resolve.status === 'resolving' ? (
            <p className="flex items-center gap-2 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Looking that up…
            </p>
          ) : resolve.status === 'refused' ? (
            <p className="flex items-center gap-2 text-role-caption text-text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {resolve.message}
            </p>
          ) : resolve.status === 'error' ? (
            <p className="flex items-center gap-2 text-role-caption text-text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> That lookup failed.
              Try again.
            </p>
          ) : resolve.status === 'denied' ? (
            <p className="flex items-center gap-2 text-role-caption text-text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Your role cannot look
              records up. Ask an admin for inventory view access.
            </p>
          ) : targets.length === 0 ? (
            <p className="text-role-caption text-text-faint">
              Nothing throwable matched “{resolve.raw}”.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="task-composer-targets">
              {targets.map((t) => {
                const active = picked != null && throwTargetKey(picked) === throwTargetKey(t);
                return (
                  <li key={throwTargetKey(t)}>
                    <button
                      type="button"
                      onClick={() => setPicked(t)}
                      className={cn(
                        'ds-raw-button flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors',
                        TRIAGE_PANEL_INNER_CORNER,
                        active
                          ? 'bg-surface-selected'
                          : 'hover:bg-surface-card active:bg-surface-sunken',
                        focusRing('field'),
                      )}
                    >
                      {t.entityType === 'receiving' ? (
                        <Package className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      ) : t.entityType === 'support_ticket' ? (
                        <Ticket className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      ) : (
                        <Inbox className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-role-caption font-semibold text-text-default">
                          {t.label}
                        </span>
                        {t.sublabel ? (
                          <span className="block truncate text-role-micro text-text-soft">
                            {t.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-text-accent" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: 'task-assignment',
      label: 'Assignment',
      children: (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <div className="min-w-48 flex-1 space-y-2">
            <Label>Assign to {assignees.length > 0 ? `· ${assignees.length} selected` : ''}</Label>
            {staff === null ? (
              <p className="text-role-caption text-text-faint">Loading staff…</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto" role="group" aria-label="Task assignees">
                {staff.map((person) => {
                  const selected = assignees.some((member) => member.id === person.id);
                  return (
                    <label key={person.id} className={cn('flex cursor-pointer items-center gap-2 px-2 py-1.5 text-role-caption', TRIAGE_PANEL_INNER_CORNER, selected ? 'bg-surface-selected' : 'hover:bg-surface-card')}>
                      <Checkbox
                        checked={selected}
                        disabled={!selected && assignees.length >= TASK_ASSIGNEES_MAX}
                        onCheckedChange={() => toggleAssignee(person)}
                        aria-label={`Assign ${person.name}`}
                      />
                      <StaffAvatar staffId={person.id} name={person.name} size="sm" colorRing alt="" />
                      <span className="truncate">{person.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-40 flex-1 space-y-2">
            <Label htmlFor={`${fieldId}-deadline`}>Deadline</Label>
            <DateRangePickerField
              variant="compact"
              value={deadline ?? undefined}
              onChange={(next) => setDeadline(next)}
              ariaLabel="Task deadline"
              className={triagePanelControl()}
            />
          </div>

          <div className="min-w-40 flex-1 space-y-2">
            <Label htmlFor={`${fieldId}-urgent`}>Priority</Label>
            <label
              htmlFor={`${fieldId}-urgent`}
              className={cn(
                triagePanelControl('flex items-center gap-2 px-2'),
                'border border-border-soft bg-surface-card',
              )}
            >
              <Switch
                id={`${fieldId}-urgent`}
                checked={urgent}
                onCheckedChange={setUrgent}
                aria-label="Mark urgent"
              />
              <span className="text-role-caption text-text-muted">
                {urgent ? 'Urgent' : 'Normal'}
              </span>
            </label>
          </div>
        </div>
      ),
    },
    {
      id: 'task-details',
      label: 'Details',
      children: (
        <div className="space-y-3">
          <TextField
            label="Project name"
            value={projectName}
            onChange={setProjectName}
            maxLength={TASK_PROJECT_NAME_MAX}
            data-testid="task-composer-project"
          />
          <p className="text-role-caption text-text-faint">Optional. Group shared work under one name, e.g. Return and replacement.</p>
          <Label htmlFor={`${fieldId}-note`}>What do you need them to do?</Label>
          <textarea
            id={`${fieldId}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TASK_NOTE_MAX}
            rows={4}
            className={cn(
              'w-full resize-none border border-border-soft bg-surface-card px-2.5 py-2',
              TRIAGE_PANEL_INNER_CORNER,
              'text-role-data text-text-default placeholder:text-text-faint',
              focusRing('field'),
            )}
            data-testid="task-composer-note"
          />
        </div>
      ),
    },
  ];

  return {
    sections,
    missing,
    canThrow,
    throwing,
    submit: () => void submit(),
    focusFirstField,
  };
}
