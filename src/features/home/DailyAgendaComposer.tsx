'use client';

/**
 * Add to the Daily agenda — ONE inline stage, with the TYPE picked at the top.
 *
 * Operator 2026-09-22: *"consolidate the tasks into one display just under a
 * type, like type daily checklist and type task."* The display merged, so the
 * create verb merged with it: one CTA, one stage, and a type switch that says
 * which of the two stores the row will land in.
 *
 * ## The grammar is the order-exceptions editor
 *
 * Host `CONTEXT_PANEL_HOST_CLASS`, the agenda queue as a resizable
 * context-panel rail on the left, grouped {@link TriageScrollLayout} sections
 * on the right — the same shape `ExceptionEditor` uses, and the shape the
 * operator asked for by name. The table is unmounted while this is open: one
 * surface answers one question at a time.
 *
 * ## Two stores, one form
 *
 * The TYPE section is first because it changes what every section under it
 * means. Checklist mounts {@link DailyComposerRow} — the checklist composer
 * SoT, shared with the phone's sheet, so its field order, palette and
 * validation cannot drift here. Task mounts
 * {@link useTaskComposerSections}, the same sequence the ⌘⇧U chord runs.
 *
 * ## The CTA is the page's, not the form's
 *
 * While this is open it registers `role="primary"` on the desk action slot,
 * which last-writer-wins over the agenda's own "Add". A desk has ONE primary
 * verb at a time, and a Create button inside the form plus an Add button in
 * the header is two.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { CONTEXT_PANEL_HOST_CLASS } from '@/components/sidebar/context-panel-column';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { IconButton } from '@/design-system/primitives';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { useTaskComposerSections } from '@/features/tasks/useTaskComposerSections';
import { TaskWalkSidebar } from '@/features/tasks/TaskWalkSidebar';
import {
  DAILY_AGENDA_TYPE_LABEL,
  type DailyAgendaType,
} from '@/lib/daily/daily-agenda-row';
import { dailyComposerError, type DailyComposerDraft } from '@/lib/daily-checks/composer';
import { DailyComposerRow } from './DailyComposerRow';

/**
 * `TabSwitch` takes a mutable `Tab[]`, so this is not `readonly`. A shared
 * module-level array is still fine: nothing mutates it.
 *
 * THREE faces, one form. Checklist writes `daily_check_items`; Task and Ticket
 * both write a `FOLLOW_UP` `work_assignments` row and differ only in WHICH
 * record it anchors to — a carton you walk to, or a helpdesk thread you
 * answer. Two bands over one store is the display saying what the work is;
 * two stores would have been the fourth task system this page exists to refuse.
 */
const TYPE_TABS: Array<{ id: DailyAgendaType; label: string }> = [
  { id: 'checklist', label: DAILY_AGENDA_TYPE_LABEL.checklist },
  { id: 'task', label: DAILY_AGENDA_TYPE_LABEL.task },
  { id: 'ticket', label: DAILY_AGENDA_TYPE_LABEL.ticket },
];

/**
 * What the header and the CTA call each face.
 *
 * `Ticket` is the BAND's word. The thing this composer creates is still a
 * TASK, about a ticket — a button reading "Create ticket" would promise a
 * helpdesk thread that `POST /api/tasks` never files.
 */
const TYPE_NOUN: Readonly<Record<DailyAgendaType, string>> = {
  checklist: 'daily checklist item',
  task: 'task',
  ticket: 'ticket task',
};

function isDailyAgendaType(id: string): id is DailyAgendaType {
  return id in DAILY_AGENDA_TYPE_LABEL;
}

export function DailyAgendaComposer({
  queue,
  onExit,
  onCreated,
  canAddChecklist,
  checklistDraft,
  onChecklistDraftChange,
  onChecklistSubmit,
  checklistPending,
  checklistError,
}: {
  /** The agenda — the walk rail, exactly as the exceptions editor mounts its queue. */
  queue: ReactNode;
  /** Leave the composer: the ✕ and Escape both land here. */
  onExit: () => void;
  /** A row landed — the agenda refetches, leaves the composer and opens the new task. */
  onCreated: (taskId: number | null) => void;
  /**
   * The checklist LIST is org-managed, so adding to it is gated on
   * `admin.manage_staff`. Without it the type switch offers Task only — an
   * absent option, never a disabled one.
   */
  canAddChecklist: boolean;
  checklistDraft: DailyComposerDraft;
  onChecklistDraftChange: (next: DailyComposerDraft) => void;
  onChecklistSubmit: () => void;
  checklistPending: boolean;
  checklistError: string | null;
}) {
  const [type, setType] = useState<DailyAgendaType>(canAddChecklist ? 'checklist' : 'task');

  /**
   * Task and Ticket are the WORK faces — one store, one form, one CTA. Only
   * the checklist face is gated, so a staffer without `admin.manage_staff`
   * still gets both of them rather than being pinned to Task.
   */
  const isWork = type !== 'checklist';
  const tabs = canAddChecklist ? TYPE_TABS : TYPE_TABS.filter((tab) => tab.id !== 'checklist');

  const task = useTaskComposerSections({
    onCreated,
    active: isWork,
    mode: type === 'ticket' ? 'ticket' : 'record',
  });

  // Escape leaves the composer, but first it leaves the FIELD — an operator
  // mid-note pressing Escape means "stop editing this", not "throw my draft
  // away". Same ladder the exceptions editor uses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.blur();
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const checklistBlocked = dailyComposerError(checklistDraft);

  const submit = useCallback(() => {
    if (isWork) {
      task.submit();
      return;
    }
    if (checklistBlocked) return;
    onChecklistSubmit();
  }, [checklistBlocked, isWork, onChecklistSubmit, task]);

  /**
   * One CTA, and it names what is missing rather than sitting dead — the
   * operator should never have to guess which field is holding it.
   */
  const ctaLabel = isWork
    ? task.throwing
      ? 'Creating…'
      : (task.missing ?? `Create ${TYPE_NOUN[type]}`)
    : checklistPending
      ? 'Adding…'
      : (checklistBlocked ?? 'Add checklist item');
  const ctaDisabled = isWork ? !task.canThrow : checklistPending || checklistBlocked != null;

  const typeSection = {
    id: 'agenda-type',
    label: 'Type',
    children: (
      <div className="space-y-2">
        <TabSwitch
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
          activeTab={type}
          onTabChange={(id) => {
            if (isDailyAgendaType(id)) setType(id);
          }}
        />
        {canAddChecklist ? null : (
          <p className="text-role-caption text-text-faint" data-testid="agenda-type-locked">
            The {DAILY_AGENDA_TYPE_LABEL.checklist.toLowerCase()} is org-managed, and your role
            does not manage it.
          </p>
        )}
      </div>
    ),
  };

  return (
    <div className={CONTEXT_PANEL_HOST_CLASS} data-testid="agenda-composer">
      <DeskActionSlotRegistrar role="primary">
        <DeskHeaderAction
          type="button"
          variant="primary"
          size="sm"
          disabled={ctaDisabled}
          onClick={submit}
          data-testid="agenda-composer-create"
        >
          {ctaLabel}
        </DeskHeaderAction>
      </DeskActionSlotRegistrar>
      <TaskWalkSidebar>{queue}</TaskWalkSidebar>
      <TriageScrollLayout
        className="min-h-0 min-w-0 flex-1"
        data-testid="agenda-composer-form"
        header={
          <div className="flex flex-wrap items-center gap-2 border-b border-border-hairline bg-surface-card px-4 py-1.5">
            <p className="min-w-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
              New {TYPE_NOUN[type]}
            </p>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
              <IconButton
                type="button"
                size="sm"
                ariaLabel="Close the composer"
                onClick={onExit}
                data-testid="agenda-composer-close"
                icon={<X className="h-3.5 w-3.5" aria-hidden />}
              />
            </span>
          </div>
        }
        sections={
          isWork
            ? [typeSection, ...task.sections]
            : [
                typeSection,
                {
                  id: 'checklist-item',
                  label: DAILY_AGENDA_TYPE_LABEL.checklist,
                  children: (
                    <DailyComposerRow
                      draft={checklistDraft}
                      onDraftChange={onChecklistDraftChange}
                      onSubmit={onChecklistSubmit}
                      pending={checklistPending}
                      error={checklistError}
                    />
                  ),
                },
              ]
        }
      />
    </div>
  );
}
