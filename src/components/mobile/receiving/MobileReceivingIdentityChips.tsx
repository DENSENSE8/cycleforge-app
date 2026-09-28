'use client';

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import { OrderIdChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { ChipColumns, CHIP_COL, type ChipColumn } from '@/components/ui/ChipColumns';

/**
 * PO · SKU · tracking last-8 chips for a phone receiving row — the mobile fork
 * of the desk's `ReceivingIdentityChips` (ARCHITECTURE.md "Component split":
 * mobile and desktop never share a rendered component). No serial chip: a
 * line's serials are one comma-joined value, unreadable on a phone row.
 */
export function MobileReceivingIdentityChips({
  row,
  po,
  sku,
  includePo = true,
  includeSku = true,
  includeTracking = true,
  asColumns = false,
  dense = false,
  className = 'flex flex-wrap items-center gap-1.5',
}: {
  /** Tracking (or the pickup pill) derives from the row. */
  row: ReceivingLineRow;
  po?: string | null;
  sku?: string | null;
  includePo?: boolean;
  includeSku?: boolean;
  includeTracking?: boolean;
  /** Fixed-width columns so rows align down the list. */
  asColumns?: boolean;
  /** Smaller chips + narrower columns — keeps the set on one line. */
  dense?: boolean;
  /** Wrapper layout classes for the free-flow (non-columns) layout. */
  className?: string;
}) {
  const poValue = (po || '').trim();
  const skuValue = (sku || '').trim();
  const trackingValue = displayTrackingNumber(row) ?? '';
  const trackingNode =
    isLocalPickupFulfillment(row) && fulfillmentModeLabel(row) ? (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 bg-emerald-50 ${
          dense ? 'px-1 py-px text-role-micro' : 'inset-chip text-role-eyebrow'
        }`}
      >
        Pickup
      </span>
    ) : trackingValue ? (
      <TrackingNumberMenuChip value={trackingValue} carrierHint={row.carrier} plain={dense} />
    ) : null;
  const poChip = <OrderIdChip value={poValue} display={getLast8(poValue)} dense={dense} />;
  const skuChip = <SkuScanRefChip value={skuValue} display={getLast8(skuValue)} dense={dense} />;

  if (asColumns) {
    const idCol = dense ? 'w-[80px]' : CHIP_COL.id;
    const columns: ChipColumn[] = [];
    if (includePo) columns.push({ key: 'po', width: idCol, node: poChip });
    if (includeSku) columns.push({ key: 'sku', width: idCol, node: skuChip });
    if (includeTracking) {
      columns.push({ key: 'tracking', width: dense ? 'w-[80px]' : CHIP_COL.tracking, node: trackingNode });
    }
    return <ChipColumns columns={columns} />;
  }

  return (
    <div className={className}>
      {includePo && poChip}
      {includeSku && skuChip}
      {includeTracking && trackingNode}
    </div>
  );
}
