/** Server seeds for Unbox station-first cold load — dehydrate Unboxed rail + optional MRU carton siblings so the scan bench paints without… */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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

/** The MRU Unbox carton — `receiving_id` only, straight off the street table. */
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

/** Hydrate the recents rail with the full paint window (not one row). */
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

/** The `view=unbox_opened` rows for a known carton set — the same two queries `/api/receiving-lines` runs for that view, in-process. */
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

/** Prefetch MRU carton sibling lines (`include=serials`) into the same key `usePoLinesData` mounts with — byte-identical to… */
async function seedMruCartonLines(
  queryClient: QueryClient,
  orgId: OrgId,
  receivingId: number,
): Promise<ReceivingLineRow[]> {
  if (!Number.isFinite(Number(receivingId))) return [];
  try {
    // The route does NOT run a single carton through the generic list builder, and neither may this:
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

/** Station seed for bare `/unbox`, in the operator's stated priority order: */
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
