/** Minimal OIDC PKCE helpers. */

import { createHash, randomBytes } from 'node:crypto';

export interface OidcProviderRow {
  id: number;
  organizationId: string;
  issuer: string;
  clientId: string;
  authorizeUrl: string | null;
  tokenUrl: string | null;
  userinfoUrl: string | null;
  jwksUrl: string | null;
  defaultRole: string;
  autoProvision: boolean;
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

const discoveryCache = new Map<string, { doc: DiscoveryDoc; expiresAt: number }>();
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

async function discover(issuer: string): Promise<DiscoveryDoc> {
  const trimmed = issuer.replace(/\/+$/, '');
  const cached = discoveryCache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) return cached.doc;

  const res = await fetch(`${trimmed}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed for ${issuer}: HTTP ${res.status}`);
  }
  const doc = (await res.json()) as DiscoveryDoc;
  discoveryCache.set(trimmed, { doc, expiresAt: Date.now() + DISCOVERY_TTL_MS });
  return doc;
}

export async function resolveEndpoints(p: OidcProviderRow): Promise<DiscoveryDoc> {
  // Prefer explicitly-configured endpoints; fall back to discovery for any
  // that aren't pinned. Lets enterprises override a single endpoint
  // (e.g. token endpoint behind a proxy) without re-declaring everything.
  const discovered = await discover(p.issuer);
  return {
    authorization_endpoint: p.authorizeUrl ?? discovered.authorization_endpoint,
    token_endpoint:         p.tokenUrl     ?? discovered.token_endpoint,
    userinfo_endpoint:      p.userinfoUrl  ?? discovered.userinfo_endpoint,
    jwks_uri:               p.jwksUrl      ?? discovered.jwks_uri,
  };
}

// ─── PKCE ──────────────────────────────────────────────────────────────────

export function generatePkce(): { verifier: string; challenge: string } {
  // 43-128 chars; spec recommends 43+. randomBytes(32).base64url → 43 chars.
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAuthorizeUrl(args: {
  endpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const url = new URL(args.endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', args.clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('scope', args.scope ?? 'openid email profile');
  url.searchParams.set('state', args.state);
  url.searchParams.set('code_challenge', args.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

export async function exchangeCode(args: {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  if (args.codeVerifier) {
    body.set('code_verifier', args.codeVerifier);
  }
  const res = await fetch(args.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(`OIDC token exchange failed: ${json.error_description || json.error || res.status}`);
  }
  return json;
}

export interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
}

export async function fetchUserInfo(args: { endpoint: string; accessToken: string }): Promise<UserInfo> {
  const res = await fetch(args.endpoint, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`OIDC userinfo failed: HTTP ${res.status}`);
  }
  return (await res.json()) as UserInfo;
}

/** Decode the `email`/`sub` claims out of an id_token without validating signatures — used only as a fallback when userinfo isn't available. */
export function decodeIdTokenClaimsUnsafe(idToken: string): UserInfo | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1]!, 'base64url').toString('utf8');
    return JSON.parse(json) as UserInfo;
  } catch {
    return null;
  }
}

export interface IdTokenClaims extends UserInfo {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  email_verified?: boolean;
}

export class IdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdTokenError';
  }
}

/** Validate the standard claims of an id_token: */
export function validateIdTokenClaims(
  idToken: string,
  opts: { issuer: string; clientId: string; clockSkewSec?: number },
): IdTokenClaims {
  const claims = decodeIdTokenClaimsUnsafe(idToken) as IdTokenClaims | null;
  if (!claims) throw new IdTokenError('id_token could not be parsed');

  const norm = (s: string) => s.replace(/\/+$/, '');
  const skew = opts.clockSkewSec ?? 120;
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss && norm(claims.iss) !== norm(opts.issuer)) {
    throw new IdTokenError('id_token issuer mismatch');
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (aud.length > 0 && !aud.includes(opts.clientId)) {
    throw new IdTokenError('id_token audience mismatch');
  }
  if (typeof claims.exp === 'number' && claims.exp + skew < now) {
    throw new IdTokenError('id_token expired');
  }
  if (typeof claims.iat === 'number' && claims.iat - skew > now) {
    throw new IdTokenError('id_token issued in the future');
  }
  return claims;
}
