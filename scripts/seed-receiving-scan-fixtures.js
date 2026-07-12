#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Seeds a matched + unmatched receiving fixture so the scan UI can be
 * validated end-to-end without hitting Zoho.
 *
 *   Matched:   tracking 'MOCK-TRK-PO'      → receiving row (zoho_po) + 2 lines
 *   Unmatched: (none seeded — scan anything new to exercise the path)
 *
 * Run:  node scripts/seed-receiving-scan-fixtures.js
 */

const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const TRACKING = 'MOCK-TRK-PO';
const PO_ID = 'MOCK-PO-8001';
const PO_NUMBER = 'PO-MOCK-001';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set in .env');

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert the matched receiving row keyed by zoho_purchaseorder_id.
    const receivingRes = await client.query(
      `INSERT INTO receiving_carton
         (source, zoho_purchaseorder_id, zoho_purchaseorder_number, carrier,
          receiving_date_time, qa_status, needs_test, updated_at)
       VALUES ('zoho_po', $1, $2, 'Mock', NOW(), 'PENDING', true, NOW())
       ON CONFLICT (zoho_purchaseorder_id) WHERE source = 'zoho_po' AND zoho_purchaseorder_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [PO_ID, PO_NUMBER],
    );
    const receivingId = Number(receivingRes.rows[0].id);

    // Door-arrival stamp lives on receiving_triage (street cutover).
    await client.query(
      `INSERT INTO receiving_triage (receiving_id, organization_id, door_received_at)
       SELECT r.id, r.organization_id, NOW() FROM receiving_carton r WHERE r.id = $1
       ON CONFLICT (receiving_id) DO UPDATE
         SET door_received_at = COALESCE(receiving_triage.door_received_at, EXCLUDED.door_received_at),
             updated_at = NOW()`,
      [receivingId],
    );

    // 2. Fixture lines (delete-then-insert so re-running stays deterministic).
    await client.query(
      `DELETE FROM receiving_line rl
        USING receiving_line_zoho rz
        WHERE rz.receiving_line_id = rl.id
          AND rl.receiving_id = $1
          AND rz.zoho_line_item_id LIKE 'MOCK-LINE-%'`,
      [receivingId],
    );
    // Thin spine births + explicit street/facts rows (writer inversion: the
    // testing + zoho clusters live on receiving_line_testing / receiving_line_zoho).
    const fixtureLines = [
      { itemId: 'MOCK-ITEM-1', lineId: 'MOCK-LINE-1', title: 'Bose SoundLink Mini II Bluetooth Speaker', sku: 'BOSE-SLM2-BK', qty: 2 },
      { itemId: 'MOCK-ITEM-2', lineId: 'MOCK-LINE-2', title: 'Apple AirPods Pro (2nd Generation)', sku: 'APPL-APP2-WH', qty: 3 },
    ];
    for (const fx of fixtureLines) {
      const lineRes = await client.query(
        `INSERT INTO receiving_line
           (organization_id, receiving_id, item_name, sku, quantity_expected, quantity_received,
            workflow_status, created_at, updated_at)
         SELECT r.organization_id, r.id, $2, $3, $4, 0, 'MATCHED', NOW(), NOW()
           FROM receiving_carton r WHERE r.id = $1
         RETURNING id, organization_id`,
        [receivingId, fx.title, fx.sku, fx.qty],
      );
      const lineId = Number(lineRes.rows[0].id);
      const lineOrg = lineRes.rows[0].organization_id;
      await client.query(
        `INSERT INTO receiving_line_testing
           (receiving_line_id, organization_id, needs_test, qa_status, disposition_code,
            condition_grade, disposition_audit)
         VALUES ($1, $2, true, 'PENDING', 'HOLD', 'BRAND_NEW', '[]'::jsonb)
         ON CONFLICT (receiving_line_id) DO NOTHING`,
        [lineId, lineOrg],
      );
      await client.query(
        `INSERT INTO receiving_line_zoho
           (receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
            zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
         VALUES ($1, $2, $3, $4, $5, $6,
                 NULLIF(UPPER(REGEXP_REPLACE($6, '[^A-Za-z0-9]', '', 'g')), ''))
         ON CONFLICT (receiving_line_id) DO NOTHING`,
        [lineId, lineOrg, fx.itemId, fx.lineId, PO_ID, PO_NUMBER],
      );
    }

    // 3. Scan row so lookup-po's dedup short-circuit returns this PO.
    await client.query(
      `INSERT INTO receiving_scans
         (receiving_id, tracking_number, carrier, scanned_at, source)
       VALUES ($1, $2, 'Mock', NOW(), 'zoho_po')
       ON CONFLICT (tracking_number, receiving_id) DO NOTHING`,
      [receivingId, TRACKING],
    );

    await client.query('COMMIT');

    console.log('Seeded fixture:');
    console.log('  receiving_id =', receivingId);
    console.log('  tracking     =', TRACKING);
    console.log('  PO id        =', PO_ID);
    console.log('Scan', TRACKING, 'in the receiving UI to render this fixture.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err?.message || err);
  process.exit(1);
});
