/**
 * LedgerGridSkeleton — the Band 2 cold-start stand-in for a ledger grid
 * (motion-bands proposal 2026-08-27; first adopter of `--cf-motion-status`).
 *
 * A skeleton is a floor plan, not a promise: every stand-in row is EXACTLY
 * `rowEstimate` tall — the same number the virtualizer's scroll math uses —
 * full-bleed on the sheet with the grid's own hairline separators and cell
 * inset, so the resolve to real rows is a repaint, not a reflow. The previous
 * treatment (`SkeletonList` inside a `p-3` wrapper) padded a flush sheet and
 * guessed its own row box, so the swap moved every line under the operator's
 * eye.
 *
 * Shimmer is opacity-only and tokened (`.cf-skeleton-block`, animated only
 * inside a `data-motion="2"` region at `--cf-motion-status`). No motion
 * import, no transform, no geometry — a Band 0/1 mount of this component is
 * static by arithmetic.
 */

import { LEDGER_GRID_CELL_INSET } from './grid-cell-chrome';
import { LEDGER_GRID_ROW_ESTIMATE_PX } from './grid-paint';
import { cn } from '@/utils/_cn';

/** One flat rhythm — column-ish blocks, widths staggered so rows read as
 *  data rather than bars. Static layout, never derived from live columns:
 *  the skeleton must not re-layout when the column model resolves. */
const CELL_WIDTHS = ['9%', '26%', '14%', '10%', '7%'] as const;

interface LedgerGridSkeletonProps {
  /** Row box height — pass the surface's `rowEstimate` so stand-ins and real
   *  rows agree; defaults to the house estimate like the virtualizer does. */
  rowEstimate?: number;
  rows?: number;
}

export function LedgerGridSkeleton({
  rowEstimate = LEDGER_GRID_ROW_ESTIMATE_PX,
  rows = 14,
}: LedgerGridSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading rows"
      className="min-h-0 w-full flex-1 overflow-hidden"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            'flex items-center gap-3 border-b border-border-hairline',
            LEDGER_GRID_CELL_INSET,
          )}
          style={{ height: rowEstimate }}
        >
          {CELL_WIDTHS.map((width, j) => (
            <div
              key={j}
              className="cf-skeleton-block h-2.5 rounded-none bg-surface-strong"
              style={{ width }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
