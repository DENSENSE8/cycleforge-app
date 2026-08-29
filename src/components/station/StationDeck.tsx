'use client';

/**
 * `StationDeck` — the two-column scan-station frame: history dock left, the
 * station's own workbench right.
 *
 * ```tsx
 * <StationDeck history={<ShippingHistoryDock />}>
 *   …the station's existing shell, unchanged…
 * </StationDeck>
 * ```
 *
 * A wrapper rather than an edit inside each station's nested JSX, deliberately.
 * Six stations each have a bespoke body — motion-keyed panes, scroll shells,
 * overlays — and threading a dock into the middle of six different trees is six
 * chances to put it inside the scroll port, inside the `AnimatePresence`, or
 * under the overlay layer. Wrapping the root puts it in one place on all six and
 * cannot land inside anything.
 *
 * The dock is the LEFTMOST column and is always mounted — see
 * {@link StationHistoryDock} for why that is a budget requirement rather than a
 * preference.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function StationDeck({
  history,
  children,
  className,
}: {
  /**
   * The station's connected dock. Omit for a station that genuinely has no
   * history feed — the deck then collapses to its child and costs nothing.
   */
  history?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (!history) return <>{children}</>;
  return (
    <div
      className={cn(
        // `h-full` for a definite-height parent AND `flex-1` for a flex-column
        // one: the six stations differ, and a deck that only handled the first
        // collapsed to zero height on Unbox — where the dock was in the DOM,
        // sized, and invisible.
        'flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden',
        className,
      )}
    >
      {history}
      {/*
        `min-w-0` is load-bearing: without it the station's grid — which is wide
        and horizontally scrollable — sets this column's min-content width and
        pushes the dock off screen instead of scrolling inside itself.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
