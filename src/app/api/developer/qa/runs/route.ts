import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { getQaTestRun, listQaTestRuns } from '@/lib/qa/test-run';

/**
 * GET /api/developer/qa/runs — test-run ledger (redacted).
 * Optional ?id=<run_id> for one run + events.
 */
export const GET = withAuth(async (req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  const id = new URL(req.url).searchParams.get('id');
  try {
    if (id) {
      const detail = await getQaTestRun(ctx.organizationId, id);
      if (!detail) {
        return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
      }
      return NextResponse.json({ success: true, ...detail });
    }
    const runs = await listQaTestRuns(ctx.organizationId);
    return NextResponse.json({ success: true, runs });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load runs' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.view' });
