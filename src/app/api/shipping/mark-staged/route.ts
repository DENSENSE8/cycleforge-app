import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import {
  listDockStagingCandidateShipmentIds,
  listDockStagingCandidates,
  markShipmentsDockStaged,
  normalizeDockLocation,
  resolveStaffIdByName,
} from '@/lib/outbound/dock-staging';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const [pending, staged] = await Promise.all([
    listDockStagingCandidates(ctx.organizationId, 'pending'),
    listDockStagingCandidates(ctx.organizationId, 'staged'),
  ]);
  return NextResponse.json({ ok: true, pending, staged });
}, { permission: 'shipping.view' });

/**
 * POST /api/shipping/mark-staged — bulk-record DOCK_STAGED for packed packages
 * sitting in the outbound lane that have not yet been scanned out.
 *
 * Body (optional): `{ staffId?: number, staffName?: string }` — defaults to the
 * signed-in operator; pass `staffName: "Mike"` for the launch-day backfill.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const staffName = String(body?.staffName ?? '').trim();
  const requestedShipmentId = Number(body?.shipmentId);
  const hasRequestedShipment = Number.isFinite(requestedShipmentId) && requestedShipmentId > 0;
  const requestedLocation = normalizeDockLocation(body?.locationCode ?? body?.location);
  let staffId = Number(body?.staffId ?? ctx.staffId);

  if (!Number.isFinite(staffId) || staffId <= 0) {
    if (staffName) {
      const resolved = await resolveStaffIdByName(ctx.organizationId, staffName);
      if (resolved) staffId = resolved;
    }
  }

  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Valid staffId or staffName required' }, { status: 400 });
  }

  if (hasRequestedShipment && !requestedLocation) {
    return NextResponse.json({ error: 'Valid staging location required' }, { status: 400 });
  }

  const candidateIds = await listDockStagingCandidateShipmentIds(ctx.organizationId);
  const shipmentIds = hasRequestedShipment
    ? candidateIds.filter((id) => id === requestedShipmentId)
    : candidateIds;
  if (hasRequestedShipment && shipmentIds.length === 0) {
    return NextResponse.json({ error: 'Packed shipment is not available to stage' }, { status: 409 });
  }
  const marked = await markShipmentsDockStaged(ctx.organizationId, staffId, shipmentIds, {
    locationCode: requestedLocation,
    source: hasRequestedShipment ? 'mobile.outbound.stage' : 'outbound.mark-staged',
  });

  await invalidateAllOrdersApiCaches([], ctx.organizationId);

  return NextResponse.json({
    ok: true,
    marked,
    staffId,
    candidates: shipmentIds.length,
    locationCode: requestedLocation,
  });
}, { permission: 'shipping.mark_shipped' });
