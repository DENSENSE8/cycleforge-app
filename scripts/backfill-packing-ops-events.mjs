#!/usr/bin/env node
/**
 * Audit/backfill canonical ops_events coverage for legacy packer_logs.
 *
 * Read-only by default. Historical completed pack rows are never mutated; the
 * optional apply mode appends one deterministic, idempotent event when no
 * equivalent canonical event exists.
 *
 *   node scripts/backfill-packing-ops-events.mjs
 *   node scripts/backfill-packing-ops-events.mjs --org=<uuid>
 *   node scripts/backfill-packing-ops-events.mjs --apply --org=<uuid>
 */

import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: path.resolve('.env'), quiet: true });
loadEnv({ path: path.resolve('.env.local'), override: false, quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const orgArg = args.find((arg) => arg.startsWith('--org='));
const ONLY_ORG = orgArg?.slice('--org='.length) || null;
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
});

const FIND_SQL = `
  SELECT pl.id,
         pl.organization_id,
         pl.shipment_id,
         pl.scan_ref,
         pl.tracking_type,
         pl.packed_by,
         pl.created_at,
         CASE WHEN pl.tracking_type = 'ORDERS'
              THEN 'pack_completed'
              ELSE 'pack_scan_recorded'
          END AS event_type
    FROM packer_logs pl
   WHERE pl.completion_state = 'COMPLETED'
     AND NOT EXISTS (
       SELECT 1
         FROM ops_events oe
        WHERE oe.organization_id = pl.organization_id
          AND oe.entity_type = 'other'
          AND oe.entity_id = pl.id
          AND oe.event_type = CASE WHEN pl.tracking_type = 'ORDERS'
                                   THEN 'pack_completed'
                                   ELSE 'pack_scan_recorded'
                               END
     )
     ${ONLY_ORG ? 'AND pl.organization_id = $1::uuid' : ''}
   ORDER BY pl.organization_id, pl.id`;

async function main() {
  const { rows } = await pool.query(FIND_SQL, ONLY_ORG ? [ONLY_ORG] : []);
  const byOrg = new Map();
  for (const row of rows) {
    const entries = byOrg.get(row.organization_id) ?? [];
    entries.push(row);
    byOrg.set(row.organization_id, entries);
  }

  console.log(`Mode: ${APPLY ? 'APPLY (append-only writes)' : 'DRY RUN (no writes)'}`);
  console.log(`Missing packing ops events: ${rows.length} across ${byOrg.size} org(s)`);

  let inserted = 0;
  for (const [orgId, entries] of byOrg) {
    const completed = entries.filter((row) => row.event_type === 'pack_completed').length;
    const scans = entries.length - completed;
    console.log(`  org ${orgId}: ${entries.length} missing (${completed} completed, ${scans} non-order scans)`);
    if (!APPLY) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
      for (const row of entries) {
        const result = await client.query(
          `INSERT INTO ops_events (
             organization_id, occurred_at, event_type, entity_type, entity_id,
             actor_staff_id, client_event_id, workflow_node_id, payload
           ) VALUES (
             $1::uuid, $2, $3, 'other', $4::bigint,
             $5, $6, NULL, $7::jsonb
           )
           ON CONFLICT (client_event_id) DO NOTHING
           RETURNING id`,
          [
            orgId,
            row.created_at,
            row.event_type,
            row.id,
            row.packed_by ?? null,
            `backfill:${row.event_type}:packer_log:${row.id}`,
            JSON.stringify({
              backfill: true,
              source: 'packer_logs',
              packerLogId: row.id,
              shipmentId: row.shipment_id ?? null,
              scanRef: row.scan_ref ?? null,
              trackingType: row.tracking_type,
              completionState: 'COMPLETED',
            }),
          ],
        );
        inserted += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  if (APPLY) console.log(`Applied ${inserted} idempotent event(s).`);
  else console.log('Dry run complete. Re-run with --apply after reviewing counts.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
