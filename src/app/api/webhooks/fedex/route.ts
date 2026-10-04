import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseFedExTrackingPayload } from '@/lib/shipping/providers/fedex';
import { getShipmentByTracking, updateShipmentSummary, upsertShipment, upsertTrackingEvents } from '@/lib/shipping/repository';
import { publishShipmentStatusChange } from '@/lib/shipping/publish-on-status-change';
import { resolveWebhookOrgByTracking } from '@/lib/shipping/webhook-org-resolver';
import { checkRateLimitAsync } from '@/lib/api-guard';
import type { OrgId } from '@/lib/tenancy/constants';
import { safeStrEqual } from '@/lib/security/safe-compare';

// FedEx signs each push with an HMAC-SHA256 digest (base64) of the raw request
// body keyed by the security token configured on the webhook project. The
const SIGNATURE_HEADERS = [
  process.env.FEDEX_WEBHOOK_SIGNATURE_HEADER,
  'x-fdx-sc-signature',
  'fdx-signature',
  'x-fedex-signature',
].filter(Boolean) as string[];

/**
 * Verify the request against the webhook project's security token.
 * Verify the request against the webhook project's security token. Prefers
 */
function isAuthorized(req: NextRequest, rawBody: string): boolean {
  const secret =
    process.env.FEDEX_WEBHOOK_SECRET ||
    process.env.FEDEX_WEBHOOK_BEARER ||
    '';

  // Fail closed in production when no secret is configured. Permissive in
  // development/preview so local replay scripts and previews keep working
  // without forcing every dev to set the env var.
  if (!secret) return process.env.NODE_ENV !== 'production';

  // 1. HMAC-SHA256 signature (FedEx's real push mechanism).
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  for (const header of SIGNATURE_HEADERS) {
    const provided = req.headers.get(header);
    if (provided && safeStrEqual(provided, expected)) return true;
  }

  // 2. Static bearer / header secret (manual replay & testing).
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && safeStrEqual(authHeader.slice(7), secret)) return true;
  const replaySecret = req.headers.get('x-webhook-secret');
  if (replaySecret && safeStrEqual(replaySecret, secret)) return true;

  return false;
}

// FedEx Track Notifications deliver `output.completeTrackResults[].trackResults[]`.
// Split each (group, result) pair into its own single-result payload so the
// downstream parser (which only looks at `[0][0]`) processes every package.
function splitIntoTrackResultPayloads(payload: any): any[] {
  const groups = Array.isArray(payload?.output?.completeTrackResults)
    ? payload.output.completeTrackResults
    : payload?.output?.completeTrackResults
      ? [payload.output.completeTrackResults]
      : [];

  if (groups.length === 0) return [payload];

  const out: any[] = [];
  for (const group of groups) {
    const trackResults = Array.isArray(group?.trackResults)
      ? group.trackResults
      : group?.trackResults
        ? [group.trackResults]
        : [];

    if (trackResults.length === 0) {
      out.push({
        ...payload,
        output: {
          ...(payload?.output ?? {}),
          completeTrackResults: [group],
        },
      });
      continue;
    }

    for (const tr of trackResults) {
      out.push({
        ...payload,
        output: {
          ...(payload?.output ?? {}),
          completeTrackResults: [
            {
              ...group,
              trackingNumber: group?.trackingNumber ?? tr?.trackingNumberInfo?.trackingNumber ?? null,
              trackResults: [tr],
            },
          ],
        },
      });
    }
  }

  return out;
}

export async function POST(req: NextRequest) {
  // IP rate limit before any body/crypto work — carrier pushes are bursty but
  // 300/min absorbs a legitimate batch while capping abuse of a public route.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'webhooks-fedex',
    limit: 300,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  // Read the raw body once — HMAC verification must hash the exact bytes FedEx
  // signed, so we can't let req.json() re-serialize first.
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

  const payloads = splitIntoTrackResultPayloads(payload);
  let processed = 0;
  const trackingNumbers: string[] = [];

  for (const sub of payloads) {
    const result = parseFedExTrackingPayload(sub);
    if (!result?.trackingNumberNormalized) continue;

    // Session-less callback:
    const orgId = await resolveWebhookOrgByTracking(result.trackingNumberNormalized);
    if (!orgId) {
      console.warn('[webhook-org] unresolved tracking — skipping event', {
        carrier: 'FEDEX',
        tracking: result.trackingNumberNormalized,
      });
      continue;
    }

    const existing = await getShipmentByTracking(result.trackingNumberNormalized, orgId);
    const shipment = existing ?? await upsertShipment({
      trackingNumberRaw: result.trackingNumberNormalized,
      trackingNumberNormalized: result.trackingNumberNormalized,
      carrier: 'FEDEX',
      sourceSystem: 'fedex_webhook',
    }, orgId);

    const shipmentOrgId = (shipment.organization_id as OrgId | null) ?? orgId;

    await upsertTrackingEvents(
      shipment.id,
      'FEDEX',
      result.trackingNumberNormalized,
      result.events,
      shipmentOrgId,
    );
    const statusCategory = await updateShipmentSummary(shipment.id, result, shipmentOrgId);
    await publishShipmentStatusChange({ shipmentId: shipment.id, source: 'fedex-webhook', trackingNumber: null, carrier: shipment.carrier, statusCategory, orgId: shipmentOrgId });

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
    carrier: 'FEDEX',
    callbackPath: '/api/webhooks/fedex',
  });
}
