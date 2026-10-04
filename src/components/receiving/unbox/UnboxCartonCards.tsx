'use client';

/**
 * Unbox › Queue and Recent — the door's cartons as the shared triage face
 * ({@link TriageCardList}, one {@link ReceivingCartonCard} per carton). The
 * Unbox workbench is a station embed: opening a card loads the carton into the
 * line workspace (the host's `onOpenRow`), so this face carries no record plane
 * of its own. The host owns the rows (server order, `?ukpi=` already applied),
 * the selection store and the deep link; this face owns Sort (`?colsort=`) and
 * paints the KPI cut as status chips.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives';
import { TriageCardList, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { ReceivingCartonCard } from '@/components/receiving/history/cards/CartonCard';
import { cartonBands, cartonCardKey, cartonCardModel, type CartonCardModel } from '@/components/receiving/history/cards/carton-card-model';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { dockedRecordFace } from '@/lib/receiving/docked-record-state';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import { defaultDirForReceivingGridSort, isReceivingGridSortable, type ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { UNBOX_KPI_FILTER_PARAM, UNBOX_KPI_FILTER_WIRE_IDS, unboxKpiFilterLabel, unboxKpiRowFilter } from '@/lib/receiving/unbox-metrics';
import { RECEIVE_QUEUE_VIEW } from '@/lib/triage/views';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';

const VIEW = RECEIVE_QUEUE_VIEW;
/** The KPI cut is the host's (it filters the loaded rows); the face cuts nothing itself. */
const NO_FACE_CHIPS: readonly string[] = [];
const rowId = (row: ReceivingLineRow) => row.id;
const SORTS: readonly { key: ReceivingGridColumnKey; label: string }[] = [
  { key: 'date', label: 'Activity date' },
  { key: 'order', label: 'Purchase order' },
  { key: 'title', label: 'Product' },
  { key: 'qty', label: 'Quantity' },
  { key: 'tracking', label: 'Tracking' },
];

/** A Find naming exactly one carton — its PO / order #, carton #, or tracking — opens it. */
const cartonExactFind = (query: string, card: CartonCardModel) =>
  card.identity.toLowerCase() === query ||
  card.orderId?.toLowerCase() === query ||
  String(card.lead.receiving_id ?? '') === query.replace(/^#/, '') ||
  card.rows.some((row) => (row.tracking_number ?? '').toLowerCase() === query);

/** A queued carton nobody has opened has no unboxer yet — no "Unboxed by" corner until there is one. */
function unboxCartonModel(group: Parameters<typeof cartonCardModel>[0], axis: ReceivingActivityAxis): CartonCardModel {
  const model = cartonCardModel(group, axis);
  return model.unboxedAt ? model : { ...model, topRight: null };
}

/** `?ukpi=` as status chips over the tab's KPIs, counted over the loaded rows before the cut. */
function useUnboxKpiChips(kpiRows: readonly ReceivingLineRow[] | null, loading: boolean): IncomingStatusChipSet | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = getUnboxWorkspaceTabFromSearch(searchParams);
  const active = (searchParams.get(UNBOX_KPI_FILTER_PARAM) || '').trim().toLowerCase();
  const onToggle = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get(UNBOX_KPI_FILTER_PARAM) === id) params.delete(UNBOX_KPI_FILTER_PARAM);
      else params.set(UNBOX_KPI_FILTER_PARAM, id);
      params.delete('page');
      const base = receivingSurfaceBasePath(pathname);
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return useMemo(() => {
    if (!kpiRows) return null;
    const chips = UNBOX_KPI_FILTER_WIRE_IDS.flatMap((id) => {
      const predicate = unboxKpiRowFilter(id, tab);
      if (!predicate) return [];
      return [{
        id,
        label: unboxKpiFilterLabel(id),
        count: loading ? null : kpiRows.filter(predicate).length,
        tone: null,
        active: active === id,
      }];
    });
    return chips.length > 0 ? { label: 'KPI', chips, disabledReason: null, onToggle, testIdPrefix: 'unbox-kpi' } : null;
  }, [active, kpiRows, loading, onToggle, tab]);
}

export function UnboxCartonCards({
  rows,
  kpiRows,
  loading,
  emptyMessage,
  query,
  activityAxis,
  selectedId,
  selectedIds,
  onOpenRow,
  onCloseRow,
  onToggleRow,
}: {
  /** The loaded lines in the host's order, `?ukpi=` already applied. */
  rows: readonly ReceivingLineRow[];
  /** The loaded lines before the KPI cut — the chips count these; null hides the chips (no KPI on this host). */
  kpiRows: readonly ReceivingLineRow[] | null;
  loading: boolean;
  emptyMessage: string;
  /** The page header's Find (`?q=`), read only. */
  query: string;
  activityAxis: ReceivingActivityAxis;
  selectedId: number | null;
  selectedIds: Set<number>;
  /** Load the line into the Unbox workspace. */
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}) {
  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams });
  const { sort, dir, toggleColumnSort, clear } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });
  const visibleRows = useMemo(() => {
    const found = rows.filter((row) => receivingLineMatchesQuery(row, query));
    return sort && dir ? found.sort((a, b) => compareReceivingGridRows(a, b, sort, dir, activityAxis)) : found;
  }, [activityAxis, dir, query, rows, sort]);
  // One band in the host's order: Queue is server priority, Recent is recency.
  const bands = useMemo(() => cartonBands(visibleRows, activityAxis, false), [activityAxis, visibleRows]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const selection = useReceivingSelectionPort(selectedIds, onToggleRow, visibleRows);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId,
        groupKey: cartonCardKey,
        cardModel: (group) => unboxCartonModel(group, activityAxis),
        state: (group) => dockedRecordFace(group.rows[0]!),
        exactFind: cartonExactFind,
        renderCard: (props) => <ReceivingCartonCard {...props} view={VIEW} />,
      }),
    [activityAxis],
  );
  const feed: TriageFeed<ReceivingLineRow> = {
    bands,
    allBands: bands,
    painted,
    sectioned: false,
    loading,
    fetching: loading,
    search: { value: query, pending: false },
    selection,
    open: { id: selectedId, open: onOpenRow, close: onCloseRow },
  };
  const kpiChips = useUnboxKpiChips(kpiRows, loading);

  return (
    <div data-testid="unbox-carton-cards" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-1">
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {sort ? `${SORTS.find((option) => option.key === sort)?.label || sort} · ${dir}` : 'Sort'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {SORTS.map((option) => (
              <DropdownMenuItem key={option.key} onSelect={() => toggleColumnSort(option.key)}>
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={clear}>Default order</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        <TriageCardList
          family={family}
          feed={feed}
          cut={cut}
          summary={kpiChips ? <IncomingStatusChips set={kpiChips} /> : null}
          bulk={<ReceivingSelectionVerbs noun="cartons" />}
          searchEmpty={query.trim() ? <p className="text-sm text-text-muted">No matching cartons.</p> : null}
          allClear={<TriageAllClear title={emptyMessage} detail="Scan a carton at the door to start." />}
          record={{
            title: 'Carton',
            noun: VIEW.noun.one,
            showIndex: false,
            testId: 'unbox-carton-record',
            summary: null,
            view: null,
            strip: null,
          }}
        />
      </div>
    </div>
  );
}
