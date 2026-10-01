/** Tenant slug parsing for staff hosts. Dependency-free for the Edge proxy. */

const RESERVED_SUBDOMAINS = new Set<string>([
  'www',
  'app',
  'api',
  'admin',
  'docs',
  'status',
  'staging',
  'preview',
  'kiosk',
  'usav-dev',
]);

function hostname(host: string | null | undefined): string {
  return String(host ?? '')
    .split(',')[0]!
    .trim()
    .split(':')[0]!
    .toLowerCase();
}

/**
 * Resolve `{tenant}.app.example.com` (and `{tenant}.<lane-host>`) without
 * mistaking the lane host itself for a tenant.
 *
 * `prod.michaelgarisek.com` used to resolve as tenant `prod`; consequently the
 * bare testing URL and `usav.prod.michaelgarisek.com` entered different auth
 * workspaces before the sidebar loaded. `LANE_HOST` is the bare host and must
 * therefore fall through to `DEFAULT_TENANT_SLUG` just like localhost.
 */
export function extractStaffTenantSlug(
  host: string | null,
  options: { laneHost?: string | null } = {},
): string | null {
  const cleaned = hostname(host);
  if (!cleaned) return null;

  const laneHost = hostname(options.laneHost);
  if (laneHost && cleaned === laneHost) return null;

  if (cleaned === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(cleaned)) return null;
  const parts = cleaned.split('.');
  if (parts.length < 3) return null;
  const candidate = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(candidate)) return null;
  if (cleaned.endsWith('.vercel.app')) return null;
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
