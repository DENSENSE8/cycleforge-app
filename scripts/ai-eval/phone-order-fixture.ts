/**
 * The phone-order golden's DB side (OrderDraftChat): read back the order the
 * confirmation created — by the run's unique caller name — and remove it
 * (orders, their work assignments and feed rows, the customer) so the eval
 * leaves nothing behind.
 */

import { Pool } from 'pg';

export interface CreatedPhoneOrderRow {
  order_id: string;
  sku: string;
  quantity: string;
  sale_amount: string | null;
  release_state: string | null;
  account_source: string;
  deadline: string | null;
}

async function withDb<T>(fn: (q: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

/** The created rows (line order), then everything the create wrote is deleted. */
export function takeCreatedPhoneOrder(orgId: string, customerName: string): Promise<CreatedPhoneOrderRow[]> {
  return withDb(async (q) => {
    const rows = await q<CreatedPhoneOrderRow & { id: number; customer_id: number }>(
      `SELECT o.id, o.customer_id, o.order_id, o.sku, o.quantity, o.sale_amount::text, o.release_state, o.account_source,
              to_char(wa.deadline_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') AS deadline
         FROM orders o
         JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
         LEFT JOIN work_assignments wa ON wa.organization_id = o.organization_id AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
        WHERE o.organization_id = $1 AND c.customer_name = $2
        ORDER BY o.id`,
      [orgId, customerName],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await q(`DELETE FROM feed_memberships WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = ANY($2::bigint[])`, [orgId, ids]);
      await q(`DELETE FROM work_assignments WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = ANY($2::int[])`, [orgId, ids]);
      await q(`DELETE FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
    }
    await q(`DELETE FROM customers WHERE organization_id = $1 AND customer_name = $2`, [orgId, customerName]);
    return rows;
  });
}
