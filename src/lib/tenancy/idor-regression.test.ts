/** IDOR-by-global-id regression tests (Bucket 1). */

import 'dotenv/config'; // load .env before the HAS_DB check (db.ts loads it too, but later)
import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';

const HAS_DB = !!process.env.DATABASE_URL;
const ORG_A = '00000000-0000-0000-0000-0000000000aa';
const ORG_B = '00000000-0000-0000-0000-0000000000bb';

async function ensureOrgs(pool: { query: (t: string, p?: unknown[]) => Promise<unknown> }) {
  await pool.query(
    `INSERT INTO organizations (id, slug, name, plan)
       VALUES ($1, 'idor-iso-a', 'IDOR Iso A', 'trial'),
              ($2, 'idor-iso-b', 'IDOR Iso B', 'trial')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_A, ORG_B],
  );
}

test('IDOR: setStaffPin/verifyStaffPin reject cross-org (staff has NO RLS — predicate is the only guard)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { setStaffPin, verifyStaffPin, PinError } = await import('@/lib/auth/pin');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM staff WHERE name LIKE 'idor-test-%'`);
  const ins = await pool.query(
    `INSERT INTO staff (organization_id, name, role) VALUES ($1, 'idor-test-b', 'tech') RETURNING id`,
    [ORG_B],
  );
  const staffB = (ins.rows[0] as { id: number }).id;

  try {
    // C1: org A admin tries to reset org B staff's PIN → must be a no-op.
    await setStaffPin(staffB, '4729', ORG_A);
    const a1 = await pool.query(`SELECT pin_hash FROM staff WHERE id = $1`, [staffB]);
    ok((a1.rows[0] as { pin_hash: string | null }).pin_hash == null, 'cross-org setStaffPin must NOT set a PIN');

    // Same-org reset works.
    await setStaffPin(staffB, '4729', ORG_B);
    const a2 = await pool.query(`SELECT pin_hash FROM staff WHERE id = $1`, [staffB]);
    ok((a2.rows[0] as { pin_hash: string | null }).pin_hash != null, 'same-org setStaffPin must set the PIN');

    // M1/C1: cross-org verify → NOT_FOUND (never reveals the row or validates).
    let threw = false;
    try {
      await verifyStaffPin(staffB, '4729', ORG_A, { recordLogin: false });
    } catch (err) {
      threw = err instanceof PinError && err.code === 'NOT_FOUND';
    }
    ok(threw, 'cross-org verifyStaffPin must throw NOT_FOUND');

    // Same-org verify succeeds.
    const row = await verifyStaffPin(staffB, '4729', ORG_B, { recordLogin: false });
    strictEqual(row.id, staffB);
  } finally {
    await pool.query(`DELETE FROM staff WHERE name LIKE 'idor-test-%'`);
  }
});

test('IDOR: pin/create route rejects a staffId from another tenant (x-tenant-slug scope)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { POST } = await import('@/app/api/auth/pin/create/route');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM staff WHERE name LIKE 'idor-test-%'`);
  // Unenrolled (pin_hash NULL) staff in org B.
  const ins = await pool.query(
    `INSERT INTO staff (organization_id, name, role) VALUES ($1, 'idor-test-b2', 'tech') RETURNING id`,
    [ORG_B],
  );
  const staffB = (ins.rows[0] as { id: number }).id;
  try {
    // Request carries org A's tenant slug but targets org B's staff → must 404, never enroll.
    const req = new Request('http://localhost/api/auth/pin/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': 'idor-iso-a' },
      body: JSON.stringify({ staffId: staffB, pin: '4729' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    strictEqual(res.status, 404, 'cross-tenant pin/create must 404');
    const after = await pool.query(`SELECT pin_hash FROM staff WHERE id = $1`, [staffB]);
    ok((after.rows[0] as { pin_hash: string | null }).pin_hash == null, 'cross-tenant pin/create must NOT enroll the staff');
  } finally {
    await pool.query(`DELETE FROM staff WHERE name LIKE 'idor-test-%'`);
  }
});

test('leak: staff-picker on apex host (no x-tenant-slug) returns an EMPTY list — never org #1 staff', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { GET } = await import('@/app/api/auth/staff-picker/route');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM staff WHERE name LIKE 'apex-leak-%'`);
  // Seed an active enrolled staff in org A (stands in for the USAV dogfood org).
  await pool.query(
    `INSERT INTO staff (organization_id, name, role, status) VALUES ($1, 'apex-leak-a', 'tech', 'active')`,
    [ORG_A],
  );
  const prevDefault = process.env.DEFAULT_TENANT_SLUG;
  delete process.env.DEFAULT_TENANT_SLUG;
  try {
    const req = new Request('http://localhost/api/auth/staff-picker', { method: 'GET' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any);
    const body = (await res.json()) as { staff: unknown[] };
    strictEqual(body.staff.length, 0, 'apex host must not leak any tenant staff');
  } finally {
    if (prevDefault !== undefined) process.env.DEFAULT_TENANT_SLUG = prevDefault;
    await pool.query(`DELETE FROM staff WHERE name LIKE 'apex-leak-%'`);
  }
});

test('staff-picker on apex with a session returns that org\'s names — not staff # ids, not another tenant', { skip: !HAS_DB }, async () => {
  const { NextRequest } = await import('next/server');
  const { default: pool } = await import('@/lib/db');
  const { GET } = await import('@/app/api/auth/staff-picker/route');
  const { createSession } = await import('@/lib/auth/session');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM staff WHERE name LIKE 'apex-sess-%'`);
  const insA = await pool.query<{ id: number }>(
    `INSERT INTO staff (organization_id, name, role, status) VALUES ($1, 'apex-sess-a', 'admin', 'active') RETURNING id`,
    [ORG_A],
  );
  await pool.query(
    `INSERT INTO staff (organization_id, name, role, status) VALUES ($1, 'apex-sess-b', 'tech', 'active')`,
    [ORG_B],
  );
  const staffA = insA.rows[0]!.id;
  const prevDefault = process.env.DEFAULT_TENANT_SLUG;
  delete process.env.DEFAULT_TENANT_SLUG;
  let sid: string | null = null;
  try {
    const session = await createSession({ staffId: staffA, deviceKind: 'station' });
    sid = session.sid;
    const req = new NextRequest('http://localhost/api/auth/staff-picker', {
      headers: { cookie: `cf_sid=${session.sid}` },
    });
    const res = await GET(req);
    const body = (await res.json()) as { staff: { id: number; name: string }[] };
    ok(body.staff.some((s) => s.name === 'apex-sess-a'), 'session org staff name is listed');
    ok(!body.staff.some((s) => s.name === 'apex-sess-b'), 'other tenant must stay hidden');
    ok(!body.staff.some((s) => /^staff #\d+$/i.test(s.name)), 'picker must not emit staff # ids as names');
  } finally {
    if (sid) await pool.query(`DELETE FROM staff_sessions WHERE sid = $1`, [sid]);
    if (prevDefault !== undefined) process.env.DEFAULT_TENANT_SLUG = prevDefault;
    await pool.query(`DELETE FROM staff WHERE name LIKE 'apex-sess-%'`);
  }
});

test('leak: signin with a staffId from another tenant is rejected (org-scoped PIN verify)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { setStaffPin } = await import('@/lib/auth/pin');
  const { POST } = await import('@/app/api/auth/signin/route');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM staff WHERE name LIKE 'signin-leak-%'`);
  // Active, PIN-enrolled staff in org B.
  const ins = await pool.query(
    `INSERT INTO staff (organization_id, name, role, status) VALUES ($1, 'signin-leak-b', 'tech', 'active') RETURNING id`,
    [ORG_B],
  );
  const staffB = (ins.rows[0] as { id: number }).id;
  await setStaffPin(staffB, '4729', ORG_B);
  try {
    // Correct PIN, but the request carries org A's slug → cross-org → 404, never a session.
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': 'idor-iso-a' },
      body: JSON.stringify({ staffId: staffB, pin: '4729' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    // 404 = org-scoped miss; 429 = rate-limit also refuses a session (suite re-runs
    // share the PIN verify bucket — either status is a hard reject).
    ok([404, 429].includes(res.status), `cross-tenant signin must reject (got ${res.status})`);
    strictEqual(res.cookies.get('cf_sid')?.value || res.cookies.get('usav_sid')?.value || null, null, 'no session cookie on cross-tenant signin');
  } finally {
    await pool.query(`DELETE FROM staff WHERE name LIKE 'signin-leak-%'`);
  }
});

test('IDOR: assignments queries reject cross-org read/update/delete', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { createAssignment, getAssignmentById, updateAssignment, deleteAssignment } =
    await import('@/lib/neon/assignments-queries');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM work_assignments WHERE entity_id = 990000777`);

  const created = await createAssignment({
    organizationId: ORG_B, entityType: 'ORDER', entityId: 990000777, workType: 'TEST',
  });
  try {
    // C4: org A cannot see / mutate org B's assignment.
    strictEqual(await getAssignmentById(created.id, ORG_A), null, 'cross-org read must return null');
    strictEqual(await updateAssignment(created.id, { status: 'DONE' }, ORG_A), null, 'cross-org update must be a no-op');
    strictEqual(await deleteAssignment(created.id, ORG_A), false, 'cross-org delete must be a no-op');
    // Org B can.
    ok(await getAssignmentById(created.id, ORG_B), 'same-org read works');
    ok(await deleteAssignment(created.id, ORG_B), 'same-org delete works');
  } finally {
    await pool.query(`DELETE FROM work_assignments WHERE entity_id = 990000777`);
  }
});

test('IDOR: warranty mutations reject cross-org (run on owner pool — predicate is the only guard)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { updateClaimMeta, submitClaim, revertClaimStatus, restoreClaims } =
    await import('@/lib/warranty/mutations');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM warranty_claims WHERE claim_number LIKE 'WC-IDOR-%'`);

  // Seed two LOGGED claims owned by org B (minimal columns; status defaults but
  // we set it explicitly), plus one soft-deleted claim for the restore probe.
  const seed = async (claimNo: string, deleted = false) => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO warranty_claims (organization_id, claim_number, status, product_title, deleted_at)
         VALUES ($1, $2, 'LOGGED', 'orig-title', ${deleted ? 'NOW()' : 'NULL'})
       RETURNING id`,
      [ORG_B, claimNo],
    );
    return Number(rows[0].id); // bigint comes back as a string; routes pass parsed numbers
  };
  const metaId = await seed('WC-IDOR-META');
  const submitId = await seed('WC-IDOR-SUBMIT');
  const restoreId = await seed('WC-IDOR-RESTORE', true);

  const statusOf = async (id: number) =>
    ((await pool.query(`SELECT status FROM warranty_claims WHERE id = $1`, [id])).rows[0] as { status: string }).status;
  const titleOf = async (id: number) =>
    ((await pool.query(`SELECT product_title FROM warranty_claims WHERE id = $1`, [id])).rows[0] as { product_title: string }).product_title;
  const deletedOf = async (id: number) =>
    ((await pool.query(`SELECT deleted_at FROM warranty_claims WHERE id = $1`, [id])).rows[0] as { deleted_at: string | null }).deleted_at;

  try {
    // updateClaimMeta: cross-org → 404 + row unchanged; same-org → row changed.
    const metaA = await updateClaimMeta(metaId, { productTitle: 'hacked' }, null, ORG_A);
    strictEqual(metaA.ok, false, 'cross-org updateClaimMeta must fail');
    strictEqual(await titleOf(metaId), 'orig-title', 'cross-org updateClaimMeta must NOT change the row');
    await updateClaimMeta(metaId, { productTitle: 'legit' }, null, ORG_B);
    strictEqual(await titleOf(metaId), 'legit', 'same-org updateClaimMeta must change the row');

    // submitClaim (transition): cross-org → 404 + status unchanged; same-org advances.
    const subA = await submitClaim(submitId, null, ORG_A);
    strictEqual(subA.ok, false, 'cross-org submitClaim must fail');
    strictEqual(await statusOf(submitId), 'LOGGED', 'cross-org submitClaim must NOT advance status');
    await submitClaim(submitId, null, ORG_B);
    strictEqual(await statusOf(submitId), 'SUBMITTED', 'same-org submitClaim must advance status');

    // revertClaimStatus: cross-org → 404 (status stays SUBMITTED).
    const revA = await revertClaimStatus(submitId, null, ORG_A);
    strictEqual(revA.ok, false, 'cross-org revertClaimStatus must fail');
    strictEqual(await statusOf(submitId), 'SUBMITTED', 'cross-org revert must NOT change status');

    // restoreClaims: cross-org → notFound + still deleted; same-org un-tombstones.
    const restA = await restoreClaims([restoreId], null, ORG_A);
    ok(restA.notFound.includes(restoreId), 'cross-org restore must report notFound');
    ok((await deletedOf(restoreId)) != null, 'cross-org restore must NOT un-delete');
    const restB = await restoreClaims([restoreId], null, ORG_B);
    ok(restB.restored.some((r) => r.id === restoreId), 'same-org restore works');
    ok((await deletedOf(restoreId)) == null, 'same-org restore un-deletes');
  } finally {
    await pool.query(`DELETE FROM warranty_claims WHERE claim_number LIKE 'WC-IDOR-%'`);
  }
});

test('IDOR: repair-service queries reject cross-org read/update/link', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { createRepair, getRepairById, updateRepairNotes, linkRepairService } =
    await import('@/lib/neon/repair-service-queries');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM repair_service WHERE ticket_number = 'RS-IDOR-TEST'`);

  const repair = await createRepair(
    {
      ticketNumber: 'RS-IDOR-TEST',
      contactInfo: 'idor',
      productTitle: 'idor repair',
      price: '0',
      issue: 'idor',
      serialNumber: 'IDOR-RS-1',
    },
    ORG_B,
  );
  try {
    // Wave-2a pin: cross-org read → null (the route maps that to 404).
    strictEqual(await getRepairById(repair.id, ORG_A), null, 'cross-org read must return null');
    // Cross-org notes write → no-op (org predicate matches 0 rows, no error).
    await updateRepairNotes(repair.id, 'hacked', ORG_A);
    strictEqual((await getRepairById(repair.id, ORG_B))?.notes ?? null, null, 'cross-org updateRepairNotes must NOT change the row');
    // Cross-org link → 404, linkage untouched.
    const linkA = await linkRepairService(repair.id, { source_order_id: 'IDOR-X' }, ORG_A);
    strictEqual(linkA.ok, false, 'cross-org linkRepairService must 404');
    strictEqual((await getRepairById(repair.id, ORG_B))?.source_order_id ?? null, null, 'cross-org link must NOT set the field');
    // Org B can.
    await updateRepairNotes(repair.id, 'legit', ORG_B);
    strictEqual((await getRepairById(repair.id, ORG_B))?.notes, 'legit', 'same-org update works');
  } finally {
    await pool.query(`DELETE FROM repair_service WHERE ticket_number = 'RS-IDOR-TEST'`);
  }
});

test('IDOR: shipped-order lookups reject cross-org (id + tracking)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { getShippedOrderById, getShippedOrderByTracking } = await import('@/lib/neon/orders-queries');
  await ensureOrgs(pool);
  // Synthetic tracking; digits-only last-8 so the case-folded match is exact.
  const TRACKING = 'IDORTEST0084093157';
  const cleanup = async () => {
    await pool.query(`DELETE FROM orders WHERE order_id = 'IDOR-SHIP-B'`);
    await pool.query(`DELETE FROM shipping_tracking_numbers WHERE tracking_number_normalized = $1`, [TRACKING]);
  };
  await cleanup();

  // Seed a carrier-accepted shipment + order owned by org B (the CTE's
  // "shipped" gate requires a truthy carrier flag on the STN row).
  const stn = await pool.query(
    `INSERT INTO shipping_tracking_numbers
       (tracking_number_raw, tracking_number_normalized, carrier, is_carrier_accepted, organization_id)
     VALUES ($1, $1, 'UPS', true, $2) RETURNING id`,
    [TRACKING, ORG_B],
  );
  const shipmentId = Number((stn.rows[0] as { id: string | number }).id);
  const ord = await pool.query(
    `INSERT INTO orders (organization_id, order_id, product_title, shipment_id)
     VALUES ($1, 'IDOR-SHIP-B', 'idor shipped order', $2) RETURNING id`,
    [ORG_B, shipmentId],
  );
  const orderId = (ord.rows[0] as { id: number }).id;

  try {
    // Wave-2a pin: cross-org lookups resolve to null (routes turn that into 404).
    strictEqual(await getShippedOrderById(orderId, ORG_A), null, 'cross-org getShippedOrderById must return null');
    strictEqual(await getShippedOrderByTracking(TRACKING, ORG_A), null, 'cross-org getShippedOrderByTracking must return null');
    // Org B sees its own row through both lookups.
    strictEqual((await getShippedOrderById(orderId, ORG_B))?.order_id, 'IDOR-SHIP-B', 'same-org id lookup works');
    strictEqual((await getShippedOrderByTracking(TRACKING, ORG_B))?.order_id, 'IDOR-SHIP-B', 'same-org tracking lookup works');
  } finally {
    await cleanup();
  }
});

test('IDOR: suppliers queries reject cross-org read/update/delete', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const { createSupplier, getSupplierById, updateSupplier, softDeleteSupplier } =
    await import('@/lib/neon/suppliers-queries');
  await ensureOrgs(pool);
  await pool.query(`DELETE FROM suppliers WHERE name = 'idor-test-supplier'`);

  const supplier = await createSupplier({ name: 'idor-test-supplier' }, ORG_B);
  try {
    // H1: org A cannot see / mutate org B's supplier.
    strictEqual(await getSupplierById(supplier.id, ORG_A), null, 'cross-org read must return null');
    strictEqual(await updateSupplier(supplier.id, { notes: 'x' }, ORG_A), null, 'cross-org update must be a no-op');
    strictEqual(await softDeleteSupplier(supplier.id, ORG_A), null, 'cross-org soft-delete must be a no-op');
    // Org B can.
    ok(await getSupplierById(supplier.id, ORG_B), 'same-org read works');
  } finally {
    await pool.query(`DELETE FROM suppliers WHERE name = 'idor-test-supplier'`);
  }
});

/**
 * Compile-level pins — NEVER executed.
 * Compile-level pins — NEVER executed. Each `@ts-expect-error` asserts that a
 */
async function orgIdRequiredCompilePins(): Promise<void> {
  const warranty = await import('@/lib/warranty/mutations');
  // @ts-expect-error — updateClaimMeta requires orgId
  await warranty.updateClaimMeta(1, { productTitle: 'x' }, null);
  // @ts-expect-error — submitClaim requires orgId
  await warranty.submitClaim(1, null);
  // @ts-expect-error — approveClaim requires orgId
  await warranty.approveClaim(1, null);
  // @ts-expect-error — revertClaimStatus requires orgId
  await warranty.revertClaimStatus(1, null);
  // @ts-expect-error — softDeleteClaims requires orgId
  await warranty.softDeleteClaims([1], null);
  // @ts-expect-error — restoreClaims requires orgId
  await warranty.restoreClaims([1], null);

  const gmail = await import('@/lib/po-gmail/messages');
  // @ts-expect-error — listMessageIds requires orgId
  await gmail.listMessageIds('is:unread', 25, undefined);
  // @ts-expect-error — fetchMessage requires orgId
  await gmail.fetchMessage('msg-id');
  // @ts-expect-error — fetchMessagesByIds requires orgId
  await gmail.fetchMessagesByIds(['msg-id']);
  // @ts-expect-error — modifyLabels requires orgId
  await gmail.modifyLabels('msg-id', ['add'], ['remove']);
  // @ts-expect-error — getOrCreateLabel requires orgId
  await gmail.getOrCreateLabel('PO/Reconciled');

  const reconcile = await import('@/lib/po-gmail/reconcile-run');
  // @ts-expect-error — runPoMailboxReconcile requires opts.orgId
  await reconcile.runPoMailboxReconcile({ limit: 1 });
}
void orgIdRequiredCompilePins; // referenced (never called) so it counts as used
