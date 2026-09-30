'use client';

/**
 * New task (`N`) — hand work to one or more teammates in one breath.
 *
 *   [ Task | Ticket follow-up | Checklist ]
 *   What needs doing…                         (first line = the headline)
 *   Ticket #48120 / Order, tracking, carton   (resolves on Enter)
 *   Who   (Me)(Ana)(+)                         first picked leads
 *   Project ▾   Due  Today · Tomorrow · Next week   Urgent
 *                                              ⌘↵ Create task
 *
 * Headless logic is `useThrowTask` (the one task writer, idempotent); the
 * checklist face writes through `useItemActions` and is offered only to a
 * checklist manager.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, ListTodo, Search, Ticket, X } from 'lucide-react';
import { Zap } from '@/components/Icons';
import { ChordKeys, chordKeys } from '@/design-system/primitives';
import { motion } from '@/design-system/motion';
import { useRegisterOverlay } from '@/design-system/hooks/useOverlayStack';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { throwTargetKey, useThrowTask, type ThrowTaskMode } from '@/hooks/useThrowTask';
import { useItemActions } from '@/lib/daily-checks/use-daily-checks';
import { addDaysToDateKey, getCurrentPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { PersonDot } from './task-board-atoms';

type NewTaskKind = 'task' | 'ticket' | 'checklist';

const KINDS: readonly { id: NewTaskKind; label: string; icon: typeof ListTodo }[] = [
  { id: 'task', label: 'Task', icon: ListTodo },
  { id: 'ticket', label: 'Ticket follow-up', icon: Ticket },
  { id: 'checklist', label: 'Checklist', icon: ListChecks },
];

export function NewTaskSheet({
  open,
  onClose,
  onCreated,
  projects,
  canAddChecklist,
  defaultProject,
  initialNote,
}: {
  open: boolean;
  onClose: () => void;
  /** The created task (null for a checklist item) and whether it lands in the viewer's own scope. */
  onCreated: (taskId: number | null, mine: boolean) => void;
  /** Existing project names — the Project field's suggestions. */
  projects: readonly string[];
  canAddChecklist: boolean;
  defaultProject: string | null;
  /** Prefilled headline — ⌘K's New task "<query>" carries what was typed. */
  initialNote?: string;
}) {
  // Claim the overlay stack so the board's bare keys stand down while it is open.
  useRegisterOverlay(open);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        data-testid="task-new-sheet"
        className="top-[12vh] max-w-[640px] translate-y-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">New task</DialogTitle>
        {open ? (
          <NewTaskSurface
            onClose={onClose}
            onCreated={onCreated}
            projects={projects}
            canAddChecklist={canAddChecklist}
            defaultProject={defaultProject}
            initialNote={initialNote}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewTaskSurface({
  onClose,
  onCreated,
  projects,
  canAddChecklist,
  defaultProject,
  initialNote,
}: {
  onClose: () => void;
  onCreated: (taskId: number | null, mine: boolean) => void;
  projects: readonly string[];
  canAddChecklist: boolean;
  defaultProject: string | null;
  initialNote?: string;
}) {
  const [kind, setKind] = useState<NewTaskKind>('task');
  const mode: ThrowTaskMode = kind === 'ticket' ? 'ticket' : 'record';
  const draft = useThrowTask({ mode, onThrown: onCreated, initialNote });
  const { addItem } = useItemActions(getCurrentPSTDateKey());
  const [recurring, setRecurring] = useState(true);
  const [findPeople, setFindPeople] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { setProjectName } = draft;

  useEffect(() => {
    if (defaultProject) setProjectName(defaultProject);
  }, [defaultProject, setProjectName]);
  useEffect(() => {
    const field = noteRef.current;
    if (!field) return;
    field.focus();
    // A prefilled headline keeps typing at its end, never before it.
    field.setSelectionRange(field.value.length, field.value.length);
  }, [kind]);

  const kinds = canAddChecklist ? KINDS : KINDS.filter((k) => k.id !== 'checklist');
  const checklistTitle = draft.note.trim().split('\n')[0] ?? '';
  const ready = kind === 'checklist' ? checklistTitle.length > 0 && !addItem.isPending : draft.canThrow;
  const missing = kind === 'checklist' ? (checklistTitle ? null : 'Name the checklist item') : draft.missing;

  const submit = useCallback(() => {
    if (!ready) return;
    if (kind === 'checklist') {
      const [, ...rest] = draft.note.trim().split('\n');
      const description = rest.join('\n').trim();
      addItem.mutate(
        { title: checklistTitle, description: description || null, kind: recurring ? 'recurring' : 'once', glyph: null },
        { onSuccess: () => onCreated(null, true) },
      );
      return;
    }
    void draft.submit();
  }, [addItem, checklistTitle, draft, kind, onCreated, ready, recurring]);

  const people = useMemo(() => {
    const q = findPeople.trim().toLowerCase();
    return (draft.staff ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [draft.staff, findPeople]);

  const today = getCurrentPSTDateKey();
  const dueOptions = [
    { label: 'Today', key: today },
    { label: 'Tomorrow', key: addDaysToDateKey(today, 1) },
    { label: 'Next week', key: addDaysToDateKey(today, 7) },
  ];
  const dueKey = draft.deadline ? dueOptions.find((o) => warehouseCivilTimeToInstant(o.key, '17:00')?.getTime() === draft.deadline?.getTime())?.key : null;

  return (
    <motion.div
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="relative flex w-full flex-col overflow-hidden rounded-[28px] border border-border-hairline bg-surface-card shadow-[0_40px_120px_-30px_rgba(15,23,42,0.55)]"
    >
        {/* Kind */}
        <div className="flex items-center gap-2 px-5 pt-4">
          <div className="relative inline-flex rounded-full bg-surface-sunken p-1">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  'relative z-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  kind === k.id ? 'text-text-default' : 'text-text-muted hover:text-text-default',
                )}
              >
                {kind === k.id ? (
                  <motion.span
                    layoutId="new-task-kind"
                    className="absolute inset-0 -z-10 rounded-full bg-surface-card shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                ) : null}
                <k.icon className="size-3.5" />
                {k.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* What */}
        <textarea
          ref={noteRef}
          value={draft.note}
          onChange={(event) => draft.setNote(event.target.value)}
          rows={3}
          placeholder={
            kind === 'ticket'
              ? 'What should happen on this ticket?'
              : kind === 'checklist'
                ? 'Checklist item — first line is its name'
                : 'What needs doing? First line is the headline; details below.'
          }
          className="mx-5 mt-4 resize-none bg-transparent text-[17px] font-medium leading-6 text-text-default outline-none placeholder:font-normal placeholder:text-text-muted"
        />

        {kind !== 'checklist' ? (
          <div className="mx-5 mt-3 flex flex-col gap-2">
            {/* Record / ticket anchor */}
            <div className="flex items-center gap-2 rounded-2xl bg-surface-sunken px-3 py-2">
              {kind === 'ticket' ? <Ticket className="size-4 text-text-muted" /> : <Search className="size-4 text-text-muted" />}
              <input
                value={draft.raw}
                onChange={(event) => draft.setRaw(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    void draft.runResolve();
                  }
                }}
                onBlur={() => {
                  if (draft.raw.trim() && draft.resolve.status === 'idle') void draft.runResolve();
                }}
                placeholder={kind === 'ticket' ? 'Ticket number — 48120' : 'About a record? Order #, tracking, carton (optional)'}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
              />
              {draft.resolve.status === 'resolving' ? <span className="text-xs text-text-muted">Finding…</span> : null}
            </div>
            {draft.resolve.status === 'refused' ? (
              <p className="px-1 text-xs text-text-danger">{draft.resolve.message}</p>
            ) : draft.resolve.status === 'error' ? (
              <p className="px-1 text-xs text-text-danger">Could not look that up.</p>
            ) : draft.resolve.status === 'denied' ? (
              <p className="px-1 text-xs text-text-danger">You cannot look up records here.</p>
            ) : null}
            {draft.targets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {draft.targets.map((target) => {
                  const picked = draft.picked && throwTargetKey(draft.picked) === throwTargetKey(target);
                  return (
                    <button
                      key={throwTargetKey(target)}
                      type="button"
                      onClick={() => draft.setPicked(picked ? null : target)}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        picked ? 'bg-surface-inverse text-text-inverse' : 'bg-surface-sunken text-text-default hover:bg-surface-hover',
                      )}
                    >
                      <span className="truncate">{target.label}</span>
                      {target.sublabel ? <span className="truncate opacity-60">{target.sublabel}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Who */}
        {kind !== 'checklist' ? (
          <div className="mx-5 mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-muted">Who</span>
              <input
                value={findPeople}
                onChange={(event) => setFindPeople(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && people[0]) {
                    event.preventDefault();
                    draft.toggleAssignee(people[0]);
                    setFindPeople('');
                  }
                }}
                placeholder="Find a teammate"
                className="ml-auto w-40 rounded-full bg-surface-sunken px-3 py-1 text-xs outline-none placeholder:text-text-muted"
              />
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {draft.staff == null ? (
                <span className="text-xs text-text-muted">Loading the team…</span>
              ) : (
                people.map((person) => {
                  const index = draft.assignees.findIndex((a) => a.id === person.id);
                  const on = index >= 0;
                  return (
                    <motion.button
                      key={person.id}
                      type="button"
                      layout
                      whileTap={{ scale: 0.95 }}
                      onClick={() => draft.toggleAssignee(person)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition-colors',
                        on ? 'bg-surface-inverse text-text-inverse' : 'bg-surface-sunken text-text-default hover:bg-surface-hover',
                      )}
                    >
                      <PersonDot person={person} />
                      {person.name}
                      {index === 0 && draft.assignees.length > 1 ? <span className="text-[10px] opacity-60">lead</span> : null}
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Project · due · urgency — or cadence for a checklist item */}
        <div className="mx-5 mt-4 flex flex-wrap items-center gap-2">
          {kind === 'checklist' ? (
            <div className="inline-flex rounded-full bg-surface-sunken p-0.5 text-xs font-semibold">
              {[
                { on: true, label: 'Every day' },
                { on: false, label: 'Today only' },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setRecurring(option.on)}
                  className={cn(
                    'rounded-full px-3 py-1 transition-all',
                    recurring === option.on ? 'bg-surface-card text-text-default shadow-sm' : 'text-text-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <input
                list="task-board-projects"
                value={draft.projectName}
                onChange={(event) => draft.setProjectName(event.target.value)}
                placeholder="Project"
                className="h-8 w-40 rounded-full bg-surface-sunken px-3 text-xs outline-none placeholder:text-text-muted"
              />
              <datalist id="task-board-projects">
                {projects.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <div className="inline-flex rounded-full bg-surface-sunken p-0.5 text-xs font-semibold">
                {dueOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() =>
                      draft.setDeadline(dueKey === option.key ? null : warehouseCivilTimeToInstant(option.key, '17:00'))
                    }
                    className={cn(
                      'rounded-full px-3 py-1 transition-all',
                      dueKey === option.key ? 'bg-surface-card text-text-default shadow-sm' : 'text-text-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => draft.setUrgent(!draft.urgent)}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors',
                  draft.urgent ? 'bg-surface-card text-text-default ring-1 ring-inset ring-border-soft shadow-sm' : 'bg-surface-sunken text-text-muted hover:text-text-default',
                )}
              >
                <Zap className={cn('size-3.5', draft.urgent ? 'text-text-warning' : 'text-text-muted')} />
                Urgent
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center gap-3 border-t border-border-hairline bg-surface-sunken/50 px-5 py-3">
          <span className="text-xs text-text-muted">{missing ?? (kind === 'checklist' ? 'Adds to everyone’s list' : `${draft.assignees.length} ${draft.assignees.length === 1 ? 'person' : 'people'}`)}</span>
          <button
            type="button"
            disabled={!ready}
            onClick={submit}
            data-testid="task-new-submit"
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-surface-inverse px-4 text-sm font-semibold text-text-inverse transition-opacity disabled:opacity-40"
          >
            {draft.throwing || addItem.isPending ? 'Sending…' : kind === 'checklist' ? 'Add to checklist' : 'Create task'}
            <ChordKeys keys={chordKeys('Cmd + Enter')} tone="inverse" />
          </button>
        </div>
    </motion.div>
  );
}
