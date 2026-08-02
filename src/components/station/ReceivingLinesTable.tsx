'use client';

/**
 * Receiving-lines table — thin composition layer.
 *
 * The data/selection/grouping/navigation logic lives in focused hooks, and the
 * row/summary/list rendering in dedicated components, all under
 * `@/components/station/`:
 *   - useReceivingModeContext ..... URL → mode descriptor + parsed context
 *   - useReceivingLinesData ....... list + delivered-unscanned queries + localRows
 *   - useReceivingGrouping ........ dedupe → PO groups → day bands → ordered rows
 *   - useReceivingRowSelection .... single + bulk selection + event bridges
 *   - useReceivingTableNavigation . arrow/chevron + detail-overlay nav
 *   - useReceivingDeepLink ........ ?recvId/?lineId auto-select
 *   - useReceivingAutoWeek ........ History empty-week back-jump
 *   - IncomingGridView ............ Incoming POS → LedgerGrid spreadsheet
 *   - ReceivingGridView ........... Unbox / History → LedgerGrid spreadsheet
 *
 * The public exports below (types, dispatchers, the row component, the
 * synthetic-id helpers) are re-exported here so the ~50 existing importers of
 * `@/components/station/ReceivingLinesTable` keep working unchanged.
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { IncomingWorkspaceHeader } from '@/components/sidebar/receiving/incoming/IncomingWorkspaceHeader';
import { HistoryWorkspaceHeader } from '@/components/sidebar/receiving/HistoryWorkspaceHeader';
import { IncomingKpiStrip } from '@/components/sidebar/receiving/incoming/IncomingKpiStrip';
import { computeWeekRange, formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';

import { useReceivingModeContext } from '@/components/station/useReceivingModeContext';
import { useReceivingLinesData } from '@/components/station/useReceivingLinesData';
import { useReceivingGrouping } from '@/components/station/useReceivingGrouping';
import { useReceivingRowSelection } from '@/components/station/useReceivingRowSelection';
import { useReceivingTableNavigation } from '@/components/station/useReceivingTableNavigation';
import { useReceivingDeepLink } from '@/components/station/useReceivingDeepLink';
import { useReceivingAutoWeek } from '@/components/station/useReceivingAutoWeek';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { IncomingGridView } from '@/components/station/incoming-grid/IncomingGridView';
import { ReceivingGridView } from '@/components/station/receiving-grid/ReceivingGridView';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout } from '@/lib/station/table-url-params';
import {
  WorkbenchTablePane,
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_GUTTERS,
} from '@/components/dashboard/workbench-shell';
import { useRouter, useSearchParams } from 'next/navigation';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { toast } from '@/lib/toast';
import { AlertTriangle, Check, Clock, Inbox, Search, Truck } from '@/components/Icons';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import {
  RECEIVING_INCOMING_BOARD_LANES,
  RECEIVING_INCOMING_STATE_META,
  RECEIVING_HISTORY_BOARD_LANES,
  RECEIVING_HISTORY_STATE_META,
  bucketReceivingIncomingLane,
  bucketReceivingHistoryLane,
  type ReceivingIncomingLane,
  type ReceivingHistoryLane,
  type ReceivingLaneIconKey,
} from '@/lib/receiving/receiving-board-lanes';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';

const RECEIVING_LANE_ICON: Record<ReceivingLaneIconKey, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  truck: Truck,
  clock: Clock,
  alert: AlertTriangle,
  check: Check,
  search: Search,
};

const RECEIVING_INCOMING_LANES: SwimlaneLaneDef<ReceivingIncomingLane>[] = RECEIVING_INCOMING_BOARD_LANES.map((l) => ({
  id: l.id,
  label: RECEIVING_INCOMING_STATE_META[l.id].label,
  dot: RECEIVING_INCOMING_STATE_META[l.id].dot,
  description: RECEIVING_INCOMING_STATE_META[l.id].description,
  icon: RECEIVING_LANE_ICON[l.iconKey],
  iconClass: l.iconClass,
}));

const RECEIVING_HISTORY_LANES: SwimlaneLaneDef<ReceivingHistoryLane>[] = RECEIVING_HISTORY_BOARD_LANES.map((l) => ({
  id: l.id,
  label: RECEIVING_HISTORY_STATE_META[l.id].label,
  dot: RECEIVING_HISTORY_STATE_META[l.id].dot,
  description: RECEIVING_HISTORY_STATE_META[l.id].description,
  icon: RECEIVING_LANE_ICON[l.iconKey],
  iconClass: l.iconClass,
}));

// ── Public re-exports (preserve the historical import surface) ──────────────
export type { ReceivingView } from '@/lib/receiving/receiving-views';
// `ReceivingLineRow` lives in a leaf module so low-level utils/lib helpers can
// reference the shape without importing this heavy component. Re-exported so the
// ~50 existing `from '@/components/station/ReceivingLinesTable'` importers work.
export type { ReceivingLineRow } from './receiving-line-row';
export {
  dispatchSelectLine,
  dispatchLineUpdated,
  dispatchReceivingCartonUnlinkPatch,
  mergeReceivingPackageMetaIntoRow,
  RECEIVING_UNPAIR_ROW_PATCH,
  RECEIVING_SELECTION_SCOPE,
} from '@/components/station/receiving-lines-table-helpers';
export { shipmentIdFromDeliveredUnscannedRow } from '@/components/station/receiving-delivered-unscanned';
export { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';

export interface ReceivingLinesTableProps {
  selectMode?: boolean;
  /**
   * Host owns WorkbenchChromeHeader (Unbox workbench). Suppresses the table's
   * own History/Incoming chrome; week pill portals into `toolbarPortalTarget`
   * (controls slot). Fields lives on the host trailing cluster.
   */
  embedded?: boolean;
  /** Portal week DateRangePickerPill into Unbox chrome controls slot. */
  toolbarPortalTarget?: HTMLElement | null;
}

export default function ReceivingLinesTable({
  selectMode = false,
  embedded = false,
  toolbarPortalTarget = null,
}: ReceivingLinesTableProps = {}) {
  const { isMobile } = useUIModeOptional();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekRange = computeWeekRange(weekOffset);

  const {
    mode,
    isIncomingMode,
    isHistoryMode,
    historyAxis,
    incomingPage,
    isDeliveredUnscannedFacet,
    isDeliveredNotUnboxedFacet,
    skipWeekFilter,
    modeContext,
  } = useReceivingModeContext();

  const isUnboxTableMode = mode.id === 'unbox_queue' || mode.id === 'unbox_viewed';

  // `mode.id === 'history'` is shared by THREE hosts — `/receiving/history`, the
  // Unbox workbench's default tab (`embedded`), and `/dashboard?mode=inbound` —
  // and they do NOT open the same thing, so the mode id alone can never decide
  // the gesture. `embedded` is the Unbox workbench, whose three tabs share one
  // strip and one bulk bar: it opens the LineEditPanel workspace in place, while
  // the standalone History surface navigates to the carton read page.
  const isHistorySurface = isHistoryMode && !embedded;
  // The Unbox workbench — all three of its tabs. Measured on dogfood before the
  // flip: Recent 117 rows, Queue 12, Viewed 22, every one of them ticking a
  // checkbox on click with zero `receiving-select-line` events, i.e. its own
  // browse feed could not open a carton even though
  // `useReceivingWorkspacePane` says operators "open a line via click or scan".
  // Flipped as a SET so no tab diverges from its siblings.
  const isUnboxWorkbench = embedded;

  /**
   * History's record plane: the durable carton READ page. `receiving_id` is the
   * carton (a History row was physically received, so it has one); a row that
   * somehow lacks it gets deterministic feedback rather than a silent no-op —
   * a click that does nothing is the exact defect this change set removes.
   */
  const openHistoryCarton = useCallback(
    (row: ReceivingLineRow) => {
      const cartonId = Number(row.receiving_id);
      if (!Number.isFinite(cartonId) || cartonId <= 0) {
        toast.error('No carton record for this row yet');
        return;
      }
      router.push(cartonReadHref(cartonId));
    },
    [router],
  );

  const { data, isLoading, localRows } = useReceivingLinesData({
    mode,
    modeContext,
    isIncomingMode,
    isDeliveredUnscannedFacet,
    isDeliveredNotUnboxedFacet,
    incomingPage,
    setWeekOffset,
    scrollRef,
  });

  const { groupedRecords, filteredGroupedRecords, orderedVisibleRows, getWeekCount } =
    useReceivingGrouping({ localRows, mode, historyAxis, weekRange, skipWeekFilter });

  const {
    selectedId,
    setSelectedId,
    selectedIds,
    handleSelectRow,
    handleToggleRow,
    handleSelectGroup,
    selectedIdRef,
    selectModeRef,
  } = useReceivingRowSelection({
    selectMode,
    // Incoming splits the planes: row body opens the record, gutter checkbox
    // owns bulk. Without this, `selectMode` (pinned ON by
    // `useReceivingLineBulkSelection` for every `isTableOnlyMode` surface)
    // swallowed every row click, so `IncomingDetailsPanel` had no reachable
    // trigger at all.
    //
    // History splits them too, but its "open" is a different destination —
    // see `openRow` below. Scoped to the history SURFACE, not the shared
    // `mode.id` (see `isHistorySurface`), because the Unbox workbench carries
    // that same id on one of its tabs and opens something else entirely.
    //
    // Unbox (`isUnboxWorkbench`) splits them as well, and needs no `openRow`:
    // its `receiving-select-line` already opens the LineEditPanel in place —
    // exactly what its own recent rail has always done — so the default
    // dispatch IS the right destination. It only ever lacked the gesture.
    rowClickOpens: isIncomingMode || isHistorySurface || isUnboxWorkbench,
    // History's default `receiving-select-line` branch does
    // `router.replace('/unbox?openReceivingId=…')`, i.e. it drops a browse click
    // into the scan bench — a Workbench map handing off to a Station, which
    // `contextual-display.md` calls the most common way surfaces feel wrong.
    // The durable READ record is `/carton/[id]` (already where `searchHitHref`
    // sends a RECEIVING hit), so that is what a History row opens.
    //
    // Also armed on `/dashboard?mode=inbound`, which reaches this table with
    // `selectMode` OFF and therefore already dispatched `receiving-select-line`
    // on every click — into nothing, because that page mounts no receiving
    // sidebar or overlay host. It has been a dead click since it shipped (its
    // own release note says so); giving it the same carton destination is the
    // fix that note asked for, and costs nothing here.
    openRow: isHistorySurface ? openHistoryCarton : undefined,
    // A click on the Unbox FEED opens the carton but does NOT stamp the
    // operator's recents. Browsing a queue is navigation; Recent answers "which
    // cartons did I actually open", and if the map itself counted it would
    // converge on a copy of the feed. Scans, the recent rail, sibling PO lines
    // and deep links still record — they are all deliberate single-carton opens.
    recordViewOnOpen: !isUnboxWorkbench,
    localRows,
    orderedVisibleRows,
  });

  useReceivingTableNavigation({
    orderedVisibleRows,
    handleSelectRow,
    selectedIdRef,
    selectModeRef,
    rowClickOpens: isIncomingMode || isHistorySurface || isUnboxWorkbench,
    scrollRef,
    selectedId,
    // History / Incoming / Unbox workbench table own the chevron channel.
    tableNavEnabled: isHistoryMode || isIncomingMode || isUnboxTableMode || embedded,
  });

  useReceivingDeepLink({ isLoading, localRows, setSelectedId });

  useReceivingAutoWeek({
    isHistoryMode,
    skipWeekFilter,
    weekOffset,
    setWeekOffset,
    filteredGroupedRecords,
    groupedRecords,
    weekRange,
  });

  // `embedded` = the Unbox workbench host (all three tabs, incl. the default
  // History tab whose mode id is the shared 'history') — gate the mark on it,
  // not on the queue/viewed ids, or the default tab never stamps.
  useSurfacePaintMark('unbox:table', embedded && !isLoading);

  const emptyMessage = mode.emptyMessage(modeContext);

  // Pipeline (board) layout for Incoming / History (behind the boards flag). The
  // board buckets the flat rows by the receiving lane SoT and day-bands per lane;
  // it replaces the header + dense list (SwimlaneBoard supplies its own toolbar).
  const layout = parseLayout(searchParams.get(LAYOUT_PARAM));
  const showReceivingBoard = STATION_PIPELINE_BOARDS && layout === 'board' && (isIncomingMode || isHistoryMode);

  if (showReceivingBoard) {
    const nowMs = Date.now();
    const toReceivingDaySections = (recs: ReceivingLineRow[]): [string, ReceivingLineRow[]][] => {
      const byDay: Record<string, ReceivingLineRow[]> = {};
      for (const r of recs) {
        let key = 'Unknown';
        try {
          key = toPSTDateKey(r.created_at ?? undefined) || 'Unknown';
        } catch {
          key = 'Unknown';
        }
        (byDay[key] ??= []).push(r);
      }
      return Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
    };
    const renderReceivingRow = (row: ReceivingLineRow, index: number) => (
      <ReceivingLineOrderRow
        key={row.id}
        row={row}
        index={index}
        isMobile={isMobile}
        isIncoming={isIncomingMode}
        isHistory={isHistoryMode}
        activityAxis={historyAxis}
        selectMode={selectMode}
        isSelected={selectMode ? selectedIds.has(row.id) : selectedId === row.id}
        onSelect={() => handleSelectRow(row)}
      />
    );
    return (
      <TableColumnConfigProvider tableId={isIncomingMode ? 'incoming' : 'receiving'}>
        <div className="flex h-full min-w-0 overflow-hidden bg-surface-card">
          {isIncomingMode ? (
            <StationPipelineBoard<ReceivingLineRow, ReceivingIncomingLane>
              prefsKey="receivingIncomingBoard"
              lanes={RECEIVING_INCOMING_LANES}
              bucket={(r) => bucketReceivingIncomingLane(r)}
              records={orderedVisibleRows}
              loading={isLoading && localRows.length === 0}
              renderRow={renderReceivingRow}
              getRowKey={(row) => String(row.id)}
              toDaySections={toReceivingDaySections}
              getRowDate={(r) => r.created_at}
            />
          ) : (
            <StationPipelineBoard<ReceivingLineRow, ReceivingHistoryLane>
              prefsKey="receivingHistoryBoard"
              lanes={RECEIVING_HISTORY_LANES}
              bucket={(r) => bucketReceivingHistoryLane(r, nowMs)}
              records={orderedVisibleRows}
              loading={isLoading && localRows.length === 0}
              renderRow={renderReceivingRow}
              getRowKey={(row) => String(row.id)}
              toDaySections={toReceivingDaySections}
              getRowDate={(r) => r.created_at}
            />
          )}
        </div>
      </TableColumnConfigProvider>
    );
  }

  // Unbox / History spreadsheet body — LedgerGrid via ReceivingGridView (same
  // family as IncomingGridView). Date is a per-row column; no sticky day bands.
  const weekCount = getWeekCount();

  const receivingGrid = () => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ReceivingGridView
        filteredGroupedRecords={filteredGroupedRecords}
        serverSorted={mode.serverSorted}
        loading={isLoading && localRows.length === 0}
        emptyMessage={emptyMessage}
        isMobile={isMobile}
        selectMode={selectMode}
        selectedId={selectedId}
        selectedIds={selectedIds}
        handleSelectRow={handleSelectRow}
        // Wherever the row body has been handed to the record plane, the gutter
        // is the ONLY way left to build a bulk set — so it must be a real
        // control there, and stays a painted readout everywhere else.
        handleToggleRow={
          isHistorySurface || isUnboxWorkbench ? handleToggleRow : undefined
        }
        handleSelectGroup={handleSelectGroup}
        activityAxis={historyAxis}
        isHistory={isHistoryMode}
        scrollRef={scrollRef}
      />
    </div>
  );

  // Unbox Queue / Viewed skip the week filter — do NOT portal a static
  // "Door queue · N" fact chip (duplicates the Queue tab badge; not actionable).
  // History keeps the interactive week pill. Fields lives on UnboxWorkspaceHeader
  // trailing (WorkbenchTrailingCluster) — not in this portal.
  const chromePill =
    isHistoryMode || !skipWeekFilter ? (
      <DateRangePickerPill
        label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
        count={weekCount}
        weekNav={{
          weekOffset,
          onPrev: () => setWeekOffset(weekOffset + 1),
          onNext: () => setWeekOffset(Math.max(0, weekOffset - 1)),
        }}
      />
    ) : null;

  // Unbox workbench embeds the table under UnboxWorkspaceHeader — week pill
  // (History only) portals into the top tabs bar controls slot.
  if (embedded) {
    const portaledToolbar =
      toolbarPortalTarget != null && chromePill != null
        ? createPortal(chromePill, toolbarPortalTarget)
        : null;
    return (
      <TableColumnConfigProvider tableId="receiving">
        {portaledToolbar}
        {receivingGrid()}
      </TableColumnConfigProvider>
    );
  }

  // Incoming adopts the golden workbench shape (sibling of the Dashboard orders
  // view): pinned chrome + KPI strip + LedgerGrid spreadsheet. Search / filters /
  // Select live in the header; the sidebar keeps Incoming PO sync + email triage.
  if (isIncomingMode) {
    return (
      <TableColumnConfigProvider tableId="incoming">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
          <div className={`relative z-header shrink-0 ${WORKBENCH_CHROME_COLUMN}`}>
            <IncomingWorkspaceHeader
              total={
                isDeliveredUnscannedFacet || isDeliveredNotUnboxedFacet
                  ? localRows.length
                  : Number(data?.total ?? 0)
              }
              page={incomingPage}
            />
          </div>
          <div className={`shrink-0 ${WORKBENCH_GUTTERS}`}>
            <IncomingKpiStrip />
          </div>
          <WorkbenchTablePane>
            <IncomingGridView
              filteredGroupedRecords={filteredGroupedRecords}
              serverSorted={mode.serverSorted}
              loading={isLoading && localRows.length === 0}
              emptyMessage={emptyMessage}
              isMobile={isMobile}
              selectMode={selectMode}
              selectedId={selectedId}
              selectedIds={selectedIds}
              handleSelectRow={handleSelectRow}
              handleToggleRow={handleToggleRow}
              handleSelectGroup={handleSelectGroup}
              scrollRef={scrollRef}
            />
          </WorkbenchTablePane>
        </div>
      </TableColumnConfigProvider>
    );
  }

  // History — same workbench chrome recipe (All / Unfound tabs · search · filters
  // · week · Select). Sidebar no longer hosts History search chrome.
  if (isHistoryMode) {
    return (
      <TableColumnConfigProvider tableId="receiving">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
          <div className={`relative z-header shrink-0 ${WORKBENCH_CHROME_COLUMN}`}>
            <HistoryWorkspaceHeader
              weekRange={weekRange}
              weekOffset={weekOffset}
              weekCount={getWeekCount()}
              onPrevWeek={() => setWeekOffset(weekOffset + 1)}
              onNextWeek={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            />
          </div>
          <WorkbenchTablePane>{receivingGrid()}</WorkbenchTablePane>
        </div>
      </TableColumnConfigProvider>
    );
  }

  return (
    <TableColumnConfigProvider tableId="receiving">
      <div className="flex h-full min-w-0 overflow-hidden bg-surface-canvas">
        <WorkbenchTablePane>{receivingGrid()}</WorkbenchTablePane>
      </div>
    </TableColumnConfigProvider>
  );
}
