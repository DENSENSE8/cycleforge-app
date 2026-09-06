/**
 * Tenant slug extraction from a request host.
 *
 * Lifted out of `src/proxy.ts` so a route handler can derive the tenant from the
 * HOST itself instead of trusting the `x-tenant-slug` header the proxy stamps.
 * The proxy deletes any inbound copy of that header before setting its own, but
 * a handler that is reachable without going through the proxy (direct function
 * invocation, a matcher gap, an internal fetch) would otherwise inherit a
 * caller-chosen tenant. Anything that decides *authentication* scope — see
 * `resolveOrgIdFromHost` — must use this, not the header.
 *
 * `src/proxy.ts` is the only other consumer; keep this module free of any
 * `next/server` or DB import so both an edge middleware and a node route can
 * load it.
 */

/**
 * Hostnames that are NOT a tenant subdomain. Anything else of the form
 * `slug.<root>` is a tenant slug.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set<string>([
  'www',
  'app',
  'api',
  'admin',
  'docs',
  'status',
  'staging',
  'preview',
  // Platform kiosk apex (`kiosk.app.cycleforge.ai`) — not a tenant. Tenant
  // kiosks live at `{slug}.kiosk.app.cycleforge.ai` (first label = slug).
  'kiosk',
  // Named Cloudflare dev tunnel (pnpm dev:tunnel:named) — not a tenant slug.
  'usav-dev',
]);

/**
 * The tenant slug carried by `host`, or `null` when the host is an apex,
 * a reserved subdomain, a bare IP, `localhost`, or a preview/tunnel hostname.
 * Never throws; a `null` return is the fail-closed answer.
 */
export function extractTenantSlug(host: string | null): string | null {
  if (!host) return null;
  // Strip port if present.
  const cleaned = host.split(':')[0]!.toLowerCase();
  // localhost and bare IPs never carry a subdomain.
  if (cleaned === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(cleaned)) return null;
  const parts = cleaned.split('.');
  // Need at least subdomain.root.tld to claim a tenant slug.
  if (parts.length < 3) return null;
  const candidate = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(candidate)) return null;
  // Vercel preview hostnames like usav-orders-git-foo-bar.vercel.app — the
  // subdomain there is the project, not a tenant. Cheap heuristic: any host
  // ending in .vercel.app skips slug extraction.
  if (cleaned.endsWith('.vercel.app')) return null;
  // Dev tunnel hostnames (Cloudflare quick tunnels, ngrok) carry a random
  // subdomain that is not a tenant. Without this, e.g. quiet-frog-1234 from
  // quiet-frog-1234.trycloudflare.com resolves to an unknown org and every
  // org-scoped query (staff picker, etc.) comes back empty on the phone.
  if (
    cleaned.endsWith('.trycloudflare.com') ||
    cleaned.endsWith('.ngrok-free.app') ||
    cleaned.endsWith('.ngrok.app') ||
    cleaned.endsWith('.ngrok.io')
  ) {
    return null;
  }
  return candidate;
}
