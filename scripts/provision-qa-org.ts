#!/usr/bin/env tsx
/**
 * provision-qa-org.ts
 * ───────────────────────────────────────────────────────────────────
 * Idempotently provisions the CycleForge QA sandbox tenant:
 *   - Fixed org UUID (QA_ORG_ID) with enterprise plan + settings
 *   - Admin account, membership, staff + role wiring
 *   - Catalog seed, default workflow, feature-flag overrides
 *   - Representative fixtures (SKUs, receiving PO, outbound orders)
 *
 * Run:  pnpm provision:qa-org
 *       pnpm provision:qa-org -- --fixtures-only   (skip org/staff, re-seed data)
 *       pnpm provision:qa-org -- --verify          (isolation smoke checks)
 *
 * Requires DATABASE_URL. Safe to re-run.
 */

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { hashPin, isObviousPin } from '@/lib/auth/pin';
import { ensureAdminRoleWired } from '@/lib/auth/ensure-admin-role';
import { getAccountByEmail, createAccount } from '@/lib/identity/accounts';
import { seedOrgCatalog } from '@/lib/neon/catalog-queries';
import { seedDefaultWorkflowForOrg } from '@/lib/studio/seed-org-workflow';
import { upsertOrderTracking } from '@/lib/neon/orders-tracking-queries';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import {
  QA_ADMIN_EMAIL,
  QA_ADMIN_NAME,
  QA_ADMIN_PIN,
  QA_FEATURE_FLAGS,
  QA_FIXTURE_INCOMING_POS,
  QA_FIXTURE_ORDERS,
  QA_FIXTURE_PO_ID,
  QA_FIXTURE_PO_NUMBER,
  QA_FIXTURE_SKUS,
  QA_FIXTURE_TESTED_LINE,
  QA_FIXTURE_TESTING_LINE,
  QA_FIXTURE_TRACKING,
  QA_FIXTURE_TRACKING_PACKED,
  QA_FIXTURE_TRACKING_PENDING,
  QA_FIXTURE_TRACKING_PENDING_SECOND,
  QA_FIXTURE_TRACKING_PENDING_THIRD,
  QA_ORG_ID,
  QA_ORG_NAME,
  QA_ORG_SLUG,
  QA_STATION_STAFF,
  resolveQaOrgId,
} from '@/lib/tenancy/qa-org';

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const FIXTURES_ONLY = process.argv.includes('--fixtures-only');
const VERIFY_ONLY = process.argv.includes('--verify');

function log(step: string, detail?: string) {
  console.log(detail ? `✓ ${step} — ${detail}` : `✓ ${step}`);
}

async function setOrgGuc(client: PoolClient, orgId: string) {
  await client.query(`SELECT set_config('app.current_org', $1, false)`, [orgId]);
}

async function ensureOrganization(pool: Pool, orgId: string) {
  const settings = {
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    brand: { name: 'CycleForge QA' },
  };
  await pool.query(
    `INSERT INTO organizations (id, slug, name, plan, status, trial_ends_at, settings, billing_email)
     VALUES ($1, $2, $3, 'enterprise', 'active', NULL, $4::jsonb, $5)
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       name = EXCLUDED.name,
       plan = 'enterprise',
       status = 'active',
       trial_ends_at = NULL,
       settings = organizations.settings || EXCLUDED.settings,
       billing_email = COALESCE(organizations.billing_email, EXCLUDED.billing_email),
       updated_at = NOW()`,
    [orgId, QA_ORG_SLUG, QA_ORG_NAME, JSON.stringify(settings), QA_ADMIN_EMAIL],
  );
  log('Organization', `${QA_ORG_SLUG} (${orgId}) enterprise`);
}

async function ensureAdminStaff(pool: Pool, orgId: string): Promise<number> {
  if (isObviousPin(QA_ADMIN_PIN)) {
    throw new Error('QA_ADMIN_PIN is too obvious — set a non-sequential PIN in .env');
  }
  const pinHash = await hashPin(QA_ADMIN_PIN);

  const client = await pool.connect();
  let staffId: number;
  try {
    await client.query('BEGIN');

    const existingStaff = await client.query<{ id: number }>(
      `SELECT id FROM staff
        WHERE organization_id = $1 AND lower(email) = lower($2)
        LIMIT 1`,
      [orgId, QA_ADMIN_EMAIL],
    );
    if (existingStaff.rows[0]) {
      staffId = existingStaff.rows[0].id;
      await client.query(
        `UPDATE staff SET name = $1, role = 'admin', active = true, status = 'active',
                pin_hash = $2, pin_set_at = COALESCE(pin_set_at, now()), default_home_path = '/dashboard'
          WHERE id = $3`,
        [QA_ADMIN_NAME, pinHash, staffId],
      );
    } else {
      const existingAccount = await getAccountByEmail(QA_ADMIN_EMAIL, client);
      const accountId = existingAccount
        ? existingAccount.id
        : await createAccount(
            { displayName: QA_ADMIN_NAME, email: QA_ADMIN_EMAIL, password: null },
            client,
          );

      const memRes = await client.query<{ id: string }>(
        `INSERT INTO memberships (account_id, org_id, status, joined_at)
         VALUES ($1, $2, 'active', now())
         ON CONFLICT (account_id, org_id)
         DO UPDATE SET status = 'active', joined_at = COALESCE(memberships.joined_at, now())
         RETURNING id`,
        [accountId, orgId],
      );
      const membershipId = memRes.rows[0]!.id;

      const staffRes = await client.query<{ id: number }>(
        `INSERT INTO staff
           (name, role, active, organization_id, pin_hash, pin_set_at, status,
            default_home_path, email, account_id, membership_id)
         VALUES ($1, 'admin', true, $2, $3, now(), 'active', '/dashboard', $4, $5, $6)
         RETURNING id`,
        [QA_ADMIN_NAME, orgId, pinHash, QA_ADMIN_EMAIL, accountId, membershipId],
      );
      staffId = staffRes.rows[0]!.id;
    }

    await ensureAdminRoleWired(staffId, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  log('Admin staff', `${QA_ADMIN_NAME} id=${staffId} (${QA_ADMIN_EMAIL})`);
  return staffId;
}

async function ensureStationStaff(pool: Pool, orgId: string) {
  for (const persona of QA_STATION_STAFF) {
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM staff WHERE organization_id = $1::uuid AND name = $2 LIMIT 1`,
      [orgId, persona.name],
    );
    if (existing.rows[0]) continue;

    const r = await pool.query<{ id: number }>(
      `INSERT INTO staff (name, role, active, organization_id, status, default_home_path)
       VALUES ($1, $2, true, $3::uuid, 'active', $4)
       RETURNING id`,
      [persona.name, persona.role, orgId, persona.homePath],
    );
    const staffId = r.rows[0]!.id;
    await pool.query(
      `INSERT INTO staff_roles (staff_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.key = $2
       ON CONFLICT DO NOTHING`,
      [staffId, persona.role],
    );
    log('Station staff', `${persona.name} (${persona.role})`);
  }
}

async function enableFeatureFlags(pool: Pool, orgId: string) {
  for (const flag of QA_FEATURE_FLAGS) {
    await pool.query(
      `INSERT INTO organization_feature_flags (organization_id, flag, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (organization_id, flag) DO UPDATE SET enabled = true, updated_at = NOW()`,
      [orgId, flag],
    );
  }
  log('Feature flags', QA_FEATURE_FLAGS.join(', '));
}

async function seedCatalogAndWorkflow(orgId: string, staffId: number) {
  await seedOrgCatalog(orgId);
  log('Catalog', 'platforms + types + reason codes');
  await seedDefaultWorkflowForOrg(orgId, staffId);
  log('Workflow', 'default system template activated');
}

async function seedSkus(client: PoolClient, orgId: string) {
  const skus = [
    { sku: QA_FIXTURE_SKUS.speaker, title: 'QA Bose SoundLink Mini II' },
    { sku: QA_FIXTURE_SKUS.earbuds, title: 'QA Apple AirPods Pro (2nd Gen)' },
    { sku: QA_FIXTURE_SKUS.overlapProbe, title: 'QA overlap probe (shared SKU string)' },
  ];
  for (const row of skus) {
    await client.query(
      `INSERT INTO sku_catalog (organization_id, sku, product_title, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (organization_id, sku) DO UPDATE SET
         product_title = EXCLUDED.product_title,
         is_active = true,
         updated_at = NOW()`,
      [orgId, row.sku, row.title],
    );
  }
  log('SKU catalog', `${skus.length} fixtures`);
}

async function seedReceivingFixture(client: PoolClient, orgId: string, adminStaffId: number) {
  const existingCarton = await client.query<{ id: number }>(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1 AND source = 'zoho_po' AND zoho_purchaseorder_id = $2
      LIMIT 1`,
    [orgId, QA_FIXTURE_PO_ID],
  );
  const receivingRes = existingCarton.rows[0]
    ? { rows: [{ id: existingCarton.rows[0].id }] }
    : await client.query<{ id: number }>(
        `INSERT INTO receiving_carton
           (organization_id, source, zoho_purchaseorder_id, zoho_purchaseorder_number,
            carrier, receiving_date_time, qa_status, needs_test, updated_at)
         VALUES ($1, 'zoho_po', $2, $3, 'Mock', NOW(), 'PENDING', true, NOW())
         RETURNING id`,
        [orgId, QA_FIXTURE_PO_ID, QA_FIXTURE_PO_NUMBER],
      );
  const receivingId = Number(receivingRes.rows[0]!.id);

  // Door-arrival stamp lives on receiving_triage (street cutover).
  await client.query(
    `INSERT INTO receiving_triage (receiving_id, organization_id, door_received_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (receiving_id) DO UPDATE
       SET door_received_at = COALESCE(receiving_triage.door_received_at, EXCLUDED.door_received_at),
           updated_at = NOW()`,
    [receivingId, orgId],
  );

  // Verdicts first: `testing_results.receiving_line_id` is ON DELETE SET NULL,
  // so dropping the lines without this would leave one orphan verdict row per
  // re-provision — and this script is meant to be re-run freely.
  await client.query(
    `DELETE FROM testing_results tr
      USING receiving_line rl, receiving_line_zoho rz
      WHERE tr.receiving_line_id = rl.id
        AND rz.receiving_line_id = rl.id
        AND rl.receiving_id = $1
        AND rz.zoho_line_item_id LIKE 'QA-MOCK-LINE-%'`,
    [receivingId],
  );
  await client.query(
    `DELETE FROM receiving_line rl
      USING receiving_line_zoho rz
      WHERE rz.receiving_line_id = rl.id
        AND rl.receiving_id = $1
        AND rz.zoho_line_item_id LIKE 'QA-MOCK-LINE-%'`,
    [receivingId],
  );
  // Thin spine births + explicit street/facts rows (Wave-3 writer inversion:
  // the testing + zoho clusters live on receiving_line_testing / receiving_line_zoho).
  const qaFixtureLines = [
    { itemId: 'QA-MOCK-ITEM-1', lineId: 'QA-MOCK-LINE-1', title: 'QA Bose SoundLink Mini II', sku: QA_FIXTURE_SKUS.speaker, qty: 2 },
    { itemId: 'QA-MOCK-ITEM-2', lineId: 'QA-MOCK-LINE-2', title: 'QA Apple AirPods Pro', sku: QA_FIXTURE_SKUS.earbuds, qty: 3 },
  ];
  for (const fx of qaFixtureLines) {
    const lineRes = await client.query<{ id: number }>(
      `INSERT INTO receiving_line
         (organization_id, receiving_id, item_name, sku, quantity_expected, quantity_received,
          workflow_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, 'MATCHED', NOW(), NOW())
       RETURNING id`,
      [orgId, receivingId, fx.title, fx.sku, fx.qty],
    );
    const lineId = Number(lineRes.rows[0]!.id);
    await client.query(
      `INSERT INTO receiving_line_testing
         (receiving_line_id, organization_id, needs_test, qa_status, disposition_code,
          condition_grade, disposition_audit)
       VALUES ($1, $2, true, 'PENDING', 'HOLD', 'BRAND_NEW', '[]'::jsonb)
       ON CONFLICT (receiving_line_id) DO NOTHING`,
      [lineId, orgId],
    );
    await client.query(
      `INSERT INTO receiving_line_zoho
         (receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
          zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
       VALUES ($1, $2, $3, $4, $5, $6,
               NULLIF(UPPER(REGEXP_REPLACE($6, '[^A-Za-z0-9]', '', 'g')), ''))
       ON CONFLICT (receiving_line_id) DO NOTHING`,
      [lineId, orgId, fx.itemId, fx.lineId, QA_FIXTURE_PO_ID, QA_FIXTURE_PO_NUMBER],
    );
  }

  // Testing feed fixture — a received, still-untested line so the Testing
  // workbench's Pending tab (`view=needs-test`) has rows on this tenant. Its own
  // line so the two above keep the exact state their specs assert from.
  const testingLineRes = await client.query<{ id: number }>(
    `INSERT INTO receiving_line
       (organization_id, receiving_id, item_name, sku, quantity_expected, quantity_received,
        workflow_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, 1, 'UNBOXED', NOW(), NOW())
     RETURNING id`,
    [orgId, receivingId, QA_FIXTURE_TESTING_LINE.title, QA_FIXTURE_TESTING_LINE.sku],
  );
  const testingLineId = Number(testingLineRes.rows[0]!.id);
  await client.query(
    `INSERT INTO receiving_line_testing
       (receiving_line_id, organization_id, needs_test, qa_status, disposition_code,
        condition_grade, disposition_audit)
     VALUES ($1, $2, true, 'PENDING', 'HOLD', 'USED_A', '[]'::jsonb)
     ON CONFLICT (receiving_line_id) DO NOTHING`,
    [testingLineId, orgId],
  );
  await client.query(
    `INSERT INTO receiving_line_zoho
       (receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
        zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
     VALUES ($1, $2, $3, $4, $5, $6,
             NULLIF(UPPER(REGEXP_REPLACE($6, '[^A-Za-z0-9]', '', 'g')), ''))
     ON CONFLICT (receiving_line_id) DO NOTHING`,
    [
      testingLineId,
      orgId,
      QA_FIXTURE_TESTING_LINE.itemId,
      QA_FIXTURE_TESTING_LINE.lineId,
      QA_FIXTURE_PO_ID,
      QA_FIXTURE_PO_NUMBER,
    ],
  );

  // Testing HISTORY fixture — a line with a recorded verdict by the QA admin,
  // which is what `view=testing` selects and what the History tab (defaulting to
  // the signed-in tester) scopes to.
  const testedLineRes = await client.query<{ id: number }>(
    `INSERT INTO receiving_line
       (organization_id, receiving_id, item_name, sku, quantity_expected, quantity_received,
        workflow_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, 1, 'PASSED', NOW(), NOW())
     RETURNING id`,
    [orgId, receivingId, QA_FIXTURE_TESTED_LINE.title, QA_FIXTURE_TESTED_LINE.sku],
  );
  const testedLineId = Number(testedLineRes.rows[0]!.id);
  await client.query(
    `INSERT INTO receiving_line_testing
       (receiving_line_id, organization_id, needs_test, qa_status, disposition_code,
        condition_grade, disposition_audit)
     VALUES ($1, $2, false, 'PASSED', 'ACCEPT', 'USED_A', '[]'::jsonb)
     ON CONFLICT (receiving_line_id) DO NOTHING`,
    [testedLineId, orgId],
  );
  await client.query(
    `INSERT INTO receiving_line_zoho
       (receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
        zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
     VALUES ($1, $2, $3, $4, $5, $6,
             NULLIF(UPPER(REGEXP_REPLACE($6, '[^A-Za-z0-9]', '', 'g')), ''))
     ON CONFLICT (receiving_line_id) DO NOTHING`,
    [
      testedLineId,
      orgId,
      QA_FIXTURE_TESTED_LINE.itemId,
      QA_FIXTURE_TESTED_LINE.lineId,
      QA_FIXTURE_PO_ID,
      QA_FIXTURE_PO_NUMBER,
    ],
  );
  // `created_at` is the feed's tested-at axis, so NOW() lands it in the current
  // week — the History tab opens on `weekOffset=0`.
  await client.query(
    `INSERT INTO testing_results
       (organization_id, receiving_line_id, verdict, unit_status, tested_by, notes, created_at)
     VALUES ($1, $2, 'PASS', 'TESTED', $3, 'QA fixture verdict', NOW())`,
    [orgId, testedLineId, adminStaffId],
  );

  await client.query(
    `INSERT INTO receiving_scans (receiving_id, tracking_number, carrier, scanned_at, source)
     VALUES ($1, $2, 'Mock', NOW(), 'zoho_po')
     ON CONFLICT (tracking_number, receiving_id) DO NOTHING`,
    [receivingId, QA_FIXTURE_TRACKING],
  );

  log(
    'Receiving fixture',
    `carton=${receivingId} tracking=${QA_FIXTURE_TRACKING} ` +
      `needsTestLine=${testingLineId} testedLine=${testedLineId}`,
  );
}

/**
 * `/incoming` fixture — Zoho POs the vendor has issued and the warehouse has
 * not touched.
 *
 * Deliberately carton-LESS (`receiving_id IS NULL`): an incoming PO line exists
 * before any box shows up at the door, which is why `view=incoming` reads the
 * line + its `receiving_line_zoho` PO id rather than a carton. Adding a carton
 * or a `receiving_scans` row would satisfy `SHIPMENT_SCANNED_PREDICATE` and drop
 * the row straight back off the lane.
 *
 * No `zoho_po_mirror` row is required — `NOT_ZOHO_RECEIVED_PREDICATE` coalesces
 * a missing mirror status to '' (non-terminal) — but we seed one anyway so the
 * fixture matches a real issued PO and the "drops off once Zoho reports it
 * received" path is exercised against real data rather than an absence.
 */
async function seedIncomingFixture(client: PoolClient, orgId: string) {
  const lineIds = QA_FIXTURE_INCOMING_POS.map((po) => po.lineId);
  await client.query(
    `DELETE FROM receiving_line rl
      USING receiving_line_zoho rz
      WHERE rz.receiving_line_id = rl.id
        AND rl.organization_id = $1
        AND rz.zoho_line_item_id = ANY($2::text[])`,
    [orgId, lineIds],
  );

  const titles = ['QA Incoming Bose SoundLink Mini II', 'QA Incoming Apple AirPods Pro'];
  const skus = [QA_FIXTURE_SKUS.speaker, QA_FIXTURE_SKUS.earbuds];

  for (const [i, po] of QA_FIXTURE_INCOMING_POS.entries()) {
    await client.query(
      `INSERT INTO zoho_po_mirror
         (zoho_purchaseorder_id, zoho_purchaseorder_number, vendor_name, status,
          po_date, expected_delivery_date, raw, organization_id, last_synced_at)
       VALUES ($1, $2, 'QA Mock Vendor', 'issued',
               CURRENT_DATE - 3, CURRENT_DATE + 2, '{"qa_fixture": true}'::jsonb, $3, NOW())
       ON CONFLICT (zoho_purchaseorder_id) DO UPDATE
         SET status = EXCLUDED.status,
             expected_delivery_date = EXCLUDED.expected_delivery_date,
             organization_id = COALESCE(zoho_po_mirror.organization_id, EXCLUDED.organization_id),
             last_synced_at = NOW()`,
      [po.id, po.number, orgId],
    );

    const lineRes = await client.query<{ id: number }>(
      `INSERT INTO receiving_line
         (organization_id, receiving_id, item_name, sku, quantity_expected, quantity_received,
          workflow_status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, 1, 0, 'EXPECTED', NOW(), NOW())
       RETURNING id`,
      [orgId, titles[i], skus[i]],
    );
    const lineId = Number(lineRes.rows[0]!.id);
    await client.query(
      `INSERT INTO receiving_line_zoho
         (receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
          zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
       VALUES ($1, $2, $3, $4, $5, $6,
               NULLIF(UPPER(REGEXP_REPLACE($6, '[^A-Za-z0-9]', '', 'g')), ''))
       ON CONFLICT (receiving_line_id) DO NOTHING`,
      [lineId, orgId, `QA-MOCK-INC-ITEM-${i + 1}`, po.lineId, po.id, po.number],
    );
  }

  log(
    'Incoming fixture',
    `${QA_FIXTURE_INCOMING_POS.length} expected POs (${QA_FIXTURE_INCOMING_POS.map((p) => p.number).join(', ')})`,
  );
}

async function createFixtureOrder(
  client: PoolClient,
  orgId: string,
  orderId: string,
  title: string,
  sku: string,
): Promise<number> {
  const r = await client.query<{ id: number }>(
    `INSERT INTO orders
       (organization_id, order_id, product_title, sku, status, quantity, account_source, order_date, created_at, condition)
     VALUES ($1, $2, $3, $4, 'unassigned', '1', 'QA-TEST', NOW(), NOW(), 'New')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [orgId, orderId, title, sku],
  );
  if (r.rows[0]) return Number(r.rows[0].id);

  const existing = await client.query<{ id: number }>(
    `SELECT id FROM orders WHERE organization_id = $1 AND order_id = $2 LIMIT 1`,
    [orgId, orderId],
  );
  return Number(existing.rows[0]!.id);
}

async function seedOrderFixtures(client: PoolClient, orgId: string) {
  const awaitId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.awaiting,
    'QA — Unshipped AWAITING (add tracking here)',
    QA_FIXTURE_SKUS.speaker,
  );
  const pendingId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pending,
    'QA — Unshipped PENDING (tracking assigned)',
    QA_FIXTURE_SKUS.earbuds,
  );
  // The Pending lane drops rows with no tracking, so `awaiting` never reaches
  // the grid. Without a SECOND tracked order every record→record spec skipped
  // itself — a hidden coverage gap, not a passing suite.
  const pendingSecondId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pendingSecond,
    'QA — Unshipped PENDING #2 (record→record navigation)',
    QA_FIXTURE_SKUS.speaker,
  );

  /** Attach a tracking number to one fixture order (idempotent). */
  const assignTracking = async (orderRowId: number, tracking: string) => {
    const norm = normalizeTrackingNumber(tracking);
    if (!detectCarrier(norm)) {
      console.warn(`  ⚠ carrier detection failed for ${tracking} — skipping tracking assign`);
      return;
    }
    const existingStn = await client.query<{ id: number }>(
      `SELECT id FROM shipping_tracking_numbers WHERE tracking_number_normalized = $1 LIMIT 1`,
      [norm],
    );
    if (existingStn.rows[0]) {
      await client.query(`UPDATE orders SET shipment_id = $1 WHERE id = $2`, [
        Number(existingStn.rows[0].id),
        orderRowId,
      ]);
    }
    await upsertOrderTracking([orderRowId], tracking, client, orgId);
  };

  const pendingThirdId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pendingThird,
    'QA — Unshipped PENDING #3 (focus-a-middle-row keyboard specs)',
    QA_FIXTURE_SKUS.earbuds,
  );
  const packedId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.packed,
    'QA — PACKED (staged for the dock)',
    QA_FIXTURE_SKUS.earbuds,
  );

  await assignTracking(pendingId, QA_FIXTURE_TRACKING_PENDING);
  await assignTracking(pendingSecondId, QA_FIXTURE_TRACKING_PENDING_SECOND);
  await assignTracking(pendingThirdId, QA_FIXTURE_TRACKING_PENDING_THIRD);
  await assignTracking(packedId, QA_FIXTURE_TRACKING_PACKED);

  // The Packed lane is `?stagedOnly=true`: a PACK activity on the order's
  // shipment and NO SHIP_CONFIRM. Stamp the pack fact so the lane is non-empty.
  const packedShipment = await client.query<{ shipment_id: string | null }>(
    `SELECT shipment_id FROM orders WHERE id = $1`,
    [packedId],
  );
  const packedShipmentId = packedShipment.rows[0]?.shipment_id;
  if (!packedShipmentId) {
    console.warn('  ⚠ packed fixture has no shipment_id — Packed lane will stay empty');
  } else {
    await client.query(
      `INSERT INTO station_activity_logs
         (organization_id, station, activity_type, shipment_id, scan_ref, notes)
       SELECT $1, 'packing', 'PACK_COMPLETED', $2, $3, 'QA fixture'
       WHERE NOT EXISTS (
         SELECT 1 FROM station_activity_logs
         WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'PACK_COMPLETED'
       )`,
      [orgId, Number(packedShipmentId), QA_FIXTURE_TRACKING_PACKED],
    );
    // Idempotent re-provision must not leave the order scanned out, or it moves
    // to the Shipped lane and the Packed lane is empty again.
    await client.query(
      `DELETE FROM station_activity_logs
       WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'SHIP_CONFIRM'`,
      [orgId, Number(packedShipmentId)],
    );
  }

  log(
    'Order fixtures',
    `awaiting id=${awaitId}, pending id=${pendingId}, pending#2 id=${pendingSecondId}, pending#3 id=${pendingThirdId}, packed id=${packedId}`,
  );
}

async function seedFixtures(pool: Pool, orgId: string, adminStaffId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setOrgGuc(client, orgId);
    await seedSkus(client, orgId);
    await seedReceivingFixture(client, orgId, adminStaffId);
    await seedIncomingFixture(client, orgId);
    await seedOrderFixtures(client, orgId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function verifyIsolation(pool: Pool, orgId: string) {
  const qaOrders = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM orders WHERE organization_id = $1::uuid`,
    [orgId],
  );
  const qaSkus = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sku_catalog WHERE organization_id = $1::uuid`,
    [orgId],
  );
  const qaPlatforms = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM platforms WHERE organization_id = $1::uuid`,
    [orgId],
  );
  const overlap = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sku_catalog
      WHERE organization_id = $1::uuid AND sku = $2`,
    [orgId, QA_FIXTURE_SKUS.overlapProbe],
  );
  const flags = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM organization_feature_flags
      WHERE organization_id = $1::uuid AND enabled = true`,
    [orgId],
  );

  console.log('\n── QA org verify ──');
  console.log(`  Orders:        ${qaOrders.rows[0]!.n}`);
  console.log(`  SKUs:          ${qaSkus.rows[0]!.n}`);
  console.log(`  Platforms:     ${qaPlatforms.rows[0]!.n}`);
  console.log(`  Feature flags: ${flags.rows[0]!.n}`);
  console.log(`  Overlap SKU:   ${overlap.rows[0]!.n > 0 ? 'yes ✓' : 'MISSING'}`);
  console.log('  Full RLS isolation → npm run tenancy:guard:check (needs TENANT_APP_DATABASE_URL)');
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const orgId = resolveQaOrgId();
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  console.log(`\nProvisioning QA org: ${QA_ORG_NAME}`);
  console.log(`  orgId: ${orgId}`);
  console.log(`  slug:  ${QA_ORG_SLUG}\n`);

  try {
    if (VERIFY_ONLY) {
      await verifyIsolation(pool, orgId);
      return;
    }

    let staffId = 0;
    if (!FIXTURES_ONLY) {
      await ensureOrganization(pool, orgId);
      staffId = await ensureAdminStaff(pool, orgId);
      await ensureStationStaff(pool, orgId);
      await enableFeatureFlags(pool, orgId);
      await seedCatalogAndWorkflow(orgId, staffId);
    } else {
      const r = await pool.query<{ id: number }>(
        `SELECT id FROM staff WHERE organization_id = $1 AND role = 'admin' ORDER BY id LIMIT 1`,
        [orgId],
      );
      if (!r.rows[0]) {
        throw new Error('No QA admin staff found — run without --fixtures-only first');
      }
      staffId = r.rows[0].id;
    }

    await seedFixtures(pool, orgId, staffId);

    if (process.argv.includes('--verify')) {
      await verifyIsolation(pool, orgId);
    }

    console.log('\n── QA org ready ──');
    console.log(`  Sign in: /signin  →  "${QA_ADMIN_NAME}"`);
    console.log(`  PIN:     ${QA_ADMIN_PIN}  (set QA_ADMIN_PIN in .env to override)`);
    console.log(`  Scan:    ${QA_FIXTURE_TRACKING} in receiving`);
    console.log(`  Env:     QA_ORG_ID=${orgId}`);
    console.log(`           PW_QA_STAFF_NAME="${QA_ADMIN_NAME}"\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('provision-qa-org failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
