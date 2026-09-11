/**
 * Counter visits as Sales-board history rows.
 *
 * Callers: GET /api/walk-in/sales.
 * Affected API: /api/walk-in/sales.
 * Data schemas: SaleRow (id `ct-{visitId}`).
 * User: "I must be able to view the sales record on the slot data table in the sales board under the sales page as an overall history"
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SaleRow } from '@/lib/walk-in/transactions';

interface CounterSaleSqlRow {
  id: string;
  customer_name: string | null;
  total: number | null;
  status: string;
  created_at: string;
  staged_square_order_id: string | null;
}

export async function listCounterSalesAsSaleRows(
  orgId: OrgId,
  limit: number,
  existingSquareOrderIds: ReadonlySet<string>,
): Promise<SaleRow[]> {
  const res = await tenantQuery<CounterSaleSqlRow>(
    orgId,
    `SELECT ct.id::text AS id,
            COALESCE(
              NULLIF(c.display_name, ''),
              NULLIF(c.customer_name, ''),
              'Walk-in'
            ) AS customer_name,
            ct.total_cents AS total,
            ct.status,
            ct.created_at::text AS created_at,
            ct.staged_square_order_id
       FROM counter_transactions ct
       LEFT JOIN customers c
         ON c.id = ct.customer_id AND c.organization_id = ct.organization_id
      WHERE ct.organization_id = $1
      ORDER BY ct.created_at DESC
      LIMIT $2`,
    [orgId, limit],
  );

  return res.rows
    .filter((row) => {
      const staged = row.staged_square_order_id?.trim();
      return !staged || !existingSquareOrderIds.has(staged);
    })
    .map((row) => ({
      id: `ct-${row.id}`,
      customer_name: row.customer_name,
      total: row.total,
      status: row.status,
      order_source: 'walk_in_sale',
      created_at: row.created_at,
      line_items: [{ name: `Visit ${row.id}`, quantity: '1' }],
    }));
}
