/**
 * `search_query_log` writer + the zero-result worklist reader.
 *
 * WHY THIS EXISTS
 *   Search relevance cannot be improved by argument. Before this module there
 *   was no record of what operators typed, so "search is bad" and "search is
 *   fine" were equally unfalsifiable and every synonym or ranking change was a
 *   guess that could not be checked afterwards. Every row written here is
 *   evidence; {@link zeroResultWorklist} is the report that turns it into work.
 *
 * LATENCY CONTRACT
 *   Logging must never slow a search down and must never fail one. Callers run
 *   {@link recordSearchQuery} inside `after()` so it lands off the response
 *   path, and every function here swallows its own errors: a telemetry outage
 *   degrades to blindness, never to a broken find bar. That is also why there
 *   is no read-back or returned id — nothing downstream is allowed to depend on
 *   the write having happened.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SearchByScope } from '@/lib/search/search-by';
import { normalizeQuery } from '@/lib/search/query-expansion';

/** Which surface issued the search. Their zero-result rates are not comparable
 *  to each other, so the column exists to keep them apart in any report. */
export type SearchSurface = 'palette' | 'search-page';

export interface SearchQueryLogEntry {
  orgId: OrgId;
  /** NULL when the session carries no staff row; the aggregate survives it. */
  staffId: number | null;
  /** Verbatim, as typed — the failure is often in the typing. */
  query: string;
  axis?: SearchByScope | null;
  surface?: SearchSurface | null;
  resultCount: number;
  /** TRUE when these rows came from a relaxed retry, not the literal query. */
  relaxed?: boolean;
  usedSemantic?: boolean;
  latencyMs?: number | null;
}

export interface QueryLogDeps {
  write(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<{ rowCount: number | null }>;
  read<T extends Record<string, unknown>>(
    orgId: OrgId,
    sql: string,
    params: readonly unknown[],
  ): Promise<T[]>;
}

const defaultDeps: QueryLogDeps = {
  write: async (orgId, sql, params) =>
    withTenantTransaction(orgId, async (client) => {
      const res = await client.query(sql, params as unknown[]);
      return { rowCount: res.rowCount };
    }),
  read: async (orgId, sql, params) => {
    const res = await tenantQuery(orgId, sql, params);
    return res.rows as never[];
  },
};

/**
 * Record one executed search.
 *
 * A blank query is dropped rather than logged: the palette fires on an empty
 * field during open/close and those rows would be most of the table while
 * meaning nothing.
 */
export async function recordSearchQuery(
  entry: SearchQueryLogEntry,
  deps: QueryLogDeps = defaultDeps,
): Promise<void> {
  const normalized = normalizeQuery(entry.query);
  if (!normalized) return;

  try {
    await deps.write(
      entry.orgId,
      `INSERT INTO search_query_log
         (organization_id, staff_id, query, normalized_query, axis, surface,
          result_count, relaxed, used_semantic, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.orgId,
        entry.staffId,
        entry.query,
        normalized,
        entry.axis ?? null,
        entry.surface ?? null,
        entry.resultCount,
        entry.relaxed ?? false,
        entry.usedSemantic ?? false,
        entry.latencyMs ?? null,
      ],
    );
  } catch {
    // Blindness, not breakage. See the latency contract above.
  }
}

export interface SearchOpenedEntry {
  orgId: OrgId;
  staffId: number | null;
  /** The query that produced the row, so the open lands on the right log line. */
  query: string;
  entityType: string;
  entityId: number;
}

/**
 * Stamp the record an operator opened onto the search that surfaced it.
 *
 * Targets the most recent still-unopened row for this (org, staff, query).
 * "Most recent" matters: a keystroke-debounced palette writes several rows for
 * one search as the query grows, and the last one is the query that was on
 * screen when the operator chose. Rows left unstamped are the abandonment
 * signal and are deliberately never backfilled.
 */
export async function markSearchResultOpened(
  entry: SearchOpenedEntry,
  deps: QueryLogDeps = defaultDeps,
): Promise<void> {
  const normalized = normalizeQuery(entry.query);
  if (!normalized) return;

  try {
    await deps.write(
      entry.orgId,
      `UPDATE search_query_log
          SET opened_entity_type = $1,
              opened_entity_id   = $2,
              opened_at          = NOW()
        WHERE id = (
          SELECT id FROM search_query_log
           WHERE organization_id = $3
             AND normalized_query = $4
             AND staff_id IS NOT DISTINCT FROM $5
             AND opened_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
        )`,
      [entry.entityType, entry.entityId, entry.orgId, normalized, entry.staffId],
    );
  } catch {
    // See above.
  }
}

export interface ZeroResultRow {
  normalizedQuery: string;
  misses: number;
  distinctStaff: number;
  lastSeenAt: string;
}

/**
 * The worklist: queries operators ran that found nothing, worst first.
 *
 * This is the input to synonym curation and to coverage decisions — a term
 * that recurs here is either a missing synonym or a missing entity, and the
 * distinction is usually obvious once you can see the string. Ranked by miss
 * count then by how many different people hit it, because a term ten people
 * tried once is a vocabulary gap while a term one person tried ten times is
 * usually one bad afternoon.
 */
export async function zeroResultWorklist(
  orgId: OrgId,
  opts: { limit?: number; sinceDays?: number } = {},
  deps: QueryLogDeps = defaultDeps,
): Promise<ZeroResultRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const sinceDays = Math.min(Math.max(opts.sinceDays ?? 30, 1), 365);

  try {
    const rows = await deps.read<{
      normalized_query: string;
      misses: string;
      distinct_staff: string;
      last_seen_at: string;
    }>(
      orgId,
      `SELECT normalized_query,
              COUNT(*)                      AS misses,
              COUNT(DISTINCT staff_id)      AS distinct_staff,
              MAX(created_at)               AS last_seen_at
         FROM search_query_log
        WHERE organization_id = $1
          AND result_count = 0
          AND created_at >= NOW() - ($2 || ' days')::interval
        GROUP BY normalized_query
        ORDER BY misses DESC, distinct_staff DESC, last_seen_at DESC
        LIMIT $3`,
      [orgId, String(sinceDays), limit],
    );

    return rows.map((r) => ({
      normalizedQuery: r.normalized_query,
      misses: Number(r.misses),
      distinctStaff: Number(r.distinct_staff),
      lastSeenAt: String(r.last_seen_at),
    }));
  } catch {
    return [];
  }
}
