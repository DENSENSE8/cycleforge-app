'use client';

import { ledgerGridCell } from './grid-cell-chrome';
import { cn } from '@/utils/_cn';

/**
 * The body cell for a trailing `_fill` track — the sole `1fr` on a LedgerGrid.
 *
 * **Why every family needs the track.** The house law (Receiving golden, same
 * as Orders) is: every fact column is content-hard, and a zero-floor filler at
 * the right edge absorbs the slack so the sheet fills its pane. Thirteen
 * families instead hung `1fr` off a content column, and eleven of those hung it
 * off a **frozen** one — which is a contradiction, not a preference:
 * `gridFrozenLeft` sums each locked column's DECLARED rem to compute the next
 * frozen cell's sticky `left`, so a track that renders wider than its floor
 * puts every following frozen cell out by exactly that difference, and the grid
 * cannot honestly stretch. Slack must land somewhere nothing is pinned to.
 *
 * **Why this component exists.** Receiving hand-rolled this cell and every
 * ported family would have hand-rolled it again — thirteen copies of an empty
 * div, each free to forget the presentation role. `isGridColumnFillTrack` had been
 * sitting in `grid-column-editability.ts` with zero call sites for exactly as
 * long; this is the render half of the same SoT.
 *
 * Structural, never a fact column: no label, no type, no `hideKey`, no `tier`,
 * never sortable, never resizable, and `role="presentation"` so an empty cell
 * is not announced as data.
 */
export function GridFillCell({ className }: { className?: string }) {
  return (
    <div
      data-col="_fill"
      role="presentation"
      aria-hidden
      className={cn(ledgerGridCell({ rule: false }), 'min-h-0', className)}
    />
  );
}

/**
 * The one declaration of the trailing filler track. Spread it as the LAST entry
 * of a column model: `[...facts, GRID_FILL_COLUMN]`.
 */
export const GRID_FILL_COLUMN = {
  key: '_fill' as const,
  width: 'minmax(0rem, 1fr)',
  sortable: false,
  resizable: false,
};
