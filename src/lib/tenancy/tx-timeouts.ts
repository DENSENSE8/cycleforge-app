/**
 * Server-side per-transaction timeouts for the tenant BEGIN paths.
 *
 * The pooler (Neon PgBouncer, transaction mode) rejects `-c statement_timeout`
 * startup options and `pg`'s `query_timeout` is client-side only, so the only
 * enforced limits are role defaults (migration 2026-09-27_role_statement_timeouts)
 * and transaction-local settings. This builds the transaction-local ones as a
 * single SELECT so they ride the existing BEGIN / one-trip message: no extra
 * round trip. `is_local=true` means they die at COMMIT/ROLLBACK.
 *
 * Env (ms, 0 disables that limit): PG_TX_STATEMENT_TIMEOUT_MS (15000),
 * PG_TX_LOCK_TIMEOUT_MS (5000), PG_TX_IDLE_TIMEOUT_MS (30000).
 */

function readMs(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export interface TxTimeouts {
  statementMs: number;
  lockMs: number;
  idleInTxMs: number;
}

export function readTxTimeouts(env: Record<string, string | undefined> = process.env): TxTimeouts {
  return {
    statementMs: readMs(env.PG_TX_STATEMENT_TIMEOUT_MS, 15_000),
    lockMs: readMs(env.PG_TX_LOCK_TIMEOUT_MS, 5_000),
    idleInTxMs: readMs(env.PG_TX_IDLE_TIMEOUT_MS, 30_000),
  };
}

/** `set_config` calls (comma-joined select list) for the given timeouts. Values are integers, safe to inline. */
export function txTimeoutSelectList(t: TxTimeouts): string {
  return [
    `set_config('statement_timeout', '${t.statementMs}', true)`,
    `set_config('lock_timeout', '${t.lockMs}', true)`,
    `set_config('idle_in_transaction_session_timeout', '${t.idleInTxMs}', true)`,
  ].join(', ');
}

export const TX_TIMEOUT_SELECT_LIST = txTimeoutSelectList(readTxTimeouts());
