/**
 * GET /api/auth/oauth/[provider]/callback  (PUBLIC)  — provider ∈ google | apple | microsoft
 *
 * Completes platform social login: verifies the CSRF state + nonce, exchanges
 * the code for tokens, resolves (or provisions) the account by federated
 * identity (`account_identities` keyed on provider + stable `sub`), signs into a
 * workspace, and sets `cf_sid`. Redirects to /signin?login_error=… on any failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { exchangeCode, decodeIdTokenClaimsUnsafe, fetchUserInfo } from '@/lib/auth/sso-oidc';
import {
  type PlatformProvider,
  platformProviderConfig,
  resolveRedirectUri,
  decodeOAuthState,
  OAUTH_STATE_COOKIE,
} from '@/lib/auth/platform-oauth';
import {
  getAccountIdByIdentity,
  linkAccountIdentity,
  getAccountByEmail,
  createAccount,
} from '@/lib/identity/accounts';
import { listMembershipsForAccount, logAuthEvent } from '@/lib/identity/memberships';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';

export const runtime = 'nodejs';

function origin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

function clearStateCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  });
}

function fail(req: NextRequest, code: string): NextResponse {
  const url = new URL('/signin', origin(req));
  url.searchParams.set('login_error', code);
  const res = NextResponse.redirect(url);
  clearStateCookie(res);
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'apple' && provider !== 'microsoft') return fail(req, 'oauth_unknown_provider');

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: `auth-oauth-callback-${provider}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return fail(req, 'rate_limited');

  if (req.nextUrl.searchParams.get('error')) return fail(req, 'oauth_denied');

  const cfg = platformProviderConfig(provider as PlatformProvider);
  if (!cfg) return fail(req, 'oauth_unconfigured');

  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const payload = decodeOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value);
  // CSRF: the state in the URL must match the one we stashed in the httpOnly cookie.
  if (!code || !stateParam || !payload || payload.provider !== provider || payload.state !== stateParam) {
    return fail(req, 'oauth_state');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');

  // Exchange the code (PKCE) directly with the provider token endpoint (TLS +
  // our client secret ⇒ the id_token is provider-authenticated).
  let sub: string | undefined;
  let email: string | undefined;
  let name: string | undefined;
  try {
    const token = await exchangeCode({
      endpoint: cfg.tokenUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code,
      redirectUri: resolveRedirectUri(cfg, origin(req)),
      codeVerifier: payload.verifier,
    });
    const claims = token.id_token ? decodeIdTokenClaimsUnsafe(token.id_token) : null;
    // Nonce binding: the id_token nonce must equal the one we generated.
    if (token.id_token && claims && (claims as { nonce?: string }).nonce && (claims as { nonce?: string }).nonce !== payload.nonce) {
      return fail(req, 'oauth_nonce');
    }
    if (claims?.sub) {
      sub = claims.sub;
      email = claims.email;
      name = claims.name;
    }
    // Fallback to userinfo when the id_token lacks the claims.
    if ((!sub || !email) && token.access_token && cfg.userinfoUrl) {
      const info = await fetchUserInfo({ endpoint: cfg.userinfoUrl, accessToken: token.access_token });
      sub = sub || info.sub;
      email = email || info.email;
      name = name || info.name;
    }
  } catch (err) {
    console.error(`[oauth/${provider}/callback] exchange failed:`, err);
    return fail(req, 'oauth_exchange');
  }

  if (!sub) return fail(req, 'oauth_no_subject');

  // Resolve or provision the account by the stable federated identity.
  let accountId = await getAccountIdByIdentity(provider, sub);
  if (!accountId) {
    const existing = email ? await getAccountByEmail(email) : null;
    if (existing) {
      accountId = existing.id;
    } else {
      accountId = await createAccount({ displayName: name || email || 'Member', email: email ?? null, password: null });
    }
    await linkAccountIdentity({ accountId, provider, subject: sub, emailAtLink: email ?? null });
  }

  const memberships = await listMembershipsForAccount(accountId);
  if (memberships.length === 0) {
    await logAuthEvent({ accountId, orgId: null, event: 'failed_login', ip, userAgent: ua });
    return fail(req, 'no_workspace');
  }

  // Prefer the workspace the login started from (slug in state); else first.
  let target = memberships[0]!;
  if (payload.slug) {
    const org = await getOrganizationBySlug(payload.slug);
    const match = org ? memberships.find((m) => m.organization_id === org.id) : undefined;
    if (match) target = match;
  }

  // `persistent` is the "Keep me signed in" checkbox, carried through the
  // provider round trip in the httpOnly state cookie set by /start.
  const session = await createSession({
    staffId: target.staff_id, deviceKind: 'personal', ip, userAgent: ua,
    persistent: payload.persistent,
  });

  await audit({
    staffId: target.staff_id, sid: session.sid, event: 'signin.account', result: 'ok', ip, userAgent: ua,
    detail: { accountId, orgId: target.organization_id, via: `oauth_${provider}` },
  });
  await logAuthEvent({ accountId, orgId: target.organization_id, event: 'login', ip, userAgent: ua });

  const dest = payload.next && payload.next.startsWith('/') ? payload.next : '/';
  const res = NextResponse.redirect(new URL(dest, origin(req)));
  res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: cookieMaxAgeForSession(session),
  });
  res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  });
  clearStateCookie(res);
  return res;
}
