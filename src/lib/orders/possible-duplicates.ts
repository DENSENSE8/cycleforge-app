/**
 * Possible duplicate orders — the same buyer ordering the same SKU again within
 * a short window. Pure: the SQL text, its params, and the reading of the rows.
 * The query runner is `possible-duplicates-query.ts`.
 */

import { placedElseImportedSql } from '@/lib/orders/order-dates';

export const DUPLICATE_WINDOW_DEFAULT_DAYS = 30;
export const DUPLICATE_WINDOW_MAX_DAYS = 365;
const DUPLICATE_MATCH_LIMIT = 20;
const DAY_MS = 86_400_000;

export interface PossibleDuplicateMatch {
  orderRowId: number;
  orderNumber: string;
  /** ISO timestamp of the other order (`order_date`, else `created_at`). */
  orderDate: string | null;
  sku: string;
  quantity: string | null;
}

/** `?days=` → a whole number of days in 1..365; anything else is the 30-day default. */
export function parseDuplicateWindowDays(raw: string | null | undefined): number {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text)) return DUPLICATE_WINDOW_DEFAULT_DAYS;
  const days = Number(text);
  if (days < 1) return DUPLICATE_WINDOW_DEFAULT_DAYS;
  return Math.min(days, DUPLICATE_WINDOW_MAX_DAYS);
}

/**
 * The SKU key two lines are compared on: the catalog SKU when the line is
 * catalog-linked, else the raw line SKU — trimmed and upper-cased so a channel
 * that sends `abc-1 ` still meets the catalog's `ABC-1`. '' means "no SKU".
 */
export function duplicateSkuKey(catalogSku: string | null | undefined, lineSku: string | null | undefined): string {
  const sku = catalogSku != null ? catalogSku : lineSku;
  return String(sku ?? '').trim().toUpperCase();
}

/** The SQL twin of {@link duplicateSkuKey}; CASE (not COALESCE) so the planner can still use an index under forced RLS. */
function skuKeySql(catalog: string, line: string): string {
  return `UPPER(BTRIM(CASE WHEN ${catalog}.sku IS NOT NULL THEN ${catalog}.sku ELSE ${line}.sku END))`;
}

/**
 * Other orders (a different order number) by the same customer, carrying a SKU
 * key any line of this order carries, placed within `days` either side of this
 * order, not cancelled. An order with no customer or no SKU matches nothing.
 */
export function buildPossibleDuplicatesSql(
  orgId: string,
  orderRowId: number,
  days: number,
): { text: string; values: [string, number, number] } {
  const text = `
    WITH cur AS (
      SELECT o.id, o.order_id, o.customer_id, ${placedElseImportedSql('o')} AS placed_at
        FROM orders o
       WHERE o.id = $2 AND o.organization_id = $1
    ),
    cur_keys AS (
      SELECT DISTINCT ${skuKeySql('sc', 'o')} AS sku_key
        FROM cur
        JOIN orders o
          ON o.organization_id = $1
         AND (o.id = cur.id OR (NULLIF(BTRIM(cur.order_id), '') IS NOT NULL AND o.order_id = cur.order_id))
        LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
    )
    SELECT cur.placed_at AS this_order_date,
           o.id AS order_row_id,
           o.order_id AS order_number,
           ${placedElseImportedSql('o')} AS order_date,
           sc.sku AS catalog_sku,
           o.sku AS line_sku,
           o.quantity
      FROM cur
      JOIN orders o
        ON o.organization_id = $1
       AND o.customer_id = cur.customer_id
      LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
     WHERE cur.customer_id IS NOT NULL
       AND o.id <> cur.id
       AND NULLIF(BTRIM(o.order_id), '') IS NOT NULL
       AND o.order_id IS DISTINCT FROM cur.order_id
       AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled')
       AND ${placedElseImportedSql('o')}
           BETWEEN cur.placed_at - make_interval(days => $3::int)
               AND cur.placed_at + make_interval(days => $3::int)
       AND ${skuKeySql('sc', 'o')} IN (SELECT sku_key FROM cur_keys WHERE sku_key <> '')
     ORDER BY ${placedElseImportedSql('o')} DESC, o.id DESC
     LIMIT ${DUPLICATE_MATCH_LIMIT}`;
  return { text, values: [orgId, orderRowId, days] };
}

export interface PossibleDuplicateRow {
  order_row_id: number | string;
  order_number: string | null;
  order_date: Date | string | null;
  this_order_date?: Date | string | null;
  catalog_sku: string | null;
  line_sku: string | null;
  quantity: string | null;
}

export function mapPossibleDuplicateRow(row: PossibleDuplicateRow): PossibleDuplicateMatch {
  const date = row.order_date == null ? null : new Date(row.order_date);
  return {
    orderRowId: Number(row.order_row_id),
    orderNumber: String(row.order_number ?? '').trim(),
    orderDate: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    sku: duplicateSkuKey(row.catalog_sku, row.line_sku),
    quantity: row.quantity == null ? null : String(row.quantity).trim() || null,
  };
}

/**
 * Whole calendar days from `thisOrderAt` back to `otherOrderAt`, compared on
 * UTC dates: positive = the other order came earlier, negative = later, 0 =
 * the same day. Null when either date is unreadable.
 */
export function daysBetweenOrders(thisOrderAt: string | null | undefined, otherOrderAt: string | null | undefined): number | null {
  const a = thisOrderAt ? Date.parse(thisOrderAt) : Number.NaN;
  const b = otherOrderAt ? Date.parse(otherOrderAt) : Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((Math.floor(a / DAY_MS) * DAY_MS - Math.floor(b / DAY_MS) * DAY_MS) / DAY_MS);
}

/** The banner's lead sentence for the nearest match. */
export function duplicateLeadCopy(days: number | null): string {
  if (days == null) return 'Same buyer ordered this SKU recently';
  if (days === 0) return 'Same buyer ordered this SKU the same day';
  const n = Math.abs(days);
  const unit = n === 1 ? 'day' : 'days';
  return days > 0
    ? `Same buyer ordered this SKU ${n} ${unit} ago`
    : `Same buyer ordered this SKU again ${n} ${unit} later`;
}

/** One entry per other order number (a multi-line order matches once), nearest to this order first. */
export function groupDuplicateOrders(
  matches: readonly PossibleDuplicateMatch[],
  thisOrderAt: string | null | undefined,
): Array<PossibleDuplicateMatch & { days: number | null }> {
  const byNumber = new Map<string, PossibleDuplicateMatch & { days: number | null }>();
  for (const match of matches) {
    const key = match.orderNumber || `#${match.orderRowId}`;
    if (byNumber.has(key)) continue;
    byNumber.set(key, { ...match, days: daysBetweenOrders(thisOrderAt, match.orderDate) });
  }
  return [...byNumber.values()].sort(
    (x, y) => Math.abs(x.days ?? Number.MAX_SAFE_INTEGER) - Math.abs(y.days ?? Number.MAX_SAFE_INTEGER),
  );
}
