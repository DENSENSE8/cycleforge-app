/**
 * Server seeds for Unbox station-first cold load — dehydrate Unboxed rail +
 * optional MRU carton siblings so the scan bench paints without a post-hydrate
 * waterfall.
 *
 * - {@link seedUnboxStation} — bare `/unbox` (rail + MRU carton lines).
 *
 * `seedUnboxSpine` (History spine warm cache for `/triage`) was deleted
 * 2026-08-27, operator ruling: it blocked Arrival's TTFB on a `serverSelfFetch`
 * (full `withAuth` re-entry, ~150 rows) to warm a table that surface never
 * paints, and the soft-nav hop it existed for was already warm client-side.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { RECEIVING_RAIL_FEEDS } from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import {
  transformUnboxOpenedRows,
  UNBOX_SIDEBAR_LIMIT,
} from '@/lib/receiving/rail/unbox-opened-rows';
import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import {
  buildReceivingLinesListSql,
  buildReceivingLinesByReceivingIdSql,
  buildUnboxOpenedPlaceholdersSql,
  shouldIncludeUnboxOpenedPlaceholders,
} from '@/lib/receiving/lines/build-sql';
import {
  buildUnmatchedEmptyReceivingLine,
  normalizeRow,
} from '@/lib/receiving/lines/normalize-row';
import { fetchSerialsForLines } from '@/lib/receiving/serial-projection';
import { isUnboxRailColumnRead } from '@/lib/feature-flags';
import type { OrgId } from '@/lib/tenancy/constants';
import { getCurrentUser } from '@/lib/auth/current-user';

interface UnboxStationSeed {
  state: DehydratedState;
  /** MRU carton id — the row the rail shows selected on a cold load. */
  mruReceivingId: number | null;
}

/**
 * The MRU Unbox carton — `receiving_id` only, straight off the street table.
 *
 * This used to be answered by prefetching the whole 50-row "Unboxed" rail
 * (`view=unbox_opened`) and taking `rows[0]`, which cost **5.5–6.9s and ~280KB**
 * on the dogfood org — all of it *blocking first byte*, to learn one integer.
 * That endpoint's `ORDER BY` key lives on a joined table, so Postgres runs ~15
 * display laterals over the full candidate set before it can sort and limit;
 * `limit=1` measured 5.4s, so shrinking the window does not help.
 *
 * Reading the ordering column directly is the whole fix: 684 opened cartons
 * seq-scan + top-N in **0.32ms** (39 shared buffers), and it returns the same
 * carton the rail's `rows[0]` did.
 *
 * The rail itself is NOT seeded here on purpose — it is P2 context in the paint
 * order ("full recents fetch may wait"), so it must not sit in front of P1.
 * The client rail query fetches it after paint, exactly as it already does when
 * a seed misses.
 */
async function rankUnboxMruReceivingIds(
  orgId: OrgId,
  limit: number,
): Promise<number[]> {
  try {
    const res = await tenantQuery<{ receiving_id: number }>(
      orgId,
      `SELECT ru.receiving_id
         FROM receiving_unbox ru
        WHERE ru.organization_id = $1
          AND ru.opened_at IS NOT NULL
        ORDER BY ru.opened_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    return res.rows
      .map((r) => Number(r.receiving_id))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch (error) {
    console.error('rankUnboxMruReceivingIds failed; client will fetch', error);
    return [];
  }
}

/**
 * Hydrate the recents rail with the full paint window (not one row).
 *
 * Pairs with {@link rankUnboxMruReceivingIds}: rank on the cheap indexed column,
 * then hydrate those ids (`?receiving_id_in=`). Measured on the dogfood org: the
 * unrestricted rail query is 2.2s / 274,539 shared buffers; the pre-limited
 * 50-row window is ~55ms / 9,032.
 *
 * **Whole window + fresh timestamp.** A one-row seed with `updatedAt: 0` forced
 * an immediate client refetch of ~155KB that stole LCP (~7s) when a later-
 * painted title outgrew the seeded one. A fresh stamp keeps `staleTime` honest
 * so the rail does not refetch on mount.
 *
 * **Wire shape via {@link toWireRows}.** RSC serialization preserves `Date`;
 * the HTTP route stringifies. Client code doing `(row.x || '').trim()` crashed
 * on seeded Dates — round-trip JSON so the seed matches the wire path.
 *
 * Seeds the exact key `SidebarRailShell` mounts with, so rows are in the first
 * HTML instead of behind a client fetch.
 */
function toWireRows<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows)) as T;
}

async function seedUnboxRecentRail(
  queryClient: QueryClient,
  orgId: OrgId,
  receivingIds: readonly number[],
): Promise<void> {
  if (receivingIds.length === 0) return;
  const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
  const key = receivingRailQueryKey(feed.segment, undefined, '', null);
  try {
    const rows = await readUnboxOpenedRows(orgId, receivingIds);
    if (rows.length === 0) return;
    queryClient.setQueryData(key, toWireRows(transformUnboxOpenedRows(rows)));
  } catch (error) {
    console.error('seedUnboxRecentRail failed; client will fetch', error);
  }
}

/**
 * The `view=unbox_opened` rows for a known carton set — the same two queries
 * `/api/receiving-lines` runs for that view, in-process.
 *
 * **Why not `serverSelfFetch` (which is what this used to do).** The seed blocks
 * the shell, so every millisecond it costs lands on TTFB. A self-fetch re-enters
 * the app over HTTP and pays a full `withAuth` on the way in — measured at ~600ms
 * with the Redis session cache warm and ~1.2s without it — to fetch data this
 * process could already read. Two such calls (rail + carton lines) were most of
 * a 3.2s TTFB.
 *
 * It does not fork the route: the SQL comes from the same builders, and the rows
 * are shaped by the same `normalizeRow` / `buildUnmatchedEmptyReceivingLine` the
 * route now imports from `lines/normalize-row`. The placeholder arm is not
 * optional — on the dogfood org the most-recently-unboxed carton is usually a
 * LINELESS unfound placeholder, which the main list query cannot return.
 */
async function readUnboxOpenedRows(
  orgId: OrgId,
  receivingIds: readonly number[],
): Promise<ReceivingLineRow[]> {
  const params = new URLSearchParams({
    limit: String(UNBOX_SIDEBAR_LIMIT),
    offset: '0',
    view: 'unbox_opened',
    receiving_id_in: receivingIds.join(','),
  });
  const query = parseReceivingLinesQuery(params);
  const unboxRailColumnRead = isUnboxRailColumnRead();
  const built = buildReceivingLinesListSql({
    query,
    orgId,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: false,
    unboxRailColumnRead,
  });

  const [listRes, placeholderRes] = await withTenantConnection(orgId, (client) =>
    Promise.all([
      client.query(built.list.sql, built.list.params as unknown[]),
      shouldIncludeUnboxOpenedPlaceholders(query)
        ? client.query(
            buildUnboxOpenedPlaceholdersSql(query, orgId, unboxRailColumnRead).list.sql,
            buildUnboxOpenedPlaceholdersSql(query, orgId, unboxRailColumnRead).list
              .params as unknown[],
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    ]),
  );

  const lined = listRes.rows.map((r) => normalizeRow(r as Record<string, unknown>));
  const lineless = placeholderRes.rows.map((pkg) =>
    normalizeRow(buildUnmatchedEmptyReceivingLine(pkg as Record<string, unknown>)),
  );
  return [...lined, ...lineless]
    .sort(compareByUnboxOpenedAt)
    .slice(0, UNBOX_SIDEBAR_LIMIT) as unknown as ReceivingLineRow[];
}

/** Mirrors the route's `compareReceivingRowsByUnboxOpenedAt` merge order. */
function compareByUnboxOpenedAt(
  a: { unbox_opened_at?: string | null; id: number },
  b: { unbox_opened_at?: string | null; id: number },
): number {
  const ts = (row: { unbox_opened_at?: string | null }) => {
    const raw = row.unbox_opened_at ?? null;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const d = ts(b) - ts(a);
  return d !== 0 ? d : b.id - a.id;
}

/**
 * Prefetch MRU carton sibling lines (`include=serials`) into the same key
 * `usePoLinesData` mounts with — byte-identical to
 * `receivingSiblingsQueryKey` / `receivingSiblingsSerialsQueryKey` so hydrate
 * hits without importing the client-only receiving-queries module.
 */
async function seedMruCartonLines(
  queryClient: QueryClient,
  orgId: OrgId,
  receivingId: number,
): Promise<ReceivingLineRow[]> {
  if (!Number.isFinite(Number(receivingId))) return [];
  try {
    // The route does NOT run a single carton through the generic list builder,
    // and neither may this: measured on the dogfood org, the generic shape for
    // `receiving_id=<id>` takes **6.1s** (it still plans across the whole
    // candidate set), while the dedicated builder the route uses takes ~120ms.
    // Using the wrong one here is what turned a TTFB win into a 9s regression.
    const byReceiving = buildReceivingLinesByReceivingIdSql(receivingId, orgId);
    const res = await tenantQuery<Record<string, unknown>>(
      orgId,
      byReceiving.lines.sql,
      byReceiving.lines.params as unknown[],
    );
    const lines = res.rows.map((r) => normalizeRow(r)) as unknown as ReceivingLineRow[];
    // `include=serials` is what the workspace mounts with, so the seed must
    // carry them or the middle re-fetches the moment it hydrates.
    const serialsByLine = await fetchSerialsForLines(
      lines.map((r) => (r as unknown as { id: number }).id),
      orgId,
    );
    for (const row of lines) {
      (row as unknown as Record<string, unknown>).serials =
        serialsByLine.get((row as unknown as { id: number }).id) ?? [];
    }
    const envelope = toWireRows({ success: true as const, receiving_lines: lines });
    queryClient.setQueryData(['receiving-siblings', Number(receivingId)], envelope);
    queryClient.setQueryData(
      ['receiving-siblings-serials', Number(receivingId)],
      envelope,
    );
    return lines;
  } catch (error) {
    console.error('seedMruCartonLines failed; client will fetch', error);
    return [];
  }
}

/**
 * Station seed for bare `/unbox`, in the operator's stated priority order:
 *
 *   1. the recents rail window — full `UNBOX_SIDEBAR_LIMIT`, wire-shaped, fresh;
 *   2. the middle — MRU carton lines, warmed into the cache the workspace
 *      mounts with, so SSR can paint the open record during render;
 *   3. the right edge follows client-side.
 *
 * Both seeds are cheap by construction: rank the cartons on the indexed column
 * alone, then hydrate those ids (see {@link rankUnboxMruReceivingIds} /
 * {@link seedUnboxRecentRail}). The rail and the carton lines are independent
 * once the ranking is known, so they run in PARALLEL — the seed costs about one
 * round trip, not two.
 *
 * The Queue spine (desk-only) is still not seeded; it is not on this path.
 *
 * Soft-fail throughout: any miss returns an empty seed and the client fetches,
 * so a seed problem degrades to the old behaviour rather than an error page.
 */
export async function seedUnboxStation(): Promise<UnboxStationSeed> {
  const queryClient = new QueryClient();

  const user = await getCurrentUser();
  const orgId = user?.organizationId as OrgId | undefined;
  if (!orgId) return { state: dehydrate(queryClient), mruReceivingId: null };

  const rankedIds = await rankUnboxMruReceivingIds(orgId, UNBOX_SIDEBAR_LIMIT);
  const mruReceivingId = rankedIds[0] ?? null;
  if (mruReceivingId == null) {
    return { state: dehydrate(queryClient), mruReceivingId: null };
  }

  await Promise.all([
    seedUnboxRecentRail(queryClient, orgId, rankedIds),
    seedMruCartonLines(queryClient, orgId, mruReceivingId),
  ]);

  return { state: dehydrate(queryClient), mruReceivingId };
}
