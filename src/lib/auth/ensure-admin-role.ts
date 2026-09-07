/**
 * WS2.2 — admin-role self-heal.
 *
 * Self-service signup wires the first admin via:
 *
 *   INSERT INTO staff_roles (staff_id, role_id)
 *   SELECT $1, r.id FROM roles r
 *    WHERE r.key = 'admin' AND r.organization_id = $org
 *   ON CONFLICT DO NOTHING
 *
 * That wire silently no-ops when this org's slice of `roles` was never seeded
 * (scripts/seed-roles.mjs never run for the org). The result is an admin
 * staffer with ZERO role assignments — and therefore zero permissions — with
 * no error to signal it.
 *
 * This helper guarantees the invariant "the first admin always ends up with
 * the admin role + permissions": it checks whether the wire landed, and if
 * not, seeds the org's admin role row (idempotent) and retries the wire.
 *
 * Since 2026-09-06 `roles` is per-org (organization_id NOT NULL, UNIQUE
 * (organization_id, key)) — every statement here is org-scoped and `orgId`
 * is REQUIRED. A key-only lookup would fan out to every org's row.
 *
 * Permission set: we use the LIVE registry SoT (`ALL_PERMISSIONS`) rather
 * than a copied 8-role matrix. Seeding admin with `Array.from(ALL_PERMISSIONS)`
 * is correct by construction and cannot drift. (Admin also short-circuits to
 * all permissions at runtime via `computeEffectivePermissions`, so the stored
 * row is belt-and-braces.) The non-admin system roles are intentionally NOT
 * re-inlined here; running seed-roles.mjs (per-org) remains the way to seed
 * the full taxonomy.
 *
 * Idempotent (ON CONFLICT DO NOTHING throughout) and safe to call inside the
 * signup transaction by passing the transaction client, so it shares the same
 * commit/rollback as the rest of signup.
 */

import type { Pool, PoolClient } from 'pg';
import dbPool from '@/lib/db';
import { ALL_PERMISSIONS, ADMIN_ROLE_KEY } from './permissions-shared';

type Executor = Pool | PoolClient;

async function adminWired(db: Executor, staffId: number, orgId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id
      WHERE sr.staff_id = $1 AND r.key = $2 AND r.organization_id = $3::uuid
      LIMIT 1`,
    [staffId, ADMIN_ROLE_KEY, orgId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Ensure `staffId` has the admin role wired, seeding the org's admin role row
 * first if this org's `roles` slice lacks it. Returns true if the admin-role
 * assignment exists after running.
 */
export async function ensureAdminRoleWired(
  staffId: number,
  orgId: string,
  db: Executor = dbPool,
): Promise<boolean> {
  // Fast path: the original wire already landed (roles taxonomy was seeded
  // for this org).
  if (await adminWired(db, staffId, orgId)) return true;

  // Seed the org's admin role row (idempotent). Permissions = the full live
  // registry set; metadata mirrors scripts/seed-roles.mjs so the row is
  // coherent with a later full seed.
  const adminPerms = Array.from(ALL_PERMISSIONS);
  await db.query(
    `INSERT INTO roles (organization_id, key, label, color, position, permissions, is_system)
     VALUES ($1::uuid, $2, 'Admin', '#1f2937', 1, $3::text[], true)
     ON CONFLICT (organization_id, key) DO NOTHING`,
    [orgId, ADMIN_ROLE_KEY, adminPerms],
  );

  // Retry the wire now that the org's admin role is guaranteed to exist.
  await db.query(
    `INSERT INTO staff_roles (staff_id, role_id)
     SELECT $1, r.id FROM roles r
      WHERE r.key = $2 AND r.organization_id = $3::uuid
     ON CONFLICT DO NOTHING`,
    [staffId, ADMIN_ROLE_KEY, orgId],
  );

  return adminWired(db, staffId, orgId);
}
