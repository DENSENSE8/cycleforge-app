/**
 * Prune RETIRED permission ids out of role grants and staff overrides.
 *
 * A permission that was collapsed into another one (or deleted outright) keeps
 * living in `roles.permissions` and `staff.permissions_added/_removed` as a
 * string that resolves to nothing. `audit-permissions` hard-fails on it, and
 * nobody can tell drift from debris.
 *
 * REMOVE ONLY — NEVER REMAP. Rewriting a retired id to its successor would GRANT
 * access the role does not have today (e.g. 'replenish.view' → 'sku_stock.view'
 * hands out live SKU-stock read). Deleting a dead string changes no effective
 * authorization: nothing in the app resolves it.
 *
 * Usage:
 *   tsx scripts/prune-retired-permission-grants.ts            # dry run (default)
 *   tsx scripts/prune-retired-permission-grants.ts --apply    # write
 *
 * Reads DATABASE_URL from .env / .env.local (owner pool — `roles` is a global,
 * non-RLS table and staff overrides are edited across orgs on purpose here).
 */

import { Pool } from 'pg';
import { REGISTRY_ALL_PERMISSIONS, type RegistryPermissionString } from '../src/lib/auth/permission-registry';

/**
 * Retired permission ids and why they are dead — the ONLY strings this script
 * will delete, so a typo can never strip a live grant.
 */
const RETIRED_PERMISSIONS: Record<string, string> = {
  'replenish.view':
    "collapsed into 'sku_stock.view' when replenish moved into the inventory page (src/lib/auth/permission-registry.ts:134); no code resolves it",
};

const apply = process.argv.includes('--apply');

function loadEnv(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config();
  } catch {
    /* dotenv optional — CI passes DATABASE_URL via env */
  }
}

async function main(): Promise<void> {
  loadEnv();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const retired = Object.keys(RETIRED_PERMISSIONS);
  // Guard against a retired id that is actually still registered — that would be
  // a live permission and pruning it WOULD change authorization.
  const stillLive = retired.filter((p) => REGISTRY_ALL_PERMISSIONS.has(p as RegistryPermissionString));
  if (stillLive.length) {
    console.error(`refusing to prune ids that are still in the registry: ${stillLive.join(', ')}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    for (const [perm, why] of Object.entries(RETIRED_PERMISSIONS)) {
      console.log(`\n${perm} — ${why}`);

      const roles = await pool.query<{ key: string }>(
        `SELECT key FROM roles WHERE $1 = ANY(permissions) ORDER BY key`,
        [perm],
      );
      const added = await pool.query<{ id: number; name: string }>(
        `SELECT id, name FROM staff WHERE $1 = ANY(permissions_added) ORDER BY id`,
        [perm],
      );
      const removed = await pool.query<{ id: number; name: string }>(
        `SELECT id, name FROM staff WHERE $1 = ANY(permissions_removed) ORDER BY id`,
        [perm],
      );

      console.log(`  roles granting it: ${roles.rowCount} ${roles.rows.map((r) => r.key).join(', ')}`);
      console.log(`  staff permissions_added: ${added.rowCount} ${added.rows.map((s) => `#${s.id}`).join(', ')}`);
      console.log(`  staff permissions_removed: ${removed.rowCount} ${removed.rows.map((s) => `#${s.id}`).join(', ')}`);

      if (!apply) continue;

      const r1 = await pool.query(
        `UPDATE roles SET permissions = array_remove(permissions, $1) WHERE $1 = ANY(permissions)`,
        [perm],
      );
      const r2 = await pool.query(
        `UPDATE staff SET permissions_added = array_remove(permissions_added, $1) WHERE $1 = ANY(permissions_added)`,
        [perm],
      );
      const r3 = await pool.query(
        `UPDATE staff SET permissions_removed = array_remove(permissions_removed, $1) WHERE $1 = ANY(permissions_removed)`,
        [perm],
      );
      console.log(`  APPLIED: roles=${r1.rowCount}, permissions_added=${r2.rowCount}, permissions_removed=${r3.rowCount}`);
    }

    console.log(apply ? '\n✓ prune applied' : '\n(dry run — re-run with --apply to write)');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('prune-retired-permission-grants failed:', err);
  process.exit(1);
});
