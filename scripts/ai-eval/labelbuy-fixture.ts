/**
 * LabelBuyChat goldens' DB side: the order they quote / buy / void against
 * (read-only discovery), what a confirmed buy or void left behind, and the
 * cleanup that puts the order back exactly (ledger rows, label + slip
 * documents, the tracking link, this run's label mutations).
 */

import { Pool } from 'pg';

type Q = <R>(sql: string, params: unknown[]) => Promise<R[]>;

async function withDb<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

/**
 * A one-row, not-yet-shipped order with a stored customer ship-to, no parcel
 * weight, no tracking, no documents, never bought against — so the quote
 * asks for the weight and a buy (sandbox only) has nothing to collide with.
 */
export const LABEL_ORDER_SQL = `
  SELECT o.order_id AS "orderNumber", o.id
    FROM orders o
    JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
   WHERE o.organization_id = $1 AND o.order_id IS NOT NULL AND o.shipment_id IS NULL AND o.parcel_weight_oz IS NULL
     AND COALESCE(o.status, '') <> 'shipped'
     AND NULLIF(c.shipping_address_1, '') IS NOT NULL AND NULLIF(c.shipping_city, '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM shipping_label_purchases p WHERE p.organization_id = o.organization_id AND p.order_id = o.id)
     AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.organization_id = o.organization_id AND d.entity_type = 'ORDER' AND d.entity_id = o.id)
     AND (SELECT count(*) FROM orders o2 WHERE o2.organization_id = o.organization_id AND o2.order_id = o.order_id) = 1
   ORDER BY o.id DESC
   LIMIT 1`;

export interface LabelBuyFixture {
  id: number;
  orderNumber: string;
}

export interface LabelState {
  purchases: Array<{ status: string; is_test: boolean; tracking_number: string | null; label_document_id: number | null }>;
  orderTracking: string | null;
  labelDocs: number;
}

export function readLabelState(orgId: string, orderId: number, since: Date): Promise<LabelState> {
  return withDb(async (q) => ({
    purchases: await q(
      `SELECT status, is_test, tracking_number, label_document_id FROM shipping_label_purchases
        WHERE organization_id = $1 AND order_id = $2 AND created_at >= $3 ORDER BY id`,
      [orgId, orderId, since],
    ),
    orderTracking:
      (await q<{ t: string | null }>(
        `SELECT stn.tracking_number_raw AS t FROM orders o LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
          WHERE o.organization_id = $1 AND o.id = $2`,
        [orgId, orderId],
      ))[0]?.t ?? null,
    labelDocs: Number(
      (await q<{ n: string }>(
        `SELECT count(*) n FROM documents WHERE organization_id = $1 AND entity_type = 'ORDER' AND entity_id = $2 AND document_type = 'shipping_label'`,
        [orgId, orderId],
      ))[0].n,
    ),
  }));
}

/** Put the order back: this run's purchases, their documents + tracking, and the label mutations. */
export function cleanupLabelWrites(orgId: string, orderId: number, since: Date): Promise<void> {
  return withDb(async (q) => {
    const rows = await q<{ shipment_id: number | null; client_event_id: string }>(
      `SELECT shipment_id, client_event_id FROM shipping_label_purchases WHERE organization_id = $1 AND order_id = $2 AND created_at >= $3`,
      [orgId, orderId, since],
    );
    const hashes = rows.flatMap((r) => [r.client_event_id, `${r.client_event_id}:slip`]);
    if (hashes.length > 0) {
      await q(`DELETE FROM document_entity_links WHERE organization_id = $1 AND document_id IN (SELECT id FROM documents WHERE organization_id = $1 AND document_data->>'sourceHash' = ANY($2::text[]))`, [orgId, hashes]).catch(() => {});
      await q(`DELETE FROM documents WHERE organization_id = $1 AND document_data->>'sourceHash' = ANY($2::text[])`, [orgId, hashes]);
    }
    await q(`UPDATE orders SET shipment_id = NULL WHERE organization_id = $1 AND id = $2`, [orgId, orderId]);
    const stn = rows.map((r) => r.shipment_id).filter((id): id is number => id != null);
    if (stn.length > 0) {
      await q(`DELETE FROM shipment_links WHERE organization_id = $1 AND shipment_id = ANY($2::bigint[])`, [orgId, stn]);
      await q(`DELETE FROM shipping_tracking_numbers WHERE organization_id = $1 AND id = ANY($2::bigint[])`, [orgId, stn]).catch(() => {});
    }
    await q(`DELETE FROM shipping_label_purchases WHERE organization_id = $1 AND order_id = $2 AND created_at >= $3`, [orgId, orderId, since]);
    await q(
      `DELETE FROM agent_mutations WHERE organization_id = $1 AND created_at >= $2 AND mutation_kind IN ('shipping.buy_label', 'shipping.void_label')`,
      [orgId, since],
    );
  });
}

/** This run's label mutations by status (proposed / applied). */
export function countLabelMutations(orgId: string, kind: 'shipping.buy_label' | 'shipping.void_label', since: Date, status: string): Promise<number> {
  return withDb(async (q) =>
    Number((await q<{ n: string }>(`SELECT count(*) n FROM agent_mutations WHERE organization_id = $1 AND mutation_kind = $2 AND created_at >= $3 AND status = $4`, [orgId, kind, since, status]))[0].n),
  );
}
