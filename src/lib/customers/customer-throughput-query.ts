import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  customerFullName,
  customerPhone,
  customerPlace,
  type CustomerRecord,
} from './customer-display';
import type {
  CustomerDirectoryEntry,
  CustomerOrderHistoryEntry,
  CustomerOrderLine,
} from './customer-throughput';

interface DirectoryRow extends CustomerRecord {
  order_count: number | string | null;
  first_order_at: Date | string | null;
  last_order_at: Date | string | null;
  platforms: unknown;
  recent_order: CustomerDirectoryEntry['recentOrder'];
}

interface HistoryRow {
  order_ref: string | null;
  primary_order_id: number | string;
  placed_at: Date | string | null;
  status: string | null;
  platform: string | null;
  total_amount: number | string | null;
  currency: string | null;
  items: CustomerOrderLine[] | null;
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

/** Recent buyers first. An empty query is the customer book; a query narrows it. */
export async function listCustomerDirectory(
  orgId: OrgId,
  input: { query?: string; limit?: number } = {},
): Promise<CustomerDirectoryEntry[]> {
  const query = String(input.query ?? '').trim();
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 50));
  const { rows } = await tenantQuery<DirectoryRow>(
    orgId,
    `WITH order_rollup AS (
       SELECT o.customer_id,
              COUNT(DISTINCT COALESCE(NULLIF(BTRIM(o.order_id), ''), 'row:' || o.id))::int AS order_count,
              MIN(COALESCE(o.order_date, o.created_at)) AS first_order_at,
              MAX(COALESCE(o.order_date, o.created_at)) AS last_order_at,
              ARRAY_AGG(DISTINCT LOWER(BTRIM(o.account_source)))
                FILTER (WHERE NULLIF(BTRIM(o.account_source), '') IS NOT NULL) AS platforms
         FROM orders o
        WHERE o.organization_id = $1
          AND o.customer_id IS NOT NULL
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled')
        GROUP BY o.customer_id
     )
     SELECT c.*,
            COALESCE(r.order_count, 0)::int AS order_count,
            r.first_order_at,
            r.last_order_at,
            COALESCE(r.platforms, ARRAY[]::text[]) AS platforms,
            CASE WHEN latest.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', latest.id,
              'orderRef', latest.order_id,
              'productTitle', latest.product_title,
              'status', latest.status,
              'platform', latest.account_source,
              'placedAt', latest.placed_at
            ) END AS recent_order
       FROM customers c
       LEFT JOIN order_rollup r ON r.customer_id = c.id
       LEFT JOIN LATERAL (
         SELECT o.id, o.order_id, o.product_title, o.status, o.account_source,
                COALESCE(o.order_date, o.created_at) AS placed_at
           FROM orders o
          WHERE o.organization_id = c.organization_id
            AND o.customer_id = c.id
            AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled')
          ORDER BY COALESCE(o.order_date, o.created_at) DESC NULLS LAST, o.id DESC
          LIMIT 1
       ) latest ON TRUE
      WHERE c.organization_id = $1
        AND (
          $2::text = ''
          OR COALESCE(NULLIF(BTRIM(c.display_name), ''), NULLIF(BTRIM(c.customer_name), ''), '') ILIKE '%' || $2 || '%'
          OR BTRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || $2 || '%'
          OR COALESCE(c.email, '') ILIKE '%' || $2 || '%'
          OR COALESCE(c.phone, '') ILIKE '%' || $2 || '%'
          OR COALESCE(c.mobile, '') ILIKE '%' || $2 || '%'
        )
      ORDER BY r.last_order_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id DESC
      LIMIT $3`,
    [orgId, query, limit],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: customerFullName(row) || 'Unnamed customer',
    phone: customerPhone(row) || null,
    email: String(row.email ?? '').trim() || null,
    place: customerPlace(row) || null,
    orderCount: Number(row.order_count) || 0,
    firstOrderAt: iso(row.first_order_at),
    lastOrderAt: iso(row.last_order_at),
    platforms: stringArray(row.platforms),
    recentOrder: row.recent_order
      ? { ...row.recent_order, id: Number(row.recent_order.id), placedAt: iso(row.recent_order.placedAt) }
      : null,
  }));
}

/** Complete order grain for one customer: one order with all of its line items. */
export async function listCustomerOrderHistory(
  orgId: OrgId,
  customerId: number,
): Promise<CustomerOrderHistoryEntry[]> {
  const { rows } = await tenantQuery<HistoryRow>(
    orgId,
    `WITH lines AS (
       SELECT o.id,
              COALESCE(NULLIF(BTRIM(o.order_id), ''), 'row:' || o.id) AS order_key,
              NULLIF(BTRIM(o.order_id), '') AS order_ref,
              COALESCE(o.order_date, o.created_at) AS placed_at,
              NULLIF(BTRIM(o.status), '') AS status,
              NULLIF(BTRIM(o.account_source), '') AS platform,
              COALESCE(NULLIF(BTRIM(o.product_title), ''), NULLIF(BTRIM(o.sku), '')) AS title,
              NULLIF(BTRIM(o.sku), '') AS sku,
              NULLIF(BTRIM(o.item_number), '') AS item_number,
              NULLIF(BTRIM(o.condition), '') AS condition,
              CASE
                WHEN BTRIM(COALESCE(o.quantity, '')) ~ '^[0-9]+([.][0-9]+)?$'
                  THEN o.quantity::numeric
                ELSE 1
              END AS quantity,
              o.sale_amount,
              NULLIF(UPPER(BTRIM(o.currency)), '') AS currency
         FROM orders o
        WHERE o.organization_id = $1
          AND o.customer_id = $2
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled')
     )
     SELECT order_key,
            MIN(id)::int AS primary_order_id,
            (ARRAY_AGG(order_ref ORDER BY placed_at DESC NULLS LAST, id DESC))[1] AS order_ref,
            MAX(placed_at) AS placed_at,
            (ARRAY_AGG(status ORDER BY placed_at DESC NULLS LAST, id DESC))[1] AS status,
            (ARRAY_AGG(platform ORDER BY placed_at DESC NULLS LAST, id DESC))[1] AS platform,
            SUM(sale_amount) AS total_amount,
            (ARRAY_AGG(currency ORDER BY placed_at DESC NULLS LAST, id DESC)
              FILTER (WHERE currency IS NOT NULL))[1] AS currency,
            JSONB_AGG(jsonb_build_object(
              'id', id,
              'title', title,
              'sku', sku,
              'itemNumber', item_number,
              'condition', condition,
              'quantity', quantity,
              'amount', sale_amount,
              'currency', currency
            ) ORDER BY id) AS items
       FROM lines
      GROUP BY order_key
      ORDER BY MAX(placed_at) DESC NULLS LAST, MIN(id) DESC`,
    [orgId, customerId],
  );

  return rows.map((row) => ({
    orderRef: row.order_ref,
    primaryOrderId: Number(row.primary_order_id),
    placedAt: iso(row.placed_at),
    status: row.status,
    platform: row.platform,
    totalAmount: row.total_amount == null || !Number.isFinite(Number(row.total_amount)) ? null : Number(row.total_amount),
    currency: row.currency,
    items: (row.items ?? []).map((item) => ({
      ...item,
      id: Number(item.id),
      quantity: Number(item.quantity) || 0,
      amount: item.amount == null || !Number.isFinite(Number(item.amount)) ? null : Number(item.amount),
    })),
  }));
}
