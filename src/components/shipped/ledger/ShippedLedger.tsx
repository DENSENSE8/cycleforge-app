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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageRowKeyId } from '@/design-system/components/triage-card-list/triage-row-id';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { RowGroup } from '@/lib/group-rows';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { EXCEPTION_DOMAIN_PARAM, EXCEPTIONS_PATH } from '@/lib/exceptions/types';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { lookupShipmentByTracking } from '@/lib/shipments/shipment-record-client';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import type { ShippedTypeFilter } from '@/lib/shipping/shipped-filter/shipped-filter-constants';
import { toast } from '@/lib/toast';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { detectCarrierFromTracking } from '@/utils/carrier-patterns';
import { formatWeekRangeCompact } from '@/utils/date';
import { ShippedPackageCard } from './ShippedPackageCard';
import {
  isOpenUnmatchedScan,
  SHIPPED_STATUS_CHIPS,
  shippedStatusChipFace,
  shippedStatusKeys,
  type ShippedCardModel,
  type ShippedStatusChip,
} from './shipped-card-model';
import { shippedPackageKey, shippedPackageTracking } from './shipped-package-state';
import { useShipmentRecordSlot } from './use-shipment-record-slot';

const VIEW = OUTBOUND_SHIPPED_VIEW;
const LEGACY_OPEN_ORDER_PARAM = 'openOrderId';

/** The sidebar's facet counts for this view — their `total` is the list's server total (one package per row). */
const FACET_CONTEXT = 'outbound.shipped';
const FACETS_STALE_MS = 60_000;

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
      if (msg?.data?.activityType !== 'SHIP_CONFIRM') return;
      void queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      void queryClient.invalidateQueries({ queryKey: ['nav-facets', 'outbound.shipped'] });
    },
    !!stationChannel,
  );
  const rows = derivedRecords;

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
  const router = useRouter();
  const onToggleStatus = useCallback((key: ShippedStatusChip) => {
    if (key === 'EXCEPTION') {
      router.push(`${EXCEPTIONS_PATH}?${EXCEPTION_DOMAIN_PARAM}=fulfillment`);
      return;
    }
    toggleStatus(key);
  }, [router, toggleStatus]);
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
  const serverTotal = serverCounted ? facets.data?.total : undefined;

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
        renderCard: (props: TriageCardSlotProps<DerivedPackerRecord, ShippedCardModel>) => <ShippedPackageCard {...props} />,
      }),
    [],
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

  const periodLabel =
    filters.effectiveWeekStart && filters.effectiveWeekEnd
      ? formatWeekRangeCompact(filters.effectiveWeekStart, filters.effectiveWeekEnd)
      : 'All dates';
  const summary = useMemo(() => shippedSummary(rows, periodLabel), [rows, periodLabel]);

  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      summary={
        <StatusChipRail
          chips={statusChips}
          active={statusFilter}
          onToggle={onToggleStatus}
          onReset={resetStatus}
          label="Filter by package status"
          testId="shipped-status-chips"
        />
      }
      bulk={<span className="truncate text-sm text-text-muted">Open one to act on it</span>}
      banner={
        outsideWindow && openKey ? (
          <div className="pb-2 pl-4">
            <EvidenceNotice>{outsideWindow} is outside the loaded period — opened from the package lookup.</EvidenceNotice>
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
