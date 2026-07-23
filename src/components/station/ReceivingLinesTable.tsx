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

import { useRef, useState } from 'react';
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
import { receivingTableScopeLabel } from '@/components/dashboard/queue-table';
import { useSearchParams } from 'next/navigation';
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
   * own History/Incoming chrome; week / scope pill portals into
   * `toolbarPortalTarget` (top tabs bar controls slot).
   */
  embedded?: boolean;
  /** Portal week/scope DateRangePickerPill into Unbox chrome controls slot. */
  toolbarPortalTarget?: HTMLElement | null;
}

export default function ReceivingLinesTable({
  selectMode = false,
  embedded = false,
  toolbarPortalTarget = null,
}: ReceivingLinesTableProps = {}) {
  const { isMobile } = useUIModeOptional();
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
    handleSelectGroup,
    selectedIdRef,
    selectModeRef,
  } = useReceivingRowSelection({ selectMode, localRows, orderedVisibleRows });

  useReceivingTableNavigation({
    orderedVisibleRows,
    handleSelectRow,
    selectedIdRef,
    selectModeRef,
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
      <TableColumnConfigProvider tableId="receiving">
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
  const visibleLineCount = orderedVisibleRows.length;
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
        handleSelectGroup={handleSelectGroup}
        activityAxis={historyAxis}
        isHistory={isHistoryMode}
        scrollRef={scrollRef}
      />
    </div>
  );

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
    ) : (
      <DateRangePickerPill
        label={receivingTableScopeLabel(mode.id)}
        count={visibleLineCount}
      />
    );

  // Unbox workbench embeds the table under UnboxWorkspaceHeader — week/scope
  // pill portals into the top tabs bar (dashboard Shipped recipe).
  if (embedded) {
    const portaledToolbar =
      toolbarPortalTarget != null ? createPortal(chromePill, toolbarPortalTarget) : null;
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
      <TableColumnConfigProvider tableId="receiving">
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
