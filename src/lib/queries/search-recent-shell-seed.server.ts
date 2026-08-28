/**
 * Shell paint seed for bare `/search` — the "Recently searched" rail.
 *
 * ## Why `/search` is on the shell-seed path at all
 *
 * Bare `/search` (no `?q=`, no `?sel=`) paints NOTHING data-shaped until a
 * two-hop client chain lands: hydrate → fetch the `searchRecent` rail feed
 * (`/api/receiving-lines?view=viewed`) → auto-select rows[0] (writes `?sel=`)
 * → fetch the record detail → paint. Measured 2026-08-28 (desktop profile,
 * production build): Perf 79, SI ~3.9s, LCP ~2.3s, with the viewport near-blank
 * at 2.4s. The rail is mounted by the SHELL (`SidebarContextPanel` sibling of
 * the page), so a page-level `HydrationBoundary` can never reach it — the same
 * ordering fact that put `/unbox` here (see `unbox-shell-seed.server.ts`).
 *
 * ## RSC-seed gate (both clauses pass)
 *
 * 1. Cheap ranking column: `receiving_line_views` is a narrow per-staff table
 *    with `idx_receiving_line_views_staff_recent`; the rank read is a single
 *    index probe (`staff_id`, `viewed_at DESC`, LIMIT 20) — the same shape as
 *    `receiving_unbox.opened_at` (0.32ms) on `/unbox`.
 * 2. Something to narrow: the unrestricted `view=viewed` list query runs ~15
 *    display laterals over every candidate line before it can sort on a
 *    correlated `viewed_at` subquery. Pre-limiting with `receiving_id_in` from
 *    the rank keeps the lateral work to the ≤20 cartons that can paint.
 *
 * ## Scope discipline
 *
 * Rail rows only. The centre pane's `['search-receiving', id]` payload is a
 * 300-line route-inline SELECT (`/api/receiving/[id]`) with no extracted domain
 * function; self-fetching it here would pay a full `withAuth` re-entry on TTFB
 * — the exact trade the removed `/triage` seed lost. If measurement shows the
 * centre fetch still gates LCP, extract that route's payload builder first and
 * seed it in-process; do not add a `serverSelfFetch` here.
 *
 * Soft-fail throughout: every miss returns null rows and the client fetches
 * exactly as before.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import { buildReceivingLinesListSql } from '@/lib/receiving/lines/build-sql';
import { normalizeRow } from '@/lib/receiving/lines/normalize-row';
import type { OrgId } from '@/lib/tenancy/constants';
import { getCurrentUser } from '@/lib/auth/current-user';

/** Mirrors the `searchRecent` feed's `limit: 20` (feeds.ts). */
const SEARCH_RECENT_LIMIT = 20;

/**
 * RSC serialization preserves `Date`; the HTTP route stringifies. Round-trip
 * JSON so seeded rows are byte-shaped like the wire path (same lesson as the
 * unbox rail seed — client `.trim()` calls crashed on seeded Dates).
 */
function toWireRows<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows)) as T;
}

/**
 * This viewer's most recent finds — carton ids off the indexed recency column
 * alone. `receiving_id` is denormalized onto the view row (upsert keeps it
 * COALESCE-fresh); rows predating that column fall out via the NULL filter and
 * simply don't seed.
 */
async function rankSearchRecentReceivingIds(
  orgId: OrgId,
  staffId: number,
  limit: number,
): Promise<number[]> {
  try {
    const res = await tenantQuery<{ receiving_id: number | null }>(
      orgId,
      `SELECT receiving_id
         FROM receiving_line_views
        WHERE organization_id = $1
          AND staff_id = $2
        ORDER BY viewed_at DESC
        LIMIT $3`,
      [orgId, staffId, limit],
    );
    const out: number[] = [];
    const seen = new Set<number>();
    for (const row of res.rows) {
      const id = Number(row.receiving_id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  } catch (error) {
    console.error('rankSearchRecentReceivingIds failed; client will fetch', error);
    return [];
  }
}

/**
 * The `view=viewed` rows for a known carton set — the same SQL the route runs,
 * in-process (no self-fetch), restricted via `receiving_id_in` so the display
 * laterals only run over the paint window. `viewerStaffId` drives both the
 * per-staff EXISTS filter and the `viewed_at DESC` order, exactly as the route
 * derives it from the session.
 */
async function readViewedRows(
  orgId: OrgId,
  staffId: number,
  receivingIds: readonly number[],
): Promise<ReceivingLineRow[]> {
  const params = new URLSearchParams({
    limit: String(SEARCH_RECENT_LIMIT),
    offset: '0',
    view: 'viewed',
    receiving_id_in: receivingIds.join(','),
  });
  const query = parseReceivingLinesQuery(params);
  const built = buildReceivingLinesListSql({
    query,
    orgId,
    viewerStaffId: staffId,
    universalIncoming: false,
    applyScannedZohoExclusion: false,
    unboxRailColumnRead: false,
  });
  const listRes = await withTenantConnection(orgId, (client) =>
    client.query(built.list.sql, built.list.params as unknown[]),
  );
  return listRes.rows.map((r) =>
    normalizeRow(r as Record<string, unknown>),
  ) as unknown as ReceivingLineRow[];
}

export interface SearchRecentSeed {
  state: DehydratedState;
  /** The row the rail auto-selects on a cold load, or null when nothing seeded. */
  mruReceivingId: number | null;
}

/**
 * Seed the `searchRecent` rail with this viewer's paint window, into the exact
 * key `SearchSidebarPanel` / `ReceivingFeedRail` mount with
 * (`receivingRailQueryKey('search-recent', undefined, '', null)` — the rail
 * passes `staffId: null` because the VIEW itself is viewer-scoped server-side).
 * Fresh `setQueryData` stamp keeps the client from refetching at mount.
 */
export async function seedSearchRecentRail(): Promise<SearchRecentSeed> {
  const queryClient = new QueryClient();

  const user = await getCurrentUser();
  const orgId = user?.organizationId as OrgId | undefined;
  const staffId = Number(user?.staffId);
  if (!orgId || !Number.isFinite(staffId) || staffId <= 0) {
    return { state: dehydrate(queryClient), mruReceivingId: null };
  }

  const rankedIds = await rankSearchRecentReceivingIds(
    orgId,
    staffId,
    SEARCH_RECENT_LIMIT,
  );
  if (rankedIds.length === 0) {
    return { state: dehydrate(queryClient), mruReceivingId: null };
  }

  try {
    const rows = await readViewedRows(orgId, staffId, rankedIds);
    if (rows.length === 0) {
      return { state: dehydrate(queryClient), mruReceivingId: null };
    }
    const key = receivingRailQueryKey('search-recent', undefined, '', null);
    queryClient.setQueryData(key, toWireRows(rows));
    const mru = Number((rows[0] as unknown as { receiving_id?: unknown }).receiving_id);
    return {
      state: dehydrate(queryClient),
      mruReceivingId: Number.isFinite(mru) && mru > 0 ? mru : null,
    };
  } catch (error) {
    console.error('seedSearchRecentRail failed; client will fetch', error);
    return { state: dehydrate(queryClient), mruReceivingId: null };
  }
}
