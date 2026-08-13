'use client';

/**
 * SearchOrderEvidenceColumn — flush right stack (no padded wrappers):
 * locked packout milestones · station activity when present.
 * Warranty lives on the facts column (`OrderWarrantySummary`) — not here.
 * Photos live in the disposition bar band (carton twin), not here.
 *
 * Milestone rows always mount (Tested → Packed → Scanned Out) — same spatial
 * predictability law as `OrderPipelineSection` / `ReceivingCartonPipeline`.
 */

import { SearchOrderStationTimeline } from '@/components/search/order-feedback/SearchOrderStationTimeline';
import { PipelineStageRow } from '@/design-system/components';
import {
  deriveShippingDisplayMeta,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import { orderStampOrNull } from '@/components/shipped/details-panel/shipped-details-logic';
import type { TimelineItem } from '@/lib/timeline';
import type { ShippedOrder } from '@/types/orders';

function OutboundMilestones({ order }: { order: ShippedOrder }) {
  const serials = serialNumberRowsFromShipped(order);
  const meta = deriveShippingDisplayMeta(order, serials);
  const scannedOutAt = orderStampOrNull(order.ship_confirmed_at);

  return (
    <div
      className="divide-y divide-border-hairline border-b border-border-hairline px-3"
      data-testid="search-order-outbound-milestones"
    >
      <PipelineStageRow
        label="Tested"
        at={meta.testedAtSource}
        staffName={meta.techNameDisplay}
        emptyFallback="Not tested"
      />
      <PipelineStageRow
        label="Packed"
        at={meta.packedAtSource}
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

      <SearchOrderStationTimeline
        order={order}
        items={timelineItems}
        loading={timelineLoading}
      />
    </div>
  );
}
