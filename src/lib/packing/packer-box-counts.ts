/**
 * Daily boxes-packed-by-packer — the same grain the floor asks for in chat:
 * one PACK_COMPLETED activity log = one box, warehouse civil day in
 * America/Los_Angeles, grouped by staff name.
 *
 * Heavier packing KPI (tier minutes, FBA fill) stays in packer-kpi-queries.
 * This module is the short count only.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type PackerBoxCountRow = {
  packer: string;
  boxesPacked: number;
};

export type PackerBoxCountReport = {
  day: string;
  rows: PackerBoxCountRow[];
  total: number;
};

export function assemblePackerBoxCountReport(
  day: string,
  rows: readonly PackerBoxCountRow[],
): PackerBoxCountReport {
  const sorted = [...rows].sort((a, b) => {
    if (b.boxesPacked !== a.boxesPacked) return b.boxesPacked - a.boxesPacked;
    return a.packer.localeCompare(b.packer);
  });
  const total = sorted.reduce((n, r) => n + r.boxesPacked, 0);
  return { day, rows: sorted, total };
}

export async function getPackerBoxCountsForDay(
  orgId: OrgId,
  day: string,
): Promise<PackerBoxCountReport> {
  const result = await tenantQuery<{ packer: string; boxes_packed: number }>(
    orgId,
    `
      SELECT
        COALESCE(s.name, '(unassigned)') AS packer,
        COUNT(*)::int AS boxes_packed
      FROM station_activity_logs sal
      LEFT JOIN staff s ON s.id = sal.staff_id
      WHERE sal.station = 'PACK'
        AND sal.activity_type = 'PACK_COMPLETED'
        AND sal.organization_id = $1
        AND (timezone('America/Los_Angeles', sal.created_at))::date = $2::date
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `,
    [orgId, day],
  );

  return assemblePackerBoxCountReport(
    day,
    result.rows.map((r) => ({
      packer: r.packer,
      boxesPacked: Number(r.boxes_packed) || 0,
    })),
  );
}
