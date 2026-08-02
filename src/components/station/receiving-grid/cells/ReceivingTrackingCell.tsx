'use client';

import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { TrackingChip } from '@/components/ui/CopyChip';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingTrackingCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { isPickup, pickupLabel, trackingValue } = ctx;
  return (
    <div data-col="tracking" className={receivingDataCellClass(col, rule, ctx)}>
      {isPickup && pickupLabel ? (
        <FulfillmentPickupPill dense />
      ) : (
        <TrackingChip
          value={trackingValue}
          showIcon={!col.omitCellIcon}
        />
      )}
    </div>
  );
}
