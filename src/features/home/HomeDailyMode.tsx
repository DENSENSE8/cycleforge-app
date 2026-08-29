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

import { useCallback, useMemo, useRef, useState } from 'react';
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
import { DAILY_GRID_CAPABILITIES } from './grid/daily-grid-descriptor';
import { buildDailyTaskRows, type DailyTaskRow } from './grid/daily-task-row';
import {
  DAILY_COMPOUND_COLUMNS,
  DAILY_GRID_COLUMNS,
  defaultDirForDailyGridSort,
  isDailyGridSortable,
  type DailyGridColumn,
  type DailyGridColumnKey,
} from '@/lib/daily-checks/daily-grid-layout';
import { DailyComposerRow } from './DailyComposerRow';
import {
  filterDailyCheckItems,
  parseDailyStatusFilter,
} from './daily-check-filter';
import { useDailyChecks, useItemActions, useToggleCheck } from './useDailyChecks';

/**
 * The day strip. `checks` (open) is the default, so it IS the unfiltered list
 * and lights no tab — see {@link DataTable}.
 */
const DAILY_STATUS_TABS = [{ id: 'completed', label: 'Completed' }] as const;

export function HomeDailyMode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has } = useAuth();
  const canManage = has('admin.manage_staff');
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
  const toggle = useToggleCheck(dateKey);
  const { addItem, retireItem } = useItemActions(dateKey);
  const [draft, setDraft] = useState('');

  const mine = data?.mine;
  const doneSet = useMemo(() => new Set(mine?.doneItemIds ?? []), [mine]);
  const query = searchParams.get('q') ?? '';
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
  } = useUrlColumnSort<DailyGridColumnKey>({
    isColumn: isDailyGridSortable,
    defaultDir: defaultDirForDailyGridSort,
  });

  const taskRows = useMemo(() => {
    const rows = buildDailyTaskRows(visibleItems, data, doneSet);
    if (!columnSort || !sortDir) {
      // The checklist's authored order is a real fact (`sortOrder`), so an
      // unsorted grid shows the list as the org wrote it — not insertion order.
      return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    const type = DAILY_GRID_COLUMNS.find((c) => c.key === columnSort)?.type;
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


  const focusComposer = useCallback(() => {
    if (status === 'done') setStatus('open');
    if (draft.trim()) {
      submitDraft();
      return;
    }
    composerRef.current?.focus();
  }, [draft, status, setStatus, submitDraft]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<DailyTaskRow, DailyGridColumnKey, DailyGridColumn>
        binding={DAILY_TABLE_BINDING}
        // COMPOUND (two-row) WMS layout — the SAME tracks Unbox,
        // History, Testing, Incoming, To-Ship and Tasks mount. A shift
        // checklist item has no photo, no order and no carrier, so those
        // tracks read empty: a data difference, and the only kind of
        // difference between two of these tables there is meant to be.
        columns={DAILY_COMPOUND_COLUMNS}
        orderGroupsByDate={taskGroups}
        rows={taskRows}
        getRowId={(r) => String(r.id)}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
        loading={isLoading}
        search={{ value: query, onChange: setQuery, placeholder: 'Filter checks…' }}
        tabs={DAILY_STATUS_TABS}
        activeTab={status === 'done' ? 'completed' : undefined}
        onTabChange={(id) => setStatus(id === 'completed' && status !== 'done' ? 'done' : 'open')}
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
              view={dailyTaskCompoundView(row, {
                markedTip: row.done
                  ? row.markedAt
                    ? `You checked this off ${formatDateTimePST(row.markedAt)}`
                    : 'You checked this off today'
                  : 'Not checked off yet today',
              })}
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
            view={dailyTaskCompoundView(row, {
              markedTip: row.done
                ? row.markedAt
                  ? `You checked this off ${formatDateTimePST(row.markedAt)}`
                  : 'You checked this off today'
                : 'Not checked off yet today',
            })}
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
      {canManage && isToday ? (
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
