import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getMarketplaceParticipations } from '@/lib/amazon/client';
import { loadActiveAmazonAccounts, loadAmazonCreds } from '@/lib/amazon/accounts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/amazon/health */
export const GET = withAuth(async (req, ctx) => {
  const accounts = await loadActiveAmazonAccounts(ctx.organizationId);

  const results = await Promise.all(
    accounts.map(async (account) => {
      const creds = await loadAmazonCreds(ctx.organizationId, account);
      if (!creds?.refreshToken) {
        return { accountName: account.accountName, ok: false, error: 'No stored credentials — reconnect.' };
      }
      try {
        const marketplaces = await getMarketplaceParticipations(account, creds);
        return { accountName: account.accountName, ok: true, region: account.region, marketplaces };
      } catch (err: any) {
        return { accountName: account.accountName, ok: false, error: err?.message || String(err) };
      }
    }),
  );

  return NextResponse.json({
    ok: results.length > 0 && results.every((r) => r.ok),
    connected: results.length > 0,
    accounts: results,
  });
}, { permission: 'integrations.amazon' });
