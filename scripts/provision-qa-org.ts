#!/usr/bin/env tsx
/**
 * provision-qa-org.ts
 * ───────────────────────────────────────────────────────────────────
 * Idempotently provisions the CycleForge QA sandbox tenant:
 *   - Fixed org UUID (QA_ORG_ID) with enterprise plan + settings
 *   - Admin account, membership, staff + role wiring
 *   - Catalog seed, default workflow, feature-flag overrides
 *   - Representative fixtures (SKUs, receiving PO, E2E + demo outbound orders)
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
import {
  getAccountByEmail,
  createAccount,
  setAccountPassword,
  addVerifiedEmail,
} from '@/lib/identity/accounts';
import { seedOrgCatalog } from '@/lib/neon/catalog-queries';
import { generateInternalGtin } from '@/lib/inventory/internal-gtin';
import { seedDefaultWorkflowForOrg } from '@/lib/studio/seed-org-workflow';
import { upsertOrderTracking } from '@/lib/neon/orders-tracking-queries';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import {
  QA_ADMIN_EMAIL,
  QA_ADMIN_NAME,
  QA_ADMIN_PASSWORD,
  QA_ADMIN_PIN,
  QA_DEMO_ORDER_VOLUME,
  QA_DEMO_SKU_CATALOG,
  QA_DEMO_SKUS,
  QA_FEATURE_FLAGS,
  QA_FIXTURE_INCOMING_POS,
  QA_FIXTURE_MY_DAY,
  QA_FIXTURE_ORDER_TITLES,
  QA_FIXTURE_ORDERS,
  QA_FIXTURE_PO_ID,
  QA_FIXTURE_PO_NUMBER,
  QA_FIXTURE_SKUS,
  QA_FIXTURE_ZOHO_ITEM,
  QA_FIXTURE_SUPPORT,
  QA_FIXTURE_CUSTOM_FIELD,
  QA_FIXTURE_PHOTOS,
  QA_FIXTURE_TESTED_LINE,
  QA_FIXTURE_UNIT,
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
  qaDemoOrderId,
  qaDemoTrackingNumber,
  resolveQaOrgId,
} from '@/lib/tenancy/qa-org';
import { upsertIntegrationCredentials } from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const FIXTURES_ONLY = process.argv.includes('--fixtures-only');
const VERIFY_ONLY = process.argv.includes('--verify');

function log(step: string, detail?: string) {
  console.log(detail ? `✓ ${step} — ${detail}` : `✓ ${step}`);
}

async function setOrgGuc(client: PoolClient, orgId: string) {
  // Keep the tenant identity inside the fixture transaction only. The seeder
  // is also imported by the authenticated QA route; a session-scoped GUC would
  // leak across pooled connections after that request completes.
  await client.query(`SELECT set_config('app.current_org', $1, true)`, [orgId]);
}

async function ensureOrganization(pool: Pool, orgId: string) {
  // `individual` = email+password signs straight in as QA Admin (no umbrella
  // staff picker). Station PIN remains available as a secondary path.
  const settings = {
    environment: 'sandbox',
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    brand: { name: 'CycleForge QA' },
    staffLoginModel: 'individual',
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
  if (!QA_ADMIN_PASSWORD || QA_ADMIN_PASSWORD.length < 10) {
    throw new Error(
      'QA_ADMIN_PASSWORD must be at least 10 characters — set it in .env (sandbox email+password for org …0002)',
    );
  }
  const pinHash = await hashPin(QA_ADMIN_PIN);

  const client = await pool.connect();
  let staffId: number;
  try {
    await client.query('BEGIN');

    const existingStaff = await client.query<{ id: number; account_id: string | null }>(
      `SELECT id, account_id::text AS account_id FROM staff
        WHERE organization_id = $1 AND lower(email) = lower($2)
        LIMIT 1`,
      [orgId, QA_ADMIN_EMAIL],
    );
    if (existingStaff.rows[0]) {
      staffId = existingStaff.rows[0].id;
      await client.query(
        `UPDATE staff SET name = $1, role = 'admin', active = true, status = 'active',
                pin_hash = $2, pin_set_at = COALESCE(pin_set_at, now()), default_home_path = '/dashboard',
                email = $3
          WHERE id = $4`,
        [QA_ADMIN_NAME, pinHash, QA_ADMIN_EMAIL, staffId],
      );

      let accountId = existingStaff.rows[0].account_id;
      if (!accountId) {
        const existingAccount = await getAccountByEmail(QA_ADMIN_EMAIL, client);
        accountId = existingAccount
          ? existingAccount.id
          : await createAccount(
              {
                displayName: QA_ADMIN_NAME,
                email: QA_ADMIN_EMAIL,
                password: QA_ADMIN_PASSWORD,
              },
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
        await client.query(
          `UPDATE staff SET account_id = $1, membership_id = $2 WHERE id = $3`,
          [accountId, memRes.rows[0]!.id, staffId],
        );
      } else {
        await addVerifiedEmail(accountId, QA_ADMIN_EMAIL, client);
        await setAccountPassword(accountId, QA_ADMIN_PASSWORD, client);
        await client.query(
          `UPDATE accounts SET display_name = $1, primary_email = $2, status = 'active', updated_at = now()
            WHERE id = $3`,
          [QA_ADMIN_NAME, QA_ADMIN_EMAIL, accountId],
        );
        await client.query(
          `INSERT INTO memberships (account_id, org_id, status, joined_at)
           VALUES ($1, $2, 'active', now())
           ON CONFLICT (account_id, org_id)
           DO UPDATE SET status = 'active', joined_at = COALESCE(memberships.joined_at, now())`,
          [accountId, orgId],
        );
      }
    } else {
      const existingAccount = await getAccountByEmail(QA_ADMIN_EMAIL, client);
      const accountId = existingAccount
        ? existingAccount.id
        : await createAccount(
            {
              displayName: QA_ADMIN_NAME,
              email: QA_ADMIN_EMAIL,
              password: QA_ADMIN_PASSWORD,
            },
            client,
          );
      if (existingAccount) {
        await setAccountPassword(accountId, QA_ADMIN_PASSWORD, client);
        await addVerifiedEmail(accountId, QA_ADMIN_EMAIL, client);
      }

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

  log('Admin staff', `${QA_ADMIN_NAME} id=${staffId} (${QA_ADMIN_EMAIL}) — email+password ready`);
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
    // Demo-volume catalog — titles rotate onto outbound mock orders.
    { sku: QA_DEMO_SKUS.keyboard, title: 'QA Logitech MX Keys' },
    { sku: QA_DEMO_SKUS.headset, title: 'QA Sony WH-1000XM5' },
    { sku: QA_DEMO_SKUS.tablet, title: 'QA Samsung Galaxy Tab A8' },
    { sku: QA_DEMO_SKUS.charger, title: 'QA Anker 737 Power Bank' },
    { sku: QA_DEMO_SKUS.mouse, title: 'QA Logitech MX Master 3' },
    { sku: QA_DEMO_SKUS.webcam, title: 'QA Logitech C920 HD Webcam' },
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
  // The earbuds fixture carries an internally-minted GTIN, in exactly the form
  // getOrCreateInternalGtin would have stamped for its own row id. It exists so
  // a spec can see the state that is otherwise unreachable through the UI: the
  // product-record GTIN field REFUSES a typed restricted-circulation number
  // (that is the point of it), so without a seeded row nothing could assert the
  // INTERNAL chip renders. Idempotent — the value is derived from the row id.
  const earbuds = await client.query<{ id: number; gtin: string | null }>(
    `SELECT id, gtin FROM sku_catalog WHERE organization_id = $1 AND sku = $2`,
    [orgId, QA_FIXTURE_SKUS.earbuds],
  );
  const earbudsRow = earbuds.rows[0];
  if (earbudsRow) {
    const minted = generateInternalGtin(earbudsRow.id);
    if (earbudsRow.gtin !== minted) {
      await client.query(
        `UPDATE sku_catalog SET gtin = $1, updated_at = NOW()
          WHERE id = $2 AND organization_id = $3`,
        [minted, earbudsRow.id, orgId],
      );
    }
  }

  log('SKU catalog', `${skus.length} fixtures`);
}

/**
 * One active Zoho `items` mirror row whose `sku` matches a seeded `sku_catalog`
 * fixture, so the Add-inbound Product picker (`searchField=zoho_catalog`, an
 * INNER JOIN of `items` ⋈ `sku_catalog`) returns a pairable row on the QA org.
 * Idempotent on the globally-unique `zoho_item_id`.
 */
async function seedZohoItems(client: PoolClient, orgId: string) {
  await client.query(
    `INSERT INTO items (organization_id, zoho_item_id, name, sku, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (zoho_item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       sku = EXCLUDED.sku,
       status = 'active',
       updated_at = NOW()`,
    [orgId, QA_FIXTURE_ZOHO_ITEM.zohoItemId, QA_FIXTURE_ZOHO_ITEM.title, QA_FIXTURE_ZOHO_ITEM.sku],
  );
  log('Zoho items', `1 fixture (${QA_FIXTURE_ZOHO_ITEM.sku})`);
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

  // ── The SHIPMENT the carton hangs off ────────────────────────────────────
  // `receiving_scans` alone is the STN-LESS legacy fallback rung. Every fast
  // path an operator actually hits — `resolveShipmentForScan`'s exact-normalized
  // join, and the `?tracking_in=` list filter behind the Unbox local-first probe
  // — reads `shipping_tracking_numbers ⋈ receiving_carton.shipment_id`, so a
  // fixture with no STN row exercises only the slow fallback and silently skips
  // the join under test. Normalized key is upper-alnum (the shared canonical
  // form), matching `canonicalizeTrackingKey` / `normalizeScanKey`.
  const stnRes = await client.query<{ id: string }>(
    `INSERT INTO shipping_tracking_numbers
       (tracking_number_raw, tracking_number_normalized, carrier, source_system)
     VALUES ($1, $2, 'Mock', 'qa-fixture')
     ON CONFLICT (tracking_number_normalized) DO UPDATE
       SET tracking_number_raw = EXCLUDED.tracking_number_raw
     RETURNING id`,
    [QA_FIXTURE_TRACKING, QA_FIXTURE_TRACKING.toUpperCase().replace(/[^A-Z0-9]/g, '')],
  );
  const qaShipmentId = stnRes.rows[0]?.id ?? null;
  if (qaShipmentId) {
    await client.query(
      `UPDATE receiving_carton SET shipment_id = $2 WHERE id = $1 AND organization_id = $3`,
      [receivingId, qaShipmentId, orgId],
    );
  }

  // ── Org custom column (Horizon C wave 1) ─────────────────────────────────
  // A def + a value on two lines, so a LedgerGrid column sort has something to
  // order. Decimals on purpose — see QA_FIXTURE_CUSTOM_FIELD's docblock.
  const customDefRes = await client.query<{ id: number }>(
    `INSERT INTO custom_field_defs
       (organization_id, entity_type, key, label, type, sort_order)
     VALUES ($1, $2, $3, $4, $5, 0)
     ON CONFLICT (organization_id, entity_type, key) DO UPDATE
       SET label = EXCLUDED.label, type = EXCLUDED.type, archived_at = NULL, updated_at = now()
     RETURNING id`,
    [
      orgId,
      QA_FIXTURE_CUSTOM_FIELD.entityType,
      QA_FIXTURE_CUSTOM_FIELD.key,
      QA_FIXTURE_CUSTOM_FIELD.label,
      QA_FIXTURE_CUSTOM_FIELD.type,
    ],
  );
  const customFieldId = Number(customDefRes.rows[0]!.id);

  for (const [lineId, value] of [
    [testedLineId, QA_FIXTURE_CUSTOM_FIELD.lower.value],
    [testingLineId, QA_FIXTURE_CUSTOM_FIELD.upper.value],
  ] as const) {
    await client.query(
      `INSERT INTO custom_field_values
         (organization_id, field_id, entity_type, entity_id, value_number)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, field_id, entity_id) DO UPDATE
         SET value_number = EXCLUDED.value_number, updated_at = now()`,
      [orgId, customFieldId, QA_FIXTURE_CUSTOM_FIELD.entityType, lineId, value],
    );
  }

  // The merged column is `tier: 'optional'`, so it stays hidden until a staffer
  // opts in. Seed that opt-in for the QA admin under BOTH prefs buckets — the
  // Unbox History mount (`receiving`) and the Testing History mount (`testing`)
  // share one binding but keep independent Fields deltas, so seeding one would
  // leave the other's column invisible and the spec unable to see it.
  // `jsonb_agg(DISTINCT …)` keeps re-provisioning idempotent.
  for (const bucket of QA_FIXTURE_CUSTOM_FIELD.prefsTableIds) {
    await client.query(
      `INSERT INTO staff_preferences (organization_id, staff_id, prefs)
       VALUES ($1, $2, jsonb_build_object('tableColumns',
                 jsonb_build_object($3::text, jsonb_build_object('shown', jsonb_build_array($4::text)))))
       ON CONFLICT (organization_id, staff_id) DO UPDATE
         SET prefs = jsonb_set(
               COALESCE(staff_preferences.prefs, '{}'::jsonb),
               ARRAY['tableColumns', $3::text, 'shown'],
               (
                 SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
                 FROM jsonb_array_elements(
                   COALESCE(
                     staff_preferences.prefs->'tableColumns'->($3::text)->'shown',
                     '[]'::jsonb
                   ) || to_jsonb($4::text)
                 ) e
               ),
               true
             ),
             updated_at = now()`,
      [orgId, adminStaffId, bucket, QA_FIXTURE_CUSTOM_FIELD.columnKey],
    );
  }

  log(
    'Receiving fixture',
    `carton=${receivingId} tracking=${QA_FIXTURE_TRACKING} ` +
      `needsTestLine=${testingLineId} testedLine=${testedLineId} ` +
      `customField=${QA_FIXTURE_CUSTOM_FIELD.columnKey}#${customFieldId} ` +
      `(${QA_FIXTURE_CUSTOM_FIELD.lower.value} / ${QA_FIXTURE_CUSTOM_FIELD.upper.value})`,
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
  accountSource = 'QA-TEST',
): Promise<number> {
  const r = await client.query<{ id: number }>(
    `INSERT INTO orders
       (organization_id, order_id, product_title, sku, status, quantity, account_source, order_date, created_at, condition)
     VALUES ($1, $2, $3, $4, 'unassigned', '1', $5, NOW(), NOW(), 'New')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [orgId, orderId, title, sku, accountSource],
  );
  if (r.rows[0]) return Number(r.rows[0].id);

  const existing = await client.query<{ id: number }>(
    `SELECT id FROM orders WHERE organization_id = $1 AND order_id = $2 LIMIT 1`,
    [orgId, orderId],
  );
  return Number(existing.rows[0]!.id);
}

/** Attach a tracking number to one fixture order (idempotent). */
async function assignFixtureTracking(
  client: PoolClient,
  orgId: string,
  orderRowId: number,
  tracking: string,
) {
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
}

async function stampPackCompleted(
  client: PoolClient,
  orgId: string,
  orderRowId: number,
  tracking: string,
) {
  const packedShipment = await client.query<{ shipment_id: string | null }>(
    `SELECT shipment_id FROM orders WHERE id = $1`,
    [orderRowId],
  );
  const packedShipmentId = packedShipment.rows[0]?.shipment_id;
  if (!packedShipmentId) {
    console.warn(`  ⚠ order ${orderRowId} has no shipment_id — skipping PACK_COMPLETED`);
    return null;
  }
  await client.query(
    `INSERT INTO station_activity_logs
       (organization_id, station, activity_type, shipment_id, scan_ref, notes)
     SELECT $1, 'packing', 'PACK_COMPLETED', $2, $3, 'QA fixture'
     WHERE NOT EXISTS (
       SELECT 1 FROM station_activity_logs
       WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'PACK_COMPLETED'
     )`,
    [orgId, Number(packedShipmentId), tracking],
  );
  return Number(packedShipmentId);
}

async function seedOrderFixtures(client: PoolClient, orgId: string) {
  const awaitId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.awaiting,
    QA_FIXTURE_ORDER_TITLES.awaiting,
    QA_FIXTURE_SKUS.speaker,
  );
  const pendingId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pending,
    QA_FIXTURE_ORDER_TITLES.pending,
    QA_FIXTURE_SKUS.earbuds,
  );
  // The Pending lane drops rows with no tracking, so `awaiting` never reaches
  // the grid. Without a SECOND tracked order every record→record spec skipped
  // itself — a hidden coverage gap, not a passing suite.
  const pendingSecondId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pendingSecond,
    QA_FIXTURE_ORDER_TITLES.pendingSecond,
    QA_FIXTURE_SKUS.speaker,
  );

  const pendingThirdId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.pendingThird,
    QA_FIXTURE_ORDER_TITLES.pendingThird,
    QA_FIXTURE_SKUS.earbuds,
  );
  const packedId = await createFixtureOrder(
    client,
    orgId,
    QA_FIXTURE_ORDERS.packed,
    QA_FIXTURE_ORDER_TITLES.packed,
    QA_FIXTURE_SKUS.earbuds,
  );

  await assignFixtureTracking(client, orgId, pendingId, QA_FIXTURE_TRACKING_PENDING);
  await assignFixtureTracking(client, orgId, pendingSecondId, QA_FIXTURE_TRACKING_PENDING_SECOND);
  await assignFixtureTracking(client, orgId, pendingThirdId, QA_FIXTURE_TRACKING_PENDING_THIRD);
  await assignFixtureTracking(client, orgId, packedId, QA_FIXTURE_TRACKING_PACKED);

  // The Packed lane is `?stagedOnly=true`: a PACK activity on the order's
  // shipment and NO SHIP_CONFIRM. Stamp the pack fact so the lane is non-empty.
  const packedShipmentId = await stampPackCompleted(
    client,
    orgId,
    packedId,
    QA_FIXTURE_TRACKING_PACKED,
  );
  if (!packedShipmentId) {
    console.warn('  ⚠ packed fixture has no shipment_id — Packed lane will stay empty');
  } else {
    // Idempotent re-provision must not leave the order scanned out, or it moves
    // to the Shipped lane and the Packed lane is empty again.
    await client.query(
      `DELETE FROM station_activity_logs
       WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'SHIP_CONFIRM'`,
      [orgId, packedShipmentId],
    );
  }

  log(
    'Order fixtures',
    `awaiting id=${awaitId}, pending id=${pendingId}, pending#2 id=${pendingSecondId}, pending#3 id=${pendingThirdId}, packed id=${packedId}`,
  );

  return { pendingId, pendingSecondId, pendingThirdId };
}

/**
 * Demo outbound volume — ~60 mock orders across Awaiting / Pending / Packed /
 * Shipped so desks look like a running business. IDs use `QA-DEMO-ORD-*` so
 * Playwright's `QA-TEST-*` fixtures stay stable. Idempotent on re-provision.
 */
async function seedDemoOrderVolume(client: PoolClient, orgId: string) {
  const catalog = QA_DEMO_SKU_CATALOG;
  let trackingSeq = 0;

  const pickProduct = (i: number) => catalog[i % catalog.length]!;

  for (let i = 0; i < QA_DEMO_ORDER_VOLUME.awaiting; i++) {
    const product = pickProduct(i);
    await createFixtureOrder(
      client,
      orgId,
      qaDemoOrderId('awaiting', i),
      `QA demo awaiting — ${product.title}`,
      product.sku,
      'QA-DEMO',
    );
  }

  for (let i = 0; i < QA_DEMO_ORDER_VOLUME.pending; i++) {
    const product = pickProduct(i + QA_DEMO_ORDER_VOLUME.awaiting);
    const orderRowId = await createFixtureOrder(
      client,
      orgId,
      qaDemoOrderId('pending', i),
      `QA demo pending — ${product.title}`,
      product.sku,
      'QA-DEMO',
    );
    const tracking = qaDemoTrackingNumber(trackingSeq++);
    await assignFixtureTracking(client, orgId, orderRowId, tracking);
  }

  for (let i = 0; i < QA_DEMO_ORDER_VOLUME.packed; i++) {
    const product = pickProduct(i + 40);
    const tracking = qaDemoTrackingNumber(trackingSeq++);
    const orderRowId = await createFixtureOrder(
      client,
      orgId,
      qaDemoOrderId('packed', i),
      `QA demo packed — ${product.title}`,
      product.sku,
      'QA-DEMO',
    );
    await assignFixtureTracking(client, orgId, orderRowId, tracking);
    const shipmentId = await stampPackCompleted(client, orgId, orderRowId, tracking);
    if (shipmentId != null) {
      // Packed demo rows must stay off the Shipped lane on re-provision.
      await client.query(
        `DELETE FROM station_activity_logs
         WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'SHIP_CONFIRM'`,
        [orgId, shipmentId],
      );
    }
  }

  for (let i = 0; i < QA_DEMO_ORDER_VOLUME.shipped; i++) {
    const product = pickProduct(i + 50);
    const tracking = qaDemoTrackingNumber(trackingSeq++);
    const orderRowId = await createFixtureOrder(
      client,
      orgId,
      qaDemoOrderId('shipped', i),
      `QA demo shipped — ${product.title}`,
      product.sku,
      'QA-DEMO',
    );
    await assignFixtureTracking(client, orgId, orderRowId, tracking);
    const shipmentId = await stampPackCompleted(client, orgId, orderRowId, tracking);
    if (shipmentId == null) continue;
    await client.query(
      `INSERT INTO station_activity_logs
         (organization_id, station, activity_type, shipment_id, scan_ref, notes)
       SELECT $1, 'OUTBOUND', 'SHIP_CONFIRM', $2, $3, 'QA demo dock scan-out'
       WHERE NOT EXISTS (
         SELECT 1 FROM station_activity_logs
         WHERE organization_id = $1 AND shipment_id = $2 AND activity_type = 'SHIP_CONFIRM'
       )`,
      [orgId, shipmentId, tracking],
    );
  }

  log(
    'Demo volume',
    `awaiting=${QA_DEMO_ORDER_VOLUME.awaiting} pending=${QA_DEMO_ORDER_VOLUME.pending} ` +
      `packed=${QA_DEMO_ORDER_VOLUME.packed} shipped=${QA_DEMO_ORDER_VOLUME.shipped}`,
  );
}

/**
 * Today (`/`) fixtures — the `work_assignments` + support-follow-up rows behind
 * `aggregateMyDayFeed`. Rationale, and why `doNext` is derived rather than
 * seeded, live on `QA_FIXTURE_MY_DAY` in `src/lib/tenancy/qa-org.ts`.
 */
async function seedMyDayFixtures(
  client: PoolClient,
  orgId: string,
  adminStaffId: number,
  orderRowIds: { pendingId: number; pendingSecondId: number; pendingThirdId: number },
) {
  const lanes = [
    { entityId: orderRowIds.pendingId, ...QA_FIXTURE_MY_DAY.overdue },
    { entityId: orderRowIds.pendingSecondId, ...QA_FIXTURE_MY_DAY.dueToday },
    { entityId: orderRowIds.pendingThirdId, ...QA_FIXTURE_MY_DAY.upcoming },
  ];

  for (const lane of lanes) {
    // Deadline at 20:00Z — mid-afternoon Pacific on the same civil day all year,
    // so the horizon bucket cannot flip with daylight saving. `myDayDueHorizon`
    // compares CIVIL DAYS in the warehouse zone, not instants.
    const deadlineSql = `(date_trunc('day', NOW() AT TIME ZONE 'UTC') + make_interval(days => $4) + interval '20 hours') AT TIME ZONE 'UTC'`;

    // Idempotent by the natural key this LATERAL selects on (entity + work type
    // + open status), not by id — a re-provision must refresh the deadline so
    // "overdue" stays overdue relative to TODAY rather than to first seed day.
    const updated = await client.query(
      `UPDATE work_assignments
          SET assigned_tech_id = $2,
              deadline_at      = ${deadlineSql},
              priority         = $5,
              status           = 'ASSIGNED',
              updated_at       = NOW()
        WHERE organization_id = $1
          AND entity_type = 'ORDER'
          AND entity_id = $3
          AND work_type = 'TEST'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [orgId, adminStaffId, lane.entityId, lane.dueInDays, QA_FIXTURE_MY_DAY.priority],
    );

    if (updated.rowCount === 0) {
      await client.query(
        // `assigned_tech_id` only — the baseline's `assignee_staff_id` was
        // RENAMED to it, so the old name no longer exists on this table.
        `INSERT INTO work_assignments
           (organization_id, entity_type, entity_id, work_type,
            assigned_tech_id, status, priority, deadline_at, notes)
         VALUES ($1, 'ORDER', $3, 'TEST', $2, 'ASSIGNED', $5, ${deadlineSql}, 'QA fixture — Today lane')`,
        [orgId, adminStaffId, lane.entityId, lane.dueInDays, QA_FIXTURE_MY_DAY.priority],
      );
    }
  }

  // The undated interrupt. UNIQUE (organization_id, zendesk_ticket_id) makes the
  // upsert the idempotency; no support_tickets row is seeded on purpose, so the
  // subject stays null and the row titles itself from the ticket id.
  await client.query(
    `INSERT INTO support_ticket_assignments
       (organization_id, zendesk_ticket_id, assigned_staff_id, assigned_by)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (organization_id, zendesk_ticket_id)
     DO UPDATE SET assigned_staff_id = EXCLUDED.assigned_staff_id, updated_at = NOW()`,
    [orgId, QA_FIXTURE_MY_DAY.interruptTicketId, adminStaffId],
  );

  log(
    'Today fixtures',
    `3 TEST assignments (overdue/due-today/upcoming) on staff #${adminStaffId} + 1 support follow-up`,
  );
}

/**
 * Mirror ZENDESK_* into the QA org vault when present.
 *
 * Non-dogfood orgs do not fall back to env credentials
 * (`capability-connections` / `credentials.ts`), so `/api/support/suggest`
 * 503s at the helpdesk gate on a fresh QA tenant even when the deployment
 * has working Zendesk env. That makes an Assist E2E pass vacuously on the
 * 503. Upserting the same sandbox/dev token the dogfood bridge uses clears
 * `isConfigured()` — ticket payloads for the Assist contract spec are still
 * stubbed; this only opens the gate.
 *
 * Skips quietly when any of subdomain / email / token is missing so a local
 * without Zendesk can still provision.
 */
async function seedHelpdeskConnection(orgId: string) {
  const subdomain = (process.env.ZENDESK_SUBDOMAIN || '').trim();
  const email = (process.env.ZENDESK_EMAIL || process.env.ZENDESK_API_USER || '').trim();
  const apiToken = (process.env.ZENDESK_API_TOKEN || '').trim();
  if (!subdomain || !email || !apiToken) {
    log('Helpdesk vault', 'skipped — ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN not all set');
    return;
  }
  await upsertIntegrationCredentials({
    orgId: orgId as OrgId,
    provider: 'zendesk',
    payload: { subdomain, email, apiToken },
    displayLabel: 'Zendesk (QA sandbox mirror)',
  });
  log('Helpdesk vault', `zendesk connected for ticket #${QA_FIXTURE_SUPPORT.ticketId}`);
}

/**
 * Media Library evidence — metadata-only `photos` rows + their polymorphic
 * links, so `/ops/photos` has a real stream on the QA org.
 *
 * Until 2026-08-09 this provisioner seeded ZERO photos, so every Media Library
 * spec on `--project=qa-desktop` either failed or skipped itself with "no photos
 * seeded in this environment". Rationale for metadata-only, and for deriving
 * stage/sourceScope from the LINK shape rather than storing them, lives on
 * {@link QA_FIXTURE_PHOTOS} — read it before adding a column here.
 *
 * Idempotent by delete-then-insert on `(organization_id, po_ref)`: `photos` has
 * no natural key to `ON CONFLICT` against, and `photo_entity_links` cascades on
 * `photo_id`.
 *
 * Resolves the carton and line by the existing QA constants rather than taking
 * ids from `seedReceivingFixture` — that keeps this additive, so it does not
 * change a signature another lane may be editing.
 */
async function seedPhotoFixtures(client: PoolClient, orgId: string, adminStaffId: number) {
  const cartonRes = await client.query<{ id: number }>(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
      LIMIT 1`,
    [orgId, QA_FIXTURE_PO_ID],
  );
  const receivingId = cartonRes.rows[0] ? Number(cartonRes.rows[0].id) : null;
  if (receivingId == null) {
    log('Media Library', 'skipped — the receiving fixture carton is missing');
    return;
  }

  const lineRes = await client.query<{ id: number }>(
    // `item_name`, not `title` — and newest-first, because seedReceivingFixture
    // INSERTs its lines fresh on every provision rather than upserting.
    `SELECT id FROM receiving_line
      WHERE organization_id = $1 AND receiving_id = $2 AND item_name = $3
      ORDER BY id DESC
      LIMIT 1`,
    [orgId, receivingId, QA_FIXTURE_TESTED_LINE.title],
  );
  const lineId = lineRes.rows[0] ? Number(lineRes.rows[0].id) : null;

  await client.query(`DELETE FROM photos WHERE organization_id = $1 AND po_ref = $2`, [
    orgId,
    QA_FIXTURE_PHOTOS.poRef,
  ]);

  const seeds = [
    ...QA_FIXTURE_PHOTOS.carton.map((p) => ({
      ...p,
      entityType: 'RECEIVING' as const,
      entityId: receivingId,
    })),
    ...(lineId == null
      ? []
      : QA_FIXTURE_PHOTOS.line.map((p) => ({
          ...p,
          entityType: 'RECEIVING_LINE' as const,
          entityId: lineId,
        }))),
  ];

  for (const seed of seeds) {
    const photoRes = await client.query<{ id: number }>(
      `INSERT INTO photos
         (organization_id, taken_by_staff_id, photo_type, po_ref, created_at, client_captured_at)
       VALUES (
         $1, $2, $3, $4,
         now() - make_interval(days => $5::int),
         CASE WHEN $6::boolean THEN now() - make_interval(days => $5::int) ELSE NULL END
       )
       RETURNING id`,
      [orgId, adminStaffId, seed.photoType, QA_FIXTURE_PHOTOS.poRef, seed.ageDays, seed.captured],
    );
    const photoId = Number(photoRes.rows[0]!.id);
    await client.query(
      `INSERT INTO photo_entity_links
         (photo_id, organization_id, entity_type, entity_id, link_role)
       VALUES ($1, $2, $3, $4, 'primary')
       ON CONFLICT DO NOTHING`,
      [photoId, orgId, seed.entityType, seed.entityId],
    );
  }

  log(
    'Media Library',
    `${seeds.length} photos carton=${receivingId} ` +
      (lineId == null
        ? '(no tested line — the unbox_item stage is unseeded)'
        : `line=${lineId} (stages arrival_package · unbox_carton · unbox_item)`),
  );
}

export async function reseedQaFixtures(pool: Pool, orgId: string, adminStaffId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setOrgGuc(client, orgId);
    await seedSkus(client, orgId);
    await seedZohoItems(client, orgId);
    // Packing DESK/STAGING benches — QA-prefixed barcodes (locations.name/barcode
    // are still globally unique). Requires location_kind migration applied.
    const { seedPackingStationsForOrg } = await import('@/lib/packing/pack-placement');
    await seedPackingStationsForOrg(client, orgId, {
      barcodePrefix: 'QA-',
      namePrefix: 'QA ',
    });
    // A loose serialized unit for Phase 2 unit pack placement (Ready-to-Pack
    // loose-unit staging). unit_uid is printed-unit-id-shaped so looksLikeUnitId
    // fires; the move route resolves it by unit_uid. On-floor status so it counts.
    await client.query(
      `INSERT INTO serial_units (organization_id, serial_number, normalized_serial, unit_uid, sku, current_status)
         SELECT $1::uuid, $2, $3, $4, $5, 'TESTED'
        WHERE NOT EXISTS (
          SELECT 1 FROM serial_units WHERE organization_id = $1::uuid AND normalized_serial = $3
        )`,
      [
        orgId,
        QA_FIXTURE_UNIT.unitUid,
        QA_FIXTURE_UNIT.normalizedSerial,
        QA_FIXTURE_UNIT.unitUid,
        QA_FIXTURE_SKUS.speaker,
      ],
    );
    // Re-provisioning is the documented clean slate, so the pack floor must come
    // back EMPTY. A bench placement survives the upsert above (it keys on the
    // unit, not the row), so a spec that stages the fixture unit passed once and
    // then 409'd `SAME_LOCATION` on every later run — the placement it created
    // was still there. Clear the current-placement ledgers; the `*_events`
    // history is append-only and deliberately left intact.
    await client.query(
      `DELETE FROM unit_pack_placements WHERE organization_id = $1::uuid`,
      [orgId],
    );
    await client.query(
      `DELETE FROM order_pack_placements WHERE organization_id = $1::uuid`,
      [orgId],
    );
    await seedReceivingFixture(client, orgId, adminStaffId);
    await seedPhotoFixtures(client, orgId, adminStaffId);
    await seedIncomingFixture(client, orgId);
    const orderRowIds = await seedOrderFixtures(client, orgId);
    await seedDemoOrderVolume(client, orgId);
    await seedMyDayFixtures(client, orgId, adminStaffId, orderRowIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  // Vault write is outside the fixtures txn — upsertIntegrationCredentials
  // uses the shared pool and its own encryption path.
  await seedHelpdeskConnection(orgId);
}

export default { reseedQaFixtures };

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
    // Always ensure org + admin (email+password) — fixtures-only still refreshes
    // the QA Admin password so `/signin` stays usable after env changes.
    await ensureOrganization(pool, orgId);
    staffId = await ensureAdminStaff(pool, orgId);
    if (!FIXTURES_ONLY) {
      await ensureStationStaff(pool, orgId);
      await enableFeatureFlags(pool, orgId);
      await seedCatalogAndWorkflow(orgId, staffId);
    }

    await reseedQaFixtures(pool, orgId, staffId);

    if (process.argv.includes('--verify')) {
      await verifyIsolation(pool, orgId);
    }

    console.log('\n── QA org ready ──');
    console.log(`  Email:   ${QA_ADMIN_EMAIL}`);
    console.log(`  Pass:    (QA_ADMIN_PASSWORD / default CycleForge-QA-local!)`);
    console.log(`  PIN:     ${QA_ADMIN_PIN}  (station fallback; set QA_ADMIN_PIN to override)`);
    console.log(`  Org:     ${QA_ORG_NAME} (${orgId})`);
    console.log(`  Scan:    ${QA_FIXTURE_TRACKING} in receiving`);
    console.log(`  Env:     QA_ORG_ID=${orgId}`);
    console.log(`           PW_QA_STAFF_NAME="${QA_ADMIN_NAME}"\n`);
  } finally {
    await pool.end();
  }
}

// Importing this file from the authenticated QA route must not execute the CLI.
// The argv check keeps `pnpm provision:qa-org` behavior unchanged.
if (process.argv[1]?.endsWith('provision-qa-org.ts')) {
  main().catch((err) => {
    console.error('provision-qa-org failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
