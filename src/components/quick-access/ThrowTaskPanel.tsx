'use client';

/**
 * Throw one named record task to a team — scan or paste, pick members, send.
 *
 * ## Why one panel and not a wizard
 *
 * Record, team, project name and instructions stay visible together. A stepped
 * wizard would hide the record while the operator picks people, and hide the
 * team while they write instructions; this panel avoids that extra navigation.
 *
 * ## This file is CHROME
 *
 * The sequence — resolve the record server-side, load the roster, POST the
 * task, report a degraded amplifier honestly — moved to {@link useThrowTask}
 * when the task desk grew a composer that needed the same four steps with a
 * different layout and a deadline. The phone sheet uses that same sequence,
 * so all three surfaces report the actual notification outcome.
 */

import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, Inbox, Loader2, Package, Search, Send, Zap } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { useThrowTask, throwTargetKey } from '@/hooks/useThrowTask';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX } from '@/lib/tasks/create-task-core';
import { Button, Switch, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { QuickAccessPanelShell } from './QuickAccessPanelShell';

interface ThrowTaskPanelProps {
  onClose: () => void;
}

export function ThrowTaskPanel({ onClose }: ThrowTaskPanelProps) {
  const throwTask = useThrowTask({ onThrown: onClose });
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
    throwing,
    canThrow,
    missing,
    runResolve,
    submit,
  } = throwTask;

  const scanRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  return (
    <QuickAccessPanelShell
      title="Throw a task"
      subtitle="Hand a record to a team"
      onClose={onClose}
      widthClass="w-[380px]"
      maxHeightClass="max-h-[560px]"
      toolbar={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runResolve();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
              aria-hidden
            />
            <input
              ref={scanRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Scan or paste tracking, PO, order…"
              aria-label="Record to throw"
              className={cn(
                'w-full rounded-md border border-border-soft bg-surface-card py-1.5 pl-7 pr-2',
                'text-role-caption text-text-default placeholder:text-text-faint',
                focusRing('field'),
              )}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!raw.trim() || resolve.status === 'resolving'}>
            {resolve.status === 'resolving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Find'}
          </Button>
        </form>
      }
      footer={
        <div className="flex items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="Mark urgent" />
            <span className="inline-flex items-center gap-1 text-role-caption text-text-muted">
              <Zap className={cn('h-3.5 w-3.5', urgent ? 'text-amber-600' : 'text-text-faint')} aria-hidden />
              Urgent
            </span>
          </label>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={!canThrow}>
            {throwing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden />
                {missing ?? 'Create'}
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* ── What ─────────────────────────────────────────────────────── */}
        <section className="space-y-1">
          <p className="px-1 text-role-micro uppercase tracking-widest text-text-soft">Record</p>
          {resolve.status === 'idle' ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">
              Scan a carton label, or paste a tracking number, PO or order id.
            </p>
          ) : resolve.status === 'resolving' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Looking that up…
            </p>
          ) : resolve.status === 'error' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> That lookup failed. Try again.
            </p>
          ) : resolve.status === 'refused' ? (
            /* The chord panel only ever resolves in `record` mode, so this is
               unreachable today — it is the branch that keeps the state union
               exhaustive, and it says the server's words rather than a guess. */
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {resolve.message}
            </p>
          ) : resolve.status === 'denied' ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Your role cannot look records up.
              Ask an admin for inventory view access.
            </p>
          ) : targets.length === 0 ? (
            <p className="px-1 py-2 text-role-caption text-text-faint">
              Nothing throwable matched “{resolve.raw}”. A task points at an order or a carton.
            </p>
          ) : (
            <ul className="space-y-1">
              {targets.map((t) => {
                const active = picked != null && throwTargetKey(picked) === throwTargetKey(t);
                return (
                  <li key={throwTargetKey(t)}>
                    <button
                      type="button"
                      onClick={() => setPicked(t)}
                      className={cn(
                        'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        active ? 'bg-blue-50' : 'hover:bg-surface-card active:bg-surface-sunken',
                      )}
                    >
                      {t.entityType === 'receiving' ? (
                        <Package className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      ) : (
                        <Inbox className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-role-caption font-semibold text-text-default">
                          {t.label}
                        </span>
                        {t.sublabel ? (
                          <span className="block truncate text-role-micro text-text-soft">{t.sublabel}</span>
                        ) : null}
                      </span>
                      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Who ──────────────────────────────────────────────────────── */}
        <section className="space-y-1 border-t border-border-hairline pt-2">
          <p className="px-1 text-role-micro uppercase tracking-widest text-text-soft">
            Assign to {assignees.length ? `· ${assignees.length} selected` : ''}
          </p>
          {staff === null ? (
            <p className="flex items-center gap-2 px-1 py-2 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading staff…
            </p>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto" role="group" aria-label="Task assignees">
              {staff.map((person) => {
                const selected = assignees.some((member) => member.id === person.id);
                return (
                  <label key={person.id} className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-role-caption', selected ? 'bg-surface-selected' : 'hover:bg-surface-card')}>
                    <Checkbox checked={selected} disabled={!selected && assignees.length >= TASK_ASSIGNEES_MAX} onCheckedChange={() => toggleAssignee(person)} aria-label={`Assign ${person.name}`} />
                    <StaffAvatar staffId={person.id} name={person.name} size="sm" colorRing alt="" />
                    <span className="truncate">{person.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Why ──────────────────────────────────────────────────────── */}
        <section className="space-y-1 border-t border-border-hairline pt-2">
          <TextField label="Project name" value={projectName} onChange={setProjectName} maxLength={TASK_PROJECT_NAME_MAX} />
          <p className="px-1 text-role-micro text-text-faint">Optional. Group shared work under one name, e.g. Return and replacement.</p>
        </section>
        <section className="space-y-1 border-t border-border-hairline pt-2">
          <label
            htmlFor="throw-task-note"
            className="block px-1 text-role-micro uppercase tracking-widest text-text-soft"
          >
            Note <span className="normal-case tracking-normal text-text-faint">(optional)</span>
          </label>
          <textarea
            id="throw-task-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TASK_NOTE_MAX}
            rows={2}
            placeholder="What do you need them to do?"
            className={cn(
              'w-full resize-none rounded-md border border-border-soft bg-surface-card px-2 py-1.5',
              'text-role-caption text-text-default placeholder:text-text-faint',
              focusRing('field'),
            )}
          />
        </section>
      </div>
    </QuickAccessPanelShell>
  );
}
