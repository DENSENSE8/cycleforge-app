import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, withTenantConnection } from '@/lib/tenancy/db';
import { POST as unifiedSerial } from '@/app/api/tech/serial/route';
import { withAuth } from '@/lib/auth/withAuth';
import { normalizeTrackingKey18, normalizeTrackingLast8 } from '@/lib/tracking-format';
import { buildOrderPayload, findOrderByShipment } from '@/lib/tech/order-card';

/** Legacy POST /api/tech/add-serial-to-last — thin wrapper around POST /api/tech/serial. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });

  const techId = ctx.staffId;
  const orgId = ctx.organizationId;
  const serial = String(body.serial || body.serialNumber || '').trim();

  if (!serial) return NextResponse.json({ success: false, error: 'serial is required' }, { status: 400 });

  const r = await tenantQuery(
    orgId,
    `SELECT id, shipment_id, scan_ref FROM station_activity_logs
     WHERE station = 'TECH'
       AND activity_type IN ('TRACKING_SCANNED', 'FNSKU_SCANNED')
       AND staff_id = $1
       AND organization_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [techId, orgId],
  );
  const salRow = r.rows[0] as { id: number; shipment_id: number | null; scan_ref: string | null } | undefined;
  const salId = salRow?.id ?? null;

  if (!salId) {
    return NextResponse.json({ success: false, error: 'No active scan session found' }, { status: 404 });
  }

  const headers = new Headers(req.headers);
  headers.set('Content-Type', 'application/json');
  const syntheticReq = new NextRequest(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'add',
      salId,
      serial,
      techId,
      idempotencyKey: body.idempotencyKey ?? body.clientEventId ?? undefined,
    }),
  });

  const res = await unifiedSerial(syntheticReq, { params: Promise.resolve({}) });
  const data = await res.json().catch(() => null);

  // Pass the unified route's failures straight through (already shaped
  // { success: false, error }), preserving its status code.
  if (!res.ok || !data?.success) {
    return NextResponse.json(data ?? { success: false, error: 'Failed to add serial' }, { status: res.status });
  }

  // Success — resolve the active-order card so the client can restore it.
  // Degrade-not-block: if resolution fails, still report success (the serial
  // was written) and let the client fall back gracefully.
  const serialNumbers: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const tracking = String(salRow?.scan_ref || '').trim();
  const attachedToOrder = data.attachedToOrder !== false;
  let order = null;
  try {
    const orderRow = await withTenantConnection(orgId, (client) =>
      findOrderByShipment(
        client,
        salRow?.shipment_id ?? null,
        tracking ? normalizeTrackingKey18(tracking) : null,
        tracking ? normalizeTrackingLast8(tracking) : null,
        orgId,
      ),
    );
    order = buildOrderPayload(orderRow, {
      tracking: orderRow?.shipping_tracking_number || tracking,
      serialNumbers,
      orderFound: Boolean(orderRow) && attachedToOrder,
    });
  } catch (err) {
    console.error('add-serial-to-last order resolve failed:', err);
  }

  const quantity = Number(order?.quantity) || 1;
  const orderFound = Boolean(order) && attachedToOrder;
  return NextResponse.json({
    success: true,
    serialNumbers,
    order,
    attachedToOrder,
    ordersExceptionId: data.ordersExceptionId ?? null,
    warning: data.warning,
    // Never celebrate "complete" for an exception hold session.
    isComplete: orderFound && serialNumbers.length >= quantity,
  });
}, { permission: 'tech.scan_serial' });
