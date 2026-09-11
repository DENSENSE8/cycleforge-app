export function normalizeEnvValue(value: string | null | undefined): string {
  if (value == null) return '';

  const trimmed = String(value).trim();
  const wrapped = trimmed.match(/^(['"])([\s\S]*)\1$/);
  return (wrapped ? wrapped[2] : trimmed).trim();
}

/** Public app origin (no trailing slash) for OAuth callbacks, invite links, etc. */
export function resolvePublicAppUrl(): string {
  const explicit =
    normalizeEnvValue(process.env.APP_URL) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL) ||
    (process.env.VERCEL_URL
      ? `https://${normalizeEnvValue(process.env.VERCEL_URL)}`
      : '');

  // Vercel env paste occasionally leaves a literal "\n" on the value.
  return explicit.replace(/\\n/g, '').replace(/\/+$/, '');
}

export function normalizeMultilineEnvValue(value: string | null | undefined): string {
  return normalizeEnvValue(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();
}

/**
 * Neon compute identity for a postgres DSN: host with the pooler suffix
 * stripped so `ep-foo` and `ep-foo-pooler` compare equal.
 *
 * Used to refuse a `TENANT_APP_DATABASE_URL` that points at a different
 * branch than `DATABASE_URL` (a lane `.env` that inherited production's
 * tenant DSN). That split made `/api/orders` query a schema the worktree
 * had already migrated past — `column o.oos_kind does not exist` — while
 * the owner pool on the lane branch was fine.
 */
export function postgresDsnComputeKey(url: string): string {
  const trimmed = normalizeEnvValue(url);
  const at = trimmed.indexOf('@');
  if (at < 0) return '';
  const host = trimmed.slice(at + 1).split('/')[0]?.split('?')[0] ?? '';
  return host.replace(/-pooler(?=\.|$)/i, '').toLowerCase();
}

/** Tenant-runtime DSN, or empty to alias the owner pool. */
export function resolveTenantAppDatabaseUrl(
  ownerUrl: string,
  tenantUrl: string | null | undefined,
): string {
  const tenant = normalizeEnvValue(tenantUrl);
  if (!tenant) return '';
  const ownerKey = postgresDsnComputeKey(ownerUrl);
  const tenantKey = postgresDsnComputeKey(tenant);
  if (ownerKey && tenantKey && ownerKey === tenantKey) return tenant;
  return '';
}
