import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { refreshEbayAccessToken } from '@/lib/ebay/token-refresh';
import {
  getEbayAppCreds,
  markEbayAccountNeedsReconsent,
  patchEbayUserAccessToken,
  resolveEbayUserTokens,
  touchEbayAccountTokenExpiry,
} from '@/lib/ebay/credentials';
import { ebayScopeStringForRole } from '@/lib/ebay/oauth-config';
import { formatPSTTimestamp } from '@/utils/date';

/** A 4xx from eBay's token endpoint means the refresh token is dead — re-consent needed. */
function isDeadRefreshToken(message: string): boolean {
  return /invalid_grant|HTTP 400|HTTP 401/i.test(message);
}

/**
 * POST /api/ebay/refresh-token  { accountName }
 * Manually refresh an account's access token (the per-account "Refresh" button).
 * Tokens live in the organization_integrations vault (scoped seller:/buyer:).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { accountName } = await req.json();
    if (!accountName) {
      return NextResponse.json({ success: false, error: 'Account name is required' }, { status: 400 });
    }

    let tokens;
    try {
      tokens = await resolveEbayUserTokens(ctx.organizationId, accountName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Account not found';
      const status = /not found/i.test(message) ? 404 : 409;
      return NextResponse.json({ success: false, error: message }, { status });
    }

    if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt.getTime() <= Date.now()) {
      await markEbayAccountNeedsReconsent(ctx.organizationId, accountName, 'refresh token expired');
      return NextResponse.json(
        { success: false, error: 'Re-authorization required — the refresh token expired. Reconnect the account.' },
        { status: 409 },
      );
    }

    const creds = await getEbayAppCreds(ctx.organizationId);
    if (!creds) {
      return NextResponse.json({ success: false, error: 'eBay app credentials are not configured.' }, { status: 500 });
    }

    let accessToken: string;
    let expiresIn: number;
    try {
      ({ accessToken, expiresIn } = await refreshEbayAccessToken(
        creds.appId,
        creds.certId,
        tokens.refreshToken,
        creds.environment,
        ebayScopeStringForRole(tokens.accountRole),
      ));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'refresh failed';
      if (isDeadRefreshToken(message)) {
        await markEbayAccountNeedsReconsent(ctx.organizationId, accountName, message);
        return NextResponse.json(
          { success: false, error: 'Re-authorization required — please reconnect the account.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await patchEbayUserAccessToken({
      orgId: ctx.organizationId,
      role: tokens.accountRole,
      accountName,
      accessToken,
      expiresAt: newExpiresAt,
    });
    await touchEbayAccountTokenExpiry(ctx.organizationId, accountName, newExpiresAt);

    return NextResponse.json({
      success: true,
      message: `Token refreshed successfully for ${accountName}`,
      expiresAt: formatPSTTimestamp(newExpiresAt),
      expiresIn,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[ebay/refresh-token] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'integrations.ebay' });
