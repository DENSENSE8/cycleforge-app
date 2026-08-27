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
 *   - Incoming POS (inline) → LedgerGrid spreadsheet
 *   - ReceivingGridHost ........... Unbox / History → LedgerGrid spreadsheet
 *
 * Types + dispatchers live in leaf modules — import those, never this file,
 * unless you are mounting the table:
 *   - `receiving-line-row` ............. `ReceivingLineRow`
 *   - `receiving-lines-table-helpers` ... dispatchers / selection scope
 *   - `ReceivingLineOrderRow` .......... board-layout row (legacy)
 *
 * Re-exports below remain for accidental legacy imports; new code must use leaves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { IncomingWorkspaceHeader } from '@/components/sidebar/receiving/incoming/IncomingWorkspaceHeader';
import { IncomingReturnsImportStagingHost } from '@/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost';
import { IncomingReturnsImportStagingRail } from '@/components/sidebar/receiving/incoming/IncomingReturnsImportStagingRail';
import {
  HistoryWorkspaceHeader,
  HistoryTriageBand,
} from '@/components/sidebar/receiving/HistoryWorkspaceHeader';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import {
  clearTableImportDraft,
  useTableImportDraft,
} from '@/lib/tables/import/staging-store';
import {
  INCOMING_COMPOUND_COLUMNS,
  defaultDirForIncomingGridSort,
  isIncomingGridSortable,
  type IncomingGridColumn,
  type IncomingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import { useQueryClient } from '@tanstack/react-query';
import { commitReceivingLineNote } from '@/lib/receiving/commit-receiving-line-note';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import { INCOMING_TABLE_BINDING } from '@/components/station/incoming-grid/incoming-table-definition';
import { IncomingGridColumnHeader } from '@/components/station/incoming-grid/IncomingGridColumnHeader';
import { IncomingGridGroupRow } from '@/components/station/incoming-grid/IncomingGridGroupRow';
import { computeWeekRange, formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { RECORD_CURSOR_PRIORITY } from '@/lib/record-cursor/store';
import type { CursorIntent } from '@/lib/record-cursor/cursor-model';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import {
  getDetailInspectorCollapsed,
  setDetailInspectorCollapsed,
} from '@/design-system/shells/detail-stack';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  buildReceivingHistoryExportCsv,
  receivingHistoryExportFilename,
} from '@/lib/receiving/history-export-csv';

import { useReceivingModeContext } from '@/components/station/useReceivingModeContext';
import { useReceivingLinesData } from '@/components/station/useReceivingLinesData';
import { useReceivingGrouping } from '@/components/station/useReceivingGrouping';
import { useReceivingRowSelection } from '@/components/station/useReceivingRowSelection';
import { useReceivingTableNavigation } from '@/components/station/useReceivingTableNavigation';
import { useReceivingDeepLink } from '@/components/station/useReceivingDeepLink';
import { useReceivingAutoWeek } from '@/components/station/useReceivingAutoWeek';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { GridDegradedBox } from '@/design-system/components/grid';
import { ReceivingGridHost } from '@/components/station/receiving-grid/ReceivingGridHost';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { ReceivingDrillHost } from '@/components/station/receiving-grid/ReceivingDrillHost';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout, parseWeekOffset, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cartonReadHref, INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { parseHistoryDrillLayout } from '@/lib/receiving/history-drill-layout';
import { toast } from '@/lib/toast';
import {
  dispatchReceivingOpenHistoryTriage,
  dispatchReceivingOpenIncomingDetails,
} from '@/utils/events';
import {
  historyTriageTargetFromRow,
} from '@/lib/receiving/history-triage-row';
import { incomingDetailsTargetFromRow } from '@/lib/receiving/incoming-details-target';
import {
  dispatchSelectLine,
  poGroupAnchorMs,
  RECEIVING_SELECTION_SCOPE,
} from '@/components/station/receiving-lines-table-helpers';
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
   * it is the grid's own header lip — chrome never carries Fields.
   */
  embedded?: boolean;
  /** Portal ▦ column trigger into Unbox History View controls (week lives in Refine). */
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
  // Band-3 no longer hosts ▦ — Show inspector opens Column display.
  // Unbox embed still portals into the inspector View cluster.
  const sheetChrome = useWorkbenchSheetChrome();
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // History week is a query facet (`?weekOffset=`); other modes keep session-local.
  const [localWeekOffset, setLocalWeekOffset] = useState(0);
  const weekOffsetFromUrl = Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM)));
  const weekOffset = isHistoryMode ? weekOffsetFromUrl : localWeekOffset;
  const setWeekOffset = useCallback(
    (next: number | ((prev: number) => number)) => {
      const resolved = typeof next === 'function' ? next(weekOffset) : next;
      const offset = Math.max(0, Math.trunc(resolved) || 0);
      if (isHistoryMode) {
        const params = new URLSearchParams(searchParams.toString());
        if (offset <= 0) params.delete(WEEK_OFFSET_PARAM);
        else params.set(WEEK_OFFSET_PARAM, String(offset));
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
        return;
      }
      setLocalWeekOffset(offset);
    },
    [isHistoryMode, weekOffset, searchParams, pathname, router],
  );
  const weekRange = computeWeekRange(weekOffset);

  const isUnboxTableMode = mode.id === 'unbox_queue' || mode.id === 'unbox_viewed';

  // Inbound desk (`/incoming`) hosts Pipeline + Docked. Docked resolves as
  // history mode but the host owns chrome (IncomingWorkspaceHeader) — never
  // nest HistoryWorkspaceHeader there.
  const isInboundDeskHost = pathname.startsWith(INCOMING_SURFACE_ROUTE);
  const isInboundDocked = isInboundDeskHost && parseInboundLane(searchParams.get('lane')) === 'docked';

  // Returns CSV/TSV staging — session draft + `?import=csv` (Orders golden path).
  const returnsImportDraft = useTableImportDraft(
    INBOUND_RETURNS_IMPORT_DESCRIPTOR.surfaceId,
  );
  const { active: returnsImportActive, setActive: setReturnsImportActive } =
    useTableImportParam(INBOUND_RETURNS_IMPORT_DESCRIPTOR);
  const showReturnsImportStaging =
    isIncomingMode && returnsImportActive && Boolean(returnsImportDraft);

  useEffect(() => {
    if (!isIncomingMode) return;
    if (returnsImportDraft) return;
    // Session draft is gone — only clear a stale `?import=csv` deep link / refresh.
    // Do not call setActive(false) on every draft-null frame; that races Confirm's
    // soft-replace to `?inkind=return` and can wipe the post-commit filter.
    if (searchParams.get('import') !== 'csv') return;
    setReturnsImportActive(false);
  }, [
    isIncomingMode,
    returnsImportDraft,
    searchParams,
    setReturnsImportActive,
  ]);

  const returnsStagingWasOpen = useRef(false);
  useEffect(() => {
    if (!isIncomingMode) return;
    if (!returnsImportDraft) {
      returnsStagingWasOpen.current = false;
      return;
    }
    if (returnsImportActive) {
      returnsStagingWasOpen.current = true;
      return;
    }
    if (!returnsStagingWasOpen.current) return;
    returnsStagingWasOpen.current = false;
    clearTableImportDraft(INBOUND_RETURNS_IMPORT_DESCRIPTOR.surfaceId);
  }, [isIncomingMode, returnsImportDraft, returnsImportActive]);

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
  // Unbox History (2026-08-04): left-click opens History triage rail
  // (`detail:history`); gutter checkbox owns bulk; double-click / Enter opens
  // LineEditPanel. Never `mode.id === 'history'` alone (Docked / standalone
  // History share that id).
  const isUnboxHistoryTriage = embedded && isHistoryMode;
  // Incoming Pipeline: click toggles bulk; double-click / Enter opens the
  // inspector (not carton).
  const incomingClickSelect = isIncomingMode;
  // Sheets click-select face — Incoming only (History uses split planes).
  const selectGutterChrome =
    incomingClickSelect ? ('sheets' as const) : ('always' as const);

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

  /** Embedded Unbox History — left-click opens the triage slide-over. */
  const openHistoryTriage = useCallback((row: ReceivingLineRow) => {
    const target = historyTriageTargetFromRow(row);
    if (!target) {
      toast.error('No carton record for this row yet');
      return;
    }
    dispatchReceivingOpenHistoryTriage(target);
  }, []);

  /** Double-click / Enter on Unbox History — full station LineEditPanel. */
  const openHistoryWorkspace = useCallback((row: ReceivingLineRow) => {
    dispatchSelectLine(row, { recordView: false });
  }, []);

  /**
   * Unbox pinned Inbound tab — open Incoming details rail (same event as order-
   * chip Details). Must not `dispatchSelectLine` (that opens LineEditPanel).
   */
  const openIncomingDetails = useCallback((row: ReceivingLineRow) => {
    const resolved = incomingDetailsTargetFromRow(row);
    if (!resolved.ok) {
      toast.info(resolved.toast);
      return;
    }
    const t = resolved.target;
    dispatchReceivingOpenIncomingDetails({
      poId: t.poId,
      poNumber: t.poNumber,
      shipmentId: t.shipmentId,
      inboundSourceType: t.inboundSourceType,
      inboundSourceOrderId: t.inboundSourceOrderId,
      receivingId: t.receivingId,
      receivingLineId: t.receivingLineId,
    });
  }, []);

  const { data, isLoading, isError, refetch, localRows } = useReceivingLinesData({
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
    // Inbound embed is a foreign collection — Unbox KPI predicates do not apply.
    if (!isUnboxWorkbench || unboxTabForFilter === 'incoming') return localRows;
    const predicate = unboxKpiRowFilter(ukpiParam, unboxTabForFilter);
    return predicate ? localRows.filter(predicate) : localRows;
  }, [isUnboxWorkbench, localRows, ukpiParam, unboxTabForFilter]);

  const { groupedRecords, filteredGroupedRecords, orderedVisibleRows, getWeekCount } =
    useReceivingGrouping({ localRows: kpiFilteredRows, mode, historyAxis, weekRange, skipWeekFilter });

  // Export the current Unbox History view as CSV — Band-1 trailing triggers the
  // event, the table (rows in hand: kpi + week filtered, ordered) formats and
  // downloads. Never a second query. History surface only.
  const exportRowsRef = useRef<typeof orderedVisibleRows>(orderedVisibleRows);
  exportRowsRef.current = orderedVisibleRows;
  useEffect(() => {
    if (!isUnboxHistoryTriage) return;
    const onExport = () => {
      const rows = exportRowsRef.current;
      const csv = buildReceivingHistoryExportCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = receivingHistoryExportFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(rows.length === 1 ? 'Exported 1 row' : `Exported ${rows.length} rows`);
    };
    window.addEventListener('receiving-export-history', onExport);
    return () => window.removeEventListener('receiving-export-history', onExport);
  }, [isUnboxHistoryTriage]);

  const {
    selectedId,
    setSelectedId,
    selectedIds,
    handleSelectRow,
    handleToggleRow,
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
    openRow: isUnboxHistoryTriage
      ? openHistoryTriage
      : isHistorySurface
        ? openHistoryCarton
        : embedded && isIncomingMode
          ? openIncomingDetails
          : undefined,
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

  // Unbox History — publish on-screen order for ambient ↑↓ / j/k / Esc
  // (record-cursor SoT). Left-click path stays triage; Enter on a focused row
  // still opens LineEdit via the row's own key handler.
  const historyCursorOrder = useMemo((): GroupedRenderOrder<ReceivingLineRow> => {
    if (!isUnboxHistoryTriage) return [];
    return Object.entries(filteredGroupedRecords)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayGroups]) => {
        const sorted = mode.serverSorted
          ? dayGroups
          : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
        return [
          date,
          sorted.map((group) => ({ key: group.key, rows: group.rows })),
        ] as const;
      });
  }, [isUnboxHistoryTriage, filteredGroupedRecords, mode.serverSorted]);

  const handleHistoryCursorOpen = useCallback(
    (row: ReceivingLineRow, _ctx: { intent: CursorIntent; revealFoldKey: string | null }) => {
      handleSelectRow(row);
    },
    [handleSelectRow],
  );

  const handleHistoryCursorClose = useCallback(() => {
    // Esc: park first (keep target); second Esc clears triage.
    if (!getDetailInspectorCollapsed()) {
      setDetailInspectorCollapsed(true);
      return;
    }
    emitReceiving('receiving-close-history-triage');
  }, []);

  usePublishRecordCursor<ReceivingLineRow>({
    surfaceId: 'unbox-history-grid',
    scope: 'record',
    enabled: isUnboxHistoryTriage,
    priority: RECORD_CURSOR_PRIORITY.grid,
    order: historyCursorOrder,
    openId: isUnboxHistoryTriage ? selectedId : null,
    getId: (row) => row.id,
    onOpen: handleHistoryCursorOpen,
    onClose: handleHistoryCursorClose,
  });

  useRecordCursorKeyboard({
    enabled: isUnboxHistoryTriage,
    scope: 'record',
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
  useSurfacePaintMark('unbox:primary', embedded && !isLoading);

  // SSR first-paint handoff — seeded spine (or settled fetch) → drop stand-in.
  const unboxPrimaryPaint = useUnboxPrimaryPaintOptional();
  useEffect(() => {
    if (!embedded || !unboxPrimaryPaint) return;
    // Paintable = settled with any result (including empty queue) or seeded data.
    if (data != null && !isLoading) {
      unboxPrimaryPaint.onPrimaryPainted();
    }
  }, [embedded, unboxPrimaryPaint, data, isLoading]);

  const emptyMessage = mode.emptyMessage(modeContext);

  // Fourth settled state (degraded): the authoritative list fetch failed AND we
  // have nothing to paint. Show a retryable box instead of the skeleton-forever
  // / silent-empty this surface used to fall into. Rows present (cache/seed) →
  // keep showing them; a background refetch error must not blank the grid.
  const incomingDegraded = isIncomingMode && isError && localRows.length === 0;

  // Incoming grid adapter (was `IncomingGridView`): the table mounts the
  // registry host directly for the Incoming POS spreadsheet. Column sort is
  // DURABLE on `?colsort=`/`?coldir=` — deliberately NOT `?sort=` (that param is
  // the Incoming SERVER ORDER BY vocabulary). `isIncomingGridSortable` resolves
  // a receiving/history column key to null, so this always-live hook never acts
  // on the other family's sort while its grid is off screen.
  const {
    sort: incomingColumnSort,
    dir: incomingSortDir,
    setSort: setIncomingSort,
  } = useUrlColumnSort<IncomingGridColumnKey>({
    isColumn: isIncomingGridSortable,
    defaultDir: defaultDirForIncomingGridSort,
  });
  const incomingFoldKey = (row: ReceivingLineRow): string => {
    const po = (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || '').trim();
    return po || `line:${row.id}`;
  };
  const { incomingGroups, incomingFlatRows } = useMemo(() => {
    const flat = Object.values(filteredGroupedRecords).flatMap((day) =>
      day.flatMap((g) => g.rows),
    );
    // Column sort: one flat global order (single synthetic band — LedgerGrid has
    // no day headers). Otherwise day-band the PO groups.
    if (incomingColumnSort && incomingSortDir) {
      const sorted = [...flat].sort((a, b) =>
        compareIncomingGridRows(a, b, incomingColumnSort, incomingSortDir),
      );
      return {
        incomingGroups: [['', groupRowsBy(sorted, incomingFoldKey)]] as [
          string,
          RowGroup<ReceivingLineRow>[],
        ][],
        incomingFlatRows: sorted,
      };
    }
    const banded: [string, RowGroup<ReceivingLineRow>[]][] = Object.entries(filteredGroupedRecords)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayGroups]) => {
        const sorted = mode.serverSorted
          ? dayGroups
          : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
        return [date, sorted];
      });
    return { incomingGroups: banded, incomingFlatRows: flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGroupedRecords, mode.serverSorted, incomingColumnSort, incomingSortDir]);

  /**
   * Inline note commit for an Incoming row.
   *
   * An Incoming row IS a `receiving_line`, so its note is the same scalar
   * working field Unbox edits and it writes through the same helper — not a
   * second commit path. Optimistic with a rollback toast: `ReceivingGridHost`
   * makes exactly this call for its own lanes.
   */
  const queryClient = useQueryClient();
  const handleIncomingCommitNote = useCallback(
    (row: ReceivingLineRow, next: string) => {
      if (row.id <= 0) return;
      void commitReceivingLineNote({
        queryClient,
        lineId: row.id,
        previous: row.notes ?? null,
        next,
      }).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save note');
      });
    },
    [queryClient],
  );

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
        statusVocabulary={isHistoryMode ? 'coarse' : 'fine'}
        activityAxis={historyAxis}
        selectMode={selectMode}
        isSelected={selectMode ? selectedIds.has(row.id) : selectedId === row.id}
        onSelect={() => handleSelectRow(row)}
      />
    );
    return (
      // Board layout can fire inside the Unbox Inbound embed (`?layout=board`) —
      // keep it on the same `incoming_embed` bucket as the embed sheet so the
      // split from `/incoming` holds across both presentations (D13).
      <TableColumnConfigProvider
        tableId={isIncomingMode ? (embedded ? 'incoming_embed' : 'incoming') : 'receiving'}
      >
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

  // Unbox / History spreadsheet body — LedgerGrid via ReceivingGridHost (same
  // family as the Incoming grid). Date is a per-row column; no sticky day bands.
  // History default is the folded list; Drill (`?hlayout=drill`) mounts linked
  // dual panes via ReceivingDrillHost.
  const weekCount = getWeekCount();
  const unboxTab = getUnboxWorkspaceTabFromSearch(searchParams);
  const historyDrill =
    embedded &&
    unboxTab === 'history' &&
    parseHistoryDrillLayout(searchParams.get('hlayout')) === 'drill';

  // Unbox embed → inspector View cluster. Desk Incoming / standalone History
  // open Column display from Show inspector (no Band-3 ▦).
  const columnDisplayPortalTarget = embedded
    ? (toolbarPortalTarget ?? null)
    : null;

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
        activityAxis={historyAxis}
        isHistory={isHistoryMode}
        statusVocabulary={isHistoryMode ? 'coarse' : 'fine'}
        selectGutterChrome={selectGutterChrome}
        clickSelect={false}
        onOpenWorkspace={isUnboxHistoryTriage ? openHistoryWorkspace : undefined}
        historyTriageMenu={isUnboxHistoryTriage}
        scrollRef={scrollRef}
        columnTriggerPortalTarget={columnDisplayPortalTarget}
      />
    ) : (
      // COMPOUND (two-row) WMS layout — the receiving spreadsheet's row shape,
      // not a per-lane variant. Unbox, History and Testing all mount it: they
      // are the same table read at different moments, so a lane-conditional
      // column model would be exactly the fork this engine exists to prevent.
      // Density is an operator control in Column display, not chrome here.
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ReceivingGridHost
          columns={RECEIVING_COMPOUND_COLUMNS}
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
          activityAxis={historyAxis}
          isHistory={isHistoryMode}
          statusVocabulary={isHistoryMode ? 'coarse' : 'fine'}
          selectGutterChrome={selectGutterChrome}
          clickSelect={false}
          onOpenWorkspace={isUnboxHistoryTriage ? openHistoryWorkspace : undefined}
          historyTriageMenu={isUnboxHistoryTriage}
          scrollRef={scrollRef}
          columnTriggerPortalTarget={columnDisplayPortalTarget}
          className="h-full min-h-0 flex-1"
        />
      </div>
    );

  // Unbox Queue / Viewed skip the week filter — do NOT portal a static
  // "Door queue · N" fact chip (duplicates the Queue tab badge; not actionable).
  // Unbox History week lives in the Band 3 Refine funnel (`?weekOffset=`) — do
  // not portal a week pill into the inspector View cluster. Standalone History
  // still mounts the week pill on its own Band 3. Column display portals into
  // the View / triage controls slot via GridColumnGutter.triggerPortalTarget.
  const chromePill =
    isHistoryMode && embedded
      ? null
      : isHistoryMode || !skipWeekFilter
        ? (
          <DateRangePickerPill
            label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
            count={weekCount}
            // Triage-band peer of filter / column icons — ghost ToolbarButton, not
            // a pill island (WORKBENCH_CHROME_PILL_CLASS is for Band 1 CTA neighbors).
            weekNav={{
              weekOffset,
              onPrev: () => setWeekOffset(weekOffset + 1),
              onNext: () => setWeekOffset(Math.max(0, weekOffset - 1)),
            }}
          />
        )
        : null;

  // Unbox workbench embeds the table under UnboxWorkspaceHeader — week pill
  // (History only) portals into the top tabs bar controls slot.
  // Pinned Inbound (`?unboxview=incoming`): Incoming spreadsheet on its OWN
  // `tableId="incoming_embed"` prefs bucket — hiding a heavy column here never
  // touches the full `/incoming` desk density (Gemini D13). Triage/read only:
  // it mounts the host directly, never the Incoming desk header — so no
  // Check/Import/Add CTA cluster on this tab (Unbox owns Band 1).
  if (embedded) {
    if (isIncomingMode) {
      return (
        <TableColumnConfigProvider tableId="incoming_embed">
          {incomingDegraded ? (
            <div className="p-3">
              <GridDegradedBox onRetry={refetch} />
            </div>
          ) : (
            <NonlinearTableHost<ReceivingLineRow, IncomingGridColumnKey, IncomingGridColumn>
              binding={INCOMING_TABLE_BINDING}
              tableId="incoming_embed"
              // COMPOUND (two-row) WMS layout — the SAME tracks Unbox, History,
              // Testing, To-Ship and Tasks mount. No lane variant: the
              // recently-removed lane's reason rides the STATE pill
              // (`incomingStateFace`) instead of a sixth column only that lane
              // can use.
              columns={INCOMING_COMPOUND_COLUMNS}
              orderGroupsByDate={incomingGroups}
              rows={incomingFlatRows}
              sort={incomingColumnSort}
              dir={incomingSortDir}
              onSortChange={setIncomingSort}
              loading={isLoading && localRows.length === 0}
              emptyMessage={emptyMessage}
              scrollRef={scrollRef}
              columnTriggerPortalTarget={columnDisplayPortalTarget}
              renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
                <IncomingGridColumnHeader
                  isMobile={isMobile}
                  selectMode={selectMode}
                  selectionScope={RECEIVING_SELECTION_SCOPE}
                  selectGutterChrome={selectGutterChrome}
                  columns={visible}
                  activeSort={incomingColumnSort}
                  sortDir={incomingSortDir}
                  onSortColumn={toggleColumnSort}
                  onResizeColumn={onResizeColumn}
                  onResetColumn={onResetColumn}
                  tableId="incoming_embed"
                />
              )}
              renderGroup={(group, baseStripeIndex, { columns: visible }) => (
                <IncomingGridGroupRow
                  group={group}
                  baseStripeIndex={baseStripeIndex}
                  isMobile={isMobile}
                  selectMode={selectMode}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  handleSelectRow={handleSelectRow}
                  handleToggleRow={handleToggleRow}
                  clickSelect={incomingClickSelect}
                  selectGutterChrome={selectGutterChrome}
                  columns={visible}
                  onCommitNote={handleIncomingCommitNote}
                />
              )}
              renderRow={(row, stripeIndex, { columns: visible }) => (
                <IncomingGridGroupRow
                  group={{ key: `k:${row.id}`, rows: [row] }}
                  baseStripeIndex={stripeIndex}
                  isMobile={isMobile}
                  selectMode={selectMode}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  handleSelectRow={handleSelectRow}
                  handleToggleRow={handleToggleRow}
                  clickSelect={incomingClickSelect}
                  selectGutterChrome={selectGutterChrome}
                  columns={visible}
                  onCommitNote={handleIncomingCommitNote}
                />
              )}
            />
          )}
        </TableColumnConfigProvider>
      );
    }
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
  // HistoryWorkspaceHeader. IncomingWorkspaceHeader already paints Band 1 +
  // Band 3 (no KPI); the sheet shell owns the chrome stack + host.
  // Returns CSV staging swaps the Pipeline centre (Orders golden path).
  if (isIncomingMode || isInboundDocked) {
    return (
      <TableColumnConfigProvider tableId={isIncomingMode ? 'incoming' : 'receiving'}>
        {showReturnsImportStaging ? <IncomingReturnsImportStagingRail /> : null}
        <WorkbenchSheetView
          chrome={sheetChrome}
          className="h-full bg-transparent"
          tabs={
            showReturnsImportStaging
              ? undefined
              : ({ className }) => (
                  <IncomingWorkspaceHeader
                    className={className}
                    total={
                      isIncomingMode
                        ? isDeliveredUnscannedFacet || isDeliveredNotUnboxedFacet
                          ? localRows.length
                          : Number(data?.total ?? 0)
                        : Number(data?.total ?? localRows.length)
                    }
                    page={isIncomingMode ? incomingPage : 1}
                  />
                )
          }
        >
          {() =>
            showReturnsImportStaging ? (
              <IncomingReturnsImportStagingHost />
            ) : isIncomingMode ? (
              incomingDegraded ? (
                <div className="p-3">
                  <GridDegradedBox onRetry={refetch} />
                </div>
              ) : (
                <NonlinearTableHost<ReceivingLineRow, IncomingGridColumnKey, IncomingGridColumn>
                  binding={INCOMING_TABLE_BINDING}
                  // COMPOUND (two-row) WMS layout — see the embedded mount above.
                  columns={INCOMING_COMPOUND_COLUMNS}
                  orderGroupsByDate={incomingGroups}
                  rows={incomingFlatRows}
                  sort={incomingColumnSort}
                  dir={incomingSortDir}
                  onSortChange={setIncomingSort}
                  loading={isLoading && localRows.length === 0}
                  emptyMessage={emptyMessage}
                  scrollRef={scrollRef}
                  columnTriggerPortalTarget={null}
                  renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
                    <IncomingGridColumnHeader
                      isMobile={isMobile}
                      selectMode={selectMode}
                      selectionScope={RECEIVING_SELECTION_SCOPE}
                      selectGutterChrome={selectGutterChrome}
                      columns={visible}
                      activeSort={incomingColumnSort}
                      sortDir={incomingSortDir}
                      onSortColumn={toggleColumnSort}
                      onResizeColumn={onResizeColumn}
                      onResetColumn={onResetColumn}
                    />
                  )}
                  renderGroup={(group, baseStripeIndex, { columns: visible }) => (
                    <IncomingGridGroupRow
                      group={group}
                      baseStripeIndex={baseStripeIndex}
                      isMobile={isMobile}
                      selectMode={selectMode}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      handleSelectRow={handleSelectRow}
                      handleToggleRow={handleToggleRow}
                      clickSelect={incomingClickSelect}
                      selectGutterChrome={selectGutterChrome}
                      columns={visible}
                      onCommitNote={handleIncomingCommitNote}
                    />
                  )}
                  renderRow={(row, stripeIndex, { columns: visible }) => (
                    <IncomingGridGroupRow
                      group={{ key: `k:${row.id}`, rows: [row] }}
                      baseStripeIndex={stripeIndex}
                      isMobile={isMobile}
                      selectMode={selectMode}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      handleSelectRow={handleSelectRow}
                      handleToggleRow={handleToggleRow}
                      clickSelect={incomingClickSelect}
                      selectGutterChrome={selectGutterChrome}
                      columns={visible}
                      onCommitNote={handleIncomingCommitNote}
                    />
                  )}
                />
              )
            ) : (
              receivingGrid()
            )
          }
        </WorkbenchSheetView>
      </TableColumnConfigProvider>
    );
  }

  // History — standalone `/receiving/history` (until redirected). Unbox embeds
  // use the `embedded` branch above — never wrap that host. 1+3 sheet: Band 1
  // tabs + Band 3 triage; no KPI.
  if (isHistoryMode) {
    return (
      <TableColumnConfigProvider tableId="receiving">
        <WorkbenchSheetView
          chrome={sheetChrome}
          className="h-full bg-transparent"
          tabs={({ className }) => <HistoryWorkspaceHeader className={className} />}
          triage={({ controlsSlotRef }) => (
            <HistoryTriageBand
              controlsSlotRef={controlsSlotRef}
              weekRange={weekRange}
              weekOffset={weekOffset}
              weekCount={getWeekCount()}
              onPrevWeek={() => setWeekOffset(weekOffset + 1)}
              onNextWeek={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            />
          )}
        >
          {() => receivingGrid()}
        </WorkbenchSheetView>
      </TableColumnConfigProvider>
    );
  }

  return (
    <TableColumnConfigProvider tableId="receiving">
      <WorkbenchSheetView chrome={sheetChrome} className="h-full bg-transparent">
        {() => receivingGrid()}
      </WorkbenchSheetView>
    </TableColumnConfigProvider>
  );
}
