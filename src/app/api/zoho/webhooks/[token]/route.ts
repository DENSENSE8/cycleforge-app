import { NextResponse, type NextRequest } from 'next/server';
import { processZohoWebhook } from '@/lib/zoho/webhooks/process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ token: string }> };

/** Per-tenant Zoho webhook receiver (Wave 3, production multi-tenant path). */
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  return processZohoWebhook(request, { token });
}

/** Health check — does NOT reveal whether the token is valid (opaque on purpose). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    receiver: '/api/zoho/webhooks/{token}',
    mode: 'per-tenant (token-resolved org + per-org signing secret)',
  });
}
