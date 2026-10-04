'use client';

/** Phone "New task" — the words first, then who, then (optionally) a record. */

import { useState } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Check, Loader2, Search } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { useThrowTask, throwTargetKey, type ThrowTaskMode } from '@/hooks/useThrowTask';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX } from '@/lib/tasks/create-task-core';

export function MobileSharedTaskComposerSheet({ onClose, onCreated, onAddChecklist }: {
  onClose: () => void;
  onCreated: (taskId: number | null) => void;
  /** Present only for staff who manage the org checklist — the rarer add. */
  onAddChecklist?: () => void;
}) {
  const [mode, setMode] = useState<ThrowTaskMode>('record');
  const [linkOpen, setLinkOpen] = useState(false);
  const {
    raw, setRaw, resolve, targets, picked, setPicked, staff, assignees, toggleAssignee,
    projectName, setProjectName, note, setNote, urgent, setUrgent, throwing, canThrow, missing,
    runResolve, submit,
  } = useThrowTask({ mode, onThrown: onCreated });
  const ticketMode = mode === 'ticket';
  const showLink = ticketMode || linkOpen || picked != null;

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle className="text-role-data">New task</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4 pt-2" data-testid="mobile-task-composer">
        <TextField
          label="What needs doing?"
          value={note}
          onChange={setNote}
          maxLength={TASK_NOTE_MAX}
          multiline
          rows={3}
          autoFocus
          data-testid="mobile-task-note"
        />
        <TextField
          label="Project name · optional"
          value={projectName}
          onChange={setProjectName}
          maxLength={TASK_PROJECT_NAME_MAX}
          data-testid="mobile-task-project"
        />
        <div className="flex flex-col gap-2">
          <p className="text-role-caption font-semibold text-text-default">Assign to · {assignees.length} selected</p>
          <div role="group" aria-label="Task assignees" className="max-h-40 overflow-y-auto">
            {staff === null ? <Loader2 aria-label="Loading staff" className="h-4 w-4 animate-spin" /> : staff.map((person) => {
              const selected = assignees.some((member) => member.id === person.id);
              return (
                <label key={person.id} className="flex min-h-11 items-center gap-3 border-b border-border-hairline px-2 text-role-caption text-text-default">
                  <Checkbox checked={selected} disabled={!selected && assignees.length >= TASK_ASSIGNEES_MAX} onCheckedChange={() => toggleAssignee(person)} aria-label={`Assign ${person.name}`} />
                  {person.name}
                </label>
              );
            })}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-role-caption text-text-default">
          <Checkbox checked={urgent} onCheckedChange={(value) => setUrgent(value === true)} aria-label="Urgent" /> Urgent
        </label>

        {showLink ? (
          <div className="flex flex-col gap-3 border-t border-border-hairline pt-3">
            <TabSwitch tabs={[{ id: 'record', label: 'Order / carton' }, { id: 'ticket', label: 'Ticket' }]} activeTab={mode} onTabChange={(id) => setMode(id as ThrowTaskMode)} />
            <form onSubmit={(event) => { event.preventDefault(); void runResolve(); }} className="flex items-end gap-2">
              <TextField
                label={ticketMode ? 'Ticket number' : 'Scan or paste tracking, PO, order'}
                value={raw}
                onChange={setRaw}
                inputMode={ticketMode ? 'numeric' : undefined}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" size="lg" disabled={!raw.trim() || resolve.status === 'resolving'}>
                <Search aria-hidden className="h-4 w-4" /> Find
              </Button>
            </form>
            {resolve.status === 'resolving' ? <p className="text-role-caption text-text-muted">Looking that up…</p> : null}
            {resolve.status === 'refused' ? <p role="alert" className="text-role-caption text-text-danger">{resolve.message}</p> : null}
            {resolve.status === 'error' ? <p role="alert" className="text-role-caption text-text-danger">That lookup failed. Try again.</p> : null}
            {resolve.status === 'denied' ? <p role="alert" className="text-role-caption text-text-danger">Your role cannot look records up.</p> : null}
            {resolve.status === 'done' && targets.length === 0 ? <p className="text-role-caption text-text-muted">No matching record.</p> : null}
            {targets.length > 0 ? (
              <div role="group" aria-label="Matching records" className="max-h-36 overflow-y-auto">
                {targets.map((target) => {
                  const selected = picked != null && throwTargetKey(target) === throwTargetKey(picked);
                  return (
                    <Button key={throwTargetKey(target)} variant={selected ? 'primary' : 'secondary'} size="lg" className="mb-1 w-full justify-start" onClick={() => setPicked(selected ? null : target)}>
                      <span className="min-w-0 flex-1 truncate text-left">{target.label}{target.sublabel ? ` · ${target.sublabel}` : ''}</span>
                      {selected ? <Check aria-hidden className="h-4 w-4" /> : null}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <Button variant="secondary" size="lg" onClick={() => setLinkOpen(true)}>Link an order, carton or ticket · optional</Button>
        )}

        <Button variant="primary" size="lg" className="min-h-12" disabled={!canThrow} onClick={() => void submit()} data-testid="mobile-task-create">
          {throwing ? 'Creating…' : (missing ?? 'Create task')}
        </Button>
        {onAddChecklist ? (
          <Button variant="ghost" size="lg" onClick={onAddChecklist}>Add a daily checklist item instead</Button>
        ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
