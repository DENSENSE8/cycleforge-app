'use client';

/**
 * The Fulfilled desk (`/fulfilled`) on the Allocate card face
 * (`TriageCardList` + `RecordCard`, owner 2026-09-29) — one card per PACKAGE
 * (carrier tracking number; a pack scan with none keys as `scan-<id>`), its
 * lines the box's order lines (`ShippedPackageCard`). The feed is
 * `useShippedTableFilters` → `useShippedTableRecords` (week buckets, Load
 * older); its facets and Find are the sidebar's. The open package is
 * `?shipment=` (`SHIPMENT_RECORD_PARAM`, `replaceState`) and may name a
 * package outside the loaded window (a sibling box, or a tracking # resolved
 * through `/api/shipments/lookup`); legacy `?openOrderId=` bookmarks map to
 * that line's package.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { Copy } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { scopeRecordVerbs } from '@/design-system/components/record-action-strip/record-verb-scope';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { triageRowKeyId } from '@/design-system/components/triage-card-list/triage-row-id';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { writeClipboardText } from '@/lib/clipboard';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { RowGroup } from '@/lib/group-rows';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { lookupShipmentByTracking } from '@/lib/shipments/shipment-record-client';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import type { ShippedTypeFilter } from '@/lib/shipping/shipped-filter/shipped-filter-constants';
import { shippedStampInWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { toast } from '@/lib/toast';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { detectCarrierFromTracking } from '@/utils/carrier-patterns';
import { formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';
import { ShippedPackageCard } from './ShippedPackageCard';
import { ShippedPackageRow } from './ShippedPackageRow';
import {
  isOpenUnmatchedScan,
  isUnmatchedScanOut,
  SHIPPED_STATUS_CHIPS,
  shippedStatusChipFace,
  shippedStatusKeys,
  type ShippedCardModel,
  type ShippedStatusChip,
} from './shipped-card-model';
import { shippedPackageKey, shippedPackageTracking } from './shipped-package-state';
import { useShipmentRecordSlot } from './use-shipment-record-slot';
import {
  fetchOpenUnmatchedScans,
  OPEN_UNMATCHED_SCANS_QUERY_KEY,
  trackingClipboardText,
  unmatchedScanOutRecord,
} from './unmatched-scans';

const VIEW = OUTBOUND_SHIPPED_VIEW;
const LEGACY_OPEN_ORDER_PARAM = 'openOrderId';

/** The sidebar's facet counts for this view — their `total` is the list's server total (one package per row). */
const FACET_CONTEXT = 'outbound.shipped';
const FACETS_STALE_MS = 60_000;
const UNMATCHED_STALE_MS = 60_000;

/** Station events that can open (a miss) or close (a re-scan that now matches) an unmatched scan. */
const UNMATCHED_EVENT_TYPES: Readonly<Record<string, true>> = {
  SHIP_CONFIRM: true,
  SHIP_CONFIRM_MISS: true,
  PACK_COMPLETED: true,
  PACK_SCAN: true,
};

/** A package key is `<shipment id>` or `scan-<id>`; the face speaks numbers (a deterministic hash — rows render on the server too). */
const shippedRowId = (row: DerivedPackerRecord): number => triageRowKeyId(shippedPackageKey(row));

/** Newest scan-out first (pack time when a box never left). */


/** A find-box text a carrier tracking number (or its last 8 digits) could be. */
function looksLikeTracking(text: string): boolean {
  return !/\s/.test(text) && (detectCarrierFromTracking(text) != null || /^\d{8,}$/.test(text));
}

export function ShippedLedger({
  initialShippedFilter,
}: {
  initialShippedFilter: ShippedTypeFilter;
}) {
  const pathname = usePathname() || '/fulfilled';
  const searchParams = useSearchParams();
  const filters = useShippedTableFilters({ initialShippedFilter });
  const { query, derivedRecords, pagination } = useShippedTableRecords(filters);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stationChannel = user?.organizationId ? safeChannelName(() => getStationChannelName(user.organizationId)) : '';
  useAblyChannel(
    stationChannel,
    'activity.logged',
    (msg: { data?: { activityType?: string } }) => {
      const activityType = msg?.data?.activityType ?? '';
      if (UNMATCHED_EVENT_TYPES[activityType]) {
        void queryClient.invalidateQueries({ queryKey: OPEN_UNMATCHED_SCANS_QUERY_KEY });
      }
      if (activityType !== 'SHIP_CONFIRM') return;
      void queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      void queryClient.invalidateQueries({ queryKey: ['nav-facets', 'outbound.shipped'] });
    },
    !!stationChannel,
  );

  // ── Open unmatched scans: every one copies; a dock miss (no SAL row, so never
  // in the feed) is painted from here, inside the period and unnarrowed views only.
  const unmatchedScans = useQuery({
    queryKey: OPEN_UNMATCHED_SCANS_QUERY_KEY,
    queryFn: ({ signal }) => fetchOpenUnmatchedScans(signal),
    staleTime: UNMATCHED_STALE_MS,
  });
  const {
    carrierFilter,
    statusFilter: carrierStatusFilter,
    exceptionsOnly,
    channelFilter,
    effPackedBy,
    effStaffId,
    effPickedBy,
    shippedFilter,
    effectiveWeekStart,
    effectiveWeekEnd,
    shippedInstantWindow,
    normalizedSearch,
    matchesOutbound,
  } = filters;
  // A dock miss has no carrier, channel, packer, picker or SKU/FBA type: any of those filters excludes it.
  const missesExcluded =
    carrierFilter != null
    || carrierStatusFilter != null
    || exceptionsOnly
    || channelFilter != null
    || effPackedBy != null
    || effStaffId != null
    || effPickedBy != null
    || shippedFilter === 'sku'
    || shippedFilter === 'fba';
  const scanOutMisses = useMemo<DerivedPackerRecord[]>(() => {
    if (missesExcluded) return [];
    return (unmatchedScans.data ?? [])
      .filter((scan) => {
        if (scan.sourceStation !== 'outbound') return false;
        if (normalizedSearch && !scan.tracking.toLowerCase().includes(normalizedSearch)) return false;
        if (shippedInstantWindow) return shippedStampInWindow(scan.createdAt, shippedInstantWindow);
        if (!effectiveWeekStart || !effectiveWeekEnd) return true;
        const day = toPSTDateKey(scan.createdAt);
        return day >= effectiveWeekStart && day <= effectiveWeekEnd;
      })
      .map(unmatchedScanOutRecord)
      .filter(matchesOutbound);
  }, [
    missesExcluded,
    unmatchedScans.data,
    normalizedSearch,
    shippedInstantWindow,
    effectiveWeekStart,
    effectiveWeekEnd,
    matchesOutbound,
  ]);
  const rows = useMemo(
    () => (scanOutMisses.length > 0 ? [...scanOutMisses, ...derivedRecords] : derivedRecords),
    [scanOutMisses, derivedRecords],
  );

  const cut = useTriageCut({ statusKeys: SHIPPED_STATUS_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<DerivedPackerRecord>[]][]>(
    () => (rows.length ? [['shipped', rows.map((row) => ({ key: shippedPackageKey(row), rows: [row] }))]] : []),
    [rows],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, shippedStatusKeys), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  // ── Status pills beside the count (the Allocate summary row) ──────────────
  // Counted in PACKAGES over everything loaded, never the lit cut — tapping a pill shows that many.
  const { statusFilter, toggleStatus, resetStatus } = cut.url;
  const statusChips = useMemo<StatusChip<ShippedStatusChip>[]>(() => {
    const counts = new Map<ShippedStatusChip, number>();
    for (const row of rows) for (const key of shippedStatusKeys(row)) counts.set(key, (counts.get(key) ?? 0) + 1);
    return SHIPPED_STATUS_CHIPS.filter((key) => (counts.get(key) ?? 0) > 0 || statusFilter.has(key)).map((key) => ({
      id: key,
      ...shippedStatusChipFace(key),
      count: counts.get(key) ?? 0,
    }));
  }, [rows, statusFilter]);

  // The server's package total for this window + filters — the pager's "of N" while pages remain unloaded.
  // `ostatus` and a browser-only type preference narrow in the browser, beyond what the facets count.
  const search = searchParams.toString();
  const facets = useQuery({
    queryKey: ['nav-facets', FACET_CONTEXT, search],
    queryFn: ({ signal }) => fetchNavFacets(FACET_CONTEXT, search, signal),
    staleTime: FACETS_STALE_MS,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  const serverCounted = !searchParams.get('ostatus') && (searchParams.get('shippedFilter') != null || filters.shippedFilter === 'all');
  const serverTotal = serverCounted && facets.data?.total != null ? facets.data.total + scanOutMisses.length : undefined;

  // ── Open key: `?shipment=` ────────────────────────────────────────────────
  const openKey = searchParams.get(SHIPMENT_RECORD_PARAM)?.trim() || null;
  const openShipmentId = openKey && /^\d+$/.test(openKey) ? Number(openKey) : null;
  const writeParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );
  const openKeyed = useCallback(
    (key: string) => writeParams((params) => params.set(SHIPMENT_RECORD_PARAM, key)),
    [writeParams],
  );
  const openRow = useCallback((row: DerivedPackerRecord) => openKeyed(shippedPackageKey(row)), [openKeyed]);
  const close = useCallback(() => writeParams((params) => params.delete(SHIPMENT_RECORD_PARAM)), [writeParams]);

  // Legacy `?openOrderId=<orders.id>`: open that line's package when it has one.
  const legacyOrderId = searchParams.get(LEGACY_OPEN_ORDER_PARAM);
  useEffect(() => {
    if (!legacyOrderId) return;
    const orderRowId = Number(legacyOrderId);
    const controller = new AbortController();
    void (async () => {
      const packageId =
        openKey == null && Number.isInteger(orderRowId) && orderRowId > 0
          ? await fetchOrderLinePackageId(orderRowId, controller.signal).catch(() => null)
          : null;
      if (controller.signal.aborted) return;
      writeParams((params) => {
        params.delete(LEGACY_OPEN_ORDER_PARAM);
        if (packageId != null) params.set(SHIPMENT_RECORD_PARAM, String(packageId));
      });
    })();
    return () => controller.abort();
    // The bookmark is read once per value; the open key it writes must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyOrderId]);

  // A tracking # the loaded window does not carry: resolve it and open the package anyway.
  const needle = filters.search.trim();
  const trackingNeedle = looksLikeTracking(needle) ? needle.toUpperCase() : null;
  const windowCarriesNeedle = useMemo(
    () => trackingNeedle != null && rows.some((row) => shippedPackageTracking(row).toUpperCase().includes(trackingNeedle)),
    [rows, trackingNeedle],
  );
  const lookedUpRef = useRef<string | null>(null);
  const [outsideWindow, setOutsideWindow] = useState<string | null>(null);
  useEffect(() => {
    if (!trackingNeedle || query.isFetching || windowCarriesNeedle || lookedUpRef.current === trackingNeedle) return;
    lookedUpRef.current = trackingNeedle;
    lookupShipmentByTracking(trackingNeedle)
      .then((hit) => {
        if (!hit || lookedUpRef.current !== trackingNeedle) return;
        setOutsideWindow(hit.tracking);
        openKeyed(String(hit.shipmentId));
      })
      .catch((error: Error) => toast.error(error.message));
  }, [trackingNeedle, query.isFetching, windowCarriesNeedle, openKeyed]);
  useEffect(() => {
    if (!trackingNeedle) lookedUpRef.current = null;
    setOutsideWindow(null);
  }, [trackingNeedle]);

  // ── Record cursor (J / K) ─────────────────────────────────────────────────
  const loadedOpenRow = useMemo(
    () => (openKey ? rows.find((row) => shippedPackageKey(row) === openKey) ?? null : null),
    [openKey, rows],
  );
  usePublishRecordCursor({
    surfaceId: 'shipped-packages-ledger',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: loadedOpenRow ? shippedRowId(loadedOpenRow) : null,
    getId: shippedRowId,
    onOpen: openRow,
    onClose: close,
  });

  // ── Open package: the same shared record slot as inbound. ────────────────
  const shipmentSlot = useShipmentRecordSlot(openShipmentId, (id) => openKeyed(String(id)));

  // ── The face ──────────────────────────────────────────────────────────────
  const selection = useLocalTriageSelection(shippedRowId);
  const [density, setDensity] = useTriageDensity('outbound.fulfilled');
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: shippedRowId,
        groupKey: (group: RowGroup<DerivedPackerRecord>) => group.key,
        cardModel: (group: RowGroup<DerivedPackerRecord>): ShippedCardModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [shippedRowId(lead)], lead };
        },
        // A Find naming exactly one package's tracking number opens it.
        exactFind: (query: string, model: ShippedCardModel) => shippedPackageTracking(model.lead).toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<DerivedPackerRecord, ShippedCardModel>) =>
          density === 'row' ? <ShippedPackageRow {...props} /> : <ShippedPackageCard {...props} />,
      }),
    [density],
  );

  const feed: TriageFeed<DerivedPackerRecord> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    total: serverTotal,
    loading: query.isLoading,
    fetching: query.isFetching || pagination.isLoadingMore,
    onLoadMore: pagination.isTruncated ? pagination.loadMore : undefined,
    search: { value: filters.search, pending: false },
    selection,
    // The open key may name a package outside the loaded window: it still owns the plane.
    open: { id: openKey ? triageRowKeyId(openKey) : null, open: openRow, close },
  };

  // ── Copy: the checked packages' tracking (Law 5), and every open unmatched scan while that pill is lit.
  const checkedTrackingText = useMemo(
    () => trackingClipboardText(rows.filter((row) => selection.ids.has(shippedRowId(row))).map(shippedPackageTracking)),
    [rows, selection.ids],
  );
  const checkedTrackingCount = checkedTrackingText ? checkedTrackingText.split('\n').length : 0;
  const bulkVerbs = useMemo<RecordActionVerb[]>(
    () =>
      scopeRecordVerbs(
        [
          {
            id: 'copy-tracking',
            label: `Copy ${checkedTrackingCount} tracking`,
            icon: <Copy aria-hidden />,
            disabled: checkedTrackingCount === 0,
            disabledReason: 'No tracking number on the checked packages',
            run: () => {
              if (writeClipboardText(checkedTrackingText)) toast.success(`Copied ${checkedTrackingCount} tracking`);
              else toast.error('Copy failed');
            },
          },
        ],
        selection.ids.size,
        VIEW.noun,
      ),
    [checkedTrackingText, checkedTrackingCount, selection.ids.size],
  );
  const allUnmatchedText = useMemo(
    () => trackingClipboardText((unmatchedScans.data ?? []).map((scan) => scan.tracking)),
    [unmatchedScans.data],
  );
  const allUnmatchedCount = allUnmatchedText ? allUnmatchedText.split('\n').length : 0;
  const copyAllUnmatched = statusFilter.has('UNMATCHED') ? (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<Copy aria-hidden />}
      disabled={allUnmatchedCount === 0}
      loading={unmatchedScans.isLoading}
      onClick={() => {
        if (writeClipboardText(allUnmatchedText)) toast.success(`Copied ${allUnmatchedCount} unmatched tracking`);
        else toast.error('Copy failed');
      }}
      title="Every open unmatched pack scan and scan-out, not only this page"
      data-testid="shipped-copy-all-unmatched"
    >
      Copy all unmatched ({allUnmatchedCount})
    </Button>
  ) : null;

  const periodLabel =
    filters.effectiveWeekStart && filters.effectiveWeekEnd
      ? formatWeekRangeCompact(filters.effectiveWeekStart, filters.effectiveWeekEnd)
      : 'All dates';
  const summary = useMemo(() => shippedSummary(rows, periodLabel), [rows, periodLabel]);

  return (
    <TriageCardList
      family={family}
      densityControl={{ value: density, onChange: setDensity }}
      feed={feed}
      cut={cut}
      summary={
        <StatusChipRail
          chips={statusChips}
          active={statusFilter}
          onToggle={toggleStatus}
          onReset={resetStatus}
          label="Filter by package status"
          testId="shipped-status-chips"
        />
      }
      bulk={<RecordActionStrip face="header" verbs={bulkVerbs} label="Checked packages actions" testId="shipped-bulk" />}
      banner={
        copyAllUnmatched || (outsideWindow && openKey) ? (
          <div className="flex min-w-0 items-center gap-3 pb-2 pl-4">
            {outsideWindow && openKey ? (
              <EvidenceNotice>{outsideWindow} is outside the loaded period — opened from the package lookup.</EvidenceNotice>
            ) : null}
            {copyAllUnmatched ? <span className="ml-auto flex shrink-0">{copyAllUnmatched}</span> : null}
          </div>
        ) : null
      }
      searchEmpty={needle ? <p className="text-sm text-text-muted">No package in {periodLabel} matches “{needle}”.</p> : null}
      allClear={<TriageAllClear title={`No packages shipped in ${periodLabel}`} detail="Pick another period in the sidebar." />}
      record={{
        title: shipmentSlot?.title ?? 'Package',
        actions: shipmentSlot?.actions,
        noun: VIEW.noun.one,
        testId: 'shipped-record',
        summary: <RecordLedgerSummaryPane summary={summary} />,
        strip: null,
        view:
          openShipmentId != null ? (
            shipmentSlot?.view ?? null
          ) : loadedOpenRow && isUnmatchedScanOut(loadedOpenRow) ? (
            <EvidenceNotice tone="warn">
              {shippedPackageTracking(loadedOpenRow)} was scanned out
              {loadedOpenRow.shipped_out_by_name ? ` by ${loadedOpenRow.shipped_out_by_name}` : ''}, but no shipment or
              order matches it. Import its order with this tracking number and it resolves on its own.
            </EvidenceNotice>
          ) : openKey ? (
            <EvidenceNotice tone="warn">
              This scan has no package on file — no tracking number was captured, so there is no package record to open.
            </EvidenceNotice>
          ) : null,
      }}
    />
  );
}

function shippedSummary(rows: readonly DerivedPackerRecord[], periodLabel: string): RecordLedgerSummary {
  let unmatched = 0;
  let neverPacked = 0;
  for (const row of rows) {
    if (isOpenUnmatchedScan(row)) unmatched += 1;
    if (row.packed_by == null) neverPacked += 1;
  }
  return {
    title: 'Scanned out',
    sub: periodLabel,
    facts: [
      { label: 'Packages', value: rows.length },
      { label: 'Unmatched scans', value: unmatched, warn: unmatched > 0, toolbar: true },
      { label: 'Never pack-scanned', value: neverPacked, warn: neverPacked > 0 },
    ],
    note: 'Open a package to see every item in the box, every action taken on it, who packed it and when it shipped.',
  };
}
