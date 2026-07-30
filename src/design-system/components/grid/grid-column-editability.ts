/**
 * Grid column editability — identity columns are collection-map read-only.
 *
 * The locked identity pane (`select` · `title`) is frozen and immovable for
 * geometry; this module pins the matching **edit** contract: identity columns
 * never mount an in-cell editor. Correction happens at the record plane
 * (rematch / catalog / order detail), which must stay a complete superset of
 * editable fields — see `display/workbench.md` → Action planes.
 *
 * Fact columns (qty, date, grade, …) still opt into `LedgerCellEditor` at the
 * row renderer; this SoT only forbids identity keys so Incoming / Unbox cannot
 * drift from the dashboard again.
 */

/** Locked identity pane — frozen, immovable, never in-cell editable. */
export const GRID_IDENTITY_COLUMN_KEYS = ['select', 'title'] as const;

export type GridIdentityColumnKey = (typeof GRID_IDENTITY_COLUMN_KEYS)[number];

export function isGridIdentityColumn(key: string): boolean {
  return (GRID_IDENTITY_COLUMN_KEYS as readonly string[]).includes(key);
}

/**
 * May this column mount `LedgerCellEditor` / a cell focus ring on a collection
 * map? Identity columns always return false.
 */
export function isGridColumnInCellEditable(key: string): boolean {
  return !isGridIdentityColumn(key);
}
