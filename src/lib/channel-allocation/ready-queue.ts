/**
 * Ready-queue loader — TESTED/GRADED serial units not yet FBA-linked or
 * order-allocated, scored by {@link recommendDisposition}.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { VelocityTier } from '@/lib/velocity-tier-tone';
import {
  compareAllocationHits,
  recommendDisposition,
} from './recommend-disposition';
import type { AllocationHit, ChannelDisposition } from './types';

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
  entity_id: number;
  sku: string | null;
  sku_catalog_id: number | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  condition_grade: string | null;
  unit_status: string | null;
  tested_at: string | null;
  velocity_tier: string | null;
  open_fba_plan_remaining: number;
  serial_number: string | null;
  unit_uid: string | null;
}

const defaultDeps: ReadyQueueDeps = {
  loadCandidates: loadReadyCandidates,
};

/**
 * Load scored ready-queue hits for the org. Pure scoring is in recommendDisposition;
 * this function only loads facts and maps display fields.
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
    // Amazon FC depth not wired yet — degrade: open plan is the FBA demand signal;
    // when no open plan remains we treat FBA demand as filled for this SKU/FNSKU.
    const rec = recommendDisposition({
      amazonOos: false,
      velocityTier: tier,
      openFbaPlanRemaining: openPlan,
      fbaFilled: openPlan === 0,
    });

    if (query.disposition && rec.disposition !== query.disposition) continue;

    if (q) {
      const hay = [row.title, row.sku, row.fnsku, row.asin, row.serial_number, row.unit_uid]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    hits.push({
      entityType: 'SERIAL_UNIT',
      entityId: Number(row.entity_id),
      skuCatalogId: row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
      sku: row.sku,
      fnsku: row.fnsku,
      asin: row.asin,
      title: row.title,
      conditionGrade: row.condition_grade,
      unitStatus: row.unit_status,
      testedAt: row.tested_at,
      disposition: rec.disposition,
      reasons: rec.reasons,
      score: rec.score,
      velocityTier: tier,
    });
  }

  hits.sort(compareAllocationHits);
  return hits.slice(0, limit);
}

function normalizeTier(raw: string | null | undefined): VelocityTier | null {
  const t = String(raw || '').trim().toUpperCase();
  if (t === 'A' || t === 'B' || t === 'C' || t === 'D') return t;
  return null;
}

async function loadReadyCandidates(orgId: OrgId, limit: number): Promise<ReadyCandidateRow[]> {
  // Candidates: sellable post-test units not reserved to an order and not linked
  // to an FBA shipment item. Catalog title preferred; FNSKU via catalog link.
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
         -- fba_shipment_items has no organization_id; org lives on fba_shipments
         -- and/or fba_fnskus (see 2026-07-04a_search_outbox_claim_window.sql).
         AND (
           fs.organization_id = $1
           OR EXISTS (
             SELECT 1 FROM fba_fnskus ff
             WHERE ff.fnsku = fsi.fnsku
               AND ff.organization_id = $1
           )
         )
       GROUP BY fsi.fnsku
     )
     SELECT
       su.id AS entity_id,
       su.sku,
       su.sku_catalog_id,
       su.serial_number,
       su.unit_uid,
       su.condition_grade::text AS condition_grade,
       su.current_status::text AS unit_status,
       su.updated_at::text AS tested_at,
       ff.fnsku,
       ff.asin,
       COALESCE(sc.product_title, ff.product_title, su.sku) AS title,
       vel.velocity_tier,
       COALESCE(op.open_remaining, 0)::int AS open_fba_plan_remaining
     FROM serial_units su
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
     WHERE su.organization_id = $1
       AND su.current_status::text IN ('TESTED', 'GRADED')
       AND NOT EXISTS (
         SELECT 1 FROM order_unit_allocations oua
         WHERE oua.serial_unit_id = su.id
           AND COALESCE(oua.state, '') <> 'RELEASED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM fba_shipment_item_units fiu
         WHERE fiu.serial_unit_id = su.id
       )
     ORDER BY su.updated_at ASC NULLS LAST, su.id ASC
     LIMIT $2`,
    [orgId, limit],
  );
  return result.rows;
}
