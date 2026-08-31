import { Suspense } from 'react';
import { OrderExceptionsWorkbench } from '@/components/outbound/orders/exceptions/OrderExceptionsWorkbench';

/**
 * `/shipping/exceptions` — the held-order queue.
 *
 * INSIDE the `(desk)` route group since 2026-08-31. It sat outside until then
 * on an explicit brief ("asked for at full page width"), and that brief is
 * reversed here rather than quietly worked around: the operator asked for the
 * surface to "display with a small screen first" with "a CTA button to access
 * the full screen", and the small state IS `DeskPageChrome`'s stage.
 *
 * The stage is also the only thing that makes that CTA exist.
 * `DataTableFullscreenToggle` renders NOTHING when `useDeskStageOptional()` is
 * null — a dead control being worse than no control — and the only
 * `DeskStageProvider` in the product is inside `DeskPageChrome`. So while this
 * route sat beside the group, the fullscreen affordance on its table was not
 * merely unstyled, it was absent, and there was no small state for it to
 * return to. Being in the group supplies both.
 *
 * Being in the group is also what makes the tab feel like a tab. Next keeps a
 * layout mounted across sibling segments, so To ship → Exceptions swaps only
 * the body; the tab band, the page header and the stage stay put instead of
 * disappearing and reappearing. (It is the same reason fullscreen already
 * survives Orders → Amazon Prep.)
 *
 * The URL is unchanged — a route group adds no segment — so every existing
 * `/shipping/exceptions?order=…` link still resolves here.
 */
export const dynamic = 'force-dynamic';

export default function ShippingExceptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <p className="text-role-caption text-text-soft">Loading exceptions…</p>
        </div>
      }
    >
      <OrderExceptionsWorkbench />
    </Suspense>
  );
}
