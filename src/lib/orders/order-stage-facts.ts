/**
 * `order_stage_facts` — one row per order holding its Pick · QC · Pack facts
 * (who / when / verdict, the pick and pack assignees, and the order-grain
 * pick / pack scan flags), so the `/api/orders` feed and the To-ship
 * queue-counts read one primary-key join instead of eight per-order laterals
 * and two correlated EXISTS.
 *
 * {@link refreshOrderStageFacts} is the ONE writer: it recomputes the target
 * orders' facts from the source tables with the laterals below — the same
 * fragments the feed evaluated per row before (and the shipped feeds in
 * orders-queries.ts still do), so a fact cannot mean two things. Every stage
 * writer calls it: the Picker desk scan / serial / delete / unpick, unit pick
 * scan / unscan, picking sessions, pack scans / ship / reverse, the QC verdict
 * (and the pass→pending allocate it triggers), order assignment, and every
 * allocation writer (unit allocate, order allocate, auto-allocate,
 * substitution + amendment decision, order release, the legacy pack mirror).
 * Return flips (SHIPPED ↔ RETURNED) skip it: both states read the same in
 * every fact. The feed-membership cron re-sweeps every org
 * ({@link refreshAllOrderStageFacts}) as a safety net and for writers that move
 * a fact indirectly (a label changing the order's shipment,
 * automation-written assignments).
 */
import 'server-only';
import { WA_PICK_LATERAL } from '@/lib/neon/orders-queries';
import type { OrderStageSignals } from '@/lib/orders/desk-view-sql';
import { sqlOrderHasPackScan } from '@/lib/orders/order-grain-sql';
import { PICKED_BY_IS_PICKED_SQL, PICKED_BY_LATERAL } from '@/lib/picking/picked-by';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** Latest bench verdict on any unit allocated to the order (org-scoped). */
const QC_LATERAL = `
    LEFT JOIN LATERAL (
      SELECT tr.tested_by, tr.verdict, tr.created_at
        FROM order_unit_allocations qc_oua
        JOIN testing_results tr
          ON tr.serial_unit_id  = qc_oua.serial_unit_id
         AND tr.organization_id = qc_oua.organization_id
       WHERE qc_oua.order_id        = o.id
         AND qc_oua.organization_id = o.organization_id
         AND qc_oua.state <> 'RELEASED'
       ORDER BY tr.created_at DESC, tr.id DESC
       LIMIT 1
    ) qc ON TRUE`;

/** The order's live PACK assignee (latest non-canceled ORDER/PACK work_assignment). */
const WA_PACK_LATERAL = `
    LEFT JOIN LATERAL (
      SELECT wa.assigned_packer_id
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'PACK'
         AND wa.assigned_packer_id IS NOT NULL
         AND wa.status <> 'CANCELED'
       ORDER BY wa.updated_at DESC, wa.id DESC
       LIMIT 1
    ) wa_p ON TRUE`;

/**
 * Pack facts, keyed by the order's shipment: the latest COMPLETED packer_log
 * and the latest PACK-station scan (idx_packer_logs_completed_shipment,
 * idx_station_activity_logs_shipment_id).
 */
const PACK_LATERALS = `
    LEFT JOIN LATERAL (
      SELECT pl.id AS packer_log_id, pl.created_at AS packed_at, pl.packed_by
      FROM packer_logs pl
      WHERE o.shipment_id IS NOT NULL
        AND pl.organization_id = o.organization_id
        AND pl.shipment_id = o.shipment_id
        AND pl.completion_state = 'COMPLETED'
      ORDER BY pl.created_at DESC NULLS LAST, pl.id DESC
      LIMIT 1
    ) pl_latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT sal.created_at, sal.staff_id
      FROM station_activity_logs sal
      WHERE o.shipment_id IS NOT NULL
        AND sal.shipment_id = o.shipment_id
        AND sal.organization_id = o.organization_id
        AND sal.station = 'PACK'
        AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
      ORDER BY sal.created_at DESC NULLS LAST, sal.id DESC
      LIMIT 1
    ) pack_activity ON TRUE`;

const FACT_COLUMNS = [
  'qc_verdict', 'qc_at', 'qc_by', 'qc_inherited',
  'picked_at', 'picked_by', 'picked_source',
  'packer_log_id', 'packed_at', 'packed_by', 'pack_activity_at', 'pack_activity_by',
  'picker_id', 'packer_id',
  'has_pick_scan', 'has_pack_scan',
] as const;

/**
 * The refresh statement for the orders `targetSql` selects (a predicate on
 * `o`; `$1` is the org). An unchanged row is not rewritten.
 */
export function buildOrderStageFactsRefreshSql(targetSql: string): string {
  const cols = FACT_COLUMNS.join(', ');
  return `
    INSERT INTO order_stage_facts AS f (organization_id, order_id, ${cols}, updated_at)
    SELECT
      o.organization_id,
      o.id,
      qc.verdict,
      qc.created_at,
      qc.tested_by,
      COALESCE(qc.created_at < o.created_at, false),
      pick_fact.picked_at,
      pick_fact.picked_by,
      pick_fact.picked_source,
      pl_latest.packer_log_id,
      pl_latest.packed_at,
      COALESCE(pack_activity.staff_id, pl_latest.packed_by),
      pack_activity.created_at,
      pack_activity.staff_id,
      wa_pick.picker_id,
      wa_p.assigned_packer_id,
      ${PICKED_BY_IS_PICKED_SQL},
      ${sqlOrderHasPackScan('o')},
      now()
    FROM orders o
    ${QC_LATERAL}
    ${PICKED_BY_LATERAL}
    ${WA_PICK_LATERAL}
    ${WA_PACK_LATERAL}
    ${PACK_LATERALS}
    WHERE o.organization_id = $1
      AND ${targetSql}
    ON CONFLICT (organization_id, order_id) DO UPDATE SET
      ${FACT_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(',\n      ')},
      updated_at = EXCLUDED.updated_at
    WHERE (${FACT_COLUMNS.map((c) => `f.${c}`).join(', ')})
          IS DISTINCT FROM
          (${FACT_COLUMNS.map((c) => `EXCLUDED.${c}`).join(', ')})`;
}

/**
 * Orders a stage write touched: by id, by shipment (pack facts are
 * shipment-keyed), or by an allocated unit (QC). Null / non-positive ids are
 * ignored, so writers can pass what they hold without guarding.
 */
type StageFactIds = readonly (number | string | null | undefined)[];
export interface OrderStageFactsTarget {
  orderIds?: StageFactIds;
  shipmentIds?: StageFactIds;
  serialUnitIds?: StageFactIds;
}

const TARGET_SQL = `o.id IN (
        SELECT unnest($2::int[])
        UNION
        SELECT t_o.id FROM orders t_o
         WHERE t_o.organization_id = $1 AND t_o.shipment_id = ANY($3::bigint[])
        UNION
        SELECT t_oua.order_id FROM order_unit_allocations t_oua
         WHERE t_oua.organization_id = $1 AND t_oua.serial_unit_id = ANY($4::int[])
      )`;

const REFRESH_TARGET_SQL = buildOrderStageFactsRefreshSql(TARGET_SQL);
const REFRESH_ALL_SQL = buildOrderStageFactsRefreshSql('TRUE');

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number | null }> };

function ids(values: StageFactIds | undefined): number[] {
  const out = new Set<number>();
  for (const v of values ?? []) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out];
}

/**
 * Recompute the stage facts of the target orders. Pass the writer's `client`
 * to run inside its transaction (the facts commit with the write); without
 * one it runs in its own tenant transaction — call it after the write commits.
 * Returns the number of rows inserted or changed.
 */
export async function refreshOrderStageFacts(
  orgId: OrgId,
  target: OrderStageFactsTarget,
  client?: Queryable,
): Promise<number> {
  const orderIds = ids(target.orderIds);
  const shipmentIds = ids(target.shipmentIds);
  const serialUnitIds = ids(target.serialUnitIds);
  if (orderIds.length + shipmentIds.length + serialUnitIds.length === 0) return 0;
  const params = [orgId, orderIds, shipmentIds, serialUnitIds];
  const run = (db: Queryable) => db.query(REFRESH_TARGET_SQL, params).then((r) => r.rowCount ?? 0);
  return client ? run(client) : withTenantConnection(orgId, run);
}

/** Recompute every order of the org (backfill / the cron sweep). */
export async function refreshAllOrderStageFacts(orgId: OrgId, client?: Queryable): Promise<number> {
  const run = (db: Queryable) => db.query(REFRESH_ALL_SQL, [orgId]).then((r) => r.rowCount ?? 0);
  return client ? run(client) : withTenantConnection(orgId, run);
}

/**
 * The feed's join onto the facts row (alias `osf`). LEFT: an order no writer
 * has touched yet reads as "nothing happened" until the sweep writes its row.
 */
export const ORDER_STAGE_FACTS_JOIN = `
    LEFT JOIN order_stage_facts osf
      ON osf.organization_id = o.organization_id
     AND osf.order_id = o.id`;

/** The stage signals off the joined facts row, for the shared desk predicates in desk-view-sql.ts. */
export const ORDER_STAGE_FACTS_SIGNALS: OrderStageSignals = {
  hasPickScan: 'COALESCE(osf.has_pick_scan, false)',
  hasPackScan: 'COALESCE(osf.has_pack_scan, false)',
  pickedBy: 'osf.picked_by',
  pickerId: 'osf.picker_id',
  packedBy: 'osf.packed_by',
};
