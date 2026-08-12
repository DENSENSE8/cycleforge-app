/**
 * Server seeds for Unbox station-first cold load — dehydrate Unboxed rail +
 * optional MRU carton siblings so the scan bench paints without a post-hydrate
 * waterfall.
 *
 * - {@link seedUnboxStation} — bare `/unbox` (rail + MRU carton lines).
 * - {@link seedUnboxSpine} — History spine for Arrival (`/triage`) warm cache.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import {
  RECEIVING_MODES,
  type ReceivingModeContext,
  type ReceivingModeDescriptor,
} from '@/lib/receiving/receiving-modes';
import { DEFAULT_UNBOX_CONTEXT } from '@/lib/receiving/default-unbox-context';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
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

/** Spine paint window — lockstep with `SPINE_PAINT_LIMIT` in receiving-queries. */
const SPINE_PAINT_LIMIT = 150;

interface UnboxStationSeed {
  state: DehydratedState;
  /** MRU carton id — the row the rail shows selected on a cold load. */
  mruReceivingId: number | null;
}

interface UnboxSpineSeed {
  state: DehydratedState;
}

type SpineListPayload = {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
  limit: number;
  offset: number;
};

function buildSpineParams(
  mode: ReceivingModeDescriptor,
  ctx: ReceivingModeContext,
): URLSearchParams {
  const params = mode.buildParams(ctx);
  params.delete('include');
  params.set('phase', 'spine');
  const limit = Number(params.get('limit'));
  if (Number.isFinite(limit) && limit > SPINE_PAINT_LIMIT) {
    params.set('limit', String(SPINE_PAINT_LIMIT));
  }
  return params;
}

async function fetchSpine(
  mode: ReceivingModeDescriptor,
  ctx: ReceivingModeContext,
): Promise<SpineListPayload | null> {
  const params = buildSpineParams(mode, ctx);
  const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`);
  if (!res.ok) return null;
  return (await res.json()) as SpineListPayload;
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
 * Hydrate the recents rail with the SELECTED carton only.
 *
 * Pairs with {@link rankUnboxMruReceivingIds}: rank on the cheap indexed column,
 * then hydrate ONLY that carton (`?receiving_id_in=`). Measured on the dogfood
 * org: the unrestricted rail query is 2.2s / 274,539 shared buffers; the
 * pre-limited one is 55ms / 9,032 for 50 rows, and a single row is cheaper still.
 *
 * **One row, not fifty, and that is a paint decision — not a data limit.**
 * The operator's paint order is *selected rail row → middle → right edge → the
 * rest of the rail*, so only the selected row is on the critical path. Seeding
 * the whole 50-row window put ~150KB of JSON in the RSC payload ahead of first
 * paint to render 49 rows nobody is reading yet, which delayed the one row they
 * are. The remaining rows arrive from the client fetch that already exists.
 *
 * **Seeded deliberately STALE (`updatedAt: 0`).** The rail's `useQuery` runs at
 * `staleTime: 20_000`, so a normally-stamped seed would be considered fresh and
 * the rail would sit at one row for twenty seconds. Age-zero data still renders
 * immediately — it just also refetches on mount, which is exactly the handoff
 * ("the rest of the rail" last).
 *
 * Seeds the exact key `SidebarRailShell` mounts with, so the selected row is in
 * the first HTML instead of behind a client fetch.
 */
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
    queryClient.setQueryData(key, transformUnboxOpenedRows(rows), { updatedAt: 0 });
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
    const envelope = { success: true as const, receiving_lines: lines };
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
 *   1. the SELECTED rail row — the carton you were last on, in the first HTML
 *      and already marked selected;
 *   2. the middle — its lines, warmed into the cache the workspace mounts with,
 *      so the skeleton hands off as soon as React hydrates;
 *   3. the right edge and 4. the rest of the rail follow client-side.
 *
 * Both seeds are cheap by construction: rank the cartons on the indexed column
 * alone, then hydrate only those (see {@link rankUnboxMruReceivingIds} /
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

  // One id is all the critical path needs: it IS the selected row and it IS the
  // carton the middle opens. Ranking is the same 0.32ms read either way.
  const rankedIds = await rankUnboxMruReceivingIds(orgId, 1);
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

/**
 * Prefetch History spine (`?phase=spine`) for Arrival warm cache.
 * Soft-fail — client still fetches.
 */
export async function seedUnboxSpine(
  ctx = DEFAULT_UNBOX_CONTEXT,
): Promise<UnboxSpineSeed> {
  const queryClient = new QueryClient();
  const mode = RECEIVING_MODES.history;
  const spineKey = [...mode.queryKey(ctx), 'spine'] as const;

  try {
    const data = await fetchSpine(mode, ctx);
    if (data) {
      queryClient.setQueryData(spineKey, data);
    }
  } catch (error) {
    console.error('seedUnboxSpine failed; client will fetch', error);
  }

  return { state: dehydrate(queryClient) };
}
