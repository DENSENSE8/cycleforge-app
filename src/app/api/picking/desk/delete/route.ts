import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishTechLogChanged } from '@/lib/realtime/publish';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { UnpickError, voidDeskScanSessions } from '@/lib/picking/unpick';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';

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
 * cascade to TSN + fba_fnsku_logs; every unit its serials picked goes back
 * to ALLOCATED and its SKU picks' stock is put back (`voidDeskScanSessions`),
 * so the scan no longer marks the order picked. Audited as `pick_scan.void`.
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

  const orgId = ctx.organizationId;
  const actorStaffId = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  let voided;
  try {
    voided = await withTenantTransaction(orgId, async (client) => {
      const v = await voidDeskScanSessions(client, orgId, {
        salIds: [salId],
        actorStaffId,
        source: 'pick.desk.delete',
      });
      // The scan (and its serials) no longer mark the order picked.
      await refreshOrderStageFacts(
        orgId,
        {
          orderIds: [salRow.rows[0].order_row_id, ...v.unpicked.map((u) => u.orderId)],
          shipmentIds: [salRow.rows[0].shipment_id],
        },
        client,
      );
      return v;
    });
  } catch (err) {
    if (err instanceof UnpickError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    throw err;
  }

  await recordAudit(pool, ctx, req, {
    source: 'api.picking.desk.delete',
    action: AUDIT_ACTION.PICK_SCAN_VOID,
    entityType: salRow.rows[0].order_row_id ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.SHIPMENT,
    entityId: String(salRow.rows[0].order_row_id ?? salRow.rows[0].shipment_id ?? salId),
    stationActivityLogId: salId,
    before: { scans: voided.scans, serials: voided.serials },
    after: { unpicked: voided.unpicked, stock_reversals: voided.stockReversals },
  });
  // `/api/orders` caches under the global scope, the station feeds per org.
  await invalidateCacheTags(['desk-pick-logs', 'orders-next', 'shipped', 'orders']);
  await invalidateCacheTags(orgId, ['desk-pick-logs', 'orders-next', 'shipped', 'orders']);
  if (staffId) {
    await publishTechLogChanged({ organizationId: orgId, techId: staffId, action: 'delete', source: 'tech.delete' });
  }
  const touchedOrderIds = [salRow.rows[0].order_row_id, ...voided.unpicked.map((u) => u.orderId)];
  after(() => publishOrderPickFacts(orgId, touchedOrderIds, 'pick.desk.delete'));

  return NextResponse.json({
    success: true,
    deletedSerials: voided.serials.length,
    unpickedUnits: voided.unpicked,
  });
}, { permission: 'picking.scan' });
