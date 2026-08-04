'use client';

import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * Product title — scrollable fact track on the Sheets-class Receiving grid
 * (only `select` is frozen). Still identity for in-cell editability
 * (`GRID_IDENTITY_COLUMN_KEYS`); correction is rematch / catalog at the
 * record plane, not an in-cell caret.
 *
 * **The title column shows the title.** The status dot that used to lead it was
 * removed 2026-08-02: a dot in the identity cell is a status fact wearing an
 * identity cell's address, so it could not be sorted, hidden, resized or
 * highlighted with the rest of its own column — and it spent the title's
 * truncation budget on every row to repeat what the `status` track already says
 * (`ReceivingStatusCell`, which now leads its chip with that same dot).
 */
export function ReceivingTitleCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="title"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
        {ctx.productTitle}
      </span>
    </div>
  );
}
