/** Per-tenant cron fan-out. */
import type { PoolClient } from 'pg';
import { adminPool } from '@/lib/db';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { EBAY_PLATFORM_PREDICATE } from '@/lib/ebay/credentials';

export interface OrgRunResult<T> {
  orgId: OrgId;
  ok: boolean;
  result?: T;
  error?: unknown;
}

/** Enumerate the tenant orgs to sweep. */
export async function listSweepOrgIds(): Promise<OrgId[]> {
  const { rows } = await adminPool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE status <> 'cancelled'`,
  );
  return rows.map((r) => r.id as OrgId);
}

/**
 * Run `fn` once per active org inside that org's tenant connection (GUC set).
 * Returns a per-org result list so callers can log partial failures. Never
 * throws for a single tenant's error — it's captured in the result.
 */
export async function forEachActiveOrg<T>(
  fn: (orgId: OrgId, client: PoolClient) => Promise<T>,
): Promise<OrgRunResult<T>[]> {
  const orgIds = await listSweepOrgIds();
  const results: OrgRunResult<T>[] = [];
  for (const orgId of orgIds) {
    try {
      const result = await withTenantConnection(orgId, (client) => fn(orgId, client));
      results.push({ orgId, ok: true, result });
    } catch (error) {
      console.error(`[forEachActiveOrg] org ${orgId} failed:`, error);
      results.push({ orgId, ok: false, error });
    }
  }
  return results;
}

/** Which orgs have `provider` connected. */
async function listOrgsWithProvider(provider: IntegrationProvider): Promise<OrgId[]> {
  if (provider === 'ebay') {
    const { rows } = await adminPool.query<{ organization_id: string }>(
      `SELECT DISTINCT organization_id FROM ebay_accounts
        WHERE is_active = true AND ${EBAY_PLATFORM_PREDICATE}`,
    );
    return rows.map((r) => r.organization_id as OrgId);
  }
  if (provider === 'amazon') {
    const { rows } = await adminPool.query<{ organization_id: string }>(
      `SELECT DISTINCT organization_id FROM amazon_accounts WHERE is_active = true`,
    );
    return rows.map((r) => r.organization_id as OrgId);
  }
  const { rows } = await adminPool.query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id FROM organization_integrations
      WHERE provider = $1 AND status = 'active'`,
    [provider],
  );
  return rows.map((r) => r.organization_id as OrgId);
}

/** Run `fn` once per org that has `provider` connected. */
export async function forEachOrgWithProvider<T>(
  provider: IntegrationProvider,
  fn: (orgId: OrgId) => Promise<T>,
): Promise<OrgRunResult<T>[]> {
  const orgIds = await listOrgsWithProvider(provider);
  const results: OrgRunResult<T>[] = [];
  for (const orgId of orgIds) {
    try {
      const result = await fn(orgId);
      results.push({ orgId, ok: true, result });
    } catch (error) {
      console.error(`[forEachOrgWithProvider:${provider}] org ${orgId} failed:`, error);
      results.push({ orgId, ok: false, error });
    }
  }
  return results;
}
