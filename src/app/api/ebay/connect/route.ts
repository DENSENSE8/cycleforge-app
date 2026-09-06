import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { withAuth } from '@/lib/auth/withAuth';
import { assertCanConnectProvider } from '@/lib/integrations/connectors/connections';
import { assertIntegrationKmsConfigured, encryptIntegrationPayload } from '@/lib/integrations/crypto';
import { getEbayAppCreds } from '@/lib/ebay/credentials';
import {
  ebayAuthDomain,
  ebayScopeStringForRole,
  normalizeEbayRole,
  probeEbayOauthAuthorizeConfig,
  EBAY_OAUTH_STATE_COOKIE,
} from '@/lib/ebay/oauth-config';

const STATE_COOKIE_MAX_AGE = 600; // 10 min — matches the callback TTL window

/**
 * GET /api/ebay/connect
 * Starts the multi-tenant eBay OAuth consent flow.
 *
 * CSRF defense is two-layer: an AES-GCM-encrypted `state` (tamper-proof, carries
 * the tenant + a nonce) PLUS an httpOnly cookie holding the same nonce so the
 * callback can confirm it returned to the same browser session that started it.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const accountName = searchParams.get('accountName');
    // The purchasing-account difference starts here: role=buyer requests the
    // buyer scope set and is persisted as ebay_accounts.account_role by the callback.
    const role = normalizeEbayRole(searchParams.get('role'));

    if (!accountName?.trim()) {
      return NextResponse.json({ error: 'accountName is required' }, { status: 400 });
    }

    // Plan ceiling: connecting a NEW provider must fit the org's maxIntegrations.
    const refusal = await assertCanConnectProvider(ctx.organizationId, 'ebay');
    if (refusal) return NextResponse.json(refusal, { status: 403 });

    // Encryption-at-rest is required to store the OAuth state (and tokens) —
    // hard-fail in production if the KMS key is missing.
    assertIntegrationKmsConfigured('eBay OAuth state');

    // Per-tenant / shared-app credentials (no process.env reads here).
    const creds = await getEbayAppCreds(ctx.organizationId);
    if (!creds) {
      return NextResponse.json(
        { error: 'eBay integration is not fully configured on the server' },
        { status: 500 },
      );
    }

    const scope = ebayScopeStringForRole(role);

    // Preflight: catch App ID / RuName rejection before dumping the operator onto
    // eBay's errorOauth page (classic invalid_request = RuName not owned by this
    // Production App ID, or sandbox RuName paired with production keys).
    const probe = await probeEbayOauthAuthorizeConfig({
      appId: creds.appId,
      ruName: creds.ruName,
      environment: creds.environment,
      scope,
    });
    if (!probe.ok) {
      console.warn(
        '[ebay/connect] authorize preflight failed',
        `env=${creds.environment}`,
        `host=${ebayAuthDomain(creds.environment)}`,
        `role=${role}`,
        `ruNameLen=${creds.ruName.length}`,
        `reason=${probe.reason}`,
        probe.errorId ? `errorId=${probe.errorId}` : '',
      );
      const error =
        probe.reason === 'invalid_request'
          ? 'ebay_oauth_runame_invalid'
          : probe.reason === 'unauthorized_client'
            ? 'ebay_app_credentials_invalid'
            : 'ebay_oauth_authorize_rejected';
      return NextResponse.redirect(`${req.nextUrl.origin}/apps?error=${error}`);
    }

    const nonce = randomBytes(16).toString('hex');
    const state = encryptIntegrationPayload({
      organizationId: ctx.organizationId,
      accountName: accountName.trim(),
      environment: creds.environment,
      role,
      createdBy: ctx.staffId,
      nonce,
      issuedAt: Date.now(),
    });

    const authUrl =
      `https://${ebayAuthDomain(creds.environment)}/oauth2/authorize` +
      `?client_id=${encodeURIComponent(creds.appId)}` +
      `&redirect_uri=${encodeURIComponent(creds.ruName)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=login`;

    // Safe diagnostics only — never log App ID / Cert / full RuName / state.
    console.warn(
      '[ebay/connect] authorize',
      `env=${creds.environment}`,
      `host=${ebayAuthDomain(creds.environment)}`,
      `role=${role}`,
      `ruNameLen=${creds.ruName.length}`,
    );

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(EBAY_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'lax', // allow the top-level redirect back from eBay to carry it
      secure: process.env.NODE_ENV === 'production',
      maxAge: STATE_COOKIE_MAX_AGE,
      path: '/',
    });
    return res;
  } catch (error: any) {
    console.error('[ebay/connect] Failed to initiate connection:', error?.message || error);
    return NextResponse.redirect(
      `${req.nextUrl.origin}/apps?error=ebay_server_configuration`,
    );
  }
}, { permission: 'integrations.ebay' });
