/**
 * GET /api/ebay/health
 * Live-checks each active eBay account for the current org.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { EbayClient } from '@/lib/ebay/client';
import { getEbayAppCreds, listActiveEbayAccounts } from '@/lib/ebay/credentials';
import { ebayIdentityEndpoint } from '@/lib/ebay/oauth-config';

export const GET = withAuth(async (_req, ctx) => {
  const accounts = await listActiveEbayAccounts(ctx.organizationId);

  if (accounts.length === 0) {
    return NextResponse.json({
      ok: false,
      connected: false,
      accounts: [],
      error: 'No eBay accounts connected yet. Add a selling or purchasing account first.',
    });
  }

  const creds = await getEbayAppCreds(ctx.organizationId);
  if (!creds) {
    return NextResponse.json({
      ok: false,
      connected: true,
      accounts: accounts.map((a) => ({
        accountName: a.accountName,
        role: a.accountRole,
        ok: false,
        error: 'eBay app credentials are not configured on the server.',
      })),
      error: 'eBay app credentials are not configured on the server.',
    });
  }

  const identityUrl = ebayIdentityEndpoint(creds.environment);

  const results = await Promise.all(
    accounts.map(async (acct) => {
      try {
        const client = new EbayClient(acct.accountName, ctx.organizationId);
        const { accessToken } = await client.getValidAccessToken();
        const resp = await fetch(identityUrl, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        if (resp.status === 401 || resp.status === 403) {
          return {
            accountName: acct.accountName,
            role: acct.accountRole,
            ok: false,
            error: 'Re-authorization required (token rejected by eBay).',
          };
        }
        if (!resp.ok) {
          return {
            accountName: acct.accountName,
            role: acct.accountRole,
            ok: false,
            error: `eBay identity check failed (HTTP ${resp.status}).`,
          };
        }
        return {
          accountName: acct.accountName,
          role: acct.accountRole,
          ok: true,
          ebayUserId: acct.ebayUserId,
          tokenExpiresAt: acct.tokenExpiresAt,
        };
      } catch (err: unknown) {
        return {
          accountName: acct.accountName,
          role: acct.accountRole,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    connected: true,
    accounts: results,
    error: failed.length === 1 ? failed[0].error : failed.length > 1 ? `${failed.length} accounts need attention` : undefined,
  });
}, { permission: 'integrations.ebay' });
