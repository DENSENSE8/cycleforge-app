/**
 * The PO-import goldens' DB side (PoImportChat): read back what the
 * confirmation imported — by the run's unique PO number — and remove every
 * row it wrote (spine lines + facts, links, mirror, carton, shipment links,
 * the registered tracking, the agent mutation) so the eval leaves nothing.
 */

import { Pool } from 'pg';

export interface ImportedPoRow {
  receiving_line_id: number;
  receiving_id: number | null;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number;
  workflow_status: string;
  receiving_type: string | null;
  carton_tracking_linked: boolean;
  mirror_vendor: string | null;
}

async function withDb<T>(fn: (q: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

/** The imported spine rows (line order) — read only; `cleanupImportedPo` removes them. */
export function readImportedPo(orgId: string, poNumber: string, tracking: string): Promise<ImportedPoRow[]> {
  return withDb(async (q) => {
    const rows = await q<ImportedPoRow>(
      `SELECT rl.id AS receiving_line_id, rl.receiving_id, rl.sku, rl.item_name, rl.quantity_expected,
              rl.workflow_status::text, rl.receiving_type,
              EXISTS (SELECT 1 FROM shipment_links sl JOIN shipping_tracking_numbers stn ON stn.id = sl.shipment_id
                       WHERE sl.organization_id = rl.organization_id AND sl.owner_type = 'RECEIVING'
                         AND sl.owner_id = rl.receiving_id AND stn.tracking_number_normalized = $3) AS carton_tracking_linked,
              (SELECT m.vendor_or_seller_name FROM inbound_purchase_order_mirror m
                WHERE m.organization_id = rl.organization_id AND m.source_type = 'manual' AND m.source_order_id = $2) AS mirror_vendor
         FROM inbound_purchase_order_links l
         JOIN receiving_line rl ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
        WHERE l.organization_id = $1 AND l.source_type = 'manual' AND l.source_order_id = $2
        ORDER BY l.source_line_item_id`,
      [orgId, poNumber, tracking],
    );
    return rows;
  });
}

/** Delete everything the import wrote (idempotent — safe when nothing was imported). */
export function cleanupImportedPo(orgId: string, poNumber: string, tracking: string): Promise<void> {
  return withDb((q) => cleanupPo(q, orgId, poNumber, tracking));
}

async function cleanupPo(
  q: <R>(sql: string, params: unknown[]) => Promise<R[]>,
  orgId: string,
  poNumber: string,
  tracking: string,
): Promise<void> {
  await q(`DELETE FROM agent_mutations WHERE organization_id = $1 AND mutation_kind = 'receiving.import_po' AND payload->'draft'->>'poNumber' = $2`, [orgId, poNumber]);
  const lines = await q<{ id: number; receiving_id: number | null }>(
    `SELECT rl.id, rl.receiving_id FROM inbound_purchase_order_links l
       JOIN receiving_line rl ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
      WHERE l.organization_id = $1 AND l.source_type = 'manual' AND l.source_order_id = $2`,
    [orgId, poNumber],
  );
  const lineIds = lines.map((l) => l.id);
  const cartons = await q<{ id: number }>(
    `SELECT id FROM receiving_carton WHERE organization_id = $1 AND source = 'manual' AND source_order_id = $2`,
    [orgId, poNumber],
  );
  const cartonIds = [...new Set([...cartons.map((c) => c.id), ...lines.map((l) => l.receiving_id).filter((v): v is number => v != null)])];
  if (lineIds.length > 0) {
    await q(`DELETE FROM inbound_purchase_order_links WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])`, [orgId, lineIds]);
    await q(`DELETE FROM receiving_line WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, lineIds]);
  }
  await q(`DELETE FROM inbound_purchase_order_mirror WHERE organization_id = $1 AND source_type = 'manual' AND source_order_id = $2`, [orgId, poNumber]);
  const shipments = await q<{ id: number }>(
    `SELECT id FROM shipping_tracking_numbers WHERE organization_id = $1 AND tracking_number_normalized = $2`,
    [orgId, tracking],
  );
  const shipmentIds = shipments.map((s) => s.id);
  if (shipmentIds.length > 0) {
    await q(`DELETE FROM shipment_links WHERE organization_id = $1 AND shipment_id = ANY($2::bigint[])`, [orgId, shipmentIds]);
  }
  if (cartonIds.length > 0) {
    await q(`DELETE FROM shipment_links WHERE organization_id = $1 AND owner_type = 'RECEIVING' AND owner_id = ANY($2::bigint[])`, [orgId, cartonIds]);
    await q(`DELETE FROM receiving_carton WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, cartonIds]);
  }
  if (shipmentIds.length > 0) {
    await q(`DELETE FROM shipping_tracking_numbers WHERE organization_id = $1 AND id = ANY($2::bigint[])`, [orgId, shipmentIds]);
  }
  // The internal PO header (`inbound_order`) and its ingest ledger rows.
  const headers = await q<{ id: number }>(
    `SELECT id FROM inbound_order WHERE organization_id = $1 AND external_order_id_norm = inbound_order_number_norm($2)`,
    [orgId, poNumber],
  );
  const headerIds = headers.map((h) => h.id);
  if (headerIds.length > 0) {
    await q(`DELETE FROM inbound_ingest_event WHERE organization_id = $1 AND inbound_order_id = ANY($2::bigint[])`, [orgId, headerIds]);
    await q(`DELETE FROM inbound_order WHERE organization_id = $1 AND id = ANY($2::bigint[])`, [orgId, headerIds]);
  }
}
