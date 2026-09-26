/** eBay connector validate + refresh adapters — the /api/ebay/health check logic and scoped token rotation across the org's active eBay… */
import type { OrgId } from '@/lib/tenancy/constants';
import { EbayClient } from '@/lib/ebay/client';
import {
  getEbayAppCreds,
  listActiveEbayAccounts,
  parseEbayAccountScope,
  patchEbayUserAccessToken,
  resolveEbayUserTokens,
  touchEbayAccountTokenExpiry,
} from '@/lib/ebay/credentials';
import { ebayIdentityEndpoint, ebayScopeStringForRole } from '@/lib/ebay/oauth-config';
import { refreshEbayAccessToken } from '@/lib/ebay/token-refresh';
import type { HealthResult, TokenEnvelope } from './types';

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

/** connector.validate() (INT-011) — thin adapter over the /api/ebay/health check: */
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
