/** ONE BRANCH PER ENVIRONMENT — the check, as a pure function. */

/** Every env var that names a Postgres host for this app or its tooling. */
const BRANCH_ENV_VARS = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'TENANT_APP_DATABASE_URL',
  'ADMIN_DATABASE_URL',
  'POSTGRES_URL',
  'PGHOST',
  'PGHOST_UNPOOLED',
] as const;

/** Branch identity for one value. */
export function neonBranchHost(value: string | undefined | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const host = raw.includes('://') ? (/@([^/?:]+)/.exec(raw)?.[1] ?? null) : raw.split('/')[0];
  if (!host) return null;
  const normalised = host.replace('-pooler', '').toLowerCase();
  if (normalised.startsWith('localhost') || normalised.startsWith('127.0.0.1')) return null;
  return normalised;
}

/**
 * Null when every configured DSN names one branch (the only sane state).
 * Otherwise a message naming each branch and the vars pointing at it — the
 * whole point is that the operator can see WHICH var dragged them apart.
 */
export function describeBranchSplit(
  env: Record<string, string | undefined>,
): string | null {
  const varsByHost: Record<string, string[]> = {};
  for (const name of BRANCH_ENV_VARS) {
    const host = neonBranchHost(env[name]);
    if (!host) continue;
    (varsByHost[host] ??= []).push(name);
  }

  const hosts = Object.keys(varsByHost);
  if (hosts.length <= 1) return null;

  const detail = hosts.map((h) => `${h} ← ${varsByHost[h]!.join(', ')}`).join('  |  ');
  return (
    `Database DSNs name ${hosts.length} different Neon branches: ${detail}. ` +
    'Reads and writes will split across them and joins will silently return nothing. ' +
    'Point every one of these at a single branch — check .env AND any systemd ' +
    'EnvironmentFile, which overrides it.'
  );
}
