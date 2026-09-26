import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseUPSTrackingPayload } from '@/lib/shipping/providers/ups';
import { getShipmentByTracking, updateShipmentSummary, upsertShipment, upsertTrackingEvents } from '@/lib/shipping/repository';
import { publishShipmentStatusChange } from '@/lib/shipping/publish-on-status-change';
import { resolveWebhookOrgByTracking } from '@/lib/shipping/webhook-org-resolver';
import { checkRateLimitAsync } from '@/lib/api-guard';
import type { OrgId } from '@/lib/tenancy/constants';
import { safeStrEqual } from '@/lib/security/safe-compare';

// UPS authenticates callbacks via the credential we registered on the subscription, echoed back in a header.
const CREDENTIAL_HEADERS = [
  process.env.UPS_WEBHOOK_CREDENTIAL_HEADER,
  'credential',
  'x-ups-credential',
].filter(Boolean) as string[];

function isAuthorized(req: NextRequest, rawBody: string): boolean {
  const secret =
    process.env.UPS_WEBHOOK_SECRET ||
    process.env.UPS_WEBHOOK_BEARER ||
    '';

  // Fail closed in production when no secret is configured. Permissive in
  // development/preview so local replay scripts and previews keep working
  // without forcing every dev to set the env var.
  if (!secret) return process.env.NODE_ENV !== 'production';

  // 1. Credential echo (UPS's documented callback auth).
  for (const header of CREDENTIAL_HEADERS) {
    const provided = req.headers.get(header);
    if (provided && safeStrEqual(provided, secret)) return true;
  }

  // 2. HMAC-SHA256 signature over the raw body (parity with FedEx).
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const sig = req.headers.get('x-ups-signature');
  if (sig && safeStrEqual(sig, expected)) return true;

  // 3. Static bearer / header secret (manual replay & testing).
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && safeStrEqual(authHeader.slice(7), secret)) return true;
  const replaySecret = req.headers.get('x-webhook-secret');
  if (replaySecret && safeStrEqual(replaySecret, secret)) return true;

  return false;
}

function splitIntoPackagePayloads(payload: any): any[] {
  const shipments = Array.isArray(payload?.trackResponse?.shipment)
    ? payload.trackResponse.shipment
    : payload?.trackResponse?.shipment
      ? [payload.trackResponse.shipment]
      : [];

  if (shipments.length === 0) return [payload];

  const packagePayloads: any[] = [];
  for (const shipment of shipments) {
    const packages = Array.isArray(shipment?.package)
      ? shipment.package
      : shipment?.package
        ? [shipment.package]
        : [];

    if (packages.length === 0) {
      packagePayloads.push(payload);
      continue;
    }

    for (const pkg of packages) {
      packagePayloads.push({
        ...payload,
        trackResponse: {
          ...(payload?.trackResponse ?? {}),
          shipment: [
            {
              ...shipment,
              package: [pkg],
            },
          ],
        },
      });
    }
  }

  return packagePayloads;
}

export async function POST(req: NextRequest) {
  // IP rate limit before any body/crypto work — carrier pushes are bursty but
  // 300/min absorbs a legitimate batch while capping abuse of a public route.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'webhooks-ups',
    limit: 300,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  // Read the raw body once so HMAC verification hashes the exact bytes UPS sent.
  const rawBody = await req.text();

  if (!isAuthorized(req, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const packagePayloads = splitIntoPackagePayloads(payload);
  let processed = 0;
  const trackingNumbers: string[] = [];

  for (const packagePayload of packagePayloads) {
    const result = parseUPSTrackingPayload(packagePayload);
    if (!result?.trackingNumberNormalized) continue;

    // Session-less callback:
    const orgId = await resolveWebhookOrgByTracking(result.trackingNumberNormalized);
    if (!orgId) {
      console.warn('[webhook-org] unresolved tracking — skipping event', {
        carrier: 'UPS',
        tracking: result.trackingNumberNormalized,
      });
      continue;
    }

    const existing = await getShipmentByTracking(result.trackingNumberNormalized, orgId);
    const shipment = existing ?? await upsertShipment({
      trackingNumberRaw: result.trackingNumberNormalized,
      trackingNumberNormalized: result.trackingNumberNormalized,
      carrier: 'UPS',
      sourceSystem: 'ups_webhook',
    }, orgId);

    // Pin every downstream write to the SHIPMENT ROW's real owner, not the hardcoded transitional org.
    const shipmentOrgId = (shipment.organization_id as OrgId | null) ?? orgId;

    await upsertTrackingEvents(
      shipment.id,
      'UPS',
      result.trackingNumberNormalized,
      result.events,
      shipmentOrgId
    );
    await updateShipmentSummary(shipment.id, result, shipmentOrgId);
    // Pass trackingNumber=null to preserve the pre-migration published payload
    // shape (it was undefined before); only orgId scoping is added here.
    await publishShipmentStatusChange(shipment.id, 'ups-webhook', null, shipmentOrgId);

    processed += 1;
    trackingNumbers.push(result.trackingNumberNormalized);
  }

  return NextResponse.json({
    ok: true,
    processed,
    trackingNumbers,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    carrier: 'UPS',
    callbackPath: '/api/webhooks/ups',
  });
}
