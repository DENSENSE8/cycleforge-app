import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Retired tokenless endpoint. Webhook deliveries must use the tenant-specific
 * URL so tenant resolution and signature verification share one vault record.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'tokenized webhook endpoint required' },
    { status: 410 },
  );
}

/**
 * Discovery response for stale integrations. It does not expose configuration.
 */
export async function GET() {
  return NextResponse.json({
    ok: false,
    receiver: '/api/zoho/webhooks',
    mode: 'retired; use /api/zoho/webhooks/{token}',
  }, { status: 410 });
}
