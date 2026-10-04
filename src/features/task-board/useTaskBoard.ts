'use client';

/**
 * The Tasks board's state: the two feeds (tasks + today's checklist) and the
 * URL (`?tab=` view, `?filter=` status, `?scope=` whose, `?q=` find,
 * `?project=` one project, `?layout=` list or columns, `?ticket=` helpdesk
 * statuses, `?group=` / `?sort=` the Display menu, `?task=` / `?check=` the
 * open row), plus the staffer's remembered checklist column and Display
 * choice. React Query dedupes the fetches, so the sidebar counts and
 * the table read the same rows.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPSTDateKey } from '@/utils/date';
import { useDailyChecks, useToggleCheck } from '@/lib/daily-checks/use-daily-checks';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { taskDeskQueryOptions, useTaskDesk, type TaskDeskPatch, type TaskDeskScope } from '@/features/tasks/useTaskDesk';
import { useSetting } from '@/hooks/useSettings';
import {
  TASK_BOARD_CHECKLIST_COLUMN_SETTING,
  TASK_BOARD_GROUP_SETTING,
  TASK_BOARD_SORT_SETTING,
} from '@/lib/settings/registry';
import { toast } from '@/lib/toast';
import { buildDailyTaskRows } from '@/features/home/grid/daily-task-row';
import { sortTaskDeskRows, taskDeskRowFromWire, type TaskDeskRow } from '@/lib/tasks/task-desk-row';
import {
  parseTicketStatusParam,
  taskMatchesTicketStatuses,
  ticketStatusCounts,
  ticketStatusParam,
} from '@/lib/tasks/ticket-status-filter';
import type { TicketStatus } from '@/design-system/tokens/ticket-status';
import {
  parseTaskBoardGroupBy,
  parseTaskBoardSort,
  parseTaskBoardStatus,
  parseTaskBoardView,
  sortTaskBoardRows,
  sortTaskBoardRowsBy,
  taskBoardFindMatches,
  taskBoardProjects,
  taskBoardRowFromChecklist,
  taskBoardRowFromTask,
  taskBoardRowType,
  taskBoardStatusMatches,
  taskBoardViewCounts,
  taskBoardViewMatches,
  type TaskBoardGroupBy,
  type TaskBoardProject,
  type TaskBoardRow,
  type TaskBoardSort,
  type TaskBoardStatus,
  type TaskBoardView,
} from '@/lib/task-board/task-board-model';

export function parseTaskBoardScope(raw: string | null): TaskDeskScope {
  return raw === 'handed' || raw === 'everyone' ? raw : 'mine';
}

/** `?layout=` — one list, or one column per type (wide triage). */
export type TaskBoardLayout = 'list' | 'columns';

export function parseTaskBoardLayout(raw: string | null): TaskBoardLayout {
  return raw === 'columns' ? 'columns' : 'list';
}

/** Wide triage's columns, left → right (the checklist stays the pinned column). */
export const TASK_BOARD_COLUMNS = [
  { type: 'ticket', label: 'Support tickets' },
  { type: 'task', label: 'Tasks' },
  { type: 'project', label: 'Projects' },
] as const;

export type TaskBoardColumnType = (typeof TASK_BOARD_COLUMNS)[number]['type'];

export interface TaskBoardColumn {
  type: TaskBoardColumnType;
  label: string;
  rows: readonly TaskBoardRow[];
}

/** Everything the board, its sidebar panel and its rail read and write. */
export interface TaskBoardState {
  view: TaskBoardView;
  status: TaskBoardStatus;
  scope: TaskDeskScope;
  query: string;
  /** `?project=` — one project's tasks, or null. */
  project: string | null;
  layout: TaskBoardLayout;
  /** Display · Group by (P3): `?group=`, else the staffer's remembered choice, else Type (Long-term projects: Project). */
  group: TaskBoardGroupBy;
  /** Display · Order by (P3): `?sort=`, else the staffer's remembered choice, else Urgency. */
  sort: TaskBoardSort;
  /** Pick a grouping: the URL carries it and the staffer's setting remembers it. */
  setGroup: (group: TaskBoardGroupBy) => void;
  /** Pick an order: the URL carries it and the staffer's setting remembers it. */
  setSort: (sort: TaskBoardSort) => void;
  /** `?compose=1` — the New task sheet is open. */
  composing: boolean;
  /** `?note=` — the headline ⌘K's New task "<query>" carried in from another page. Read once, then stripped. */
  composeNote: string | null;
  /** `?ticket=` — helpdesk statuses (OR); a task passes when its anchor or a linked ticket is in one. Empty = no filter. */
  ticketStatuses: readonly TicketStatus[];
  /** Tasks per helpdesk status over what the board would show WITHOUT the ticket filter — the chip rail's counts. */
  ticketCounts: Readonly<Record<TicketStatus, number>>;
  setTicketStatuses: (next: readonly TicketStatus[]) => void;
  /** Every row in scope, sorted. */
  rows: readonly TaskBoardRow[];
  /** What the list paints: find × view × status × project (checklist rows leave for the pinned column). */
  visible: readonly TaskBoardRow[];
  /** `?layout=columns`: find × status × project, one column per type (view is the columns themselves). */
  columns: readonly TaskBoardColumn[];
  /** Today's checklist after Find, done ticks included — the pinned column (any scope: it is the viewer's shift). */
  checklist: readonly TaskBoardRow[];
  /** The pinned checklist column is on screen (the staffer's setting, and not already the list itself). */
  checklistPinned: boolean;
  /** The staffer's remembered choice (`desk.home.checklistColumn`). */
  checklistColumnOn: boolean;
  setChecklistColumn: (on: boolean) => void;
  /** Open rows per view, after Find. */
  counts: Readonly<Record<TaskBoardView, number>>;
  projects: readonly TaskBoardProject[];
  openKey: string | null;
  openRow: TaskBoardRow | null;
  openTask: TaskDeskRow | null;
  nowMs: number;
  loading: boolean;
  error: string | null;
  setParams: (patch: Record<string, string | null>) => void;
  setOpen: (key: string | null) => void;
  toggleDone: (row: TaskBoardRow) => void;
  patchTask: (id: number, patch: TaskDeskPatch) => Promise<unknown>;
  refresh: () => void;
}

const NO_TASKS: readonly TaskDeskRow[] = [];
/** Stable no-op subscription: the hydration snapshot never changes after mount. */
const subscribeNothing = () => () => {};

export function useTaskBoard(): TaskBoardState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateKey = getCurrentPSTDateKey();

  const view = parseTaskBoardView(searchParams.get('tab'));
  const status = parseTaskBoardStatus(searchParams.get('filter'));
  const scope = parseTaskBoardScope(searchParams.get('scope'));
  const query = searchParams.get('q') ?? '';
  const project = searchParams.get('project');
  const layout = parseTaskBoardLayout(searchParams.get('layout'));
  const composing = searchParams.get('compose') === '1';
  const composeNote = searchParams.get('note');
  const rawTicket = searchParams.get('ticket');
  const ticketStatuses = useMemo(() => parseTicketStatusParam(rawTicket), [rawTicket]);
  const ticketActive = ticketStatuses.length > 0;
  const rawTask = searchParams.get('task');
  const rawCheck = searchParams.get('check');
  const openKey =
    rawTask && /^\d+$/.test(rawTask) ? `task:${rawTask}` : rawCheck && /^\d+$/.test(rawCheck) ? `checklist:${rawCheck}` : null;
  // P3 Display: `?group=` / `?sort=` win (a shared link), else the staffer's remembered choice (the click answers
  // before the write lands), else the house default — Type · Urgency, today's board. A single-type view has no type
  // split, so Type there reads as the view's own shape: Long-term projects groups by project, the rest stay flat.
  const groupSetting = useSetting<TaskBoardGroupBy>('desk', TASK_BOARD_GROUP_SETTING);
  const sortSetting = useSetting<TaskBoardSort>('desk', TASK_BOARD_SORT_SETTING);
  const [groupLocal, setGroupLocal] = useState<TaskBoardGroupBy | null>(null);
  const [sortLocal, setSortLocal] = useState<TaskBoardSort | null>(null);
  const groupPicked =
    parseTaskBoardGroupBy(searchParams.get('group')) ?? groupLocal ?? parseTaskBoardGroupBy(groupSetting.value) ?? 'type';
  const group: TaskBoardGroupBy = view === 'project' && groupPicked === 'type' ? 'project' : groupPicked;
  const sort: TaskBoardSort =
    parseTaskBoardSort(searchParams.get('sort')) ?? sortLocal ?? parseTaskBoardSort(sortSetting.value) ?? 'urgency';

  const checks = useDailyChecks(dateKey);
  const tasks = useTaskDesk('all', scope);
  // The ticket filter is answered in SQL (`?ticketStatus=`), so a status past the unfiltered page still lands.
  const ticketQuery = useQuery({ ...taskDeskQueryOptions('all', scope, ticketStatuses), enabled: ticketActive });
  const toggleCheck = useToggleCheck(dateKey);

  // The server renders with an empty query cache while the client's may be
  // warm already: hydrate against the server's view, read the cache after.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const checksData = hydrated ? checks.data : undefined;
  const allTaskRows = hydrated ? tasks.rows : NO_TASKS;
  const ticketData = hydrated ? ticketQuery.data : undefined;
  // Until the filtered read lands, the loaded page narrows in place — same rule, no skeleton flash.
  const taskRows = useMemo<readonly TaskDeskRow[]>(() => {
    if (!ticketActive) return allTaskRows;
    if (ticketData) return sortTaskDeskRows(ticketData.map(taskDeskRowFromWire));
    return allTaskRows.filter((row) => taskMatchesTicketStatuses(row, ticketStatuses));
  }, [allTaskRows, ticketActive, ticketData, ticketStatuses]);

  const checklistAll = useMemo<TaskBoardRow[]>(() => {
    const done = new Set(checksData?.mine?.doneItemIds ?? []);
    return sortTaskBoardRows(
      buildDailyTaskRows(checksData?.items ?? [], checksData, done).map((item) => taskBoardRowFromChecklist(item, dateKey)),
    );
  }, [checksData, dateKey]);

  // The checklist is the viewer's own shift; it has no "handed off" half,
  // and no helpdesk status either: a ticket filter leaves tasks only.
  const rows = useMemo<TaskBoardRow[]>(
    () =>
      sortTaskBoardRowsBy([...(scope === 'mine' && !ticketActive ? checklistAll : []), ...taskRows.map(taskBoardRowFromTask)], sort),
    [checklistAll, scope, taskRows, ticketActive, sort],
  );

  // The pinned column is remembered per staffer; the click answers before the write lands.
  const columnSetting = useSetting<boolean>('desk', TASK_BOARD_CHECKLIST_COLUMN_SETTING);
  const [columnLocal, setColumnLocal] = useState<boolean | null>(null);
  const checklistColumnOn = columnLocal ?? columnSetting.value ?? true;
  // The Checklist view in list layout IS the checklist: no second copy beside it.
  const checklistPinned = checklistColumnOn && !(layout === 'list' && view === 'checklist');
  const writeColumn = useRef(columnSetting.set);
  writeColumn.current = columnSetting.set;
  const setChecklistColumn = useCallback((on: boolean) => {
    setColumnLocal(on);
    writeColumn.current(on, 'staff').catch(() => {
      setColumnLocal(null);
      toast.error('Could not remember the checklist column.');
    });
  }, []);

  /** Find narrows first, so every count describes what a click would show. */
  const found = useMemo(() => rows.filter((row) => taskBoardFindMatches(row, query)), [rows, query]);
  const counts = useMemo(() => taskBoardViewCounts(found), [found]);
  const projects = useMemo(() => taskBoardProjects(found), [found]);
  const checklist = useMemo(() => checklistAll.filter((row) => taskBoardFindMatches(row, query)), [checklistAll, query]);
  const visible = useMemo(
    () =>
      found.filter(
        (row) =>
          taskBoardViewMatches(row, view) &&
          taskBoardStatusMatches(row, status) &&
          (project == null || row.project === project) &&
          // Everything with the column pinned: the checklist lives there, once.
          !(checklistPinned && view === 'all' && row.source === 'checklist'),
      ),
    [found, view, status, project, checklistPinned],
  );
  const columns = useMemo<TaskBoardColumn[]>(() => {
    const triage = found.filter(
      (row) => row.source === 'task' && taskBoardStatusMatches(row, status) && (project == null || row.project === project),
    );
    return TASK_BOARD_COLUMNS.map(({ type, label }) => ({
      type,
      label,
      rows: triage.filter((row) => taskBoardRowType(row) === type),
    }));
  }, [found, status, project]);

  // Each chip counts what tapping it alone would show: every other filter applies, the ticket filter does not.
  const ticketCounts = useMemo(
    () =>
      ticketStatusCounts(
        allTaskRows.filter((task) => {
          const row = taskBoardRowFromTask(task);
          return (
            taskBoardFindMatches(row, query) &&
            (layout === 'columns' || taskBoardViewMatches(row, view)) &&
            taskBoardStatusMatches(row, status) &&
            (project == null || row.project === project)
          );
        }),
      ),
    [allTaskRows, query, layout, view, status, project],
  );

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = readLiveSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    },
    [router, searchParams],
  );

  const setTicketStatuses = useCallback(
    (next: readonly TicketStatus[]) => setParams({ ticket: ticketStatusParam(next) }),
    [setParams],
  );

  // A pick is remembered per staffer (the checklist-column pattern) and drops any `?group=` / `?sort=` link
  // override, so the remembered choice governs every view from here on.
  const writeGroup = useRef(groupSetting.set);
  writeGroup.current = groupSetting.set;
  const writeSort = useRef(sortSetting.set);
  writeSort.current = sortSetting.set;
  const setGroup = useCallback(
    (next: TaskBoardGroupBy) => {
      setGroupLocal(next);
      if (searchParams.has('group')) setParams({ group: null });
      writeGroup.current(next, 'staff').catch(() => {
        setGroupLocal(null);
        toast.error('Could not remember the grouping.');
      });
    },
    [searchParams, setParams],
  );
  const setSort = useCallback(
    (next: TaskBoardSort) => {
      setSortLocal(next);
      if (searchParams.has('sort')) setParams({ sort: null });
      writeSort.current(next, 'staff').catch(() => {
        setSortLocal(null);
        toast.error('Could not remember the order.');
      });
    },
    [searchParams, setParams],
  );

  /** The open row moves without a server round-trip: J / K stay instant. */
  const setOpen = useCallback(
    (key: string | null) => {
      const next = readLiveSearchParams(searchParams.toString());
      next.delete('task');
      next.delete('check');
      if (key) {
        const [source, id] = key.split(':');
        next.set(source === 'checklist' ? 'check' : 'task', id ?? '');
      }
      const qs = next.toString();
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
    },
    [searchParams],
  );

  const { update } = tasks;
  const toggleDone = useCallback(
    (row: TaskBoardRow) => {
      if (row.source === 'checklist') {
        toggleCheck.mutate({ itemId: row.id, checked: !row.done });
        return;
      }
      if (row.status === 'CANCELED') return;
      update.mutate({ id: row.id, patch: { status: row.done ? 'OPEN' : 'DONE' } });
    },
    [update, toggleCheck],
  );
  const patchTask = useCallback(
    (id: number, patch: TaskDeskPatch) => update.mutateAsync({ id, patch }),
    [update],
  );

  // A checklist row opened from the pinned column exists in every scope; a
  // task the ticket filter hides stays open (the unfiltered feed still holds it).
  const openTaskAny = openKey?.startsWith('task:')
    ? (taskRows.find((t) => `task:${t.id}` === openKey) ?? allTaskRows.find((t) => `task:${t.id}` === openKey) ?? null)
    : null;
  const openRow = openKey
    ? (rows.find((row) => row.key === openKey) ??
      checklistAll.find((row) => row.key === openKey) ??
      (openTaskAny ? taskBoardRowFromTask(openTaskAny) : null))
    : null;
  const openTask = openRow?.source === 'task' ? openTaskAny : null;

  return {
    view,
    status,
    scope,
    query,
    project,
    layout,
    group,
    sort,
    setGroup,
    setSort,
    composing,
    composeNote,
    ticketStatuses,
    ticketCounts,
    setTicketStatuses,
    rows,
    visible,
    columns,
    checklist,
    checklistPinned,
    checklistColumnOn,
    setChecklistColumn,
    counts,
    projects,
    openKey,
    openRow,
    openTask,
    nowMs: tasks.nowMs,
    loading: !hydrated || checks.isLoading || tasks.loading,
    error: !hydrated
      ? null
      : checks.isError
        ? 'Could not load the checklist.'
        : (tasks.error ?? (ticketActive && ticketQuery.isError ? 'Could not filter by ticket status.' : null)),
    setParams,
    setOpen,
    toggleDone,
    patchTask,
    refresh: tasks.refresh,
  };
}
