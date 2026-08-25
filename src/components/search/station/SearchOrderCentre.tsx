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
 *   4. The warehouse thread — full height, and the reason 2 and 3 collapse.
 *
 * **Status is in the centre, and that is a REVERSAL** (operator ruling,
 * 2026-08-22). From 2026-08-21 it lived only on the right-edge `timeline` leaf,
 * because an earlier revision had opened the centre on 25 rows of machine
 * events with the thread pushed below the fold. The operator has called it
 * back: a record surface that cannot tell you where the order IS without a
 * second click is not showing you the record.
 *
 * The old failure mode is real and is handled, not ignored. Status and Items
 * share ONE auto-collapse controller — the mechanism `auto-collapse.ts` was
 * written for, whose own docblock names "Items · Status & Timeline" as the pair
 * of reference blocks it yields — so both fold the instant the operator scrolls
 * or focuses the composer, handing their space back to the conversation.
 *
 * **The block is the STEPPER, and only the stepper.** `OrderPipelineSection` —
 * the left-to-right stage run with the staff member and the timestamp on each
 * stage. The activity TRAIL (`OrderTimelineSection`) stays on the `timeline`
 * leaf and does not come with it.
 *
 * That split is the whole reason this can live in the centre at all. Measured
 * on a real order: stepper + trail rendered an 1138px block, which put Items at
 * y=1218 and the composer at y=1581 in a 720px viewport — the exact 2026-08-21
 * failure, reproduced on the first order opened. The stepper alone is a band.
 * A record surface should answer "where is this order" at a glance; "who
 * touched it, in what order, over 25 machine events" is reference, and
 * reference lives on the edge.
 *
 * **Commercial facts have ONE seat, and it is the `status` leaf.** They were
 * mounted both here and on that leaf; the Displays index advertises the leaf as
 * "Shipping · serials · commercial", so the leaf won. Do not add a second mount
 * back into this block.
 *
 * **Zero padding here.** A structural stack inside a zero-padding shell:
 * `StationWorkbench` owns the body column pad, `StationCollapsibleBlock` owns
 * its header row, `ThreadPanel` owns its own insets. Vertical rhythm is flex
 * `gap` — never `space-y-*`, which loses to `mb-auto` on a bottom-pinned body.
 */

import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { SearchOrderItems } from './SearchOrderItems';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
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
  const orderRowId = Number(order.id);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 2 · STATUS — the stepper. Not deferred behind a loader the way the
          Displays leaves are: a leaf pays for its chunk only if the operator
          opens it, but this block paints on every order, so a `dynamic()` here
          would buy a spinner on first paint and nothing else. */}
      <StationCollapsibleBlock
        label="Status"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-order-status-block"
        bodyClassName="pt-1"
      >
        <OrderPipelineSection shipped={order} />
      </StationCollapsibleBlock>

      {/* 3 · ITEMS */}
      <StationCollapsibleBlock
        label="Items"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-order-items-block"
        bodyClassName="pt-1"
      >
        {/* The SoT item face — `design-system/components/item-record`, the same
            ledger the scan stations paint in their middle context display. */}
        <SearchOrderItems order={order} />
      </StationCollapsibleBlock>

      {/* 4 · THREAD — full height: it takes every pixel the blocks above do not,
          so the note composer sits on the floor of the pane rather than trailing
          the last message. That only holds because the pane passes `centreFill`,
          which gives this column a definite height for `flex-1` to divide;
          `flex-1` inside a content-sized scroll column resolves to nothing. */}
      {hasOrderRow ? (
        <ThreadPanel
          entityType="ORDER"
          entityId={orderRowId}
          className="min-h-0 flex-1"
          onComposerFocusChange={(focused) =>
            focused ? collapse.engage() : collapse.disengage()
          }
        />
      ) : null}
    </div>
  );
}
