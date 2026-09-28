'use client';

/**
 * Imports › **Runs** — the import-run HOST of the triage face (the To-ship
 * card list): one card per run, PT-day sections under the default newest
 * sort, status chips (Running · Success · Partial · Failed) cutting the loaded
 * runs through the sidebar's own `?status=`. `?run=<id>` opens the run record
 * (its steps + that run's orders) in the desk record plane.
 *
 * The list API reads the sidebar's other filters verbatim; `status` is the
 * chips' cut, so the server answers every status and the chips count them all.
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
import { IMPORT_RUN_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { writeClipboardText } from '@/lib/clipboard';
import { IMPORT_RUN_STATUSES, type ImportRunListItem, type ImportRunStatus } from '@/lib/imports/types';
import { IMPORTS_PATH, IMPORT_RUN_STATUS_LABELS, importKindLabel, importStamp, importTriggerLabel } from '@/lib/imports/record-faces';
import { IMPORT_PAGE_SIZE, importListQuery, positiveIntParam, useImportRun, useImportRuns } from '@/lib/imports/record-client';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { toast } from '@/lib/toast';
import { IMPORT_RUNS_VIEW } from '@/lib/triage/views';
import { ImportRunCard, type ImportRunCardModel } from './cards/ImportRunCard';
import {
  ImportListSummary,
  REVIEW_PERMISSION,
  importDayBands,
  importDaySection,
  useImportParamWriter,
  useImportSelection,
} from './import-record-parts';
import { ImportRunRecordView } from './ImportRunRecordView';

const VIEW = IMPORT_RUNS_VIEW;
/** The chips are the host's (`?status=`, the sidebar's Status facet), not the face's cut. */
const NO_FACE_CHIPS: readonly string[] = [];
/** The facet context the sidebar counts this view's facets in — the same query, so one fetch. */
const FACET_CONTEXT = 'imports.runs';
const FACETS_STALE_MS = 15_000;

const runId = (run: ImportRunListItem) => run.id;
const noStatusKeys = (): readonly string[] => NO_FACE_CHIPS;
const runStartedAt = (run: ImportRunListItem) => run.startedAt;
/** `12` or `run 12` names one run. */
const runExactFind = (query: string, card: ImportRunCardModel) => query.replace(/^run\s*/, '') === String(card.lead.id);

export function ImportRunsList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const writeParams = useImportParamWriter();
  const channelOf = useOrderChannel();
  const canReview = useAuth().has(REVIEW_PERMISSION);
  // In place / Split / Floor all read the same cards; Floor gives them the canvas and the record a rail.
  useDeskFloorFace(useDeskStageOptional() != null);

  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  // One page of cards is one API page: the per-page menu's size is the request's.
  const pageMode = useTriagePageMode(VIEW.storageKeys.pageMode);
  const runs = useImportRuns(
    importListQuery(searchParams, 'runs'),
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
  const allBands = useMemo(() => importDayBands(runs.items, runStartedAt, sectioned), [runs.items, sectioned]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, noStatusKeys), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const openRunId = positiveIntParam(searchParams.get('run'));
  const open = useCallback((run: ImportRunListItem) => writeParams((params) => params.set('run', String(run.id))), [writeParams]);
  const close = useCallback(() => writeParams((params) => params.delete('run')), [writeParams]);
  usePublishRecordCursor({
    surfaceId: 'import-run-cards',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRunId,
    getId: runId,
    onOpen: open,
    onClose: close,
  });
  // The run record's own read — the title reads it when the run is not loaded here.
  const openDetail = useImportRun(openRunId).data ?? null;
  const openRun = useMemo(
    () => (openRunId != null ? (runs.items.find((run) => run.id === openRunId) ?? openDetail) : null),
    [openRunId, runs.items, openDetail],
  );

  const { port: selection, selected } = useImportSelection(runs.items, cut.url.scopeKey);

  // ── Status chips → the sidebar's `?status=` (one status at a time) ─────────
  const statusRaw = searchParams.get(VIEW.chips.param);
  const chipSet = useMemo<IncomingStatusChipSet>(() => {
    const counted = facets.data?.groups.find((group) => group.param === VIEW.chips.param)?.options;
    const countOf = new Map(counted?.map((option) => [option.value, option.count] as const));
    return {
      label: 'Filter by status',
      disabledReason: null,
      onToggle: (id) =>
        writeParams((params) => {
          if (params.get(VIEW.chips.param) === id) params.delete(VIEW.chips.param);
          else params.set(VIEW.chips.param, id);
          // A narrower list from page 3 would land past its end.
          params.delete('page');
        }),
      chips: IMPORT_RUN_STATUSES.map((status: ImportRunStatus) => ({
        id: status,
        label: IMPORT_RUN_STATUS_LABELS[status],
        count: counted ? (countOf.get(status) ?? 0) : null,
        tone: IMPORT_RUN_LIFECYCLE[status].tone,
        active: statusRaw === status,
      })),
    };
  }, [statusRaw, facets.data, writeParams]);

  const showOrders = useCallback(
    (run: Pick<ImportRunListItem, 'id'>) => router.push(`${IMPORTS_PATH}?view=rows&run=${run.id}`),
    [router],
  );
  const bulkVerbs = useMemo<RecordActionVerb[]>(
    () =>
      scopeRecordVerbs(
        [
          {
            id: 'orders',
            label: 'Show orders',
            scope: 'single',
            run: () => {
              if (selected[0]) showOrders(selected[0]);
            },
          },
          {
            id: 'copy',
            label: 'Copy run numbers',
            run: () => {
              if (writeClipboardText(selected.map((run) => run.id).join('\n'))) {
                toast.success(`Copied ${selected.length} run number${selected.length === 1 ? '' : 's'}`);
              }
            },
          },
        ],
        selected.length,
        VIEW.noun,
      ),
    [selected, showOrders],
  );

  const family = useMemo<TriageFamily<ImportRunListItem, ImportRunCardModel>>(
    () => ({
      ...triageFamily<ImportRunListItem, ImportRunCardModel>(VIEW, {
        rowId: runId,
        groupKey: (group) => group.key,
        cardModel: (group) => ({ key: group.key, ids: group.rows.map(runId), lead: group.rows[0]! }),
        exactFind: runExactFind,
        renderCard: (props) => <ImportRunCard {...props} dayShown={sectioned} />,
      }),
      section: importDaySection,
    }),
    [sectioned],
  );

  const q = searchParams.get('q') ?? '';
  const feed: TriageFeed<ImportRunListItem> = {
    bands,
    allBands,
    painted,
    sectioned,
    total: runs.total,
    loading: runs.isPending,
    fetching: runs.isFetching,
    onLoadMore: runs.hasNextPage ? () => void runs.fetchNextPage() : undefined,
    search: { value: q, pending: false },
    selection,
    open: { id: openRunId, open, close },
  };

  const totals = useMemo(() => {
    const sum = { inserted: 0, backfilled: 0, trackingFilled: 0, needsReview: 0, failedRuns: 0 };
    for (const run of runs.items) {
      sum.inserted += run.totals.inserted;
      sum.backfilled += run.totals.backfilled;
      sum.trackingFilled += run.totals.trackingFilled;
      sum.needsReview += run.totals.needsReview;
      if (run.status === 'failed' || run.status === 'partial') sum.failedRuns += 1;
    }
    return sum;
  }, [runs.items]);
  const narrowed = Boolean(q.trim());

  return (
    <div data-testid="imports-runs" className="flex min-h-0 min-w-0 flex-1">
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        summary={<IncomingStatusChips set={chipSet} face="cards" />}
        bulk={<RecordActionStrip face="header" verbs={bulkVerbs} label="Checked runs actions" testId="import-runs-bulk" />}
        banner={runs.isError ? <EvidenceNotice tone="warn">{runs.error.message}</EvidenceNotice> : null}
        searchEmpty={narrowed ? <TriageAllClear title="No runs match" detail="Clear the Find or widen the dates in the sidebar." /> : null}
        allClear={<TriageAllClear title="No import runs in this window" detail="Widen the dates or clear a filter in the sidebar." />}
        record={{
          title: openRunId != null ? `Run ${openRunId}` : 'Run',
          subtitle: openRun ? `${importKindLabel(openRun.kind)} · ${importTriggerLabel(openRun)} · ${importStamp(openRun.startedAt)} PT` : undefined,
          noun: 'import run',
          testId: 'import-run-record-plane',
          summary: (
            <ImportListSummary
              label={`${runs.items.length.toLocaleString()} runs loaded`}
              facts={[
                ['Inserted', totals.inserted],
                ['Backfilled', totals.backfilled],
                ['Tracking', totals.trackingFilled],
                ['To review', totals.needsReview],
                ['Failed steps', totals.failedRuns],
              ]}
              note="Open a run to see each step it ran and every order it inserted, backfilled, held or skipped."
            />
          ),
          view:
            openRunId != null ? (
              <ImportRunRecordView
                key={openRunId}
                runId={openRunId}
                rowsQuery={importListQuery(searchParams, 'rows', { run: String(openRunId) })}
                channelOf={channelOf}
                canReview={canReview}
              />
            ) : null,
          strip:
            openRunId != null ? (
              <RecordActionStrip
                key={openRunId}
                verbs={[{ id: 'orders', label: 'Show orders', run: () => showOrders({ id: openRunId }) }]}
                label={`Run ${openRunId} actions`}
                testId="import-run-actions"
              />
            ) : null,
        }}
      />
    </div>
  );
}
