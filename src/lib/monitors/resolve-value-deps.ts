import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { prepackMembershipSql, countOpenPlacementsByLocation } from '@/lib/packing/pack-placement';

import type {
  BoundedUnshippedCountSpec,
  OutboundQueueCounts,
  ResolveValueDeps,
} from './resolve-value';

/**
 * Server binding for {@link resolveMonitorValue}. The real count fetchers,
 * closed over one org — the pure core injects these so its parity test needs no
 * DB (house Deps pattern, cf. `promote-urgency-deps.ts`).
 *
 * Both queries scope to the SAME pre-pack membership the To-ship board uses via
 * the shared `prepackMembershipSql` fragment (not a re-inlined copy), so the
 * mapped path is byte-for-byte the sidebar's own count and the fallback stays a
 * single bounded aggregate over the same indexed set.
 */

/** `has_tech_scan` EXISTS — an order is TESTED when a station scan hit its shipment. */
const HAS_TECH_SCAN_EXISTS = `EXISTS (
  SELECT 1 FROM station_activity_logs sal
  WHERE sal.shipment_id IS NOT NULL AND sal.shipment_id = o.shipment_id
)`;

/** The order-side aggregate (everything but placement) — memoized per scope. */
type OrderCounts = Omit<OutboundQueueCounts, 'packPlacement'>;
type PlacementCounts = OutboundQueueCounts['packPlacement'];

const EMPTY_PLACEMENT: PlacementCounts = { totalPlaced: 0, counts: [] };

export function createResolveValueDeps(orgId: OrgId): ResolveValueDeps {
  // Tick-scoped memoization: the cron builds ONE deps instance per org per tick,
  // so N monitors sharing a scope share a single aggregate (and a single
  // placement) fetch instead of each issuing its own (neon-cost-reviewer,
  // 2026-08-10). Promises are cached so concurrent evaluations coalesce too.
  const orderCountsByScope = new Map<number | 'org', Promise<OrderCounts>>();
  let placementOnce: Promise<PlacementCounts> | undefined;
  const boundedBySpec = new Map<string, Promise<number>>();

  async function fetchOrderCounts(staffId?: number): Promise<OrderCounts> {
    const params: unknown[] = [orgId];
    let staffClause = '';
    if (staffId != null) {
      params.push(staffId);
      const s = `$${params.length}`;
      staffClause = ` AND EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status <> 'CANCELED'
          AND (wa.assigned_packer_id = ${s} OR wa.assigned_tech_id = ${s})
      )`;
    }

    // The SAME grouped aggregate /api/orders/queue-counts runs: ≤4 rows
    // (has_tech_scan × blocked). No per-row scan reaches the app.
    const { rows } = await tenantQuery<{
      has_tech_scan: boolean;
      blocked: boolean;
      n: number;
      urgent_n: number;
    }>(
      orgId,
      `SELECT
         ${HAS_TECH_SCAN_EXISTS} AS has_tech_scan,
         o.is_out_of_stock AS blocked,
         COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE o.is_urgent)::int AS urgent_n
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
       WHERE ${prepackMembershipSql('o')}${staffClause}
       GROUP BY 1, 2`,
      params,
    );

    const combos = rows.map((r) => ({
      hasTechScan: Boolean(r.has_tech_scan),
      blocked: Boolean(r.blocked),
      count: Number(r.n) || 0,
    }));
    const total = combos.reduce((sum, c) => sum + c.count, 0);
    const tested = combos.filter((c) => c.hasTechScan).reduce((sum, c) => sum + c.count, 0);
    const urgent = rows.reduce((sum, r) => sum + (Number(r.urgent_n) || 0), 0);

    return { total, byStage: { pending: total - tested, tested }, urgent, combos };
  }

  async function fetchPlacement(): Promise<PlacementCounts> {
    // Org-wide (matches the route). Fetched only when a facet reads it.
    const placement = await countOpenPlacementsByLocation(orgId);
    return {
      totalPlaced: placement.reduce((sum, p) => sum + p.count, 0),
      counts: placement.map((p) => ({ locationId: p.locationId, count: p.count })),
    };
  }

  return {
    async outboundQueueCounts({ staffId, needsPlacement }): Promise<OutboundQueueCounts> {
      const key = staffId ?? 'org';
      let orderP = orderCountsByScope.get(key);
      if (!orderP) {
        orderP = fetchOrderCounts(staffId);
        orderCountsByScope.set(key, orderP);
      }
      // Placement is org-wide and independent of scope, so memoize it once and
      // only pay for it when a monitor actually reads it.
      let packPlacement = EMPTY_PLACEMENT;
      if (needsPlacement) {
        if (!placementOnce) placementOnce = fetchPlacement();
        packPlacement = await placementOnce;
      }
      const order = await orderP;
      return { ...order, packPlacement };
    },

    boundedUnshippedCount(spec: BoundedUnshippedCountSpec): Promise<number> {
      // Key on the spec (agingOlderThanMs, not the derived cutoff) so identical
      // custom combos across monitors share one bounded count per tick.
      const key = JSON.stringify(spec);
      const cached = boundedBySpec.get(key);
      if (cached) return cached;
      const p = runBoundedUnshippedCount(orgId, spec);
      boundedBySpec.set(key, p);
      return p;
    },
  };
}

/** One bounded COUNT(*) over the pre-pack membership with the spec's predicates. */
async function runBoundedUnshippedCount(orgId: OrgId, spec: BoundedUnshippedCountSpec): Promise<number> {
  const params: unknown[] = [orgId];
  const ph = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  const clauses: string[] = [];

  // Exact fulfillment lane (exception-first, mirroring resolveFulfillmentLane).
  if (spec.lane === 'BLOCKED') clauses.push('o.is_out_of_stock');
  else if (spec.lane === 'TESTED') clauses.push(`NOT o.is_out_of_stock AND ${HAS_TECH_SCAN_EXISTS}`);
  else if (spec.lane === 'PENDING') clauses.push(`NOT o.is_out_of_stock AND NOT ${HAS_TECH_SCAN_EXISTS}`);
  // Coarse stage (the has_tech_scan split, matching byStage) when no exact lane.
  else if (spec.coarseStage === 'tested') clauses.push(HAS_TECH_SCAN_EXISTS);
  else if (spec.coarseStage === 'pending') clauses.push(`NOT ${HAS_TECH_SCAN_EXISTS}`);

  if (spec.urgentOnly) clauses.push('o.is_urgent');

  if (spec.staffId != null) {
    const s = ph(spec.staffId);
    clauses.push(`EXISTS (
      SELECT 1 FROM work_assignments wa
      WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
        AND wa.status <> 'CANCELED'
        AND (wa.assigned_packer_id = ${s} OR wa.assigned_tech_id = ${s})
    )`);
  }

  if (spec.packStationId != null) {
    clauses.push(`EXISTS (
      SELECT 1 FROM order_pack_placements p
      WHERE p.organization_id = $1 AND p.order_id = o.id AND p.location_id = ${ph(spec.packStationId)}
    )`);
  } else if (spec.packPlaced) {
    clauses.push(`EXISTS (
      SELECT 1 FROM order_pack_placements p
      WHERE p.organization_id = $1 AND p.order_id = o.id
    )`);
  }

  if (spec.agingOlderThanMs != null) {
    // Age = time in queue since the order was created. Clock lives here (I/O
    // layer); the pure core stays clock-free.
    const cutoff = new Date(Date.now() - spec.agingOlderThanMs);
    clauses.push(`o.created_at < ${ph(cutoff)}`);
  }

  const extra = clauses.length ? clauses.map((c) => ` AND (${c})`).join('') : '';
  const { rows } = await tenantQuery<{ n: number }>(
    orgId,
    `SELECT COUNT(*)::int AS n
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE ${prepackMembershipSql('o')}${extra}`,
    params,
  );
  return Number(rows[0]?.n) || 0;
}
