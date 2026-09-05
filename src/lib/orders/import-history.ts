/**
 * Import records, per civil day — the READ.
 *
 * Answers "what was imported on this day / in this range", scoped to the
 * caller's org. The arithmetic and the grid shaping are the pure half
 * (`./import-history-core`); this file is the one query.
 *
 * **No new table.** Every ingest path already stamps `orders.created_at` and
 * names itself in `orders.account_source`, so the provenance record exists —
 * it just had no reader. Adding an `order_imports` table would be a second,
 * drift-prone copy of facts `orders` already holds.
 *
 * The civil day is computed IN SQL (`timezone(<zone>, created_at)::date`) so
 * the grouping key the grid bands on and the predicate the rows were selected
 * by are the same expression. Deriving the day in JS from a UTC instant is how
 * a 17:30-Pacific import lands in tomorrow's band.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { ImportDayRange, ImportedOrderRecord } from './import-history-core';

/** Row cap per request. A day of imports is tens of rows; a month is hundreds. */
const IMPORT_HISTORY_MAX_ROWS = 2000;
const IMPORT_HISTORY_DEFAULT_ROWS = 500;

interface RawImportRow {
  id: number;
  order_id: string | null;
  product_title: string | null;
  sku: string | null;
  item_number: string | null;
  condition: string | null;
  quantity: string | null;
  tracking_number: string | null;
  account_source: string | null;
  created_at: string | null;
  import_day: string;
}

/**
 * Imported orders in `range`, newest first.
 *
 * `source` narrows to one channel (`account_source`) so "show me only what the
 * Google Sheet brought in" is one param rather than a client-side filter over
 * a page that may have been truncated.
 */
export async function listImportedOrders(
  orgId: OrgId,
  range: ImportDayRange,
  options: { source?: string | null; limit?: number } = {},
): Promise<{ records: ImportedOrderRecord[]; truncated: boolean }> {
  const limit = Math.min(
    Math.max(Number(options.limit) || IMPORT_HISTORY_DEFAULT_ROWS, 1),
    IMPORT_HISTORY_MAX_ROWS,
  );
  const source = options.source?.trim() || null;

  // The civil-day expression appears twice on purpose — once as the predicate,
  // once as the projected band key — so a row can never be selected by one
  // definition of "day" and grouped under another.
  const dayExpr = `timezone('${WAREHOUSE_TIME_ZONE}', o.created_at)::date`;
  const params: unknown[] = [orgId, range.from, range.to];
  let sourceFilter = '';
  if (source) {
    params.push(source);
    sourceFilter = ` AND COALESCE(o.account_source, '') = $${params.length}`;
  }
  params.push(limit + 1);
  const limitParam = `$${params.length}`;

  const res = await tenantQuery<RawImportRow>(
    orgId,
    `SELECT
        o.id,
        o.order_id,
        o.product_title,
        o.sku,
        o.item_number,
        o.condition,
        o.quantity,
        -- shipping_tracking_numbers has no tracking_number column; the raw
        -- string is the one every other reader takes (see caged-orders.ts).
        NULLIF(TRIM(COALESCE(st.tracking_number_raw, '')), '') AS tracking_number,
        o.account_source,
        o.created_at,
        to_char(${dayExpr}, 'YYYY-MM-DD') AS import_day
       FROM orders o
       LEFT JOIN shipping_tracking_numbers st ON st.id = o.shipment_id
      WHERE o.organization_id = $1
        AND o.created_at IS NOT NULL
        AND ${dayExpr} >= $2::date
        AND ${dayExpr} <= $3::date${sourceFilter}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ${limitParam}`,
    params,
  );

  const truncated = res.rows.length > limit;
  const rows = truncated ? res.rows.slice(0, limit) : res.rows;

  return {
    truncated,
    records: rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_id,
      productTitle: row.product_title,
      sku: row.sku,
      itemNumber: row.item_number,
      condition: row.condition,
      quantity: row.quantity,
      trackingNumber: row.tracking_number,
      accountSource: row.account_source,
      createdAt: row.created_at,
      importDayKey: row.import_day,
    })),
  };
}

/**
 * Distinct channels that imported anything in `range` — what the surface offers
 * as a source narrow. Derived from the data rather than from a hardcoded
 * connector list, so a channel added later shows up without a code change.
 */
export async function listImportSourcesForRange(
  orgId: OrgId,
  range: ImportDayRange,
): Promise<{ source: string; count: number }[]> {
  const dayExpr = `timezone('${WAREHOUSE_TIME_ZONE}', o.created_at)::date`;
  const res = await tenantQuery<{ source: string | null; count: string }>(
    orgId,
    `SELECT COALESCE(NULLIF(TRIM(o.account_source), ''), 'unknown') AS source,
            COUNT(*)::int AS count
       FROM orders o
      WHERE o.organization_id = $1
        AND o.created_at IS NOT NULL
        AND ${dayExpr} >= $2::date
        AND ${dayExpr} <= $3::date
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC`,
    [orgId, range.from, range.to],
  );
  return res.rows.map((row) => ({
    source: row.source ?? 'unknown',
    count: Number(row.count ?? 0),
  }));
}
