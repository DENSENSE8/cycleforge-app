/**
 * POST /api/receiving-lines/incoming/check-zoho-received
 *
 * Manual Incoming tool: paste tracking numbers → classify each as received
 * in Zoho vs not received (mirror-first, live Zoho fallback). Read-only.
 *
 * Body: { trackings: string | string[] }
 * Gated `receiving.view` to match Incoming toolbar siblings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { CheckZohoReceivedBody } from '@/lib/schemas/check-zoho-received';
import { checkZohoReceived } from '@/lib/receiving/check-zoho-received';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(CheckZohoReceivedBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await checkZohoReceived(ctx.organizationId, parsed.trackings);
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'check-zoho-received failed';
    console.error('incoming/check-zoho-received POST failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'receiving.view' });
