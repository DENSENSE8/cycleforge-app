/**
 * One-shot: ingest Seller Central Manage Returns TSV onto Incoming + STN.
 * Reuses existing shipping_tracking_numbers rows (normalized unique).
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
if (process.env.OPS_ENV_FILE) {
  config({ path: process.env.OPS_ENV_FILE, override: true });
}

import { readFileSync } from 'node:fs';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import { deskRowFromCsvRecord } from '@/lib/inbound/desk-csv';
import { importDeskInboundRow, isDeskImportSkip } from '@/lib/inbound/desk-import';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { tenantQuery } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import pool from '@/lib/db';

const FILE = process.argv[2] || '/Users/icecube/Downloads/report-131623020681.tsv';
const ORG = DOGFOOD_ORG_ID;

async function main() {
  const text = readFileSync(FILE, 'utf8');
  const { rows } = parseCsv(text);
  if (rows.length === 0) throw new Error(`no rows in ${FILE}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ orderId: string; error: string }> = [];

  for (const record of rows) {
    const desk = deskRowFromCsvRecord(record);
    try {
      const r = await importDeskInboundRow(ORG, desk);
      if (isDeskImportSkip(r)) {
        skipped += 1;
        continue;
      }
      if (r.created) created += 1;
      else updated += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        orderId: desk.orderId || '?',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const trackings = rows
    .map((r) => extractCanonicalTracking(String(r['Tracking ID'] || r['Tracking-ID'] || '').trim()))
    .filter((t) => t.length >= 8);
  const unique = [...new Set(trackings)];

  if (unique.length > 0) {
    await tenantQuery(
      ORG,
      `UPDATE receiving_carton rc
          SET source = CASE WHEN rc.source = 'unmatched' THEN 'amazon' ELSE rc.source END,
              source_platform = COALESCE(rc.source_platform, 'amazon'),
              is_return = true,
              intake_type = 'RETURN',
              return_platform = COALESCE(rc.return_platform, 'AMZ'),
              updated_at = NOW()
         FROM shipping_tracking_numbers stn
        WHERE stn.tracking_number_normalized = ANY($2::text[])
          AND rc.organization_id = $1::uuid
          AND (rc.shipment_id = stn.id
               OR rc.id IN (
                    SELECT sl.owner_id FROM shipment_links sl
                     WHERE sl.organization_id = $1::uuid
                       AND sl.owner_type = 'RECEIVING'
                       AND sl.shipment_id = stn.id
                  ))`,
      [ORG, unique],
    );
  }

  const stn = unique.length
    ? await tenantQuery<{
        tracking: string;
        stn_id: number;
        receiving_id: number | null;
        line_id: number | null;
        sku: string | null;
        carton_source: string | null;
        is_return: boolean | null;
      }>(
        ORG,
        `SELECT stn.tracking_number_normalized AS tracking,
                stn.id AS stn_id,
                rc.id AS receiving_id,
                rl.id AS line_id,
                rl.sku,
                rc.source AS carton_source,
                rc.is_return
           FROM shipping_tracking_numbers stn
           LEFT JOIN receiving_carton rc
             ON rc.shipment_id = stn.id AND rc.organization_id = $1::uuid
           LEFT JOIN receiving_line rl
             ON rl.receiving_id = rc.id AND rl.organization_id = $1::uuid
          WHERE stn.tracking_number_normalized = ANY($2::text[])
          ORDER BY stn.tracking_number_normalized, rl.id`,
        [ORG, unique],
      )
    : { rows: [] };

  const stnHit = new Set(stn.rows.map((r) => r.tracking));
  const lined = new Set(stn.rows.filter((r) => r.line_id != null).map((r) => r.tracking));
  const returnCartons = new Set(
    stn.rows.filter((r) => r.is_return && r.carton_source !== 'unmatched').map((r) => r.tracking),
  );
  const stillUnmatched = [...new Set(
    stn.rows.filter((r) => r.carton_source === 'unmatched').map((r) => r.tracking),
  )];

  await invalidateReceivingViews(ORG).catch((e) => {
    console.warn('cache invalidation failed', e instanceof Error ? e.message : e);
  });

  console.log(JSON.stringify({
    file: FILE,
    rows: rows.length,
    created,
    updated,
    skipped,
    failed,
    errors: errors.slice(0, 12),
    trackings: unique.length,
    stn_matched: stnHit.size,
    trackings_with_receiving_line: lined.size,
    amazon_return_cartons: returnCartons.size,
    still_unmatched: stillUnmatched.slice(0, 10),
    missing_stn: unique.filter((t) => !stnHit.has(t)).slice(0, 10),
    missing_line: unique.filter((t) => stnHit.has(t) && !lined.has(t)).slice(0, 10),
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
