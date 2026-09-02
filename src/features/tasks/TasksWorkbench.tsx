'use client';

/**
 * Home → Tasks — one staffer's `staff_todos` as a flush workbench sheet.
 *
 * ## Why this surface exists
 *
 * The personal task list only ever had one face: a hand-rolled `<div>` list
 * inside a 290px header popover. That is fine as a *preview* and useless as a
 * triage surface — no sort, no columns, no record plane, no way to see every
 * station's list at once, and a delete you could not inspect or undo. The list
 * is a collection, so it gets the collection engine: the table definition
 * registry + {@link NonlinearTableHost} over `LedgerGridSurface`, like every
 * other operator queue. No `*GridView` twin.
 *
 * It draws no chrome of its own — {@link DataTable} does, from the lanes and
 * the query this page resolves. Home → Daily is the same shape of thing one
 * page over, and reading two checklists that look different is a tax paid on
 * every shift.
 *
 * ## Two stores, still not merged
 *
 * Daily (`daily_check_items` + `daily_check_marks`) is the ORG's shift list with
 * a roster behind every row; this is one staffer's own list (`staff_todos`).
 * Sibling tables over one engine — never one table with a source switch. The
 * roster question and the personal question are not the same question.
 *
 * ## Record plane
 *
 * A row click opens {@link StaffTaskInspectorRail} in the single `RightRailHost`
 * slot, which is also where the task's writes live (rename, delete, restore,
 * cycle). `?task=` carries the selection so a picked row survives a refresh and
 * is linkable, exactly like Daily's `?item=`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from '@/components/tables/DataTable';
import { rowGroupTotals, singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { compareGridValues } from '@/design-system/components/grid';
import {
  tasksColumnKeyForSort,
  tasksCompoundColumnsFor,
  tasksSortFactFor,
  defaultDirForTasksGridSort,
  isTasksSortFact,
  TASKS_SORT_FACT_TYPES,
  type TasksGridColumn,
  type TasksGridColumnKey,
  type TasksSortFact,
} from '@/lib/staff-todos/tasks-grid-layout';
import { TASKS_TABLE_BINDING } from './grid/tasks-table-definition';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { useTasksTableLayout } from '@/features/tasks/grid/useTasksTableLayout';
import { tasksSlotValuesFor } from '@/lib/tables/field-catalog/tasks-resolve';
import { staffTaskCompoundView } from './grid/staff-task-compound-view';
import { TASKS_GRID_CAPABILITIES } from './grid/tasks-grid-descriptor';
import type { StaffTaskRow } from './grid/staff-task-row';
import { StaffTaskInspectorRail } from './StaffTaskInspector';
import { TasksComposerRow } from './TasksComposerRow';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import { useStaffTasks } from './useStaffTasks';

/**
 * Band-1 lanes. `deleted` is the archived half — "view everything", as a tab.
 *
 * Carried on `?filter=`, the key Home already owns for exactly this question
 * ("the surface's own named filter set" — Daily spends it on `done`). A new
 * `?lane=` key would make `lane` a SHARED owned key with `/incoming`, which
 * costs a `SHARED_OWNED_KEYS` entry and an argument, to ask a question the
 * route already has a word for.
 */
type TasksLane = 'open' | 'done' | 'deleted';

function parseLane(raw: string | null): TasksLane {
  return raw === 'done' || raw === 'deleted' ? raw : 'open';
}

/**
 * The lane strip. `open` is the default, so it IS the unfiltered list and the
 * strip lights nothing when it is active — see {@link DataTable}.
 * "Deleted" is a lane, not a hidden menu item: a delete that archives is only
 * honestly reversible if the archive is a place you can go.
 */
const TASK_LANE_TABS = [
  { id: 'done', label: 'Done' },
  { id: 'deleted', label: 'Deleted' },
] as const;

export function TasksWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;

  const tasks = useStaffTasks(staffId);

  // The effective slot layout (staff ?? org ?? product) materialized into the
  // compound tracks — a staffer's own list, and its own document.
  const { effectiveLayout: tasksLayout, fields: tasksFields } = useTasksTableLayout();
  const tasksColumns = useMemo(() => tasksCompoundColumnsFor(tasksLayout), [tasksLayout]);
  const [draft, setDraft] = useState('');
  const [query, setQueryState] = useState('');
  /** Summoned by the page CTA rather than permanently docked under the grid. */
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);

  const lane = parseLane(searchParams.get('filter'));
  const rawTask = searchParams.get('task');
  const selectedId = rawTask && /^\d+$/.test(rawTask) ? Number(rawTask) : null;

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/');
    },
    [router, searchParams],
  );

  const selectTask = useCallback(
    (id: number | null) => {
      writeParams((p) => {
        if (id == null) p.delete('task');
        else p.set('task', String(id));
      });
    },
    [writeParams],
  );
  const setLane = useCallback(
    (next: TasksLane) => {
      writeParams((p) => {
        if (next === 'open') p.delete('filter');
        else p.set('filter', next);
        // A row from the previous lane is not in this one; keeping `?task=`
        // would leave the rail open on a record the grid no longer shows.
        p.delete('task');
      });
    },
    [writeParams],
  );
  const setQuery = useCallback((next: string) => setQueryState(next), []);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
    toggleColumnSort,
  } = useUrlColumnSort<TasksSortFact>({
    isColumn: isTasksSortFact,
    defaultDir: defaultDirForTasksGridSort,
  });

  const laneRows = useMemo(() => {
    const source = lane === 'deleted' ? tasks.archivedRows : tasks.liveRows;
    const byLane =
      lane === 'done' ? source.filter((r) => r.done)
      : lane === 'open' ? source.filter((r) => !r.done)
      : source;
    const q = query.trim().toLowerCase();
    return q ? byLane.filter((r) => r.text.toLowerCase().includes(q)) : byLane;
  }, [lane, query, tasks.archivedRows, tasks.liveRows]);

  const rows = useMemo(() => {
    if (!columnSort || !sortDir) {
      // No sort = the list as the staffer authored it, station by station.
      return [...laneRows].sort(
        (a, b) => a.station.localeCompare(b.station) || a.sortOrder - b.sortOrder || a.id - b.id,
      );
    }
    const type = TASKS_SORT_FACT_TYPES[columnSort];
    const value = (r: StaffTaskRow) => {
      switch (columnSort) {
        case 'task':
          return r.text;
        // Sort by the STATE, not the word.
        case 'status':
          return r.archived ? 2 : r.done ? 1 : 0;
        case 'kind':
          return r.kind;
        case 'station':
          return r.station;
        case 'due':
          return r.resetsAtMs;
        case 'updated':
          return r.checkedAtMs;
        default:
          return null;
      }
    };
    return [...laneRows].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir: sortDir });
      // `compareGridValues` already applied `dir` — re-signing here would
      // re-invert blanks and undo the blanks-last ruling.
      return primary !== 0 ? primary : a.sortOrder - b.sortOrder || a.id - b.id;
    });
  }, [laneRows, columnSort, sortDir]);

  const totals = useMemo(
    () => rowGroupTotals({ key: 'tasks', rows }, { done: (r) => (r.done ? 1 : 0) }),
    [rows],
  );

  /** One band, one row per group — the group IS the task. */
  const groups = useMemo(
    () => singleBand(rows, (r) => String(r.id)) as [string, RowGroup<StaffTaskRow>[]][],
    [rows],
  );

  const selected =
    [...tasks.liveRows, ...tasks.archivedRows].find((r) => r.id === selectedId) ?? null;

  /** New tasks land on the station the picked row belongs to, else the first. */
  const composerStation = selected?.station || tasks.liveRows[0]?.station || 'UNBOX';

  const submitDraft = useCallback(
    (kind: 'general' | 'recurring') => {
      const text = draft.trim();
      if (!text) return;
      tasks.create({ station: composerStation, kind, text });
      setDraft('');
    },
    [composerStation, draft, tasks],
  );

  /**
   * The page CTA's handler — open the composer and put the caret in it.
   *
   * Creating a task is what this page CREATES, so the control is page-level and
   * top-right (operator ruling; `DeskActionSlot`'s own law), registered into the
   * desk chrome's slot rather than docked under the grid. The composer stays
   * under the table where a composer belongs — it is summoned, not permanent.
   *
   * With text already typed it COMMITS a general task instead of re-focusing:
   * the operator has said what they want twice. Recurring stays a deliberate
   * choice inside the composer, because a period is not something to infer.
   */
  const openComposer = useCallback(() => {
    setComposerOpen(true);
    if (draft.trim()) {
      submitDraft('general');
      return;
    }
    composerRef.current?.focus();
  }, [draft, submitDraft]);

  // Focus lands after the composer has actually mounted — on the first open
  // the ref is still null when the click handler runs.
  useEffect(() => {
    if (composerOpen) composerRef.current?.focus();
  }, [composerOpen]);

  /** Memoized — a fresh identity every render re-registers through the slot. */
  const addAction = useMemo(
    () =>
      lane === 'deleted' ? null : (
        <DeskHeaderAction
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden className="h-3.5 w-3.5" />}
          onClick={openComposer}
        >
          Add task
        </DeskHeaderAction>
      ),
    [lane, openComposer],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<StaffTaskRow, TasksGridColumnKey, TasksGridColumn>
        binding={TASKS_TABLE_BINDING}
        // COMPOUND (two-row) WMS layout — the SAME tracks Unbox,
        // History, Testing, To-Ship and Incoming mount. A task has no
        // photo, no order and no carrier, so those tracks read empty:
        // that is a data difference, and it is the only kind of
        // difference between two of these tables there is meant to be.
        columns={tasksColumns}
        fields={tasksFields}
        orderGroupsByDate={groups}
        rows={rows}
        getRowId={(r) => String(r.id)}
        // A header click speaks in TRACK keys; `?colsort=` speaks in Tasks'
        // own words. Map both ways through the MOUNTED model so a bookmarked
        // sort keeps its meaning after a rebind moves the fact to a new slot.
        sort={tasksColumnKeyForSort(tasksColumns, columnSort)}
        dir={sortDir}
        onSortChange={(key, nextDir) => {
          const fact = tasksSortFactFor(
            tasksColumns.find((c) => c.key === key) ?? { key, sortable: true },
          );
          if (fact) setSort(fact, nextDir);
        }}
        loading={tasks.loading}
        search={{ value: query, onChange: setQuery, placeholder: 'Filter tasks…' }}
        tabs={TASK_LANE_TABS}
        activeTab={lane === 'open' ? undefined : lane}
        onTabChange={(id) => setLane(id === lane ? 'open' : parseLane(id))}
        emptyMessage={
          tasks.isError
            ? 'Could not load your tasks.'
            : query.trim() !== ''
              ? 'No task matches that search.'
              : lane === 'deleted'
                ? 'Nothing deleted.'
                : lane === 'done'
                  ? 'Nothing checked off yet.'
                  : 'No open tasks.'
        }
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>
            {group.rows.map((row) => (
            <CompoundRow
              key={row.id}
              data-staff-task-id={row.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedId === row.id}
              aria-label={`Task ${row.text}`}
              className="group/row cursor-pointer"
              onClick={() => selectTask(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectTask(row.id);
                }
              }}
              columns={visible}
              capabilities={TASKS_GRID_CAPABILITIES}
              selected={selectedId === row.id}
              // The family's only contribution: its DATA.
              view={{
                // Materialized slot tracks — one resolved value per BOUND slot,
                // keyed by track key. Empty on the product default.
                slots: tasksSlotValuesFor(row, visible),
                ...staffTaskCompoundView(row, { nowMs: tasks.nowMs }),
              }}
              onOpen={() => selectTask(row.id)}
              // The tick means "this task is done", not "this row is
              // selected" — same control, same picture, a different handler.
              select={{
                checked: row.done,
                onToggle: () => tasks.toggle(row, !row.done),
                disabled: row.archived || tasks.pending,
                label: `Mark "${row.text}" ${row.done ? 'not done' : 'done'}`,
              }}
      />
            ))}
          </>
        )}
        renderRow={(row, _stripe, { columns: visible }) => (
          <CompoundRow
            key={row.id}
            data-staff-task-id={row.id}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === row.id}
            aria-label={`Task ${row.text}`}
            className="group/row cursor-pointer"
            onClick={() => selectTask(row.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectTask(row.id);
              }
            }}
            columns={visible}
            capabilities={TASKS_GRID_CAPABILITIES}
            selected={selectedId === row.id}
            // The family's only contribution: its DATA.
            view={{
              slots: tasksSlotValuesFor(row, visible),
              ...staffTaskCompoundView(row, { nowMs: tasks.nowMs }),
            }}
            onOpen={() => selectTask(row.id)}
            // The tick means "this task is done", not "this row is
            // selected" — same control, same picture, a different handler.
            select={{
              checked: row.done,
              onToggle: () => tasks.toggle(row, !row.done),
              disabled: row.archived || tasks.pending,
              label: `Mark "${row.text}" ${row.done ? 'not done' : 'done'}`,
            }}
          />
        )}
      />
      <DeskActionSlotRegistrar>{addAction}</DeskActionSlotRegistrar>

            {lane === 'deleted' || !composerOpen ? null : (
              <TasksComposerRow
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={submitDraft}
                pending={tasks.createPending}
                stationLabel={composerStation}
                inputRef={composerRef}
              />
      )}

      <StaffTaskInspectorRail
        row={selected}
        onClose={() => selectTask(null)}
        actions={{
          onToggle: (row, done) => tasks.toggle(row, done),
          onRename: (row, text) => tasks.rename(row, text),
          onDelete: (row) => tasks.remove(row),
          onRestore: (row) => tasks.restore(row),
          onChangeInterval: (row, ms) => tasks.changeInterval(row, ms),
          pending: tasks.pending,
        }}
      />
    </div>
  );
}
