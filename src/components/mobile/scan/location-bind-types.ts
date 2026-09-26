/** Shapes shared by the location record (`/m/loc/[code]`) and its faces. */

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
