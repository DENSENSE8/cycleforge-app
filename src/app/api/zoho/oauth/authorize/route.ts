import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEnvValue, resolvePublicAppUrl } from '@/lib/env-utils';
import { withAuth } from '@/lib/auth/withAuth';
import {
  encryptIntegrationPayload,
  isIntegrationKmsConfigured,
} from '@/lib/integrations/crypto';

export const dynamic = 'force-dynamic';

/** httpOnly cookie carrying the single-use CSRF nonce across the Zoho redirect. */
const ZOHO_OAUTH_STATE_COOKIE = 'zoho_oauth_state';
/** State freshness window — matches the cookie maxAge below. */
const STATE_COOKIE_MAX_AGE_SEC = 600;

/**
 * GET /api/zoho/oauth/authorize
 *
 * Redirects the browser to Zoho's OAuth 2.0 authorization page.
 * After the user grants access, Zoho redirects to /api/zoho/oauth/callback.
 *
 * Carries an AES-GCM `state` (orgId + staffId + nonce + issuedAt) plus a
 * matching httpOnly nonce cookie — the same binding /api/ebay/connect uses. The
 * callback derives the tenant from that state instead of the ambient session,
 * so a link a victim clicks cannot bind the ATTACKER's Zoho refresh token to
 * the victim's org.
 *
 * Required env vars: ZOHO_CLIENT_ID, NEXT_PUBLIC_APP_URL, INTEGRATION_KMS_KEY
 * Optional: ZOHO_DOMAIN (defaults to accounts.zoho.com)
 */
export const GET = withAuth(async (_request: NextRequest, ctx) => {
  const clientId = normalizeEnvValue(process.env.ZOHO_CLIENT_ID);
  const domain = normalizeEnvValue(process.env.ZOHO_DOMAIN) || 'accounts.zoho.com';
  const appUrl = resolvePublicAppUrl();

  if (!clientId) {
    return NextResponse.json(
      { error: 'ZOHO_CLIENT_ID is not configured in environment variables.' },
      { status: 500 }
    );
  }

  if (!appUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL is not configured in environment variables.' },
      { status: 500 }
    );
  }

  // The state is the tenant binding, so it must be sealed. No key ⇒ no flow.
  if (!isIntegrationKmsConfigured()) {
    return NextResponse.json(
      { error: 'INTEGRATION_KMS_KEY is not configured; cannot mint a signed OAuth state.' },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/zoho/oauth/callback`;

  // Scopes required for Zoho Inventory receiving lines integration.
  // settings.READ is required for GET /organizations (discover organization_id
  // during OAuth callback). Bills scope is required to receive billed POs:
  // createPurchaseReceive must GET /bills/{id} to map PO line_item_id →
  // bill_item_id for the purchaseorder_bills shape Zoho requires when a PO
  // already has bills.
  const scope = [
    'ZohoInventory.settings.READ',
    'ZohoInventory.purchaseorders.READ',
    'ZohoInventory.purchaseorders.CREATE',
    'ZohoInventory.purchaseorders.UPDATE',
    'ZohoInventory.purchasereceives.READ',
    'ZohoInventory.purchasereceives.CREATE',
    'ZohoInventory.bills.READ',
    'ZohoInventory.items.READ',
    'ZohoInventory.warehouses.READ',
  ].join(',');

  const nonce = randomBytes(16).toString('hex');
  const state = encryptIntegrationPayload({
    organizationId: ctx.organizationId,
    createdBy: ctx.staffId,
    nonce,
    issuedAt: Date.now(),
  });

  const authUrl = new URL(`https://${domain}/oauth/v2/auth`);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(ZOHO_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax', // survives the top-level redirect back from Zoho
    secure: process.env.NODE_ENV === 'production',
    maxAge: STATE_COOKIE_MAX_AGE_SEC,
    path: '/',
  });
  return res;
}, { permission: 'integrations.zoho' });
