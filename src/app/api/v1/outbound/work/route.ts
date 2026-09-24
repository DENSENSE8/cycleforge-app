import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listOutboundWork } from '@/lib/outbound/work-projection';
import { outboundWorkQuerySchema } from '@/lib/outbound/work-contract';

export const runtime = 'nodejs';

/**
 * Native and Swift clients receive this server-owned projection only. The
 * active organization comes from the verified session, never the request.
 */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = outboundWorkQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid outbound work query.' } }, { status: 400 });
  return NextResponse.json({ data: await listOutboundWork(ctx.organizationId, parsed.data) }, { headers: { 'cache-control': 'no-store' } });
}, { permission: 'orders.view' });
