import { NextResponse, after } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { lockUnitForPickScan } from '@/lib/picking/pick-serial-link';
import { revertUnitPick } from '@/lib/picking/unpick';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';

/** POST /api/picking/units/unscan — clean inverse of /api/picking/units/scan. */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));
  const scan = String(body?.scan ?? '').trim();
  const serialUnitIdRaw = Number(body?.serial_unit_id);
  const serialUnitIdInput =
    Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0 ? Math.floor(serialUnitIdRaw) : null;
  const orderIdRaw = Number(body?.order_id);
  const orderIdInput = Number.isFinite(orderIdRaw) && orderIdRaw > 0 ? Math.floor(orderIdRaw) : null;
  const clientEventId = String(body?.client_event_id || '').trim() || null;

  if (!scan && !serialUnitIdInput) {
    return NextResponse.json({ ok: false, error: 'scan or serial_unit_id is required' }, { status: 400 });
  }

  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  const orgId = ctx.organizationId;

  const result = await withTenantTransaction(orgId, async (client) => {
    // Resolve the unit a scan names (serial_units is tenant-owned — a
    // cross-tenant id/serial reads as not-found).
    const unitId = serialUnitIdInput ?? (await lockUnitForPickScan(client, orgId, scan))?.unit.id;
    if (unitId == null) return { ok: false as const, status: 404, error: 'serial_units row not found' };

    // serial_units PICKED → ALLOCATED via the state machine, the allocation
    // back to ALLOCATED (stays reserved, not released), the serial unlinked.
    const r = await revertUnitPick(client, orgId, {
      serialUnitId: unitId,
      orderId: orderIdInput,
      actorStaffId,
      source: 'pick.unscan',
      clientEventId: clientEventId ? `${clientEventId}:unpick` : null,
    });
    if (!r.ok) return r;
    await refreshOrderStageFacts(orgId, { orderIds: [r.orderId] }, client);

    return {
      ok: true as const,
      unitId: r.unitId,
      prevStatus: 'PICKED',
      nextStatus: 'ALLOCATED',
      allocationId: r.allocationId,
      orderId: r.orderId,
      inventoryEventId: r.inventoryEventId,
    };
  });

  if (!result.ok) return NextResponse.json(result, { status: result.status });
  // Un-picking rolls the Pick column back — re-state the order's pick fact.
  const changedOrderId = result.orderId;
  after(() => publishOrderPickFacts(orgId, [changedOrderId], 'pick.unscan'));
  return NextResponse.json(result);
}, { permission: 'picking.scan' });
