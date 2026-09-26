import { NextRequest, NextResponse } from 'next/server';
import {
  applyShipStationTrackEvent,
  resolveOrgByWebhookToken,
  verifyShipStationSignature,
  type ShipStationTrackData,
} from '@/lib/shipping/shipstation/webhook';

export const dynamic = 'force-dynamic';

/** POST /api/webhooks/shipstation/[token] */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Read the RAW body once — the signature is computed over these exact bytes.
  const rawBody = await req.text();

  const orgId = await resolveOrgByWebhookToken(token);
  if (!orgId) {
    // Unknown token — 404 (don't reveal whether the path shape is right).
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const verdict = await verifyShipStationSignature(rawBody, req.headers);
  if (verdict === 'invalid') {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  // 'unsigned' is accepted on the strength of the unguessable token (baseline
  // ShipStation model); 'valid' passed RSA verification.

  let payload: { resource_type?: string; data?: ShipStationTrackData } | null = null;
  try {
    payload = rawBody
      ? (JSON.parse(rawBody) as { resource_type?: string; data?: ShipStationTrackData })
      : null;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  // Only tracking events touch our data; ack everything else so ShipStation
  // doesn't retry.
  const trackData = payload?.resource_type === 'API_TRACK' ? payload.data : undefined;
  if (!trackData) {
    return NextResponse.json({ ok: true, ignored: payload?.resource_type ?? 'unknown' });
  }

  try {
    const applied = await applyShipStationTrackEvent(orgId, trackData);
    return NextResponse.json({ ok: true, matched: applied.matched });
  } catch (err) {
    console.error('[shipstation-webhook] apply failed', err);
    // 200 anyway: a transient apply failure shouldn't trigger endless retries;
    // the poll/sync path reconciles. (Return 500 only if you want retries.)
    return NextResponse.json({ ok: false, error: 'apply failed' });
  }
}
