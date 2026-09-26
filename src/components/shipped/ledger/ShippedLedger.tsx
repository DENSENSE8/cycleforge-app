'use client';

/** The Shipped desk (`/shipping/shipped`) on the industrial record ledger — one {@link ShippedPackageRecord} per PACKAGE (carrier tracking… */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button } from '@/design-system/primitives';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useShippedFilterActions } from '@/components/shipping/shipped-filter/useShippedFilterActions';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { lookupShipmentByTracking, useShipmentRecord } from '@/lib/shipments/shipment-record-client';
import { fetchOrderLinePackageId } from '@/lib/shipments/shipment-order-search';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { toast } from '@/lib/toast';
import { detectCarrierFromTracking } from '@/utils/carrier-patterns';
import { formatWeekRangeCompact } from '@/utils/date';
import { ShipmentRecordView } from './ShipmentRecordView';
import { ShippedLedgerToolbar } from './ShippedLedgerToolbar';
import { ShippedPackageActionStrip } from './ShippedPackageActionStrip';
import { ShippedPackageRecord, shippedPackageKey, shippedPackageTracking } from './ShippedPackageRecord';
import { isOpenExceptionStatus } from './shipped-package-state';

const LEGACY_OPEN_ORDER_PARAM = 'openOrderId';

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
  const refine = useShippedFilterActions();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => [...derivedRecords].sort(byShippedDesc), [derivedRecords]);

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
  const cursorOrder = useMemo<GroupedRenderOrder<DerivedPackerRecord>>(
    () => [['shipped', [{ key: 'shipped', rows }]]],
    [rows],
  );
  const loadedOpenRow = useMemo(
    () => (openKey ? rows.find((row) => shippedPackageKey(row) === openKey) ?? null : null),
    [openKey, rows],
  );
  usePublishRecordCursor({
    surfaceId: 'shipped-packages-ledger',
    scope: 'record',
    enabled: true,
    order: cursorOrder,
    openId: loadedOpenRow ? shippedPackageKey(loadedOpenRow) : null,
    getId: shippedPackageKey,
    onOpen: openRow,
    onClose: close,
  });
  const navigation = useRecordCursor('record');

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

  const renderRecord = useCallback(
    (row: DerivedPackerRecord, isOpen: boolean) => <ShippedPackageRecord row={row} open={isOpen} onOpen={openRow} />,
    [openRow],
  );

  const unmatched = rows.filter((row) => row.row_source === 'exception' && isOpenExceptionStatus(row.exception_status)).length;
  const neverPacked = rows.filter((row) => row.packed_by == null).length;
  const periodLabel =
    filters.effectiveWeekStart && filters.effectiveWeekEnd
      ? formatWeekRangeCompact(filters.effectiveWeekStart, filters.effectiveWeekEnd)
      : 'All dates';

  return (
    <RecordLedger
      testId="shipped-ledger"
      label="Shipped packages"
      records={rows}
      recordKey={shippedPackageKey}
      renderRecord={renderRecord}
      openKey={openKey}
      onOpenKey={openKeyed}
      onClose={close}
      scrollRef={scrollRef}
      loading={query.isLoading}
      navigation={navigation.available ? navigation : undefined}
      toolbar={<ShippedLedgerToolbar filters={filters} refine={refine} isSearching={query.isFetching} />}
      actionStrip={
        openKey ? (
          <ShippedPackageActionStrip
            key={openKey}
            record={openRecord}
            orderLineId={orderLineId}
            label={`${recordTitle} actions`}
          />
        ) : null
      }
      banner={
        outsideWindow && openKey ? (
          <EvidenceNotice>
            {outsideWindow} is outside the loaded period — opened from the package lookup.
          </EvidenceNotice>
        ) : null
      }
      empty={
        <b className="text-role-body font-bold text-mode-ink">
          {needle ? `No package in ${periodLabel} matches “${needle}”.` : `No packages shipped in ${periodLabel}.`}
        </b>
      }
      recordTitle={recordTitle}
      recordSubtitle={recordSubtitle}
      recordNoun="package"
      summary={{
        title: 'Shipped packages',
        sub: periodLabel,
        facts: [
          { label: 'Packages', value: rows.length },
          { label: 'Unmatched scans', value: unmatched, warn: unmatched > 0, toolbar: true },
          { label: 'Never pack-scanned', value: neverPacked, warn: neverPacked > 0 },
        ],
        note: 'Open a package to see every item in the box, every action taken on it, who packed it and when it shipped.',
      }}
      record={
        openShipmentId != null ? (
          <ShipmentRecordView key={openShipmentId} shipmentId={openShipmentId} onOpenShipment={(id) => openKeyed(String(id))} />
        ) : openKey ? (
          <EvidenceNotice tone="warn">
            This scan has no package on file — no tracking number was captured, so there is no package record to open.
          </EvidenceNotice>
        ) : null
      }
      footer={
        <>
          <span>
            {rows.length.toLocaleString()} packages · {periodLabel}
          </span>
          {pagination.isTruncated ? (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={pagination.loadMore}
              disabled={pagination.isLoadingMore}
              icon={pagination.isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              Load older
            </Button>
          ) : null}
        </>
      }
    />
  );
}
