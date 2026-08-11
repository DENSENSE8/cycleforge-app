/** Placeable packing location kinds + placement write sources (DB-free). */

export const PACK_PLACEABLE_KINDS = ['DESK', 'STAGING'] as const;
export type PackPlaceableKind = (typeof PACK_PLACEABLE_KINDS)[number];

export const PACK_PLACEMENT_SOURCES = ['tech_scan', 'move', 'admin'] as const;
export type PackPlacementSource = (typeof PACK_PLACEMENT_SOURCES)[number];

/**
 * The DISPLAY face of a location, in SQL — the operator nickname when one is
 * set, otherwise the canonical warehouse-map name.
 *
 * ONE fragment because four reads carry a bench name to a screen (order counts,
 * unit counts, the place/move result, and `/api/orders`' `pack_location_name`),
 * and a nickname that landed on three of them would show the operator two names
 * for one bench depending on which surface they were looking at.
 *
 * `NULLIF(BTRIM(...), '')` is load-bearing: clearing the Settings field writes
 * an empty string, and empty must fall back to `name` rather than blank a chip.
 *
 * Not for a lookup or a join — `display_name` is not unique and is not an
 * identity. Match on `id` / `barcode` / `name` as before.
 */
export function locationDisplayNameSql(alias = 'l'): string {
  return `COALESCE(NULLIF(BTRIM(${alias}.display_name), ''), ${alias}.name)`;
}
