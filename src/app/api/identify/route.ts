import { NextResponse, after, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api/errors';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { identify, recordIdentifyQueries } from '@/lib/identify/identify';
import { IdentifyRequestSchema } from '@/lib/identify/schema';
import { parseBody } from '@/lib/schemas/parse';

/**
 * POST /api/identify — anything pasted or scanned (one identifier per line)
 * → ranked candidates per line. GET `?q=&context=&limit=` is the same call
 * for probes. Read-only; every call lands in `search_query_log` (surface
 * `identify`), and the opened follow-up posts to `/api/search/opened`.
 */

export const dynamic = 'force-dynamic';

async function run(raw: unknown, ctx: AuthContext, label: string): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const parsed = parseBody(IdentifyRequestSchema, raw);
    if (parsed instanceof NextResponse) return parsed;

    // orgId from the verified session, never the request.
    const result = await identify(ctx.organizationId, parsed);

    after(() =>
      recordIdentifyQueries({
        orgId: ctx.organizationId,
        staffId: ctx.staffId ?? null,
        response: result,
        latencyMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, label);
  }
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams;
    return run(
      {
        q: params.get('q') ?? '',
        ...(params.has('context') ? { context: params.get('context') } : {}),
        ...(params.has('limit') ? { limit: params.get('limit') } : {}),
      },
      ctx,
      'GET /api/identify',
    );
  },
  { permission: 'sku_stock.view' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => run(await req.json().catch(() => null), ctx, 'POST /api/identify'),
  { permission: 'sku_stock.view' },
);
