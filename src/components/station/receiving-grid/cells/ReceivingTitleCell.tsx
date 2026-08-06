'use client';

import { ledgerCell } from '@/design-system/tokens/typography/presets';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * Product title — scrollable fact track on Receiving (identity pane is
 * `select · order`). Still identity for in-cell editability
 * (`GRID_IDENTITY_COLUMN_KEYS`); correction is rematch / catalog at the
 * record plane, not an in-cell caret.
 *
 * **The title column shows the title.** The status dot that used to lead it was
 * removed 2026-08-02: a dot in the identity cell is a status fact wearing an
 * identity cell's address, so it could not be sorted, hidden, resized or
 * highlighted with the rest of its own column — and it spent the title's
 * truncation budget on every row to repeat what the `status` track already says
 * (`ReceivingStatusCell`, which now leads its chip with that same dot).
 *
 * Type: caption-dense Ledger body (`ledgerCell`) — same rung as date / qty /
 * dense identity chips.
 */
export function ReceivingTitleCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="title"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <span className={ledgerCell}>{ctx.productTitle}</span>
    </div>
  );
}
