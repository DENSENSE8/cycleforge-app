import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaJobTriggerBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { listQaJobAttempts, listQaJobs, triggerQaJob } from '@/lib/qa/jobs';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';

/**
 * GET /api/developer/qa/jobs — production cron jobs + last run.
 * Optional ?job= for attempt history.
 */
export const GET = withAuth(async (req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  const job = new URL(req.url).searchParams.get('job');
  try {
    if (job) {
      const attempts = await listQaJobAttempts(job);
      return NextResponse.json({ success: true, job, attempts });
    }
    const jobs = await listQaJobs();
    return NextResponse.json({
      success: true,
      jobs,
      note: 'This stack does not keep a separate pending queue. A job is running, succeeded, or failed. Trigger uses the same cron route production uses.',
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to list jobs' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/jobs — trigger or retry a failed job on the production path.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.execute');
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaJobTriggerBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'job_control',
    scenarioId: parsed.job,
  });

  try {
    const result = await triggerQaJob(new URL(req.url).origin, parsed.job);
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: result.ok ? 'passed' : 'failed',
      jobsCreated: 1,
      result: { intent: parsed.intent, job: parsed.job, trigger: result },
      errorClass: result.ok ? null : 'JobTriggerFailed',
    });
    return NextResponse.json({ success: result.ok, run: completed, trigger: result });
  } catch (err) {
    const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'JobTriggerFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Job trigger failed' },
      { status: Number.isFinite(status) ? status : 500 },
    );
  }
}, { permission: 'developer.qa_tools.execute' });
