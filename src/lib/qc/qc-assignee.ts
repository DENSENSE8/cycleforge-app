/**
 * QC assignment is a UNIT fact held on the line the unit was received on
 * (`receiving_line_testing.assigned_tech_id`). An order's QC assignee is the
 * tech on the origin receiving line of a unit allocated to it, so assigning QC
 * from the order writes those origin lines — the same column the QC bench
 * (`/test`) assigns per line.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';

export type AssignOrderQcResult =
  | { kind: 'ok'; lineIds: number[] }
  | { kind: 'order_not_found' }
  | { kind: 'staff_not_found' }
  /** No live-allocated unit of the order came from a receiving line. */
  | { kind: 'no_lines' };

export async function assignOrderQcTech(
  orgId: OrgId,
  orderId: number,
  techId: number | null,
): Promise<AssignOrderQcResult> {
  return withTenantTransaction(orgId, async (client) => {
    const order = await client.query(
      `SELECT 1 FROM orders WHERE id = $1 AND organization_id = $2`,
      [orderId, orgId],
    );
    if (order.rowCount === 0) return { kind: 'order_not_found' };

    if (techId != null) {
      const staff = await client.query(
        `SELECT 1 FROM staff WHERE id = $1 AND organization_id = $2`,
        [techId, orgId],
      );
      if (staff.rowCount === 0) return { kind: 'staff_not_found' };
    }

    const lines = await client.query<{ line_id: number }>(
      `SELECT DISTINCT p.origin_id::int AS line_id
         FROM order_unit_allocations a
         JOIN serial_unit_provenance p
           ON p.serial_unit_id  = a.serial_unit_id
          AND p.organization_id = a.organization_id
          AND p.origin_type     = 'RECEIVING_LINE'
          AND p.origin_id IS NOT NULL
        WHERE a.order_id        = $1
          AND a.organization_id = $2
          AND a.state NOT IN ('RELEASED', 'RETURNED')`,
      [orderId, orgId],
    );
    const lineIds = lines.rows.map((r) => Number(r.line_id));
    if (lineIds.length === 0) return { kind: 'no_lines' };

    const txDeps: FactsDeps = {
      query: ((_org: OrgId, sql: string, params?: unknown[]) => client.query(sql, params)) as FactsDeps['query'],
    };
    for (const lineId of lineIds) {
      await upsertReceivingLineTesting(orgId, lineId, { assignedTechId: techId }, txDeps);
    }
    // Line feeds page by updated_at — the reassign must surface on the QC bench.
    await client.query(
      `UPDATE receiving_line SET updated_at = NOW()
        WHERE id = ANY($1::int[]) AND organization_id = $2`,
      [lineIds, orgId],
    );
    return { kind: 'ok', lineIds };
  });
}
