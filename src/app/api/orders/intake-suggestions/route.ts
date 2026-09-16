import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOutboundIntakeSuggestions } from '@/lib/ecwid/outbound-intake-suggestions';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const kindRaw = request.nextUrl.searchParams.get('kind')?.trim() ?? 'orders';
  if (query.length > 160) {
    return NextResponse.json({ success: false, error: 'Search is limited to 160 characters.' }, { status: 400 });
  }
  if (kindRaw !== 'orders' && kindRaw !== 'products') {
    return NextResponse.json({ success: false, error: 'kind must be orders or products.' }, { status: 400 });
  }

  try {
    const result = await getOutboundIntakeSuggestions(ctx.organizationId as OrgId, {
      query,
      kind: kindRaw,
      limit: Number(request.nextUrl.searchParams.get('limit') ?? 12),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[orders/intake-suggestions] Ecwid lookup failed', error);
    return NextResponse.json({ success: false, error: 'Ecwid suggestions are unavailable right now.' }, { status: 502 });
  }
}, { permission: 'orders.create' });
