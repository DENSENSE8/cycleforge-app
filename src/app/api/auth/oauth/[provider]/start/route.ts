/**
 * GET /api/auth/oauth/[provider]/start  (PUBLIC)  — provider ∈ google | microsoft
 *
 * Begins platform social login. Sets a short-lived httpOnly state cookie
 * (PKCE verifier + CSRF state + nonce + workspace slug) and redirects the user
 * to the provider's consent screen. Never touches Drive/Gmail scopes.
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

export const runtime = 'nodejs';

function origin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

function fail(req: NextRequest, code: string): NextResponse {
  const url = new URL('/signin', origin(req));
  url.searchParams.set('login_error', code);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'microsoft') return fail(req, 'oauth_unknown_provider');

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
  const payload = newOAuthState(provider as PlatformProvider, { slug, next, verifier });

  const authUrl = new URL(cfg.authorizeUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', resolveRedirectUri(cfg, origin(req)));
  authUrl.searchParams.set('scope', cfg.scope);
  authUrl.searchParams.set('state', payload.state);
  authUrl.searchParams.set('nonce', payload.nonce);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(OAUTH_STATE_COOKIE, encodeOAuthState(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return res;
}
