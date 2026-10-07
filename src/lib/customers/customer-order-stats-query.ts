import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { CustomerRecord } from './customer-display';
import {
  customerOrdersSearchNeedle,
  pickCustomerSpend,
  type CustomerOrderStats,
  type CustomerSpendByCurrency,
} from './customer-order-stats';
import { placedElseImportedSql } from '@/lib/orders/order-dates';

type StatsRow = Pick<CustomerRecord, 'id' | 'email' | 'display_name' | 'customer_name' | 'first_name' | 'last_name'> & {
  order_count: number;
  first_order_at: Date | null;
  last_order_at: Date | null;
  spend: CustomerSpendByCurrency[];
};

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Order count (distinct order numbers), realised spend (`orders.sale_amount`,
 * the 'sold' arm of `resolveLinePrice`) and first / last order date for one
 * customer of the org. Cancelled orders are left out. Null when the customer
 * is not in this org.
 */
export async function getCustomerOrderStats(customerId: number, orgId: OrgId): Promise<CustomerOrderStats | null> {
  const { rows } = await tenantQuery<StatsRow>(
    orgId,
    `WITH lines AS (
       SELECT COALESCE(NULLIF(BTRIM(o.order_id), ''), 'row:' || o.id) AS order_key,
              ${placedElseImportedSql('o')} AS placed_at,
              o.sale_amount,
              o.currency
         FROM orders o
        WHERE o.customer_id = $1
          AND o.organization_id = $2
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled')
     ),
     by_currency AS (
       SELECT UPPER(BTRIM(currency)) AS currency,
              SUM(sale_amount)::text AS total,
              COUNT(DISTINCT order_key)::int AS orders
         FROM lines
        WHERE sale_amount IS NOT NULL
        GROUP BY 1
     )
     SELECT c.id, c.email, c.display_name, c.customer_name, c.first_name, c.last_name,
            (SELECT COUNT(DISTINCT order_key)::int FROM lines) AS order_count,
            (SELECT MIN(placed_at) FROM lines) AS first_order_at,
            (SELECT MAX(placed_at) FROM lines) AS last_order_at,
            (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM by_currency b) AS spend
       FROM customers c
      WHERE c.id = $1 AND c.organization_id = $2
      LIMIT 1`,
    [customerId, orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const spend = pickCustomerSpend(row.spend ?? []);
  return {
    orderCount: Number(row.order_count) || 0,
    totalSpent: spend.totalSpent,
    currency: spend.currency,
    firstOrderAt: iso(row.first_order_at),
    lastOrderAt: iso(row.last_order_at),
    search: customerOrdersSearchNeedle(row),
  };
}
