/**
 * The QC queue read (`GET /api/qc/queue`, `/m/qc`): every unit waiting for
 * quality control in one org, tiered and sorted by `qc-queue-order.ts`.
 *
 * Actionable = a physical unit (`receiving_unit_stage_facts` row WITH a serial
 * unit), still on the receiving side (`RECEIVED` / `TRIAGED` / `IN_TEST` —
 * STOCKED, SHIPPED and the rest are past QC) and not yet given a final
 * verdict (`qc_state` PENDING or TEST_AGAIN). Facts rows with no serial unit
 * have nothing to QC per unit and are left out.
 *
 * ONE statement: the actionable units with the facts their tier is decided
 * from, plus this tech's verdicts today. Every join is org-scoped.
 */

import { productImageUrl } from '@/lib/photos/product-image-url';
import { RECEIVING_LINE_IMAGE_URL_SQL } from '@/lib/receiving/lines/sql-receiving-image';
import { SKU_CATALOG_JOIN_ON_SQL, resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  orderQcQueue,
  qcQueueTier,
  qcQueueTierCounts,
  type QcQueuePayload,
  type QcQueueUnit,
} from './qc-queue-order';

/** The list paints at most this many cards; `total` still counts every unit. */
export const QC_QUEUE_LIMIT = 300;

/** Serial statuses still on the receiving side of QC. */
export const QC_ACTIONABLE_UNIT_STATUSES = ['RECEIVED', 'TRIAGED', 'IN_TEST'] as const;
/** Stage-fact QC states that still want a verdict. */
export const QC_ACTIONABLE_QC_STATES = ['PENDING', 'TEST_AGAIN'] as const;

/** One unit as the statement returns it (inside `units` JSON). */
export interface QcQueueRawUnit {
  serial_unit_id: number;
  receiving_id: number | null;
  receiving_line_id: number;
  qc_state: string;
  unit_status: string;
  carton_is_return: boolean | null;
  carton_intake_type: string | null;
  carton_source: string | null;
  carton_is_priority: boolean | null;
  line_receiving_type: string | null;
  line_intake_type: string | null;
  line_is_repair_service: boolean | null;
  line_has_repair_fact: boolean | null;
  unboxed_at: string | null;
  bin: string | null;
  dock_location: string | null;
  serial: string | null;
  sku: string | null;
  item_name: string | null;
  catalog_product_title: string | null;
  /** The receiving line's photo (`RECEIVING_LINE_IMAGE_URL_SQL`: catalog photo, listing cover, then Zoho item image). */
  image_url: string | null;
  listing_cover_photo_id: number | null;
}

export interface QcQueueRawResult {
  done_today: number | string | null;
  units: QcQueueRawUnit[] | null;
}

export const QC_QUEUE_SQL = `
WITH units AS (
  SELECT f.serial_unit_id,
         f.receiving_id,
         f.receiving_line_id,
         f.qc_state,
         su.current_status::text                         AS unit_status,
         rc.is_return                                    AS carton_is_return,
         rc.intake_type                                  AS carton_intake_type,
         rc.source                                       AS carton_source,
         rc.is_priority                                  AS carton_is_priority,
         rl.receiving_type                               AS line_receiving_type,
         rl.intake_type                                  AS line_intake_type,
         rl.is_repair_service                            AS line_is_repair_service,
         EXISTS (
           SELECT 1 FROM receiving_line_facts lf
            WHERE lf.organization_id = f.organization_id
              AND lf.receiving_line_id = f.receiving_line_id
              AND lf.fact_kind = 'repair_service'
         )                                               AS line_has_repair_fact,
         ru.unboxed_at,
         NULLIF(BTRIM(su.current_location), '')          AS bin,
         dock.name                                       AS dock_location,
         su.serial_number                                AS serial,
         COALESCE(NULLIF(BTRIM(su.sku), ''), rl.sku)     AS sku,
         rl.item_name,
         sc.product_title                                AS catalog_product_title,
         cover.photo_id                                  AS listing_cover_photo_id,
         ${RECEIVING_LINE_IMAGE_URL_SQL}
    FROM receiving_unit_stage_facts f
    JOIN serial_units su
      ON su.organization_id = f.organization_id
     AND su.id = f.serial_unit_id
    LEFT JOIN receiving_line rl
      ON rl.organization_id = f.organization_id
     AND rl.id = f.receiving_line_id
    LEFT JOIN receiving_carton rc
      ON rc.organization_id = f.organization_id
     AND rc.id = f.receiving_id
    LEFT JOIN receiving_unbox ru
      ON ru.organization_id = f.organization_id
     AND ru.receiving_id = f.receiving_id
    LEFT JOIN receiving_triage rt
      ON rt.organization_id = f.organization_id
     AND rt.receiving_id = f.receiving_id
    LEFT JOIN locations dock
      ON dock.organization_id = f.organization_id
     AND dock.id = rt.staging_location_id
    LEFT JOIN sku_catalog sc
      ON ${SKU_CATALOG_JOIN_ON_SQL}
    LEFT JOIN LATERAL (
      SELECT lp.photo_id
        FROM listing_photos lp
       WHERE lp.organization_id = sc.organization_id
         AND lp.sku_catalog_id = sc.id
         AND lp.is_cover
       LIMIT 1
    ) cover ON TRUE
    LEFT JOIN receiving_line_zoho rz
      ON rz.receiving_line_id = rl.id
     AND rz.organization_id = rl.organization_id
   WHERE f.organization_id = $1
     AND f.qc_state = ANY($3::text[])
     AND su.current_status::text = ANY($4::text[])
),
done AS (
  SELECT COUNT(DISTINCT f.serial_unit_id)::int AS n
    FROM receiving_unit_stage_facts f
   WHERE f.organization_id = $1
     AND $2::int IS NOT NULL
     AND f.tested_by = $2::int
     AND f.qc_state IN ('PASSED', 'FAILED')
     AND f.tested_at >= (date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles')
)
SELECT done.n AS done_today,
       COALESCE((SELECT json_agg(units) FROM units), '[]'::json) AS units
  FROM done`;

export interface QcQueueDeps {
  query: (orgId: OrgId, sql: string, params: readonly unknown[]) => Promise<{ rows: QcQueueRawResult[] }>;
}

const defaultDeps: QcQueueDeps = {
  query: (orgId, sql, params) => tenantQuery<QcQueueRawResult & Record<string, unknown>>(orgId, sql, params),
};

const text = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

export function qcQueueUnit(raw: QcQueueRawUnit): QcQueueUnit {
  const sku = text(raw.sku);
  return {
    serialUnitId: Number(raw.serial_unit_id),
    receivingId: raw.receiving_id == null ? null : Number(raw.receiving_id),
    receivingLineId: Number(raw.receiving_line_id),
    tier: qcQueueTier({
      cartonIsReturn: raw.carton_is_return === true,
      cartonIntakeType: raw.carton_intake_type,
      cartonSource: raw.carton_source,
      lineReceivingType: raw.line_receiving_type,
      lineIntakeType: raw.line_intake_type,
      lineIsRepairService: raw.line_is_repair_service === true,
      lineHasRepairFact: raw.line_has_repair_fact === true,
      qcState: raw.qc_state,
      unitStatus: raw.unit_status,
    }),
    priority: raw.carton_is_priority === true,
    unboxedAt: text(raw.unboxed_at),
    bin: text(raw.bin),
    dockLocation: text(raw.dock_location),
    serial: text(raw.serial),
    sku,
    title: resolveSkuIdentityTitle({
      catalog_product_title: raw.catalog_product_title,
      item_name: raw.item_name,
      sku,
    }),
    photoUrl: productImageUrl({
      catalogImageUrl: raw.image_url,
      listingCoverPhotoId: raw.listing_cover_photo_id,
    }),
  };
}

export async function listQcQueue(
  input: { orgId: OrgId; staffId: number | null; limit?: number },
  deps: QcQueueDeps = defaultDeps,
): Promise<QcQueuePayload> {
  const limit = input.limit ?? QC_QUEUE_LIMIT;
  const staffId = input.staffId != null && input.staffId > 0 ? input.staffId : null;
  const { rows } = await deps.query(input.orgId, QC_QUEUE_SQL, [
    input.orgId,
    staffId,
    [...QC_ACTIONABLE_QC_STATES],
    [...QC_ACTIONABLE_UNIT_STATUSES],
  ]);
  const result = rows[0];
  const all = orderQcQueue((result?.units ?? []).map(qcQueueUnit));
  return {
    units: all.slice(0, limit),
    total: all.length,
    tierCounts: qcQueueTierCounts(all),
    doneToday: Number(result?.done_today ?? 0) || 0,
  };
}
