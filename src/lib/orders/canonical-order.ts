import { toPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';

/**
 * `CanonicalOrder` — the normalization boundary for order ingest.
 *
 * Every order source (Google Sheets, Ecwid, ShipStation, Shopify, Square, …)
 * maps its own payload into this shape AT THE EDGE, and the domain writer
 * consumes only this. No source-specific representation is allowed past this
 * line — in particular no positional row arrays, which is what
 * `ecwid/fetch-transfer-rows.ts` used to synthesize so Ecwid JSON could be fed
 * through a spreadsheet-shaped pipeline.
 *
 * This module is deliberately dependency-free (pure types + pure grouping) so a
 * client bundle that touches an order type never inherits the Sheets client,
 * the Ecwid fetcher, or `tenancy/db` —
 * (bundle altitude).
 *
 * ## What belongs here vs. in the writer
 *
 * A `CanonicalOrderLine` carries **the source's own truth, already typed**:
 * strings are trimmed, dates are real `Date`s resolved through the date SoT
 * (`src/utils/date.ts`), money is a decimal string. It does NOT carry anything
 * that requires a database read. Catalog identity (`sku_catalog_id`), customer
 * matching, shipment ids, and dedupe are resolved by the domain writer against
 * the tenant's own data — a source cannot know them.
 *
 * That split is also the §4 catalog ruling from the ingest plan: the line keeps
 * a denormalized snapshot (`productTitle`, `sku`, `saleAmount`) so a historical
 * receipt still reads correctly after the catalog mutates; the catalog link is
 * an optional resolved-later reference, never a precondition for accepting the
 * order.
 */

/** One order line exactly as its source knows it. */
export interface CanonicalOrderLine {
  /** The platform's order identifier → `orders.order_id`. Required. */
  externalOrderId: string;
  /**
   * Marketplace line identity → `orders.external_line_id`.
   *
   * Amazon `OrderItemId`, eBay `lineItemId` / `transactionId`, Shopify
   * `line_item.id`, Square `uid`, ShipStation `orderItemId`, Ecwid `item.id`.
   * `''` when the source has none — {@link resolveExternalLineId} then falls
   * back through itemNumber → sku → productTitle so a sheet of five different
   * products still yields five rows, and sources that truly have no line grain
   * keep today's one-row-per-order behaviour.
   */
  externalLineId: string;
  /** Platform listing / item id → `orders.item_number`. */
  itemNumber: string;
  /** Snapshot title at time of sale → `orders.product_title`. */
  productTitle: string;
  /** Seller SKU as the source reported it → `orders.sku`. */
  sku: string;
  /** Free-text condition grade as the source reported it. */
  condition: string;
  /** Kept as text — `orders.quantity` is a text column. */
  quantity: string;
  /** Buyer / operator note → `orders.notes`. */
  notes: string;
  /**
   * The buyer's name as the source reported it, when the source carries one but
   * no customer identity the writer could match on (no id, no email, no phone).
   *
   * The writer resolves it to a real `customers` row and sets
   * `orders.customer_id`. It is deliberately NOT a note: a CSV import used to
   * stuff `"Customer: <name>"` into `notes` because the name had nowhere else
   * to go, which made it invisible to every customer-scoped read and put prose
   * in a column the operator also types into. `''` when the source has no name
   * or already carries a matchable customer.
   */
  customerName: string;
  /** Channel label → `orders.account_source`. */
  accountSource: string;
  /**
   * Lifecycle status the SOURCE knows, or null when it has no opinion.
   *
   * A marketplace genuinely knows whether it already fulfilled an order (a
   * completed Square register sale, a FULFILLED Shopify order), and that fact
   * should land rather than being forced to `'unassigned'`. The writer only
   * applies it while the order is still untouched — once an operator has moved
   * it, local progress wins.
   */
  status: string | null;
  /** Raw carrier tracking values; the writer resolves them to shipment ids. */
  trackings: string[];
  /**
   * Fulfillment deadline as an INSTANT — the END of the warehouse civil day the
   * source named, because a ship-by is a deadline (on time until that day
   * closes). Adapters must resolve it via `toPSTDateKey` +
   * `warehouseDayUtcBounds`; a blank/unparseable source value is `null`
   * ("unknown"), never "today".
   */
  shipByDate: Date | null;
  /** When the order was PLACED — a true instant, distinct from `shipByDate`. */
  orderDate: Date | null;
  /** Decimal string (matches `orders.sale_amount` numeric), or null. */
  saleAmount: string | null;
  /**
   * ISO currency code, or null when the SOURCE DOES NOT CARRY ONE.
   *
   * The distinction is load-bearing, not pedantry: the writer defaults a null
   * to `'USD'` when inserting, but must not UPDATE an existing order's currency
   * from a source that never knew it — otherwise a sheet without a currency
   * column silently rewrites every non-USD order to USD on each sync.
   */
  currency: string | null;
}

/**
 * One LINE after same-identity source rows are folded — the unit the writer
 * upserts. `orders` is a line table: one marketplace order number (`order_id`)
 * is a band over N rows distinguished by `external_line_id`.
 *
 * `lineCount` is how many source rows collapsed onto THIS line identity (a
 * re-sync of the same SKU), not how many products are on the order.
 */
interface CanonicalOrder extends CanonicalOrderLine {
  lineCount: number;
}

/** Trim, coerce null/undefined to `''`. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Parse a source money cell into a decimal string.
 *
 * Strips currency symbols and thousands separators before parsing, so
 * `"$1,299.00"` and `"1299"` both land as `"1299"`. Returns null when the
 * source carried no parseable number — an absent price is unknown, never zero.
 *
 * The digit check is load-bearing and fixes a latent bug carried over from the
 * pipeline this replaced: stripping a non-numeric cell like `"n/a"` leaves the
 * empty string, and `Number('')` is `0`, not `NaN`. The old code therefore
 * resolved junk price cells to a valid `'0'` — and because the writer treats a
 * non-null saleAmount as authoritative, every sync overwrote that order's real
 * sale amount with zero.
 */
export function parseSaleAmount(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const stripped = raw.replace(/[^0-9.-]/g, '');
  if (!/\d/.test(stripped)) return null;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

/**
 * Stable line identity written to `orders.external_line_id`.
 *
 * Marketplace adapters pass the source's own id. Spreadsheet / CSV rows pass
 * `''` and fall through the listing facts the sheet already carries, so five
 * different products on one order number stay five rows. Two rows of the SAME
 * listing still fold (the duplicate-row contract).
 */
export function resolveExternalLineId(line: {
  externalLineId?: string;
  itemNumber: string;
  sku: string;
  productTitle: string;
}): string {
  return (
    cleanText(line.externalLineId) ||
    cleanText(line.itemNumber) ||
    cleanText(line.sku) ||
    cleanText(line.productTitle)
  );
}

/**
 * Fold `CanonicalOrderLine[]` into one `CanonicalOrder` per
 * `(externalOrderId, resolved line id)`.
 *
 *   • lines with a blank `externalOrderId` are dropped (unjoinable);
 *   • the LAST source row for a line identity wins its scalar fields;
 *   • trackings union only within that same line (a re-sync of one product),
 *     never across siblings — an untracked sibling stays untracked so the
 *     desk can paint it as unshipped;
 *   • customer name is an ORDER fact: the first non-empty name on the band
 *     fills siblings that didn't carry one.
 *
 * Insertion order of first appearance is preserved so a caller's progress
 * reporting and detail rows stay in source order.
 */
export function groupCanonicalOrderLines(lines: CanonicalOrderLine[]): CanonicalOrder[] {
  const byLine = new Map<string, CanonicalOrder>();

  for (const line of lines) {
    const orderId = cleanText(line.externalOrderId);
    if (!orderId) continue;
    const lineId = resolveExternalLineId(line);
    const key = `${orderId}\0${lineId}`;

    const existing = byLine.get(key);
    const trackings = existing ? [...existing.trackings] : [];
    for (const tracking of line.trackings) {
      const clean = cleanText(tracking);
      if (clean && !trackings.includes(clean)) trackings.push(clean);
    }

    byLine.set(key, {
      ...line,
      externalOrderId: orderId,
      externalLineId: lineId,
      trackings,
      lineCount: (existing?.lineCount ?? 0) + 1,
    });
  }

  const folded = Array.from(byLine.values());

  const customerByOrder = new Map<string, string>();
  for (const line of folded) {
    const name = cleanText(line.customerName);
    if (name && !customerByOrder.has(line.externalOrderId)) {
      customerByOrder.set(line.externalOrderId, name);
    }
  }
  for (const line of folded) {
    if (cleanText(line.customerName)) continue;
    const inherited = customerByOrder.get(line.externalOrderId);
    if (inherited) line.customerName = inherited;
  }

  return folded;
}

/**
 * Resolve a SPREADSHEET ship-by cell to the END of that warehouse civil day.
 *
 * Shared by every spreadsheet-shaped lane — the Google Sheet adapter and the
 * CSV import, which read the same operator-authored files in the same formats.
 * It lived in `sources/google-sheet-rows.ts` until the CSV lane gained a
 * mappable ship-by column; a second copy would have re-earned both bugs below
 * independently, which is the whole reason they are documented here.
 *
 *  1. `new Date('2026-07-15')` parses as UTC midnight, which is 5pm the
 *     PREVIOUS day in the warehouse zone — every date-only ship-by landed a day
 *     early. `toPSTDateKey` normalizes the sheet's shapes (`YYYY-MM-DD`,
 *     `M/D/YYYY`, a datetime) to one civil key first.
 *  2. A blank cell must NOT fall back to today. That stamped the import day as
 *     the deadline, so an order was born already at its due date and read as
 *     overdue the next morning — 61% of the live Pending queue carried a
 *     deadline equal to its own creation date because of it. A missing ship-by
 *     is unknown (null); display already falls back to the created date.
 *
 * End-of-day rather than midnight because a ship-by is a deadline: the order is
 * on time until that warehouse day closes (matches the FBA path's 23:59:59).
 */
export function resolveSpreadsheetShipByDate(rawShipByDate: unknown): Date | null {
  const raw = cleanText(rawShipByDate);
  if (!raw) return null;
  const dateKey = toPSTDateKey(raw);
  if (!dateKey) return null;
  // An unparseable civil key yields no bounds — treat it as unknown, not today.
  const bounds = warehouseDayUtcBounds(dateKey);
  return bounds ? new Date(bounds.endIso) : null;
}
