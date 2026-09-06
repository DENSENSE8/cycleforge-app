/**
 * Server-side integration connection summary — safe metadata only.
 * Decrypts credentials only to build masked field hints; never returns secrets.
 */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  type IntegrationProvider,
} from './credentials';
import { getConnector } from './connectors/registry';
import { getConnectionStatus } from './connectors/connections';
import { buildConfiguredFieldHints } from './credential-payload';
import { PROVIDER_CATALOG } from '@/app/apps/registry';
import type { Capability } from './connectors/types';

export interface IntegrationAccountSummary {
  id?: number;
  label: string;
  status: string;
  detail?: string;
  role?: 'seller' | 'buyer';
  ebayUserId?: string | null;
}

export interface IntegrationSummary {
  provider: string;
  label: string;
  scope: string | null;
  status: 'active' | 'error' | 'revoked' | 'disconnected';
  connected: boolean;
  displayLabel: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  authKind: string;
  capabilities: Capability[];
  accounts: IntegrationAccountSummary[];
  configuredFields: ReturnType<typeof buildConfiguredFieldHints>;
  webhookUrl: string | null;
  connectMethod: string;
  healthPath: string | null;
  docsUrl: string | null;
  canSync: boolean;
}

function catalogDef(provider: string) {
  return PROVIDER_CATALOG.find((p) => p.key === provider) ?? null;
}

function relIso(d: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

async function loadAmazonAccounts(orgId: OrgId): Promise<IntegrationAccountSummary[]> {
  const r = await pool.query<{
    id: number;
    account_name: string;
    region: string | null;
    status: string | null;
    last_error: string | null;
  }>(
    `SELECT id, account_name, region, status, last_error
       FROM amazon_accounts WHERE organization_id = $1 AND is_active = true
       ORDER BY account_name`,
    [orgId],
  );
  return r.rows.map((a) => ({
    id: a.id,
    label: a.account_name,
    status: a.status === 'active' ? 'active' : a.status === 'revoked' ? 'revoked' : 'error',
    detail: [a.region, a.last_error].filter(Boolean).join(' · ') || undefined,
  }));
}

async function loadEbayAccounts(orgId: OrgId): Promise<IntegrationAccountSummary[]> {
  const r = await pool.query<{
    id: number;
    account_name: string;
    token_expires_at: Date | null;
    is_active: boolean | null;
    account_role: string | null;
    ebay_user_id: string | null;
  }>(
    `SELECT id, account_name, token_expires_at, is_active, account_role, ebay_user_id
       FROM ebay_accounts
      WHERE organization_id = $1 AND (platform = 'EBAY' OR platform IS NULL)
      ORDER BY account_role DESC, account_name`,
    [orgId],
  );
  return r.rows.map((e) => {
    const minutesLeft = e.token_expires_at
      ? Math.round((new Date(e.token_expires_at).getTime() - Date.now()) / 60000)
      : null;
    const status = e.is_active === false ? 'revoked' : minutesLeft != null && minutesLeft < 60 ? 'expiring' : 'active';
    const detail = e.is_active === false
      ? 'inactive'
      : minutesLeft == null
        ? undefined
        : minutesLeft <= 0
          ? 'token expired'
          : `token ${minutesLeft}m left`;
    return {
      id: e.id,
      label: e.account_name,
      status,
      detail,
      role: e.account_role === 'buyer' ? 'buyer' as const : 'seller' as const,
      ebayUserId: e.ebay_user_id,
    };
  });
}

async function buildWebhookUrl(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null,
): Promise<string | null> {
  const creds = await getIntegrationCredentials<Record<string, unknown>>(orgId, provider, { scope });
  if (!creds) return null;

  const appBase = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!appBase) return null;

  switch (provider) {
    case 'zoho': {
      const token = typeof creds.webhookToken === 'string' ? creds.webhookToken : null;
      return token ? `${appBase}/api/zoho/webhooks/${token}` : null;
    }
    case 'nextiva': {
      const token = typeof creds.webhookToken === 'string' ? creds.webhookToken : null;
      return token ? `${appBase}/api/integrations/nextiva/webhook/${token}` : null;
    }
    case 'shipstation': {
      const token = typeof creds.webhookToken === 'string' ? creds.webhookToken : null;
      return token ? `${appBase}/api/webhooks/shipstation/${token}` : null;
    }
    default:
      return null;
  }
}

export async function getIntegrationSummary(
  orgId: OrgId,
  provider: IntegrationProvider,
  scope: string | null = null,
): Promise<IntegrationSummary | null> {
  const def = catalogDef(provider);
  if (!def) return null;

  const connector = getConnector(provider);
  const conn = await getConnectionStatus(orgId, provider, scope);

  const rowR = await pool.query<{
    status: string;
    display_label: string | null;
    last_error: string | null;
    last_used_at: Date | null;
    created_at: Date | null;
    last_synced_at: Date | null;
    webhook_token: string | null;
  }>(
    `SELECT status, display_label, last_error, last_used_at, created_at, last_synced_at, webhook_token
       FROM organization_integrations
      WHERE organization_id = $1 AND provider = $2
        AND COALESCE(scope, '') = COALESCE($3, '')
      LIMIT 1`,
    [orgId, provider, scope],
  );
  const row = rowR.rows[0] ?? null;

  let accounts: IntegrationAccountSummary[] = [];
  if (def.connect === 'amazon') accounts = await loadAmazonAccounts(orgId);
  if (def.connect === 'ebay') accounts = await loadEbayAccounts(orgId);

  const vaultPayload = row?.status === 'active'
    ? await getIntegrationCredentials<Record<string, unknown>>(orgId, provider, { scope })
    : null;

  const configuredFields = buildConfiguredFieldHints(provider, vaultPayload);

  // Non-secret identity hints for OAuth providers
  if (vaultPayload) {
    if (provider === 'google_drive' && typeof vaultPayload.accountEmail === 'string') {
      const existing = configuredFields.find((f) => f.key === 'accountEmail');
      if (!existing) configuredFields.push({ key: 'accountEmail', configured: true, value: vaultPayload.accountEmail });
    }
    if (provider === 'gmail' && typeof vaultPayload.accountEmail === 'string') {
      const existing = configuredFields.find((f) => f.key === 'accountEmail');
      if (!existing) configuredFields.push({ key: 'accountEmail', configured: true, value: vaultPayload.accountEmail });
    }
    if (provider === 'grok' && typeof vaultPayload.accountEmail === 'string') {
      const existing = configuredFields.find((f) => f.key === 'accountEmail');
      if (!existing) configuredFields.push({ key: 'accountEmail', configured: true, value: vaultPayload.accountEmail });
    }
  }

  const connected = def.connect === 'amazon' || def.connect === 'ebay'
    ? accounts.length > 0
    : row?.status === 'active' || (conn?.connected ?? false);

  let status: IntegrationSummary['status'] = 'disconnected';
  if (row) {
    status = row.status === 'active' ? 'active' : row.status === 'revoked' ? 'revoked' : 'error';
  } else if (connected) {
    status = 'active';
  }

  const webhookUrl = await buildWebhookUrl(orgId, provider, scope);

  return {
    provider,
    label: def.label,
    scope,
    status,
    connected,
    displayLabel: row?.display_label ?? null,
    lastError: row?.last_error ?? conn?.lastError ?? null,
    lastUsedAt: relIso(row?.last_used_at ?? null),
    connectedAt: relIso(row?.created_at ?? conn?.connectedAt ?? null),
    lastSyncedAt: relIso(row?.last_synced_at ?? null),
    authKind: connector?.authKind ?? def.connect,
    capabilities: [...(connector?.capabilities ?? [])],
    accounts,
    configuredFields,
    webhookUrl,
    connectMethod: def.connect,
    healthPath: def.healthPath ?? connector?.healthPath ?? null,
    docsUrl: def.docsUrl ?? null,
    canSync: connected && Boolean(connector?.sync),
  };
}
