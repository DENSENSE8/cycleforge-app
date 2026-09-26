/** Enhanced Neon DB client — server-side only. */

import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL && process.env.NODE_ENV !== 'test') {
  throw new Error('[neon-client] DATABASE_URL environment variable is not set');
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const connectionTimeoutMillis = readPositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 10000);
const queryTimeoutMillis = readPositiveInt(process.env.PG_QUERY_TIMEOUT_MS, 30000);
const statementTimeoutMillis = readPositiveInt(process.env.PG_STATEMENT_TIMEOUT_MS, queryTimeoutMillis);
const idleTxTimeoutMillis = readPositiveInt(process.env.PG_IDLE_TX_TIMEOUT_MS, 30000);
const poolMax = readPositiveInt(process.env.PG_POOL_MAX, 10);
const idleTimeoutMillis = readPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 30000);

// ─── Pooled client (transactions + high-frequency queries) ────────────────────

export const pool = new Pool({
  connectionString: DATABASE_URL ?? 'postgres://localhost:5432/postgres',
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis,
  query_timeout: queryTimeoutMillis,
  statement_timeout: statementTimeoutMillis,
  idle_in_transaction_session_timeout: idleTxTimeoutMillis,
  options: '-c timezone=America/Los_Angeles',
  // Keep a small pool — Neon serverless handles connection management
  max: poolMax,
  idleTimeoutMillis,
});

pool.on('error', (err) => {
  handleDbError(err, 'pool:idle');
});

// ─── Tagged-template query helper ─────────────────────────────────────────────

/** Executes a parameterised SQL query via the connection pool. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  // Build parameterised query from template literal
  const text = strings.reduce(
    (acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''),
    '',
  );
  try {
    const result = await pool.query<T>(text, values);
    return result.rows;
  } catch (err) {
    handleDbError(err, 'query');
    throw err;
  }
}

/** Executes a query from a plain string + params array. */
export async function queryRaw<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await pool.query<T>(text, params);
    return result.rows;
  } catch (err) {
    handleDbError(err, 'queryRaw');
    throw err;
  }
}

// ─── Transaction helper ────────────────────────────────────────────────────────

/** Runs `fn` inside a database transaction. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    handleDbError(err, 'transaction');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Query performance helpers ────────────────────────────────────────────────

/**
 * Executes a query and returns the first row, or null if no rows found.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await query<T>(strings, ...values);
  return rows[0] ?? null;
}

/**
 * Returns the count from a `SELECT COUNT(*)` query as a number.
 */
export async function queryCount(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<number> {
  const rows = await query<{ count: string }>(strings, ...values);
  return parseInt(rows[0]?.count ?? '0', 10);
}

// ─── Error handling ───────────────────────────────────────────────────────────

function handleDbError(err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV === 'development') {
    console.error(`[DB Error] ${context}:`, message, err);
  } else {
    console.error(`[DB Error] ${context}: ${message}`);
  }
}
