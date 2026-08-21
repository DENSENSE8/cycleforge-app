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
 * Chrome is the Home → Daily stack ({@link WorkbenchSheetView} + Band 1
 * {@link WorkbenchChromeHeader} + Band 3 {@link WorkbenchTriageBand}), because
 * it is the same shape of thing one page over — and reading two checklists that
 * look different is a tax paid on every shift.
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

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { rowGroupTotals, singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { compareGridValues } from '@/design-system/components/grid';
import {
  TASKS_GRID_COLUMNS,
  defaultDirForTasksGridSort,
  isTasksGridSortable,
  type TasksGridColumn,
  type TasksGridColumnKey,
} from '@/lib/staff-todos/tasks-grid-layout';
import { TASKS_TABLE_BINDING } from './grid/tasks-table-definition';
import { TasksGridColumnHeader } from './grid/TasksGridColumnHeader';
import { TasksGridRow } from './grid/TasksGridRow';
import type { StaffTaskRow } from './grid/staff-task-row';
import { StaffTaskInspectorRail } from './StaffTaskInspector';
import { TasksComposerRow } from './TasksComposerRow';
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

export function TasksWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;
  const sheetChrome = useWorkbenchSheetChrome();

  const tasks = useStaffTasks(staffId);
  const [draft, setDraft] = useState('');

  const lane = parseLane(searchParams.get('filter'));
  const query = searchParams.get('q') ?? '';
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
  const setQuery = useCallback(
    (next: string) => {
      writeParams((p) => {
        const q = next.trim();
        if (q) p.set('q', q);
        else p.delete('q');
      });
    },
    [writeParams],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
    toggleColumnSort,
  } = useUrlColumnSort<TasksGridColumnKey>({
    isColumn: isTasksGridSortable,
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
    const type = TASKS_GRID_COLUMNS.find((c) => c.key === columnSort)?.type;
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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <WorkbenchSheetView
        chrome={sheetChrome}
        className="h-full w-full min-w-0 bg-surface-card"
        sheetHostClassName="bg-surface-card"
        tabs={({ className }) => (
          <WorkbenchChromeHeader
            density="band"
            className={className}
            tabs={[
              { id: 'open', label: 'Open', color: 'blue' },
              { id: 'done', label: 'Done', color: 'green' },
              // "View everything" as a lane, not a hidden menu item: a delete
              // that archives is only honestly reversible if the archive is a
              // place you can go.
              { id: 'deleted', label: 'Deleted', color: 'gray' },
            ]}
            activeTab={lane}
            onTabChange={(id) => setLane(parseLane(id))}
            solidTone="accent"
            trailing={
              <WorkbenchTrailingCluster
                divide={false}
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setLane('open')}
                    icon={<Plus className="h-4 w-4" />}
                  >
                    Add
                  </Button>
                }
              />
            }
          />
        )}
        triage={() => (
          <WorkbenchTriageBand
            search={
              <TechRailSearchBar
                variant="chrome"
                value={query}
                onChange={setQuery}
                placeholder="Filter tasks…"
                className="min-w-0 flex-1"
              />
            }
            right={
              totals.count > 0 ? (
                <span className="text-role-caption tabular-nums text-text-muted">
                  <span className="font-semibold text-text-default">{totals.measures.done}</span>
                  {` / ${totals.count} done`}
                </span>
              ) : null
            }
            trailing={
              <WorkbenchInspectorToggle
                open={selected != null}
                onOpenEmpty={() => {
                  const first = rows[0];
                  if (first) selectTask(first.id);
                }}
              />
            }
          />
        )}
      >
        {() => (
          <>
            <NonlinearTableHost<StaffTaskRow, TasksGridColumnKey, TasksGridColumn>
              binding={TASKS_TABLE_BINDING}
              tableId="tasks"
              columns={TASKS_GRID_COLUMNS}
              orderGroupsByDate={groups}
              rows={rows}
              getRowId={(r) => String(r.id)}
              sort={columnSort}
              dir={sortDir}
              onSortChange={setSort}
              loading={tasks.loading}
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
              renderColumnHeader={({ onResizeColumn, onResetColumn, columns: visible }) => (
                <TasksGridColumnHeader
                  columns={visible}
                  activeSort={columnSort}
                  sortDir={sortDir}
                  onSortColumn={toggleColumnSort}
                  onResizeColumn={onResizeColumn}
                  onResetColumn={onResetColumn}
                  tableId="tasks"
                />
              )}
              renderGroup={(group, _stripe, { columns: visible }) => (
                <>
                  {group.rows.map((row) => (
                    <TasksGridRow
                      key={row.id}
                      row={row}
                      columns={visible}
                      selected={selectedId === row.id}
                      togglePending={tasks.pending}
                      onToggle={(r) => tasks.toggle(r, !r.done)}
                      onSelect={(r) => selectTask(r.id)}
                    />
                  ))}
                </>
              )}
              renderRow={(row, _stripe, { columns: visible }) => (
                <TasksGridRow
                  key={row.id}
                  row={row}
                  columns={visible}
                  selected={selectedId === row.id}
                  togglePending={tasks.pending}
                  onToggle={(r) => tasks.toggle(r, !r.done)}
                  onSelect={(r) => selectTask(r.id)}
                />
              )}
            />
            {lane === 'deleted' ? null : (
              <TasksComposerRow
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={submitDraft}
                pending={tasks.createPending}
                stationLabel={composerStation}
              />
            )}
          </>
        )}
      </WorkbenchSheetView>

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
