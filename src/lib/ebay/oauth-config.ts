/** eBay OAuth configuration — the single source of truth for scopes, the sandbox/production environment, and the matching eBay endpoints. */
import { normalizeEnvValue } from '@/lib/env-utils';

export type EbayEnvironment = 'PRODUCTION' | 'SANDBOX';

/** The role an eBay OAuth connection plays. */
export type EbayAccountRole = 'seller' | 'buyer';

/** Coerce an arbitrary value to a valid role; anything but 'buyer' is 'seller'. */
export function normalizeEbayRole(value?: string | null): EbayAccountRole {
  return String(value ?? '').trim().toLowerCase() === 'buyer' ? 'buyer' : 'seller';
}

/**
 * Vault scope for a seller/buyer consent. Never bare `{slug}` — same label for
 * both roles must not collide on (org, provider, scope).
 * Lives here (not credentials.ts) so unit tests stay DB-free.
 */
export function ebayScopeForAccount(role: EbayAccountRole, accountSlug: string): string {
  const slug = String(accountSlug ?? '').trim();
  if (!slug) throw new Error('ebayScopeForAccount: accountSlug is required');
  return `${normalizeEbayRole(role)}:${slug}`;
}

/** Parse `seller:USAV` / `buyer:Purchasing` → role + slug, or null if malformed. */
export function parseEbayAccountScope(
  scope: string | null | undefined,
): { role: EbayAccountRole; accountSlug: string } | null {
  const raw = String(scope ?? '').trim();
  const m = /^(seller|buyer):(.+)$/i.exec(raw);
  if (!m) return null;
  return { role: normalizeEbayRole(m[1]), accountSlug: m[2].trim() };
}

/** httpOnly cookie that carries the single-use CSRF nonce across the OAuth redirect. */
export const EBAY_OAUTH_STATE_COOKIE = 'ebay_oauth_state';

/** Production RuName accept URL is `app.cycleforge.ai/api/ebay/callback`. */
export function ebayConnectLoopbackWarning(hostname: string): string | null {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'eBay returns to the production Cycle Forge URL after you grant access. Start this connect on app.cycleforge.ai so the callback cookie matches — localhost will fail with an invalid connection link.';
  }
  return null;
}

/** Minimal seller-copilot scope set. */
const DEFAULT_SCOPES: readonly string[] = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.account',
];

/** Minimal buyer (purchasing) scope set. */
const DEFAULT_BUYER_SCOPES: readonly string[] = [
  'https://api.ebay.com/oauth/api_scope',
];

/** The exact SELLER scope list requested at consent AND on refresh — keep them equal. */
export function ebayScopes(): string[] {
  const raw = normalizeEnvValue(process.env.EBAY_SCOPES);
  if (raw) {
    const parsed = raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (parsed.length) return parsed;
  }
  return [...DEFAULT_SCOPES];
}

/** The exact BUYER (purchasing) scope list — overridable via EBAY_BUYER_SCOPES. */
export function ebayBuyerScopes(): string[] {
  const raw = normalizeEnvValue(process.env.EBAY_BUYER_SCOPES);
  if (raw) {
    const parsed = raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (parsed.length) return parsed;
  }
  return [...DEFAULT_BUYER_SCOPES];
}

/** Role-aware scope list — buyer vs seller consent/refresh must use its OWN set. */
function ebayScopesForRole(role: EbayAccountRole): string[] {
  return role === 'buyer' ? ebayBuyerScopes() : ebayScopes();
}

/** Space-separated SELLER scope string (URL-encode at the call site). */
export function ebayScopeString(): string {
  return ebayScopes().join(' ');
}

/** Space-separated BUYER scope string (URL-encode at the call site). */
function ebayBuyerScopeString(): string {
  return ebayBuyerScopes().join(' ');
}

/** Space-separated scope string for a role. */
export function ebayScopeStringForRole(role: EbayAccountRole): string {
  return ebayScopesForRole(role).join(' ');
}

/** Normalize an environment value. */
export function normalizeEbayEnvironment(value?: string | null): EbayEnvironment {
  return String(value ?? '').trim().toUpperCase() === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
}

export function isEbaySandbox(env?: string | null): boolean {
  return normalizeEbayEnvironment(env) === 'SANDBOX';
}

/** Consent (authorize) host, environment-aware. */
export function ebayAuthDomain(env?: string | null): string {
  return isEbaySandbox(env) ? 'auth.sandbox.ebay.com' : 'auth.ebay.com';
}

/** OAuth2 token endpoint, environment-aware. */
export function ebayTokenEndpoint(env?: string | null): string {
  return isEbaySandbox(env)
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token';
}

/** Commerce Identity (getUser) endpoint, environment-aware. */
export function ebayIdentityEndpoint(env?: string | null): string {
  return isEbaySandbox(env)
    ? 'https://api.sandbox.ebay.com/commerce/identity/v1/user/'
    : 'https://api.ebay.com/commerce/identity/v1/user/';
}

type EbayAuthorizeProbeResult =
  | { ok: true }
  | {
      ok: false;
      /** Short eBay errorId from the errorOauth redirect, when present. */
      errorId: string | null;
      /** Stable app-facing reason for Settings banners. */
      reason: 'invalid_request' | 'unauthorized_client' | 'unknown';
    };

/** Server-side preflight for the consent URL: */
export async function probeEbayOauthAuthorizeConfig(input: {
  appId: string;
  ruName: string;
  environment: EbayEnvironment;
  /** Space-separated scopes (same string connect will request). */
  scope: string;
  fetchImpl?: typeof fetch;
}): Promise<EbayAuthorizeProbeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const authUrl =
    `https://${ebayAuthDomain(input.environment)}/oauth2/authorize` +
    `?client_id=${encodeURIComponent(input.appId)}` +
    `&redirect_uri=${encodeURIComponent(input.ruName)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(input.scope)}`;

  const ua =
    'Mozilla/5.0 (compatible; CycleForge-OAuth-Preflight/1.0; +https://cycleforge.ai)';

  let url: string | null = authUrl;
  for (let hop = 0; hop < 6 && url; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml' },
      });
    } catch {
      return { ok: false, errorId: null, reason: 'unknown' };
    }

    const location = res.headers.get('location');
    if (!location) {
      // Terminal HTML (sign-in / consent) — treat as accepted config.
      return { ok: true };
    }

    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return { ok: false, errorId: null, reason: 'unknown' };
    }

    if (next.pathname.includes('errorOauth') || next.searchParams.has('errorId')) {
      const errorId = (next.searchParams.get('errorId') || '').trim().toLowerCase() || null;
      const reason =
        errorId === 'invalid_request'
          ? 'invalid_request'
          : errorId === 'unauthorized_client'
            ? 'unauthorized_client'
            : 'unknown';
      return { ok: false, errorId, reason };
    }

    url = next.toString();
  }

  return { ok: false, errorId: null, reason: 'unknown' };
}
