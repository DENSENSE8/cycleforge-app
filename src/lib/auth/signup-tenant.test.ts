/**
 * Live-DB signup provisioning test (SCALE-ROI row 6). Runs two signups inside
 * one BEGIN … ROLLBACK, so nothing persists. Asserts the multi-tenant
 * invariant: each new org gets its OWN system roles, and each owner is wired to
 * exactly one role — its own org's admin — never another tenant's.
 */

import 'dotenv/config';
import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';

const HAS_DB = !!process.env.DATABASE_URL;

test('signup provisions per-org roles and wires the owner to its own admin only', { skip: !HAS_DB }, async () => {
  // Dynamic: '@/lib/db' builds a pool at import time; skip cleanly when no DATABASE_URL.
  const { default: pool } = await import('@/lib/db');
  const { provisionSignupTenant } = await import('@/lib/auth/signup-tenant');
  const { SYSTEM_ROLE_SEED } = await import('@/lib/auth/ensure-admin-role');
  const { ADMIN_ROLE_KEY } = await import('@/lib/auth/permissions-shared');

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await provisionSignupTenant(client, `signup-test-a-${run}`, {
      companyName: 'Signup Test A',
      fullName: 'Owner A',
      email: `signup-test-a-${run}@example.invalid`,
      password: 'correct-horse-a',
    });
    const b = await provisionSignupTenant(client, `signup-test-b-${run}`, {
      companyName: 'Signup Test B',
      fullName: 'Owner B',
      email: `signup-test-b-${run}@example.invalid`,
      password: 'correct-horse-b',
      pin: '4729',
    });

    for (const t of [a, b]) {
      const roles = await client.query<{ key: string }>(
        `SELECT key FROM roles WHERE organization_id = $1 ORDER BY key`,
        [t.orgId],
      );
      deepStrictEqual(
        roles.rows.map((r) => r.key),
        SYSTEM_ROLE_SEED.map((s) => s.key).sort(),
        'new org must own a full copy of the system roles',
      );

      const wired = await client.query<{ organization_id: string; key: string }>(
        `SELECT r.organization_id, r.key
           FROM staff_roles sr JOIN roles r ON r.id = sr.role_id
          WHERE sr.staff_id = $1`,
        [t.staffId],
      );
      deepStrictEqual(
        wired.rows,
        [{ organization_id: t.orgId, key: ADMIN_ROLE_KEY }],
        'owner must hold exactly one role: its own org admin',
      );
    }

    // Provisioning B must not have touched A's role assignments (and vice versa).
    const crossWired = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM staff_roles sr JOIN roles r ON r.id = sr.role_id
        WHERE (sr.staff_id = $1 AND r.organization_id <> $2)
           OR (sr.staff_id = $3 AND r.organization_id <> $4)`,
      [a.staffId, a.orgId, b.staffId, b.orgId],
    );
    strictEqual(crossWired.rows[0]!.n, '0');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
});
