import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit } from '@/lib/audit-logs';
import { getEbayAppCreds, upsertEbayUserCreds } from '@/lib/ebay/credentials';
import {
  ebayIdentityEndpoint,
  ebayTokenEndpoint,
  normalizeEbayEnvironment,
  normalizeEbayRole,
  EBAY_OAUTH_STATE_COOKIE,
} from '@/lib/ebay/oauth-config';
import { connectActorStillMember, verifyEbayCallbackState } from '@/lib/ebay/callback-verify';
import { syncEbayAccountsToPlatformAccounts } from '@/lib/neon/catalog-queries';
import { EBAY_ACCOUNT_STORE_PROVIDER, upsertStoreLink } from '@/lib/catalog/integration-store-links';
import { enableOrgFeatureFlag, INCOMING_UNIVERSAL_FLAG } from '@/lib/feature-flags';
import { ensureEbayInboundSourceEnabled } from '@/lib/inbound/org-settings';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/ebay/callback Landing route for the eBay OAuth redirect (configured as the RuName target). */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  // Single-use nonce: clear it on every terminal outcome.
  const finish = (query: string) => {
    const res = NextResponse.redirect(`${origin}/settings/integrations?${query}`);
    res.cookies.delete(EBAY_OAUTH_STATE_COOKIE);
    return res;
  };

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    // Seller declined / cancelled consent (eBay appends error / error_description).
    if (oauthError) {
      return finish('error=ebay_consent_declined');
    }

    if (!code || !state) {
      return finish('error=ebay_missing_oauth_params');
    }

    const verdict = verifyEbayCallbackState({ stateParam: state, cookieNonce: req.cookies.get(EBAY_OAUTH_STATE_COOKIE)?.value });
    if (!verdict.ok) {
      return finish(`error=${verdict.code}`);
    }
    // Purchasing-account difference: buyer connections are stamped account_role='buyer'.
    const { organizationId, accountName, createdBy } = verdict.state;
    const accountRole = normalizeEbayRole(verdict.state.role);

    // Membership re-check (the encrypted state cannot vouch for the present):
    if (!(await connectActorStillMember(organizationId, createdBy))) {
      return finish('error=ebay_membership_revoked');
    }

    const creds = await getEbayAppCreds(organizationId);
    if (!creds) {
      return finish('error=ebay_server_configuration');
    }
    const environment = normalizeEbayEnvironment(verdict.state.environment ?? creds.environment);

    // Exchange the authorization code for tokens (server-side, Basic auth).
    const base64Auth = Buffer.from(`${creds.appId}:${creds.certId}`).toString('base64');
    const tokenResponse = await fetch(ebayTokenEndpoint(environment), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${base64Auth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: creds.ruName,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      // eBay returns { error, error_description } — surface the SHORT error CODE (safe, diagnostic; never the full body, which can echo request…
      let ebayErrorCode = '';
      try {
        ebayErrorCode = String((await tokenResponse.clone().json())?.error ?? '');
      } catch {
        /* non-JSON body — code stays empty */
      }
      console.error(
        '[ebay/callback] Token exchange failed: HTTP',
        tokenResponse.status,
        ebayErrorCode ? `(${ebayErrorCode})` : '',
      );
      if (ebayErrorCode === 'invalid_client') {
        return finish('error=ebay_app_credentials_invalid');
      }
      // Surface eBay's short OAuth error code (e.g. invalid_code) so Settings can
      // show an actionable banner without reading Vercel logs. Only allow a safe
      // [a-z0-9_]+ token — never echo error_description (may contain request context).
      if (/^[a-z0-9_]{1,64}$/i.test(ebayErrorCode)) {
        return finish(
          `error=ebay_token_exchange_failed&ebay_oauth_error=${encodeURIComponent(ebayErrorCode.toLowerCase())}`,
        );
      }
      return finish('error=ebay_token_exchange_failed');
    }

    const data = await tokenResponse.json();

    // Best-effort: resolve the eBay username/userId for the account label.
    let ebayUserId = '';
    try {
      const profileResponse = await fetch(ebayIdentityEndpoint(environment), {
        method: 'GET',
        headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' },
      });
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        ebayUserId = profileData.userId || profileData.username || '';
      }
    } catch {
      /* non-fatal — identity probe is informational only */
    }

    const tokenExpiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000);
    const refreshTokenExpiresAt = new Date(
      Date.now() + (data.refresh_token_expires_in || 18 * 30 * 24 * 3600) * 1000,
    );

    // Vault SoT — per-account user tokens (scope = seller:{slug} | buyer:{slug}).
    await upsertEbayUserCreds({
      orgId: organizationId,
      accountName,
      role: accountRole,
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresAt: tokenExpiresAt,
      refreshTokenExpiresAt,
      environment,
      accountRef: ebayUserId || null,
      displayLabel: `${accountRole} · ${accountName}`,
      createdBy: createdBy ?? null,
    });

    // Metadata only — no token columns (dropped after vault migration).
    await tenantQuery(
      organizationId,
      `INSERT INTO ebay_accounts (
        organization_id, account_name, ebay_user_id,
        token_expires_at, refresh_token_expires_at, marketplace_id, platform, account_role, is_active, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'EBAY', $7, true, NOW())
      ON CONFLICT (organization_id, account_name) DO UPDATE
      SET ebay_user_id            = EXCLUDED.ebay_user_id,
          token_expires_at        = EXCLUDED.token_expires_at,
          refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
          platform                = 'EBAY',
          account_role            = EXCLUDED.account_role,
          is_active               = true,
          updated_at              = NOW()`,
      [
        organizationId,
        accountName,
        ebayUserId || null,
        tokenExpiresAt,
        refreshTokenExpiresAt,
        'EBAY_US',
        accountRole,
      ],
    );

    // Platform pairing (connect popover): point the account's store link at
    // the chosen platform BEFORE the mirror runs so the account lands under
    // it. Upsert semantics — re-connecting with a different platform re-links.
    const platformId = verdict.state.platformId ?? null;
    if (platformId != null) {
      try {
        await upsertStoreLink(organizationId, {
          provider: EBAY_ACCOUNT_STORE_PROVIDER,
          externalStoreId: accountName,
          platformId,
          platformAccountId: null,
        });
      } catch (linkErr: unknown) {
        console.warn(
          '[ebay/callback] platform pairing link failed:',
          linkErr instanceof Error ? linkErr.message : linkErr,
        );
      }
    }

    // Keep platform_accounts (catalog + Incoming account chip) aligned with the
    // new seller/buyer row — seedOrgCatalog only runs at org creation, not on connect.
    try {
      await syncEbayAccountsToPlatformAccounts(organizationId);
    } catch (syncErr: unknown) {
      console.warn(
        '[ebay/callback] platform_accounts sync failed:',
        syncErr instanceof Error ? syncErr.message : syncErr,
      );
    }

    // Purchasing connect → light up Universal Incoming so /incoming shows eBay buyer lines without a separate flag hunt (idempotent upsert).
    if (accountRole === 'buyer') {
      try {
        await enableOrgFeatureFlag(organizationId, INCOMING_UNIVERSAL_FLAG);
      } catch (flagErr: unknown) {
        console.warn(
          '[ebay/callback] incoming_universal enable failed:',
          flagErr instanceof Error ? flagErr.message : flagErr,
        );
      }
      try {
        await ensureEbayInboundSourceEnabled(organizationId as OrgId);
      } catch (srcErr: unknown) {
        console.warn(
          '[ebay/callback] ensure ebay inbound source failed:',
          srcErr instanceof Error ? srcErr.message : srcErr,
        );
      }
    }

    // Audit (no auth context — pass org/actor overrides, the documented path).
    try {
      await recordAudit(pool, null, null, {
        source: 'ebay',
        action: 'integrations.ebay.connected',
        entityType: 'ebay_account',
        entityId: accountName,
        organizationIdOverride: organizationId,
        actorStaffIdOverride: createdBy,
        after: { ebayUserId: ebayUserId || null, environment, accountRole, platformId },
      });
    } catch (auditErr: any) {
      console.warn('[ebay/callback] audit write failed:', auditErr?.message || auditErr);
    }

    // Role-specific success so Settings can teach next steps (Incoming vs storefront).
    return finish(
      accountRole === 'buyer' ? 'success=ebay_buyer_connected' : 'success=ebay_seller_connected',
    );
  } catch (error: any) {
    console.error('[ebay/callback] Unexpected error:', error?.message || error);
    return finish('error=ebay_callback_failed');
  }
}
