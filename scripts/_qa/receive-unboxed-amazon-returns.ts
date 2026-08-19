/**
 * Local-receive Amazon return lines that already sit on Unbox-opened cartons
 * (imported onto previously unfound packages). Leaves Incoming; marks received.
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
if (process.env.OPS_ENV_FILE) {
  config({ path: process.env.OPS_ENV_FILE, override: true });
}

import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { receiveImportedLineIfCartonUnboxed } from '@/lib/inbound/receive-if-carton-unboxed';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import pool from '@/lib/db';

const ORG = DOGFOOD_ORG_ID;

async function main() {
  const pending = await tenantQuery<{ id: number }>(
    ORG,
    `SELECT rl.id
       FROM receiving_line rl
       JOIN receiving_carton rc
         ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rc.id AND ru.organization_id = rc.organization_id
      WHERE rl.organization_id = $1::uuid
        AND rl.inbound_source_type = 'amazon'
        AND UPPER(COALESCE(rl.receiving_type, '')) = 'RETURN'
        AND (
          ru.unboxed_at IS NOT NULL
          OR ru.opened_at IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM receiving_scans rs
             WHERE rs.receiving_id = rc.id
               AND rs.intake_surface = 'unbox'
          )
        )
        AND (
          COALESCE(rl.quantity_received, 0) = 0
          OR rl.workflow_status::text IN ('EXPECTED', 'ARRIVED', 'MATCHED')
        )
      ORDER BY rl.id`,
    [ORG],
  );

  let received = 0;
  let skipped = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const row of pending.rows) {
    try {
      const hit = await receiveImportedLineIfCartonUnboxed(ORG, Number(row.id));
      if (hit?.received) received += 1;
      else skipped += 1;
    } catch (err) {
      errors.push({
        id: Number(row.id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await invalidateReceivingViews(ORG).catch(() => {});

  console.log(JSON.stringify({
    candidates: pending.rows.length,
    received,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 12),
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
