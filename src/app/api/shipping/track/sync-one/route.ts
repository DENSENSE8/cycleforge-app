import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { syncShipment } from '@/lib/shipping/sync-shipment';
import { getShipmentById } from '@/lib/shipping/repository';
import { CARRIER_CREDENTIALS_MISSING } from '@/lib/shipping/carrier-credentials';
import type { CarrierCode } from '@/lib/shipping/types';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * POST { shipmentId } | { trackingNumber, carrier? } — poll ONE shipment now
 * through the cron's writer (`syncShipment`), ignoring its next_check_at.
 * 200 → `{ ok, shipmentId, status, eventsInserted, shipment }` with the row's
 * fresh facts; failure → `{ ok: false, error, errorCode }`: 404 not found,
 * 429 carrier rate limit, 503 carrier credentials missing (nothing written), else 500.
 */

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'shipping-sync-one',
    limit: 30,
    windowMs: 60_000,
    organizationId: ctx.organizationId, staffId: ctx.staffId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
    );
  }

  let body: { shipmentId?: number; trackingNumber?: string; carrier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shipmentId = body.shipmentId != null ? Number(body.shipmentId) : undefined;
  const trackingNumber = body.trackingNumber ? String(body.trackingNumber).trim() : undefined;

  if (!shipmentId && !trackingNumber) {
    return NextResponse.json(
      { error: 'Either shipmentId or trackingNumber is required' },
      { status: 400 }
    );
  }

  const carrierInput = body.carrier ? String(body.carrier).toUpperCase() : undefined;
  const validCarriers: CarrierCode[] = ['UPS', 'USPS', 'FEDEX'];
  const carrier = carrierInput && validCarriers.includes(carrierInput as CarrierCode)
    ? (carrierInput as CarrierCode)
    : undefined;

  // Session-authed route (withAuth + permission): the tenant comes from ctx.
  const orgId = ctx.organizationId;

  // Org-ownership precheck: another org's shipment id reads as not found (404),
  // is never polled, and its facts never come back. Un-stamped (NULL org) rows
  // stay reachable, as getShipmentByTracking treats them.
  if (shipmentId) {
    const owned = await getShipmentById(shipmentId, orgId);
    if (!owned || (owned.organization_id !== null && owned.organization_id !== orgId)) {
      return NextResponse.json({ ok: false, error: 'Shipment not found', errorCode: 'NOT_FOUND' }, { status: 404 });
    }
  }

  const result = await syncShipment({ shipmentId, trackingNumber, carrier }, orgId);

  if (!result.ok) {
    const status = result.errorCode === 'NOT_FOUND' ? 404
      : result.errorCode === 'RATE_LIMIT' ? 429
      : result.errorCode === CARRIER_CREDENTIALS_MISSING ? 503
      : 500;
    return NextResponse.json(result, { status });
  }

  const row = result.shipmentId != null ? await getShipmentById(result.shipmentId, orgId) : null;
  return NextResponse.json({
    ...result,
    shipment: row && {
      trackingNumber: row.tracking_number_normalized,
      carrier: row.carrier,
      latestStatusCategory: row.latest_status_category,
      latestStatusLabel: row.latest_status_label,
      latestEventAt: row.latest_event_at,
      estimatedDeliveryAt: row.estimated_delivery_at,
      deliveredAt: row.delivered_at,
      lastCheckedAt: row.last_checked_at,
      nextCheckAt: row.next_check_at,
      consecutiveErrorCount: row.consecutive_error_count,
      lastErrorMessage: row.last_error_message,
    },
  });
}, { permission: 'shipping.mark_shipped' });
