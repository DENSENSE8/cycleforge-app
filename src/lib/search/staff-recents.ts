/**
 * staff-recents — server SoT for the per-staff "most recently searched" history
 * (Dashboard Search mode). Backed by `search_recents`
 * (src/lib/migrations/2026-07-17b_search_recents.sql).
 *
 * MRU semantics: a repeat query does not append — the unique
 * (organization_id, staff_id, scope, lower(query)) key collapses it and the
 * writer bumps `created_at` so it floats to the top. Reads are newest-first,
 * capped at STAFF_RECENTS_MAX; the writer trims the tail so the table stays
 * bounded per staffer.
 *
 * Rows are returned in the shared `SearchRecentEntry` shape so the same
 * `SearchRecentsDropdown` renderer works over the DB store and the legacy
 * localStorage store alike.
 */

import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSearchScopeLabel } from '@/lib/search/search-scope-labels';
import type { SearchRecentEntry } from '@/lib/search/search-recents';

/** Max rows retained per staffer (across scopes). Reads default to this too. */
const STAFF_RECENTS_MAX = 50;

interface SearchRecentDbRow {
  id: string | number;
  query: string;
  scope: string;
  scope_label: string | null;
  scope_href: string | null;
  result_count: number | null;
  top_hit: SearchRecentEntry['topHit'] | null;
  created_at: Date | string;
}

/**
 * `scope_label` is RE-RESOLVED on read, never trusted (2026-08-21).
 *
 * The column is a snapshot of whatever the writer's surface called itself at
 * insert time, and rows outlive the code path that wrote them: 89 dogfood rows
 * still carried `Search` from `GlobalFindCombobox`'s retired
 * `scope: isStage ? 'dashboard' : 'global'` line. `scope` is the durable fact;
 * the label is a presentation of it, so it resolves through the one SoT
 * ({@link resolveSearchScopeLabel}) on every read.
 */
function toEntry(row: SearchRecentDbRow): SearchRecentEntry {
  return {
    id: String(row.id),
    query: row.query,
    scope: row.scope,
    scopeLabel: resolveSearchScopeLabel(row.scope),
    scopeHref: row.scope_href ?? undefined,
    resultCount: row.result_count ?? undefined,
    topHit: row.top_hit ?? undefined,
    timestamp: (row.created_at instanceof Date ? row.created_at : new Date(row.created_at)).toISOString(),
  };
}

/** Newest-first recents for a staffer. `scope` filters to one bucket. */
export async function listStaffRecents(
  orgId: OrgId,
  staffId: number,
  opts: { scope?: string; limit?: number } = {},
): Promise<SearchRecentEntry[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? STAFF_RECENTS_MAX), STAFF_RECENTS_MAX);
  const params: unknown[] = [orgId, staffId];
  let scopeClause = '';
  if (opts.scope) {
    params.push(opts.scope);
    scopeClause = `AND scope = $${params.length}`;
  }
  params.push(limit);
  const res = await tenantQuery<SearchRecentDbRow>(
    orgId,
    `SELECT id, query, scope, scope_label, scope_href, result_count, top_hit, created_at
       FROM search_recents
      WHERE organization_id = $1 AND staff_id = $2 ${scopeClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(toEntry);
}

interface PushStaffRecentInput {
  query: string;
  scope?: string;
  scopeLabel?: string | null;
  scopeHref?: string | null;
  resultCount?: number | null;
  topHit?: SearchRecentEntry['topHit'] | null;
}

/**
 * Record (or MRU-bump) a query for a staffer, then trim the tail to
 * STAFF_RECENTS_MAX. Returns the fresh newest-first list. A blank query is a
 * no-op (returns the current list).
 */
export async function pushStaffRecent(
  orgId: OrgId,
  staffId: number,
  input: PushStaffRecentInput,
): Promise<SearchRecentEntry[]> {
  const query = input.query.trim();
  if (!query) return listStaffRecents(orgId, staffId);
  const scope = (input.scope || 'global').trim() || 'global';

  // One pooled checkout / one transaction for the whole write: upsert →
  // (only if a genuinely new row) trim → re-list. `COALESCE(EXCLUDED.x, …)` on
  // the optional columns means an MRU bump that carries less context never wipes
  // a previously-stored top_hit / result_count / label.
  return withTenantConnection(orgId, async (client) => {
    const upsert = await client.query<{ inserted: boolean }>(
      `INSERT INTO search_recents
         (organization_id, staff_id, query, scope, scope_label, scope_href, result_count, top_hit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id, staff_id, scope, lower(query))
       DO UPDATE SET
         query = EXCLUDED.query,
         scope_label = COALESCE(EXCLUDED.scope_label, search_recents.scope_label),
         scope_href = COALESCE(EXCLUDED.scope_href, search_recents.scope_href),
         result_count = COALESCE(EXCLUDED.result_count, search_recents.result_count),
         top_hit = COALESCE(EXCLUDED.top_hit, search_recents.top_hit),
         created_at = now(),
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        orgId,
        staffId,
        query.slice(0, 256),
        scope,
        input.scopeLabel ?? null,
        input.scopeHref ?? null,
        input.resultCount ?? null,
        input.topHit != null ? JSON.stringify(input.topHit) : null,
      ],
    );

    // A pure MRU bump can't grow the row count, so only a genuinely new row can
    // push the staffer over the cap — skip the trim otherwise.
    if (upsert.rows[0]?.inserted) {
      await client.query(
        `DELETE FROM search_recents
          WHERE organization_id = $1 AND staff_id = $2
            AND id NOT IN (
              SELECT id FROM search_recents
               WHERE organization_id = $1 AND staff_id = $2
               ORDER BY created_at DESC, id DESC
               LIMIT $3
            )`,
        [orgId, staffId, STAFF_RECENTS_MAX],
      );
    }

    const res = await client.query<SearchRecentDbRow>(
      `SELECT id, query, scope, scope_label, scope_href, result_count, top_hit, created_at
         FROM search_recents
        WHERE organization_id = $1 AND staff_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [orgId, staffId, STAFF_RECENTS_MAX],
    );
    return res.rows.map(toEntry);
  });
}

/** Remove one recent by id (scoped to the staffer). Returns the fresh list. */
export async function removeStaffRecent(
  orgId: OrgId,
  staffId: number,
  id: number,
): Promise<SearchRecentEntry[]> {
  return withTenantConnection(orgId, async (client) => {
    await client.query(
      `DELETE FROM search_recents WHERE organization_id = $1 AND staff_id = $2 AND id = $3`,
      [orgId, staffId, id],
    );
    const res = await client.query<SearchRecentDbRow>(
      `SELECT id, query, scope, scope_label, scope_href, result_count, top_hit, created_at
         FROM search_recents
        WHERE organization_id = $1 AND staff_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [orgId, staffId, STAFF_RECENTS_MAX],
    );
    return res.rows.map(toEntry);
  });
}

/** Clear all recents for a staffer (optionally one scope). */
export async function clearStaffRecents(
  orgId: OrgId,
  staffId: number,
  scope?: string,
): Promise<void> {
  const params: unknown[] = [orgId, staffId];
  let scopeClause = '';
  if (scope) {
    params.push(scope);
    scopeClause = `AND scope = $${params.length}`;
  }
  await tenantQuery(
    orgId,
    `DELETE FROM search_recents WHERE organization_id = $1 AND staff_id = $2 ${scopeClause}`,
    params,
  );
}
