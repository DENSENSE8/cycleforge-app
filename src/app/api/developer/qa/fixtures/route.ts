import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaFixtureResetBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { executeFixtureReset, previewFixtureReset } from '@/lib/qa/fixtures/reset';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/developer/qa/fixtures — preview a fixture reset (no writes).
 */
export const GET = withAuth(async (req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  const sp = new URL(req.url).searchParams;
  const scope = (sp.get('scope') as 'scenario' | 'demo' | 'all' | null) ?? 'demo';
  const scenarioId = sp.get('scenarioId');
  const preview = await previewFixtureReset(ctx.organizationId, scope, scenarioId);
  return NextResponse.json({ success: true, preview });
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/fixtures — preview (default) or execute a reset.
 * Execute is step-up + developer.qa_tools.fixture_reset. Never a silent live action.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaFixtureResetBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const gate = await assertQaCapability(
    ctx.organizationId,
    ctx.permissions,
    'developer.qa_tools.fixture_reset',
  );
  if ('denied' in gate) return gate.denied;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: parsed.scope === 'demo' ? 'fixture_reseed' : 'fixture_reset',
    scenarioId: parsed.scenarioId ?? (parsed.scope === 'demo' ? 'fixtures.demo-volume' : null),
  });

  try {
    const result = await executeFixtureReset(ctx.organizationId, parsed.scope, parsed.scenarioId);
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'passed',
      internalWrites: Object.values(result.deleted).reduce((a, b) => a + b, 0),
      result: { deleted: result.deleted, reseedCommand: result.reseedCommand },
    });
    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_FIXTURE_RESET,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: { runId: completed.runId, scope: parsed.scope, deleted: result.deleted },
    });
    ctx.markAuditWritten();
    return NextResponse.json({
      success: true,
      run: completed,
      deleted: result.deleted,
      reseedCommand: result.reseedCommand,
    });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'FixtureResetFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Fixture reset failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.fixture_reset', stepUp: true });
