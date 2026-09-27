'use client';

/**
 * Daily (`/`) — the whole agenda as ONE industrial record ledger.
 * ## Three stores, one display, tabs (operator 2026-09-25)
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SearchField } from '@/design-system/primitives/SearchField';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { useAuth } from '@/contexts/AuthContext';
import {
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  sortDailyAgendaRows,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import { AGENDA_LENSES, AGENDA_LENS_LABEL, agendaLensMatches, parseAgendaLens } from '@/lib/daily/agenda-lens';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
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
import { toast } from '@/lib/toast';
import { useTaskDesk, type TaskDeskScope } from '@/features/tasks/useTaskDesk';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { TaskEvidence } from '@/features/tasks/workspace/TaskEvidence';
import { cn } from '@/utils/_cn';
import { buildDailyTaskRows } from './grid/daily-task-row';
import { DailyAgendaComposer } from './DailyAgendaComposer';
import { AgendaRecentRail } from './AgendaRecentRail';
import { AgendaRecord } from './AgendaRecord';
import { ChecklistEvidence, type ChecklistSchedulePatch } from './ChecklistEvidence';
import { parseDailyStatusFilter, type DailyStatusFilter } from './daily-check-filter';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { paintMarkId } from '@/lib/observability/tier1-paint-order';
import { useDailySmoothScroll } from './useDailySmoothScroll';

const DAILY_STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
] as const satisfies readonly { id: DailyStatusFilter; label: string }[];

const SCOPE_TABS = [
  { id: 'mine', label: 'Mine' },
  { id: 'handed', label: 'Handed off' },
  { id: 'everyone', label: 'Everyone' },
] as const satisfies readonly { id: TaskDeskScope; label: string }[];

function parseScope(raw: string | null): TaskDeskScope {
  return raw === 'handed' || raw === 'everyone' ? raw : 'mine';
}

const recordKey = (row: DailyAgendaRow) => row.key;

const NO_TASK_ROWS: readonly TaskDeskRow[] = [];
/** Stable no-op subscription: the hydration snapshot below never changes after mount. */
const subscribeNothing = () => () => {};

/** Stamped once the agenda's first real rows (or its empty/error state) render — the welcome assembly reveals the agenda on it. */
export const DAILY_PRIMARY_PAINT_MARK = paintMarkId('daily', 'primary');
/** The ledger's DOM hook (`data-testid`). */
export const DAILY_LEDGER_TEST_ID = 'daily-ledger';

export function DailyAgenda() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has } = useAuth();
  /** The checklist LIST is org-managed — adding to it (or moving its due time) changes what every future report measures — so it gates on… */
  const canManage = has('admin.manage_staff');

  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const isToday = dateKey === todayKey;

  const composing = searchParams.get('compose') === '1';
  const rawTask = searchParams.get('task');
  const rawCheck = searchParams.get('check');
  const openKey = rawTask && /^\d+$/.test(rawTask)
    ? `work:${rawTask}`
    : rawCheck && /^\d+$/.test(rawCheck)
      ? `checklist:${rawCheck}`
      : null;
  const query = searchParams.get('q') ?? '';
  const status = parseDailyStatusFilter(searchParams.get('filter'));
  const lens = parseAgendaLens(searchParams.get('tab'));
  const scope = parseScope(searchParams.get('scope'));

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
  const { addItem, updateItem } = useItemActions(dateKey);
  // `all` lanes because this surface's own status tabs narrow — asking the
  // route for one lane and filtering again would be two filters disagreeing.
  const tasks = useTaskDesk('all', scope);
  // The server renders with an empty query cache, but the client's cache can
  // already hold these queries when this Suspense boundary hydrates
  // (WelcomeGate's prefetch runs in its layout effect, before the boundary
  // hydrates). Hydrate against the server's view — loading, no rows — and read
  // the cache from the next render on. `false` on the server and the
  // hydration pass only; a client-side navigation reads `true` at once.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const checksData = hydrated ? checks.data : undefined;
  const taskRows = hydrated ? tasks.rows : NO_TASK_ROWS;
  const loading = !hydrated || checks.isLoading || tasks.loading;
  useSurfacePaintMark(DAILY_PRIMARY_PAINT_MARK, !loading);
  /** The ledger's own list scroller — the ONLY element Lenis drives (never the window). */
  const ledgerScrollRef = useRef<HTMLDivElement>(null);
  useDailySmoothScroll(ledgerScrollRef);

  const doneSet = useMemo(() => new Set(checksData?.mine?.doneItemIds ?? []), [checksData]);

  const rows = useMemo<DailyAgendaRow[]>(() => {
    const checklist =
      scope === 'mine'
        ? buildDailyTaskRows(checksData?.items ?? [], checksData, doneSet).map(dailyAgendaFromChecklist)
        : [];
    return sortDailyAgendaRows([...checklist, ...taskRows.map(dailyAgendaFromTask)]);
  }, [checksData, doneSet, scope, taskRows]);

  /**
   * Search narrows first; the tab and status COUNTS then describe the list a
   * click would actually produce. Link labels are searched too, so a scanned
   * tracking number or order number finds the task that names it.
   */
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.title,
        row.description ?? '',
        row.ownerName ?? '',
        row.assignedByName ?? '',
        row.recordLabel ?? '',
        String(row.id),
        ...row.links.map((link) => link.label),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const lensCounts = useMemo(
    () => Object.fromEntries(AGENDA_LENSES.map((l) => [l, searched.filter((row) => agendaLensMatches(row, l)).length])),
    [searched],
  );
  const lensed = useMemo(() => searched.filter((row) => agendaLensMatches(row, lens)), [searched, lens]);
  const statusCounts = useMemo(() => {
    const done = lensed.filter((row) => row.done).length;
    return { all: lensed.length, open: lensed.length - done, done };
  }, [lensed]);
  const visible = useMemo(
    () => (status === 'all' ? lensed : lensed.filter((row) => (status === 'done' ? row.done : !row.done))),
    [lensed, status],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => writeParams((p) => (value ? p.set(key, value) : p.delete(key))),
    [writeParams],
  );

  /** `task:12` / `ticket:12` open through `?task=`, `checklist:7` through `?check=`. */
  const openRecord = useCallback(
    (key: string) => {
      const [type, id] = key.split(':');
      writeParams((p) => {
        p.delete('task');
        p.delete('check');
        p.set(type === 'checklist' ? 'check' : 'task', id);
      });
    },
    [writeParams],
  );
  const closeRecord = useCallback(
    () =>
      writeParams((p) => {
        p.delete('task');
        p.delete('check');
      }),
    [writeParams],
  );
  const setComposing = useCallback((open: boolean) => setParam('compose', open ? '1' : null), [setParam]);

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

  // ── the checklist composer's draft, hoisted so the stage can own the CTA ──
  const [draft, setDraft] = useState<DailyComposerDraft>(newDailyComposerDraft);

  /**
   * Two-phase commit: create the item, then attach whatever links the draft
   * named. A link failure after creation leaves the ITEM standing, and the
   * DRAFT keeps its links with the title cleared, so a re-entry is one paste.
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

  const addAction = useMemo(
    () => (
      <DeskHeaderAction variant="primary" size="sm" onClick={() => setComposing(true)} data-testid="agenda-add">
        Add task
      </DeskHeaderAction>
    ),
    [setComposing],
  );

  useEffect(() => {
    if (composing && !isToday) setComposing(false);
  }, [composing, isToday, setComposing]);

  const renderRecord = useCallback(
    (row: DailyAgendaRow, open: boolean) => (
      <AgendaRecord
        row={row}
        open={open}
        nowMs={tasks.nowMs}
        isToday={isToday}
        tickable={row.type === 'checklist' ? isToday : row.status !== 'CANCELED'}
        onOpen={openRecord}
        onToggle={toggleRow}
      />
    ),
    [isToday, openRecord, tasks.nowMs, toggleRow],
  );

  /** The page frame, with the LENS tabs in the desk chrome — top left, on the same row as Add — exactly where Shipping's desk tabs sit. */
  const lensTabs = AGENDA_LENSES.filter((l) => scope === 'mine' || l !== 'checklist').map((l) => ({
    id: l,
    label: AGENDA_LENS_LABEL[l],
    count: lensCounts[l],
  }));
  const frame = (body: ReactNode) => (
    <DeskPageLayout
      className="h-full"
      tabs={lensTabs}
      activeTab={lens}
      onTabChange={(id) => setParam('tab', id === 'all' ? null : id)}
    >
      <DeskActionSlotRegistrar>{addAction}</DeskActionSlotRegistrar>
      {body}
    </DeskPageLayout>
  );

  if (composing) {
    return frame(
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
        <DailyAgendaComposer
          queue={
            <AgendaRecentRail
              rows={rows}
              selectedTaskId={rawTask ? Number(rawTask) : null}
              onSelect={(row) => openRecord(row.key)}
              loading={loading}
              nowMs={tasks.nowMs}
            />
          }
          onExit={() => setComposing(false)}
          onCreated={(taskId, mine) => {
            tasks.refresh();
            // Land ON the new task, in the scope that holds it: a task handed
            // only to colleagues is not in `mine`, so it opens under Handed off.
            // The photos, videos and links are added from its record.
            writeParams((p) => {
              p.delete('compose');
              p.delete('check');
              if (taskId != null) {
                p.set('task', String(taskId));
                if (scope === 'mine' && !mine) p.set('scope', 'handed');
              }
            });
          }}
          canAddChecklist={canManage && isToday}
          checklistDraft={draft}
          onChecklistDraftChange={setDraft}
          onChecklistSubmit={submitDraft}
          checklistPending={addItem.isPending}
          checklistError={addItem.error?.message ?? null}
        />
      </div>,
    );
  }

  // The ledger keys work rows `task:` / `ticket:`; the URL only knows the id.
  const openRow = openKey?.startsWith('work:')
    ? rows.find((row) => row.type !== 'checklist' && `work:${row.id}` === openKey) ?? null
    : rows.find((row) => row.key === openKey) ?? null;
  const ledgerOpenKey = openRow?.key ?? openKey;
  const openTask = openRow && openRow.type !== 'checklist' ? taskRows.find((t) => t.id === openRow.id) ?? null : null;
  const openCheckTicket =
    openRow?.type === 'checklist'
      ? (checksData?.items.find((item) => item.id === openRow.id)?.ticketId ?? null)
      : null;

  // `loading` is computed above the composer branch (it gates the paint mark).
  const error = !hydrated ? null : checks.isError ? 'Could not load the checklist.' : tasks.error;

  return frame(
    <div data-welcome-focus="Daily agenda" data-welcome-focus-mark={DAILY_PRIMARY_PAINT_MARK} className="flex min-h-0 min-w-0 flex-1">
      <RecordLedger
        testId={DAILY_LEDGER_TEST_ID}
        label="Daily agenda"
        records={visible}
        recordKey={recordKey}
        renderRecord={renderRecord}
        openKey={ledgerOpenKey}
        onOpenKey={openRecord}
        onClose={closeRecord}
        loading={loading}
        scrollRef={ledgerScrollRef}
        toolbar={
          <>
            <SearchField
              value={query}
              onChange={(next) => setParam('q', next.trim() || null)}
              placeholder="Find a task, order #, tracking #, ticket or person…"
              className="min-w-0 max-w-[26rem] flex-1 overflow-hidden rounded-mode-control pl-2"
              tone="neutral"
              hideUnderline
              fillHost
            />
            <div className="ml-auto flex items-center gap-2 px-2">
              <TabSwitch
                size="sm"
                fit="hug"
                countStyle="plain"
                tabs={DAILY_STATUS_TABS.map((tab) => ({ id: tab.id, label: tab.label, count: statusCounts[tab.id] }))}
                activeTab={status}
                onTabChange={(id) => setParam('filter', id === 'all' ? null : id)}
              />
              <TabSwitch
                size="sm"
                fit="hug"
                tabs={SCOPE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
                activeTab={scope}
                onTabChange={(id) => setParam('scope', id === 'mine' ? null : id)}
              />
            </div>
          </>
        }
        banner={
          error ? (
            <div role="alert" className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-rule bg-mode-well px-3 py-2 text-mode-warn')}>
              {error}
            </div>
          ) : null
        }
        empty={
          <>
            <b className="text-role-body font-bold text-mode-ink">
              {query.trim()
                ? 'Nothing on the agenda matches that search.'
                : status === 'done'
                  ? 'Nothing finished yet.'
                  : status === 'open'
                    ? 'Everything is done.'
                    : 'Nothing on the agenda.'}
            </b>
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              {AGENDA_LENS_LABEL[lens]} · {SCOPE_TABS.find((tab) => tab.id === scope)?.label}
            </span>
          </>
        }
        recordTitle={openRow ? openRow.title : loading ? 'Loading…' : 'Not in this view'}
        recordNoun={openRow?.type === 'checklist' ? 'checklist item' : 'task'}
        summary={agendaSummary(searched, tasks.nowMs, isToday)}
        record={
          openKey == null ? null : (
            <DeskRecordLayout
              main={
                openRow?.type === 'checklist' ? (
                  <ChecklistEvidence
                    row={openRow}
                    dateKey={dateKey}
                    ticketId={openCheckTicket}
                    nowMs={tasks.nowMs}
                    isToday={isToday}
                    canTick={isToday}
                    canManage={canManage}
                    pending={updateItem.isPending}
                    onToggle={() => toggleRow(openRow)}
                    onSchedule={(patch: ChecklistSchedulePatch) =>
                      updateItem.mutate(
                        { itemId: openRow.id, ...patch },
                        { onError: (err) => toast.error(err.message) },
                      )
                    }
                  />
                ) : openTask ? (
                  <TaskEvidence
                    key={openTask.id}
                    row={openTask}
                    nowMs={tasks.nowMs}
                    pending={tasks.update.isPending}
                    onPatch={(patch) =>
                      tasks.update.mutateAsync({ id: openTask.id, patch }).catch((err: unknown) => {
                        toast.error(err instanceof Error ? err.message : 'Could not save the task.');
                        throw err;
                      })
                    }
                  />
                ) : (
                  <EvidenceNotice tone="warn">
                    {loading ? 'Loading…' : 'That record is not in this view — try another scope or tab.'}
                  </EvidenceNotice>
                )
              }
            />
          )
        }
      />
    </div>
  );
}

/** The agenda read as a whole — what needs a decision. */
function agendaSummary(rows: readonly DailyAgendaRow[], nowMs: number, isToday: boolean): RecordLedgerSummary {
  let open = 0;
  let late = 0;
  let urgent = 0;
  let reminders = 0;
  for (const row of rows) {
    if (row.done) continue;
    open += 1;
    const state = agendaRecordState(row, nowMs, isToday);
    if (state.late) late += 1;
    if (state.code === 'URG') urgent += 1;
    if (row.remindAtMs != null || row.remindOffsetMinutes != null) reminders += 1;
  }
  return {
    title: 'Agenda',
    facts: [
      { label: 'Open', value: open },
      { label: 'Past due', value: late, warn: late > 0, toolbar: true },
      { label: 'Urgent', value: urgent, warn: urgent > 0, toolbar: true },
      { label: 'Reminders', value: reminders },
    ],
    note: 'Open a record to see its instructions, photos, videos and linked orders.',
  };
}
