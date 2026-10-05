'use client';

/**
 * **Support items** — the `/support` desk body (owner 2026-10-04: Support is
 * its own workspace, built on the local model). RECORDS ONLY: the views
 * (`?view=`), Sort, Group by and the Platform / Account / Assignee facets
 * live in the left contextual sidebar; Find is the sidebar's field (`?q=`).
 *
 * The six LOCAL status chips (New · Open · Pending · On-hold · Solved ·
 * Closed) sit above the Support table, counted by the server
 * (`statusCounts`) and cut by the server through the same `?status=` the
 * chips write — the rows painted are the server's rows. The table
 * (`SupportTable`) is one single-height row per item: Order ID · Platform ·
 * Customer question; `?group=` bands it under sticky heads.
 *
 * `?item=` opens the record in the desk's `DeskRecordPlane`: the subject as
 * the title, the identity line (`SupportRecordHeader`), the ONE status verb
 * top-right (`SupportStatusVerb`), and the conversation as the whole body.
 *
 * Keys: N (and C, the page create — and the sidebar's New Support item) opens
 * `NewSupportItemForm` inline over the stage · S opens the record's status
 * verb · J / K step the records · Enter opens a focused row.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { RecordLedgerSummaryPane } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { useTriageUrlState } from '@/design-system/components/triage-card-list/triage-list-state';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { registerPageCreate } from '@/lib/keyboard/page-create-key';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { useRecordCursor, usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { SUPPORT_LOCAL_STATUSES, SUPPORT_LOCAL_STATUS_LABEL, type SupportLocalStatus } from '@/lib/support/conversation/model';
import { parseSupportListGroup, parseSupportListView, SUPPORT_LIST_VIEW_LABEL } from '@/lib/support/list/support-list';
import { SUPPORT_LIST_QUERY_KEY } from '@/lib/support/list/use-support-list';
import { useSupportItem } from '@/lib/support/record/use-support-item';
import { SupportConversationPanel } from './record/SupportConversationPanel';
import { SupportRecordHeader } from './record/SupportRecordHeader';
import { SUPPORT_LOCAL_STATUS_TONE, SUPPORT_RECORD_PARAM, SUPPORT_STATUS_PARAM, supportItemTitle } from './support-face';
import { supportDeskSummary } from './support-desk-summary';
import { supportTableBands } from './support-table';
import { NEW_SUPPORT_ITEM_LABEL, SupportNewItemStage } from './SupportNewItemStage';
import { SupportStatusVerb } from './SupportStatusVerb';
import { SupportTable } from './SupportTable';
import { useSupportDeskKeys } from './use-support-desk-keys';
import { useSupportDeskList } from './use-support-desk-list';

/** Statuses and "follow-up due" move in minutes; the record's relative times read this clock. */
const CLOCK_TICK_MS = 30_000;

const CREATE_PERMISSION = 'support.thread.manage';
const RECORD_PARAMS = [SUPPORT_RECORD_PARAM] as const;
/** The cursor's record id — module-level: callback identity keeps the published cursor from rebuilding every render. */
const supportRowId = (row: { itemId: number }) => row.itemId;

export function SupportDesk() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canCreate = has(CREATE_PERMISSION);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── The chips write `?status=` (canonical order); the server cuts by the same param ──
  const chipState = useTriageUrlState({ statusKeys: SUPPORT_LOCAL_STATUSES, recordParams: RECORD_PARAMS, statusParam: SUPPORT_STATUS_PARAM });
  const { statusFilter } = chipState;
  const { debounced, list, rows, statusCounts } = useSupportDeskList(statusFilter);

  // ── Bands: the server's order; one band per group under `?group=` ─────────
  const group = parseSupportListGroup(searchParams.get('group'));
  const view = parseSupportListView(searchParams.get('view'));
  const { bands, sectionHeaders } = useMemo(() => supportTableBands(rows, group), [rows, group]);

  // ── The open record: `?item=<support item id>` ───────────────────────────
  const itemRaw = Number(searchParams.get(SUPPORT_RECORD_PARAM));
  const openId = Number.isSafeInteger(itemRaw) && itemRaw > 0 ? itemRaw : null;
  const writeItem = useCallback(
    (itemId: number | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (itemId != null) params.set(SUPPORT_RECORD_PARAM, String(itemId));
      else params.delete(SUPPORT_RECORD_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );
  const openRecord = useCallback((row: { itemId: number }) => writeItem(row.itemId), [writeItem]);
  const closeRecord = useCallback(() => writeItem(null), [writeItem]);
  const openRow = useMemo(() => (openId == null ? null : (rows.find((row) => row.itemId === openId) ?? null)), [openId, rows]);
  // A deep link past the loaded list still has a title: the bundle names it.
  const openItem = useSupportItem(openId).data?.item ?? null;

  // ── Inline create (N · C · the sidebar's New Support item) ──────────────
  const [composing, setComposing] = useState(false);
  const startCreate = useCallback(() => setComposing(true), []);
  useNavIntent('support:create', canCreate ? startCreate : null);
  useEffect(() => (canCreate ? registerPageCreate({ label: NEW_SUPPORT_ITEM_LABEL, run: startCreate }) : undefined), [canCreate, startCreate]);
  const onCreated = useCallback(
    (href: string) => {
      void queryClient.invalidateQueries({ queryKey: SUPPORT_LIST_QUERY_KEY });
      setComposing(false);
      router.replace(href);
    },
    [queryClient, router],
  );

  // ── J / K through the record cursor; N · S ───────────────────────────────
  usePublishRecordCursor({
    surfaceId: 'support-items',
    scope: 'record',
    enabled: !composing,
    order: bands,
    openId,
    getId: supportRowId,
    onOpen: openRecord,
    onClose: closeRecord,
  });
  useRecordCursorKeyboard({ enabled: !composing, scope: 'record', escape: false });
  const cursor = useRecordCursor('record');

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  useEffect(() => {
    setStatusMenuOpen(false);
    setResolveOpen(false);
  }, [openId]);
  const openStatus = useCallback(() => setStatusMenuOpen(true), []);
  useSupportDeskKeys({ composing, onCreate: canCreate ? startCreate : null, recordOpen: openId != null, onStatus: openStatus });

  // ── The chips + the split pane's summary ─────────────────────────────────
  const chips = useMemo<StatusChip<SupportLocalStatus>[]>(
    () =>
      statusCounts
        ? SUPPORT_LOCAL_STATUSES.map((status) => ({
            id: status,
            label: SUPPORT_LOCAL_STATUS_LABEL[status],
            tone: SUPPORT_LOCAL_STATUS_TONE[status],
            count: statusCounts[status],
          }))
        : [],
    [statusCounts],
  );
  const summary = useMemo(() => supportDeskSummary(rows, statusCounts, view), [rows, statusCounts, view]);

  const narrowed = Boolean(debounced) || statusFilter.size > 0;
  const emptyMessage = debounced
    ? `No Support items match “${debounced}”.`
    : statusFilter.size > 0
      ? 'No Support items in these statuses.'
      : view
        ? `${SUPPORT_LIST_VIEW_LABEL[view]} is clear right now.`
        : 'No Support items yet. Press N to log one.';
  const recordTitle = openRow ? supportItemTitle(openRow) : openItem ? supportItemTitle({ itemId: openItem.id, subject: openItem.subject }) : 'Support item';

  const listPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="support-items" data-narrowed={narrowed || undefined}>
      {chips.length ? (
        <div className="shrink-0 pb-2 pt-3">
          <StatusChipRail chips={chips} active={statusFilter} onToggle={chipState.toggleStatus} onReset={chipState.resetStatus} testId="support-status-chips" />
        </div>
      ) : null}
      {list.isError ? (
        <div role="alert" className="shrink-0 px-1 py-2 text-sm text-text-warning" data-testid="support-list-error">
          {list.error instanceof Error ? list.error.message : 'Could not load Support items.'}
        </div>
      ) : null}
      <SupportTable
        rows={rows}
        bands={bands}
        sectionHeaders={sectionHeaders}
        loading={list.isLoading}
        openId={openId}
        onOpen={openRecord}
        emptyMessage={emptyMessage}
      />
    </div>
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <DeskRecordPlane
        open={openId != null}
        onClose={closeRecord}
        title={recordTitle}
        subtitle={openId != null ? <SupportRecordHeader itemId={openId} row={openRow} nowMs={nowMs} /> : undefined}
        indexLabel={cursor.available && cursor.position != null ? `${cursor.position} of ${cursor.total}` : undefined}
        actions={
          openId != null ? (
            <SupportStatusVerb
              itemId={openId}
              row={openRow}
              nowMs={nowMs}
              menuOpen={statusMenuOpen}
              onMenuOpenChange={setStatusMenuOpen}
              resolveOpen={resolveOpen}
              onResolveOpenChange={setResolveOpen}
            />
          ) : undefined
        }
        recordNoun="Support item"
        recordKey={openId == null ? null : String(openId)}
        summary={<RecordLedgerSummaryPane summary={summary} />}
        testId="support-item-record"
        list={listPane}
      >
        {openId != null ? (
          <SupportConversationPanel key={openId} supportItemId={openId} nowMs={nowMs} onResolve={() => setResolveOpen(true)} />
        ) : null}
      </DeskRecordPlane>

      <SupportNewItemStage open={composing} onClose={() => setComposing(false)} onCreated={onCreated} />
    </div>
  );
}
