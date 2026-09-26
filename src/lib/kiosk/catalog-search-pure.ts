/** Pure helpers for the kiosk catalog searcher (no DB / no `server-only`). */

/**
 * Below this, a query is not a search — it is a keystroke. The catalog grid
 * keeps showing its current page instead of thrashing the DB per character.
 */
const CATALOG_SEARCH_MIN_CHARS = 2;

/** On-hand at or below this reads as "low" when the bin sets no own floor. */
const CATALOG_LOW_STOCK_FALLBACK = 3;

/** A single pick location, already resolved to something a staffer can walk to. */
export interface CatalogBin {
  /** Human handle — bin barcode when it has one, else the location name. */
  label: string;
  /** Scannable bin barcode, when the location carries one. */
  barcode: string | null;
  /** Units of this SKU in THIS bin (not the org total). */
  qty: number;
}

/** Everything the kiosk needs to answer "have we got it, and where". */
export interface CatalogAvailability {
  /**
   * Availability as the STOREFRONT reports it (`platform_listings.in_stock`).
   * Distinct from local on-hand: a listing can be enabled and sold out.
   */
  listedInStock: boolean;
  /**
   * Local on-hand summed across this org's bins. `null` means the SKU is not
   * bin-tracked at all — which is NOT the same as zero and must never print
   * as "Out of stock".
   */
  onHand: number | null;
  /** The bin to walk to first (the one holding the most), when known. */
  bin: CatalogBin | null;
  /** How many distinct bins hold this SKU — drives the "+N more" hint. */
  binCount: number;
}

/** What the product card should SAY about stock. */
type CatalogStockState = 'in_stock' | 'low' | 'out' | 'unknown';

/** Collapse a query to the form the search actually runs on. */
export function normalizeCatalogQuery(raw: string | null | undefined): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

/** A query long enough to hit the server. */
export function isSearchableCatalogQuery(raw: string | null | undefined): boolean {
  return normalizeCatalogQuery(raw).length >= CATALOG_SEARCH_MIN_CHARS;
}

/**
 * The handle a staffer reads out loud. Bin barcodes are the addressing scheme
 * (`Z1-A-03`), so they win over the location name when present; the name is the
 * fallback for the named zones (`Showroom`, `Returns`) that carry no barcode.
 */
export function buildBinLabel(row: {
  bin_name: string | null;
  bin_barcode: string | null;
}): string | null {
  const barcode = String(row.bin_barcode ?? '').trim();
  if (barcode) return barcode;
  const name = String(row.bin_name ?? '').trim();
  return name || null;
}

/** One availability answer from one joined search row. */
export function summarizeAvailability(row: {
  in_stock: boolean;
  on_hand: number | null;
  bin_count: number | null;
  bin_name: string | null;
  bin_barcode: string | null;
  bin_qty: number | null;
}): CatalogAvailability {
  const label = buildBinLabel(row);
  const binQty = row.bin_qty;
  return {
    listedInStock: row.in_stock,
    onHand: row.on_hand == null ? null : Number(row.on_hand),
    bin:
      label == null || binQty == null
        ? null
        : { label, barcode: row.bin_barcode?.trim() || null, qty: Number(binQty) },
    binCount: Number(row.bin_count ?? 0),
  };
}

/** Stock state for the card. */
export function resolveStockState(
  availability: CatalogAvailability,
  lowStockThreshold: number = CATALOG_LOW_STOCK_FALLBACK,
): CatalogStockState {
  if (availability.onHand == null) {
    return availability.listedInStock ? 'unknown' : 'out';
  }
  if (availability.onHand <= 0) return 'out';
  if (availability.onHand <= lowStockThreshold) return 'low';
  return 'in_stock';
}

/** Short badge copy per state — the one place this wording is decided. */
export function stockBadgeLabel(
  availability: CatalogAvailability,
  lowStockThreshold?: number,
): string | null {
  const state = resolveStockState(availability, lowStockThreshold);
  if (state === 'unknown') return null;
  if (state === 'out') return 'Out of stock';
  return `${availability.onHand} in stock`;
}
