'use client';

/**
 * The Tasks board's open record — placed by the board's `DeskRecordPlane`
 * (in place over the list, or split beside it). Owner 2026-10-03: the record
 * is the phone sheet's grammar on a desk — mobile first, no field labels, say
 * each fact once, and only the chrome that acts on what is on screen.
 *
 *   Overview  — EVERYTHING in one scroll, newest first, no labels: media,
 *               WHEN (due · priority), WHO·WHERE (project · people · from),
 *               the Brief (minus the title line), the ticket's newest
 *               messages, the documents, the newest events, the links. Each
 *               preview ends in a blue door to its tab.
 *   Ticket    — the support ticket: `SupportTicketDetail` (thread + composer)
 *   Docs      — long documents (`TaskDocsTab`); not offered on a support
 *               follow-up unless it already has one
 *   Timeline  — the Log head and the full stream (`TaskRailTimeline`)
 *   Media     — videos and photos (`TaskRailMedia`)
 *   Links     — every record the task names, and the emails it cites
 *
 * Header verbs (`TaskRecordActions`): Done · Status (S) · Alert · Reply — Reply
 * only while the composer is NOT on screen (the Ticket tab has its own).
 * `[` / `]` step the tabs; the plane owns Esc and ⌘/Ctrl+Shift+S.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, ChevronDown, Link2, Mail, MessageSquareReply, Package, Plus, RotateCcw, Ticket, Truck, Wrench, X, type LucideIcon } from 'lucide-react';
import { Zap } from '@/components/Icons';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { Collapse } from '@/design-system/components/Collapse';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { useActiveStaffDirectory } from '@/components/sidebar/hooks';
import { TaskBriefSection } from '@/features/tasks/workspace/TaskBriefSection';
import { TaskDocsTab } from '@/features/tasks/workspace/TaskDocsTab';
import { useTaskLinks } from '@/lib/tasks/use-task-workspace';
import { useTaskEmailRefs } from '@/lib/tasks/use-task-email-refs';
import { emailRefNumberFace, emailRefNumberPatch } from '@/lib/tasks/task-email-refs';
import { mailboxFace, type TaskEmailRef, type TaskEmailRefPatchBody } from '@/lib/tasks/task-email-refs-shared';
import { taskLinkRepairHref, type TaskLink, type TaskLinkCreateBody, type TaskLinkKind } from '@/lib/tasks/task-links-shared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives/DropdownMenu';
import type { TaskDeskPatch } from '@/features/tasks/useTaskDesk';
import { taskBriefBody, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { useTaskStatusCommit } from '@/lib/tasks/use-task-status-commit';
import { TASK_STATUS_FACE } from '@/design-system/tokens/task-status';
import { TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import { TASK_BOARD_TYPE_FACE, taskBoardRowType, type TaskBoardRow } from '@/lib/task-board/task-board-model';
import { Button } from '@/design-system/primitives/Button';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { TASK_DUE_PRESETS, taskDueDay, taskDueInstantIso } from '@/lib/tasks/task-due';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { DueChip, PersonDot } from './task-board-atoms';
import { TaskAlertButton } from './TaskAlertButton';
import { TaskOverviewMedia } from './TaskOverviewMedia';
import { TaskRailMedia } from './TaskRailMedia';
import { TaskRailTimeline } from './TaskRailTimeline';
import { OVERVIEW_SECTION, TaskDocsPreview, TaskTicketPreview, TaskTimelinePreview } from './TaskOverviewSections';
import { TaskStatusCombobox } from './TaskStatusPicker';

export const RECORD_TABS = ['overview', 'ticket', 'docs', 'timeline', 'media', 'links'] as const;
export type RecordTab = (typeof RECORD_TABS)[number];

const RECORD_TAB_LABEL: Readonly<Record<RecordTab, string>> = {
  overview: 'Overview',
  ticket: 'Ticket',
  docs: 'Docs',
  timeline: 'Timeline',
  media: 'Media',
  links: 'Links',
};

/** Tabs that need a real task (a checklist item has none). */
const TASK_ONLY_TABS: Readonly<Partial<Record<RecordTab, true>>> = { docs: true, timeline: true, media: true, links: true };

/**
 * The tabs this row can show, in order — `[` / `]` walk exactly these. The ticket thread is always one tab
 * away (owner 2026-09-30); only a checklist item (no task to link from) omits it. Docs follow the work
 * (owner 2026-10-03: "removing docs for support"): a support follow-up answers a customer, it does not
 * carry plan documents — the tab shows there only when one is already attached.
 */
export function recordTabsFor(row: TaskBoardRow, task: TaskDeskRow | null): RecordTab[] {
  const support = taskBoardRowType(row) === 'ticket';
  return RECORD_TABS.filter((t) => {
    if (TASK_ONLY_TABS[t] && task == null) return false;
    if (t === 'ticket') return task != null;
    if (t === 'docs') return !support || row.docCount > 0;
    return true;
  });
}

/** Marks the header's Status verb — the `S` picker anchors to it while a record is open. */
export const TASK_RECORD_STATUS_ANCHOR_ATTR = 'data-task-record-status';

/** The record header's verbs, top right: Done · Status (S) · Alert · Reply. */
export function TaskRecordActions({
  row,
  task,
  tab,
  onToggle,
  onStatus,
  onReply,
  canAlert,
  alertOpen,
  onAlertOpenChange,
}: {
  row: TaskBoardRow;
  task: TaskDeskRow | null;
  /** The record's open tab — Reply hides on the Ticket tab, whose composer is already on screen. */
  tab: RecordTab;
  onToggle: () => void;
  onStatus: (anchor: HTMLElement) => void;
  onReply: () => void;
  /** Alert shows only under Everyone — the same rule as the row verb and `A`. */
  canAlert: boolean;
  alertOpen: boolean;
  onAlertOpenChange: (open: boolean) => void;
}) {
  const canceled = row.status === 'CANCELED';
  // P2 — verbs repeated beside content are tonal (light tint, dark ink): Done is `successSoft`,
  // Reply `warningSoft` (the ticket's orange family). No filled verb in this header.
  return (
    <>
      <DeskHeaderAction
        size="sm"
        variant={row.done ? 'secondary' : 'successSoft'}
        icon={row.done ? <RotateCcw /> : <Check />}
        label={row.done ? 'Reopen' : 'Done'}
        shortcut="D"
        disabled={canceled}
        onClick={onToggle}
        data-testid="task-record-done"
      />
      {task ? (
        <StatusVerb task={task} onStatus={onStatus} />
      ) : null}
      {task && canAlert ? (
        <TaskAlertButton
          taskId={task.id}
          ownerIds={row.people.map((person) => person.id)}
          ticketNumber={row.ticket?.number ?? null}
          variant="header"
          open={alertOpen}
          onOpenChange={onAlertOpenChange}
        />
      ) : null}
      {row.ticket && tab !== 'ticket' ? (
        <DeskHeaderAction size="sm" variant="warningSoft" icon={<MessageSquareReply />} label="Reply" ariaLabel="Reply on the ticket" onClick={onReply} />
      ) : null}
    </>
  );
}

function StatusVerb({ task, onStatus }: { task: TaskDeskRow; onStatus: (anchor: HTMLElement) => void }) {
  const face = TASK_STATUS_FACE[taskStatusOf(task)];
  const Icon = face.icon;
  return (
    <DeskHeaderAction
      size="sm"
      variant="secondary"
      icon={<Icon className={face.ink} />}
      label={face.label}
      shortcut="S"
      ariaLabel={`Status: ${face.label}`}
      onClick={(event) => onStatus(event.currentTarget)}
      {...{ [TASK_RECORD_STATUS_ANCHOR_ATTR]: '' }}
    />
  );
}

/** The record's body: one row of tabs, then the active tab. */
export function TaskRecordBody({
  row,
  task,
  tab,
  onTab,
  nowMs,
  onPatch,
  briefReaderOpen,
  onBriefReaderOpenChange,
}: {
  row: TaskBoardRow;
  /** The full task, when the row is one (a checklist item has none). */
  task: TaskDeskRow | null;
  tab: RecordTab;
  onTab: (tab: RecordTab) => void;
  nowMs: number;
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
  briefReaderOpen: boolean;
  onBriefReaderOpenChange: (open: boolean) => void;
}) {
  const tabs = recordTabsFor(row, task);
  const active = tabs.includes(tab) ? tab : 'overview';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="task-record">
      <div className="shrink-0 px-4 pb-2 pt-3">
        {/* The house TabSwitch at its full-height face (pill track, soft blue selected face — owner 2026-10-03). */}
        <TabSwitch
          scrollable
          tabs={tabs.map((t) => ({ id: t, label: RECORD_TAB_LABEL[t] }))}
          activeTab={active}
          onTabChange={(id) => onTab(id as RecordTab)}
        />
      </div>

      {active === 'ticket' && task ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {row.ticket?.number != null ? (
            <SupportTicketDetail ticketId={row.ticket.number} embedded />
          ) : (
            <TicketLinkPanel taskId={task.id} />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 @lg:px-5">
          {active === 'overview' ? (
            <OverviewTab
              row={row}
              task={task}
              tabs={tabs}
              nowMs={nowMs}
              onPatch={onPatch}
              onTab={onTab}
              briefReaderOpen={briefReaderOpen}
              onBriefReaderOpenChange={onBriefReaderOpenChange}
            />
          ) : active === 'docs' && task ? (
            <TaskDocsTab task={task} title={row.title} />
          ) : active === 'timeline' && task ? (
            <TaskRailTimeline
              taskId={task.id}
              ticketNumber={row.ticket?.number ?? null}
              nextFollowUpMs={task.nextFollowUpAtMs}
              nowMs={nowMs}
              onPatch={onPatch}
            />
          ) : active === 'media' && task ? (
            <TaskRailMedia taskId={task.id} />
          ) : active === 'links' && task ? (
            <LinksTab taskId={task.id} />
          ) : null}
        </div>
      )}
      {task ? <RecordStatusFooter task={task} onPatch={onPatch} /> : null}
    </div>
  );
}

/**
 * The status, bottom-left, on EVERY tab (owner 2026-09-30). Same commit path as
 * the Overview row (`useTaskStatusCommit`); the pill opens the status combobox.
 */
function RecordStatusFooter({ task, onPatch }: { task: TaskDeskRow; onPatch: (patch: TaskDeskPatch) => Promise<unknown> }) {
  const { current, setStatus } = useTaskStatusCommit(task, onPatch);
  return (
    <footer className="flex h-9 shrink-0 items-center border-t border-border-hairline px-4" data-testid="task-status-footer">
      <TaskStatusCombobox current={current} onPick={setStatus} />
    </footer>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

/**
 * The Overview reads as ONE phone-width column, centred in a wide record (mobile first, then the desk
 * enhances — never a stretched phone layout: NN/g content dispersion). Media and text keep a reading measure.
 */
const OVERVIEW_COLUMN = 'mx-auto flex w-full max-w-2xl flex-col';

/**
 * Everything about the task in ONE scroll, phone grammar (owner 2026-10-03): no label column — each row
 * leads with its value and glyph, sections split by a hairline, names only in `aria-label`. Status is not
 * repeated here (the header verb and the footer hold it; the quick slider lives in the status drop-down).
 * Each preview ends in a blue door to its tab, where the detail lives.
 */
function OverviewTab({
  row,
  task,
  tabs,
  nowMs,
  onPatch,
  onTab,
  briefReaderOpen,
  onBriefReaderOpenChange,
}: {
  row: TaskBoardRow;
  task: TaskDeskRow | null;
  /** The tabs this record offers — a preview only links to a tab that exists. */
  tabs: readonly RecordTab[];
  nowMs: number;
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
  onTab: (tab: RecordTab) => void;
  briefReaderOpen: boolean;
  onBriefReaderOpenChange: (open: boolean) => void;
}) {
  if (!task) {
    // A checklist item: the shift owes it; its words and schedule are org-managed.
    return (
      <div className={OVERVIEW_COLUMN}>
        <section aria-label="When" className={cn(OVERVIEW_SECTION, 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]')}>
          <DueChip dueMs={row.dueMs} nowMs={nowMs} done={row.done} />
          <span className="text-text-default">{row.cadence === 'recurring' ? 'Every day' : 'Today only'}</span>
          {row.team ? (
            <span className="tabular-nums text-text-muted">
              {row.team.done} of {row.team.total} done
            </span>
          ) : null}
        </section>
        {row.people[0] ? (
          <section aria-label="Owner" className={cn(OVERVIEW_SECTION, 'flex items-center gap-2 text-[13px]')}>
            <PersonDot person={row.people[0]} /> <StaffBadge staffId={row.people[0].id} name={row.people[0].name} />
          </section>
        ) : null}
        {row.detail ? (
          <section aria-label="Notes" className={OVERVIEW_SECTION}>
            <p className="whitespace-pre-wrap text-[13px] text-text-default">{row.detail}</p>
          </section>
        ) : null}
      </div>
    );
  }

  const ticketNumber = row.ticket?.number ?? null;
  return (
    <div className={OVERVIEW_COLUMN}>
      {/* Media first (owner 2026-09-30); mounted only when the row counts some, so a bare task never fetches. */}
      {task.videoCount + task.photoCount > 0 ? (
        <div className={OVERVIEW_SECTION}>
          <TaskOverviewMedia key={task.id} taskId={task.id} expectVideo={task.videoCount > 0} onOpenMedia={() => onTab('media')} />
        </div>
      ) : null}
      {/* WHEN: the due day far left (its urgency chip beside it), priority at the right. */}
      <section aria-label="When" className={cn(OVERVIEW_SECTION, 'flex flex-wrap items-center gap-2')}>
        <DueEditor dueMs={task.deadlineAtMs} done={row.done} nowMs={nowMs} onPatch={onPatch} />
        <PriorityToggle row={row} onPatch={onPatch} />
      </section>
      {/* WHO · WHERE: the project (its glyph is the label), the people, who handed it over. */}
      <section aria-label="Who and where" className={cn(OVERVIEW_SECTION, 'flex flex-wrap items-start gap-x-4 gap-y-2')}>
        <ProjectField key={`project:${task.id}`} task={task} onPatch={onPatch} />
        <PeopleEditor task={task} onPatch={onPatch} />
        {task.assignedBy ? (
          <span className="flex h-8 items-center gap-1.5 text-[12px] text-text-muted">
            from
            <StaffBadge staffId={task.assignedBy.id} name={task.assignedBy.name.split(' ')[0]} className="font-semibold" />
            <span>· {new Date(task.assignedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </span>
        ) : null}
      </section>
      {/* The brief never restates the title (one fact, one place) — `taskBriefBody` drops that line; Edit opens it all. */}
      <div className={OVERVIEW_SECTION}>
        <TaskBriefSection
          key={`note:${task.id}`}
          bare
          title={row.title}
          note={task.note ?? ''}
          shown={taskBriefBody(task)}
          onSave={(next) => onPatch({ note: next })}
          readerOpen={briefReaderOpen}
          onReaderOpenChange={onBriefReaderOpenChange}
        />
      </div>
      {ticketNumber != null ? (
        <TaskTicketPreview ticketNumber={ticketNumber} status={row.ticket?.status ?? null} nowMs={nowMs} onOpen={() => onTab('ticket')} />
      ) : null}
      {tabs.includes('docs') ? <TaskDocsPreview taskId={task.id} onOpen={() => onTab('docs')} /> : null}
      <TaskTimelinePreview taskId={task.id} nowMs={nowMs} onOpen={() => onTab('timeline')} />
      <LinkedList row={row} taskId={task.id} ticketPreviewed={ticketNumber != null} onOpenTicket={() => onTab('ticket')} />
    </div>
  );
}

/** Priority as one tappable pill: the bolt and the word ARE the label. */
function PriorityToggle({ row, onPatch }: { row: TaskBoardRow; onPatch: (patch: TaskDeskPatch) => Promise<unknown> }) {
  return (
    <button
      type="button"
      aria-label={`Priority: ${row.urgent ? 'Urgent' : 'Normal'}. Toggle`}
      onClick={() => void onPatch({ priority: row.urgent ? TASK_PRIORITY.normal : TASK_PRIORITY.urgent })}
      className={cn(
        'ml-auto inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors',
        row.urgent ? 'bg-surface-card text-text-default ring-1 ring-inset ring-border-soft shadow-sm' : 'bg-surface-sunken text-text-muted hover:text-text-default',
      )}
      data-testid="task-priority-toggle"
    >
      <Zap className={cn('size-3.5', row.urgent ? 'text-text-warning' : 'text-text-muted')} />
      {row.urgent ? 'Urgent' : 'Normal'}
    </button>
  );
}

/** The project, value-led: its glyph in the project ink, then the name (edit in place); "Add to a project" when none. */
function ProjectField({ task, onPatch }: { task: TaskDeskRow; onPatch: (patch: TaskDeskPatch) => Promise<unknown> }) {
  const face = TASK_BOARD_TYPE_FACE.project;
  const Icon = face.icon;
  return (
    <span className="flex h-8 min-w-[10rem] max-w-[18rem] items-center gap-1.5">
      <Icon aria-hidden className={cn('size-3.5 shrink-0', face.ink)} strokeWidth={2.25} />
      <InlineText
        value={task.projectName ?? ''}
        placeholder="Add to a project"
        ariaLabel="Project"
        onCommit={(value) => onPatch({ projectName: value || null })}
        className={cn('mx-0 font-semibold', face.text)}
      />
    </span>
  );
}

/** Text that saves on blur (or Enter); Esc reverts. */
function InlineText({
  value,
  placeholder,
  onCommit,
  ariaLabel,
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => Promise<unknown>;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    void onCommit(next).catch(() => setDraft(value));
  };
  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onBlur={commit}
      className={cn(
        'w-full rounded-xl border border-transparent bg-transparent px-2 py-1 -mx-2 text-[13px] text-text-default outline-none transition-colors placeholder:text-text-muted hover:bg-surface-hover focus:border-border-soft focus:bg-surface-card',
        className,
      )}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        } else if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function PeopleEditor({ task, onPatch }: { task: TaskDeskRow; onPatch: (patch: TaskDeskPatch) => Promise<unknown> }) {
  const directory = useActiveStaffDirectory();
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState('');
  const members = task.assignees.length > 0 ? task.assignees : task.assignee ? [task.assignee] : [];
  const memberIds = members.map((m) => m.id);
  const candidates = useMemo(() => {
    const q = find.trim().toLowerCase();
    return directory
      .filter((s) => !memberIds.includes(s.id) && (!q || s.name.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [directory, find, memberIds]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {members.map((person, index) => (
          <span
            key={person.id}
            className="group/person inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-1 pr-2 text-[11px] font-medium text-text-default"
          >
            <PersonDot person={person} />
            <StaffBadge staffId={person.id} name={person.name.split(' ')[0]} />
            {index === 0 ? <span className="text-[10px] text-text-muted">lead</span> : null}
            {members.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={() => void onPatch({ assigneeStaffIds: memberIds.filter((id) => id !== person.id) })}
                className="hidden size-4 items-center justify-center rounded-full text-text-muted hover:text-text-default group-hover/person:inline-flex"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label="Add a person"
          className="inline-flex size-8 items-center justify-center rounded-full border border-dashed border-border-soft text-text-muted transition-colors hover:border-border-strong hover:text-text-default"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <Collapse open={adding}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border-hairline bg-surface-card p-1.5 shadow-sm">
              <input
                autoFocus
                value={find}
                onChange={(event) => setFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAdding(false);
                  if (event.key === 'Enter' && candidates[0]) {
                    void onPatch({ assigneeStaffIds: [...memberIds, candidates[0].id] });
                    setFind('');
                  }
                }}
                placeholder="Find a teammate"
                className="rounded-xl bg-surface-sunken px-3 py-1.5 text-[13px] outline-none placeholder:text-text-muted"
              />
              {candidates.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => {
                    void onPatch({ assigneeStaffIds: [...memberIds, person.id] });
                    setFind('');
                  }}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover"
                >
                  <PersonDot person={person} />
                  <StaffBadge staffId={person.id} name={person.name} />
                </button>
              ))}
            </div>
      </Collapse>
    </div>
  );
}

/**
 * Due — task principle P5: an exact value gets an exact control. The house date switcher
 * (`DateRangePickerField variant="compact"`: Today · Tomorrow · Next week presets over the month,
 * Clear in its footer) shows the day itself; the due chip beside it keeps the urgency ink.
 * A day saves as 17:00 warehouse time (`taskDueInstantIso`).
 */
function DueEditor({
  dueMs,
  done,
  nowMs,
  onPatch,
}: {
  dueMs: number | null;
  /** A finished task is never "late" — the chip goes quiet. */
  done: boolean;
  nowMs: number;
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePickerField
        variant="compact"
        value={taskDueDay(dueMs)}
        onChange={(day) => void onPatch({ deadlineAt: taskDueInstantIso(day) })}
        presets={TASK_DUE_PRESETS}
        onClear={() => void onPatch({ deadlineAt: null })}
        faceLabel={dueMs == null ? 'Set due date' : undefined}
        ariaLabel="Due date"
        className="h-8 w-auto min-w-28"
      />
      <DueChip dueMs={dueMs} nowMs={nowMs} done={done} />
    </div>
  );
}

// ── Links ───────────────────────────────────────────────────────────────────

/**
 * The task's Links: one input takes a ticket #, an RS- repair, a tracking
 * number — or a customer email (owner 2026-09-30: "within the links I should
 * be able to add an email reference"): an address, or the email's pasted
 * From / To lines, becomes an email reference row (mailbox + order / ref
 * editable on the row).
 */
function LinksTab({ taskId }: { taskId: number }) {
  const { links, loading, add, remove } = useTaskLinks(taskId);
  const emails = useTaskEmailRefs(taskId);
  const [value, setValue] = useState('');
  const fail = (error: unknown, fallback: string) => toast.error(error instanceof Error ? error.message : fallback);

  /** An address in the text makes it an email reference; false = not an email, link it as a record. */
  const linkEmail = (raw: string): boolean => {
    if (!raw.includes('@')) return false;
    emails.link.mutate(raw, { onSuccess: () => setValue(''), onError: (error) => fail(error, 'Could not link that email.') });
    return true;
  };

  const submit = () => {
    const raw = value.trim();
    if (!raw || linkEmail(raw)) return;
    // `RS-74` is a repair; a bare number or `#48120` a ticket; anything else a tracking number.
    const body: TaskLinkCreateBody = /^rs[\s#-]*\d+$/i.test(raw)
      ? { kind: 'repair', value: raw }
      : /^#?\d{1,9}$/.test(raw)
        ? { kind: 'ticket', value: raw }
        : { kind: 'tracking', value: raw };
    add.mutate(body, {
      onSuccess: () => setValue(''),
      onError: (error: unknown) => fail(error, 'Could not link that.'),
    });
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2 rounded-full bg-surface-sunken py-1 pl-3.5 pr-1">
        <Link2 className="size-3.5 text-text-muted" />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          // A pasted header block is multi-line; a text input would flatten it, so an address in the clipboard links at once.
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!text.includes('@')) return;
            event.preventDefault();
            linkEmail(text);
          }}
          placeholder="Ticket #, RS-repair, tracking number or customer email"
          aria-label="Link a ticket, repair, tracking number or customer email"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
          data-testid="task-links-input"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || add.isPending || emails.link.isPending}
          className="h-7 rounded-full bg-surface-card px-3 text-[11px] font-semibold shadow-sm disabled:opacity-40"
        >
          Link
        </button>
      </div>
      {loading || emails.loading ? (
        <div className="h-12 animate-pulse rounded-2xl bg-surface-sunken" />
      ) : links.length === 0 && emails.refs.length === 0 ? (
        <p className="py-4 text-[13px] text-text-muted">Nothing linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {links.map((link) => (
            <LinkLine
              key={link.id}
              kind={link.kind}
              label={link.label}
              detail={linkDetail(link)}
              href={linkHref(link)}
              trailing={<UnlinkButton label={link.label} onClick={() => remove.mutate(link.id)} />}
            />
          ))}
          {emails.refs.map((ref) => (
            <LinkLine
              key={`email:${ref.id}`}
              kind="email"
              label={ref.customerEmail}
              detail={
                <EmailLinkDetail
                  emailRef={ref}
                  mailboxes={emails.mailboxes}
                  onPatch={(patch) =>
                    emails.update.mutateAsync({ id: ref.id, ...patch }).catch((error: unknown) => {
                      fail(error, 'Could not save that email.');
                      throw error;
                    })
                  }
                />
              }
              trailing={
                <UnlinkButton
                  label={ref.customerEmail}
                  onClick={() => emails.remove.mutate(ref.id, { onError: (error) => fail(error, 'Could not unlink that email.') })}
                />
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UnlinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Unlink ${label}`}
      onClick={onClick}
      className="hidden size-6 items-center justify-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text-default group-hover/link:inline-flex group-focus-within/link:inline-flex"
    >
      <X className="size-3.5" />
    </button>
  );
}

/** An email link's second line, editable in place: the mailbox it came in on (menu) · its order / ref number (inline text). */
function EmailLinkDetail({
  emailRef,
  mailboxes,
  onPatch,
}: {
  emailRef: TaskEmailRef;
  mailboxes: readonly string[];
  onPatch: (patch: TaskEmailRefPatchBody) => Promise<unknown>;
}) {
  // The org's vocabulary, plus this row's own mailbox when it is an outlier.
  const choices = mailboxes.includes(emailRef.mailbox) ? mailboxes : [emailRef.mailbox, ...mailboxes];
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-muted">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={emailRef.mailbox}
            aria-label={`Came in on ${emailRef.mailbox} — change the mailbox`}
            className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md bg-surface-sunken px-1.5 font-mono font-semibold text-text-default transition-colors hover:bg-surface-card"
            data-testid="task-email-link-mailbox"
          >
            {mailboxFace(emailRef.mailbox)}
            <ChevronDown aria-hidden className="size-3 text-text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          {choices.map((mailbox) => (
            <DropdownMenuItem
              key={mailbox}
              onSelect={() => {
                if (mailbox !== emailRef.mailbox) void onPatch({ mailbox }).catch(() => undefined);
              }}
              className="gap-2 text-[12px]"
            >
              <span className="font-mono font-semibold">{mailboxFace(mailbox)}</span>
              <span className="min-w-0 flex-1 truncate text-text-muted">{mailbox}</span>
              {mailbox === emailRef.mailbox ? <Check aria-hidden className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden>·</span>
      <InlineText
        key={`${emailRef.id}:${emailRef.orderNumber}:${emailRef.referenceNumber}`}
        value={emailRefNumberFace(emailRef)}
        placeholder="Add order # or Ref …"
        ariaLabel={`Order or reference number for ${emailRef.customerEmail}`}
        onCommit={(raw) => onPatch(emailRefNumberPatch(raw))}
        className="mx-0 h-5 w-40 min-w-0 rounded-md px-1 py-0 text-[11px] text-text-muted"
      />
    </span>
  );
}

// ── icon-first link rows ─────────────────────────────────────────────────────

type LinkLineKind = TaskLinkKind | 'record' | 'email';

/** Icon first: each kind wears its own bright glyph (ticket orange — someone is waiting; order sky; tracking violet; email emerald). */
const LINK_FACE: Readonly<Record<LinkLineKind, { icon: LucideIcon; tile: string }>> = {
  ticket: { icon: Ticket, tile: 'bg-orange-50 text-orange-500 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-500/30' },
  order: { icon: Package, tile: 'bg-sky-50 text-sky-500 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30' },
  tracking: { icon: Truck, tile: 'bg-violet-50 text-violet-500 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30' },
  repair: { icon: Wrench, tile: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30' },
  email: { icon: Mail, tile: 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30' },
  record: { icon: Package, tile: 'bg-surface-sunken text-text-muted' },
};

/** A ticket line's second line: its helpdesk status as the colour pill, then the subject. */
function ticketLinkDetail(status: string | null | undefined, subject: string | null | undefined): ReactNode {
  if (!status && !subject) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
      <TicketStatusPill status={status} />
      {subject ? <span className="truncate">{subject}</span> : null}
    </span>
  );
}

/** The second line a link row reads — the record's own words. */
function linkDetail(link: TaskLink): ReactNode {
  if (link.kind === 'repair') {
    if (!link.repair) return 'Repair no longer on file';
    return [link.repair.title, link.repair.status, link.repair.ticketNumber && `Ticket ${link.repair.ticketNumber}`].filter(Boolean).join(' · ') || null;
  }
  if (link.kind === 'ticket') return ticketLinkDetail(link.ticket?.status, link.ticket?.subject);
  return link.order?.title ?? link.tracking?.status ?? null;
}

/** A repair opens on the repair desk; other kinds are read in place. */
function linkHref(link: TaskLink): string | null {
  return link.kind === 'repair' && link.repair ? taskLinkRepairHref(link.repair.id, 'desk') : null;
}

function LinkLine({
  kind,
  label,
  detail,
  href,
  trailing,
}: {
  kind: LinkLineKind;
  label: string;
  /** A string reads as the muted second line; a node (an email's mailbox menu + number) paints as given. */
  detail: ReactNode;
  href?: string | null;
  trailing?: ReactNode;
}) {
  const face = LINK_FACE[kind];
  const Icon = face.icon;
  const body = (
    <>
      <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-lg', face.tile)}>
        <Icon aria-hidden className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text-default">{label}</span>
        {typeof detail === 'string' ? <span className="block truncate text-[11px] text-text-muted">{detail}</span> : detail}
      </span>
    </>
  );
  return (
    <li className="group/link flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-hover" data-link-kind={kind}>
      {href ? (
        <a href={href} className="flex min-w-0 flex-1 items-center gap-2.5">
          {body}
          <ArrowUpRight className="size-3.5 shrink-0 text-text-muted" />
        </a>
      ) : (
        body
      )}
      {trailing}
    </li>
  );
}

/** Paste a helpdesk number and the thread mounts right here — inline replies stay in the rail (owner
 *  2026-09-30). The link lands through the house links writer; the desk row refetches and the tab swaps
 *  to `SupportTicketDetail`. */
function TicketLinkPanel({ taskId }: { taskId: number }) {
  const { add } = useTaskLinks(taskId);
  const [value, setValue] = useState('');
  const number = value.trim().replace(/^#/, '');
  const submit = () => {
    if (!/^\d{1,9}$/.test(number) || add.isPending) return;
    add.mutate(
      { kind: 'ticket', value: number },
      {
        onSuccess: () => setValue(''),
        onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not link that ticket.'),
      },
    );
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-500/30">
        <Ticket aria-hidden className="size-5" />
      </span>
      <p className="max-w-xs text-[13px] text-text-muted">
        No support ticket linked yet. Paste the ticket number and the conversation opens here — reply inline, internal or public.
      </p>
      <div className="flex items-center gap-2 rounded-full bg-surface-sunken py-1 pl-3.5 pr-1">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          inputMode="numeric"
          placeholder="Ticket #…"
          aria-label="Ticket number to link"
          className="w-36 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
          data-testid="task-ticket-link-input"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!/^\d{1,9}$/.test(number) || add.isPending}
          className="h-7 rounded-full bg-surface-card px-3 text-[11px] font-semibold shadow-sm disabled:opacity-40"
          data-testid="task-ticket-link-submit"
        >
          {add.isPending ? 'Linking…' : 'Link ticket'}
        </button>
      </div>
    </div>
  );
}

/**
 * Overview's links, no "Linked" heading (the glyph tiles say what each is): the ticket (only when its thread is
 * not already previewed above — one fact, one place), the record it is about, every link, the customer emails.
 */
function LinkedList({
  row,
  taskId,
  ticketPreviewed,
  onOpenTicket,
}: {
  row: TaskBoardRow;
  taskId: number;
  ticketPreviewed: boolean;
  onOpenTicket: () => void;
}) {
  const { links } = useTaskLinks(taskId);
  const { refs } = useTaskEmailRefs(taskId);
  const extra = links.filter((link) => !(row.ticket && link.kind === 'ticket' && link.label.replace(/\D/g, '') === String(row.ticket.number)));
  const ticketLine = row.ticket && !ticketPreviewed;
  if (!ticketLine && !row.record && extra.length === 0 && refs.length === 0) return null;
  return (
    <section aria-label="Links" className={OVERVIEW_SECTION} data-testid="task-overview-links">
      <ul className="-mx-2 flex flex-col gap-0.5">
        {ticketLine && row.ticket ? (
          <LinkLine
            kind="ticket"
            label={row.ticket.number != null ? `Ticket #${row.ticket.number}` : 'Ticket'}
            detail={ticketLinkDetail(row.ticket.status, row.ticket.subject)}
            trailing={
              // P2 — a verb beside content is tonal: the house Button, `warningSoft` (ticket orange).
              <Button size="sm" variant="warningSoft" radius="pill" className="shrink-0" onClick={onOpenTicket}>
                Open thread
              </Button>
            }
          />
        ) : null}
        {row.record ? <LinkLine kind="record" label={row.record.label} detail={null} href={row.record.href} /> : null}
        {extra.map((link) => (
          <LinkLine
            key={link.id}
            kind={link.kind}
            label={link.label}
            detail={linkDetail(link)}
            href={linkHref(link)}
          />
        ))}
        {refs.map((ref) => (
          <LinkLine
            key={`email:${ref.id}`}
            kind="email"
            label={ref.customerEmail}
            detail={[mailboxFace(ref.mailbox), emailRefNumberFace(ref)].filter(Boolean).join(' · ')}
            href={`mailto:${ref.customerEmail}`}
          />
        ))}
      </ul>
    </section>
  );
}
