'use client';

/**
 * Daily (`/`) — the per-staff shift checklist, on the one slot data table.
 *
 * Increment 1 of the port (2026-09-14). Scope 1 painted the checklist as a
 * hand-rolled inset column to prove the check → optimistic mark → strike loop;
 * this mounts that same loop on the house engine instead, so Daily gets the
 * toolbar every desk has — search, the filter menu beside it, header sort and
 * the fullscreen stage — without a second table existing anywhere.
 *
 * **The strike moved into the engine.** `titleStruck` is a `CompoundRowView`
 * field painted by {@link StruckLabel} in the shared item cell, so the
 * animation is the same one on every face that ever mounts this family — not a
 * copy in this file. Daily is the only family that sets it.
 *
 * PER STAFF by construction: the mark grain is (item, staff, day), and the rows
 * are built from `report.mine`, so ticking is an attestation by the signed-in
 * staffer. The note line carries the roster fraction (`3/5 done`) — what the
 * SHIFT did is a different question from what I did.
 *
 * Still deferred, deliberately, and all still on disk: the add / retire
 * composer (`DailyComposerRow`), the right-rail inspector
 * (`DailyCheckItemInspector`), the day stepper, glyphs and `#id` chips. Today
 * and Tasks stay unmounted with their backends intact.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  formatDateTimePST,
  getCurrentPSTDateKey,
  parseDateKey,
} from '@/utils/date';
import { DataTable } from '@/components/tables/DataTable';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { dailySlotValuesFor } from '@/lib/tables/field-catalog/daily-resolve';
import {
  dailyColumnKeyForSort,
  dailyCompoundColumnsFor,
  dailySortFactFor,
  defaultDirForDailyGridSort,
  isDailySortFact,
  type DailyGridColumn,
  type DailyGridColumnKey,
  type DailySortFact,
} from '@/lib/daily-checks/daily-grid-layout';
import { DAILY_TABLE_BINDING } from './grid/daily-table-definition';
import { DAILY_GRID_CAPABILITIES } from './grid/daily-grid-descriptor';
import { dailyTaskCompoundView } from './grid/daily-task-compound-view';
import { useDailyTableLayout } from './grid/useDailyTableLayout';
import { buildDailyTaskRows, type DailyTaskRow } from './grid/daily-task-row';
import { sortDailyTaskRows } from './grid/sort-daily-task-rows';
import { DailyComposerRow } from './DailyComposerRow';
import {
  filterDailyCheckItems,
  parseDailyStatusFilter,
  type DailyStatusFilter,
} from './daily-check-filter';
import { useDailyChecks, useItemActions, useToggleCheck } from '@/lib/daily-checks/use-daily-checks';
import {
  dailyComposerCreateBody,
  dailyComposerError,
  dailyComposerLinkInputs,
  newDailyComposerDraft,
  rememberGlyph,
  type DailyComposerDraft,
} from '@/lib/daily-checks/composer';
import { attachDailyCheckLinks } from '@/lib/daily-checks/use-daily-check-links';
/**
 * The status refinements, in the filter control beside search (operator ruling
 * 2026-08-30: selection tabs are filters).
 *
 * **`all` is the default and no option is active for it** (operator ruling
 * 2026-09-14: "when I check off something, it should not disappear from the
 * data table"). The workbench this replaced defaulted to `open`, so a tick
 * removed the row it had just struck — the strike animation played on a row
 * that was already being unmounted. A checklist has to show the work it has
 * finished; that IS the day's record. Both refinements are explicit choices
 * from here, and they are mutually exclusive.
 */
const DAILY_STATUS_OPTIONS = [
  { id: 'open', label: 'Open', status: 'open' },
  { id: 'completed', label: 'Completed', status: 'done' },
] as const satisfies readonly { id: string; label: string; status: DailyStatusFilter }[];

/**
 * One checklist row → the shared `CompoundRowView`, plus its materialized slot
 * values. `slots` is keyed off the MOUNTED column model, so a rebind re-points
 * the cell with no change here.
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
  /**
   * The LIST is org-managed — adding to it changes what every future report
   * measures, so the route gates on `admin.manage_staff` and the CTA asks the
   * same question. Absent permission ⇒ no control, never a disabled one.
   */
  const canManage = has('admin.manage_staff');
  const composerRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DailyComposerDraft>(newDailyComposerDraft);
  /**
   * The composer is SUMMONED by the CTA rather than permanently docked: Daily
   * is the first screen of a shift, and a row that sits there for everyone
   * costs vertical space on the one page every operator opens.
   */
  const [composerOpen, setComposerOpen] = useState(false);

  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const isToday = dateKey === todayKey;

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/');
    },
    [router, searchParams],
  );

  const { data, isLoading, isError } = useDailyChecks(dateKey);
  const toggle = useToggleCheck(dateKey);
  const { addItem } = useItemActions(dateKey);

  /**
   * Two-phase commit: create the item, then attach whatever links the draft
   * named. A link failure after creation leaves the ITEM standing — the honest
   * outcome, since the task exists — and the DRAFT keeps its links with the
   * title cleared, so a re-entry is one paste away, not a retyping.
   */
  const submitDraft = useCallback(() => {
    if (dailyComposerError(draft)) return;
    const parsed = dailyComposerLinkInputs(draft);
    if (!parsed.ok) return;
    const body = dailyComposerCreateBody(draft);
    addItem.mutate(body, {
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
        if (attached && draft.glyph) rememberGlyph(draft.glyph);
        setDraft(attached ? newDailyComposerDraft() : { ...draft, title: '' });
      },
    });
  }, [addItem, draft]);

  // The effective slot layout (staff ?? org ?? product) materialized into the
  // compound tracks — "what we check on the shift board" is layout an
  // organization owns, not a column file.
  const { effectiveLayout: dailyLayout, fields: dailyFields } = useDailyTableLayout();
  const dailyColumns = useMemo(() => dailyCompoundColumnsFor(dailyLayout), [dailyLayout]);

  const mine = data?.mine;
  const doneSet = useMemo(() => new Set(mine?.doneItemIds ?? []), [mine]);
  const query = searchParams.get('q') ?? '';
  // `all` when the param is absent — a ticked row keeps its seat.
  const status = parseDailyStatusFilter(searchParams.get('filter'));
  const visibleItems = useMemo(
    () => filterDailyCheckItems(data?.items ?? [], doneSet, query, status),
    [data?.items, doneSet, query, status],
  );

  // URL-backed sort, so a sorted checklist is a shareable link like every other
  // collection (`?colsort=` + `?dir=` when it differs from the column default).
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<DailySortFact>({
    isColumn: isDailySortFact,
    defaultDir: defaultDirForDailyGridSort,
  });

  const taskRows = useMemo(
    () => sortDailyTaskRows(buildDailyTaskRows(visibleItems, data, doneSet), columnSort, sortDir),
    [visibleItems, data, doneSet, columnSort, sortDir],
  );

  /** One band, no day headers — a checklist is one civil day by construction. */
  const taskGroups = useMemo(
    () => singleBand(taskRows, (r) => String(r.id)) as [string, RowGroup<DailyTaskRow>[]][],
    [taskRows],
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

  const setStatus = useCallback(
    (next: DailyStatusFilter) => {
      writeParams((p) => {
        // `all` is the absent param, never `?filter=all` — one spelling for
        // the unfiltered list, so a bookmark and a cleared menu agree.
        if (next === 'all') p.delete('filter');
        else p.set('filter', next === 'done' ? 'done' : 'open');
      });
    },
    [writeParams],
  );

  /**
   * The row, once. Group and leaf are the same row on this surface — the group
   * IS the task — so building it twice is how the two paths drift.
   *
   * The tick means "I did this today", not "this row is selected". Disabled on
   * a day the viewer may not mark; the mark itself is optimistic and idempotent.
   */
  const renderTaskRow = useCallback(
    (row: DailyTaskRow, visible: readonly DailyGridColumn[]) => (
      <CompoundRow
        key={row.id}
        data-daily-task-id={row.id}
        aria-label={`Task ${row.title}`}
        columns={visible}
        capabilities={DAILY_GRID_CAPABILITIES}
        // Nothing is "selected" here: the checkbox is the TICK, and a
        // selection highlight would claim a second meaning for one control.
        selected={false}
        // The family's only contribution: its DATA.
        view={dailyRowView(row, visible)}
        select={{
          checked: row.done,
          onToggle: () => toggle.mutate({ itemId: row.id, checked: !row.done }),
          disabled: !isToday,
          label: `Mark "${row.title}" ${row.done ? 'not done' : 'done'}`,
        }}
      />
    ),
    [isToday, toggle],
  );

  /**
   * The page CTA — top-right, the same `DeskHeaderAction` slot every desk's
   * primary verb rides (operator 2026-09-14: "there must be an add task CTA
   * on the top right, just like all the other CTAs"). Registered into the
   * desk chrome rather than docked over the table, so Daily's create verb
   * sits exactly where To-ship's and Receiving's do.
   *
   * Memoized: a fresh element identity every render re-registers every
   * render, which loops through the slot provider.
   *
   * Pressing it with text already typed COMMITS instead of re-focusing — the
   * operator has said what they want twice, and asking for a third gesture is
   * an interaction-budget regression.
   */
  const openComposer = useCallback(() => {
    if (status === 'done') setStatus('all');
    setComposerOpen(true);
    if (draft.title.trim() && !dailyComposerError(draft)) {
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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      {/*
       * The composer mounts ABOVE the table (operator ruling 2026-09-15):
       * the Add-task CTA lives top-right in the desk header, so the form it
       * summons belongs in the same region — eyes land where the click
       * happened, the exceptions desk's Resolve→editor stage is the
       * precedent. The table shrinks while open; the list stays visible so
       * "did I already add this?" stays answerable mid-entry.
       */}
      {canManage && isToday && composerOpen ? (
        <DailyComposerRow
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submitDraft}
          pending={addItem.isPending}
          error={addItem.error?.message ?? null}
          inputRef={composerRef}
        />
      ) : null}
      <DataTable<DailyTaskRow, DailyGridColumnKey, DailyGridColumn>
        binding={DAILY_TABLE_BINDING}
        // COMPOUND (two-row) WMS layout — the SAME tracks Unbox, History,
        // Testing, Incoming, To-Ship and Tasks mount. A shift-checklist item
        // has no photo, no order and no carrier, so those tracks read empty: a
        // data difference, and the only kind of difference between two of these
        // tables there is meant to be.
        columns={dailyColumns}
        fields={dailyFields}
        orderGroupsByDate={taskGroups}
        rows={taskRows}
        getRowId={(r) => String(r.id)}
        // A header click speaks in TRACK keys; Daily's `?colsort=` speaks in its
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
          options: DAILY_STATUS_OPTIONS.map((o) => ({
            id: o.id,
            label: o.label,
            active: status === o.status,
          })),
          // Re-picking the live refinement clears it back to the whole list —
          // the same toggle-off every facet menu in the product has.
          onToggle: (id) => {
            const picked = DAILY_STATUS_OPTIONS.find((o) => o.id === id);
            if (!picked) return;
            setStatus(status === picked.status ? 'all' : picked.status);
          },
          onClearAll: () => setStatus('all'),
        }}
        emptyMessage={
          isError
            ? 'Could not load the checklist.'
            : query.trim() !== ''
              ? 'No task matches that search.'
              : status === 'done'
                ? 'Nothing checked off yet today.'
                : status === 'open'
                  ? 'Everything on the list is checked off.'
                  : 'No tasks for this day.'
        }
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((row) => renderTaskRow(row, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => renderTaskRow(row, visible)}
      />
      <DeskActionSlotRegistrar>{addAction}</DeskActionSlotRegistrar>
    </div>
  );
}
