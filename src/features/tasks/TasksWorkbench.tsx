'use client';

/**
 * Home → Tasks — org project tasks as a Kinetic Ledger sheet.
 *
 * THESIS: triage project work on the same DataTable + left Morphing grammar as
 * To-ship, not a Zoho board and not a personal checkbox list.
 * OWN-WORLD: compound tracks, Morphing left-start, DataTableFilterMenu funnel.
 * STORY: pick a row, act, ping in the left mouth — stay in Cycle Forge.
 * FIRST VIEWPORT: search · filter · Open/Done/Canceled · compound rows; Add
 * task / New project in the desk header; composer summoned under the grid.
 * FORM: extension of Home Tasks inside the incumbent Warehouse OS world.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable } from '@/components/tables/DataTable';
import { singleBand, type RowGroup } from '@/lib/group-rows';
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
import { projectTaskCompoundView } from './grid/project-task-compound-view';
import { TASKS_GRID_CAPABILITIES } from './grid/tasks-grid-descriptor';
import { TasksComposerRow, type TasksComposerKind } from './TasksComposerRow';
import { TaskMorphingRowActionMenu } from './TaskMorphingRowActionMenu';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import { useProjectTasks, type TasksDeskLane, type TasksDeskScope } from './useProjectTasks';
import { applyMorphingGutterClick } from '@/lib/outbound/morphing-row-action';
import type { TaskRow } from '@/lib/ops-plans/types';
import {
  PROJECT_TASK_MIME,
  setSelectedWorkingTask,
  type WorkingTaskRef,
} from '@/lib/ops-plans/working-set';
import { toast } from '@/lib/toast';
import type { DataTableFilterChrome } from '@/components/tables/DataTable';

const TASK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLane(raw: string | null): TasksDeskLane {
  return raw === 'done' || raw === 'canceled' ? raw : 'open';
}

function parseScope(raw: string | null): TasksDeskScope {
  return raw === 'all' ? 'all' : 'mine';
}

function parseTaskId(raw: string | null): string | null {
  return raw && TASK_ID_RE.test(raw) ? raw : null;
}

function parseProjectId(raw: string | null): string | null {
  return raw && TASK_ID_RE.test(raw) ? raw : null;
}

function toRef(row: TaskRow): WorkingTaskRef {
  return {
    id: row.id,
    title: row.title,
    planId: row.planId,
    planTitle: row.planTitle,
  };
}

const TASK_LANE_TABS = [
  { id: 'done', label: 'Done' },
  { id: 'canceled', label: 'Canceled' },
] as const;

export function TasksWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;

  const { effectiveLayout: tasksLayout, fields: tasksFields } = useTasksTableLayout();
  const tasksColumns = useMemo(() => tasksCompoundColumnsFor(tasksLayout), [tasksLayout]);
  const [draft, setDraft] = useState('');
  const [query, setQueryState] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<TasksComposerKind>('task');
  const [morphingTaskId, setMorphingTaskId] = useState<string | null>(null);
  const [morphingAnchorReady, setMorphingAnchorReady] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const composerRef = useRef<HTMLInputElement>(null);
  const morphingAnchorRef = useRef<HTMLElement | null>(null);

  const lane = parseLane(searchParams.get('filter'));
  const scope = parseScope(searchParams.get('scope'));
  const projectId = parseProjectId(searchParams.get('project'));
  const selectedId = parseTaskId(searchParams.get('task'));

  const tasks = useProjectTasks({
    lane,
    scope,
    planId: projectId,
    query,
    enabled: staffId != null,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
    (id: string | null, row?: TaskRow | null) => {
      writeParams((p) => {
        if (id == null) p.delete('task');
        else p.set('task', id);
      });
      setSelectedWorkingTask(row ? toRef(row) : null);
    },
    [writeParams],
  );

  const setLane = useCallback(
    (next: TasksDeskLane) => {
      writeParams((p) => {
        if (next === 'open') p.delete('filter');
        else p.set('filter', next);
        p.delete('task');
      });
      setMorphingTaskId(null);
      setSelectedWorkingTask(null);
    },
    [writeParams],
  );

  const setScope = useCallback(
    (next: TasksDeskScope, opts?: { keepTask?: boolean }) => {
      writeParams((p) => {
        if (next === 'mine') p.delete('scope');
        else p.set('scope', next);
        if (!opts?.keepTask) p.delete('task');
      });
    },
    [writeParams],
  );

  const setProject = useCallback(
    (id: string | null) => {
      writeParams((p) => {
        if (!id) p.delete('project');
        else {
          p.set('project', id);
          p.set('scope', 'all');
        }
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
  } = useUrlColumnSort<TasksSortFact>({
    isColumn: isTasksSortFact,
    defaultDir: defaultDirForTasksGridSort,
  });

  const rows = useMemo(() => {
    const source = tasks.rows;
    if (!columnSort || !sortDir) {
      return [...source].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    }
    const type = TASKS_SORT_FACT_TYPES[columnSort];
    const value = (r: TaskRow) => {
      switch (columnSort) {
        case 'task':
          return r.title;
        case 'status':
          return r.status;
        case 'kind':
        case 'station':
          return r.station;
        case 'due':
          return r.dueAt ? Date.parse(r.dueAt) : null;
        case 'updated':
          return Date.parse(r.updatedAt);
        case 'project':
        case 'order':
          return r.planTitle;
        case 'assignee':
          return r.assigneeName;
        case 'amount':
          return null;
        default:
          return null;
      }
    };
    return [...source].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir: sortDir });
      return primary !== 0 ? primary : a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
    });
  }, [tasks.rows, columnSort, sortDir]);

  const groups = useMemo(
    () => singleBand(rows, (r) => r.id) as [string, RowGroup<TaskRow>[]][],
    [rows],
  );

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const morphingTask = rows.find((r) => r.id === morphingTaskId) ?? null;

  useLayoutEffect(() => {
    if (!morphingTaskId) {
      morphingAnchorRef.current = null;
      setMorphingAnchorReady(false);
      return;
    }
    const row = document.querySelector(
      `[data-ops-plan-task-id="${CSS.escape(morphingTaskId)}"]`,
    );
    if (!(row instanceof HTMLElement)) {
      morphingAnchorRef.current = null;
      setMorphingAnchorReady(false);
      return;
    }
    const gutter = row.querySelector(
      'button[aria-label*="Select"], button[aria-label*="Deselect"], input[type="checkbox"]',
    );
    morphingAnchorRef.current = gutter instanceof HTMLElement ? gutter : row;
    setMorphingAnchorReady(true);
  }, [morphingTaskId, rows]);

  const activeProject =
    tasks.plans.find((p) => p.id === projectId) ??
    (selected ? tasks.plans.find((p) => p.id === selected.planId) : undefined) ??
    tasks.plans[0] ??
    null;
  const planIdForCreate =
    projectId ?? selected?.planId ?? activeProject?.id ?? rows[0]?.planId ?? null;
  const planTitleForCreate =
    activeProject?.title || selected?.planTitle || rows[0]?.planTitle || 'a project';

  const submitDraft = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      if (composerKind === 'project') {
        const { plan } = await tasks.createPlan({ title: text });
        setDraft('');
        setComposerOpen(false);
        setProject(plan.id);
        toast.success('Project created');
        return;
      }
      if (!planIdForCreate) {
        toast.error('Create a project first');
        setComposerKind('project');
        return;
      }
      const created = await tasks.createTask({
        planId: planIdForCreate,
        title: text,
        assigneeStaffId: staffId,
      });
      setDraft('');
      setComposerOpen(false);
      selectTask(created.task.id, created.task);
      setMorphingTaskId(created.task.id);
      toast.success('Task added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }, [composerKind, draft, planIdForCreate, selectTask, setProject, staffId, tasks]);

  const openComposer = useCallback(
    (kind: TasksComposerKind) => {
      setComposerKind(kind);
      setComposerOpen(true);
      if (draft.trim() && composerKind === kind) {
        void submitDraft();
        return;
      }
      composerRef.current?.focus();
    },
    [composerKind, draft, submitDraft],
  );

  useEffect(() => {
    if (composerOpen) composerRef.current?.focus();
  }, [composerOpen]);

  const filter = useMemo<DataTableFilterChrome>(() => {
    const options = [
      {
        id: 'scope:all',
        label: 'Everyone',
        group: 'Scope',
        active: scope === 'all',
      },
      ...tasks.plans.map((plan) => ({
        id: `project:${plan.id}`,
        label: plan.title,
        group: 'Project',
        active: projectId === plan.id,
      })),
    ];
    return {
      options,
      onToggle: (id) => {
        if (id === 'scope:all') {
          setScope(scope === 'all' ? 'mine' : 'all');
          return;
        }
        if (id.startsWith('project:')) {
          const next = id.slice('project:'.length);
          setProject(projectId === next ? null : next);
        }
      },
      onClearAll: () => {
        setScope('mine');
        setProject(null);
      },
    };
  }, [projectId, scope, setProject, setScope, tasks.plans]);

  const headerActions = useMemo(
    () => (
      <>
        <DeskHeaderAction
          variant="secondary"
          size="sm"
          onClick={() => openComposer('project')}
        >
          New project
        </DeskHeaderAction>
        <DeskHeaderAction
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden className="h-3.5 w-3.5" />}
          onClick={() => openComposer('task')}
          data-testid="tasks-header-add-task"
        >
          Add task
        </DeskHeaderAction>
      </>
    ),
    [openComposer],
  );

  const renderTaskRow = (row: TaskRow, visible: readonly TasksGridColumn[]) => {
    const checked = selectedId === row.id;
    return (
      <CompoundRow
        key={row.id}
        data-ops-plan-task-id={row.id}
        role="button"
        tabIndex={0}
        draggable
        aria-pressed={checked}
        aria-label={`Task ${row.title}`}
        className="group/row cursor-pointer"
        onDragStart={(event) => {
          event.dataTransfer.setData(PROJECT_TASK_MIME, JSON.stringify(toRef(row)));
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => {
          selectTask(row.id, row);
          setMorphingTaskId(row.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectTask(row.id, row);
            setMorphingTaskId(row.id);
          }
        }}
        columns={visible}
        capabilities={TASKS_GRID_CAPABILITIES}
        selected={checked}
        view={{
          slots: tasksSlotValuesFor(row, visible),
          ...projectTaskCompoundView(row, { nowMs }),
        }}
        onOpen={() => {
          selectTask(row.id, row);
          setMorphingTaskId(row.id);
        }}
        onStateOpen={() => {
          selectTask(row.id, row);
          setMorphingTaskId(row.id);
        }}
        select={{
          checked,
          onToggle: (event) => {
            applyMorphingGutterClick({
              isChecked: checked,
              shiftKey: event.shiftKey,
              onToggle: () => {
                if (checked) {
                  selectTask(null);
                  setMorphingTaskId(null);
                } else {
                  selectTask(row.id, row);
                }
              },
              onOpenMenu: () => setMorphingTaskId(row.id),
              onCloseMenu: () => setMorphingTaskId(null),
            });
          },
          disabled: tasks.pending,
          label: checked ? `Deselect "${row.title}"` : `Select "${row.title}" and open actions`,
        }}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<TaskRow, TasksGridColumnKey, TasksGridColumn>
        binding={TASKS_TABLE_BINDING}
        columns={tasksColumns}
        fields={tasksFields}
        orderGroupsByDate={groups}
        rows={rows}
        getRowId={(r) => r.id}
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
        filter={filter}
        tabs={TASK_LANE_TABS}
        activeTab={lane === 'open' ? undefined : lane}
        onTabChange={(id) => setLane(id === lane ? 'open' : parseLane(id))}
        emptyMessage={
          tasks.isError
            ? 'Could not load tasks.'
            : query.trim() !== ''
              ? 'No task matches that search.'
              : lane === 'canceled'
                ? 'Nothing canceled.'
                : lane === 'done'
                  ? 'Nothing done yet.'
                  : projectId
                    ? 'No open tasks in this project. Use Add task.'
                    : scope === 'mine'
                      ? 'No tasks assigned to you. Use Add task, or filter to Everyone.'
                      : 'No open tasks. Use Add task.'
        }
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((row) => renderTaskRow(row, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => renderTaskRow(row, visible)}
      />
      {morphingTask && morphingAnchorReady ? (
        <TaskMorphingRowActionMenu
          task={morphingTask}
          open
          onClose={() => setMorphingTaskId(null)}
          anchorRef={morphingAnchorRef}
          onPatch={async (body) => {
            const result = await tasks.patch({ taskId: morphingTask.id, body });
            if (
              body.assigneeStaffId != null &&
              staffId != null &&
              body.assigneeStaffId !== staffId
            ) {
              setScope('all', { keepTask: true });
            }
            return result;
          }}
          onComplete={() => tasks.complete(morphingTask.id)}
        />
      ) : null}
      <DeskActionSlotRegistrar>{headerActions}</DeskActionSlotRegistrar>

      {!composerOpen ? null : (
        <TasksComposerRow
          kind={composerKind}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => void submitDraft()}
          pending={tasks.createPending}
          contextLabel={planTitleForCreate}
          inputRef={composerRef}
        />
      )}
    </div>
  );
}
