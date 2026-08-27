'use client';

/**
 * Zone 2 of the Search &amp; Details station layout — the order centre.
 *
 * Exact top-to-bottom order, and it is a contract, not a preference:
 *   1. Carton context — pinned. Not by `position: sticky`: `EntityStationPane`
 *      renders `StationContextBar` as a flex sibling ABOVE the workbench
 *      scrollport, so the body scrolls under a header that never moves. Adding
 *      `sticky` on top of that is how a header ends up double-offset.
 *   2. Status — the pipeline stepper: stage, staff, timestamp, left to right.
 *   3. Items — the order's product facts.
 *
 * Preview search does not mount a warehouse thread.
 *
 * **Status is in the centre, and that is a REVERSAL** (operator ruling,
 * 2026-08-22). From 2026-08-21 it lived only on the right-edge `timeline` leaf,
 * because an earlier revision had opened the centre on 25 rows of machine
 * events. The operator has called it back: a record surface that cannot tell
 * you where the order IS without a second click is not showing you the record.
 *
 * Status and Items share ONE auto-collapse controller — the mechanism
 * `auto-collapse.ts` was written for — so both fold on scroll.
 *
 * **The block is the STEPPER, and only the stepper.** `OrderPipelineSection` —
 * the left-to-right stage run with the staff member and the timestamp on each
 * stage. The activity TRAIL (`OrderTimelineSection`) stays on the `timeline`
 * leaf and does not come with it.
 *
 * **Commercial facts have ONE seat, and it is the `status` leaf.** They were
 * mounted both here and on that leaf; the Displays index advertises the leaf as
 * "Shipping · serials · commercial", so the leaf won. Do not add a second mount
 * back into this block.
 *
 * **Zero padding here.** Edge-to-edge of the centre column: items and
 * hairlines abut the measure. The status pipeline owns its own inset
 * (`OrderPipelineSection`). Vertical rhythm is flex `gap`.
 */

import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { SearchOrderItems } from './SearchOrderItems';
import { StationCollapsibleBlock } from '@/components/station/collapse/StationCollapsibleBlock';
import type { AutoCollapseController } from '@/components/station/collapse';
import type { ShippedOrder } from '@/types/orders';

export function SearchOrderCentre({
  order,
  collapse,
}: {
  order: ShippedOrder;
  /** Shared controller — blocks collapse on ONE signal, not per-block state. */
  collapse: AutoCollapseController;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StationCollapsibleBlock
        label="Status"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-order-status-block"
      >
        <OrderPipelineSection shipped={order} />
      </StationCollapsibleBlock>

      <StationCollapsibleBlock
        label="Items"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-order-items-block"
      >
        <SearchOrderItems order={order} />
      </StationCollapsibleBlock>
    </div>
  );
}
