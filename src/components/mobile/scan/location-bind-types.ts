/** Shapes shared by the location record (`/m/loc/[code]`) and its faces. */

export type LocationBindContent = {
  /** `sku_stock.id`, the existing product-photo entity anchor. */
  stockId?: number | null;
  sku: string;
  qty: number;
  productTitle: string | null;
  isProvisional?: boolean;
  imageUrl?: string | null;
  /** SKU_STOCK photo ids in display order (`[0]` = cover); empty when none. */
  photoIds: number[];
};

/** A movable, licence-plated container currently parked at this address. */
export type LocationHandlingUnit = {
  id: number;
  code: string;
  status: 'OPEN' | 'STAGED' | 'IN_TEST' | 'CLOSED';
  totalUnits: number;
  testedUnits: number;
  holdUnits: number;
  pairedOrderId: number | null;
  createdAt: string;
};

/** One scanned location as the hub reads it. Unknown locations are empty, not missing. */
export type LocationRecord = {
  /** Tenant-scoped database identity; null only during first-use registration. */
  id: number | null;
  /** Flat scanned code (`C0101101`) — the address every write uses. */
  code: string;
  /** Dashed face (`C-01-01-1-01`). */
  face: string;
  /** `locations.room` (`Zone C`), null when the row was just registered. */
  room: string | null;
  contents: LocationBindContent[];
  handlingUnits: LocationHandlingUnit[];
  /** This location's place in its room's physical walk; null for a just-registered code. */
  walk: LocationWalkStep | null;
};

export type LocationWalkStep = {
  /** 1-based. */
  position: number;
  total: number;
  previous: string | null;
  next: string | null;
};
