/**
 * Shapes shared by the location record (`/m/loc/[code]`) and its faces.
 *
 * Their own module so the presentational faces (`LocationQtyStrip`,
 * `LocationSummaryCard`) and the hub can all name them without importing each
 * other in a cycle.
 */

export type LocationBindContent = {
  sku: string;
  qty: number;
  productTitle: string | null;
  imageUrl?: string | null;
};

/** One scanned location as the hub reads it. Unknown locations are empty, not missing. */
export type LocationRecord = {
  /** Flat scanned code (`C0101101`) — the address every write uses. */
  code: string;
  /** Dashed face (`C-01-01-1-01`). */
  face: string;
  /** `locations.room` (`Zone C`), null when the row was just registered. */
  room: string | null;
  contents: LocationBindContent[];
};
