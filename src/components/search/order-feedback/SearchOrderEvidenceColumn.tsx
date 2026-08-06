'use client';

/**
 * SearchOrderEvidenceColumn — flush right stack (no padded wrappers):
 * outbound stamps when present · warranty summary · station activity when present.
 * Photos live in the disposition bar band (carton twin), not here.
 */

import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { SearchOrderStationTimeline } from '@/components/search/order-feedback/SearchOrderStationTimeline';
import { PipelineStageRow } from '@/design-system/components';
import {
  deriveShippingDisplayMeta,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import type { TimelineItem } from '@/lib/timeline';
import type { ShippedOrder } from '@/types/orders';

function OutboundMilestones({ order }: { order: ShippedOrder }) {
  const serials = serialNumberRowsFromShipped(order);
  const meta = deriveShippingDisplayMeta(order, serials);
  const showScanned = meta.isScannedOut;
  const showPacked = Boolean(meta.packedAtSource);
  if (!showScanned && !showPacked) return null;

  return (
    <div
      className="divide-y divide-border-hairline border-b border-border-hairline"
      data-testid="search-order-outbound-milestones"
    >
      {showScanned ? (
        <div className="px-3">
          <PipelineStageRow
            label="Scanned out"
            at={order.ship_confirmed_at}
            staffName={meta.scannedOutByDisplay ?? ''}
            emptyFallback="Not scanned out"
          />
        </div>
      ) : null}
      {showPacked ? (
        <div className="px-3">
          <PipelineStageRow
            label="Packed"
            at={meta.packedAtSource}
            staffName={meta.packerNameDisplay}
            emptyFallback="Not packed"
          />
        </div>
      ) : null}
    </div>
  );
}

export function SearchOrderEvidenceColumn({
  order,
  timelineItems,
  timelineLoading,
}: {
  order: ShippedOrder;
  timelineItems: TimelineItem[];
  timelineLoading?: boolean;
}) {
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col bg-surface-card"
      data-testid="search-order-evidence-column"
    >
      <OutboundMilestones order={order} />

      <div className="border-b border-border-hairline px-3 py-3">
        <p className="mb-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          Warranty
        </p>
        <OrderWarrantySummary order={order} />
      </div>

      <SearchOrderStationTimeline
        order={order}
        items={timelineItems}
        loading={timelineLoading}
      />
    </div>
  );
}
