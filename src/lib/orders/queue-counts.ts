/**
 * `GET /api/orders/queue-counts` — the To-ship tallies (KPI band, stage and
 * facet counts, bench placements) without downloading the rows.
 *
 * Scope: every count here is over `sqlOrderInWarehouseToShip` — the SAME
 * predicate `/api/orders?inWarehouse=true` lists and desk-counts `triage`
 * counts. It used to mirror `fulfillmentScope` (which also counts orders with
 * no shipment/label), so the band printed 406 over a 38-row list
 * (phase0-findings §3.3). Orders without a label are the Labels queue's
 * (`awaitingOnly`), not To-ship's.
 *
 * Per-count predicate (all ∩ the To-ship scope, ∩ `sqlOrderAssignedToStaff` when `?staff=`):
 *   byStage.tested / pending / packed — `sqlOrderHasTechScan` / `sqlOrderHasPackScan`
 *     (the partition `sqlOrderDeskStage` filters the list with);
 *   combos.blocked — `orders.is_out_of_stock`; urgent — `orders.is_urgent`;
 *   mustShip — ship-by (`sqlOrderTestDeadlineAt`, the list's `deadline_at`) is
 *     today or overdue (`sqlDeskAgingBucket`), i.e. the list's `late=1`;
 *   paperworkIncomplete — `PRINT_PACKET_INCOMPLETE_SQL`;
 *   shippedToday — `sqlShippedTodayCount` (shared with desk-counts);
 *   packPlacement — `countOpenPlacementsByLocation` (To-ship scope, not yet packed).
 */

import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { createSingleFlight, type SingleFlight } from '@/lib/cache/single-flight';
import { sqlOrderHasPackScan, sqlOrderHasTechScan } from '@/lib/orders/order-grain-sql';
import { PRINT_PACKET_INCOMPLETE_SQL } from '@/lib/orders/print-packet';
import {
  sqlDeskAgingBucket,
  sqlOrderAssignedToStaff,
  sqlOrderInWarehouseToShip,
  sqlOrderTestDeadlineAt,
  sqlShippedTodayCount,
} from '@/lib/orders/desk-view-sql';
import type { QueueCountsCombo, UnshippedQueueCounts } from '@/lib/orders/queue-counts-normalize';
import { countOpenPlacementsByLocation, type PackPlacementCountRow } from '@/lib/packing/pack-placement';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** One grouped signal row of the To-ship scope. */
interface QueueCountsGroupRow {
  has_tech_scan: boolean;
  has_pack_scan: boolean;
  blocked: boolean;
  n: number;
  urgent_n: number;
  must_ship_n: number;
}

export interface QueueCountsTallies {
  groups: QueueCountsGroupRow[];
  paperwork_incomplete: number;
  shipped_today: number;
}

/**
 * The whole tally in ONE statement (one tenant round trip). The scope is
 * materialized once, so the per-order SAL / assignment probes run once per
 * To-ship order and the paperwork count reuses the same rows.
 */
export function buildQueueCountsSql(orgId: string, staffId: number | null): { sql: string; params: unknown[] } {
  const params: unknown[] = [orgId];
  let staffClause = '';
  let staffParam: string | undefined;
  if (staffId != null) {
    params.push(staffId);
    staffParam = `$${params.length}`;
    staffClause = `\n        AND ${sqlOrderAssignedToStaff(staffParam, 'o')}`;
  }
  const sql = `
    WITH scope AS MATERIALIZED (
      SELECT
        o.id,
        o.organization_id,
        o.sku_catalog_id,
        o.docs_not_required,
        o.is_out_of_stock,
        o.is_urgent,
        ${sqlOrderHasTechScan('o')} AS has_tech_scan,
        ${sqlOrderHasPackScan('o')} AS has_pack_scan,
        ${sqlOrderTestDeadlineAt('o')} AS deadline_at
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND ${sqlOrderInWarehouseToShip('o')}${staffClause}
    ),
    groups AS (
      SELECT
        s.has_tech_scan,
        s.has_pack_scan,
        s.is_out_of_stock AS blocked,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE s.is_urgent)::int AS urgent_n,
        COUNT(*) FILTER (
          WHERE ${sqlDeskAgingBucket('s.deadline_at')} IN ('overdue', 'today')
        )::int AS must_ship_n
      FROM scope s
      GROUP BY 1, 2, 3
    )
    SELECT
      COALESCE((SELECT json_agg(g) FROM groups g), '[]'::json) AS groups,
      (SELECT COUNT(*)::int FROM scope o WHERE ${PRINT_PACKET_INCOMPLETE_SQL}) AS paperwork_incomplete,
      ${sqlShippedTodayCount('$1', staffParam)} AS shipped_today
  `;
  return { sql, params };
}

/** Grouped signals → the client payload (lanes are derived client-side, Decision 8). */
export function assembleQueueCounts(
  tallies: QueueCountsTallies,
  placements: PackPlacementCountRow[],
): UnshippedQueueCounts {
  // Lane combos stay pre-pack only (PENDING/TESTED/BLOCKED); packed-staged is
  // its own stage (byStage.packed).
  const combos: QueueCountsCombo[] = tallies.groups
    .filter((r) => !r.has_pack_scan)
    .map((r) => ({
      hasTechScan: Boolean(r.has_tech_scan),
      blocked: Boolean(r.blocked),
      count: Number(r.n) || 0,
    }));
  const packed = tallies.groups
    .filter((r) => r.has_pack_scan)
    .reduce((s, r) => s + (Number(r.n) || 0), 0);
  const prePack = combos.reduce((s, c) => s + c.count, 0);
  const tested = combos.filter((c) => c.hasTechScan).reduce((s, c) => s + c.count, 0);
  const total = prePack + packed;
  return {
    total,
    byStage: { all: total, tested, pending: prePack - tested, packed },
    urgent: tallies.groups.reduce((s, r) => s + (Number(r.urgent_n) || 0), 0),
    mustShip: tallies.groups.reduce((s, r) => s + (Number(r.must_ship_n) || 0), 0),
    shippedToday: Number(tallies.shipped_today) || 0,
    combos,
    packPlacement: {
      counts: placements,
      totalPlaced: placements.reduce((s, r) => s + r.count, 0),
    },
    paperworkIncomplete: Number(tallies.paperwork_incomplete) || 0,
  };
}

/** Bump when the membership SQL or payload shape changes so stale tallies cannot outlive the fix. */
const QUEUE_COUNTS_CACHE_VERSION = 'to_ship_in_warehouse_v2';
const QUEUE_COUNTS_CACHE_NAMESPACE = 'api:orders-queue-counts';
const QUEUE_COUNTS_TTL_SECONDS = 60;

export type QueueCountsCacheState = 'HIT' | 'MISS' | 'JOINED';

export interface QueueCountsDeps {
  queryTallies(orgId: OrgId, sql: string, params: unknown[]): Promise<QueueCountsTallies>;
  countPlacements(orgId: OrgId): Promise<PackPlacementCountRow[]>;
  cacheGet(key: string): Promise<UnshippedQueueCounts | null>;
  cacheSet(key: string, payload: UnshippedQueueCounts): Promise<void>;
  /** Process-wide by default: concurrent cold misses for one key run the SQL once. */
  flight: SingleFlight<UnshippedQueueCounts>;
}

const defaultDeps: QueueCountsDeps = {
  queryTallies: async (orgId, sql, params) => {
    const { rows } = await tenantQuery<QueueCountsTallies>(orgId, sql, params);
    return rows[0] ?? { groups: [], paperwork_incomplete: 0, shipped_today: 0 };
  },
  countPlacements: (orgId) => countOpenPlacementsByLocation(orgId),
  cacheGet: (key) => getCachedJson<UnshippedQueueCounts>(QUEUE_COUNTS_CACHE_NAMESPACE, key),
  cacheSet: (key, payload) =>
    setCachedJson(QUEUE_COUNTS_CACHE_NAMESPACE, key, payload, QUEUE_COUNTS_TTL_SECONDS, ['orders']),
  flight: createSingleFlight<UnshippedQueueCounts>(),
};

/**
 * Cache-aside read with single-flight rebuild. A cold key used to be rebuilt
 * by every concurrent request (two 27.5 s MISSes in the lane journal); now
 * the first caller computes and the rest join its promise.
 */
export async function getQueueCounts(
  orgId: OrgId,
  { staffId }: { staffId: number | null },
  deps: QueueCountsDeps = defaultDeps,
): Promise<{ payload: UnshippedQueueCounts; cache: QueueCountsCacheState }> {
  const key = createCacheLookupKey({
    organizationId: orgId,
    staff: staffId ?? '',
    cacheVersion: QUEUE_COUNTS_CACHE_VERSION,
  });
  const cached = await deps.cacheGet(key);
  if (cached) return { payload: cached, cache: 'HIT' };

  let computed = false;
  const payload = await deps.flight.run(key, async () => {
    computed = true;
    const { sql, params } = buildQueueCountsSql(orgId, staffId);
    const [tallies, placements] = await Promise.all([
      deps.queryTallies(orgId, sql, params),
      deps.countPlacements(orgId),
    ]);
    const fresh = assembleQueueCounts(tallies, placements);
    await deps.cacheSet(key, fresh);
    return fresh;
  });
  return { payload, cache: computed ? 'MISS' : 'JOINED' };
}
