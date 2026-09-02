'use client';

/**
 * Home → Daily — shift checklist as a flush workbench sheet.
 *
 * There is no page chrome: {@link DataTable} draws the find field and the
 * status strip from data. The body is a Reminders-shaped list on a
 * permanent white sheet (`bg-surface-card`) — Unbox History gets that white
 * from the table surface class; Daily has no grid, so the host itself paints
 * it. The roster report stays on Operations (`?mode=checks`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCurrentPSTDateKey,
  parseDateKey,
} from '@/utils/date';
import { DailyCheckItemInspector } from '@/features/daily-checks/DailyCheckItemInspector';
import { DataTable } from '@/components/tables/DataTable';
import { rowGroupTotals, singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { compareGridValues } from '@/design-system/components/grid';
import { DAILY_TABLE_BINDING } from './grid/daily-table-definition';
import { formatDateTimePST } from '@/utils/date';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { dailyTaskCompoundView } from './grid/daily-task-compound-view';
import { useDailyTableLayout } from './grid/useDailyTableLayout';
import { dailySlotValuesFor } from '@/lib/tables/field-catalog/daily-resolve';
import { DAILY_GRID_CAPABILITIES } from './grid/daily-grid-descriptor';
import { buildDailyTaskRows, type DailyTaskRow } from './grid/daily-task-row';
import {
  dailyColumnKeyForSort,
  dailyCompoundColumnsFor,
  DAILY_SORT_FACT_TYPES,
  dailySortFactFor,
  defaultDirForDailyGridSort,
  isDailySortFact,
  type DailyGridColumn,
  type DailyGridColumnKey,
  type DailySortFact,
} from '@/lib/daily-checks/daily-grid-layout';
import { DailyComposerRow } from './DailyComposerRow';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import {
  filterDailyCheckItems,
  parseDailyStatusFilter,
} from './daily-check-filter';
import { useDailyChecks, useItemActions, useToggleCheck } from './useDailyChecks';

/**
 * The one status refinement — lives in the filter control (operator ruling
 * 2026-08-30: selection tabs are filters). `checks` (open) is the default, so
 * it IS the unfiltered list and no option is active for it.
 */
const DAILY_STATUS_OPTIONS = [{ id: 'completed', label: 'Completed' }] as const;

/**
 * One checklist row → the shared {@link CompoundRowView}, plus its materialized
 * slot values.
 *
 * Both render paths (group and leaf) are the same row on this surface — the
 * group IS the task — so the view is built in one place rather than twice, and
 * `slots` is keyed off the MOUNTED column model so a rebind re-points the cell
 * with no change here.
 */
function dailyRowView(row: DailyTaskRow, columns: readonly DailyGridColumn[]) {
  return {
    slots: dailySlotValuesFor(row, columns),
    ...dailyTaskCompoundView(row, {
      markedTip: row.done
        ? row.markedAt
          ? `You checked this off ${formatDateTimePST(row.markedAt)}`
          : 'You checked this off today'
        : 'Not checked off yet today',
    }),
  };
}

export function HomeDailyMode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has } = useAuth();
  const canManage = has('admin.manage_staff');
  const canReports = has('reports.view');
  const composerRef = useRef<HTMLInputElement>(null);

  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const isToday = dateKey === todayKey;

  const rawItem = searchParams.get('item');
  const selectedId = rawItem && /^\d+$/.test(rawItem) ? Number(rawItem) : null;

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/');
    },
    [router, searchParams],
  );

  const selectItem = useCallback(
    (id: number | null) => {
      writeParams((p) => {
        if (id == null) p.delete('item');
        else p.set('item', String(id));
      });
    },
    [writeParams],
  );

  const { data, isLoading, isError } = useDailyChecks(dateKey);

  // The effective slot layout (staff ?? org ?? product) materialized into the
  // compound tracks — "what we check on the shift board" is layout an
  // organization owns, not a column file.
  const { effectiveLayout: dailyLayout, fields: dailyFields } = useDailyTableLayout();
  const dailyColumns = useMemo(
    () => dailyCompoundColumnsFor(dailyLayout),
    [dailyLayout],
  );
  const toggle = useToggleCheck(dateKey);
  const { addItem, retireItem } = useItemActions(dateKey);
  const [draft, setDraft] = useState('');
  const [query, setQueryState] = useState('');
  /**
   * The composer is summoned by the page CTA rather than permanently docked.
   * Home is the first screen of a shift and this file's own frame docblock
   * cares about the vertical cost of anything that sits there for everyone.
   */
  const [composerOpen, setComposerOpen] = useState(false);

  const mine = data?.mine;
  const doneSet = useMemo(() => new Set(mine?.doneItemIds ?? []), [mine]);
  const status = parseDailyStatusFilter(searchParams.get('filter')) === 'done' ? 'done' : 'open';
  const visibleItems = useMemo(
    () => filterDailyCheckItems(data?.items ?? [], doneSet, query, status),
    [data?.items, doneSet, query, status],
  );
  // ── Table state ─────────────────────────────────────────────────────────
  // URL-backed sort, so a sorted checklist is a shareable link like every other
  // collection (`?sort=` + `?dir=` when it differs from the column's default).
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
    toggleColumnSort,
  } = useUrlColumnSort<DailySortFact>({
    isColumn: isDailySortFact,
    defaultDir: defaultDirForDailyGridSort,
  });

  const taskRows = useMemo(() => {
    const rows = buildDailyTaskRows(visibleItems, data, doneSet);
    if (!columnSort || !sortDir) {
      // The checklist's authored order is a real fact (`sortOrder`), so an
      // unsorted grid shows the list as the org wrote it — not insertion order.
      return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    const type = DAILY_SORT_FACT_TYPES[columnSort];
    const value = (r: DailyTaskRow) => {
      switch (columnSort) {
        case 'task':
          return r.title;
        // Sort by the STATE, not the word: `done` as 0/1 keeps Open above Done
        // under asc without depending on how the label happens to be spelled.
        case 'status':
          return r.done ? 1 : 0;
        case 'team':
          return r.teamTotal > 0 ? r.teamDone / r.teamTotal : null;
        case 'marked':
          return r.markedAt ? Date.parse(r.markedAt) : null;
        default:
          return null;
      }
    };
    return [...rows].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir: sortDir });
      // `compareGridValues` already applied `dir`; re-signing here would
      // re-invert blanks and undo the blanks-last ruling.
      return primary !== 0 ? primary : a.sortOrder - b.sortOrder || a.id - b.id;
    });
  }, [visibleItems, data, doneSet, columnSort, sortDir]);

  /**
   * The day's rollup, from the engine rather than counted in the view — the
   * same `rowGroupTotals` a pick list uses for "12 lines · 340 units · 3 short".
   */
  const dayTotals = useMemo(
    () => rowGroupTotals({ key: dateKey, rows: taskRows }, { done: (r) => (r.done ? 1 : 0) }),
    [dateKey, taskRows],
  );

  /** One band, no day headers — a checklist is one civil day by construction. */
  const taskGroups = useMemo(
    () => singleBand(taskRows, (r) => String(r.id)) as [string, RowGroup<DailyTaskRow>[]][],
    [taskRows],
  );

  const selected = data?.items.find((item) => item.id === selectedId) ?? null;

  const setQuery = useCallback((next: string) => setQueryState(next), []);

  const setStatus = useCallback(
    (next: ReturnType<typeof parseDailyStatusFilter>) => {
      writeParams((p) => {
        if (next === 'done') p.set('filter', 'done');
        else p.delete('filter');
      });
    },
    [writeParams],
  );
  const submitDraft = useCallback(() => {
    const title = draft.trim();
    if (!title) return;
    addItem.mutate(title, {
      onSuccess: () => setDraft(''),
    });
  }, [addItem, draft]);


  /**
   * The page CTA's handler — open the composer and put the caret in it.
   *
   * Adding to the shift checklist is what this page CREATES, so the control is
   * page-level and top-right (operator ruling; `DeskActionSlot`'s own law),
   * registered into the desk chrome's slot rather than docked under the grid.
   * The composer itself stays where a composer belongs — under the table, out
   * of the virtualized rows — but it is now summoned rather than permanently
   * occupying the first screen of a shift.
   *
   * Pressing it with text already typed COMMITS instead of re-focusing: the
   * operator has said what they want twice, and asking for a third gesture is
   * the interaction-budget regression the house rule names.
   */
  const openComposer = useCallback(() => {
    if (status === 'done') setStatus('open');
    setComposerOpen(true);
    if (draft.trim()) {
      submitDraft();
      return;
    }
    composerRef.current?.focus();
  }, [draft, status, setStatus, submitDraft]);

  // Focus lands after the composer has actually mounted — on the first open
  // the ref is still null when the click handler runs.
  useEffect(() => {
    if (composerOpen) composerRef.current?.focus();
  }, [composerOpen]);

  /**
   * Memoized: a fresh element identity every render re-registers every render,
   * which loops through the slot provider (its docblock says so).
   */
  const addAction = useMemo(
    () =>
      canManage && isToday ? (
        <DeskHeaderAction
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden className="h-3.5 w-3.5" />}
          onClick={openComposer}
        >
          Add task
        </DeskHeaderAction>
      ) : null,
    [canManage, isToday, openComposer],
  );

  const sessionsHref = `/reports?tab=sessions&date=${encodeURIComponent(dateKey)}`;
  const sessionsAction = useMemo(
    () =>
      canReports ? (
        <DeskHeaderAction
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => router.push(sessionsHref)}
        >
          Sessions
        </DeskHeaderAction>
      ) : null,
    [canReports, router, sessionsHref],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<DailyTaskRow, DailyGridColumnKey, DailyGridColumn>
        binding={DAILY_TABLE_BINDING}
        // COMPOUND (two-row) WMS layout — the SAME tracks Unbox,
        // History, Testing, Incoming, To-Ship and Tasks mount. A shift
        // checklist item has no photo, no order and no carrier, so those
        // tracks read empty: a data difference, and the only kind of
        // difference between two of these tables there is meant to be.
        columns={dailyColumns}
        fields={dailyFields}
        orderGroupsByDate={taskGroups}
        rows={taskRows}
        getRowId={(r) => String(r.id)}
        // A header click speaks in TRACK keys; `?colsort=` speaks in Daily's
        // own words. Map both ways through the MOUNTED model so a bookmarked
        // sort keeps its meaning after a rebind moves the fact to a new slot.
        sort={dailyColumnKeyForSort(dailyColumns, columnSort)}
        dir={sortDir}
        onSortChange={(key, nextDir) => {
          const fact = dailySortFactFor(
            dailyColumns.find((c) => c.key === key) ?? { key, sortable: true },
          );
          if (fact) setSort(fact, nextDir);
        }}
        loading={isLoading}
        search={{ value: query, onChange: setQuery, placeholder: 'Filter checks…' }}
        filter={{
          options: DAILY_STATUS_OPTIONS.map((o) => ({ ...o, active: status === 'done' })),
          onToggle: (id) => setStatus(id === 'completed' && status !== 'done' ? 'done' : 'open'),
          onClearAll: () => setStatus('open'),
        }}
        emptyMessage={
          isError
            ? 'Could not load the checklist.'
            : query.trim() !== ''
              ? 'No task matches that search.'
              : status === 'done'
                ? 'Nothing checked off yet today.'
                : 'No tasks for this day.'
        }
        // One band, one row per group — the group IS the task, so the
        // group renderer and the leaf renderer are the same row.
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>
            {group.rows.map((row) => (
            <CompoundRow
              key={row.id}
              data-daily-task-id={row.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedId === row.id}
              aria-label={`Task ${row.title}`}
              className="group/row cursor-pointer"
              onClick={() => selectItem(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectItem(row.id);
                }
              }}
              columns={visible}
              capabilities={DAILY_GRID_CAPABILITIES}
              selected={selectedId === row.id}
              // The family's only contribution: its DATA.
              view={dailyRowView(row, visible)}
              onOpen={() => selectItem(row.id)}
              // The tick means "I did this today", not "this row is
              // selected". Disabled on a day the viewer may not mark.
              select={{
                checked: row.done,
                onToggle: () => toggle.mutate({ itemId: row.id, checked: !row.done }),
                disabled: !isToday || toggle.isPending,
                label: `Mark "${row.title}" ${row.done ? 'not done' : 'done'}`,
              }}
            />
            ))}
          </>
        )}
        renderRow={(row, _stripe, { columns: visible }) => (
          <CompoundRow
            key={row.id}
            data-daily-task-id={row.id}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === row.id}
            aria-label={`Task ${row.title}`}
            className="group/row cursor-pointer"
            onClick={() => selectItem(row.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectItem(row.id);
              }
            }}
            columns={visible}
            capabilities={DAILY_GRID_CAPABILITIES}
            selected={selectedId === row.id}
            // The family's only contribution: its DATA.
            view={dailyRowView(row, visible)}
            onOpen={() => selectItem(row.id)}
            // The tick means "I did this today", not "this row is
            // selected". Disabled on a day the viewer may not mark.
            select={{
              checked: row.done,
              onToggle: () => toggle.mutate({ itemId: row.id, checked: !row.done }),
              disabled: !isToday || toggle.isPending,
              label: `Mark "${row.title}" ${row.done ? 'not done' : 'done'}`,
            }}
          />
        )}
      />
      <DeskActionSlotRegistrar role="overall">{sessionsAction}</DeskActionSlotRegistrar>
      <DeskActionSlotRegistrar>{addAction}</DeskActionSlotRegistrar>

      {canManage && isToday && composerOpen ? (
        <DailyComposerRow
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submitDraft}
          pending={addItem.isPending}
          inputRef={composerRef}
        />
      ) : null}

      <DailyCheckItemInspector
        item={selected}
        report={data}
        onClose={() => selectItem(null)}
        onRetire={
          canManage && isToday ? (itemId) => retireItem.mutate(itemId) : undefined
        }
        retirePending={retireItem.isPending}
      />
    </div>
  );
}
