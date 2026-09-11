import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  IdentificationMethodsUnavailableError,
  publishIdentificationMethod,
} from '@/lib/identification/methods-store';

/**
 * POST /api/identification/methods/[jobId]/publish — human publish.
 */
export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const jobId = decodeURIComponent(segments[segments.length - 2] ?? '').trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job id required' }, { status: 400 });
  }
  try {
    const item = await publishIdentificationMethod(ctx.organizationId, jobId);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    if (err instanceof IdentificationMethodsUnavailableError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'publish failed';
    const status = message === 'not found' ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}, { permission: 'admin.view' });
