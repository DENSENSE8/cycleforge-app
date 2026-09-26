/** Station location placement PORT — the one seam between the shared Displays → Locations leaf and the three storages that own a placement. */

import type { PutawaySuggestion } from '@/lib/receiving/suggested-putaway-location';

/** The least a row needs to be listed, searched, placed on, and printed. */
export interface StationLocationRow {
  id: number;
  /** Operator-facing face — the nickname when the read resolved one. */
  name: string;
  room: string | null;
  /**
   * Canonical scannable address. `null` (or a non-flat code like
   * `PACK-DESK-01`) simply means the row cannot be REPRINTED here; it can
   * still be placed on.
   */
  barcode: string | null;
}

export interface StationLocationPlacementPort {
  locations: readonly StationLocationRow[];
  locationsLoading: boolean;
  /** Where the open entity is right now — marks the row and blocks a no-op move. */
  placedLocationId: number | null;
  /**
   * Put the open entity on this address. Returns whether the write LANDED —
   * a caller must never toast a placement that rolled back.
   */
  place: (locationId: number) => Promise<boolean>;
  /** Re-read the catalog after something minted an address. */
  refreshCatalog: () => void;
  /**
   * What the operator is holding — `carton` at Arrival/Unbox, `order` at
   * Ready to Pack. Used in row subtitles and the leaf's own footer copy.
   */
  entityNoun: string;
  /** Can a freshly minted BIN hold this entity? */
  canPlaceMinted: boolean;
  /** The DIRECTED target — "put it HERE" — painted above the searchable list. */
  suggestion?: PutawaySuggestion | null;
  /** First suggestion read in flight — the target slot waits instead of flashing empty. */
  suggestionLoading?: boolean;
}
