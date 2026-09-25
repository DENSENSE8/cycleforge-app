'use client';

import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Check, Loader2, Search } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { useThrowTask, throwTargetKey, type ThrowTaskMode } from '@/hooks/useThrowTask';
import { TASK_ASSIGNEES_MAX, TASK_NOTE_MAX, TASK_PROJECT_NAME_MAX } from '@/lib/tasks/create-task-core';

export function MobileSharedTaskComposerSheet({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (taskId: number | null) => void;
}) {
  const [mode, setMode] = useState<ThrowTaskMode>('record');
  const {
    raw, setRaw, resolve, targets, picked, setPicked, staff, assignees, toggleAssignee,
    projectName, setProjectName, note, setNote, urgent, setUrgent, throwing, canThrow,
    runResolve, submit,
  } = useThrowTask({ mode, onThrown: onCreated });
  const ticketMode = mode === 'ticket';

  return (
    <BottomSheet open onClose={onClose} forceVariant="sheet" compact scrollBody scrollBodyMaxHeightClass="max-h-[75svh]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-1 pb-2 pt-1" data-testid="mobile-shared-task-composer">
        <h2 className="text-role-data font-semibold text-text-default">Shared task</h2>
        <TabSwitch tabs={[{ id: 'record', label: 'Record' }, { id: 'ticket', label: 'Ticket' }]} activeTab={mode} onTabChange={(id) => setMode(id as ThrowTaskMode)} />
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
                <Button key={throwTargetKey(target)} variant={selected ? 'primary' : 'secondary'} size="lg" className="mb-1 w-full justify-start" onClick={() => setPicked(target)}>
                  <span className="min-w-0 flex-1 truncate text-left">{target.label}{target.sublabel ? ` · ${target.sublabel}` : ''}</span>
                  {selected ? <Check aria-hidden className="h-4 w-4" /> : null}
                </Button>
              );
            })}
          </div>
        ) : null}
        <TextField label="Project name" value={projectName} onChange={setProjectName} maxLength={TASK_PROJECT_NAME_MAX} data-testid="mobile-task-project" />
        <p className="text-role-micro text-text-muted">Optional. Group shared work under one name, e.g. Return and replacement.</p>
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
        <TextField label="Instructions (optional)" value={note} onChange={setNote} maxLength={TASK_NOTE_MAX} multiline rows={3} />
        <label className="flex min-h-11 items-center gap-2 text-role-caption text-text-default">
          <Checkbox checked={urgent} onCheckedChange={(value) => setUrgent(value === true)} aria-label="Urgent" /> Urgent
        </label>
        <Button variant="primary" size="lg" className="min-h-12" disabled={!canThrow} onClick={() => void submit()}>
          {throwing ? 'Creating…' : !picked ? 'Find a record first' : !assignees.length ? 'Pick staff' : 'Create shared task'}
        </Button>
      </div>
    </BottomSheet>
  );
}
