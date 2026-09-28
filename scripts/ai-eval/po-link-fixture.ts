/**
 * The PO ↔ order link goldens' DB side (PoOrderLink): read the
 * `receiving_order_link` edges a run's PO carries, and remove everything the
 * run wrote — the edges, the link agent mutations, the imported PO
 * (`cleanupImportedPo`) and its inbound_order header + ingest ledger rows.
 */

import { Pool } from 'pg';
import { cleanupImportedPo } from './po-import-fixture';

async function withDb<T>(fn: (q: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    return await fn(async (sql, params) => (await pool.query(sql, params)).rows);
  } finally {
    await pool.end();
  }
}

export interface PoLinkRow {
  external_order_id: string;
  local_order_id: number | null;
  receiving_id: number | null;
  inbound_order_id: number | null;
  source: string;
}

/** The run PO's `fulfills` edges, by order number. */
export function readPoLinks(orgId: string, poNumber: string): Promise<PoLinkRow[]> {
  return withDb((q) =>
    q<PoLinkRow>(
      `SELECT external_order_id, local_order_id, receiving_id, inbound_order_id, source
         FROM receiving_order_link
        WHERE organization_id = $1 AND relation = 'fulfills' AND UPPER(po_number) = UPPER($2)
        ORDER BY external_order_id`,
      [orgId, poNumber],
    ),
  );
}

/** What the order record's side reads (the timeline's `poLinks`) for one order number. */
export function readOrderSidePos(orgId: string, orderNumber: string): Promise<string[]> {
  return withDb(async (q) => {
    const rows = await q<{ po_number: string }>(
      `SELECT DISTINCT l.po_number
         FROM orders o
         JOIN receiving_order_link l ON l.organization_id = o.organization_id AND l.relation = 'fulfills'
          AND (l.local_order_id = o.id OR UPPER(l.external_order_id) = UPPER(o.order_id))
        WHERE o.organization_id = $1 AND o.order_id = $2`,
      [orgId, orderNumber],
    );
    return rows.map((r) => r.po_number);
  });
}

/** Everything the run wrote for this PO (idempotent). */
export async function cleanupPoLink(orgId: string, poNumber: string, tracking: string): Promise<void> {
  await withDb(async (q) => {
    await q(`DELETE FROM receiving_order_link WHERE organization_id = $1 AND UPPER(po_number) = UPPER($2)`, [orgId, poNumber]);
    await q(
      `DELETE FROM agent_mutations WHERE organization_id = $1 AND mutation_kind = 'receiving.link_order' AND UPPER(payload->'po'->>'poNumber') = UPPER($2)`,
      [orgId, poNumber],
    );
  });
  await cleanupImportedPo(orgId, poNumber, tracking);
}

/** True when nothing of the run's PO is left. */
export function poLinkLeftovers(orgId: string, poNumber: string): Promise<number> {
  return withDb(async (q) => {
    const [row] = await q<{ n: number }>(
      `SELECT (SELECT count(*) FROM receiving_order_link WHERE organization_id = $1 AND UPPER(po_number) = UPPER($2))
            + (SELECT count(*) FROM inbound_order WHERE organization_id = $1 AND external_order_id_norm = inbound_order_number_norm($2))
            + (SELECT count(*) FROM inbound_purchase_order_links WHERE organization_id = $1 AND source_order_id = $2)
            + (SELECT count(*) FROM agent_mutations WHERE organization_id = $1
                 AND ((mutation_kind = 'receiving.link_order' AND UPPER(payload->'po'->>'poNumber') = UPPER($2))
                   OR (mutation_kind = 'receiving.import_po' AND payload->'draft'->>'poNumber' = $2)))::int AS n`,
      [orgId, poNumber],
    );
    return Number(row?.n ?? 0);
  });
}
