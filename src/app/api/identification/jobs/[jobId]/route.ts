import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getIdentificationJob } from '@/lib/identification/jobs';
import { loadPublishedIdentificationMethods } from '@/lib/identification/load-published';

/**
 * GET /api/identification/jobs/[jobId]
 *
 * House records always resolve. Tenant records only when published for this org.
 * Unknown id → 404 (getIdentificationJob null).
 */
export const GET = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const jobId = decodeURIComponent(segments[segments.length - 1] ?? '').trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job id required' }, { status: 400 });
  }

  const house = getIdentificationJob(jobId, []);
  if (house) {
    return NextResponse.json({
      ok: true,
      job: {
        id: house.id,
        origin: house.origin,
        entityKind: house.entityKind,
        mutate: house.mutate,
        claimPath: house.claimPath('{entityId}').replace(encodeURIComponent('{entityId}'), '{entityId}'),
        sessionPath: house.sessionPath('{entityId}').replace(encodeURIComponent('{entityId}'), '{entityId}'),
      },
    });
  }

  const methods = await loadPublishedIdentificationMethods(ctx.organizationId);
  const compiled = methods.find((m) => m.record.id === jobId);
  const tenant = compiled ? getIdentificationJob(jobId, [compiled.record]) : null;
  if (!compiled || !tenant) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    job: {
      id: tenant.id,
      origin: tenant.origin,
      entityKind: tenant.entityKind,
      mutate: tenant.mutate,
      claimPath: compiled.grammar.claimPath,
      sessionPath: compiled.grammar.sessionPath,
    },
  });
}, { permission: 'orders.view' });
