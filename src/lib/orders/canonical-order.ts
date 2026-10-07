import { toPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';

/** `CanonicalOrder` — the normalization boundary for order ingest. */

/** One order line exactly as its source knows it. */
export interface CanonicalOrderLine {
  /** The platform's order identifier → `orders.order_id`. Required. */
  externalOrderId: string;
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
  /** The buyer's name as the source reported it, when the source carries one but no customer identity the writer could match on (no id, no… */
  customerName: string;
  /** Buyer IDENTITY + ship-to, when the source carries them (an API connector; a CSV cannot). */
  buyer?: {
    /** The channel's own stable customer id (e.g. ShipStation `customerId`). */
    channelCustomerId: string;
    /**
     * The system that issued `channelCustomerId`, when it is not the order's
     * `accountSource` — an aggregator (ShipStation) records the order under the
     * platform but its customer ids are its own. Omitted = `accountSource`.
     */
    channel?: string;
    name: string;
    email: string;
    phone: string;
    /** Ship-to as the source reported it; null when the order has none. */
    shipTo: {
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      residential: boolean | null;
    } | null;
    /**
     * Bill-to, stored on `customers.billing_address` (jsonb) only while that
     * is still blank. Omitted/null when the source has none.
     */
    billTo?: {
      name: string | null;
      company: string | null;
      phone: string | null;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    } | null;
  } | null;
  /** Channel label → `orders.account_source`. */
  accountSource: string;
  /** Lifecycle status the SOURCE knows, or null when it has no opinion. */
  status: string | null;
  /** Raw carrier tracking values; the writer resolves them to shipment ids. */
  trackings: string[];
  /** Fulfillment deadline as an INSTANT — the END of the warehouse civil day the source named, because a ship-by is a deadline (on time until… */
  shipByDate: Date | null;
  /** When the order was PLACED — a true instant, distinct from `shipByDate`. */
  orderDate: Date | null;
  /** Decimal string (matches `orders.sale_amount` numeric), or null. */
  saleAmount: string | null;
  /** Price of ONE unit, decimal string (→ `orders.unit_price`); null when the source has
   *  no single unit price (a multi-item order, an order total). */
  unitPrice: string | null;
  /** ISO currency code, or null when the SOURCE DOES NOT CARRY ONE. */
  currency: string | null;
}

/** One order after its lines are folded together — the unit the writer upserts. */
interface CanonicalOrder extends CanonicalOrderLine {
  lineCount: number;
}

/** Trim, coerce null/undefined to `''`. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Parse a source money cell into a decimal string. */
export function parseSaleAmount(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const stripped = raw.replace(/[^0-9.-]/g, '');
  if (!/\d/.test(stripped)) return null;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

/** Fold `CanonicalOrderLine[]` into one `CanonicalOrder` per `externalOrderId`. */
export function groupCanonicalOrderLines(lines: CanonicalOrderLine[]): CanonicalOrder[] {
  const byOrderId = new Map<string, CanonicalOrder>();

  for (const line of lines) {
    const orderId = cleanText(line.externalOrderId);
    if (!orderId) continue;

    const existing = byOrderId.get(orderId);
    const trackings = existing ? [...existing.trackings] : [];
    for (const tracking of line.trackings) {
      const clean = cleanText(tracking);
      if (clean && !trackings.includes(clean)) trackings.push(clean);
    }

    // Last line wins the scalars; trackings accumulate across all of them. A
    // folded multi-line order has no single unit price.
    const lineCount = (existing?.lineCount ?? 0) + 1;
    byOrderId.set(orderId, {
      ...line,
      externalOrderId: orderId,
      trackings,
      unitPrice: lineCount > 1 ? null : line.unitPrice,
      lineCount,
    });
  }

  return Array.from(byOrderId.values());
}

/** Resolve a SPREADSHEET ship-by cell to the END of that warehouse civil day. */
export function resolveSpreadsheetShipByDate(rawShipByDate: unknown): Date | null {
  const raw = cleanText(rawShipByDate);
  if (!raw) return null;
  const dateKey = toPSTDateKey(raw);
  if (!dateKey) return null;
  // An unparseable civil key yields no bounds — treat it as unknown, not today.
  const bounds = warehouseDayUtcBounds(dateKey);
  return bounds ? new Date(bounds.endIso) : null;
}

/** FIRST-WRITE-WINS for an order line's price — operator ruling 2026-09-15: */
export function resolveSaleAmountWrite(
  incoming: string | null,
  existing: string | null | undefined,
): string | null {
  if (incoming == null) return null;
  // `existing` is the NUMERIC column read back as a string; blank/null means
  // never priced. A present '0.00' IS a price (a genuinely free order) and
  // must block the write just like any other value.
  if (existing != null && String(existing).trim() !== '') return null;
  return incoming;
}

/**
 * Per-unit price from a LINE total over its quantity: total ÷ quantity, to the
 * cent, when the quantity is a positive whole number; else null (no honest unit
 * price). Mirrors the orders.unit_price backfill in
 * 2026-10-06_records_line_tracking_unit_price.sql.
 */
export function unitPriceFromLineTotal(
  lineTotal: number | string | null | undefined,
  quantity: number | string | null | undefined,
): string | null {
  if (lineTotal == null || String(lineTotal).trim() === '') return null;
  const total = Number(lineTotal);
  const qtyText = String(quantity ?? '').trim();
  if (!Number.isFinite(total) || !/^[1-9][0-9]{0,8}$/.test(qtyText)) return null;
  return (Math.round(Math.round(total * 100) / Number(qtyText)) / 100).toFixed(2);
}
