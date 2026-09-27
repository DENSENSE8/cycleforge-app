/**
 * One tenant connection per tool ROUND (Ask plan §22 H1).
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
 * database down under load. A batch therefore lives exactly as long as the
 * tools execute (~350 ms), and the session holds nothing between rounds.
 *
 * Outside a batch the session is exactly `tenantQuery`, so a caller that never
 * opens one behaves as before.
 *
 * Tenancy: the batch client's GUC is set from the session's org. A query for a
 * DIFFERENT org can never ride it — it falls back to `tenantQuery`, which sets
 * that org's GUC on its own connection. The org still comes from the
 * authenticated ctx; this module only decides which connection carries it.
 */

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AssistantToolDeps, AssistantToolQueryResult } from './tools/types';

export interface TenantSessionStats {
  /** Batches opened (one connection checkout + BEGIN/COMMIT each). */
  batches: number;
  /** Queries served from an open batch client. */
  batched: number;
  /** Queries that opened their own connection (outside a batch, or another org). */
  standalone: number;
}

export interface TenantSession {
  /** Drop-in for `AssistantToolDeps.query`. */
  query: AssistantToolDeps['query'];
  /** Run `fn` with one checked-out, org-scoped client behind `query`. */
  runBatch: <T>(fn: () => Promise<T>) => Promise<T>;
  stats: () => TenantSessionStats;
}

export interface TenantSessionDeps {
  withConnection: typeof withTenantConnection;
  query: typeof tenantQuery;
}

const realDeps: TenantSessionDeps = { withConnection: withTenantConnection, query: tenantQuery };

export function createTenantSession(
  orgId: OrgId,
  deps: TenantSessionDeps = realDeps,
): TenantSession {
  let client: PoolClient | null = null;
  const stats: TenantSessionStats = { batches: 0, batched: 0, standalone: 0 };

  const query: AssistantToolDeps['query'] = async (
    queryOrgId,
    text,
    params,
  ): Promise<AssistantToolQueryResult> => {
    if (client && queryOrgId === orgId) {
      stats.batched += 1;
      const r = await client.query(text, params as unknown[] | undefined);
      return { rows: r.rows as Array<Record<string, unknown>> };
    }
    stats.standalone += 1;
    const r = await deps.query(queryOrgId, text, params);
    return { rows: r.rows as Array<Record<string, unknown>> };
  };

  const runBatch = async <T,>(fn: () => Promise<T>): Promise<T> => {
    // Re-entrant: a nested batch reuses the open client rather than opening a
    // second transaction on a second connection.
    if (client) {
      return fn();
    }
    stats.batches += 1;
    return deps.withConnection(orgId, async (c) => {
      client = c;
      try {
        return await fn();
      } finally {
        client = null;
      }
    });
  };

  return { query, runBatch, stats: () => ({ ...stats }) };
}
