/**
 * The any-channel order goldens' DB side (AnyChannelOrderChat): read back the
 * marketplace order the confirmation created — by the run's unique buyer name —
 * and remove everything it wrote (orders, work assignments, feed rows, the
 * shipment link and the tracking's shipment, the customer).
 */

import { Pool } from 'pg';

export interface CreatedAnyOrderRow {
  order_id: string;
  account_source: string;
  item_number: string | null;
  release_state: string | null;
  tracking: string | null;
}

async function withDb<T>(fn: (q: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

/** The created rows for this buyer (line order). */
export function readAnyOrder(orgId: string, buyerName: string): Promise<CreatedAnyOrderRow[]> {
  return withDb((q) =>
    q<CreatedAnyOrderRow>(
      `SELECT o.order_id, o.account_source, o.item_number, o.release_state, s.tracking_number_normalized AS tracking
         FROM orders o
         JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
         LEFT JOIN shipping_tracking_numbers s ON s.id = o.shipment_id AND s.organization_id = o.organization_id
        WHERE o.organization_id = $1 AND c.customer_name = $2
        ORDER BY o.id`,
      [orgId, buyerName],
    ),
  );
}

/** Delete everything the create wrote for this buyer + tracking; returns how many order rows went. */
export function cleanupAnyOrder(orgId: string, buyerName: string, tracking: string): Promise<number> {
  return withDb(async (q) => {
    const rows = await q<{ id: number; shipment_id: number | null }>(
      `SELECT o.id, o.shipment_id FROM orders o
         JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
        WHERE o.organization_id = $1 AND c.customer_name = $2`,
      [orgId, buyerName],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await q(`DELETE FROM feed_memberships WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = ANY($2::bigint[])`, [orgId, ids]);
      await q(`DELETE FROM work_assignments WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = ANY($2::int[])`, [orgId, ids]);
      await q(`DELETE FROM shipment_links WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = ANY($2::bigint[])`, [orgId, ids]);
      await q(`DELETE FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
    }
    await q(`DELETE FROM customers WHERE organization_id = $1 AND customer_name = $2`, [orgId, buyerName]);
    await q(
      `DELETE FROM shipping_tracking_numbers s WHERE s.organization_id = $1 AND s.tracking_number_normalized = $2
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.shipment_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM shipment_links l WHERE l.shipment_id = s.id)`,
      [orgId, tracking],
    );
    return ids.length;
  });
}

/** The newest order card drafted for this buyer: its Still needed list (null when no card). */
export function latestDraftMissing(orgId: string, buyerName: string): Promise<string[] | null> {
  return withDb(async (q) => {
    const rows = await q<{ missing: string[] }>(
      `SELECT a.value->'artifact'->'missing' AS missing
         FROM ai_chat_messages m
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(m.analysis->'artifacts') = 'array' THEN m.analysis->'artifacts' ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS a(value, ord)
        WHERE m.organization_id = $1 AND m.role = 'assistant'
          AND a.value->'artifact'->>'kind' = 'order_draft'
          AND a.value->>'producedBy' = 'draft_manual_order'
          AND a.value->'artifact'->'draft'->'customer'->>'name' = $2
        ORDER BY m.id DESC, a.ord DESC
        LIMIT 1`,
      [orgId, buyerName],
    );
    return rows[0]?.missing ?? null;
  });
}
