/**
 * ChatPrint goldens' DB side: a read-back of the `document_print_jobs` rows
 * written for the golden orders since the run began. The eval has no print
 * station — the chat only raises the print card — so it must stay 0.
 */

import { Pool } from 'pg';

export async function countPrintRowsSince(orgId: string, orderIds: number[], since: Date): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_print_jobs
        WHERE organization_id = $1 AND order_id = ANY($2::int[]) AND created_at >= $3`,
      [orgId, orderIds, since],
    );
    return rows[0]?.n ?? 0;
  } finally {
    await pool.end();
  }
}
