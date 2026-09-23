'use client';

/**
 * Daily (`/`) — the whole agenda, as ONE Reminders-style list, banded by TYPE.
 *
 * Operator 2026-09-22: *"consolidate the tasks into one display just under a
 * type, like type daily checklist and type task."*
 *
 * | Band | Store | Grain |
 * |---|---|---|
 * | Daily checklist | `daily_check_items` + `daily_check_marks` | per-day attestation, roster denominator, cadence |
 * | Task / Ticket | `work_assignments` `FOLLOW_UP` | an assignment with an assigner, a deadline and a priority |
 *
 * It was two tabs for a few hours, and a tab is a place you have to already
 * be. *What is on my plate today* is one list; the band caption says which
 * half a row came from. The STORES stay separate — the merge is display only,
 * and `daily-agenda-row.ts` is where the two shapes meet.
 *
 * ## The body is a LIST, not a grid (2026-09-23)
 *
 * This surface used to paint the same rows through the shared slot
 * `DataTable`. A table answers *compare these rows across five columns*; the
 * question this page exists for is *what do I still owe today*, which the
 * phone (`MobileDailyChecklist`) had already settled as a circle, a title and
 * one grey line. Two faces of one agenda disagreeing about what a row IS was
 * the defect. The paint now lives in {@link DailyRemindersList}; this file
 * keeps what it always owned — both feeds, both mutations, and the URL.
 *
 * ## The gutter is the TICK, on both halves
 *
 * Checking a checklist row writes a per-day mark; checking a task row PATCHes
 * it to `DONE`. One control, one meaning — "I finished this" — which is why
 * this surface renders its own rows rather than mounting the shared
 * `useCompoundSpreadsheet` feed: that hook's gutter is a multi-SELECT, and
 * routing a tick through it would give the header select-all the meaning
 * "mark everything done".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { SearchField } from '@/design-system/primitives/SearchField';
import { useAuth } from '@/contexts/AuthContext';
import {
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  isDailyAgendaWork,
  sortDailyAgendaRows,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
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
import { useTaskDesk } from '@/features/tasks/useTaskDesk';
import { TaskInspectorRail } from '@/features/tasks/TaskInspector';
import { buildDailyTaskRows } from './grid/daily-task-row';
import { DailyAgendaComposer } from './DailyAgendaComposer';
import { DailyRemindersList } from './DailyRemindersList';
import { AgendaRecentRail } from './AgendaRecentRail';
import {
  parseDailyStatusFilter,
  type DailyStatusFilter,
} from './daily-check-filter';

/**
 * The status refinements, as the segmented switch a list wears (the funnel menu
 * was table chrome). They narrow BOTH halves — "open" is an unticked checklist
 * item and an unfinished task, which is the same question asked of two stores.
 */
const DAILY_STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
] as const satisfies readonly { id: DailyStatusFilter; label: string }[];

export function DailyAgenda() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has } = useAuth();
  /**
   * The checklist LIST is org-managed — adding to it changes what every future
   * report measures — so it gates on `admin.manage_staff`. Throwing a TASK is
   * `work_orders.claim`, which every floor role holds, so the composer is
   * reachable either way and only its type switch narrows.
   */
  const canManage = has('admin.manage_staff');

  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const isToday = dateKey === todayKey;

  const composing = searchParams.get('compose') === '1';
  const rawTask = searchParams.get('task');
  const selectedTaskId = rawTask && /^\d+$/.test(rawTask) ? Number(rawTask) : null;
  const query = searchParams.get('q') ?? '';
  const status = parseDailyStatusFilter(searchParams.get('filter'));

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : '/', { scroll: false });
    },
    [router, searchParams],
  );

  // ── feeds ────────────────────────────────────────────────────────────────
  const checks = useDailyChecks(dateKey);
  const toggleCheck = useToggleCheck(dateKey);
  const { addItem } = useItemActions(dateKey);
  // `all` because this surface's own status filter is what narrows — asking
  // the route for one lane and then filtering again would be two filters
  // disagreeing about the same word.
  const tasks = useTaskDesk('all');

  const doneSet = useMemo(
    () => new Set(checks.data?.mine?.doneItemIds ?? []),
    [checks.data],
  );

  const rows = useMemo<DailyAgendaRow[]>(() => {
    const checklist = buildDailyTaskRows(checks.data?.items ?? [], checks.data, doneSet)
      .map(dailyAgendaFromChecklist);
    const assigned = tasks.rows.map(dailyAgendaFromTask);
    return sortDailyAgendaRows([...checklist, ...assigned]);
  }, [checks.data, doneSet, tasks.rows]);

  /**
   * Search narrows first and the status switch second, so the tab COUNTS
   * describe the list a click would actually produce. Counting the unsearched
   * agenda would promise rows the search has already hidden.
   */
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.title, row.ownerName ?? '', row.assignedByName ?? '', row.recordLabel ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const counts = useMemo(() => {
    const done = searched.filter((row) => row.done).length;
    return { all: searched.length, open: searched.length - done, done };
  }, [searched]);

  const visible = useMemo(() => {
    if (status === 'all') return searched;
    return searched.filter((row) => (status === 'done' ? row.done : !row.done));
  }, [searched, status]);

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
        // the unfiltered list, so a bookmark and a cleared switch agree.
        if (next === 'all') p.delete('filter');
        else p.set('filter', next === 'done' ? 'done' : 'open');
      });
    },
    [writeParams],
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

  const setComposing = useCallback(
    (open: boolean) => {
      writeParams((p) => {
        if (open) p.set('compose', '1');
        else p.delete('compose');
      });
    },
    [writeParams],
  );

  // ── the tick, branching on the row's store ───────────────────────────────
  const toggleRow = useCallback(
    (row: DailyAgendaRow) => {
      if (row.type === 'checklist') {
        toggleCheck.mutate({ itemId: row.id, checked: !row.done });
        return;
      }
      tasks.update.mutate({ id: row.id, patch: { status: row.done ? 'OPEN' : 'DONE' } });
    },
    [tasks.update, toggleCheck],
  );

  /**
   * A checklist mark belongs to a civil DAY, so it cannot be written for a day
   * that is not today. A task has no day — it has a deadline — so it stays
   * tickable while browsing an older checklist.
   */
  const canTick = useCallback(
    (row: DailyAgendaRow) => (row.type === 'checklist' ? isToday : true),
    [isToday],
  );

  /**
   * Only a WORK row has a plane to open; a checklist item has none, so it gets
   * no open gesture rather than an inspector with nothing in it.
   */
  const openRow = useCallback(
    (row: DailyAgendaRow) => {
      if (isDailyAgendaWork(row)) selectTask(row.id);
    },
    [selectTask],
  );

  // ── the checklist composer's draft, hoisted so the stage can own the CTA ──
  const [draft, setDraft] = useState<DailyComposerDraft>(newDailyComposerDraft);

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
        if (attached && draft.glyph) rememberGlyph(draft.glyph);
        setDraft(attached ? newDailyComposerDraft() : { ...draft, title: '' });
        if (attached) setComposing(false);
      },
    });
  }, [addItem, draft, setComposing]);

  /** Memoized — a fresh identity every render re-registers through the slot. */
  const addAction = useMemo(
    () => (
      <DeskHeaderAction
        variant="primary"
        size="sm"
        onClick={() => setComposing(true)}
        data-testid="agenda-add"
      >
        Add
      </DeskHeaderAction>
    ),
    [setComposing],
  );

  // A day that is not today cannot take a new checklist mark, and a composer
  // that could only ever write a task there would be a control that changes
  // meaning with the date — so the stage closes with the day.
  useEffect(() => {
    if (composing && !isToday) setComposing(false);
  }, [composing, isToday, setComposing]);

  const queueRail = (
    <AgendaRecentRail
      rows={rows}
      selectedTaskId={selectedTaskId}
      onSelect={(row) => (isDailyAgendaWork(row) ? selectTask(row.id) : undefined)}
      loading={checks.isLoading || tasks.loading}
      nowMs={tasks.nowMs}
    />
  );

  if (composing) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
        <DailyAgendaComposer
          queue={queueRail}
          onExit={() => setComposing(false)}
          onCreated={() => {
            tasks.refresh();
            setComposing(false);
          }}
          canAddChecklist={canManage && isToday}
          checklistDraft={draft}
          onChecklistDraftChange={setDraft}
          onChecklistSubmit={submitDraft}
          checklistPending={addItem.isPending}
          checklistError={addItem.error?.message ?? null}
        />
      </div>
    );
  }

  const selectedTask = tasks.rows.find((r) => r.id === selectedTaskId) ?? null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <div className="shrink-0 border-b border-border-hairline bg-surface-card">
        {/* The find/refine row rides the same 46rem measure as the list, so the
            search caret sits over the first circle instead of at the window
            edge on a wide desk. */}
        <div className="mx-auto flex w-full max-w-[46rem] items-center gap-3 px-4 py-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Filter the agenda…"
            className="min-w-0 flex-1"
          />
          <TabSwitch
            size="sm"
            fit="hug"
            countStyle="plain"
            tabs={DAILY_STATUS_TABS.map((tab) => ({
              id: tab.id,
              label: tab.label,
              count: counts[tab.id],
            }))}
            activeTab={status}
            onTabChange={(id) => setStatus(parseDailyStatusFilter(id === 'all' ? null : id))}
          />
        </div>
      </div>

      <DailyRemindersList
        rows={visible}
        nowMs={tasks.nowMs}
        selectedTaskId={selectedTaskId}
        canTick={canTick}
        onToggle={toggleRow}
        onOpen={openRow}
        loading={checks.isLoading || tasks.loading}
        error={checks.isError ? 'Could not load the checklist.' : (tasks.error ?? null)}
        emptyMessage={
          query.trim() !== ''
            ? 'Nothing on the agenda matches that search.'
            : status === 'done'
              ? 'Nothing finished yet today.'
              : status === 'open'
                ? 'Everything is done.'
                : 'Nothing on the agenda for this day.'
        }
      />

      <DeskActionSlotRegistrar>{addAction}</DeskActionSlotRegistrar>

      <TaskInspectorRail
        row={selectedTask}
        nowMs={tasks.nowMs}
        pending={tasks.update.isPending}
        onClose={() => selectTask(null)}
        onPatch={(id, patch) => tasks.update.mutate({ id, patch })}
      />
    </div>
  );
}
