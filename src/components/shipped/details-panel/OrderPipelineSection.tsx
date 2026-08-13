'use client';

import { ShippedOrder } from '@/lib/neon/orders-queries';
import { PipelineStageRow } from '@/design-system/components';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { ShipmentStatusBadge } from '@/components/shipping/ShipmentStatusBadge';
import { deriveShippingDisplayMeta, serialNumberRowsFromShipped } from './shipping-information/helpers';
import { orderStampOrNull } from './shipped-details-logic';

/**
 * The order's packout pipeline — Tested → Packed → Scanned Out — as attributed
 * milestone rows. **All three rows stay mounted** (spatial predictability).
 * Empty stages render `PipelineStageRow` emptyFallback in-bounds — never
 * progressive hide that shifts muscle-memory layout. Carrier/exception status
 * sits under the locked rows as an orthogonal fact.
 */
export function OrderPipelineSection({ shipped }: { shipped: ShippedOrder }) {
  const meta = deriveShippingDisplayMeta(shipped, serialNumberRowsFromShipped(shipped));

  const testedAt = meta.testedAtSource;
  const packedAt = meta.packedAtSource;
  const scannedOutAt = orderStampOrNull(shipped.ship_confirmed_at);

  // Carrier status is the pipeline's terminal fact — it lives here (under the
  // milestone rows), not buried in the order-details card. Shows the moment a
  // tracking/label exists and the carrier has reported a category/exception.
  const showCarrierStatus =
    (shipped.latest_status_category || shipped.has_exception) && shipped.shipment_id != null;

  return (
    <section className="space-y-0">
      <div className="divide-y divide-border-hairline">
        <PipelineStageRow
          label="Tested"
          at={testedAt}
          staffName={meta.techNameDisplay}
          emptyFallback="Not tested"
        />
        <PipelineStageRow
          label="Packed"
          at={packedAt}
          staffName={meta.packerNameDisplay}
          emptyFallback="Pending pack"
        />
        <PipelineStageRow
          label="Scanned Out"
          at={scannedOutAt}
          staffName={meta.scannedOutByDisplay ?? ''}
          emptyFallback="Pending scan-out"
        />
      </div>

      {showCarrierStatus ? (
        <DetailsPanelRow label="Carrier Status" dividerClassName="">
          <ShipmentStatusBadge
            carrier={shipped.carrier ?? null}
            category={shipped.latest_status_category ?? null}
            description={shipped.latest_status_description ?? null}
            latestEventAt={shipped.latest_event_at ?? null}
            hasException={shipped.has_exception ?? null}
            isTerminal={shipped.is_terminal ?? null}
          />
        </DetailsPanelRow>
      ) : null}
    </section>
  );
}
