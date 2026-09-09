/**
 * GET /api/auth/oauth/[provider]/start  (PUBLIC)  — provider ∈ google | apple | microsoft
 *
 * Begins platform social login. Sets a short-lived httpOnly state cookie
 * (PKCE verifier + CSRF state + nonce + workspace slug + the "Keep me signed
 * in" choice) and redirects the user to the provider's consent screen. Never
 * touches Drive/Gmail scopes.
 *
 * `?persist=1` carries the sign-in page's checkbox through the redirect — the
 * button sits next to that checkbox, so the flag has to survive the round trip
 * or checking the box would silently do nothing for federated sign-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { generatePkce } from '@/lib/auth/sso-oidc';
import {
  type PlatformProvider,
  platformProviderConfig,
  resolveRedirectUri,
  newOAuthState,
  encodeOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from '@/lib/auth/platform-oauth';
import { oauthOrigin } from '@/lib/auth/oauth-origin';
import { getCurrentUser } from '@/lib/auth/current-user';
import { resolveAccountIdForStaff } from '@/lib/identity/memberships';

export const runtime = 'nodejs';

function fail(req: NextRequest, code: string): NextResponse {
  const url = new URL('/signin', oauthOrigin(req));
  url.searchParams.set('login_error', code);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'apple' && provider !== 'microsoft') return fail(req, 'oauth_unknown_provider');

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: `auth-oauth-start-${provider}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return fail(req, 'rate_limited');

  const cfg = platformProviderConfig(provider as PlatformProvider);
  if (!cfg) return fail(req, 'oauth_unconfigured');

  const { verifier, challenge } = generatePkce();
  const slug = req.headers.get('x-tenant-slug') || req.nextUrl.searchParams.get('slug');
  const next = req.nextUrl.searchParams.get('next');
  const persistent = req.nextUrl.searchParams.get('persist') === '1';

  // IDENTITY LINKING: `link=1` turns this round trip from "sign in with the
  // provider" into "attach the provider to MY account". The account id comes
  // from the CALLER'S SESSION, never the query — a query param could name any
  // account; a session cannot be named, only held. No session → refuse; the
  // callback re-verifies the binding before anything is written.
  let linkAccountId: string | null = null;
  if (req.nextUrl.searchParams.get('link') === '1') {
    const me = await getCurrentUser();
    if (!me) return fail(req, 'link_requires_session');
    linkAccountId = await resolveAccountIdForStaff(me.staffId);
    if (!linkAccountId) return fail(req, 'link_no_account');
  }

  const payload = newOAuthState(provider as PlatformProvider, { slug, next, verifier, persistent, linkAccountId });

  const authUrl = new URL(cfg.authorizeUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', resolveRedirectUri(cfg, oauthOrigin(req)));
  authUrl.searchParams.set('scope', cfg.scope);
  authUrl.searchParams.set('state', payload.state);
  authUrl.searchParams.set('nonce', payload.nonce);
  if (provider !== 'apple') {
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');
  } else {
    authUrl.searchParams.set('response_mode', 'form_post');
  }

  const res = NextResponse.redirect(authUrl.toString());
  const isSecure = oauthOrigin(req).startsWith('https:') || process.env.NODE_ENV === 'production';
  res.cookies.set(OAUTH_STATE_COOKIE, encodeOAuthState(payload), {
    httpOnly: true,
    secure: provider === 'apple' ? true : isSecure,
    sameSite: provider === 'apple' ? 'none' : 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return res;
}
