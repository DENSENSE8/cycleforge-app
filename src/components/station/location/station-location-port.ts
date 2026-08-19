/**
 * Station location placement PORT — the one seam between the shared
 * Displays → Locations leaf and the three storages that own a placement.
 *
 * Three storages stay three storages. Arrival writes the carton's triage
 * `staging_location_id`; Unbox writes `receiving_line_putaway` on the open
 * line; Ready to Pack writes `order_pack_placements` for the open order. The
 * INTERACTION is the same at all three benches — browse the addresses you
 * have, put the thing you are holding on one, reprint a scuffed sticker, mint
 * one that does not exist yet — so the leaf is shared and the WRITER is not.
 *
 * Nothing here is React: a port is data plus one async writer, so a station
 * can build it from a controller, a fetch, or a test fake.
 */

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
  /**
   * Can a freshly minted BIN hold this entity?
   *
   * `false` on Ready to Pack, and it is not a nicety: `/api/locations/register`
   * mints a shelf BIN, while `order_pack_placements` only accepts a
   * DESK / STAGING row (`PACK_PLACEABLE_KINDS`). Offering "Create & place"
   * there would mint a real shelf and then bounce the placement with
   * `LOCATION_NOT_PLACEABLE` — a dead end dressed as a verb. The mint + print
   * half still works, which is the half that was actually missing.
   */
  canPlaceMinted: boolean;
}
