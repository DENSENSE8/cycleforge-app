'use client';

/** Daily — the phone face of the shift checklist (`/m/home`). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { TICKET_STATUSES, TICKET_STATUS_FACE, type TicketStatus } from '@/design-system/tokens/ticket-status';
import { IconButton } from '@/design-system/primitives/IconButton';
import { elevationClass } from '@/design-system/tokens/shadows';
import { Plus } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { getCurrentPSTDateKey } from '@/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import {
  dailyComposerCreateBody,
  dailyComposerError,
  dailyComposerLinkInputs,
  newDailyComposerDraft,
  type DailyComposerDraft,
} from '@/lib/daily-checks/composer';
import { attachDailyCheckLinks } from '@/lib/daily-checks/use-daily-check-links';
import {
  useDailyChecks,
  useItemActions,
  useToggleCheck,
} from '@/lib/daily-checks/use-daily-checks';
import { MobileDailyRow } from './MobileDailyRow';
import { MobileDailyDetailSheet } from './MobileDailySheets';
import { MobileDailyComposerSheet } from './MobileDailyComposerSheet';
import { MobileTaskSheet } from './MobileTaskSheet';
import { MobileSharedTaskComposerSheet } from './MobileSharedTaskComposerSheet';
import { MobileCurrentSession } from '@/components/mobile/session/MobileCurrentSession';
import { AgendaKindFilter as AgendaKindFilterRow, useAgendaKindPrefs } from './AgendaKindFilter';
import { agendaKindVisible } from '@/lib/daily/agenda-kind-filter';
import { useMyTasks, useToggleTaskDone } from '@/lib/tasks/use-my-tasks';
import { taskDeadlineFact, taskRecordLabel } from '@/lib/tasks/task-row-facts';
import {
  taskDeskTicketNumber,
  taskDeskTitle,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { taskMatchesTicketStatuses, ticketStatusCounts } from '@/lib/tasks/ticket-status-filter';
import { taskStatusOf } from '@/lib/tasks/task-status';
import { TASK_BOARD_ROW_TYPES, TASK_BOARD_TYPE_FACE, TASK_BOARD_VIEW_LABEL, taskBoardRowFromTask, taskBoardRowType } from '@/lib/task-board/task-board-model';

/** One assigned task, reduced to what the shared row paints. */
interface MobileAgendaTask {
  row: TaskDeskRow;
  title: string;
  /** The caption's far-left WHEN (`Due today`, `Overdue`). */
  due: string | null;
  /** The caption's trailing record context, when the title does not already name it. */
  subtitle: string | null;
  overdue: boolean;
  /** Due today or tomorrow, not yet late — the caption paints orange. */
  urgent: boolean;
  done: boolean;
  ticketId: number | null;
  /** The anchor ticket's helpdesk status, else the first linked ticket's — the row's colour pill. */
  ticketStatus: string | null;
}

type MobileDailyStatus = 'all' | 'open' | 'done';

/**
 * Small mode switch = `TabSwitch` segmented (SURFACE_LAW §6 — not path chips, not desk underline tabs).
 * item must stay visible after the tick (operator ruling 2026-09-14) — the
 */
const STATUS_TABS: readonly { id: MobileDailyStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
];

const EMPTY_COPY: Readonly<Record<MobileDailyStatus, string>> = {
  all: 'No tasks on the checklist yet.',
  open: 'Everything on the list is checked off.',
  done: 'Nothing checked off yet today.',
};

export function MobileDailyChecklist() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { has, isLoaded: authLoaded } = useAuth();
  /** The LIST is org-managed; the items route gates on the same permission. */
  const canManage = has('admin.manage_staff');
  /**
   * The helpdesk read/write routes gate on this, so the DOOR does too: a
   * staffer without it keeps the ticket MARK (recognition) and never reaches a
   * thread whose every request would 403.
   */
  const canOpenTickets = has('integrations.zendesk');
  /**
   * Assigned tasks live on this list too (operator 2026-09-23: one task system
   * on the phone). `GET /api/tasks` and `PATCH /api/tasks/[id]` both gate on
   * this key, so the rows and the tick agree with the routes.
   */
  const canSeeTasks = has('work_orders.claim');

  const dateKey = getCurrentPSTDateKey();
  const { data, isLoading, isError } = useDailyChecks(dateKey);
  const toggle = useToggleCheck(dateKey);
  /** Kind chips — multi-select + drag order, persisted on this device. */
  const kindPrefs = useAgendaKindPrefs();
  const { addItem, updateItem, retireItem } = useItemActions(dateKey);

  const [status, setStatus] = useState<MobileDailyStatus>('all');
  /** Helpdesk-status chips (OR) — the desk's `?ticket=` rail, on the phone's own list. */
  const [ticketFilter, setTicketFilter] = useState<readonly TicketStatus[]>([]);
  const ticketActive = ticketFilter.length > 0;
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sharedTaskOpen, setSharedTaskOpen] = useState(false);
  const [draft, setDraft] = useState<DailyComposerDraft>(newDailyComposerDraft);

  const doneSet = useMemo(() => new Set(data?.mine.doneItemIds ?? []), [data?.mine.doneItemIds]);

  /** Authored order (`sortOrder`) — the org wrote the list in a sequence. */
  const byAuthored = useMemo(
    () =>
      [...(data?.items ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
      ),
    [data?.items],
  );

  const passesFilter = useCallback(
    (id: number) =>
      status === 'all' || (status === 'open' ? !doneSet.has(id) : doneSet.has(id)),
    [status, doneSet],
  );

  /** Assigned work, on the SAME list. */
  const { data: myTasks, isLoading: myTasksLoading } = useMyTasks(canSeeTasks);
  const toggleTask = useToggleTaskDone();

  /** `?task=<id>` owns the open task sheet — a reminder notification deep-links `/m/home?task=<id>`, and Back/refresh keep the sheet. */
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTaskParam = Number(searchParams.get('task'));
  const openTaskId = Number.isInteger(rawTaskParam) && rawTaskParam > 0 ? rawTaskParam : null;
  const setTaskParam = useCallback(
    (taskId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (taskId == null) params.delete('task');
      else params.set('task', String(taskId));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const closeTask = useCallback(() => setTaskParam(null), [setTaskParam]);
  /** Off the FULL list, not the filtered rows — a notification ignores the Done tab. */
  const openTaskRow = useMemo(
    () => (openTaskId == null ? null : (myTasks ?? []).find((row) => row.id === openTaskId) ?? null),
    [myTasks, openTaskId],
  );

  /** One clock for every "Due today / Overdue" caption on the screen. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  /** Status tab + kind chips — everything but the ticket chips, so each chip counts what tapping it alone keeps. */
  const listedTasks = useMemo<MobileAgendaTask[]>(() => {
    return (myTasks ?? [])
      .map((row) => {
        const done = row.status === 'DONE';
        const due = taskDeadlineFact(row.deadlineAtMs, nowMs);
        const record = taskRecordLabel(row);
        // Instructions are markdown: the row prints their first line as plain
        // text, and a handoff with no words still names its record — never a
        // blank line with a checkbox, never a raw `# **…`.
        const title = taskDeskTitle(row);
        return {
          row,
          done,
          title,
          due: due?.text ?? null,
          subtitle: title === record ? null : record || null,
          overdue: Boolean(due?.overdue) && !done,
          urgent: Boolean(due?.urgent) && !done,
          ticketId: taskDeskTicketNumber(row),
          ticketStatus: row.ticket?.status ?? row.links.find((link) => link.kind === 'ticket')?.status ?? null,
        };
      })
      .filter((task) => (status === 'all' ? true : status === 'open' ? !task.done : task.done))
      // Kind chips: `task` keeps record work, `ticket` keeps threads; both
      // may be on at once.
      .filter((task) =>
        agendaKindVisible(kindPrefs.prefs, task.row.entityType === 'support_ticket' ? 'ticket' : 'task'),
      )
  }, [myTasks, nowMs, status, kindPrefs.prefs]);
  const taskRows = useMemo(
    () => (ticketActive ? listedTasks.filter((task) => taskMatchesTicketStatuses(task.row, ticketFilter)) : listedTasks),
    [listedTasks, ticketActive, ticketFilter],
  );
  /** The board's type groups (Support · Long-term projects · Standalone tasks), each in list order — a hairline splits them. */
  const taskGroups = useMemo(() => {
    const typed = taskRows.map((task) => ({ task, type: taskBoardRowType(taskBoardRowFromTask(task.row)) }));
    return TASK_BOARD_ROW_TYPES.map((type) => ({ type, tasks: typed.filter((t) => t.type === type).map((t) => t.task) })).filter(
      (group) => group.tasks.length > 0,
    );
  }, [taskRows]);
  const ticketChips = useMemo<StatusChip<TicketStatus>[]>(() => {
    const counts = ticketStatusCounts(listedTasks.map((task) => task.row));
    return TICKET_STATUSES.map((id) => ({ id, label: TICKET_STATUS_FACE[id].label, tone: TICKET_STATUS_FACE[id], count: counts[id] }));
  }, [listedTasks]);
  const ticketActiveSet = useMemo<ReadonlySet<TicketStatus>>(() => new Set(ticketFilter), [ticketFilter]);

  // Recurring first, one-offs under their band — the same order the desk's
  // authored branch keeps, so both faces answer "what does the shift owe"
  // before "what is exceptional today".
  // A ticket-status filter keeps tasks only: a checklist item has no helpdesk status.
  const showChecks = !ticketActive && agendaKindVisible(kindPrefs.prefs, 'checklist');
  const recurring = showChecks ? byAuthored.filter((i) => i.kind !== 'once' && passesFilter(i.id)) : [];
  const onceItems = showChecks ? byAuthored.filter((i) => i.kind === 'once' && passesFilter(i.id)) : [];

  const openItem = useMemo(
    () => data?.items.find((i) => i.id === openItemId) ?? null,
    [data?.items, openItemId],
  );

  /**
   * Two-phase commit, same semantics as the desk: create, then attach. On a
   * link failure the ITEM stands, the sheet STAYS OPEN, and the draft keeps
   * its links with the title cleared — one paste away, not a retyping.
   */
  const submitDraft = useCallback(() => {
    if (dailyComposerError(draft)) return;
    const parsed = dailyComposerLinkInputs(draft);
    if (!parsed.ok) return;
    addItem.mutate(dailyComposerCreateBody(draft), {
      onSuccess: async (item) => {
        let attached = true;
        if (parsed.links.length > 0) {
          try {
            await attachDailyCheckLinks(item.id, parsed.links);
          } catch (error: unknown) {
            attached = false;
            const message = error instanceof Error ? error.message : String(error);
            console.error('[daily-checks] link attach failed after create:', message);
          }
        }
        setDraft(attached ? newDailyComposerDraft() : { ...draft, title: '' });
        if (attached) setComposerOpen(false);
      },
    });
  }, [addItem, draft]);

  const renderRow = (item: (typeof recurring)[number]) => (
    <MobileDailyRow
      key={`check-${item.id}`}
      itemId={item.id}
      rowKey={`check-${item.id}`}
      title={item.title}
      done={doneSet.has(item.id)}
      once={item.kind === 'once'}
      ticketId={item.ticketId}
      owner={
        item.assignedStaffId != null && item.assignedStaffName
          ? { staffId: item.assignedStaffId, name: item.assignedStaffName }
          : null
      }
      onToggle={(next) => toggle.mutate({ itemId: item.id, checked: next })}
      onOpenDetail={() => setOpenItemId(item.id)}
      // The row's ticket glyph is the door to `/m/t/[ticketId]` — the phone's thread + reply surface.
      onOpenTicket={
        canOpenTickets && item.ticketId != null
          ? () => router.push(`/m/t/${item.ticketId}`)
          : undefined
      }
    />
  );

  /** A thrown task, rendered as the SAME row as a check. */
  const renderTaskRow = (task: MobileAgendaTask) => (
    <MobileDailyRow
      key={`task-${task.row.id}`}
      itemId={task.row.id}
      rowKey={`task-${task.row.id}`}
      title={task.title}
      done={task.done}
      due={task.due}
      dueTone={task.overdue ? 'danger' : task.urgent ? 'urgent' : 'muted'}
      subtitle={task.subtitle}
      ticketId={task.ticketId}
      ticketStatus={task.ticketStatus}
      taskStatus={taskStatusOf(task.row)}
      detail="record"
      onToggle={(next) => toggleTask.mutate({ taskId: task.row.id, done: next })}
      // The chevron opens the TASK — its instructions, media, documents and
      // linked records — in the sheet `?task=` drives; the record itself is
      // one tap further, under Linked records.
      onOpenDetail={() => setTaskParam(task.row.id)}
      onOpenTicket={
        canOpenTickets && task.ticketId != null
          ? () => router.push(`/m/t/${task.ticketId}`)
          : undefined
      }
    />
  );

  // Band order follows the shared dragged order: whichever of checklist vs
  // assigned-work leads there leads here.
  const checksFirst =
    (kindPrefs.prefs.order.indexOf('checklist') ?? 0) <=
    Math.min(...['task', 'ticket'].map((k) => kindPrefs.prefs.order.indexOf(k as never)));
  const checklistSection = (
    <>
      <ul className="flex flex-col gap-2 pt-3">{recurring.map(renderRow)}</ul>
      {onceItems.length > 0 ? (
        <>
          <p className="pb-2 pt-5 text-role-caption font-semibold text-text-muted">
            Today only
          </p>
          <ul className="flex flex-col gap-2">{onceItems.map(renderRow)}</ul>
        </>
      ) : null}
    </>
  );
  const assignedSection = (
    <>
      <p className="pb-2 pt-5 text-role-caption font-semibold text-text-muted">
        Assigned to me
      </p>
      {taskGroups.length > 1 ? (
        taskGroups.map((group, index) => {
          const face = TASK_BOARD_TYPE_FACE[group.type];
          const Icon = face.icon;
          return (
            <section
              key={group.type}
              data-task-group={group.type}
              aria-label={TASK_BOARD_VIEW_LABEL[group.type]}
              className={cn(index > 0 && 'mt-4 border-t border-border-default pt-3')}
            >
              <h3 className="flex items-center gap-1.5 pb-2 text-role-caption font-semibold">
                <Icon aria-hidden className={cn('size-4 shrink-0', face.ink)} strokeWidth={2.25} />
                <span className={face.text}>{TASK_BOARD_VIEW_LABEL[group.type]}</span>
                <span className="tabular-nums text-text-muted">{group.tasks.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">{group.tasks.map(renderTaskRow)}</ul>
            </section>
          );
        })
      ) : (
        <ul className="flex flex-col gap-2">{taskRows.map(renderTaskRow)}</ul>
      )}
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* `pb-28` clears the sticky CTA — the last row must stay tappable. */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3">
        <MobileCurrentSession />
        {/* Kind dropdown, then status — the same component the desk toolbar mounts. */}
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <AgendaKindFilterRow prefs={kindPrefs.prefs} onToggle={kindPrefs.toggle} />
          <TabSwitch
            tabs={STATUS_TABS.map((t) => ({ id: t.id, label: t.label }))}
            activeTab={status}
            onTabChange={(id) => setStatus(id as MobileDailyStatus)}
            className="min-w-0 flex-1"
          />
        </div>
        {ticketActive || ticketChips.some((chip) => chip.count > 0) ? (
          <div className="flex pb-1">
            <StatusChipRail
              chips={ticketChips}
              active={ticketActiveSet}
              onToggle={(id) =>
                setTicketFilter((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
              }
              onReset={() => setTicketFilter([])}
              label="Filter by ticket status"
              testId="mobile-daily-ticket-chips"
            />
          </div>
        ) : null}

        {checksFirst
          ? checklistSection
          : null}
        {taskRows.length > 0 ? assignedSection : null}
        {checksFirst ? null : checklistSection}


        {isLoading ? (
          <p className="pt-6 text-role-caption text-text-muted">Loading the checklist…</p>
        ) : null}
        {isError ? (
          <p role="alert" className="pt-6 text-role-caption text-text-muted">
            Could not load the checklist.
          </p>
        ) : null}
        {!isLoading &&
        !isError &&
        recurring.length === 0 &&
        onceItems.length === 0 &&
        taskRows.length === 0 ? (
          <p className="pt-6 text-role-caption text-text-muted">
            {ticketActive ? 'No tasks with a ticket in that status.' : EMPTY_COPY[status]}
          </p>
        ) : null}
      </div>

      {/*
 * ONE primary CTA (SURFACE_LAW §5) — a circular icon-only FAB in the
 * bottom-right thumb zone (operator ruling 2026-09-15: "just a plus
 */}
      {(canManage || canSeeTasks) ? (
        <IconButton
          // Task first: the checklist is the org's rarer edit, reachable
          // from inside the task sheet for those who manage it.
          onClick={() => (canSeeTasks ? setSharedTaskOpen(true) : setComposerOpen(true))}
          ariaLabel="New task"
          size="touch"
          radius="pill"
          icon={<Plus aria-hidden className="h-5 w-5" />}
          className={cn(
            'absolute bottom-4 right-4 z-fab',
            'bg-accent-bg text-text-inverse hover:bg-accent-hover hover:text-text-inverse',
            elevationClass('raised'),
          )}
        />
      ) : null}

      {sharedTaskOpen ? (
        <MobileSharedTaskComposerSheet
          onClose={() => setSharedTaskOpen(false)}
          onCreated={() => {
            setSharedTaskOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
          onAddChecklist={canManage ? () => { setSharedTaskOpen(false); setComposerOpen(true); } : undefined}
        />
      ) : null}

      <MobileDailyDetailSheet
        item={openItem}
        report={data}
        canManage={canManage}
        saving={updateItem.isPending}
        saveError={updateItem.error?.message ?? null}
        removing={retireItem.isPending}
        // Both verbs CLOSE the sheet on success. The operator came from a row
        // and the answer to "did it take?" is that row repainting — leaving
        // them in a sheet to verify it would be one dismissal too many.
        onSave={(title) => {
          if (openItemId == null) return;
          updateItem.mutate(
            { itemId: openItemId, title },
            { onSuccess: () => setOpenItemId(null) },
          );
        }}
        onRemove={() => {
          if (openItemId == null) return;
          retireItem.mutate(openItemId, { onSuccess: () => setOpenItemId(null) });
        }}
        onClose={() => setOpenItemId(null)}
      />
      <MobileTaskSheet
        taskId={openTaskId}
        row={openTaskRow}
        // Auth still resolving means the task query has not even been asked.
        loading={!authLoaded || myTasksLoading}
        nowMs={nowMs}
        canOpenTickets={canOpenTickets}
        onClose={closeTask}
      />
      <MobileDailyComposerSheet
        open={composerOpen}
        draft={draft}
        pending={addItem.isPending}
        error={addItem.error?.message ?? null}
        onDraftChange={setDraft}
        onSubmit={submitDraft}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  );
}
