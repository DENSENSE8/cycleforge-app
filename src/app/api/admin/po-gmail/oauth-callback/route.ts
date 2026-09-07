import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { PO_GMAIL_SCOPE, assertDogfoodMailbox, PoGmailWrongTenantError } from '@/lib/po-gmail/client';
import { upsertIntegrationCredentials, type GmailCredentials } from '@/lib/integrations/credentials';
import { ApiError, errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

function getRedirectUri(req: NextRequest): string {
  const explicit = process.env.PO_GMAIL_REDIRECT_URI;
  if (explicit) return explicit;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}/api/admin/po-gmail/oauth-callback`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface UserInfo {
  email?: string;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    assertDogfoodMailbox(ctx.organizationId);
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');

    if (errParam) {
      return NextResponse.redirect(
        `${url.origin}/incoming?view=mailbox&po_gmail_error=${encodeURIComponent(errParam)}`,
      );
    }
    if (!code || !state) {
      throw ApiError.badRequest('Missing code or state');
    }

    const stateCookie = req.cookies.get('po_gmail_oauth_state')?.value;
    if (!stateCookie || stateCookie !== state) {
      throw ApiError.badRequest('OAuth state mismatch');
    }

    const clientId = process.env.PO_GMAIL_CLIENT_ID;
    const clientSecret = process.env.PO_GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw ApiError.badRequest('PO_GMAIL_CLIENT_ID / PO_GMAIL_CLIENT_SECRET missing');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: getRedirectUri(req),
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
    }
    const tokens = (await tokenRes.json()) as TokenResponse;
    if (!tokens.refresh_token) {
      // Google only returns refresh_token on the very first consent for an
      // (app, account) pair. If we land here, the account previously
      // granted access — revoke the app under "Apps with account access"
      // in your Google account, then reconnect.
      throw new Error('Google did not return a refresh token. Revoke the app in your Google account and retry.');
    }

    let accountEmail: string | null = null;
    try {
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const info = (await infoRes.json()) as UserInfo;
        accountEmail = info.email ?? null;
      }
    } catch {
      // best-effort; we don't need the email
    }

    const expiresAtMs = Date.now() + (tokens.expires_in - 60) * 1000;

    // Vault-only token home (organization_integrations, provider='gmail'):
    // the payload is an AES-256-GCM envelope under INTEGRATION_KMS_KEY. The
    // google_oauth_tokens plaintext token columns were dropped (2026-09-06)
    // — tokens are never stored outside the vault. App-level OAuth client
    // creds are copied into the row so the refresh path is self-contained at
    // runtime (mirrors GoogleDriveCredentials / Amazon LWA).
    const vaultPayload: GmailCredentials = {
      clientId,
      clientSecret,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: expiresAtMs,
      accountEmail: accountEmail ?? undefined,
      scope: tokens.scope || PO_GMAIL_SCOPE,
    };
    await upsertIntegrationCredentials({
      orgId: ctx.organizationId,
      provider: 'gmail',
      payload: vaultPayload,
      displayLabel: accountEmail,
      createdBy: ctx.staffId,
    });

    const res = NextResponse.redirect(`${url.origin}/incoming?view=mailbox&po_gmail_connected=1`);
    res.cookies.delete('po_gmail_oauth_state');
    return res;
  } catch (error) {
    if (error instanceof PoGmailWrongTenantError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return errorResponse(error, 'GET /api/admin/po-gmail/oauth-callback');
  }
}, { permission: 'admin.view' });
