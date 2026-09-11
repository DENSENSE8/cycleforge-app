/**
 * Overlay hosts for row-plane chrome on the slot table.
 *
 * DataTable stamps {@link SLOT_TABLE_OVERLAY_HOST_ATTR} on the grid shell
 * (lookup via `closest` from a selected row). LedgerGrid stamps
 * {@link SLOT_TABLE_ACTION_ROW_ATTR} as an in-flow `empty:hidden` guest
 * *under* `[data-grid-col-header]` — column labels stay visible; armed, the
 * guest grows and pushes the rows. Never over the search toolbar. Never
 * covering the column headers.
 */
export const SLOT_TABLE_OVERLAY_HOST_ATTR = 'data-slot-table-overlay-host';

/** In-flow guest under the column header — collapses when empty. */
export const SLOT_TABLE_ACTION_ROW_ATTR = 'data-slot-table-action-row';
