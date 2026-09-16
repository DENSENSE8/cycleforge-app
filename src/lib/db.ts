// Single-driver pool: `@neondatabase/serverless` over WebSocket.
//
// Same driver in dev and prod so:
//   - Neon compute wake/sleep is handled by the driver (no stale TCP).
//   - Behavior matches production; no "works on my machine" surprises.
//
// Long-running scripts under `scripts/` and the pm2 pipeline use raw `pg`
// directly and are unaffected by this change.
// Hard server boundary: importing this module from client-component code is a
// build error (it was silently shipping the Neon driver in station bundles).
import 'server-only';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import type { Pool as PgPool } from 'pg';
import { describeBranchSplit } from '@/lib/db-single-branch';

// Load .env when running outside the Next.js runtime (e.g. standalone scripts).
// Next.js automatically loads .env/.env.local during dev/build, so this is a no-op there.
if (!process.env.NEXT_RUNTIME) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config();
  } catch { /* dotenv optional for non-script contexts */ }
}

function readPositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

// Generous connection timeout absorbs Neon compute cold-start (can be 15-25s).
const connectionTimeoutMillis = readPositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 30000);
const queryTimeoutMillis = readPositiveInt(process.env.PG_QUERY_TIMEOUT_MS, 30000);
const idleTxTimeoutMillis = readPositiveInt(process.env.PG_IDLE_TX_TIMEOUT_MS, 30000);
// WebSocket-backed pool — keep concurrency modest.
const poolMax = readPositiveInt(process.env.PG_POOL_MAX, 5);
const idleTimeoutMillis = readPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 10000);

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/postgres';
const adminConnectionString = process.env.ADMIN_DATABASE_URL || connectionString;

/*
 * ONE BRANCH PER ENVIRONMENT — asserted at import, because a silent split cost
 * a full day on 2026-09-14. The check itself is pure and lives in
 * `db-single-branch.ts` (this module is `server-only`, so nothing can import it
 * to test it); see that file for the failure it exists to catch.
 *
 * Fatal in development, a loud error log in production: a prod boot must not be
 * bricked by an env typo, and prod has a deploy gate that a lane does not.
 */
const branchSplit = describeBranchSplit(process.env);
if (branchSplit) {
  if (process.env.NODE_ENV === 'production') console.error(`[db] ${branchSplit}`);
  else throw new Error(`[db] ${branchSplit}`);
}

// Local dev against a plain Postgres (e.g. the Docker jarvis-db) needs a Neon
// WebSocket proxy, because @neondatabase/serverless speaks WSS, not raw TCP.
// This activates ONLY for a localhost DSN, so prod / real Neon is completely
// unaffected. Stand the proxy up with:
//   docker run -p 5488:80 -e APPEND_PORT=<pg-host>:5432 -e ALLOW_ADDR_REGEX='.*' \
//     ghcr.io/neondatabase/wsproxy
// Override host:port via NEON_WSPROXY (default localhost:5488).
if (/@(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(connectionString)) {
  const proxy = process.env.NEON_WSPROXY || 'localhost:5488';
  neonConfig.webSocketConstructor = ws;
  neonConfig.wsProxy = () => `${proxy}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const basePoolOptions = {
    connectionTimeoutMillis,
    query_timeout: queryTimeoutMillis,
    idle_in_transaction_session_timeout: idleTxTimeoutMillis,
    max: poolMax,
    idleTimeoutMillis,
    options: '-c timezone=America/Los_Angeles',
};

// Default (privileged) pool — connects as the DB owner (neondb_owner today).
// Raw `@/lib/db` importers use this; the owner BYPASSes RLS, so not-yet-migrated
// routes keep working against ENABLE-but-not-FORCE tables during the rollout.
// Typed as PgPool because callers use `pool.query<T>()` / `pool.connect()` generics.
// NeonPool exposes a compatible surface for our usage; cast at construction.
const pool: PgPool = new NeonPool({
    connectionString,
    ...basePoolOptions,
}) as unknown as PgPool;

// Tenant-runtime pool. Once the non-BYPASSRLS `app_tenant` role is provisioned
// (Phase E1) and TENANT_APP_DATABASE_URL points at its DSN, the GUC wrappers
// (withTenantConnection / tenantQuery / withTenantTransaction in
// src/lib/tenancy/db.ts) run on THIS pool, so RLS policies actually apply to
// those code paths and per-table FORCE can be turned on incrementally. Until the
// env var is set it ALIASES the owner pool, so behavior is unchanged today.
// See docs/tier0-go-live-runbook.md and the tenancy exec plan §Phase E1.
const tenantConnectionString = process.env.TENANT_APP_DATABASE_URL || '';
export const tenantPool: PgPool = tenantConnectionString
    ? (new NeonPool({
        connectionString: tenantConnectionString,
        ...basePoolOptions,
    }) as unknown as PgPool)
    : pool;

// Privileged pool for cross-org enumeration (cron org lists, MV refresh, migrations).
// Defaults to DATABASE_URL (owner) until ADMIN_DATABASE_URL is split out at Phase E1.
export const adminPool: PgPool = adminConnectionString === connectionString
    ? pool
    : (new NeonPool({
        connectionString: adminConnectionString,
        ...basePoolOptions,
    }) as unknown as PgPool);

export default pool;
