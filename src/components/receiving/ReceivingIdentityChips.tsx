'use client';

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import {
  OrderIdChip,
  SkuScanRefChip,
  SerialChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { ChipColumns, CHIP_COL, type ChipColumn } from '@/components/ui/ChipColumns';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_CONTEXT_PICKUP_CHROME_CLASS } from '@/components/station/entity-context/station-context-action-pill';

type FulfillmentPickupPillVariant = 'chip' | 'rail';

/** Non-copy pickup indicator for the tracking slot. */
export function FulfillmentPickupPill({
  dense,
  variant = 'chip',
  tooltip,
}: {
  dense?: boolean;
  variant?: FulfillmentPickupPillVariant;
  /** Rail variant only — explains fulfillment mode on hover/focus. */
  tooltip?: string;
}) {
  if (variant === 'rail') {
    const pill = (
      <span
        className={STATION_CONTEXT_PICKUP_CHROME_CLASS}
        aria-label={tooltip ?? 'Pickup — fulfilled in person, no tracking number'}
      >
        Pickup
      </span>
    );
    if (tooltip) {
      return (
        <HoverTooltip label={tooltip} asChild>
          {pill}
        </HoverTooltip>
      );
    }
    return pill;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 bg-emerald-50 ${
        dense ? 'px-1 py-px text-role-micro' : 'inset-chip text-role-eyebrow'
      }`}
    >
      Pickup
    </span>
  );
}

/** The slim, color-coded, last-8 chip cluster shared by the desktop receiving table row ({@link ReceivingLineOrderRow}) and the… */
interface ReceivingIdentityChipsProps {
  po?: string | null;
  sku?: string | null;
  tracking?: string | null;
  /** Comma-joined serial list; SerialChip picks the most recent + last-8. */
  serialsCsv?: string | null;
  /** When set, derives pickup vs shipped tracking display from the row. */
  row?: ReceivingLineRow | null;
  includePo?: boolean;
  includeSku?: boolean;
  includeTracking?: boolean;
  includeSerial?: boolean;
  /** Desktop table mode: */
  asColumns?: boolean;
  /** Wrapper layout classes for the free-flow (non-columns) layout. */
  className?: string;
  /** Smaller chip font + narrower columns — keeps all chips on one line on mobile rows. */
  dense?: boolean;
  /**
   * Replaces the tracking chip when there's no tracking value — used by the
   * Incoming view to host the "Add tracking" popover trigger in the otherwise
   * empty tracking slot. Ignored when a tracking value is present or row is pickup.
   */
  trackingAction?: React.ReactNode;
  /**
   * Filled-tracking menu → Edit. Host opens the record inspector. When omitted,
   * the menu still offers Open (carrier page) for a filled value.
   */
  onEditTracking?: () => void;
}

export function ReceivingIdentityChips({
  po,
  sku,
  tracking,
  serialsCsv,
  row = null,
  includePo = true,
  includeSku = true,
  includeTracking = true,
  includeSerial = true,
  asColumns = false,
  className = 'flex flex-wrap items-center gap-1.5',
  dense = false,
  trackingAction,
  onEditTracking,
}: ReceivingIdentityChipsProps) {
  const poValue = (po || '').trim();
  const skuValue = (sku || '').trim();
  const isPickup = row ? isLocalPickupFulfillment(row) : false;
  const pickupLabel = row ? fulfillmentModeLabel(row) : null;
  const trackingValue = row
    ? (displayTrackingNumber(row) ?? '')
    : (tracking || '').trim();
  // The empty tracking slot can host an action (Incoming "Add tracking") instead
  // of the placeholder chip — only when there's genuinely no tracking value.
  const trackingNode =
    isPickup && pickupLabel
      ? <FulfillmentPickupPill dense={dense} />
      : !trackingValue && trackingAction
        ? trackingAction
        : trackingValue
          ? (
              <TrackingNumberMenuChip
                value={trackingValue}
                carrierHint={row?.carrier}
                plain={dense}
                onEdit={onEditTracking}
              />
            )
          : null;
  const serialsValue = (serialsCsv || '').trim();
  // Dense columns sized for last-8 mono so the full PO·SKU·tracking·serial set
  // stays on one line in a phone row.
  const idCol = dense ? 'w-[80px]' : CHIP_COL.id;
  const trackCol = dense ? 'w-[80px]' : CHIP_COL.tracking;
  const serialCol = dense ? 'w-[80px]' : CHIP_COL.serial;

  if (asColumns) {
    const columns: ChipColumn[] = [];
    if (includePo) {
      columns.push({ key: 'po', width: idCol, node: <OrderIdChip value={poValue} display={getLast8(poValue)} dense={dense} /> });
    }
    if (includeSku) {
      columns.push({ key: 'sku', width: idCol, node: <SkuScanRefChip value={skuValue} display={getLast8(skuValue)} dense={dense} /> });
    }
    if (includeTracking) {
      columns.push({
        key: 'tracking',
        width: trackCol,
        node: trackingNode,
      });
    }
    if (includeSerial) {
      columns.push({ key: 'serial', width: serialCol, node: <SerialChip value={serialsValue} width="w-fit max-w-full" dense={dense} /> });
    }
    return <ChipColumns columns={columns} />;
  }

  return (
    <div className={className}>
      {includePo && <OrderIdChip value={poValue} display={getLast8(poValue)} dense={dense} />}
      {includeSku && <SkuScanRefChip value={skuValue} display={getLast8(skuValue)} dense={dense} />}
      {includeTracking && trackingNode}
      {includeSerial && <SerialChip value={serialsValue} dense={dense} />}
    </div>
  );
}
