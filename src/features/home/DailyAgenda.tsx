'use client';

/**
 * Daily (`/`) — the whole agenda as ONE triage list (owner 2026-09-28: the
 * Daily page is a readable, triageable task list, never an industrial
 * ledger): one multi-row `RecordCard` per record inside `TriageCardList`.
 * ## Three stores, one display (operator 2026-09-25)
 * The daily checklist, handed-over tasks and helpdesk tickets read in the same
 * card list. The sidebar owns the lens (`?tab=`), status (`?filter=`), and scope
 * (`?scope=`); the header Find owns `?q=`. The open record (`?task=` /
 * `?check=`) reads in the record plane and J / K walk the list.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { Button } from '@/design-system/primitives';
import {
  RecordLedgerSummaryPane,
  RecordLedgerTally,
  type RecordLedgerSummary,
} from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useAuth } from '@/contexts/AuthContext';
import type { RowGroup } from '@/lib/group-rows';
import {
  DAILY_AGENDA_BAND_ORDER,
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  sortDailyAgendaRows,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import { AGENDA_LENS_LABEL, agendaLensMatches, parseAgendaLens } from '@/lib/daily/agenda-lens';
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
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { toast } from '@/lib/toast';
import { DAILY_AGENDA_VIEW } from '@/lib/triage/views';
import { useTaskDesk, type TaskDeskScope } from '@/features/tasks/useTaskDesk';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { TaskEvidence } from '@/features/tasks/workspace/TaskEvidence';
import { buildDailyTaskRows } from './grid/daily-task-row';
import { DailyAgendaComposer } from './DailyAgendaComposer';
import { AgendaRecentRail } from './AgendaRecentRail';
import { AgendaCard, AgendaRecordStatus, type AgendaRowModel } from './AgendaRow';
import { DailyEntrance } from './DailyEntrance';
import { ChecklistEvidence, type ChecklistSchedulePatch } from './ChecklistEvidence';
import { parseDailyStatusFilter } from './daily-check-filter';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { paintMarkId } from '@/lib/observability/tier1-paint-order';

const VIEW = DAILY_AGENDA_VIEW;


const SCOPE_TABS = [
  { id: 'mine', label: 'Mine' },
  { id: 'handed', label: 'Handed off' },
  { id: 'everyone', label: 'Everyone' },
] as const satisfies readonly { id: TaskDeskScope; label: string }[];

function parseScope(raw: string | null): TaskDeskScope {
  return raw === 'handed' || raw === 'everyone' ? raw : 'mine';
}

/** No face chips: All / Open / Done is the host's own `?filter=` switch. */
const NO_CHIPS: readonly never[] = [];

/**
 * The triage face speaks numeric record ids (selection, the record cursor,
 * `data-desk-record-key`); an agenda row is keyed `<type>:<id>` across two
 * stores. Tasks and tickets share the task table's ids (`?task=`), the
 * checklist has its own: even ids are work, odd ids checklist items —
 * deterministic on the server and in the browser, positive, reversible.
 */
function agendaRecordId(store: 'checklist' | 'work', id: number): number {
  return store === 'checklist' ? id * 2 + 1 : id * 2;
}
const agendaRowId = (row: DailyAgendaRow): number => agendaRecordId(row.type === 'checklist' ? 'checklist' : 'work', row.id);
const agendaGroupKey = (group: RowGroup<DailyAgendaRow>): string => group.key;
const noChips = (): readonly never[] => NO_CHIPS;

/** The rows banded by store, in the agenda's band order (checklist first, tickets last). */
function agendaBands(rows: readonly DailyAgendaRow[]): [string, RowGroup<DailyAgendaRow>[]][] {
  return DAILY_AGENDA_BAND_ORDER.flatMap((type): [string, RowGroup<DailyAgendaRow>[]][] => {
    const groups = rows.filter((row) => row.type === type).map((row) => ({ key: row.key, rows: [row] }));
    return groups.length ? [[type, groups]] : [];
  });
}

/** Can the viewer tick this row: a checklist only on today, a task unless withdrawn. */
function tickable(row: DailyAgendaRow, isToday: boolean): boolean {
  return row.type === 'checklist' ? isToday : row.status !== 'CANCELED';
}

const NO_TASK_ROWS: readonly TaskDeskRow[] = [];
/** Stable no-op subscription: the hydration snapshot below never changes after mount. */
const subscribeNothing = () => () => {};

/** Stamped once the agenda's first real rows (or its empty/error state) render. */
export const DAILY_PRIMARY_PAINT_MARK = paintMarkId('daily', 'primary');
/** The list's DOM hook (`data-testid`). */
export const DAILY_LEDGER_TEST_ID = VIEW.bodyTestId;

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
      const next = readLiveSearchParams(searchParams.toString());
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

  const lensed = useMemo(() => searched.filter((row) => agendaLensMatches(row, lens)), [searched, lens]);
  const visible = useMemo(
    () => (status === 'all' ? lensed : lensed.filter((row) => (status === 'done' ? row.done : !row.done))),
    [lensed, status],
  );
  // ── the list's bands, through the face's cut (held-new) ──────────────────
  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo(() => agendaBands(visible), [visible]);
  const bands = useMemo(() => filterBands(allBands, agendaGroupKey, noChips), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const setParam = useCallback(
    (key: string, value: string | null) => writeParams((p) => (value ? p.set(key, value) : p.delete(key))),
    [writeParams],
  );

  /**
   * `task:12` / `ticket:12` open through `?task=`, `checklist:7` through
   * `?check=`. The open record moves within the loaded list: History API, no
   * server round-trip (J / K stay instant).
   */
  const writeOpen = useCallback(
    (key: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      params.delete('task');
      params.delete('check');
      if (key) {
        const [type, id] = key.split(':');
        params.set(type === 'checklist' ? 'check' : 'task', id ?? '');
      }
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
    },
    [searchParams],
  );
  const openAgendaRow = useCallback((row: DailyAgendaRow) => writeOpen(row.key), [writeOpen]);
  const closeRecord = useCallback(() => writeOpen(null), [writeOpen]);
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

  // ── the open record ──────────────────────────────────────────────────────
  // The list keys work rows `task:` / `ticket:`; the URL only knows the id.
  const openRow = openKey?.startsWith('work:')
    ? rows.find((row) => row.type !== 'checklist' && `work:${row.id}` === openKey) ?? null
    : rows.find((row) => row.key === openKey) ?? null;
  // A link naming a record this view does not hold still opens the plane (its notice says why).
  const openId = openRow
    ? agendaRowId(openRow)
    : openKey
      ? agendaRecordId(openKey.startsWith('checklist:') ? 'checklist' : 'work', Number(openKey.split(':')[1]))
      : null;
  const openTask = openRow && openRow.type !== 'checklist' ? taskRows.find((t) => t.id === openRow.id) ?? null : null;
  const openCheckTicket =
    openRow?.type === 'checklist'
      ? (checksData?.items.find((item) => item.id === openRow.id)?.ticketId ?? null)
      : null;

  usePublishRecordCursor({
    surfaceId: 'daily-rows',
    scope: 'record',
    enabled: !composing,
    order: bands,
    openId,
    getId: agendaRowId,
    onOpen: openAgendaRow,
    onClose: closeRecord,
  });

  // ── the face ─────────────────────────────────────────────────────────────
  const selection = useLocalTriageSelection(agendaRowId);
  const nowMs = tasks.nowMs;
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: agendaRowId,
        groupKey: agendaGroupKey,
        cardModel: (group: RowGroup<DailyAgendaRow>): AgendaRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [agendaRowId(lead)], lead };
        },
        // A Find naming exactly one record's handle (order #, carton, ticket #) opens it.
        exactFind: (q: string, model: AgendaRowModel) => model.lead.recordLabel?.toLowerCase() === q,
        renderCard: (props: TriageCardSlotProps<DailyAgendaRow, AgendaRowModel>) => (
          <AgendaCard {...props} nowMs={nowMs} isToday={isToday} />
        ),
      }),
    [nowMs, isToday],
  );

  const selectedRows = useMemo(() => rows.filter((row) => selection.ids.has(agendaRowId(row))), [rows, selection.ids]);
  const setDone = useCallback(
    (done: boolean) => {
      for (const row of selectedRows) if (row.done !== done && tickable(row, isToday)) toggleRow(row);
      selection.setAll(false);
    },
    [selectedRows, isToday, toggleRow, selection],
  );

  const summary = useMemo(() => agendaSummary(searched, nowMs, isToday), [searched, nowMs, isToday]);

  const frame = (body: ReactNode) => (
    <DeskPageLayout className="h-full">
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
              onSelect={openAgendaRow}
              loading={loading}
              nowMs={nowMs}
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

  // `loading` is computed above the composer branch (it gates the paint mark).
  const error = !hydrated ? null : checks.isError ? 'Could not load the checklist.' : tasks.error;

  const feed: TriageFeed<DailyAgendaRow> = {
    bands,
    allBands,
    painted,
    // The store bands head the All lens; a store's own lens tab names it already.
    sectioned: lens === 'all',
    loading,
    fetching: loading,
    search: { value: query, pending: false },
    selection,
    open: { id: openId, open: openAgendaRow, close: closeRecord },
  };

  return (
    <DailyEntrance>
      {frame(
        <div
          className="flex min-h-0 min-w-0 flex-1"
        >
          <TriageCardList
            family={family}
            feed={feed}
            cut={cut}
            summary={null}
            bulk={
              <span className="flex items-center gap-2" data-testid="daily-bulk">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedRows.some((row) => !row.done && tickable(row, isToday))}
                  onClick={() => setDone(true)}
                  data-testid="daily-bulk-done"
                >
                  Mark done
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedRows.some((row) => row.done && tickable(row, isToday))}
                  onClick={() => setDone(false)}
                  data-testid="daily-bulk-reopen"
                >
                  Reopen
                </Button>
              </span>
            }
            banner={
              // Find (`?q=`) is the global header's page search (bare F) — one field per page, never inline here.
              <div className="flex min-w-0 items-center gap-3 px-4 pb-2" data-testid="daily-toolbar">
                {error ? (
                  <p role="alert" className="truncate text-sm text-text-warning" data-testid="daily-error">
                    {error}
                  </p>
                ) : null}
                <span className="ml-auto flex">
                  <RecordLedgerTally summary={summary} />
                </span>
              </div>
            }
            searchEmpty={
              query.trim() || status !== 'all' ? (
                <p className="text-sm text-text-muted">
                  {query.trim()
                    ? 'Nothing on the agenda matches that search.'
                    : status === 'done'
                      ? 'Nothing finished yet.'
                      : 'Everything is done.'}
                </p>
              ) : null
            }
            allClear={
              <TriageAllClear
                title="Nothing on the agenda"
                detail={`${AGENDA_LENS_LABEL[lens]} · ${SCOPE_TABS.find((tab) => tab.id === scope)?.label ?? ''}`}
              />
            }
            record={{
              title: openRow ? openRow.title : loading ? 'Loading…' : 'Not in this view',
              actions: openRow ? <AgendaRecordStatus row={openRow} nowMs={nowMs} isToday={isToday} /> : undefined,
              noun: openRow?.type === 'checklist' ? 'checklist item' : 'task',
              testId: 'daily-record',
              summary: <RecordLedgerSummaryPane summary={summary} />,
              strip: null,
              view:
                openKey == null ? null : (
                  <DeskRecordLayout
                    main={
                      openRow?.type === 'checklist' ? (
                        <ChecklistEvidence
                          row={openRow}
                          dateKey={dateKey}
                          ticketId={openCheckTicket}
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
                          nowMs={nowMs}
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
                ),
            }}
          />
        </div>,
      )}
    </DailyEntrance>
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
