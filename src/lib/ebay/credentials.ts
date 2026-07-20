/**
 * eBay account + app-credential accessors.
 *
 * Centralizes the decrypt + tenantQuery patterns that were previously inlined
 * (and read process.env directly) across connect/callback/client/refresh.
 *
 * Tenancy model (decided): "shared eBay app, many sellers." App-level
 * credentials (appId/certId/ruName/environment) resolve to:
 *   1. the org's own organization_integrations row, if present (future BYO app), then
 *   2. the SHARED platform eBay app from env (the standard SaaS model — one
 *      registered eBay app + RuName that every tenant's sellers grant consent
 *      to). Only the per-seller TOKENS are per-tenant, in ebay_accounts.
 *
 * getIntegrationCredentials already mirrors USAV's env creds for DOGFOOD_ORG_ID;
 * the explicit env fallback in (2) extends that to every other tenant for the
 * shared app — which is exactly the chosen model.
 */
import { normalizeEnvValue } from '@/lib/env-utils';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  markIntegrationError,
  type EbayCredentials,
} from '@/lib/integrations/credentials';
import { readEbayToken } from './token-refresh';
import { normalizeEbayEnvironment, normalizeEbayRole, type EbayEnvironment } from './oauth-config';

// Re-exported from account-predicates for callers; local import used below.
export {
  EBAY_PLATFORM_PREDICATE,
  EBAY_SELLER_ROLE_PREDICATE,
} from './account-predicates';
import { EBAY_PLATFORM_PREDICATE } from './account-predicates';

export interface EbayAppCreds {
  appId: string;
  certId: string;
  ruName: string;
  environment: EbayEnvironment;
}

/**
 * Resolve the eBay OAuth app credentials to use for an org. See the tenancy
 * note above. Returns null only when neither a per-org row nor the shared env
 * app is configured.
 */
export async function getEbayAppCreds(orgId: OrgId): Promise<EbayAppCreds | null> {
  // 1. Per-org app credentials (BYO eBay app) take precedence when present.
  //    For USAV this also covers the env fallback baked into getIntegrationCredentials.
  const orgCreds = await getIntegrationCredentials<EbayCredentials>(orgId, 'ebay');
  if (orgCreds?.appId && orgCreds.certId && orgCreds.ruName) {
    return {
      appId: orgCreds.appId,
      certId: orgCreds.certId,
      ruName: orgCreds.ruName,
      environment: normalizeEbayEnvironment(orgCreds.environment),
    };
  }

  // 2. Shared platform eBay app from env (one app, many sellers).
  const appId = normalizeEnvValue(process.env.EBAY_APP_ID);
  const certId = normalizeEnvValue(process.env.EBAY_CERT_ID);
  const ruName = normalizeEnvValue(process.env.EBAY_RU_NAME);
  if (appId && certId && ruName) {
    return { appId, certId, ruName, environment: normalizeEbayEnvironment(process.env.EBAY_ENVIRONMENT) };
  }

  return null;
}

export interface EbayAccount {
  id: number;
  accountName: string;
  ebayUserId: string | null;
  accountRole: 'seller' | 'buyer';
  /** Decrypted access token (plaintext or AES-GCM envelope handled transparently). */
  accessToken: string | null;
  /** Decrypted refresh token. */
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  isActive: boolean;
}

interface EbayAccountDbRow {
  id: number;
  account_name: string;
  ebay_user_id: string | null;
  account_role: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | Date | null;
  refresh_token_expires_at: string | Date | null;
  is_active: boolean;
}

function mapAccount(row: EbayAccountDbRow): EbayAccount {
  return {
    id: row.id,
    accountName: row.account_name,
    ebayUserId: row.ebay_user_id,
    accountRole: normalizeEbayRole(row.account_role),
    accessToken: row.access_token ? safeReadToken(row.access_token) : null,
    refreshToken: row.refresh_token ? safeReadToken(row.refresh_token) : null,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
    refreshTokenExpiresAt: row.refresh_token_expires_at ? new Date(row.refresh_token_expires_at) : null,
    isActive: row.is_active,
  };
}

function safeReadToken(stored: string): string | null {
  try {
    return readEbayToken(stored);
  } catch {
    return null;
  }
}

const ACCOUNT_COLUMNS = `id, account_name, ebay_user_id, account_role, access_token, refresh_token,
  token_expires_at, refresh_token_expires_at, is_active`;

/** Load a single eBay account (tokens decrypted) for an org, or null. */
export async function getEbayAccount(orgId: OrgId, accountName: string): Promise<EbayAccount | null> {
  const r = await tenantQuery(
    orgId,
    `SELECT ${ACCOUNT_COLUMNS}
       FROM ebay_accounts
      WHERE organization_id = $1 AND account_name = $2 AND ${EBAY_PLATFORM_PREDICATE}
      LIMIT 1`,
    [orgId, accountName],
  );
  const row = r.rows[0] as EbayAccountDbRow | undefined;
  return row ? mapAccount(row) : null;
}

/** Load all active eBay accounts (tokens decrypted) for an org. */
export async function listActiveEbayAccounts(orgId: OrgId): Promise<EbayAccount[]> {
  const r = await tenantQuery(
    orgId,
    `SELECT ${ACCOUNT_COLUMNS}
       FROM ebay_accounts
      WHERE organization_id = $1 AND is_active = true AND ${EBAY_PLATFORM_PREDICATE}
      ORDER BY account_name`,
    [orgId],
  );
  return (r.rows as EbayAccountDbRow[]).map(mapAccount);
}

/**
 * True when the org has ≥1 connected, active eBay BUYER account. The SoT
 * predicate for "eBay purchasing is connected" — used by the Studio inbound
 * publish gate and the connection-driven inbound-sources default
 * (src/lib/inbound/org-settings.ts). No token decryption; just a COUNT.
 */
export async function hasConnectedEbayBuyerAccount(orgId: OrgId): Promise<boolean> {
  const r = await tenantQuery(
    orgId,
    `SELECT COUNT(*)::int AS n FROM ebay_accounts
      WHERE organization_id = $1 AND account_role = 'buyer' AND is_active = true
        AND ${EBAY_PLATFORM_PREDICATE}`,
    [orgId],
  );
  return ((r.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;
}

/**
 * Hard-delete an eBay account (disconnect). eBay has no token-revocation API,
 * so removing the stored tokens IS the revocation. Returns the deleted
 * account_name (for audit + vault cleanup) or null if nothing matched.
 */
export async function deleteEbayAccount(orgId: OrgId, id: number): Promise<string | null> {
  const r = await tenantQuery(
    orgId,
    `DELETE FROM ebay_accounts
      WHERE id = $1 AND organization_id = $2
      RETURNING account_name`,
    [id, orgId],
  );
  return (r.rows[0] as { account_name: string } | undefined)?.account_name ?? null;
}

/**
 * Mark an account as needing re-consent: the refresh token is dead
 * (revoked/expired), so deactivate it and surface an error on the org's
 * integration so the Settings card prompts a reconnect.
 */
export async function markEbayAccountNeedsReconsent(
  orgId: OrgId,
  accountName: string,
  reason: string,
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE ebay_accounts
        SET is_active = false, updated_at = NOW()
      WHERE organization_id = $1 AND account_name = $2`,
    [orgId, accountName],
  );
  try {
    await markIntegrationError(orgId, 'ebay', `Re-authorization required (${accountName}): ${reason}`);
  } catch {
    /* org may have no organization_integrations row (env-only USAV) — non-fatal */
  }
}
