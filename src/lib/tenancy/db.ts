/** Tenant-scoped DB helper. */

import type { Pool as PgPool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import pool, { tenantPool as configuredTenantPool } from '@/lib/db';
import { inlineSqlParams } from './inline-params';
import { resolveTenantAppDatabaseUrl } from '@/lib/env-utils';
import { DOGFOOD_ORG_ID, type OrgId } from './constants';
import { TX_TIMEOUT_SELECT_LIST } from './tx-timeouts';

/** Dedicated chat-assistant pool; pass as the `via` arg of the helpers below. */
export { assistantPool } from '@/lib/db';

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
  via: PgPool = tenantPool,
): Promise<T> {
  assertOrgId(orgId);
  // Use the tenant pool: once TENANT_APP_DATABASE_URL points at the non-bypass
  // app_tenant role (Phase E1), these GUC-scoped paths become RLS-subject and
  // per-table FORCE can be enabled. Until then tenantPool aliases the owner pool.
  // `via` lets the chat assistant use its own pool (`assistantPool`, same DSN).
  const client = await via.connect();
  try {
    // Run the work inside a transaction and set the org GUC with SET LOCAL (is_local=true).
    // BEGIN and the GUC travel as one simple-protocol message (one round trip, not two):
    // the explicit BEGIN keeps the block open past the message, so the setting holds for
    // `fn` and dies at COMMIT/ROLLBACK. orgId is UUID-checked above, so inlining it is safe.
    // The same SELECT arms server-side statement/lock/idle-in-tx timeouts (tx-timeouts.ts).
    await client.query(
      `BEGIN; SELECT set_config('app.current_org', '${orgId}', true), ${TX_TIMEOUT_SELECT_LIST}`,
    );
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
 * `tenantQuery` in ONE network round trip instead of three (BEGIN + set_config,
 * statement, COMMIT). The GUC and the statement travel as one simple-protocol
 * message, which Postgres runs as a single implicit transaction: the LOCAL
 * setting is visible to the statement and gone when it ends, so this is as
 * safe behind a transaction-pooling PgBouncer as `withTenantConnection`.
 *
 * Parameters are inlined as literals (`inlineSqlParams`) because the simple
 * protocol carries none. Read paths only — one statement, no write intent.
 */
export async function tenantQueryOneTrip<T extends QueryResultRow = QueryResultRow>(
  orgId: OrgId,
  text: string,
  params: ReadonlyArray<unknown> = [],
  via: PgPool = tenantPool,
): Promise<QueryResult<T>> {
  assertOrgId(orgId);
  const statement = inlineSqlParams(text, params);
  const client = await via.connect();
  try {
    const results = (await client.query(
      `SELECT set_config('app.current_org', '${orgId}', true), ${TX_TIMEOUT_SELECT_LIST};\n${statement}`,
    )) as unknown as Array<QueryResult<T>>;
    return results[results.length - 1];
  } finally {
    client.release();
  }
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
