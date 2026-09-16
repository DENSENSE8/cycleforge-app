/**
 * ONE BRANCH PER ENVIRONMENT — the check, as a pure function.
 *
 * ## The failure this exists to catch (2026-09-14)
 *
 * A lane's systemd `EnvironmentFile` set `DATABASE_URL` to that lane's own Neon
 * branch while the worktree `.env` pointed `POSTGRES_URL`,
 * `TENANT_APP_DATABASE_URL` and `PGHOST*` at main. Process env beats dotenv, so
 * the running app read one branch while `psql` and drizzle-kit read another —
 * and nothing anywhere said so.
 *
 * The symptom was not an error. It was data that "would not sync": picker and
 * packer scans landed on one compute, the orders they belonged to on the other,
 * so every join returned nothing and three surfaces disagreed about reality.
 * Diagnosing it took a day; this check turns it into a startup message.
 *
 * `tenancy/db.ts` already compares two of these hosts, but it DEGRADES — it
 * silently aliases the tenant pool to the owner pool, disabling RLS. Splitting
 * this out keeps the whole check pure and injectable, so it can be tested
 * without importing the (server-only) pool module.
 */

/** Every env var that names a Postgres host for this app or its tooling. */
export const BRANCH_ENV_VARS = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'TENANT_APP_DATABASE_URL',
  'ADMIN_DATABASE_URL',
  'POSTGRES_URL',
  'PGHOST',
  'PGHOST_UNPOOLED',
] as const;

/**
 * Branch identity for one value. Accepts a full DSN or a bare hostname
 * (`PGHOST`), and normalises away Neon's `-pooler` suffix: the pooled and
 * direct endpoints of one branch ARE one branch and must not read as a split.
 *
 * Returns null for anything that does not name a branch — unset, or the
 * localhost DSN the wsproxy dev path uses.
 */
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
