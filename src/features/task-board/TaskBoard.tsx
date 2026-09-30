'use client';

/**
 * Tasks (`/`, was Daily) — the follow-up desk. Owner 2026-09-29: task-first,
 * not id-first; two rows per task, no column header, the next step written on
 * the row; bulk verbs over a selection; delegation one key away.
 *
 * Keys (bare, never inside a field or under an overlay):
 *   J / K or ↓ / ↑  move · Enter open (a ticket opens on its thread) · D done
 *   S status combobox (To do · In progress · Pending · Follow-up · Blocked · Done · Canceled) · X select · Shift+X select all
 *   N or C new task (C is create on every page — `registerPageCreate`) · H checklist column · V list / columns · [ / ] record tab
 *   B read the Brief · A alert the owners to follow up (Everyone scope, record open)
 *   Esc clears the selection; the record plane owns the rest (close the
 *   record, then leave split) and ⌘/Ctrl+Shift+S (In place / Split)
 *
 * `G` + letter belongs to `NavGoKeys` (capture phase, stops propagation), so
 * an armed `G S` never reaches the `S` here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { motion } from '@/design-system/motion';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { TICKET_STATUSES, TICKET_STATUS_FACE, type TicketStatus } from '@/design-system/tokens/ticket-status';
import { KeyboardKey } from '@/design-system/primitives';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { registerNavIntent } from '@/lib/nav/intents';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { registerPageCreate } from '@/lib/keyboard/page-create-key';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { paintMarkId } from '@/lib/observability/tier1-paint-order';
import { toast } from '@/lib/toast';
import { TASK_PRIORITY } from '@/lib/tasks/task-vocabulary';
import { getCurrentPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import {
  TASK_BOARD_VIEW_LABEL,
  isTaskBoardOpen,
  taskBoardNextStep,
  taskBoardStatusMatches,
  type TaskBoardRow,
} from '@/lib/task-board/task-board-model';
import { NewTaskSheet } from './NewTaskSheet';
import {
  TASK_RECORD_STATUS_ANCHOR_ATTR,
  TaskRecordActions,
  TaskRecordBody,
  recordTabsFor,
  type RecordTab,
} from './TaskDetailRail';
import { TASK_ALERT_KEY } from './TaskAlertButton';
import { TaskBoardColumns } from './TaskBoardColumns';
import { TaskBulkBar, type TaskBulkVerbs } from './TaskBulkBar';
import { TaskChecklistColumn, type TaskTableHandlers } from './TaskChecklistColumn';
import { TASK_RECORD_STATUS_FIELD_ATTR, TaskStatusPicker } from './TaskStatusPicker';
import { TaskTable, type TaskTableSection } from './TaskTable';
import { useTaskBoard } from './useTaskBoard';
import type { TaskDeskPatch } from '@/features/tasks/useTaskDesk';
import { isTaskHold, TASK_STATUS_FACE } from '@/design-system/tokens/task-status';
import { taskStatusPatch } from '@/lib/tasks/task-status';

/** The `?` sheet's board group — every bare key the handler below binds. */
const TASK_BOARD_SHORTCUTS = {
  id: 'task-board',
  title: 'Tasks board',
  rows: [
    { keys: ['J'], label: 'Next row (↓)' },
    { keys: ['K'], label: 'Previous row (↑)' },
    { keys: ['Enter'], label: 'Open the row (a ticket opens on its thread)' },
    { keys: ['D'], label: 'Done (or reopen) — the row, or the selection' },
    { keys: ['S'], label: 'Set status — type to filter (pen → Pending) or a letter, Enter (1–7 apply at once)' },
    { keys: ['X'], label: 'Select the row' },
    { keys: ['Shift', 'X'], label: 'Select all' },
    { keys: ['N'], label: 'New task (C too — C is create on every page)' },
    { keys: ['H'], label: 'Hide / show the Daily checklist column' },
    { keys: ['V'], label: 'List / Columns (wide triage)' },
    { keys: ['['], label: 'Previous record tab' },
    { keys: [']'], label: 'Next record tab' },
    { keys: ['B'], label: 'Read the Brief (full-screen reader)' },
    { keys: [TASK_ALERT_KEY.toUpperCase()], label: 'Alert the owners to follow up (Everyone)' },
    { keys: ['Esc'], label: 'Clear the selection, then close the record, then clear the ticket-status filter' },
  ],
};

/** Stamped once the board's first real rows (or its empty/error state) render. */
export const TASK_BOARD_PRIMARY_PAINT_MARK = paintMarkId('daily', 'primary');

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function TaskBoard() {
  const board = useTaskBoard();
  const { has } = useAuth();
  const canManageChecklist = has('admin.manage_staff');
  useSurfacePaintMark(TASK_BOARD_PRIMARY_PAINT_MARK, !board.loading);

  const { visible, projects, view, layout, openKey, composing, nowMs, setOpen, setParams, toggleDone, patchTask } = board;
  const { checklist, checklistPinned, checklistColumnOn, setChecklistColumn } = board;
  const [recordTab, setRecordTab] = useState<RecordTab>('overview');
  const [briefReaderOpen, setBriefReaderOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const anchorKey = useRef<string | null>(null);

  // Projects view: one section per project, busiest first. Otherwise one flat section.
  const sections = useMemo<TaskTableSection[]>(() => {
    if (view !== 'project') return [{ key: 'all', project: null, rows: visible }];
    return projects
      .map((project) => ({ key: project.name, project, rows: visible.filter((row) => row.project === project.name) }))
      .filter((section) => section.rows.length > 0);
  }, [view, visible, projects]);
  // J / K read the screen left → right, top → bottom: the pinned checklist, then the list or each column.
  const mainOrder = useMemo(
    () => (layout === 'columns' ? board.columns.flatMap((c) => c.rows) : sections.flatMap((s) => s.rows)),
    [layout, board.columns, sections],
  );
  const order = useMemo(() => (checklistPinned ? [...checklist, ...mainOrder] : mainOrder), [checklistPinned, checklist, mainOrder]);

  // A selection only ever names rows on screen: a filter change drops the rest.
  const selected = useMemo(() => {
    if (selection.size === 0) return EMPTY_SELECTION;
    const onScreen = new Set(order.filter((row) => selection.has(row.key)).map((row) => row.key));
    return onScreen.size === selection.size ? selection : onScreen;
  }, [order, selection]);
  const selectedRows = useMemo(() => order.filter((row) => selected.has(row.key)), [order, selected]);

  useEffect(() => {
    if (openKey) setCursorKey(openKey);
  }, [openKey]);
  const cursor = order.find((row) => row.key === cursorKey) ?? order[0] ?? null;

  // New task opens blank (N, the header verb, the sidebar) or prefilled with
  // ⌘K's New task "<query>": `{ note }` on `/`, `?note=` when it came from another page.
  const { composeNote } = board;
  const [carriedNote, setCarriedNote] = useState<string | undefined>(undefined);
  const setComposing = useCallback(
    (on: boolean, note?: string) => {
      setCarriedNote(note);
      setParams({ compose: on ? '1' : null, note: null });
    },
    [setParams],
  );
  useEffect(() => registerNavIntent('daily:compose', (payload) => setComposing(true, payload?.note)), [setComposing]);
  // Read `?note=` once, then strip it: a reload or a shared link never re-prefills.
  useEffect(() => {
    if (composeNote == null) return;
    setCarriedNote(composeNote);
    setParams({ note: null });
  }, [composeNote, setParams]);

  const openRow = useCallback(
    (row: TaskBoardRow, tab: RecordTab = 'overview') => {
      setCursorKey(row.key);
      setRecordTab(tab);
      setOpen(row.key);
    },
    [setOpen],
  );
  /** Enter / click: a row whose next step is a reply opens straight on its thread. */
  const openForNextStep = useCallback(
    (row: TaskBoardRow) => openRow(row, taskBoardNextStep(row, nowMs)?.action === 'reply' ? 'ticket' : 'overview'),
    [nowMs, openRow],
  );

  const selectRow = useCallback(
    (row: TaskBoardRow, range: boolean) => {
      setSelection((current) => {
        const next = new Set(current);
        const anchorAt = anchorKey.current ? order.findIndex((r) => r.key === anchorKey.current) : -1;
        if (range && anchorAt >= 0) {
          const at = order.findIndex((r) => r.key === row.key);
          const [from, to] = at < anchorAt ? [at, anchorAt] : [anchorAt, at];
          for (const r of order.slice(from, to + 1)) next.add(r.key);
        } else if (next.has(row.key)) {
          next.delete(row.key);
        } else {
          next.add(row.key);
        }
        return next;
      });
      anchorKey.current = row.key;
    },
    [order],
  );
  const selectAll = useCallback(() => setSelection(new Set(order.map((row) => row.key))), [order]);
  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
    anchorKey.current = null;
  }, []);

  // ── bulk verbs ──────────────────────────────────────────────────────────
  const verbs = useMemo<TaskBulkVerbs>(() => {
    const tasks = selectedRows.filter((row) => row.source === 'task' && row.status !== 'CANCELED');
    const patchAll = async (label: string, patchFor: (row: TaskBoardRow) => TaskDeskPatch | null) => {
      const writes = tasks.flatMap((row) => {
        const patch = patchFor(row);
        return patch ? [patchTask(row.id, patch)] : [];
      });
      const results = await Promise.allSettled(writes);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) toast.error(`${failed} of ${writes.length} could not be ${label}.`);
      else toast.success(`${writes.length} ${writes.length === 1 ? 'task' : 'tasks'} ${label}`);
    };
    const setDone = (done: boolean) => {
      for (const row of selectedRows) {
        if (row.status === 'CANCELED' || row.done === done) continue;
        toggleDone(row);
      }
      clearSelection();
    };
    return {
      done: () => setDone(true),
      reopen: () => setDone(false),
      urgent: () => void patchAll('marked urgent', (row) => (row.urgent ? null : { priority: TASK_PRIORITY.urgent })),
      dueToday: () => {
        const iso = warehouseCivilTimeToInstant(getCurrentPSTDateKey(), '17:00')?.toISOString() ?? null;
        void patchAll('due today', () => ({ deadlineAt: iso }));
      },
      addPerson: (staffId) =>
        void patchAll('updated', (row) =>
          row.people.some((p) => p.id === staffId) ? null : { assigneeStaffIds: [...row.people.map((p) => p.id), staffId] },
        ),
    };
  }, [clearSelection, patchTask, selectedRows, toggleDone]);

  // ── status picker (S) ───────────────────────────────────────────────────
  const [statusRow, setStatusRow] = useState<TaskBoardRow | null>(null);
  const statusAnchor = useRef<HTMLElement | null>(null);
  const openStatusPicker = useCallback((row: TaskBoardRow, anchor?: HTMLElement | null) => {
    statusAnchor.current = anchor ?? document.querySelector<HTMLElement>(`[data-task-key="${row.key}"]`);
    if (statusAnchor.current) setStatusRow(row);
  }, []);

  // A walk (J / K) or a close drops the open record's reader and alert.
  useEffect(() => {
    setBriefReaderOpen(false);
    setAlertOpen(false);
  }, [openKey]);

  const setLayout = useCallback(
    (next: 'list' | 'columns') => setParams({ layout: next === 'columns' ? 'columns' : null }),
    [setParams],
  );
  useEffect(() => registerShortcutOverviewGroup(TASK_BOARD_SHORTCUTS), []);
  // `C` is create app-wide; here the page's create is New task (the Add pill still adds orders).
  useEffect(() => registerPageCreate({ label: 'New task', run: () => setComposing(true) }), [setComposing]);

  // ── keyboard ────────────────────────────────────────────────────────────
  const { openRow: openRecord, openTask, ticketStatuses, ticketCounts, setTicketStatuses } = board;
  const ticketActive = ticketStatuses.length > 0;
  // Alert is an Everyone verb (owner 2026-09-30): Mine / Handed off never alert.
  const canAlert = board.scope === 'everyone';
  const keyState = useRef({ order, cursor, openKey, openRecord, openTask, composing, recordTab, selectedCount: selected.size, verbs, layout, checklistColumnOn, ticketActive, canAlert });
  keyState.current = { order, cursor, openKey, openRecord, openTask, composing, recordTab, selectedCount: selected.size, verbs, layout, checklistColumnOn, ticketActive, canAlert };
  // Esc clears a selection before the record plane (close, then leave split)
  // sees it: capture phase, ahead of the plane's document / window listeners.
  // With neither, it resets the ticket-status chips (the rail's Reset · Esc).
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const s = keyState.current;
      const clearsFilter = s.selectedCount === 0 && s.openKey == null && s.ticketActive;
      if (s.selectedCount === 0 && !clearsFilter) return;
      if (isEditableKeyTarget(event.target) || hasOpenOverlay()) return;
      event.preventDefault();
      if (clearsFilter) setTicketStatuses([]);
      else clearSelection();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [clearSelection, setTicketStatuses]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target) || hasOpenOverlay()) return;
      const s = keyState.current;
      if (s.composing) return;
      const key = event.key;
      const step = (delta: number) => {
        if (s.order.length === 0) return;
        const at = s.cursor ? s.order.findIndex((row) => row.key === s.cursor!.key) : -1;
        const next = s.order[Math.max(0, Math.min(s.order.length - 1, at + delta))]!;
        setCursorKey(next.key);
        // With a record open, J / K walk it too.
        if (s.openKey) setOpen(next.key);
      };
      if (key === 'j' || key === 'ArrowDown') step(1);
      else if (key === 'k' || key === 'ArrowUp') step(-1);
      else if (key === 'Enter' && s.cursor) openForNextStep(s.cursor);
      else if (key === 'x' && s.cursor) selectRow(s.cursor, false);
      else if (key === 'X') selectAll();
      else if (key === 'd') {
        if (s.selectedCount > 0) s.verbs.done();
        else if (s.cursor) toggleDone(s.cursor);
      } else if (key === 'n' && !event.repeat) setComposing(true);
      else if (key === 's' && !event.repeat && s.cursor?.source === 'task') {
        // The open record's Status control (Overview), else its header verb, else the row.
        const record =
          s.openKey === s.cursor.key
            ? (document.querySelector<HTMLElement>(`[${TASK_RECORD_STATUS_FIELD_ATTR}]`) ??
              document.querySelector<HTMLElement>(`[${TASK_RECORD_STATUS_ANCHOR_ATTR}]`))
            : null;
        openStatusPicker(s.cursor, record);
      } else if (key === 'h' && !event.repeat) setChecklistColumn(!s.checklistColumnOn);
      else if (key === 'v' && !event.repeat) setLayout(s.layout === 'columns' ? 'list' : 'columns');
      else if (key === 'b' && !event.repeat && s.openTask) {
        setRecordTab('overview');
        setBriefReaderOpen(true);
      } else if (key === TASK_ALERT_KEY.toLowerCase() && !event.repeat && s.openTask && s.canAlert) setAlertOpen(true);
      else if ((key === '[' || key === ']') && s.openRecord) {
        const tabs = recordTabsFor(s.openRecord, s.openTask);
        const at = Math.max(0, tabs.indexOf(s.recordTab));
        setRecordTab(tabs[(at + (key === ']' ? 1 : tabs.length - 1)) % tabs.length]!);
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, openForNextStep, openStatusPicker, selectAll, selectRow, setChecklistColumn, setComposing, setLayout, setOpen, toggleDone]);

  const tally = layout === 'columns' ? mainOrder : visible;
  const openCount = tally.filter(isTaskBoardOpen).length;
  const lateCount = tally.filter((row) => isTaskBoardOpen(row) && row.dueMs != null && row.dueMs < nowMs).length;
  const waitingCount = tally.filter((row) => taskBoardStatusMatches(row, 'waiting')).length;
  const table: TaskTableHandlers = {
    cursorKey: cursor?.key ?? null,
    openKey,
    selected,
    nowMs,
    onCursor: setCursorKey,
    onOpen: openForNextStep,
    onReply: (row) => openRow(row, 'ticket'),
    onToggle: toggleDone,
    onSelect: selectRow,
    onFocusProject: (name) => setParams({ project: board.project === name ? null : name, tab: 'project' }),
    canAlert,
  };
  // Helpdesk statuses as filters (owner 2026-09-30) — the same pill hues the rows wear; several OR together.
  const ticketChips = useMemo<StatusChip<TicketStatus>[]>(
    () => TICKET_STATUSES.map((id) => ({ id, label: TICKET_STATUS_FACE[id].label, tone: TICKET_STATUS_FACE[id], count: ticketCounts[id] })),
    [ticketCounts],
  );
  const ticketActiveSet = useMemo<ReadonlySet<TicketStatus>>(() => new Set(ticketStatuses), [ticketStatuses]);
  const toggleTicketStatus = useCallback(
    (id: TicketStatus) =>
      setTicketStatuses(ticketActiveSet.has(id) ? ticketStatuses.filter((s) => s !== id) : [...ticketStatuses, id]),
    [setTicketStatuses, ticketActiveSet, ticketStatuses],
  );
  const showTicketRail = ticketActive || ticketChips.some((chip) => chip.count > 0);
  const openAt = openRecord ? order.findIndex((row) => row.key === openRecord.key) : -1;
  const closeRecord = useCallback(() => setOpen(null), [setOpen]);

  return (
    <DeskPageLayout bare className="h-full">
      <DeskActionSlotRegistrar>
        <DeskHeaderAction variant="primary" size="sm" onClick={() => setComposing(true)} data-testid="task-board-new-task">
          <Plus className="size-3.5" />
          New task
          <KeyboardKey size="xs" tone="inverse" className="ml-1">
            N
          </KeyboardKey>
        </DeskHeaderAction>
      </DeskActionSlotRegistrar>

      <div className="flex h-full min-h-0 w-full min-w-0 bg-surface-canvas p-3" {...{ [LIST_KEY_OWNER_ATTR]: '' }}>
        <DeskRecordPlane
          open={openRecord != null}
          onClose={closeRecord}
          title={openRecord?.title ?? 'Task'}
          indexLabel={openAt >= 0 ? `${openAt + 1} of ${order.length}` : undefined}
          recordNoun="task"
          recordKey={openKey}
          testId="task-record-plane"
          className="overflow-hidden rounded-3xl border border-border-hairline bg-surface-card"
          actions={
            openRecord ? (
              <TaskRecordActions
                row={openRecord}
                task={openTask}
                onToggle={() => toggleDone(openRecord)}
                onStatus={(anchor) => openStatusPicker(openRecord, anchor)}
                onReply={() => setRecordTab('ticket')}
                canAlert={canAlert}
                alertOpen={alertOpen}
                onAlertOpenChange={setAlertOpen}
              />
            ) : undefined
          }
          list={
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="shrink-0" {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }}>
                <TaskBulkBar
                  selectedCount={selected.size}
                  totalCount={order.length}
                  onSelectAll={selectAll}
                  onClear={clearSelection}
                  verbs={verbs}
                  canDone={selectedRows.some((row) => !row.done && row.status !== 'CANCELED')}
                  canReopen={selectedRows.some((row) => row.done)}
                  hasTasks={selectedRows.some((row) => row.source === 'task')}
                  status={board.status}
                  onStatus={(status) => setParams({ filter: status === 'open' ? null : status })}
                  scope={board.scope}
                  onScope={(scope) => setParams({ scope: scope === 'mine' ? null : scope })}
                  project={board.project}
                  onClearProject={() => setParams({ project: null })}
                  openCount={openCount}
                  lateCount={lateCount}
                  waitingCount={waitingCount}
                  layout={layout}
                  onLayout={setLayout}
                  checklistOn={checklistColumnOn}
                  onChecklist={setChecklistColumn}
                  error={board.error}
                />
                {showTicketRail ? (
                  <div className="flex border-b border-border-hairline px-3 py-1.5">
                    <StatusChipRail
                      chips={ticketChips}
                      active={ticketActiveSet}
                      onToggle={toggleTicketStatus}
                      onReset={() => setTicketStatuses([])}
                      label="Filter by ticket status"
                      testId="task-board-ticket-chips"
                    />
                  </div>
                ) : null}
              </div>

              {board.loading ? (
                <div className="flex flex-col gap-1 px-3 pt-2">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-sunken/70" />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1">
                  {checklistPinned ? (
                    <TaskChecklistColumn rows={checklist} table={table} canAdd={canManageChecklist} onHide={() => setChecklistColumn(false)} />
                  ) : null}
                  {layout === 'columns' ? (
                    <TaskBoardColumns columns={board.columns} table={table} />
                  ) : (
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                      {mainOrder.length === 0 ? (
                        <EmptyState
                          title={
                            board.query
                              ? 'Nothing matches that search'
                              : ticketActive
                                ? 'No tasks with a ticket in that status'
                                : board.status === 'done'
                                  ? 'Nothing finished yet'
                                  : 'All clear'
                          }
                          detail={`${TASK_BOARD_VIEW_LABEL[view]} · press N for a new task`}
                        />
                      ) : (
                        <TaskTable {...table} sections={sections} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          }
        >
          {openRecord ? (
            <TaskRecordBody
              row={openRecord}
              task={openTask}
              tab={recordTab}
              onTab={setRecordTab}
              nowMs={nowMs}
              onPatch={(patch) =>
                openTask
                  ? patchTask(openTask.id, patch).catch((error: unknown) => {
                      toast.error(error instanceof Error ? error.message : 'Could not save the task.');
                      throw error;
                    })
                  : Promise.resolve()
              }
              briefReaderOpen={briefReaderOpen}
              onBriefReaderOpenChange={setBriefReaderOpen}
            />
          ) : null}
        </DeskRecordPlane>
      </div>

      <NewTaskSheet
        open={composing}
        onClose={() => setComposing(false)}
        projects={projects.map((p) => p.name)}
        canAddChecklist={canManageChecklist}
        defaultProject={board.project}
        initialNote={carriedNote ?? composeNote ?? undefined}
        onCreated={(taskId, mine) => {
          board.refresh();
          // Land ON the new task, in the scope that holds it.
          setParams({
            compose: null,
            check: null,
            task: taskId != null ? String(taskId) : null,
            scope: taskId != null && board.scope === 'mine' && !mine ? 'handed' : board.scope === 'mine' ? null : board.scope,
          });
        }}
      />

      <TaskStatusPicker
        open={statusRow != null}
        anchorRef={statusAnchor}
        current={statusRow?.taskStatus ?? 'TODO'}
        onClose={() => setStatusRow(null)}
        onPick={(target) => {
          if (!statusRow?.status || !statusRow.taskStatus) return;
          const current = { status: statusRow.status, taskState: isTaskHold(statusRow.taskStatus) ? statusRow.taskStatus : null };
          const patch = taskStatusPatch(current, target);
          if (!patch) return;
          patchTask(statusRow.id, patch).then(
            () => toast.success(`${statusRow.title} → ${TASK_STATUS_FACE[target].label}`),
            (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not change the status.'),
          );
        }}
      />
    </DeskPageLayout>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-1 py-24 text-center"
    >
      <p className="text-sm font-semibold text-text-default">{title}</p>
      <p className="text-xs text-text-muted">{detail}</p>
    </motion.div>
  );
}
