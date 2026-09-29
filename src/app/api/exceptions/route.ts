import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { countExceptions, listExceptions, type ExceptionCaller } from '@/lib/exceptions/hub';
import { exceptionKindsOf, parseExceptionDomain, parseExceptionKind, type ExceptionListResponse } from '@/lib/exceptions/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exceptions?domain=&kind=&q=&limit=&cursor= → `ExceptionListResponse`.
 * Auth only: each kind is gated by its own source permission
 * (`EXCEPTION_KIND_PERMISSION`), so a caller who may see no kind gets an empty list.
 *
 * `count_only=1`: no rows — `counts` for the requested kind / domain (else
 * every visible kind), from each source's SQL `count` (with `q`, the list's
 * matched rows), so a badge probe never pays for the row reads.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const sp = req.nextUrl.searchParams;
    const rawDomain = sp.get('domain');
    const rawKind = sp.get('kind');
    const domain = parseExceptionDomain(rawDomain);
    const kind = parseExceptionKind(rawKind);
    if ((rawDomain && !domain) || (rawKind && !kind)) {
      return NextResponse.json({ ok: false, error: 'Unknown domain or kind' }, { status: 400 });
    }
    const caller: ExceptionCaller = { orgId: ctx.organizationId, has: (permission) => ctx.permissions.has(permission) };
    const q = sp.get('q')?.trim() || undefined;
    if (sp.get('count_only') === '1') {
      const kinds = kind ? [kind] : domain ? exceptionKindsOf(domain) : null;
      const body: ExceptionListResponse = { rows: [], counts: await countExceptions(caller, kinds, q ?? null), nextCursor: null };
      return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const limit = sp.get('limit');
    const body = await listExceptions(
      caller,
      {
        domain: domain ?? undefined,
        kind: kind ?? undefined,
        q,
        limit: limit ? Number(limit) : undefined,
        cursor: sp.get('cursor') ?? undefined,
      },
    );
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/exceptions');
  }
});
