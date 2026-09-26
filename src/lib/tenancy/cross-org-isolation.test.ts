/** Cross-org isolation regression suite (Phase A4 / E4). */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import {
  ensureTestOrgs,
  appRolePool,
  enforcedRoleInvariant,
  proveRlsIsolatesForcedTable,
  TEST_ORG_A,
  TEST_ORG_B,
} from './cross-org-harness';

const HAS_DB = !!process.env.DATABASE_URL;
const HAS_APP_ROLE = !!process.env.TENANT_APP_DATABASE_URL;

// The invariant is asserted against the RUNTIME (tenant) pool, not the default owner pool.
test('enforced-role invariant: the runtime (tenant) pool role is not BYPASSRLS', { skip: !HAS_APP_ROLE }, async () => {
  const { tenantPool } = await import('@/lib/db');
  const inv = await enforcedRoleInvariant(tenantPool as any);
  ok(
    inv.ok && !inv.bypass,
    `runtime role '${inv.role}' has BYPASSRLS=${inv.bypass} while ${inv.forcedCount} table(s) are FORCEd — ` +
      `FORCE is inert under a bypass role. The tenant pool must run as a non-bypassrls role (Phase E1).`,
  );
});

test('RLS canary: policy isolates a real FORCEd table without a WHERE filter (needs app_tenant role)', { skip: !HAS_APP_ROLE }, async () => {
  const pool = await appRolePool();
  ok(pool, 'TENANT_APP_DATABASE_URL must resolve to a pool');
  try {
    await ensureTestOrgs(pool!);
    // serial_units is FORCEd (2026-06-20b) and populated for USAV — the real
    // proof that the policy, not an app filter, blocks cross-org reads. Uses an
    // existing table because the locked-down app_tenant role lacks CREATE.
    const r = await proveRlsIsolatesForcedTable(pool!, 'serial_units');
    ok(r.forced, 'serial_units must be FORCEd for this canary to be meaningful');
    ok(r.own > 0, 'the populated org sees its own serial_units rows under its GUC');
    strictEqual(r.cross, 0, "a different org must see 0 of the populated org's serial_units (RLS, no WHERE filter)");
  } finally {
    await pool!.end();
  }
});

// Per-table enforcement canary for the reason_codes slice.
test('reason_codes slice: RLS isolates the real table (arms once FORCEd)', { skip: !HAS_APP_ROLE }, async () => {
  const pool = await appRolePool();
  ok(pool, 'TENANT_APP_DATABASE_URL must resolve to a pool');
  try {
    const forced = await pool!.query(
      `SELECT relforcerowsecurity FROM pg_class WHERE oid = 'reason_codes'::regclass`,
    );
    if (!forced.rows[0]?.relforcerowsecurity) return; // slice not yet promoted — skip cleanly
    await ensureTestOrgs(pool!);
    const c = await pool!.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.current_org', $1, true)", [TEST_ORG_A]);
      // organization_id auto-stamps from the GUC-reading column default.
      await c.query(
        `INSERT INTO reason_codes (code, label, category, direction)
         VALUES ('__CANARY__', 'canary', 'adjustment', 'either')`,
      );
      const ownA = await c.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM reason_codes WHERE code = '__CANARY__'`,
      );
      strictEqual(ownA.rows[0].n, 1, 'org A sees its own reason_codes row');

      await c.query("SELECT set_config('app.current_org', $1, true)", [TEST_ORG_B]);
      const crossB = await c.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM reason_codes WHERE code = '__CANARY__'`,
      );
      strictEqual(crossB.rows[0].n, 0, "org B must see 0 of org A's reason_codes (RLS, no WHERE filter)");
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  } finally {
    await pool!.end();
  }
});

// Generic structural guard — maintenance-free, covers EVERY slice automatically.
test('every FORCEd table has a complete tenant_isolation policy', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  const forced = await pool.query<{ relname: string }>(
    `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity = true`,
  );
  for (const { relname } of forced.rows) {
    const pol = await pool.query<{ qual: string | null; with_check: string | null }>(
      `SELECT qual, with_check FROM pg_policies
        WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation'`,
      [relname],
    );
    strictEqual(pol.rows.length, 1, `FORCEd table '${relname}' is missing its tenant_isolation policy`);
    ok(pol.rows[0].qual, `'${relname}' tenant_isolation policy has no USING clause`);
    ok(pol.rows[0].with_check, `'${relname}' tenant_isolation policy has no WITH CHECK clause`);
  }
});
