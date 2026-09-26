/** Platform social login (Google, Apple, then Microsoft) — the provider buttons button on /signin. */

import { createSign, randomBytes } from 'node:crypto';

import type { PlatformProvider } from './platform-oauth-types';

// Re-exported so server callers keep importing from this module; client
// components import the light twin directly (bundle altitude).
export type { PlatformProvider };

interface PlatformProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
}

interface PlatformProviderConfig extends PlatformProviderEndpoints {
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

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

let cachedAppleSecret: { clientId: string; clientSecret: string; expiresAt: number; cacheKey: string } | null = null;

function appleClientSecret(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.APPLE_OAUTH_CLIENT_ID ?? '').trim();
  const teamId = (process.env.APPLE_OAUTH_TEAM_ID ?? '').trim();
  const keyId = (process.env.APPLE_OAUTH_KEY_ID ?? '').trim();
  const privateKey = (process.env.APPLE_OAUTH_PRIVATE_KEY ?? '').trim().replace(/\\n/g, '\n');
  if (!clientId || !teamId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${clientId}:${teamId}:${keyId}:${privateKey.slice(0, 32)}`;
  if (cachedAppleSecret && cachedAppleSecret.cacheKey === cacheKey && cachedAppleSecret.expiresAt > now) {
    return { clientId: cachedAppleSecret.clientId, clientSecret: cachedAppleSecret.clientSecret };
  }

  try {
    const header = encodeBase64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
    const claims = encodeBase64Url(JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: 'https://appleid.apple.com',
      sub: clientId,
    }));
    const signer = createSign('SHA256');
    signer.update(`${header}.${claims}`);
    signer.end();
    const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const clientSecret = `${header}.${claims}.${signature}`;
    // Cache for 24 hours so we do not re-sign on every request.
    cachedAppleSecret = { clientId, clientSecret, expiresAt: now + 60 * 60 * 24, cacheKey };
    return { clientId, clientSecret };
  } catch (err) {
    console.error('[appleClientSecret] signing failed:', err);
    return null;
  }
}

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
  if (provider === 'apple') {
    const credentials = appleClientSecret();
    if (!credentials) return null;
    return {
      provider,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: (process.env.APPLE_OAUTH_REDIRECT_URI ?? '').trim() || null,
      authorizeUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      userinfoUrl: '',
      scope: 'openid email name',
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
  if (provider === 'apple') {
    return Boolean(
      (process.env.APPLE_OAUTH_CLIENT_ID ?? '').trim() &&
      (process.env.APPLE_OAUTH_TEAM_ID ?? '').trim() &&
      (process.env.APPLE_OAUTH_KEY_ID ?? '').trim() &&
      (process.env.APPLE_OAUTH_PRIVATE_KEY ?? '').trim(),
    );
  }
  return envConfig(provider) !== null;
}

/** Which platform login buttons to show on /signin. */
export function configuredPlatformProviders(): PlatformProvider[] {
  return (['google', 'apple', 'microsoft'] as PlatformProvider[]).filter(isPlatformProviderConfigured);
}

export function resolveRedirectUri(cfg: PlatformProviderConfig, origin: string): string {
  return cfg.redirectUri || `${origin.replace(/\/$/, '')}/api/auth/oauth/${cfg.provider}/callback`;
}

interface OAuthStatePayload {
  provider: PlatformProvider;
  state: string;
  nonce: string;
  verifier: string;
  slug: string | null;
  next: string | null;
  /**
   * The sign-in page's "Keep me signed in" checkbox, carried across the
   * provider round trip. The state cookie is httpOnly, so this is the choice
   * the user actually made, not something a page can forge after the fact.
   */
  persistent: boolean;
  /** IDENTITY LINKING: */
  linkAccountId?: string | null;
  /**
   * Sign-in door the round trip started from (`/signin` or `/m/signin`).
   * Shared-account orgs redirect back here for the staff picker.
   */
  signinPath?: string | null;
}

export function newOAuthState(
  provider: PlatformProvider,
  opts: {
    slug?: string | null;
    next?: string | null;
    verifier: string;
    persistent?: boolean;
    linkAccountId?: string | null;
    signinPath?: string | null;
  },
): OAuthStatePayload {
  const signinPath = opts.signinPath === '/m/signin' ? '/m/signin' : opts.signinPath === '/signin' ? '/signin' : null;
  return {
    provider,
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    verifier: opts.verifier,
    slug: opts.slug ?? null,
    next: opts.next ?? null,
    persistent: opts.persistent === true,
    linkAccountId: opts.linkAccountId ?? null,
    signinPath,
  };
}

export function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeOAuthState(raw: string | undefined | null): OAuthStatePayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!obj.state || !obj.nonce || !obj.verifier || !['google', 'apple', 'microsoft'].includes(obj.provider)) {
      return null;
    }
    // Same pre-existing-cookie tolerance as `persistent`: absent decodes as
    // null, never as a stale account id.
    const signinPath = obj.signinPath === '/m/signin' ? '/m/signin' : obj.signinPath === '/signin' ? '/signin' : null;
    return { ...obj, persistent: obj.persistent === true, linkAccountId: obj.linkAccountId ?? null, signinPath };
  } catch {
    return null;
  }
}
