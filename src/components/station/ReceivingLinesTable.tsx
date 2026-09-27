'use client';

/** Receiving-lines table — thin composition layer. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { IncomingReturnsImportStagingHost } from '@/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost';
import { IncomingReturnsImportStagingRail } from '@/components/sidebar/receiving/incoming/IncomingReturnsImportStagingRail';
import { IncomingDeliveriesLedger } from '@/components/receiving/incoming/IncomingDeliveriesLedger';
import { useIncomingStatusChips } from '@/components/receiving/incoming/IncomingStatusChips';
import { DockedReceiptsLedger } from '@/components/receiving/history/DockedReceiptsLedger';
import { ReceivingOrderComposer } from '@/components/receiving/incoming/order-composer/ReceivingOrderComposer';
import {
  getReceivingOrderComposerKind,
  subscribeReceivingOrderComposer,
} from '@/lib/inbound/receiving-order-composer-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import {
  clearTableImportDraft,
  useTableImportDraft,
} from '@/lib/tables/import/staging-store';
import {
  receivingCompoundColumnsFor,
  defaultDirForIncomingGridSort,
  isIncomingGridSortable,
  type IncomingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import { computeWeekRange, formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';
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
import { ReceivingSpreadsheet } from '@/components/station/receiving-grid/useReceivingSpreadsheet';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { useReceivingTableLayout } from '@/components/station/receiving-grid/useReceivingTableLayout';
import { useIncomingTableChrome } from '@/components/station/incoming-grid/useIncomingTableChrome';
import { useReceivingTableChrome } from '@/components/station/receiving-grid/useReceivingTableChrome';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import {
  filterRowsByRecon,
  parseReconParam,
  parseRefInParam,
  RECON_PARAM,
  RECONCILE_CAP_NOTE,
  REF_IN_PARAM,
  RECON_STATUS_LABELS,
} from '@/lib/receiving/reconcile';
import { useInboundCheck } from '@/lib/receiving/inbound-check-query';
import { cutIncomingSections } from '@/lib/receiving/incoming-sections';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout, parseWeekOffset, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cartonReadHref, INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { toast } from '@/lib/toast';
import { poGroupAnchorMs } from '@/components/station/receiving-lines-table-helpers';
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
export type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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
   * Mounted inside the Unbox workbench rather than as its own desk. Queue and
   * Recent paint the receiving spreadsheet; History and Inbound mount the same
   * RecordLedgers as `/incoming` (Docked / On the way).
   */
  embedded?: boolean;
}

export default function ReceivingLinesTable({
  selectMode = false,
  embedded = false,
}: ReceivingLinesTableProps = {}) {
  const { isMobile } = useUIModeOptional();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  // Shared scroll owner for the painted body (spreadsheet or ledger).
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
  // `/incoming` searches from the contextual sidebar's Find (the desk store,
  // keyed by the desk path); the Unbox embeds keep their own ledger field.
  const [localSearchValue, setLocalSearchValue] = useState('');
  const [deskSearchValue, setDeskSearchValue] = useDeskSearch(INCOMING_SURFACE_ROUTE);
  const weekOffsetFromUrl = Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM)));
  const weekOffset = isHistoryMode ? weekOffsetFromUrl : localWeekOffset;
  const weekExplicit = isHistoryMode ? searchParams.has(WEEK_OFFSET_PARAM) : true;
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

  // Inbound desk (`/incoming`) hosts On the way + Docked. Docked resolves as
  // history mode, but each lane renders its own RecordLedger (toolbar included,
  // records on DeskRecordPlane) — never the History sheet chrome.
  const isInboundDeskHost = pathname.startsWith(INCOMING_SURFACE_ROUTE);
  const isInboundDocked = isInboundDeskHost && parseInboundLane(searchParams.get('lane')) === 'docked';
  const receivingSearchValue = isInboundDeskHost ? deskSearchValue : localSearchValue;
  const setReceivingSearchValue = isInboundDeskHost ? setDeskSearchValue : setLocalSearchValue;
  // Inbound reconciliation: a pasted list (`?ref_in=`) swaps On the way for
  // every line it names; the Check says which bucket each number is in and
  // `?recon=` keeps one bucket. Same query key as the sidebar — one Check.
  const refSelection = parseRefInParam(isInboundDeskHost && isIncomingMode ? searchParams.get(REF_IN_PARAM) : null);
  const reconciling = refSelection.refs.length > 0;
  const recon = reconciling ? parseReconParam(searchParams.get(RECON_PARAM)) : null;
  const inboundCheck = useInboundCheck(refSelection);
  // Add swaps the ledger for the receiving-order composer — either lane of the
  // Inbound desk, and the Unbox Inbound tab (its header's Add purchase order).
  const composerKind = useSyncExternalStore(
    subscribeReceivingOrderComposer,
    getReceivingOrderComposerKind,
    () => null,
  );

  // Returns CSV/TSV staging — session draft + `?import=csv` (Orders golden path).
  const returnsImportDraft = useTableImportDraft(
    INBOUND_RETURNS_IMPORT_DESCRIPTOR.surfaceId,
  );
  const { active: returnsImportActive, setActive: setReturnsImportActive } =
    useTableImportParam(INBOUND_RETURNS_IMPORT_DESCRIPTOR);
  // Inbound desk only — the Unbox Inbound tab never hosts the returns import.
  const showReturnsImportStaging =
    isInboundDeskHost && isIncomingMode && returnsImportActive && Boolean(returnsImportDraft);

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

  // `mode.id === 'history'` is shared by THREE hosts — `/receiving/history`, the Unbox workbench's History tab (`embedded`), and…
  const isHistorySurface = isHistoryMode && !embedded && !isInboundDocked;
  // The Unbox workbench — all three of its tabs.
  const isUnboxWorkbench = embedded;
  // Every RecordLedger host — Unbox History + Inbound tabs and the `/incoming` On the way + Docked lanes — shows a picked row on the…
  const isUnboxHistory = isHistoryMode && embedded;
  const isLedgerHost = isIncomingMode || isInboundDocked || isUnboxHistory;
  const openLineRaw = isLedgerHost ? searchParams.get('openLine') : null;
  const openLineId =
    openLineRaw && Number.isFinite(Number(openLineRaw)) && Number(openLineRaw) !== 0
      ? Number(openLineRaw)
      : null;
  // Reads the LIVE query string: J/K can step faster than `useSearchParams`
  // re-renders, and a stale snapshot would drop the other params.
  const setOpenLine = useCallback(
    (lineId: number | null) => {
      const params = new URLSearchParams(window.location.search);
      if (lineId == null) params.delete('openLine');
      else params.set('openLine', String(lineId));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router],
  );
  const openLedgerRow = useCallback((row: ReceivingLineRow) => setOpenLine(row.id), [setOpenLine]);
  const closeLedgerRow = useCallback(() => setOpenLine(null), [setOpenLine]);
  // Split planes on every receiving body: the row body opens its record, the
  // gutter checkbox owns bulk membership (checks never open the record plane).
  const selectGutterChrome = 'always' as const;

  /** History's record plane: */
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

  // A pasted list and the Exceptions view load as ONE page (up to
  // `RECONCILE_ROW_LIMIT`), so Find and the status filter reach every line.
  const isInboundExceptions = modeContext.incomingExceptions;
  const onePage = reconciling || isInboundExceptions;
  // Over the cap the rows are a partial set: a bucket filter over them would
  // hide lines that are there, so the chips stand down and a note says so.
  const reconcileCapped =
    onePage && data != null && Number(data.total ?? 0) > (data.receiving_lines?.length ?? 0);
  const reconFilter = reconcileCapped ? null : recon;
  // Status chips over the Incoming ledger: delivery state (`?state=`), or the
  // pasted list's buckets (`?recon=`) — ⌥1–⌥N.
  // Exceptions is its own population: no delivery-state or paste buckets over it.
  const incomingStatusChips = useIncomingStatusChips({
    enabled: isIncomingMode && !isInboundExceptions,
    reconciling,
    check: inboundCheck,
    recon: reconFilter,
    disabledReason: reconcileCapped ? RECONCILE_CAP_NOTE : null,
  });

  // KPI-tile click-to-filter (Unbox only).
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
    if (!isUnboxHistory && !isInboundDocked) return;
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
  }, [isUnboxHistory, isInboundDocked]);

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
    // Row body opens, the gutter checkbox owns bulk membership.
    rowClickOpens: isIncomingMode || isInboundDocked || isHistorySurface || isUnboxWorkbench,
    // History's default `receiving-select-line` branch does `router.replace('/unbox?openReceivingId=…')`, i.e.
    openRow: isHistorySurface ? openHistoryCarton : undefined,
    // A click on the Unbox FEED opens the carton but does NOT stamp the operator's recents.
    recordViewOnOpen: !isUnboxWorkbench,
    localRows,
    orderedVisibleRows,
  });

  useReceivingTableNavigation({
    orderedVisibleRows,
    handleSelectRow,
    selectedIdRef,
    selectModeRef,
    rowClickOpens: isIncomingMode || isInboundDocked || isHistorySurface || isUnboxWorkbench,
    scrollRef,
    selectedId,
    // The spreadsheet bodies own the chevron channel; ledgers own J/K.
    tableNavEnabled: (isHistoryMode || isIncomingMode || isUnboxTableMode || embedded) && !isLedgerHost,
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

  const emptyMessage = reconFilter
    ? inboundCheck.loading
      ? 'Checking the pasted numbers…'
      : `No pasted numbers are ${RECON_STATUS_LABELS[reconFilter].toLowerCase()}.`
    : mode.emptyMessage(modeContext);

  // Fourth settled state (degraded):
  const incomingDegraded = isIncomingMode && isError && localRows.length === 0;

  // Incoming column sort — DURABLE on `?colsort=`/`?coldir=`, deliberately NOT `?sort=` (that param is the Incoming SERVER ORDER BY vocabulary).
  const {
    sort: incomingColumnSort,
    dir: incomingSortDir,
    setSort: setIncomingSort,
    toggleColumnSort: toggleIncomingSort,
  } = useUrlColumnSort<IncomingGridColumnKey>({
    isColumn: isIncomingGridSortable,
    defaultDir: defaultDirForIncomingGridSort,
  });
  const incomingFoldKey = (row: ReceivingLineRow): string => {
    const po = (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || '').trim();
    return po || `line:${row.id}`;
  };
  const incomingSectioned =
    isIncomingMode && !incomingColumnSort && !modeContext.incomingSort && !isInboundExceptions;
  const { incomingGroups, incomingFlatRows } = useMemo(() => {
    const all = Object.values(filteredGroupedRecords).flatMap((day) =>
      day.flatMap((g) => g.rows),
    );
    const reconciled = reconFilter ? filterRowsByRecon(all, inboundCheck.entries, reconFilter) : all;
    const narrowed = reconFilter !== null;
    const flat = receivingSearchValue.trim()
      ? reconciled.filter((row) => receivingLineMatchesQuery(row, receivingSearchValue))
      : reconciled;
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
    const plain = receivingSearchValue.trim() || narrowed;
    // Default sort (no column sort, no server sort picked) on On the way: cut
    // the purchases into urgency sections — the band key is the section, so
    // both faces and J / K walk the cut. The server pages by the same ladder.
    if (incomingSectioned) {
      const ordered = plain
        ? groupRowsBy(flat, incomingFoldKey)
        : Object.entries(filteredGroupedRecords)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .flatMap(([, dayGroups]) => dayGroups);
      return { incomingGroups: cutIncomingSections(ordered), incomingFlatRows: flat };
    }
    if (plain) {
      return {
        incomingGroups: [['', groupRowsBy(flat, incomingFoldKey)]] as [
          string,
          RowGroup<ReceivingLineRow>[],
        ][],
        incomingFlatRows: flat,
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
  }, [filteredGroupedRecords, mode.serverSorted, incomingColumnSort, incomingSortDir, receivingSearchValue, reconFilter, inboundCheck.entries, incomingSectioned]);
  const setIncomingPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router, searchParams],
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
      // Board layout (`?layout=board`, behind the boards flag) replaces any body.
      <>
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
      </>
    );
  }

  // Unbox Queue / Recent + standalone History spreadsheet body —
  // ReceivingSpreadsheet → DataTable. Date is a per-row column; no sticky day
  // bands.
  const weekCount = getWeekCount();
  /** The one find field for every receiving body — session-local; typing never writes the URL. */
  // The effective slot layout (staff ?? org ?? product) materialized into the
  // compound tracks — one document for every receiving rail, because Unbox,
  // History and Testing are the same table read at different moments.
  const { effectiveLayout: receivingLayout, fields: receivingFields } =
    useReceivingTableLayout();
  const receivingColumns = useMemo(
    () => receivingCompoundColumnsFor(receivingLayout),
    [receivingLayout],
  );

  const receivingSearch = {
    value: receivingSearchValue,
    onChange: setReceivingSearchValue,
    placeholder: isIncomingMode ? 'Filter incoming…' : 'Filter cartons…',
  };
  const incomingChrome = useIncomingTableChrome();
  const receivingChrome = useReceivingTableChrome();

  const receivingGrid = () => (
    // COMPOUND (two-row) WMS layout — the receiving spreadsheet's row shape, not a per-lane variant.
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ReceivingSpreadsheet
        search={receivingSearch}
        filter={isUnboxWorkbench ? receivingChrome.filter : undefined}
        columns={receivingColumns}
        fields={receivingFields}
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
        scrollRef={scrollRef}
        className="h-full min-h-0 flex-1"
      />
    </div>
  );

  // Unbox Queue / Recent skip the week filter — do NOT paint a static
  // "Door queue · N" fact chip (duplicates the Queue tab badge; not actionable).
  // History (Unbox tab, Docked lane, standalone) carries the week pill.
  const chromePill =
    isHistoryMode || !skipWeekFilter
      ? (
        <DateRangePickerPill
          label={
            weekExplicit
              ? formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)
              : 'All time'
          }
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

  // Record ledgers — Incoming (Unbox Inbound tab, `/incoming` On the way) and Docked history (Unbox History tab, `/incoming?lane=docked`).
  if (isLedgerHost) {
    // The ledgers paint on the industrial record face (`mode-*` tokens). The
    // Inbound desk page declares its triage region; the Unbox workbench does
    // not, so its History / Inbound tabs carry the same region here.
    const inTriageRegion = (body: ReactNode) =>
      isInboundDeskHost ? body : <ModeRegion mode="triage" className="contents">{body}</ModeRegion>;
    if (composerKind && (isInboundDeskHost || isIncomingMode)) {
      return inTriageRegion(<ReceivingOrderComposer kind={composerKind} />);
    }
    return inTriageRegion(
      <>
        {showReturnsImportStaging ? <IncomingReturnsImportStagingRail /> : null}
        {
            showReturnsImportStaging ? (
              <IncomingReturnsImportStagingHost />
            ) : isIncomingMode ? (
              incomingDegraded ? (
                <div className="p-3">
                  <GridDegradedBox onRetry={refetch} />
                </div>
              ) : (
                <IncomingDeliveriesLedger
                  groups={incomingGroups}
                  rows={incomingFlatRows}
                  loading={isLoading && localRows.length === 0}
                  emptyMessage={emptyMessage}
                  query={isInboundDeskHost ? undefined : receivingSearchValue}
                  onQueryChange={isInboundDeskHost ? undefined : setReceivingSearchValue}
                  filter={incomingChrome.filter}
                  statusChips={incomingStatusChips}
                  notice={reconcileCapped ? RECONCILE_CAP_NOTE : null}
                  lane={isInboundExceptions ? 'exceptions' : 'pipeline'}
                  sectioned={incomingSectioned}
                  sort={incomingColumnSort}
                  sortDir={incomingSortDir}
                  onSort={(key) => {
                    if (incomingColumnSort === key) toggleIncomingSort(key);
                    else setIncomingSort(key);
                  }}
                  selectedId={openLineId}
                  selectedIds={selectedIds}
                  onOpenRow={openLedgerRow}
                  onCloseRow={closeLedgerRow}
                  onToggleRow={handleToggleRow}
                  // A pasted list and Exceptions are one page — every line, filtered in place.
                  page={onePage ? 1 : incomingPage}
                  pageSize={onePage ? Math.max(1, incomingFlatRows.length) : INCOMING_PAGE_SIZE}
                  total={onePage ? incomingFlatRows.length : Number(data?.total ?? incomingFlatRows.length)}
                  onPage={setIncomingPage}
                  scrollRef={scrollRef}
                />
              )
            ) : (
              <DockedReceiptsLedger
                rows={orderedVisibleRows}
                loading={isLoading && localRows.length === 0}
                emptyMessage={emptyMessage}
                query={receivingSearchValue}
                onQueryChange={isInboundDeskHost ? undefined : setReceivingSearchValue}
                activityAxis={historyAxis}
                toolbarExtra={chromePill}
                selectedId={openLineId}
                selectedIds={selectedIds}
                onOpenRow={openLedgerRow}
                onCloseRow={closeLedgerRow}
                onToggleRow={handleToggleRow}
                scrollRef={scrollRef}
              />
            )
          }
      </>
    );
  }

  return <>{receivingGrid()}</>;
}
