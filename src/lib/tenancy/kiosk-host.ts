/**
 * Kiosk host SoT — `{slug}.kiosk.app.cycleforge.ai` (dogfood: usav.kiosk.app…).
 *
 * The host is a locator + isolation boundary. Write auth still comes from the
 * device row via `withKioskAuth` — never from Host alone. Pairing may reject
 * when the enroll code's org ≠ the host slug's org (defense in depth).
 *
 * Pure string/env helpers — safe to import from `proxy.ts` (no db / node:crypto).
 */

import { normalizeEnvValue, resolvePublicAppUrl } from '@/lib/env-utils';

const DEFAULT_APP_HOSTNAME = 'app.cycleforge.ai';
const DEFAULT_KIOSK_HOST_SUFFIX = 'kiosk.app.cycleforge.ai';

/** Labels that must never be treated as a tenant slug on a kiosk host. */
const BLOCKED_KIOSK_SLUGS = new Set(['kiosk', 'www', 'app', 'api', 'admin']);

function stripHostPort(host: string): string {
  // IPv6 in brackets is out of scope for tenant hosts.
  if (host.startsWith('[')) return host;
  return host.split(':')[0] ?? host;
}

/** Normalize a Host / x-forwarded-host value (lowercase, no port, first of list). */
export function normalizeKioskRequestHost(host: string | null | undefined): string {
  if (!host) return '';
  let h = String(host).trim().toLowerCase();
  if (h.includes(',')) h = h.split(',')[0]!.trim();
  if (h.startsWith('http://') || h.startsWith('https://')) {
    try {
      h = new URL(h).host.toLowerCase();
    } catch {
      /* keep h */
    }
  }
  return stripHostPort(h);
}

/**
 * Suffix after `{slug}.` for kiosk hosts.
 * Override with `NEXT_PUBLIC_KIOSK_HOST_SUFFIX` (e.g. `kiosk.app.cycleforge.ai`
 * or `kiosk.localhost` for local `/etc/hosts`).
 */
export function getKioskHostSuffix(): string {
  const explicit = normalizeEnvValue(process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX).toLowerCase();
  if (explicit) return explicit.replace(/^\.+/, '').replace(/\/+$/, '');

  const pub = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);
  if (pub) {
    try {
      return `kiosk.${new URL(pub).hostname.toLowerCase()}`;
    } catch {
      /* fall through */
    }
  }

  // Server-only fallback (APP_URL / VERCEL_URL) — not available on the client bundle.
  if (typeof window === 'undefined') {
    const app = resolvePublicAppUrl();
    if (app) {
      try {
        return `kiosk.${new URL(app).hostname.toLowerCase()}`;
      } catch {
        /* fall through */
      }
    }
  }

  return DEFAULT_KIOSK_HOST_SUFFIX;
}

/** Staff app hostname (`app.cycleforge.ai`), derived parallel to the kiosk suffix. */
function getStaffAppHostname(): string {
  const pub = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);
  if (pub) {
    try {
      return new URL(pub).hostname.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  if (typeof window === 'undefined') {
    const app = resolvePublicAppUrl();
    if (app) {
      try {
        return new URL(app).hostname.toLowerCase();
      } catch {
        /* fall through */
      }
    }
  }
  const suffix = getKioskHostSuffix();
  if (suffix.startsWith('kiosk.')) return suffix.slice('kiosk.'.length);
  return DEFAULT_APP_HOSTNAME;
}

function isLocalKioskSuffix(suffix: string): boolean {
  return suffix === 'localhost' || suffix.endsWith('.localhost') || suffix.includes('localhost');
}

/**
 * Parse a tenant kiosk host → `{ slug }`.
 * Examples: `usav.kiosk.app.cycleforge.ai`, `usav.kiosk.localhost`.
 * Bare platform host `kiosk.app.cycleforge.ai` → null (not a tenant).
 */
export function parseKioskHost(host: string | null | undefined): { slug: string } | null {
  const cleaned = normalizeKioskRequestHost(host);
  if (!cleaned) return null;

  const suffix = getKioskHostSuffix();
  if (cleaned === suffix) return null;
  if (!cleaned.endsWith(`.${suffix}`)) return null;

  const prefix = cleaned.slice(0, -(suffix.length + 1));
  if (!prefix || prefix.includes('.')) return null;
  if (!/^[a-z0-9-]+$/.test(prefix)) return null;
  if (BLOCKED_KIOSK_SLUGS.has(prefix)) return null;
  return { slug: prefix };
}

/** True when Host is a tenant kiosk host (`{slug}.kiosk.…`). */
export function isKioskHost(host: string | null | undefined): boolean {
  return parseKioskHost(host) !== null;
}

/** Bare platform kiosk apex (`kiosk.app.cycleforge.ai`) — refuse intake. */
export function isBareKioskPlatformHost(host: string | null | undefined): boolean {
  const cleaned = normalizeKioskRequestHost(host);
  if (!cleaned) return false;
  return cleaned === getKioskHostSuffix();
}

/**
 * Staff app host (apex or `{slug}.app…`), not a kiosk host.
 * Used when redirecting legacy `/kiosk` off the staff origin.
 */
export function isStaffAppHost(host: string | null | undefined): boolean {
  const cleaned = normalizeKioskRequestHost(host);
  if (!cleaned) return false;
  if (isKioskHost(cleaned) || isBareKioskPlatformHost(cleaned)) return false;

  const appHost = getStaffAppHostname();
  if (cleaned === appHost) return true;
  if (cleaned.endsWith(`.${appHost}`)) {
    const prefix = cleaned.slice(0, -(appHost.length + 1));
    return Boolean(prefix) && !prefix.includes('.') && /^[a-z0-9-]+$/.test(prefix);
  }
  // Dev: bare localhost is the staff app in local lanes.
  if (cleaned === 'localhost' || cleaned === '127.0.0.1') return true;
  return false;
}

function originPortSuffix(port?: string): string {
  const p = (port ?? '').trim();
  if (!p || p === '80' || p === '443') return '';
  return `:${p}`;
}

/** Public origin for a tenant's kiosk tablets (no trailing slash). */
export function kioskOriginForSlug(slug: string, opts?: { port?: string }): string {
  const safe = String(slug).trim().toLowerCase();
  if (!safe || BLOCKED_KIOSK_SLUGS.has(safe) || !/^[a-z0-9-]+$/.test(safe)) {
    throw new Error(`Invalid kiosk slug: ${slug}`);
  }
  const suffix = getKioskHostSuffix();
  const host = `${safe}.${suffix}`;
  if (isLocalKioskSuffix(suffix)) {
    let port = opts?.port;
    if (port == null && typeof window !== 'undefined') port = window.location.port;
    if (port == null && typeof process !== 'undefined') {
      port = normalizeEnvValue(process.env.PORT) || '3000';
    }
    return `http://${host}${originPortSuffix(port)}`;
  }
  return `https://${host}`;
}

/**
 * Where staff-host `/kiosk` should permanently redirect (no trailing slash).
 *
 * - Tenant staff slug host → that org's kiosk origin
 * - Production apex + `DEFAULT_TENANT_SLUG` → that org's kiosk origin (dogfood
 *   DNS bridge — apex staff bookmarks/MDM must not dump tablets to sign-in)
 * - Otherwise → null (caller: serve `/kiosk` in non-prod for E2E, or sign-in
 *   in production when no bridge is configured)
 */
export function staffKioskRedirectOrigin(opts: {
  tenantSlug: string | null | undefined;
  defaultTenantSlug?: string | null;
  isProduction: boolean;
}): string | null {
  const fromHost = String(opts.tenantSlug ?? '').trim().toLowerCase();
  if (fromHost) {
    try {
      return kioskOriginForSlug(fromHost);
    } catch {
      return null;
    }
  }
  if (!opts.isProduction) return null;
  const bridge = String(opts.defaultTenantSlug ?? '').trim().toLowerCase();
  if (!bridge) return null;
  try {
    return kioskOriginForSlug(bridge);
  } catch {
    return null;
  }
}

/** Public origin for a tenant's staff workspace (no trailing slash). */
export function staffOriginForSlug(slug: string, opts?: { port?: string }): string {
  const safe = String(slug).trim().toLowerCase();
  if (!safe || !/^[a-z0-9-]+$/.test(safe)) {
    throw new Error(`Invalid staff slug: ${slug}`);
  }
  const appHost = getStaffAppHostname();
  const host = `${safe}.${appHost}`;
  if (appHost === 'localhost' || appHost.endsWith('.localhost') || appHost.includes('localhost')) {
    let port = opts?.port;
    if (port == null && typeof window !== 'undefined') port = window.location.port;
    if (port == null && typeof process !== 'undefined') {
      port = normalizeEnvValue(process.env.PORT) || '3000';
    }
    return `http://${host}${originPortSuffix(port)}`;
  }
  return `https://${host}`;
}

/**
 * Paths allowed on a tenant kiosk host. Everything else → 404 (no staff chrome).
 * Staff-only `/api/kiosk/enroll|revoke|devices` are intentionally excluded.
 */
const KIOSK_HOST_ALLOWED_PATHS: ReadonlyArray<RegExp> = [
  /^\/$/,
  /^\/kiosk(?:$|\/)/,
  /^\/api\/kiosk\/pair(?:$|\/)/,
  /^\/api\/kiosk\/intake(?:$|\/)/,
  /^\/api\/kiosk\/repair(?:$|\/)/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/manifest\.(json|webmanifest)$/,
  /^\/sw\.js$/,
  /^\/workbox-/,
  /^\/icons?\//,
  /^\/\.well-known\//,
  /^\/api\/health(?:$|\/)/,
  /^\/api\/ready(?:$|\/)/,
  /^\/offline(?:$|\/)/,
];

/** Dev-only local-testing convenience — see /api/kiosk/dev-autopair/route.ts.
 *  The route itself 404s in production regardless, but it must never even
 *  appear reachable on a real kiosk-host deployment's allowlist. */
const KIOSK_HOST_DEV_ONLY_ALLOWED_PATHS: ReadonlyArray<RegExp> = [
  /^\/api\/kiosk\/dev-autopair(?:$|\/)/,
];

export function isKioskHostAllowedPath(pathname: string): boolean {
  if (KIOSK_HOST_ALLOWED_PATHS.some((re) => re.test(pathname))) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return KIOSK_HOST_DEV_ONLY_ALLOWED_PATHS.some((re) => re.test(pathname));
}
