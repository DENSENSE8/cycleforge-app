/**
 * eBay connector sync + validate + refresh adapters — wrap the EXISTING
 * per-account eBay sync (`syncAccountOrders`) and the /api/ebay/health check
 * logic so a connection drives ingestion and credential validation across the
 * org's active eBay accounts. Lazily imported by the registry so the
 * lightweight connection reader never pulls in the eBay client.
 *
 * User tokens live in organization_integrations (scoped seller:/buyer:).
 */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { EbayClient } from '@/lib/ebay/client';
import {
  EBAY_PLATFORM_PREDICATE,
  EBAY_SELLER_ROLE_PREDICATE,
  getEbayAppCreds,
  listActiveEbayAccounts,
  parseEbayAccountScope,
  patchEbayUserAccessToken,
  resolveEbayUserTokens,
  touchEbayAccountTokenExpiry,
} from '@/lib/ebay/credentials';
import { ebayIdentityEndpoint, ebayScopeStringForRole } from '@/lib/ebay/oauth-config';
import { refreshEbayAccessToken } from '@/lib/ebay/token-refresh';
import { syncAccountOrders } from '@/lib/ebay/sync';
import type { HealthResult, SyncOutcome, TokenEnvelope } from './types';

export async function ebaySync(orgId: OrgId): Promise<SyncOutcome> {
  // Seller accounts only — buyer purchasing tokens lack sell.fulfillment and
  // are synced by /api/cron/ebay/purchase-sync → Incoming.
  const { rows } = await pool.query<{ account_name: string }>(
    `SELECT account_name FROM ebay_accounts
      WHERE organization_id = $1 AND is_active = true
        AND ${EBAY_PLATFORM_PREDICATE}
        AND ${EBAY_SELLER_ROLE_PREDICATE}
      ORDER BY account_name`,
    [orgId],
  );
  if (rows.length === 0) return { ok: true, imported: 0, updated: 0 };

  let imported = 0;
  const errors: string[] = [];
  for (const { account_name } of rows) {
    try {
      const r = await syncAccountOrders(account_name, orgId);
      imported += r.createdOrders ?? 0;
    } catch (e) {
      errors.push(`${account_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: errors.length === 0, imported, error: errors.length ? errors.join('; ') : undefined };
}

/**
 * connector.refresh() — rotate one scoped vault connection (or all active
 * accounts when scope is null). Used by /api/cron/integrations/refresh.
 */
export async function ebayRefresh(
  orgId: OrgId,
  scope?: string | null,
): Promise<TokenEnvelope | null> {
  const parsed = parseEbayAccountScope(scope);
  const targets = parsed
    ? [{ accountName: parsed.accountSlug, role: parsed.role }]
    : (await listActiveEbayAccounts(orgId)).map((a) => ({
        accountName: a.accountName,
        role: a.accountRole,
      }));

  if (targets.length === 0) return null;

  const creds = await getEbayAppCreds(orgId);
  if (!creds) throw new Error('eBay app credentials are not configured');

  let last: TokenEnvelope | null = null;
  for (const t of targets) {
    const tokens = await resolveEbayUserTokens(orgId, t.accountName, t.role);
    const { accessToken, expiresIn } = await refreshEbayAccessToken(
      creds.appId,
      creds.certId,
      tokens.refreshToken,
      creds.environment,
      ebayScopeStringForRole(t.role),
    );
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await patchEbayUserAccessToken({
      orgId,
      role: t.role,
      accountName: t.accountName,
      accessToken,
      expiresAt,
    });
    await touchEbayAccountTokenExpiry(orgId, t.accountName, expiresAt);
    last = {
      accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: expiresAt.getTime(),
      accountRef: t.accountName,
    };
  }
  return last;
}

/**
 * connector.validate() (INT-011) — thin adapter over the /api/ebay/health
 * check: for each active account, getValidAccessToken() refreshes a
 * near-expiry token (a dead refresh token surfaces here), then a light
 * identity probe confirms eBay still accepts the token (401/403 ⇒ re-consent).
 */
export async function ebayValidate(orgId: OrgId): Promise<HealthResult> {
  const accounts = await listActiveEbayAccounts(orgId);
  if (accounts.length === 0) {
    return { ok: false, error: 'No active eBay accounts for this organization.' };
  }
  const creds = await getEbayAppCreds(orgId);
  const identityUrl = creds ? ebayIdentityEndpoint(creds.environment) : null;

  const results = await Promise.all(
    accounts.map(async (acct) => {
      try {
        const client = new EbayClient(acct.accountName, orgId);
        const { accessToken } = await client.getValidAccessToken(); // throws if refresh is dead
        if (identityUrl) {
          const resp = await fetch(identityUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          });
          if (resp.status === 401 || resp.status === 403) {
            return {
              accountName: acct.accountName,
              ok: false,
              error: 'Re-authorization required (token rejected by eBay).',
            };
          }
        }
        return { accountName: acct.accountName, ok: true as const };
      } catch (err) {
        return {
          accountName: acct.accountName,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const failures = results.filter((r) => !r.ok);
  return {
    ok: failures.length === 0,
    error: failures.length
      ? failures.map((f) => `${f.accountName}: ${f.error}`).join('; ')
      : undefined,
    detail: { accounts: results },
  };
}
