import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishTechLogChanged } from '@/lib/realtime/publish';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';

/**
 * Resolve the desk session anchor from a tech-log row reference:
 * `{ sourceRowId, sourceKind }` (the row's own kind) or a bare `{ rowId }`.
 */
async function resolveSalIdFromRow(
  orgId: OrgId,
  sourceRowId: number | null,
  sourceKind: string,
  rowId: number | null,
): Promise<number | null> {
  let salId: number | null = null;

  // If sourceKind is a SAL-based row (fba_scan or tech_scan), the sourceRowId IS the SAL id — BUT it comes straight from the request body,…
  if (sourceRowId && (sourceKind === 'fba_scan' || sourceKind === 'tech_scan')) {
    const r = await tenantQuery(
      orgId,
      `SELECT id FROM station_activity_logs WHERE id = $1 AND station IN ('TECH', 'PICK') AND organization_id = $2 LIMIT 1`,
      [sourceRowId, orgId],
    );
    salId = r.rows[0]?.id ?? null;
  }

  // If sourceKind is tech_serial, find the SAL via context_station_activity_log_id
  if (!salId && sourceRowId && sourceKind === 'tech_serial') {
    const r = await tenantQuery(
      orgId,
      `SELECT context_station_activity_log_id FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [sourceRowId, orgId],
    );
    salId = r.rows[0]?.context_station_activity_log_id ?? null;
  }

  // Fallback: try rowId as a TSN id
  if (!salId && rowId) {
    const r = await tenantQuery(
      orgId,
      `SELECT context_station_activity_log_id FROM tech_serial_numbers WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [rowId, orgId],
    );
    salId = r.rows[0]?.context_station_activity_log_id ?? null;
  }

  // Final fallback: try rowId as a SAL id directly
  if (!salId && rowId) {
    const r = await tenantQuery(
      orgId,
      `SELECT id FROM station_activity_logs WHERE id = $1 AND station IN ('TECH', 'PICK') AND organization_id = $2 LIMIT 1`,
      [rowId, orgId],
    );
    salId = r.rows[0]?.id ?? null;
  }

  return salId;
}

/**
 * POST /api/picking/desk/delete — delete one desk scan session. SAL is SoT,
 * cascade to TSN + fba_fnsku_logs.
 * Body: `{ salId }`, or a tech-log row reference `{ sourceRowId, sourceKind }` / `{ rowId }`.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });

  const bodySalId = Number(body.salId);
  const sourceRowId = body.sourceRowId ? Number(body.sourceRowId) : null;
  const sourceKind = String(body.sourceKind || '').trim();
  const rowId = body.rowId ? Number(body.rowId) : null;

  let salId: number;
  if (Number.isFinite(bodySalId) && bodySalId > 0) {
    salId = bodySalId;
  } else if (sourceRowId || rowId) {
    const resolved = await resolveSalIdFromRow(ctx.organizationId, sourceRowId, sourceKind, rowId);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Could not resolve scan session for deletion' }, { status: 404 });
    }
    salId = resolved;
  } else {
    return NextResponse.json({ success: false, error: 'salId is required' }, { status: 400 });
  }

  // Verify SAL row exists (org-scoped) and get staff for cache invalidation
  const salRow = await tenantQuery(
    ctx.organizationId,
    `SELECT id, staff_id, fnsku, order_row_id, shipment_id FROM station_activity_logs WHERE id = $1 AND organization_id = $2`,
    [salId, ctx.organizationId],
  );
  if (salRow.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Scan session not found' }, { status: 404 });
  }
  const staffId = salRow.rows[0].staff_id;

  const deletedSerialCount = await withTenantTransaction(ctx.organizationId, async (client) => {
    // 1. Delete SERIAL_ADDED SAL rows that reference TSN rows for this session
    await client.query(
      `DELETE FROM station_activity_logs
         WHERE activity_type = 'SERIAL_ADDED'
           AND organization_id = $2
           AND tech_serial_number_id IN (
             SELECT id FROM tech_serial_numbers
             WHERE context_station_activity_log_id = $1 AND organization_id = $2
           )`,
      [salId, ctx.organizationId],
    );

    // 2. Delete TSN rows linked to this SAL
    const deletedTsn = await client.query(
      `DELETE FROM tech_serial_numbers WHERE context_station_activity_log_id = $1 AND organization_id = $2`,
      [salId, ctx.organizationId],
    );

    // 3. Delete fba_fnsku_logs linked to this SAL
    await client.query(
      `DELETE FROM fba_fnsku_logs WHERE station_activity_log_id = $1 AND organization_id = $2`,
      [salId, ctx.organizationId],
    );

    // 4. Delete the anchor SAL row itself
    await client.query(
      `DELETE FROM station_activity_logs WHERE id = $1 AND organization_id = $2`,
      [salId, ctx.organizationId],
    );
    // 5. The scan (and its serials) no longer mark the order picked.
    await refreshOrderStageFacts(
      ctx.organizationId,
      { orderIds: [salRow.rows[0].order_row_id], shipmentIds: [salRow.rows[0].shipment_id] },
      client,
    );

    return deletedTsn.rowCount ?? 0;
  });

  await invalidateCacheTags(['desk-pick-logs', 'orders-next', 'shipped', 'orders']);
  if (staffId) {
    await publishTechLogChanged({ organizationId: ctx.organizationId, techId: staffId, action: 'delete', source: 'tech.delete' });
  }

  return NextResponse.json({ success: true, deletedSerials: deletedSerialCount });
}, { permission: 'picking.scan' });
