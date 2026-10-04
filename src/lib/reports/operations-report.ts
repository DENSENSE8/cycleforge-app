import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { buildPackingReportRows } from '@/lib/packing/packing-report';
import { getPackingKpisForDay } from '@/lib/packing/packer-kpi-queries';
import {
  buildStaffOperationsReport,
  medianOperationSeconds,
  type ActiveOperation,
  type MeasuredOperation,
  type OperationsReportPayload,
  type OperationsStaffSeed,
} from '@/lib/reports/operations-report-contract';
import { getCurrentPSTDateKey } from '@/utils/date';

interface PickSessionRow {
  id: number;
  order_id: number;
  order_number: string | null;
  staff_id: number;
  staff_name: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

interface ActiveRow {
  id: number;
  kind: 'pick' | 'pack';
  staff_id: number;
  staff_name: string | null;
  title: string | null;
  started_at: string;
  order_id: number | null;
}

const text = (value: unknown): string => value == null ? '' : String(value);

export async function getOperationsReportForDay(orgId: OrgId, day: string): Promise<OperationsReportPayload> {
  const includeActive = day === getCurrentPSTDateKey();
  const [packingSummary, packingRows, rosterResult, pickResult, activeResult] = await Promise.all([
    getPackingKpisForDay(orgId, day),
    buildPackingReportRows({ day }, orgId),
    tenantQuery<OperationsStaffSeed>(
      orgId,
      `SELECT s.id AS "staffId", s.name AS "staffName"
         FROM staff s
        WHERE s.organization_id = $1
          AND COALESCE(s.active, TRUE) = TRUE
          AND COALESCE(s.status, 'active') = 'active'
          AND (
            UPPER(COALESCE(s.employee_id, '')) LIKE 'PACK%'
            OR LOWER(COALESCE(s.role, '')) LIKE '%pack%'
            OR EXISTS (
              SELECT 1 FROM staff_stations ss
               WHERE ss.staff_id = s.id AND UPPER(ss.station) = 'PACK'
            )
          )
        ORDER BY s.sort_order, s.name, s.id`,
      [orgId],
    ),
    tenantQuery<PickSessionRow>(
      orgId,
      `SELECT
         ps.id,
         ps.order_id,
         NULLIF(TRIM(o.order_id), '') AS order_number,
         ps.picker_staff_id AS staff_id,
         s.name AS staff_name,
         ps.started_at::text,
         ps.ended_at::text,
         GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ps.ended_at - ps.started_at))))::int AS duration_seconds
       FROM picking_sessions ps
       JOIN orders o ON o.id = ps.order_id AND o.organization_id = $1
       LEFT JOIN staff s ON s.id = ps.picker_staff_id
       WHERE ps.ended_at IS NOT NULL
         AND COALESCE(ps.abandoned, FALSE) = FALSE
         AND (timezone('America/Los_Angeles', ps.ended_at))::date = $2::date
       ORDER BY ps.ended_at DESC, ps.id DESC
       LIMIT 10000`,
      [orgId, day],
    ),
    includeActive
      ? tenantQuery<ActiveRow>(
        orgId,
        `SELECT * FROM (
           SELECT
             ps.id,
             'pick'::text AS kind,
             ps.picker_staff_id AS staff_id,
             s.name AS staff_name,
             COALESCE(NULLIF(TRIM(o.order_id), ''), 'Order #' || o.id::text) AS title,
             ps.started_at::text,
             ps.order_id AS order_id
           FROM picking_sessions ps
           JOIN orders o ON o.id = ps.order_id AND o.organization_id = $1
           LEFT JOIN staff s ON s.id = ps.picker_staff_id
           WHERE ps.ended_at IS NULL
             AND COALESCE(ps.abandoned, FALSE) = FALSE
             AND (timezone('America/Los_Angeles', ps.started_at))::date = $2::date
           UNION ALL
           SELECT
             pl.id,
             'pack'::text AS kind,
             pl.packed_by AS staff_id,
             s.name AS staff_name,
             COALESCE(NULLIF(TRIM(pl.scan_ref), ''), 'Pack capture #' || pl.id::text) AS title,
             pl.created_at::text AS started_at,
             NULL::int AS order_id
           FROM packer_logs pl
           LEFT JOIN staff s ON s.id = pl.packed_by
           WHERE pl.organization_id = $1
             AND pl.completion_state = 'CAPTURING'
             AND pl.packed_by IS NOT NULL
             AND (timezone('America/Los_Angeles', pl.created_at))::date = $2::date
         ) active
         ORDER BY started_at, id`,
        [orgId, day],
      )
      : Promise.resolve({ rows: [] as ActiveRow[] }),
  ]);

  const pickActivity: MeasuredOperation[] = pickResult.rows.map((row) => ({
    key: `pick:${row.id}`,
    kind: 'pick',
    staffId: Number(row.staff_id),
    staffName: row.staff_name,
    title: row.order_number ? `Order ${row.order_number}` : `Order #${row.order_id}`,
    subtitle: 'Completed pick session',
    startedAt: row.started_at,
    completedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    href: `/m/orders/${row.order_id}/activity`,
  }));
  const packActivity: MeasuredOperation[] = packingRows.map((row) => ({
    key: `pack:${row.salId}`,
    kind: 'pack',
    staffId: row.packerStaffId,
    staffName: row.packerName,
    title: row.productTitle || row.sku || row.itemNumber || 'Unpaired pack',
    subtitle: [row.sku ? `SKU ${row.sku}` : null, row.orderNumber ? `Order ${row.orderNumber}` : null].filter(Boolean).join(' · ') || null,
    startedAt: null,
    completedAt: row.packedAt,
    durationSeconds: row.packDurationSeconds,
    href: row.sku ? `/m/products/${encodeURIComponent(row.sku)}` : null,
  }));
  const activity = [...pickActivity, ...packActivity]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.key.localeCompare(a.key));
  const activeOperations: ActiveOperation[] = activeResult.rows.map((row) => ({
    key: `${row.kind}:${row.id}`,
    kind: row.kind,
    staffId: Number(row.staff_id),
    staffName: row.staff_name,
    title: text(row.title) || `${row.kind === 'pick' ? 'Pick' : 'Pack'} #${row.id}`,
    startedAt: row.started_at,
    href: row.kind === 'pick' && row.order_id ? `/m/orders/${row.order_id}/activity` : null,
  }));
  const staff = buildStaffOperationsReport(rosterResult.rows, activity, activeOperations);
  const pickDurations = pickActivity.map((row) => row.durationSeconds).filter((value): value is number => value != null);
  const packDurations = packActivity.map((row) => row.durationSeconds).filter((value): value is number => value != null);

  return {
    ok: true,
    day,
    generatedAt: new Date().toISOString(),
    packingSummary,
    packingRows,
    summary: {
      pickCount: pickActivity.length,
      packCount: packActivity.length,
      medianPickSeconds: medianOperationSeconds(pickDurations),
      medianPackSeconds: medianOperationSeconds(packDurations),
      activePickCount: activeOperations.filter((row) => row.kind === 'pick').length,
      activePackCount: activeOperations.filter((row) => row.kind === 'pack').length,
    },
    staff,
    activity,
    activeOperations,
  };
}
