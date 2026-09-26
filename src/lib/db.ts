// Single-driver pool:
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

/* ONE BRANCH PER ENVIRONMENT — asserted at import, because a silent split cost a full day on 2026-09-14. */
const branchSplit = describeBranchSplit(process.env);
if (branchSplit) {
  if (process.env.NODE_ENV === 'production') console.error(`[db] ${branchSplit}`);
  else throw new Error(`[db] ${branchSplit}`);
}

// Local dev against a plain Postgres (e.g.
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
const pool: PgPool = new NeonPool({
    connectionString,
    ...basePoolOptions,
}) as unknown as PgPool;

// Tenant-runtime pool.
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
