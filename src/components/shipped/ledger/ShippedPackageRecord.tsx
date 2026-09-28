'use client';

/** One PACKAGE (carrier tracking number) on the Shipped desk ledger — an {@link IndustrialRecord}: */

import {
  IndustrialRecord,
  RecordIdFact,
  RecordNext,
  RecordPhoto,
  RecordQty,
  RecordStamp,
  RecordStateCode,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { isOpenExceptionStatus, shippedPackageFace } from './shipped-package-state';

/** The ledger's key for a feed row: its package, else (no package on file) the scan. */
export function shippedPackageKey(row: DerivedPackerRecord): string {
  return row.package_shipment_id != null ? String(row.package_shipment_id) : `scan-${row.id}`;
}

export function shippedPackageTracking(row: DerivedPackerRecord): string {
  return (row.package_tracking || row.shipping_tracking_number || '').trim();
}

export function ShippedPackageRecord({
  row,
  open,
  onOpen,
}: {
  row: DerivedPackerRecord;
  open: boolean;
  onOpen: (row: DerivedPackerRecord) => void;
}) {
  const openException = row.row_source === 'exception' && isOpenExceptionStatus(row.exception_status);
  const state = shippedPackageFace(row.outboundState, openException);
  const tracking = shippedPackageTracking(row);
  const title = (row.product_title || '').trim() || (openException ? 'Unmatched pack scan' : 'No order line');
  const quantity = Number(row.quantity);
  const moreLines = (row.package_line_count ?? 0) - 1;
  const photo = Array.isArray(row.packer_photos_url)
    ? (row.packer_photos_url.find((p: { url?: unknown }) => typeof p?.url === 'string')?.url as string | undefined)
    : undefined;
  const carrierStatus = (row.latest_status_code || row.latest_status_label || '').trim();
  const shippedAt = row.ship_confirmed_at ?? null;
  // A scan-out-only package (never pack-scanned) arrives with `packed_by` null
  // and `created_at` = its scan-out time — never paint that as a pack.
  const packed = row.packed_by != null;
  const packer = (row.packed_by_name || '').trim() || `Staff #${row.packed_by}`;

  return (
    <IndustrialRecord
      state={state}
      open={open}
      openLabel={`Open package ${tracking || row.id} · ${title}`}
      onOpen={() => onOpen(row)}
      photo={<RecordPhoto src={photo ?? null} fallback={title} />}
      recordKey={shippedPackageKey(row)}
      bands={[
        {
          main: (
            <>
              <RecordStateCode state={state} />
              <span className={cn(RECORD_LABEL_CLASS, 'w-12 shrink-0 truncate text-mode-ink')}>
                {displayCarrierFromHint(row.carrier) ?? (row.carrier || '—')}
              </span>
              <RecordIdFact label="TRK" value={tracking || null} className="min-w-0 shrink" />
              {carrierStatus ? (
                <span
                  className={cn(RECORD_LABEL_CLASS, 'shrink-0 truncate text-mode-muted')}
                  title={row.latest_status_description || row.latest_status_label || undefined}
                >
                  {carrierStatus}
                </span>
              ) : null}
            </>
          ),
          right: (
            <RecordStamp title={`Shipped · ${formatMonthDayTimePST(shippedAt)}`}>
              {shippedAt ? formatMonthDayTimePST(shippedAt) : 'Not scanned out'}
            </RecordStamp>
          ),
        },
        {
          main: (
            <>
              <RecordTitle>{title}</RecordTitle>
              {row.sku ? <RecordIdFact label="SKU" value={row.sku} className="max-w-[40%] shrink-0" /> : null}
              {moreLines > 0 ? (
                <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-ink')}>+{moreLines} more</span>
              ) : null}
            </>
          ),
          right: <RecordQty value={Number.isFinite(quantity) && quantity > 0 ? quantity : 1} />,
        },
        {
          main: (
            <>
              <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 truncate', packed ? 'text-mode-ink' : 'text-mode-warn')}>
                <span className="text-mode-muted">Packed </span>
                {packed ? `${packer} · ${formatMonthDayTimePST(row.created_at)}` : 'Never pack-scanned'}
              </span>
              {row.order_id ? <RecordIdFact label="Order" value={row.order_id} /> : null}
              {openException ? (
                <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-warn')}>
                  Exception {(row.exception_reason || 'unmatched').replace(/_/g, ' ')}
                </span>
              ) : null}
            </>
          ),
          right: openException ? (
            <RecordNext label="Resolve" warn />
          ) : (
            <RecordStamp title={row.latest_status_description || state.label}>
              {row.latest_status_label || state.label}
            </RecordStamp>
          ),
        },
      ]}
    />
  );
}
