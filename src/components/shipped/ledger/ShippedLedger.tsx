'use client';

/**
 * The Shipped desk (`/shipping/shipped`) as the one-row triage list
 * (`TriageCardList density="row"`, owner 2026-09-28) — one row per PACKAGE
 * (carrier tracking number; a pack scan with none keys as `scan-<id>`):
 * state · tracking · title · shipped · carrier status · order · packed by →
 * Resolve on an unmatched scan. The feed is `useShippedTableFilters` →
 * `useShippedTableRecords` (week buckets, Load older); its facets and Find are
 * the sidebar's. The open package is `?shipment=` (`SHIPMENT_RECORD_PARAM`,
 * `replaceState`) and may name a package outside the loaded window (a sibling
 * box, or a tracking # resolved through `/api/shipments/lookup`); legacy
 * `?openOrderId=` bookmarks map to that line's package.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import {
  RecordLedgerSummaryPane,
  RecordLedgerTally,
  type RecordLedgerSummary,
} from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageRowKeyId } from '@/design-system/components/triage-card-list/triage-row-id';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import type { RowGroup } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { lookupShipmentByTracking, useShipmentRecord } from '@/lib/shipments/shipment-record-client';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { toast } from '@/lib/toast';
import { OUTBOUND_SHIPPED_VIEW } from '@/lib/triage/views';
import { detectCarrierFromTracking } from '@/utils/carrier-patterns';
import { formatMonthDayTimePST, formatWeekRangeCompact } from '@/utils/date';
import { ShipmentRecordView } from './ShipmentRecordView';
import { ShippedPackageActionStrip } from './ShippedPackageActionStrip';
import { isOpenExceptionStatus, shippedPackageFace, shippedPackageKey, shippedPackageTracking } from './shipped-package-state';

const VIEW = OUTBOUND_SHIPPED_VIEW;
const LEGACY_OPEN_ORDER_PARAM = 'openOrderId';

/** No chips: the period, type, carrier and status facets are the sidebar's, read by the feed. */
const NO_CHIPS: readonly never[] = [];

/** A package key is `<shipment id>` or `scan-<id>`; the face speaks numbers (a deterministic hash — rows render on the server too). */
const shippedRowId = (row: DerivedPackerRecord): number => triageRowKeyId(shippedPackageKey(row));

type ShippedRowModel = { key: string; ids: readonly number[]; lead: DerivedPackerRecord };

/** Newest scan-out first (pack time when a box never left). */
function byShippedDesc(a: DerivedPackerRecord, b: DerivedPackerRecord): number {
  return new Date(b.effShipTime || b.created_at || 0).getTime() - new Date(a.effShipTime || a.created_at || 0).getTime();
}

/** A find-box text a carrier tracking number (or its last 8 digits) could be. */
function looksLikeTracking(text: string): boolean {
  return !/\s/.test(text) && (detectCarrierFromTracking(text) != null || /^\d{8,}$/.test(text));
}

export function ShippedLedger() {
  const pathname = usePathname() || '/shipping/shipped';
  const searchParams = useSearchParams();
  const filters = useShippedTableFilters({});
  const { query, derivedRecords, pagination } = useShippedTableRecords(filters);

  const rows = useMemo(() => [...derivedRecords].sort(byShippedDesc), [derivedRecords]);

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<DerivedPackerRecord>[]][]>(
    () => (rows.length ? [['shipped', rows.map((row) => ({ key: shippedPackageKey(row), rows: [row] }))]] : []),
    [rows],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

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

  // ── Open package: title + strip (same query key as the record body) ───────
  const openRecord = useShipmentRecord(openShipmentId).data ?? null;
  // The package's primary order line (lowest `orders.id` owning it) arms the
  // order verbs; before the record lands, the loaded row's line stands in.
  const orderLineId = openRecord ? (openRecord.items[0]?.orderRowId ?? null) : (loadedOpenRow?.order_row_id ?? null);

  const openTracking = openRecord?.tracking ?? (loadedOpenRow ? shippedPackageTracking(loadedOpenRow) : null);
  const recordTitle = openTracking ? `Package ${openTracking}` : openKey ? `Package ${openKey}` : 'Package';
  const recordSubtitle = openRecord
    ? [
        openRecord.carrier,
        openRecord.box ? `Box ${openRecord.box.seq ?? '—'} of ${openRecord.box.total}` : null,
        openRecord.items[0]?.orderRef ? `Order ${openRecord.items[0].orderRef}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined
    : undefined;

  // ── The face ──────────────────────────────────────────────────────────────
  const selection = useLocalTriageSelection(shippedRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: shippedRowId,
        groupKey: (group: RowGroup<DerivedPackerRecord>) => group.key,
        cardModel: (group: RowGroup<DerivedPackerRecord>): ShippedRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [shippedRowId(lead)], lead };
        },
        // A Find naming exactly one package's tracking number opens it.
        exactFind: (query: string, model: ShippedRowModel) => shippedPackageTracking(model.lead).toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<DerivedPackerRecord, ShippedRowModel>) => <ShippedRow {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<DerivedPackerRecord> = {
    bands,
    allBands,
    painted,
    sectioned: false,
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
      density="row"
      family={family}
      feed={feed}
      cut={cut}
      // No chips: the facets are the sidebar's.
      summary={null}
      bulk={<span className="truncate text-sm text-text-muted">Open one to act on it</span>}
      // The period and the tally ride one line under the bar.
      banner={
        <div className="flex min-w-0 flex-col gap-2 pb-2 pl-4" data-testid="shipped-tally">
          <div className="flex min-w-0 items-center gap-3">
            <p className="truncate text-sm text-text-muted">
              {rows.length.toLocaleString()} packages · {periodLabel}
            </p>
            <span className="ml-auto flex">
              <RecordLedgerTally summary={summary} />
            </span>
          </div>
          {outsideWindow && openKey ? (
            <EvidenceNotice>{outsideWindow} is outside the loaded period — opened from the package lookup.</EvidenceNotice>
          ) : null}
        </div>
      }
      searchEmpty={needle ? <p className="text-sm text-text-muted">No package in {periodLabel} matches “{needle}”.</p> : null}
      allClear={<TriageAllClear title={`No packages shipped in ${periodLabel}`} detail="Pick another period in the sidebar." />}
      record={{
        title: recordTitle,
        subtitle: recordSubtitle,
        noun: VIEW.noun.one,
        testId: 'shipped-record',
        summary: <RecordLedgerSummaryPane summary={summary} />,
        strip: openKey ? (
          <ShippedPackageActionStrip key={openKey} record={openRecord} orderLineId={orderLineId} label={`${recordTitle} actions`} />
        ) : null,
        view:
          openShipmentId != null ? (
            <ShipmentRecordView key={openShipmentId} shipmentId={openShipmentId} onOpenShipment={(id) => openKeyed(String(id))} />
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
    if (row.row_source === 'exception' && isOpenExceptionStatus(row.exception_status)) unmatched += 1;
    if (row.packed_by == null) neverPacked += 1;
  }
  return {
    title: 'Shipped packages',
    sub: periodLabel,
    facts: [
      { label: 'Packages', value: rows.length },
      { label: 'Unmatched scans', value: unmatched, warn: unmatched > 0, toolbar: true },
      { label: 'Never pack-scanned', value: neverPacked, warn: neverPacked > 0 },
    ],
    note: 'Open a package to see every item in the box, every action taken on it, who packed it and when it shipped.',
  };
}

/** One package as a row: state · tracking · title · shipped · carrier status · order · packed by → Resolve. */
const ShippedRow = memo(function ShippedRow(props: TriageCardSlotProps<DerivedPackerRecord, ShippedRowModel>) {
  const row = props.model.lead;
  const face = useMemo<TriageRowFace>(() => {
    const openException = row.row_source === 'exception' && isOpenExceptionStatus(row.exception_status);
    const state = shippedPackageFace(row.outboundState, openException);
    const tracking = shippedPackageTracking(row);
    const lines = row.package_line_count ?? 0;
    const product = (row.product_title || '').trim() || (openException ? 'Unmatched pack scan' : 'No order line');
    const title = lines > 1 ? `${product} +${lines - 1} more` : product;
    const photo = Array.isArray(row.packer_photos_url)
      ? (row.packer_photos_url.find((p: { url?: unknown }) => typeof p?.url === 'string')?.url as string | undefined)
      : undefined;
    const carrier = displayCarrierFromHint(row.carrier) ?? (row.carrier || null);
    const uspsIntegrationPending = String(row.carrier ?? '').trim().toUpperCase() === 'USPS';
    const carrierStatus = uspsIntegrationPending
      ? 'Integration pending'
      : (row.latest_status_label || row.latest_status_code || '').trim() || null;
    const shippedAt = row.ship_confirmed_at ?? null;
    // A scan-out-only package (never pack-scanned) arrives with `packed_by` null
    // and `created_at` = its scan-out time — never paint that as a pack.
    const packed = row.packed_by != null;
    const packer = (row.packed_by_name || '').trim() || `Staff #${row.packed_by}`;
    const handle = tracking || `Scan ${row.id}`;
    return {
      state,
      identity: handle,
      identityWidth: 'long',
      title,
      photo: { url: photo ?? null },
      facts: [
        {
          id: 'shipped',
          value: shippedAt
            ? { kind: 'date', text: formatMonthDayTimePST(shippedAt), title: `Shipped · ${formatMonthDayTimePST(shippedAt)}` }
            : { kind: 'missing', text: 'Not scanned out' },
          width: 'code',
        },
        {
          id: 'carrier',
          label: carrier ?? undefined,
          value: carrierStatus,
          width: 'short',
          tone: 'muted',
          tip: uspsIntegrationPending
            ? 'USPS live tracking integration is pending.'
            : row.latest_status_description || row.latest_status_label || undefined,
        },
        {
          id: 'order',
          value: row.order_id ? { kind: 'code', text: String(row.order_id), title: `Order ${row.order_id}` } : null,
          width: 'long',
        },
        {
          id: 'packed',
          // A scan-out-only box never had a packer: say so in warning ink.
          value: packed ? packer : 'Never packed',
          width: 'short',
          tone: packed ? 'default' : 'warn',
          tip: packed ? `Packed by ${packer} · ${formatMonthDayTimePST(row.created_at)}` : 'Never pack-scanned',
        },
      ],
      next: openException ? { label: 'Resolve', blocked: true } : null,
      aria: {
        row: `Package ${handle}, ${product}, ${state.label}`,
        open: `Open package ${handle} · ${product}`,
        check: `Select package ${handle}`,
      },
    };
  }, [row]);
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} />;
});
