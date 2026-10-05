'use client';

/**
 * Unbox › Queue and Recent — the door's cartons as the shared triage face
 * ({@link TriageCardList}, one {@link ReceivingCartonCard} per carton). The
 * Unbox workbench is a station embed: opening a card loads the carton into the
 * line workspace (the host's `onOpenRow`), so this face carries no record plane
 * of its own. The host owns the rows (server order, `?ukpi=` already applied —
 * the sidebar's KPI facet writes it, `src/lib/nav/facets/unbox.ts`), the
 * selection store and the deep link; this face reads the sidebar's Sort (`?colsort=`).
 */

import { useMemo } from 'react';
import { TriageCardList, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
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
import { RECEIVE_QUEUE_VIEW } from '@/lib/triage/views';

const VIEW = RECEIVE_QUEUE_VIEW;
/** The KPI cut is the host's (it filters the loaded rows); the face cuts nothing itself. */
const NO_FACE_CHIPS: readonly string[] = [];
const rowId = (row: ReceivingLineRow) => row.id;

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

export function UnboxCartonCards({
  rows,
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
  const { sort, dir } = useUrlColumnSort<ReceivingGridColumnKey>({
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

  return (
    <div data-testid="unbox-carton-cards" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <TriageCardList
          family={family}
          feed={feed}
          cut={cut}
          summary={null}
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
