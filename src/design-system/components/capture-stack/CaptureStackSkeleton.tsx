/**
 * Geometry-true stand-in for a {@link CaptureStack}'s first paint.
 *
 * WHY THIS EXISTS — measured on the Vercel preview, 2026-09-02, mobile profile:
 * `CaptureStack`'s default loading node is a single centred "Loading…" label.
 * That paints instantly but is *small*, so the largest contentful element only
 * arrives when the real rows land after hydrate + fetch, and Lantern charges
 * LCP the whole document → chunks → hydrate → fetch chain. `/m/pack` shows the
 * shape exactly: FCP 485ms, LCP 1148ms observed, 8060ms simulated, Perf 65.
 * `/m/unbox`, whose largest element is static chrome present in the first HTML,
 * paints FCP = LCP = 471ms and scores 91.
 *
 * So the fix is not "paint sooner" — it is "let the first paint already contain
 * the largest element". This mirrors the real stack's geometry (collapsed rows
 * above, one expanded card pinned at the bottom) so LCP resolves at FCP and the
 * swap to real rows moves no neighbour.
 *
 * Lives beside `CaptureStackRow` because it mirrors that component's chrome
 * exactly — a per-feed copy would fork the geometry the moment a row changes.
 * Desktop's `LedgerGridSkeleton` is the same move for the ledger grid; this is
 * its capture-stack sibling. Both are stand-ins, not spinners — the house removed the
 * spinner entirely (`RouteLoading` deleted 2026-09-02).
 *
 * Motion: the pulse comes from the shadcn `Skeleton` primitive, which animates
 * OPACITY only. Inside the house motion law (M1 bans geometry tweens, not
 * opacity) and it composites off the main thread, so it costs no TBT.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cornerClass } from '@/design-system/tokens/radius';
import { MOBILE_GUTTER, MOBILE_GUTTER_X } from '@/components/mobile/redesign/DesignSystem';

/**
 * Collapsed rows are cheap, so paint enough to fill a phone screen above the
 * expanded card. Eight matches `MobileReceivingList`'s own default `limit`.
 */
const COLLAPSED_ROWS = 8;

/** One collapsed row: `CaptureStackRow variant="collapsed"` chrome, verbatim. */
function CollapsedRowSkeleton() {
  return (
    <div
      className={`flex w-full max-w-full flex-col border-b border-border-hairline bg-surface-card ${MOBILE_GUTTER} py-3`}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function CaptureStackSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading feed"
      className="flex h-full min-h-0 w-full max-w-full flex-col justify-end overflow-hidden bg-surface-card"
    >
      {Array.from({ length: COLLAPSED_ROWS }, (_, i) => (
        <CollapsedRowSkeleton key={i} />
      ))}

      {/* The bottom-pinned expanded card — the stack's largest element, and so
          the one this stand-in exists to reserve. `CaptureStackRow
          variant="expanded"` chrome. */}
      <div
        className={`${MOBILE_GUTTER_X} mb-3 mt-2 shrink-0 border border-border-hairline bg-surface-card p-4 ${cornerClass('card')}`}
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
        <Skeleton className="mt-3 h-40 w-full" />
      </div>
    </div>
  );
}
