/**
 * Selection scope for the repair queue's airtable-gutter multi-select flow.
 * Shared by the grid side (useTableSelectMode in RepairGridView) and the host
 * side (useRepairRailSelection in RepairTable) so the string can't drift.
 * Distinct from the receiving/dashboard scopes — a repair selection must never
 * bleed into another surface's action bar.
 */
export const REPAIR_SELECTION_SCOPE = 'repair-queue' as const;
