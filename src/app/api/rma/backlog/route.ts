import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listDispositionBacklog } from '@/lib/rma/authorizations';

/** GET /api/rma/backlog */
export const GET = withAuth(async (request, ctx) => {
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limitParsed = limitRaw != null ? Number(limitRaw) : NaN;
  const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 500) : 100;

  const backlog = await listDispositionBacklog(ctx.organizationId, limit);
  return NextResponse.json({ ok: true, backlog });
}, { permission: 'rma.view' });
