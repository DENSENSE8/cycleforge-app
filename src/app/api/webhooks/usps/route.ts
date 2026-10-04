/** POST /api/webhooks/usps — USPS Tracking 3.2 webhook receiver. */

import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseUSPSTrackingPayload } from '@/lib/shipping/providers/usps';
import { getShipmentByTracking, updateShipmentSummary, upsertShipment, upsertTrackingEvents } from '@/lib/shipping/repository';
import { logger } from '@/lib/observability/logger';
import { publishShipmentStatusChange } from '@/lib/shipping/publish-on-status-change';
import { resolveWebhookOrgByTracking } from '@/lib/shipping/webhook-org-resolver';
import { checkRateLimitAsync } from '@/lib/api-guard';
import type { OrgId } from '@/lib/tenancy/constants';
import { safeStrEqual } from '@/lib/security/safe-compare';

// USPS may echo the shared secret in a header, or sign the body. Header names
// aren't pinned down publicly; check known variants + an override.
const SECRET_HEADERS = [
  process.env.USPS_WEBHOOK_SECRET_HEADER,
  'x-usps-secret',
  'x-usps-credential',
].filter(Boolean) as string[];

/** Verify the request against USPS_WEBHOOK_SECRET. */
function isAuthorized(req: NextRequest, rawBody: string, parsed: any): boolean {
  const secret =
    process.env.USPS_WEBHOOK_SECRET ||
    process.env.USPS_WEBHOOK_BEARER ||
    '';

  if (!secret) return process.env.NODE_ENV !== 'production';

  // 1. HMAC-SHA256 signature over the raw body.
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const sigHeader = req.headers.get(process.env.USPS_WEBHOOK_SIGNATURE_HEADER || 'x-usps-signature');
  if (sigHeader && safeStrEqual(sigHeader, expected)) return true;

  // 2. Shared-secret echo header.
  for (const header of SECRET_HEADERS) {
    const provided = req.headers.get(header);
    if (provided && safeStrEqual(provided, secret)) return true;
  }

  // 3. Shared secret echoed in the body (we send `sharedSecret` on subscribe).
  if (parsed?.sharedSecret && safeStrEqual(String(parsed.sharedSecret), secret)) return true;

  // 4. Static bearer / header secret (manual replay & testing).
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && safeStrEqual(authHeader.slice(7), secret)) return true;
  const replaySecret = req.headers.get('x-webhook-secret');
  if (replaySecret && safeStrEqual(replaySecret, secret)) return true;

  return false;
}

// USPS may deliver one notification or many. Normalise to an array of
// individually-parseable payloads. Handles: top-level array, `{notifications:[]}`,
// `{trackingNotifications:[]}`, or a single object.
function splitIntoNotifications(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  const list = payload?.notifications ?? payload?.trackingNotifications ?? payload?.events;
  if (Array.isArray(list)) return list;
  return [payload];
}

export async function POST(req: NextRequest) {
  // IP rate limit before any body/crypto work — carrier pushes are bursty but
  // 300/min absorbs a legitimate batch while capping abuse of a public route.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'webhooks-usps',
    limit: 300,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  const rawBody = await req.text();

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isAuthorized(req, rawBody, payload)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const notifications = splitIntoNotifications(payload);
  let processed = 0;
  const trackingNumbers: string[] = [];

  for (const note of notifications) {
    const result = parseUSPSTrackingPayload(note);
    if (!result?.trackingNumberNormalized) continue;

    // Session-less callback:
    const orgId = await resolveWebhookOrgByTracking(result.trackingNumberNormalized);
    if (!orgId) {
      console.warn('[webhook-org] unresolved tracking — skipping event', {
        carrier: 'USPS',
        tracking: result.trackingNumberNormalized,
      });
      continue;
    }

    const existing = await getShipmentByTracking(result.trackingNumberNormalized, orgId);
    const shipment = existing ?? await upsertShipment({
      trackingNumberRaw: result.trackingNumberNormalized,
      trackingNumberNormalized: result.trackingNumberNormalized,
      carrier: 'USPS',
      sourceSystem: 'usps_webhook',
    }, orgId);

    const shipmentOrgId = (shipment.organization_id as OrgId | null) ?? orgId;

    await upsertTrackingEvents(
      shipment.id,
      'USPS',
      result.trackingNumberNormalized,
      result.events,
      shipmentOrgId,
    );
    const statusCategory = await updateShipmentSummary(shipment.id, result, shipmentOrgId);
    await publishShipmentStatusChange({ shipmentId: shipment.id, source: 'usps-webhook', trackingNumber: null, carrier: shipment.carrier, statusCategory, orgId: shipmentOrgId });

    processed += 1;
    trackingNumbers.push(result.trackingNumberNormalized);
  }

  logger.info({ received: notifications.length, processed, trackingNumbers }, '[webhook.usps]');

  return NextResponse.json({ ok: true, processed, trackingNumbers });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    carrier: 'USPS',
    callbackPath: '/api/webhooks/usps',
  });
}
