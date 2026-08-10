/** Placeable packing location kinds + placement write sources (DB-free). */

export const PACK_PLACEABLE_KINDS = ['DESK', 'STAGING'] as const;
export type PackPlaceableKind = (typeof PACK_PLACEABLE_KINDS)[number];

export const PACK_PLACEMENT_SOURCES = ['tech_scan', 'move', 'admin'] as const;
export type PackPlacementSource = (typeof PACK_PLACEMENT_SOURCES)[number];
