'use client';

import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * Tracking column — dense Sheets face keeps MapPin omitted (`omitCellIcon`);
 * carrier brand-identity micro-dot leads the last-8. Pickup → pill, no dot.
 */
export function ReceivingTrackingCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { isPickup, pickupLabel, trackingValue, onEditTracking, row } = ctx;
  const brandDot = trackingValue
    ? carrierBrandDotPaint(resolveCarrierBrand(trackingValue, row.carrier))
    : null;
  return (
    <div
      data-col="tracking"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      {isPickup && pickupLabel ? (
        <FulfillmentPickupPill dense />
      ) : trackingValue && brandDot ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <BrandIdentityDot className={brandDot.className} style={brandDot.style} />
          <TrackingNumberMenuChip
            value={trackingValue}
            carrierHint={row.carrier}
            showIcon={!col.omitCellIcon}
            dense
            onEdit={onEditTracking}
          />
        </span>
      ) : ctx.trackingAction ? (
        ctx.trackingAction
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
