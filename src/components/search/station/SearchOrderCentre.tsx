'use client';

/**
 * Zone 2 of the Search &amp; Details station layout — the order centre.
 *
 * Exact top-to-bottom order, and it is a contract, not a preference:
 *   1. Carton context — pinned. Not by `position: sticky`: `EntityStationPane`
 *      renders `StationContextBar` as a flex sibling ABOVE the workbench
 *      scrollport, so the body scrolls under a header that never moves. Adding
 *      `sticky` on top of that is how a header ends up double-offset.
 *   2. Items — the order's product facts.
 *   3. The warehouse thread — the bottom, and the reason Items collapses at all.
 *
 * **Status is NOT here.** Both halves of it — the visual stepper and the audit
 * rows — live on the right-edge `timeline` leaf (operator ruling 2026-08-21).
 * The centre is the record and the conversation; "what happened / where in the
 * pipeline" is reference, and reference lives on the edge. An earlier revision
 * put the audit log in the centre and it opened on 25 rows of machine events
 * with the thread pushed below the fold. Do not move it back.
 *
 * **Commercial facts have ONE seat, and it is the `status` leaf.** They were
 * mounted both here and on that leaf; the Displays index advertises the leaf as
 * "Shipping · serials · commercial", so the leaf won. Do not add a second
 * mount back into this block.
 *
 * The remaining block shares the collapse controller with nothing today, but
 * keeps using it so a second block can be added without re-wiring. Rules live in
 * `station/collapse/auto-collapse.ts`; this file only wires signals.
 *
 * **Zero padding here.** A structural stack inside a zero-padding shell:
 * `StationWorkbench` owns the body column pad, `StationCollapsibleBlock` owns
 * its header row, `ThreadPanel` owns its own insets. Vertical rhythm is flex
 * `gap` — never `space-y-*`, which loses to `mb-auto` on a bottom-pinned body.
 */

import { ShippedDetailsPanelContent } from '@/components/shipped/ShippedDetailsPanelContent';
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
      {/* 2 · ITEMS */}
      <StationCollapsibleBlock
        label="Items"
        collapsed={collapse.collapsed}
        onToggle={collapse.toggle}
        testId="search-order-items-block"
        bodyClassName="pt-1"
      >
        <ShippedDetailsPanelContent
          // Preview writes NOTHING. Omitting `editableShippingFields` was never
          // enough: the product section's condition editor consulted only
          // `isOrderShipped`, so any unshipped order was re-gradeable from the
          // find surface. This says it out loud instead.
          canEditProduct={false}
          shipped={order}
          durationData={{}}
          activeSection="product"
          // `flush` drops the component's own `px-8 pb-8` — the centre column
          // pad belongs to StationWorkbench, not to a block body.
          flush
          // No `editableShippingFields`: preview is the ABSENCE of the
          // capability prop, never a fork with the editors deleted.
        />
      </StationCollapsibleBlock>

      {/* 3 · THREAD — takes whatever the collapsed blocks give back. */}
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
