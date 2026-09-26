/** Tenant-scoped DB helper. */

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import pool, { tenantPool as configuredTenantPool } from '@/lib/db';
import { resolveTenantAppDatabaseUrl } from '@/lib/env-utils';
import { DOGFOOD_ORG_ID, type OrgId } from './constants';

/** Tenant-runtime pool, but only when TENANT_APP_DATABASE_URL is the same Neon compute as DATABASE_URL. */
const tenantPool = resolveTenantAppDatabaseUrl(
  process.env.DATABASE_URL || '',
  process.env.TENANT_APP_DATABASE_URL,
)
  ? configuredTenantPool
  : pool;

function assertOrgId(orgId: OrgId): void {
  if (!orgId || typeof orgId !== 'string') {
    throw new Error('withTenantConnection: orgId is required');
  }
  // Cheap UUID sanity check — keeps a malformed value from being injected
  // via SET LOCAL even though we always parameterize.
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(orgId)) {
    throw new Error(`withTenantConnection: orgId is not a UUID: ${orgId}`);
  }
}

export async function withTenantConnection<T>(
  orgId: OrgId,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertOrgId(orgId);
  // Use the tenant pool: once TENANT_APP_DATABASE_URL points at the non-bypass
  // app_tenant role (Phase E1), these GUC-scoped paths become RLS-subject and
  // per-table FORCE can be enabled. Until then tenantPool aliases the owner pool.
  const client = await tenantPool.connect();
  try {
    // Run the work inside a transaction and set the org GUC with SET LOCAL (is_local=true).
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow — client is discarded on release */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Convenience for routes that just want one query. Equivalent to:
 *   await withTenantConnection(orgId, c => c.query(sql, params))
 */
export async function tenantQuery<T extends QueryResultRow = QueryResultRow>(
  orgId: OrgId,
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  return withTenantConnection(orgId, (client) =>
    client.query<T>(text, params as unknown[] | undefined),
  );
}

/**
 * Transactional variant — explicit name for write paths. Now identical to
 * `withTenantConnection` (which is itself transactional with SET LOCAL), so it
 * delegates; the separate name documents write intent at call sites.
 */
export async function withTenantTransaction<T>(
  orgId: OrgId,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTenantConnection(orgId, fn);
}

/**
 * Transitional escape hatch:
 * @deprecated Use `ctx.organizationId` from withAuth instead.
 */
export function transitionalDogfoodOrgId(): OrgId {
  return DOGFOOD_ORG_ID;
}
