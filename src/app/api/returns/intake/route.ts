import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseScannedUrl } from '@/lib/scan-resolver';
import { processReturnsIntake } from '@/lib/inventory/returns';

/** POST /api/returns/intake */
export const POST = withAuth(async (request, ctx) => {
  const body = await request.json().catch(() => ({}));

  const rawSerials: string[] = Array.isArray(body?.serials)
    ? body.serials.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
    : [];
  const serialUnitIds: number[] = Array.isArray(body?.serial_unit_ids)
    ? body.serial_unit_ids
        .map((x: unknown) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
        .map((n: number) => Math.floor(n))
    : [];

  // Extract per-unit serial from any GS1 Digital Link URLs in the input.
  const normalizedSerials = rawSerials.map((raw) => {
    const url = parseScannedUrl(raw);
    return url && url.type === 'unit' ? url.unitSerial.toUpperCase() : raw.toUpperCase();
  });

  const orderIdRaw = Number(body?.order_id);
  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

  const result = await processReturnsIntake({
    serials: normalizedSerials,
    serialUnitIds,
    trackingNumber: String(body?.tracking_number || '').trim() || null,
    orderId: Number.isFinite(orderIdRaw) && orderIdRaw > 0 ? Math.floor(orderIdRaw) : null,
    reason: String(body?.reason || '').trim() || null,
    clientEventId: String(body?.client_event_id || '').trim() || null,
    actorStaffId,
    organizationId: ctx.organizationId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.missingSerials ? { missing_serials: result.missingSerials } : {}),
        ...(result.missingIds ? { missing_ids: result.missingIds } : {}),
      },
      { status: result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    returned_unit_count: result.returnedUnitCount,
    order_id: result.orderId,
    tracking_number: result.trackingNumber,
    units: result.units,
  });
}, { permission: 'receiving.mark_received' });
