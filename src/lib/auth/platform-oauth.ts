/**
 * Platform social login (Google, then Microsoft) — the "Continue with Google"
 * button on /signin.
 *
 * THIS IS DELIBERATELY SEPARATE from the tenant Google Drive / PO Gmail OAuth
 * clients (`src/lib/google-auth.ts`, `src/lib/photos/drive/*`). The platform
 * login client only ever requests `openid email profile` — never Drive/Gmail
 * scopes — and uses its own `GOOGLE_OAUTH_*` credentials. Do not reuse Drive
 * credentials or scopes here.
 *
 * Flow (CSRF-safe, PKCE): /start sets a short-lived httpOnly state cookie and
 * redirects to the provider; /callback verifies the state (double-submit) +
 * nonce, exchanges the code, and resolves the account by federated identity.
 *
 * id_token signature verification against the provider JWKS is deferred (see
 * decodeIdTokenClaimsUnsafe) — Google/Microsoft return a verified email + stable
 * sub, and the code is exchanged over TLS directly with the provider token
 * endpoint using our client secret, so the token is provider-authenticated. Full
 * JWKS verification is tracked as a follow-up (out of scope for this wave).
 */

import { randomBytes } from 'node:crypto';

import type { PlatformProvider } from './platform-oauth-types';

// Re-exported so server callers keep importing from this module; client
// components import the light twin directly (bundle altitude).
export type { PlatformProvider };

export interface PlatformProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
}

export interface PlatformProviderConfig extends PlatformProviderEndpoints {
  provider: PlatformProvider;
  clientId: string;
  clientSecret: string;
  /** Explicit redirect URI, or null to derive `${origin}/api/auth/oauth/<p>/callback`. */
  redirectUri: string | null;
}

/** Short-lived httpOnly cookie holding the pending OAuth transaction. */
export const OAUTH_STATE_COOKIE = 'cf_oauth';
/** State cookie lifetime — the round-trip to the IdP and back. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function envConfig(provider: PlatformProvider): PlatformProviderConfig | null {
  if (provider === 'google') {
    const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
    const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim();
    if (!clientId || !clientSecret) return null;
    return {
      provider,
      clientId,
      clientSecret,
      redirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '').trim() || null,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      scope: 'openid email profile',
    };
  }
  // Microsoft (built after Google works). Uses the /common multi-tenant endpoint
  // unless MICROSOFT_OAUTH_TENANT pins a single tenant.
  const clientId = (process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret) return null;
  const tenant = (process.env.MICROSOFT_OAUTH_TENANT ?? 'common').trim() || 'common';
  return {
    provider,
    clientId,
    clientSecret,
    redirectUri: (process.env.MICROSOFT_OAUTH_REDIRECT_URI ?? '').trim() || null,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile',
  };
}

/** Resolve a platform provider's config from env, or null when not configured. */
export function platformProviderConfig(provider: PlatformProvider): PlatformProviderConfig | null {
  return envConfig(provider);
}

/** True when the provider's client credentials are present in env. */
export function isPlatformProviderConfigured(provider: PlatformProvider): boolean {
  return envConfig(provider) !== null;
}

/** Which platform login buttons to show on /signin. */
export function configuredPlatformProviders(): PlatformProvider[] {
  return (['google', 'microsoft'] as PlatformProvider[]).filter(isPlatformProviderConfigured);
}

export function resolveRedirectUri(cfg: PlatformProviderConfig, origin: string): string {
  return cfg.redirectUri || `${origin.replace(/\/$/, '')}/api/auth/oauth/${cfg.provider}/callback`;
}

export interface OAuthStatePayload {
  provider: PlatformProvider;
  state: string;
  nonce: string;
  verifier: string;
  slug: string | null;
  next: string | null;
}

export function newOAuthState(
  provider: PlatformProvider,
  opts: { slug?: string | null; next?: string | null; verifier: string },
): OAuthStatePayload {
  return {
    provider,
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    verifier: opts.verifier,
    slug: opts.slug ?? null,
    next: opts.next ?? null,
  };
}

export function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeOAuthState(raw: string | undefined | null): OAuthStatePayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!obj.state || !obj.nonce || !obj.verifier || (obj.provider !== 'google' && obj.provider !== 'microsoft')) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}
