/**
 * The PO ↔ order link goldens' DB side (PoOrderLink): read the
 * `receiving_order_link` edges an existing PO carries, and remove what the
 * run wrote — the run's edge to its order and the run's link agent mutations —
 * leaving the PO's own links untouched.
 */

import { Pool } from 'pg';

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

/** The PO's `fulfills` edges, by order number. */
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

/** The run's edge PO → order and the run's link mutations on the PO (idempotent). */
export function cleanupPoLink(orgId: string, poNumber: string, orderNumber: string, since: Date): Promise<void> {
  return withDb(async (q) => {
    await q(
      `DELETE FROM receiving_order_link
        WHERE organization_id = $1 AND UPPER(po_number) = UPPER($2) AND UPPER(external_order_id) = UPPER($3)`,
      [orgId, poNumber, orderNumber],
    );
    await q(
      `DELETE FROM agent_mutations
        WHERE organization_id = $1 AND mutation_kind = 'receiving.link_order'
          AND UPPER(payload->'po'->>'poNumber') = UPPER($2) AND created_at >= $3`,
      [orgId, poNumber, since],
    );
  });
}

/** What the run left behind: its edge to the order plus its link mutations. */
export function poLinkLeftovers(orgId: string, poNumber: string, orderNumber: string, since: Date): Promise<number> {
  return withDb(async (q) => {
    const [row] = await q<{ n: number }>(
      `SELECT (SELECT count(*) FROM receiving_order_link
                WHERE organization_id = $1 AND UPPER(po_number) = UPPER($2) AND UPPER(external_order_id) = UPPER($3))
            + (SELECT count(*) FROM agent_mutations
                WHERE organization_id = $1 AND mutation_kind = 'receiving.link_order'
                  AND UPPER(payload->'po'->>'poNumber') = UPPER($2) AND created_at >= $4)::int AS n`,
      [orgId, poNumber, orderNumber, since],
    );
    return Number(row?.n ?? 0);
  });
}
