/** Normalized connection reader — a typed, capability-aware view of an org's integrations, built from the `organization_integrations` vault… */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { entitlementsForPlan } from '@/lib/billing/plans';
import { isPlanFeatureExemptOrg, planFeatureEnforced } from '@/lib/billing/plan-feature-gate';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getConnector } from './registry';
import type { ConnectionState, ConnectionStatus } from './types';

interface IntegrationRow {
  provider: string;
  status: string;
  display_label: string | null;
  scope: string | null;
  last_error: string | null;
  last_used_at: Date | null;
  updated_at: Date | null;
  created_at: Date | null;
}

function rowToState(status: string): ConnectionState {
  switch (status) {
    case 'active':
      return 'active';
    case 'error':
      return 'error';
    case 'revoked':
      return 'revoked';
    default:
      return 'disconnected';
  }
}

function toStatus(row: IntegrationRow): ConnectionStatus {
  const provider = row.provider as IntegrationProvider;
  const connector = getConnector(row.provider);
  return {
    provider,
    connected: row.status === 'active',
    state: rowToState(row.status),
    authKind: connector?.authKind ?? 'vault',
    capabilities: connector?.capabilities ?? [],
    displayLabel: row.display_label,
    scope: row.scope,
    lastError: row.last_error,
    lastUsedAt: row.last_used_at,
    connectedAt: row.created_at,
  };
}

const BASE_SELECT = `
  SELECT provider, status, display_label, scope, last_error, last_used_at, updated_at, created_at
    FROM organization_integrations
   WHERE organization_id = $1`;

/** All of an org's integration connections, newest-meaningful first. */
export async function listConnections(orgId: OrgId): Promise<ConnectionStatus[]> {
  const r = await pool.query<IntegrationRow>(`${BASE_SELECT} ORDER BY provider ASC, scope NULLS FIRST`, [orgId]);
  return r.rows.map(toStatus);
}

/** A single provider connection (optionally scoped), or null when absent. */
export async function getConnectionStatus(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
): Promise<ConnectionStatus | null> {
  const r = await pool.query<IntegrationRow>(
    `${BASE_SELECT} AND provider = $2 AND COALESCE(scope, '') = COALESCE($3, '') LIMIT 1`,
    [orgId, provider, scope],
  );
  return r.rows[0] ? toStatus(r.rows[0]) : null;
}

/** Count of distinct connected providers — the unit `plans.ts.maxIntegrations` is measured in. */
export async function countConnectedProviders(orgId: OrgId): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM (
       SELECT DISTINCT provider
         FROM organization_integrations
        WHERE organization_id = $1 AND status = 'active'
       UNION
       SELECT 'ebay'::text
         WHERE EXISTS (
           SELECT 1 FROM ebay_accounts
            WHERE organization_id = $1
              AND is_active = true
              AND (platform = 'EBAY' OR platform IS NULL)
         )
       UNION
       SELECT 'amazon'::text
         WHERE EXISTS (
           SELECT 1 FROM amazon_accounts
            WHERE organization_id = $1 AND is_active = true
         )
     ) providers`,
    [orgId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** True when the org already has any connection for this provider (any vault
 *  scope, or an active ebay/amazon account row). Reconnecting / adding another
 *  account for the same provider must not hit the plan ceiling. */
async function hasAnyProviderConnection(
  orgId: OrgId,
  provider: IntegrationProvider,
): Promise<boolean> {
  const vault = await pool.query(
    `SELECT 1 FROM organization_integrations
      WHERE organization_id = $1 AND provider = $2 AND status = 'active'
      LIMIT 1`,
    [orgId, provider],
  );
  if (vault.rows[0]) return true;

  if (provider === 'ebay') {
    const r = await pool.query(
      `SELECT 1 FROM ebay_accounts
        WHERE organization_id = $1 AND is_active = true
          AND (platform = 'EBAY' OR platform IS NULL)
        LIMIT 1`,
      [orgId],
    );
    return Boolean(r.rows[0]);
  }
  if (provider === 'amazon') {
    const r = await pool.query(
      `SELECT 1 FROM amazon_accounts
        WHERE organization_id = $1 AND is_active = true
        LIMIT 1`,
      [orgId],
    );
    return Boolean(r.rows[0]);
  }
  return false;
}

export interface IntegrationLimit {
  used: number;
  /** Plan ceiling; 0 means unlimited (pro/enterprise). */
  max: number;
  unlimited: boolean;
  atLimit: boolean;
}

/** Where the org stands against its plan's `maxIntegrations` ceiling. */
export async function integrationLimitStatus(orgId: OrgId): Promise<IntegrationLimit> {
  const [used, org] = await Promise.all([countConnectedProviders(orgId), getOrganization(orgId)]);
  const max = entitlementsForPlan(org?.plan ?? 'trial').maxIntegrations;
  const unlimited = max === 0;
  return { used, max, unlimited, atLimit: !unlimited && used >= max };
}

/** True if connecting a NEW provider would exceed the plan ceiling. Updating an
 *  already-connected provider is always allowed (it doesn't add to the count). */
export async function wouldExceedIntegrationLimit(
  orgId: OrgId,
  provider: IntegrationProvider,
): Promise<boolean> {
  if (await hasAnyProviderConnection(orgId, provider)) return false;
  const { atLimit } = await integrationLimitStatus(orgId);
  return atLimit;
}

/** The typed 403 body every connect/start route returns when the plan's
 *  `maxIntegrations` ceiling would be exceeded. Shape is a contract with the
 *  settings UI (upgrade CTA keys off `error: 'PLAN_LIMIT'` + `upgrade: true`). */
export interface PlanLimitRefusal {
  ok: false;
  error: 'PLAN_LIMIT';
  limit: 'maxIntegrations';
  upgrade: true;
}

/** Entitlement guard for EVERY integration connect/start path (eBay, Amazon, Google Drive, Nango session, …). */
export async function assertCanConnectProvider(
  orgId: OrgId,
  provider: IntegrationProvider,
): Promise<PlanLimitRefusal | null> {
  if (!planFeatureEnforced()) return null;
  if (isPlanFeatureExemptOrg(orgId)) return null;
  try {
    const exceeds = await wouldExceedIntegrationLimit(orgId, provider);
    if (!exceeds) return null;
    return { ok: false, error: 'PLAN_LIMIT', limit: 'maxIntegrations', upgrade: true };
  } catch (err) {
    console.warn(
      '[connections] assertCanConnectProvider failed open:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
