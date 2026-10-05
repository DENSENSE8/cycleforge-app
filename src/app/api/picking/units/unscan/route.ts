import { NextResponse, after } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { lockUnitsForPickScan } from '@/lib/picking/pick-serial-link';
import { revertUnitPick, type RevertedUnitPick } from '@/lib/picking/unpick';
import { publishOrderPickFacts } from '@/lib/picking/pick-facts-publish';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';

/** A member refused mid-call: thrown so the whole un-pick rolls back, answered with the member's refusal. */
class UnpickUnitRefused extends Error {
  constructor(readonly failure: { ok: false; status: 404 | 409; error: string }) {
    super(failure.error);
    this.name = 'UnpickUnitRefused';
  }
}

/**
 * POST /api/picking/units/unscan — clean inverse of /api/picking/units/scan.
 * A `KIT-…` package scan reverts every member in one transaction; any member
 * refused rolls the whole call back with its refusal.
 */
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
    // Resolve the units a scan names (serial_units is tenant-owned — a
    // cross-tenant id/serial reads as not-found).
    const unitIds = serialUnitIdInput
      ? [serialUnitIdInput]
      : ((await lockUnitsForPickScan(client, orgId, scan))?.units.map((u) => u.id) ?? []);
    if (unitIds.length === 0) return { ok: false as const, status: 404, error: 'serial_units row not found' };

    // serial_units PICKED → ALLOCATED via the state machine, the allocation
    // back to ALLOCATED (stays reserved, not released), the serial unlinked.
    // A package's members each need their own client_event_id.
    const reverted: RevertedUnitPick[] = [];
    for (const unitId of unitIds) {
      const eventKey = clientEventId && unitIds.length > 1 ? `${clientEventId}:${unitId}` : clientEventId;
      const r = await revertUnitPick(client, orgId, {
        serialUnitId: unitId,
        orderId: orderIdInput,
        actorStaffId,
        source: 'pick.unscan',
        clientEventId: eventKey ? `${eventKey}:unpick` : null,
      });
      if (!r.ok) throw new UnpickUnitRefused(r);
      reverted.push(r);
    }
    const orderIds = [...new Set(reverted.map((r) => r.orderId))];
    await refreshOrderStageFacts(orgId, { orderIds }, client);

    const first = reverted[0];
    return {
      ok: true as const,
      unitId: first.unitId,
      prevStatus: 'PICKED',
      nextStatus: 'ALLOCATED',
      allocationId: first.allocationId,
      orderId: first.orderId,
      inventoryEventId: first.inventoryEventId,
      unitIds: reverted.map((r) => r.unitId),
      orderIds,
    };
  }).catch((err: unknown) => {
    if (err instanceof UnpickUnitRefused) return err.failure;
    throw err;
  });

  if (!result.ok) return NextResponse.json(result, { status: result.status });
  // Un-picking rolls the Pick column back — re-state the orders' pick facts.
  const { orderIds, ...response } = result;
  after(() => publishOrderPickFacts(orgId, orderIds, 'pick.unscan'));
  return NextResponse.json(response);
}, { permission: 'picking.scan' });
