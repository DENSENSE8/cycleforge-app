'use client';

/**
 * Receiving ledgers — the browse body for every receiving list surface:
 * `/incoming` (On the way, pasted numbers, Docked, Unboxed), `/receiving/history`,
 * and the Unbox workbench tabs (`embedded`: carton cards for Queue / Recent,
 * the same RecordLedgers for History / Inbound). Owns the shared state the
 * ledgers read: Find, row selection, the week, the CSV export event, the
 * imports staging takeover, and the Unbox primary-paint handoff.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { IncomingDeliveriesLedger } from '@/components/receiving/incoming/IncomingDeliveriesLedger';
import { PastedNumbersLedger } from '@/components/receiving/incoming/PastedNumbersLedger';
import { useIncomingStatusChords } from '@/components/receiving/incoming/useIncomingStatusChords';
import { DockedPackagesLedger } from '@/components/receiving/docked/DockedPackagesLedger';
import { UnboxedReceiptsLedger } from '@/components/receiving/history/DockedReceiptsLedger';
import {
  defaultDirForIncomingGridSort,
  isIncomingGridSortable,
  type IncomingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import { formatWeekRangeCompact } from '@/utils/date';
import { receivingDayWindow } from '@/components/station/receiving-grouping';
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
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { UnboxCartonCards } from '@/components/receiving/unbox/UnboxCartonCards';
import { GridDegradedBox } from '@/design-system/components/grid';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import {
  parseReconParam,
  parseReconReasonParam,
  parseRefInParam,
  RECON_PARAM,
  RECON_REASON_LABELS,
  RECON_REASON_PARAM,
  RECONCILE_CAP_NOTE,
  REF_IN_PARAM,
  RECON_STATUS_LABELS,
} from '@/lib/receiving/reconcile';
import { useInboundCheck } from '@/lib/receiving/inbound-check-query';
import { cutIncomingSections } from '@/lib/receiving/incoming-sections';
import { parseWeekOffset, WEEK_OFFSET_PARAM } from '@/lib/station/table-url-params';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cartonReadHref, INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { setRecordDetailsParam } from '@/lib/records/record-details';
import { toast } from '@/lib/toast';
import { poGroupAnchorMs } from '@/components/station/receiving-lines-table-helpers';
import { INBOUND_FIND_PARAM, parseInboundLane } from '@/lib/receiving/inbound-lane';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';
import { unboxKpiRowFilter, UNBOX_KPI_FILTER_PARAM } from '@/lib/receiving/unbox-metrics';

export interface ReceivingLedgersProps {
  selectMode?: boolean;
  /**
   * Mounted inside the Unbox workbench rather than as its own desk. Queue and
   * Recent paint the carton cards; History and Inbound mount the same
   * RecordLedgers as `/incoming` (Docked / On the way).
   */
  embedded?: boolean;
}

export function ReceivingLedgers({
  selectMode = false,
  embedded = false,
}: ReceivingLedgersProps = {}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  // Shared scroll owner for the painted body (spreadsheet or ledger).
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    mode,
    isIncomingMode,
    isDockedMode,
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
  // The header's page Find owns receiving search on the Inbound desk and
  // Unbox embeds alike, so reloads and deep links preserve it.
  const urlFindValue = searchParams.get(INBOUND_FIND_PARAM) ?? '';
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
  // Inbound History's sidebar date row (`?dateFrom=`/`?dateTo=`) replaces the
  // week as the day slice while set; an open end reaches every loaded day.
  const historyDateRange = modeContext.historyDateRange ?? null;
  const weekRange = receivingDayWindow(weekOffset, historyDateRange);

  const isUnboxTableMode = mode.id === 'unbox_queue' || mode.id === 'unbox_viewed';

  // Deliveries hosts three distinct feeds: pre-arrival Inbound, arrival-scanned
  // Docked, and Unboxed history. They share the record plane, never membership.
  const isInboundDeskHost = pathname.startsWith(INCOMING_SURFACE_ROUTE);
  const inboundLane = isInboundDeskHost ? parseInboundLane(searchParams.get('lane')) : null;
  const isInboundDocked = isDockedMode && inboundLane === 'docked';
  const isInboundUnboxed = isHistoryMode && inboundLane === 'unboxed';
  const receivingSearchValue = urlFindValue;
  // Inbound reconciliation: a pasted list (`?ref_in=`) swaps On the way for
  // every line it names; the Check says which bucket each number is in and
  // `?recon=` keeps one bucket. Same query key as the sidebar — one Check.
  const refSelection = parseRefInParam(isInboundDeskHost && isIncomingMode ? searchParams.get(REF_IN_PARAM) : null);
  const reconciling = refSelection.refs.length > 0;
  const recon = reconciling ? parseReconParam(searchParams.get(RECON_PARAM)) : null;
  const inboundCheck = useInboundCheck(refSelection);

  // `mode.id === 'history'` is shared by THREE hosts — `/receiving/history`, the Unbox workbench's History tab (`embedded`), and…
  const isHistorySurface = isHistoryMode && !embedded && !isInboundUnboxed;
  // The Unbox workbench — all three of its tabs.
  const isUnboxWorkbench = embedded;
  // Every RecordLedger host — Unbox History + Inbound tabs and the `/incoming` On the way + Docked lanes — shows a picked row on the…
  const isUnboxHistory = isHistoryMode && embedded;
  const isLedgerHost = isIncomingMode || isInboundDocked || isInboundUnboxed || isUnboxHistory;
  const openLineRaw = isLedgerHost ? searchParams.get('openLine') : null;
  const openLineId =
    openLineRaw && Number.isFinite(Number(openLineRaw)) && Number(openLineRaw) !== 0
      ? Number(openLineRaw)
      : null;
  // Reads the LIVE query string: J/K can step faster than `useSearchParams`
  // re-renders, and a stale snapshot would drop the other params.
  const setOpenLine = useCallback(
    (lineId: number | null) => {
      // The card's open record — the same writer the pasted list's opener uses (`recordDetailsHref`).
      const params = setRecordDetailsParam(new URLSearchParams(window.location.search), 'receiving-number', lineId);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router],
  );
  const openLedgerRow = useCallback((row: ReceivingLineRow) => setOpenLine(row.id), [setOpenLine]);
  const closeLedgerRow = useCallback(() => setOpenLine(null), [setOpenLine]);

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
  // hide lines that are there, so the statuses stand down and a note says so.
  const reconcileCapped =
    onePage && data != null && Number(data.total ?? 0) > (data.receiving_lines?.length ?? 0);
  const reconFilter = reconcileCapped ? null : recon;
  const reconReason = parseReconReasonParam(searchParams.get(RECON_REASON_PARAM), reconFilter);
  // A pasted list reads number by number (one card per pasted number); the
  // Exceptions lane keeps its own population.
  const numbersLedger = reconciling && !isInboundExceptions;
  // Inbound's statuses are the sidebar's (`incoming.pipeline` facet `?state=`;
  // a pasted list's `?recon=` / `?recon_reason=` are its ledger's status row); their
  // ⌥1–⌥N keys live here. Exceptions is its own population: neither.
  useIncomingStatusChords({
    enabled: isIncomingMode && !isInboundExceptions,
    reconciling,
    disabled: reconcileCapped,
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
    if (!isUnboxHistory && !isInboundDocked && !isInboundUnboxed) return;
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
  }, [isUnboxHistory, isInboundDocked, isInboundUnboxed]);

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
    rowClickOpens: isIncomingMode || isInboundDocked || isInboundUnboxed || isHistorySurface || isUnboxWorkbench,
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
    rowClickOpens: isIncomingMode || isInboundDocked || isInboundUnboxed || isHistorySurface || isUnboxWorkbench,
    scrollRef,
    selectedId,
    // The spreadsheet bodies own the chevron channel; ledgers own J/K.
    tableNavEnabled: (isHistoryMode || isIncomingMode || isUnboxTableMode || embedded) && !isLedgerHost,
  });

  useReceivingDeepLink({ isLoading, localRows, setSelectedId });
  // The card face's close: drop the open line and the workspace it loaded.
  const closeCardRow = useCallback(() => {
    setSelectedId(null);
    dispatchSelectLine(null, { recordView: false });
  }, [setSelectedId]);

  useReceivingAutoWeek({
    isHistoryMode,
    explicitRange: historyDateRange != null,
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
      : `No pasted numbers are ${RECON_STATUS_LABELS[reconFilter].toLowerCase()}${reconReason ? ` · ${RECON_REASON_LABELS[reconReason]}` : ''}.`
    : mode.emptyMessage(modeContext);

  // Fourth settled state (degraded):
  const incomingDegraded = isIncomingMode && isError && localRows.length === 0;

  // Incoming column sort — DURABLE on `?colsort=`/`?coldir=`, deliberately NOT `?sort=` (that param is the Incoming SERVER ORDER BY vocabulary).
  const { sort: incomingColumnSort, dir: incomingSortDir } = useUrlColumnSort<IncomingGridColumnKey>({
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
    const flat = receivingSearchValue.trim()
      ? all.filter((row) => receivingLineMatchesQuery(row, receivingSearchValue))
      : all;
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
    const plain = receivingSearchValue.trim();
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
  }, [filteredGroupedRecords, mode.serverSorted, incomingColumnSort, incomingSortDir, receivingSearchValue, incomingSectioned]);
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
  const weekCount = getWeekCount();

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

  // Record ledgers — Inbound deliveries, Docked packages, and Unboxed cartons.
  if (isLedgerHost) {
    // The ledgers paint on the shared record face (`mode-*` tokens). The
    // Inbound desk page declares its triage region; the Unbox workbench does
    // not, so its History / Inbound tabs carry the same region here.
    const inTriageRegion = (body: ReactNode) =>
      isInboundDeskHost ? body : <ModeRegion mode="triage" className="contents">{body}</ModeRegion>;
    return inTriageRegion(
      <>
        {
            isIncomingMode ? (
              incomingDegraded ? (
                <div className="p-3">
                  <GridDegradedBox onRetry={refetch} />
                </div>
              ) : numbersLedger ? (
                <PastedNumbersLedger
                  check={inboundCheck}
                  status={reconFilter}
                  reason={reconReason}
                  rows={localRows}
                  rowsLoading={isLoading && localRows.length === 0}
                  emptyMessage={emptyMessage}
                  findValue={receivingSearchValue}
                  notice={reconcileCapped ? RECONCILE_CAP_NOTE : null}
                  selectedId={openLineId}
                  selectedIds={selectedIds}
                  onOpenId={setOpenLine}
                  onToggleRow={handleToggleRow}
                />
              ) : (
                <IncomingDeliveriesLedger
                  groups={incomingGroups}
                  rows={incomingFlatRows}
                  loading={isLoading && localRows.length === 0}
                  emptyMessage={emptyMessage}
                  findValue={receivingSearchValue}
                  notice={reconcileCapped ? RECONCILE_CAP_NOTE : null}
                  lane={isInboundExceptions ? 'exceptions' : 'pipeline'}
                  sectioned={incomingSectioned}
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
                />
              )
            ) : isInboundDocked ? (
              <DockedPackagesLedger
                rows={orderedVisibleRows}
                loading={isLoading && localRows.length === 0}
                emptyMessage={emptyMessage}
                query={receivingSearchValue}
                selectedId={openLineId}
                selectedIds={selectedIds}
                onOpenRow={openLedgerRow}
                onCloseRow={closeLedgerRow}
                onToggleRow={handleToggleRow}
              />
            ) : (
              <UnboxedReceiptsLedger
                rows={orderedVisibleRows}
                loading={isLoading && localRows.length === 0}
                emptyMessage={emptyMessage}
                query={receivingSearchValue}
                activityAxis={historyAxis}
                toolbarExtra={isInboundDeskHost ? null : chromePill}
                selectedId={openLineId}
                selectedIds={selectedIds}
                onOpenRow={openLedgerRow}
                onCloseRow={closeLedgerRow}
                onToggleRow={handleToggleRow}
              />
            )
          }
      </>
    );
  }

  // Unbox Queue / Recent (and any non-ledger receiving body) — the carton card
  // face. Rows arrive in the host's order with the KPI cut applied.
  return (
    <UnboxCartonCards
      rows={orderedVisibleRows}
      loading={isLoading && localRows.length === 0}
      emptyMessage={emptyMessage}
      query={receivingSearchValue}
      activityAxis={historyAxis}
      selectedId={selectedId}
      selectedIds={selectedIds}
      onOpenRow={handleSelectRow}
      onCloseRow={closeCardRow}
      onToggleRow={handleToggleRow}
    />
  );
}
