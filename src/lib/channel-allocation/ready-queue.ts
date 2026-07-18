/**
 * Outbound Ready history loader — recently-tested events with channel
 * allocation facts overlaid for units that can still move to FBA or stock.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { VelocityTier } from '@/lib/velocity-tier-tone';
import { recommendDisposition } from './recommend-disposition';
import type {
  AllocationHit,
  ChannelDisposition,
  ReadyAllocationState,
} from './types';

export interface ReadyQueueQuery {
  /** Cap rows after scoring (default 200). */
  limit?: number;
  /** Optional disposition filter. */
  disposition?: ChannelDisposition | null;
  /** Free-text match on title / sku / fnsku / serial. */
  q?: string | null;
}

export interface ReadyQueueDeps {
  loadCandidates: (orgId: OrgId, limit: number) => Promise<ReadyCandidateRow[]>;
}

interface ReadyCandidateRow {
  testing_result_id: number;
  entity_id: number;
  sku: string | null;
  sku_catalog_id: number | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  condition_grade: string | null;
  unit_status: string | null;
  verdict: string | null;
  tested_by: number | null;
  tested_by_name: string | null;
  tested_at: string | null;
  velocity_tier: string | null;
  open_fba_plan_remaining: number;
  serial_number: string | null;
  unit_uid: string | null;
  has_active_order_allocation: boolean;
  has_fba_link: boolean;
}

const defaultDeps: ReadyQueueDeps = {
  loadCandidates: loadReadyCandidates,
};

/**
 * Load the org's recently-tested history. Pure scoring remains in
 * recommendDisposition; this function overlays eligibility and maps display facts.
 */
export async function getReadyQueue(
  orgId: OrgId,
  query: ReadyQueueQuery = {},
  deps: ReadyQueueDeps = defaultDeps,
): Promise<AllocationHit[]> {
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
  // Over-fetch a bit so filters still have material after disposition filter.
  const fetchLimit = Math.min(limit * 3, 600);
  const rows = await deps.loadCandidates(orgId, fetchLimit);

  const q = String(query.q || '').trim().toLowerCase();
  const hits: AllocationHit[] = [];

  for (const row of rows) {
    const openPlan = Math.max(0, Number(row.open_fba_plan_remaining) || 0);
    const tier = normalizeTier(row.velocity_tier);
    const allocationState = resolveAllocationState(row);
    const onHold =
      String(row.unit_status || '').toUpperCase() === 'ON_HOLD' ||
      String(row.verdict || '').toUpperCase() === 'TESTING_FAILED';
    // Amazon FC depth not wired yet — degrade: open plan is the FBA demand signal;
    // when no open plan remains we treat FBA demand as filled for this SKU/FNSKU.
    const rec = recommendDisposition({
      hold: onHold,
      amazonOos: false,
      velocityTier: tier,
      openFbaPlanRemaining: openPlan,
      fbaFilled: openPlan === 0,
    });
    const disposition =
      allocationState === 'READY' || onHold ? rec.disposition : null;

    if (query.disposition && disposition !== query.disposition) continue;

    if (q) {
      const hay = [row.title, row.sku, row.fnsku, row.asin, row.serial_number, row.unit_uid]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    hits.push({
      testingResultId: Number(row.testing_result_id),
      entityType: 'SERIAL_UNIT',
      entityId: Number(row.entity_id),
      skuCatalogId: row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
      sku: row.sku,
      serialNumber: row.serial_number,
      fnsku: row.fnsku,
      asin: row.asin,
      title: row.title,
      conditionGrade: row.condition_grade,
      unitStatus: row.unit_status,
      verdict: row.verdict,
      testedBy: row.tested_by != null ? Number(row.tested_by) : null,
      testedByName: row.tested_by_name,
      testedAt: row.tested_at,
      disposition,
      allocationState,
      reasons: disposition ? rec.reasons : [],
      score: disposition ? rec.score : 0,
      velocityTier: tier,
    });
  }

  // The append-only verdict log is the history spine: newest event first.
  hits.sort((a, b) => {
    const at = a.testedAt ? Date.parse(a.testedAt) : 0;
    const bt = b.testedAt ? Date.parse(b.testedAt) : 0;
    if (at !== bt) return bt - at;
    return b.testingResultId - a.testingResultId;
  });
  return hits.slice(0, limit);
}

function normalizeTier(raw: string | null | undefined): VelocityTier | null {
  const t = String(raw || '').trim().toUpperCase();
  if (t === 'A' || t === 'B' || t === 'C' || t === 'D') return t;
  return null;
}

function resolveAllocationState(row: ReadyCandidateRow): ReadyAllocationState {
  if (row.has_fba_link) return 'FBA_STAGED';
  if (row.has_active_order_allocation) return 'ORDER_ALLOCATED';
  const status = String(row.unit_status || '').trim().toUpperCase();
  return status === 'TESTED' || status === 'GRADED' ? 'READY' : 'NOT_READY';
}

async function loadReadyCandidates(orgId: OrgId, limit: number): Promise<ReadyCandidateRow[]> {
  // One row per verdict click, matching the Testing recently-tested feed.
  // Current unit facts decide whether the historical row is still actionable.
  const result = await tenantQuery<ReadyCandidateRow>(
    orgId,
    `WITH open_plan AS (
       SELECT
         fsi.fnsku,
         SUM(GREATEST(COALESCE(fsi.expected_qty, 0) - COALESCE(fsi.actual_qty, 0), 0))::int
           AS open_remaining
       FROM fba_shipment_items fsi
       JOIN fba_shipments fs ON fs.id = fsi.shipment_id
       WHERE COALESCE(fs.status, '') <> 'SHIPPED'
         AND COALESCE(fsi.status, '') NOT IN ('SHIPPED', 'LABEL_ASSIGNED')
         -- fba_shipment_items inherits tenant ownership exclusively from its
         -- shipment. FNSKU is not a tenant key and must never widen this scope.
         AND fs.organization_id = $1
       GROUP BY fsi.fnsku
     )
     SELECT
       tr.id AS testing_result_id,
       su.id AS entity_id,
       su.sku,
       su.sku_catalog_id,
       su.serial_number,
       su.unit_uid,
       su.condition_grade::text AS condition_grade,
       su.current_status::text AS unit_status,
       tr.verdict,
       tr.tested_by,
       staff.name AS tested_by_name,
       tr.created_at::text AS tested_at,
       ff.fnsku,
       ff.asin,
       COALESCE(sc.product_title, ff.product_title, su.sku) AS title,
       vel.velocity_tier,
       COALESCE(op.open_remaining, 0)::int AS open_fba_plan_remaining,
       EXISTS (
         SELECT 1
         FROM order_unit_allocations oua
         WHERE oua.serial_unit_id = su.id
           AND COALESCE(oua.state, '') <> 'RELEASED'
       ) AS has_active_order_allocation,
       EXISTS (
         SELECT 1
         FROM fba_shipment_item_units fiu
         WHERE fiu.serial_unit_id = su.id
       ) AS has_fba_link
     FROM testing_results tr
     JOIN serial_units su
       ON su.id = tr.serial_unit_id
      AND su.organization_id = tr.organization_id
     LEFT JOIN staff
       ON staff.id = tr.tested_by
      AND staff.organization_id = $1
     LEFT JOIN sku_catalog sc
       ON sc.id = su.sku_catalog_id
      AND sc.organization_id = $1
     LEFT JOIN LATERAL (
       SELECT f.fnsku, f.asin, f.product_title
       FROM fba_fnskus f
       WHERE f.organization_id = $1
         AND f.is_active = true
         AND (
           (su.sku_catalog_id IS NOT NULL AND f.sku_catalog_id = su.sku_catalog_id)
           OR (su.sku IS NOT NULL AND f.sku = su.sku)
         )
       ORDER BY
         CASE WHEN su.sku_catalog_id IS NOT NULL AND f.sku_catalog_id = su.sku_catalog_id THEN 0 ELSE 1 END,
         f.updated_at DESC NULLS LAST
       LIMIT 1
     ) ff ON TRUE
     LEFT JOIN open_plan op ON op.fnsku = ff.fnsku
     LEFT JOIN mv_sku_velocity_30d vel
       ON vel.organization_id = $1
      AND su.sku IS NOT NULL
      AND vel.sku = su.sku
     WHERE tr.organization_id = $1
     ORDER BY tr.created_at DESC, tr.id DESC
     LIMIT $2`,
    [orgId, limit],
  );
  return result.rows;
}
