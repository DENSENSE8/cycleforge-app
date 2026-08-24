/**
 * Staff app host SoT — `{slug}.app.cycleforge.ai`.
 *
 * Extracted from the deleted `kiosk-host.ts` (2026-08-22, kiosk product removal).
 * The kiosk half of that module was customer-facing and went with the product;
 * this half is not kiosk at all — it resolves the STAFF workspace origin that
 * `@/lib/qr/platform-link` mints into printed GS1 Digital Links, so it is a live
 * warehouse capability that outlives the kiosk.
 *
 * Pure string/env helpers — no db / node:crypto, safe on any runtime.
 */

import { normalizeEnvValue, resolvePublicAppUrl } from '@/lib/env-utils';

const DEFAULT_APP_HOSTNAME = 'app.cycleforge.ai';

/** Staff app hostname (`app.cycleforge.ai`), derived from the public app URL. */
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
  return DEFAULT_APP_HOSTNAME;
}

function originPortSuffix(port?: string): string {
  const p = (port ?? '').trim();
  if (!p || p === '80' || p === '443') return '';
  return `:${p}`;
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
