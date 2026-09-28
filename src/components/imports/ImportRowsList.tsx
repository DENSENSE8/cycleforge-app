'use client';

/**
 * Imports › **Orders** (`?view=rows`) — the imported-order HOST of the triage
 * face (the To-ship card list): one card per order a run touched, PT-day
 * sections under the default newest sort. `?run=` narrows to one run;
 * `?row=<id>` opens the order's import record in the desk record plane.
 *
 * The outcome chips (Inserted · Backfilled · Tracking · To review · Skipped ·
 * Failed) write the sidebar's own `?outcome=` facet — a chip is its outcomes
 * (Backfilled = backfilled · adopted · claimed) — so the SERVER narrows and
 * the sidebar's facet counts are the chips' counts.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrderChannel } from '@/hooks/useCatalog';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import { useDeskFloorFace, useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { scopeRecordVerbs } from '@/design-system/components/record-action-strip/record-verb-scope';
import { TriageCardList, type TriageFamily, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut, useTriagePageMode } from '@/design-system/components/triage-card-list/triage-list-state';
import { IMPORT_ROW_OUTCOME_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { writeClipboardText } from '@/lib/clipboard';
import type { ImportRowOutcome, ImportRunRowItem } from '@/lib/imports/types';
import { IMPORTS_PATH, importOrderHref, importReviewHref } from '@/lib/imports/record-faces';
import { IMPORT_PAGE_SIZE, importListQuery, positiveIntParam, useImportRows } from '@/lib/imports/record-client';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { toast } from '@/lib/toast';
import { IMPORT_ROWS_VIEW } from '@/lib/triage/views';
import { ImportRowCard, type ImportRowCardModel } from './cards/ImportRowCard';
import {
  ImportListSummary,
  REVIEW_PERMISSION,
  importDayBands,
  importDaySection,
  useImportParamWriter,
  useImportSelection,
} from './import-record-parts';
import { ImportRowRecordView } from './ImportRowRecordView';
import { ImportRunScopeBanner } from './ImportRunScopeBanner';

const VIEW = IMPORT_ROWS_VIEW;
/** The chips are the host's (`?outcome=`), not the face's cut. */
const NO_FACE_CHIPS: readonly string[] = [];
/** The facet context the sidebar counts this view's facets in — the same query, so one fetch. */
const FACET_CONTEXT = 'imports.rows';
const FACETS_STALE_MS = 15_000;

/** Each chip and the outcomes it stands for, in the record's order. */
const OUTCOME_CHIPS: readonly { id: string; label: string; outcomes: readonly ImportRowOutcome[] }[] = [
  { id: 'inserted', label: 'Inserted', outcomes: ['inserted'] },
  { id: 'backfilled', label: 'Backfilled', outcomes: ['backfilled', 'adopted', 'claimed'] },
  { id: 'tracking', label: 'Tracking', outcomes: ['tracking_filled'] },
  { id: 'review', label: 'To review', outcomes: ['ambiguous', 'quarantined'] },
  { id: 'skipped', label: 'Skipped', outcomes: ['skipped'] },
  { id: 'failed', label: 'Failed', outcomes: ['failed'] },
];

const rowId = (row: ImportRunRowItem) => row.id;
const rowCreatedAt = (row: ImportRunRowItem) => row.createdAt;
const noStatusKeys = (): readonly string[] => NO_FACE_CHIPS;
/** An order number or a tracking number names one card. */
const rowExactFind = (query: string, card: ImportRowCardModel) =>
  card.lead.externalOrderId.toLowerCase() === query || (card.lead.trackingNumber ?? '').toLowerCase() === query;

export function ImportRowsList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const writeParams = useImportParamWriter();
  const channelOf = useOrderChannel();
  const canReview = useAuth().has(REVIEW_PERMISSION);
  useDeskFloorFace(useDeskStageOptional() != null);

  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  // One page of cards is one API page: the per-page menu's size is the request's.
  const pageMode = useTriagePageMode(VIEW.storageKeys.pageMode);
  const rows = useImportRows(
    importListQuery(searchParams, 'rows'),
    pageMode.resolved,
    pageMode.mode === 'scroll' ? IMPORT_PAGE_SIZE : pageMode.mode,
  );
  const search = searchParams.toString();
  const facets = useQuery({
    queryKey: ['nav-facets', FACET_CONTEXT, search],
    queryFn: ({ signal }) => fetchNavFacets(FACET_CONTEXT, search, signal),
    staleTime: FACETS_STALE_MS,
    placeholderData: keepPreviousData,
  });

  const sort = searchParams.get('sort');
  const sectioned = !sort || sort === 'newest';
  const allBands = useMemo(() => importDayBands(rows.items, rowCreatedAt, sectioned), [rows.items, sectioned]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, noStatusKeys), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const scopedRunId = positiveIntParam(searchParams.get('run'));
  const openRowId = positiveIntParam(searchParams.get('row'));
  const open = useCallback((row: ImportRunRowItem) => writeParams((params) => params.set('row', String(row.id))), [writeParams]);
  const close = useCallback(() => writeParams((params) => params.delete('row')), [writeParams]);
  const clearRun = useCallback(() => writeParams((params) => params.delete('run')), [writeParams]);
  usePublishRecordCursor({
    surfaceId: 'import-row-cards',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRowId,
    getId: rowId,
    onOpen: open,
    onClose: close,
  });
  const openRow = useMemo(
    () => (openRowId != null ? (rows.items.find((row) => row.id === openRowId) ?? null) : null),
    [openRowId, rows.items],
  );

  const { port: selection, selected } = useImportSelection(rows.items, cut.url.scopeKey);

  // ── Outcome chips → the sidebar's `?outcome=` ─────────────────────────────
  const outcomeRaw = searchParams.get('outcome') ?? '';
  const chipSet = useMemo<IncomingStatusChipSet>(() => {
    const active = new Set(outcomeRaw.split(',').filter(Boolean));
    const counted = facets.data?.groups.find((group) => group.param === 'outcome')?.options;
    const countOf = new Map(counted?.map((option) => [option.value, option.count] as const));
    return {
      label: 'Filter by outcome',
      disabledReason: null,
      onToggle: (id) => {
        const chip = OUTCOME_CHIPS.find((candidate) => candidate.id === id);
        if (!chip) return;
        writeParams((params) => {
          const current = new Set((params.get('outcome') ?? '').split(',').filter(Boolean));
          const on = chip.outcomes.every((outcome) => current.has(outcome));
          for (const outcome of chip.outcomes) {
            if (on) current.delete(outcome);
            else current.add(outcome);
          }
          if (current.size > 0) params.set('outcome', [...current].join(','));
          else params.delete('outcome');
          // A narrower list from page 3 would land past its end.
          params.delete('page');
        });
      },
      chips: OUTCOME_CHIPS.map((chip) => ({
        id: chip.id,
        label: chip.label,
        count: counted ? chip.outcomes.reduce((sum, outcome) => sum + (countOf.get(outcome) ?? 0), 0) : null,
        tone: IMPORT_ROW_OUTCOME_LIFECYCLE[chip.outcomes[0]!].tone,
        active: chip.outcomes.every((outcome) => active.has(outcome)),
      })),
    };
  }, [outcomeRaw, facets.data, writeParams]);

  const copy = useCallback((values: readonly string[], noun: string) => {
    if (writeClipboardText(values.join('\n'))) toast.success(`Copied ${values.length} ${noun}${values.length === 1 ? '' : 's'}`);
  }, []);
  const bulkVerbs = useMemo<RecordActionVerb[]>(() => {
    const lead = selected[0];
    const leadHref = lead ? importOrderHref(lead.orderRowId) : null;
    const tracking = selected.flatMap((row) => (row.trackingNumber ? [row.trackingNumber] : []));
    return scopeRecordVerbs(
      [
        {
          id: 'open',
          label: 'Open order',
          scope: 'single',
          disabled: lead != null && leadHref == null,
          disabledReason: 'The import refused this order — there is no order to open',
          run: () => {
            if (leadHref) router.push(leadHref);
          },
        },
        { id: 'copy-orders', label: 'Copy order numbers', run: () => copy(selected.map((row) => row.externalOrderId), 'order number') },
        {
          id: 'copy-tracking',
          label: 'Copy tracking',
          disabled: tracking.length === 0,
          disabledReason: 'No checked order has tracking',
          run: () => copy(tracking, 'tracking number'),
        },
      ],
      selected.length,
      VIEW.noun,
    );
  }, [selected, router, copy]);

  const family = useMemo<TriageFamily<ImportRunRowItem, ImportRowCardModel>>(
    () => ({
      ...triageFamily<ImportRunRowItem, ImportRowCardModel>(VIEW, {
        rowId,
        groupKey: (group) => group.key,
        cardModel: (group) => ({ key: group.key, ids: group.rows.map(rowId), lead: group.rows[0]! }),
        exactFind: rowExactFind,
        renderCard: (props) => <ImportRowCard {...props} canReview={canReview} />,
      }),
      section: importDaySection,
    }),
    [canReview],
  );

  const q = searchParams.get('q') ?? '';
  const feed: TriageFeed<ImportRunRowItem> = {
    bands,
    allBands,
    painted,
    sectioned,
    total: rows.total,
    loading: rows.isPending,
    fetching: rows.isFetching,
    onLoadMore: rows.hasNextPage ? () => void rows.fetchNextPage() : undefined,
    search: { value: q, pending: false },
    selection,
    open: { id: openRowId, open, close },
  };

  const summaryFacts = useMemo(() => {
    const by = new Map<string, number>();
    for (const row of rows.items) by.set(row.outcome, (by.get(row.outcome) ?? 0) + 1);
    return OUTCOME_CHIPS.map((chip) => [chip.label, chip.outcomes.reduce((n, outcome) => n + (by.get(outcome) ?? 0), 0)] as const);
  }, [rows.items]);
  const narrowed = Boolean(q.trim()) || outcomeRaw !== '';

  const orderHref = openRow ? importOrderHref(openRow.orderRowId) : null;
  const stripVerbs: RecordActionVerb[] = openRow
    ? [
        {
          id: 'open',
          label: 'Open order',
          disabled: orderHref == null,
          disabledReason: 'The import refused this order — there is no order to open',
          run: () => {
            if (orderHref) router.push(orderHref);
          },
        },
        ...(openRow.importExceptionId != null && canReview
          ? [{ id: 'review', label: 'Review', run: () => router.push(importReviewHref(openRow.importExceptionId!)) }]
          : []),
        { id: 'run', label: `Open run ${openRow.runId}`, run: () => router.push(`${IMPORTS_PATH}?run=${openRow.runId}`) },
      ]
    : [];

  return (
    <div data-testid="imports-rows" className="flex min-h-0 min-w-0 flex-1">
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        summary={<IncomingStatusChips set={chipSet} face="cards" />}
        bulk={<RecordActionStrip face="header" verbs={bulkVerbs} label="Checked orders actions" testId="import-rows-bulk" />}
        banner={
          <>
            {scopedRunId != null ? <ImportRunScopeBanner runId={scopedRunId} onClear={clearRun} /> : null}
            {rows.isError ? <EvidenceNotice tone="warn">{rows.error.message}</EvidenceNotice> : null}
          </>
        }
        searchEmpty={narrowed ? <TriageAllClear title="No imported orders match" detail="Clear the Find or an outcome, or widen the dates in the sidebar." /> : null}
        allClear={<TriageAllClear title="No imported orders in this window" detail="Widen the dates or clear a filter in the sidebar." />}
        record={{
          title: openRow ? `Order ${openRow.externalOrderId}` : openRowId != null ? `Import row ${openRowId}` : 'Order',
          subtitle: openRow ? (openRow.title ?? IMPORT_ROW_OUTCOME_LIFECYCLE[openRow.outcome].label) : undefined,
          noun: 'imported order',
          testId: 'import-row-record-plane',
          summary: (
            <ImportListSummary
              label={scopedRunId != null ? `Run ${scopedRunId} · ${rows.items.length.toLocaleString()} orders loaded` : `${rows.items.length.toLocaleString()} orders loaded`}
              facts={summaryFacts}
              note="Open an order to see every id the import holds for it, what it filled, and why it was held or skipped."
            />
          ),
          view: openRow ? (
            <ImportRowRecordView
              key={openRow.id}
              row={openRow}
              channel={channelOf(openRow.externalOrderId, openRow.accountSource)}
              canReview={canReview}
            />
          ) : openRowId != null ? (
            <EvidenceNotice>This order is not in the current list — clear a filter or load older orders.</EvidenceNotice>
          ) : null,
          strip: openRow ? (
            <RecordActionStrip key={openRow.id} verbs={stripVerbs} label={`Order ${openRow.externalOrderId} actions`} testId="import-row-actions" />
          ) : null,
        }}
      />
    </div>
  );
}
