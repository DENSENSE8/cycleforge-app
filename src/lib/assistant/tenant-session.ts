/**
 * One tenant connection per tool ROUND (Ask plan §22 H1), on the assistant's
 * OWN pool (SCALE-ROI row 2).
 *
 * `tenantQuery` is BEGIN + `set_config` + the query + COMMIT — four round
 * trips. Measured from the dev box to the dev Neon pooler that is 340–696 ms
 * for a query whose SQL executes in 0.034 ms, so an Ask turn that runs three
 * reads pays roughly a second of pure connection ceremony. Running those reads
 * on ONE checked-out client with ONE `SET LOCAL` collapses that to a single
 * BEGIN/COMMIT (measured 553 ms for three queries versus ~1,020 ms).
 *
 * Scope is the tool round, NOT the whole turn, and that is deliberate. A turn
 * spans model round trips of seconds each (up to MAX_TURNS of them); holding an
 * open transaction across them would park an idle-in-transaction connection on
 * the pooler for a minute at a time — the classic way a chat feature takes the
 * database down under load. The session holds nothing between rounds.
 *
 * The batch client is checked out LAZILY — on the round's first `query`, not
 * when the round opens. A round whose tools never touch `query` (the record
 * finder runs on its own helpers, UI tools touch nothing) holds no connection
 * at all, and `release()` hands the client back mid-round so a tool can wait on
 * an external system (a carrier refresh, a label quote) without parking a
 * pooled connection idle-in-transaction; the next `query` reopens one.
 *
 * Pool isolation: every connection here comes from `assistantPool`, not the
 * tenant pool page routes use. Before, a round held one tenant-pool client
 * while its tools checked more out of the same 5-slot pool — about six
 * concurrent tool turns starved every route on the instance (incident
 * 2026-09-27: chat tool queries blocked 6 s behind `/api/orders`).
 *
 * Outside a batch the session is a standalone tenant query on the assistant
 * pool, so a caller that never opens one behaves as before.
 *
 * Tenancy: the batch client's GUC is set from the session's org. A query for a
 * DIFFERENT org can never ride it — it falls back to a standalone query, which
 * sets that org's GUC on its own connection. The org still comes from the
 * authenticated ctx; this module only decides which connection carries it.
 */

import type { PoolClient } from 'pg';
import { assistantPool, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AssistantToolDeps, AssistantToolQueryResult } from './tools/types';

export interface TenantSessionStats {
  /** Connections checked out for a batch (one BEGIN/COMMIT each). */
  batches: number;
  /** Queries served from an open batch client. */
  batched: number;
  /** Queries that opened their own connection (outside a batch, or another org). */
  standalone: number;
}

export interface TenantSession {
  /** Drop-in for `AssistantToolDeps.query`. */
  query: AssistantToolDeps['query'];
  /** Run `fn` with one lazily checked-out, org-scoped client behind `query`. */
  runBatch: <T>(fn: () => Promise<T>) => Promise<T>;
  /**
   * Commit and return the batch client now (no-op when none is held). The
   * batch stays open: the next `query` checks a fresh client out.
   */
  release: () => Promise<void>;
  stats: () => TenantSessionStats;
}

export interface TenantSessionDeps {
  /** Hold one org-scoped connection (BEGIN … COMMIT) for as long as `fn` runs. */
  withConnection: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
}

const realDeps: TenantSessionDeps = {
  withConnection: (orgId, fn) => withTenantConnection(orgId, fn, assistantPool),
};

/** A checked-out batch connection and the switch that ends its transaction. */
interface Held {
  client: Promise<PoolClient>;
  /** Commit (no error) or roll back (error); resolves once the client is back in the pool. */
  settle: (err?: unknown) => Promise<void>;
}

export function createTenantSession(
  orgId: OrgId,
  deps: TenantSessionDeps = realDeps,
): TenantSession {
  let inBatch = false;
  let held: Held | null = null;
  const stats: TenantSessionStats = { batches: 0, batched: 0, standalone: 0 };

  const open = (): Held => {
    stats.batches += 1;
    let gotClient!: (c: PoolClient) => void;
    let noClient!: (err: unknown) => void;
    const client = new Promise<PoolClient>((resolve, reject) => {
      gotClient = resolve;
      noClient = reject;
    });
    let finish!: (err?: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      finish = (err) => (err === undefined ? resolve() : reject(err));
    });
    // Observed by `await done` below; this only keeps a connect failure (fn
    // never ran, nobody awaits `done`) from surfacing as an unhandled rejection.
    done.catch(() => {});
    const connection = deps.withConnection(orgId, async (c) => {
      gotClient(c);
      await done;
    });
    // A checkout/BEGIN failure reaches the waiting query instead of hanging it.
    connection.catch(noClient);
    return {
      client,
      settle: async (err) => {
        finish(err);
        try {
          await connection;
        } catch (e) {
          // A rollback rethrows the round's own error — already the caller's. A
          // failed COMMIT on a clean round is new information: surface it.
          if (err === undefined) throw e;
        }
      },
    };
  };

  const query: AssistantToolDeps['query'] = async (
    queryOrgId,
    text,
    params,
  ): Promise<AssistantToolQueryResult> => {
    if (inBatch && queryOrgId === orgId) {
      held ??= open();
      const client = await held.client;
      stats.batched += 1;
      const r = await client.query(text, params as unknown[] | undefined);
      return { rows: r.rows as Array<Record<string, unknown>> };
    }
    stats.standalone += 1;
    const r = await deps.withConnection(queryOrgId, (c) => c.query(text, params as unknown[] | undefined));
    return { rows: r.rows as Array<Record<string, unknown>> };
  };

  const release = async (): Promise<void> => {
    const current = held;
    held = null;
    await current?.settle();
  };

  const runBatch = async <T,>(fn: () => Promise<T>): Promise<T> => {
    // Re-entrant: a nested batch shares the open one rather than opening a
    // second transaction on a second connection.
    if (inBatch) return fn();
    inBatch = true;
    try {
      const result = await fn();
      await release();
      return result;
    } catch (err) {
      const current = held;
      held = null;
      await current?.settle(err);
      throw err;
    } finally {
      inBatch = false;
    }
  };

  return { query, runBatch, release, stats: () => ({ ...stats }) };
}
