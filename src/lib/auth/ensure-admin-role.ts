/** WS2.2 — admin-role self-heal. */

import type { Pool, PoolClient } from 'pg';
import dbPool from '@/lib/db';
import { ALL_PERMISSIONS, ADMIN_ROLE_KEY } from './permissions-shared';

type Executor = Pool | PoolClient;

async function adminWired(db: Executor, staffId: number): Promise<boolean> {
  const r = await db.query(
    `SELECT 1
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id
      WHERE sr.staff_id = $1 AND r.key = $2
      LIMIT 1`,
    [staffId, ADMIN_ROLE_KEY],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Ensure `staffId` has the admin role wired, seeding the admin role row first if
 * the global `roles` table lacks it. Returns true if the admin-role assignment
 * exists after running.
 */
export async function ensureAdminRoleWired(
  staffId: number,
  db: Executor = dbPool,
): Promise<boolean> {
  // Fast path: the original wire already landed (roles taxonomy was seeded).
  if (await adminWired(db, staffId)) return true;

  // Seed the admin role row (idempotent). Permissions = the full live registry
  // set; metadata mirrors scripts/seed-roles.mjs so the row is coherent with a
  // later full seed.
  const adminPerms = Array.from(ALL_PERMISSIONS);
  await db.query(
    `INSERT INTO roles (key, label, color, position, permissions, is_system)
     VALUES ($1, 'Admin', '#1f2937', 1, $2::text[], true)
     ON CONFLICT (key) DO NOTHING`,
    [ADMIN_ROLE_KEY, adminPerms],
  );

  // Retry the wire now that the admin role is guaranteed to exist.
  await db.query(
    `INSERT INTO staff_roles (staff_id, role_id)
     SELECT $1, r.id FROM roles r WHERE r.key = $2
     ON CONFLICT DO NOTHING`,
    [staffId, ADMIN_ROLE_KEY],
  );

  return adminWired(db, staffId);
}
