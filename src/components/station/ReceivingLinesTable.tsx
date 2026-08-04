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
 * Types + dispatchers live in leaf modules — import those, never this file,
 * unless you are mounting the table:
 *   - `receiving-line-row` ............. `ReceivingLineRow`
 *   - `receiving-lines-table-helpers` ... dispatchers / selection scope
 *   - `ReceivingLineOrderRow` .......... board-layout row (legacy)
 *
 * Re-exports below remain for accidental legacy imports; new code must use leaves.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { IncomingWorkspaceHeader } from '@/components/sidebar/receiving/incoming/IncomingWorkspaceHeader';
import { HistoryWorkspaceHeader } from '@/components/sidebar/receiving/HistoryWorkspaceHeader';
import { IncomingKpiStrip } from '@/components/sidebar/receiving/incoming/IncomingKpiStrip';
import { IncomingLaneNote } from '@/components/sidebar/receiving/incoming/IncomingLaneNote';
import {
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_CHROME_PILL_CLASS,
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';
import { incomingGridColumnsFor } from '@/lib/receiving/incoming-grid-layout';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
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
import { ReceivingDrillHost } from '@/components/station/receiving-grid/ReceivingDrillHost';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout } from '@/lib/station/table-url-params';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cartonReadHref, INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { parseHistoryDrillLayout } from '@/lib/receiving/history-drill-layout';
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
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';
import { unboxKpiRowFilter, UNBOX_KPI_FILTER_PARAM } from '@/lib/receiving/unbox-metrics';

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

// ── Legacy re-exports (prefer leaf modules; do not grow this list) ───────────
export type { ReceivingView } from '@/lib/receiving/receiving-views';
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
   * (controls slot). Column display is neither the host's nor this portal's —
   * it is the grid's own header lip (chrome Fields retired 2026-08-02).
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
  const pathname = usePathname() ?? '';
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

  // Inbound desk (`/incoming`) hosts Pipeline + Docked. Docked resolves as
  // history mode but the host owns chrome (IncomingWorkspaceHeader) — never
  // nest HistoryWorkspaceHeader there.
  const isInboundDeskHost = pathname.startsWith(INCOMING_SURFACE_ROUTE);
  const isInboundDocked = isInboundDeskHost && parseInboundLane(searchParams.get('lane')) === 'docked';

  // `mode.id === 'history'` is shared by THREE hosts — `/receiving/history`, the
  // Unbox workbench's default tab (`embedded`), and `/incoming?lane=docked`
  // (former `/dashboard?mode=inbound`) — and they do NOT open the same thing,
  // so the mode id alone can never decide the gesture. `embedded` is the Unbox
  // workbench, whose three tabs share one strip and one bulk bar: it opens the
  // LineEditPanel workspace in place, while the standalone History surface
  // navigates to the carton read page.
  const isHistorySurface = isHistoryMode && !embedded;
  // The Unbox workbench — all three of its tabs. Measured on dogfood before the
  // flip: Recent 117 rows, Queue 12, Viewed 22, every one of them ticking a
  // checkbox on click with zero `receiving-select-line` events, i.e. its own
  // browse feed could not open a carton even though
  // `useReceivingWorkspacePane` says operators "open a line via click or scan".
  // Flipped as a SET so no tab diverges from its siblings.
  const isUnboxWorkbench = embedded;
  // Unbox History click-select golden (2026-08-04): no select column; click
  // toggles bulk; double-click opens; header paint-bucket. Never `mode.id ===
  // 'history'` alone (Docked / standalone History share that id).
  const historyClickSelect = embedded && isHistoryMode;
  // Incoming Pipeline joins the same Unbox click-select SoT (2026-08-04):
  // click toggles bulk; double-click / Enter opens the inspector (not carton).
  const incomingClickSelect = isIncomingMode;
  // Legacy sheets empty-gutter chrome — only for non-click-select History paths
  // that still keep a select track (none today on Unbox; kept for clarity).
  const selectGutterChrome =
    historyClickSelect || incomingClickSelect
      ? ('sheets' as const)
      : ('always' as const);

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

  // KPI-tile click-to-filter (Unbox only). The predicate is the SAME one
  // UnboxChromeKpiCluster used to compute the tile's number, so a filtered
  // table can never disagree with the count that told the operator to click.
  // `embedded` is the Unbox-workbench gate (all three tabs) — never applies
  // to Incoming / standalone History, which share this component.
  const ukpiParam = searchParams.get(UNBOX_KPI_FILTER_PARAM);
  const unboxTabForFilter = getUnboxWorkspaceTabFromSearch(searchParams);
  const kpiFilteredRows = useMemo(() => {
    if (!isUnboxWorkbench) return localRows;
    const predicate = unboxKpiRowFilter(ukpiParam, unboxTabForFilter);
    return predicate ? localRows.filter(predicate) : localRows;
  }, [isUnboxWorkbench, localRows, ukpiParam, unboxTabForFilter]);

  const { groupedRecords, filteredGroupedRecords, orderedVisibleRows, getWeekCount } =
    useReceivingGrouping({ localRows: kpiFilteredRows, mode, historyAxis, weekRange, skipWeekFilter });

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
  // History default is the folded list; Drill (`?hlayout=drill`) mounts linked
  // dual panes via ReceivingDrillHost.
  const weekCount = getWeekCount();
  const unboxTab = getUnboxWorkspaceTabFromSearch(searchParams);
  const historyDrill =
    embedded &&
    unboxTab === 'history' &&
    parseHistoryDrillLayout(searchParams.get('hlayout')) === 'drill';

  const receivingGrid = () =>
    historyDrill ? (
      <ReceivingDrillHost
        filteredGroupedRecords={filteredGroupedRecords}
        loading={isLoading && localRows.length === 0}
        emptyMessage={emptyMessage}
        isMobile={isMobile}
        selectMode={selectMode}
        selectedId={selectedId}
        selectedIds={selectedIds}
        handleSelectRow={handleSelectRow}
        handleToggleRow={
          isHistorySurface || isUnboxWorkbench ? handleToggleRow : undefined
        }
        handleSelectGroup={handleSelectGroup}
        activityAxis={historyAxis}
        isHistory={isHistoryMode}
        selectGutterChrome={selectGutterChrome}
        clickSelect={historyClickSelect}
        scrollRef={scrollRef}
        columnTriggerPortalTarget={
          embedded ? toolbarPortalTarget ?? null : null
        }
      />
    ) : (
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
          handleToggleRow={
            isHistorySurface || isUnboxWorkbench ? handleToggleRow : undefined
          }
          handleSelectGroup={handleSelectGroup}
          activityAxis={historyAxis}
          isHistory={isHistoryMode}
          selectGutterChrome={selectGutterChrome}
          clickSelect={historyClickSelect}
          scrollRef={scrollRef}
          columnTriggerPortalTarget={
            embedded ? toolbarPortalTarget ?? null : null
          }
        />
      </div>
    );

  // Unbox Queue / Viewed skip the week filter — do NOT portal a static
  // "Door queue · N" fact chip (duplicates the Queue tab badge; not actionable).
  // History keeps the interactive week pill. Column display portals into the
  // same Unbox triage-band controls slot (staff / filter / week) via
  // GridColumnGutter.triggerPortalTarget — not a second chrome Fields door.
  const chromePill =
    isHistoryMode || !skipWeekFilter ? (
      <DateRangePickerPill
        label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
        count={weekCount}
        // Match band History tab radius on all sides (never square-flat).
        className={embedded ? WORKBENCH_CHROME_PILL_CLASS : undefined}
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

  // Inbound desk — Pipeline (Incoming) + Docked (history). Host owns
  // IncomingWorkspaceHeader for both lanes so Docked never double-mounts
  // HistoryWorkspaceHeader. Sheets flush mount (Unbox golden): chrome + KPI
  // abut the context rail; grid on WORKBENCH_SHEET_HOST.
  if (isIncomingMode || isInboundDocked) {
    return (
      <TableColumnConfigProvider tableId={isIncomingMode ? 'incoming' : 'receiving'}>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
          <div className={cn(WORKBENCH_SHEET_CHROME, 'relative z-header flex shrink-0 flex-col gap-0')}>
            <IncomingWorkspaceHeader
              total={
                isIncomingMode
                  ? isDeliveredUnscannedFacet || isDeliveredNotUnboxedFacet
                    ? localRows.length
                    : Number(data?.total ?? 0)
                  : Number(data?.total ?? localRows.length)
              }
              page={isIncomingMode ? incomingPage : 1}
            />
            {/* KPI owns the bottom hairline; sheet keeps border-t — one seam. */}
            <div className="border-b border-r border-border-soft bg-surface-card px-3 py-2">
              <IncomingKpiStrip />
              {isIncomingMode ? (
                <IncomingLaneNote
                  view={mode.apiView}
                  trackingFiltered={modeContext.trackingIn.length > 0}
                  rowCount={orderedVisibleRows.length}
                  providerLabel={providerCatalogLabel('zoho')}
                />
              ) : null}
            </div>
          </div>
          {isIncomingMode ? (
            <div className={WORKBENCH_SHEET_HOST}>
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
                selectGutterChrome={selectGutterChrome}
                clickSelect={incomingClickSelect}
                columns={incomingGridColumnsFor({
                  trackingFiltered: modeContext.trackingIn.length > 0,
                  removedLane: mode.id === 'incoming_removed',
                })}
                scrollRef={scrollRef}
              />
            </div>
          ) : (
            <div className={WORKBENCH_SHEET_HOST}>{receivingGrid()}</div>
          )}
        </div>
      </TableColumnConfigProvider>
    );
  }

  // History — standalone `/receiving/history` (until redirected). Unbox embeds
  // use the branch above via `embedded`.
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
          <div className={WORKBENCH_SHEET_HOST}>{receivingGrid()}</div>
        </div>
      </TableColumnConfigProvider>
    );
  }

  return (
    <TableColumnConfigProvider tableId="receiving">
      <div className="flex h-full min-w-0 overflow-hidden bg-surface-canvas">
        <div className={WORKBENCH_SHEET_HOST}>{receivingGrid()}</div>
      </div>
    </TableColumnConfigProvider>
  );
}
