import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaScenarioRunBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { listQaScenarios, type QaScenarioFamily } from '@/lib/qa/scenarios/registry';
import { describeScenario } from '@/lib/qa/scenarios/runners';
import { runScenarioSuite } from '@/lib/qa/scenarios/run';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/developer/qa/scenarios — named catalog with runner + Playwright metadata.
 */
export const GET = withAuth(async (req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  const family = new URL(req.url).searchParams.get('family') as QaScenarioFamily | null;
  const scenarios = listQaScenarios(family || undefined)
    .map((s) => describeScenario(s.id))
    .filter((s): s is NonNullable<typeof s> => s != null);
  return NextResponse.json({ success: true, scenarios });
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/scenarios — run one scenario or a suite.
 * Deterministic cases need no provider secrets. qa-org / all persist traces.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.execute');
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaScenarioRunBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const ledger = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'scenario',
    scenarioId: parsed.scenarioId ?? `suite:${parsed.suite}`,
  });

  try {
    const report = await runScenarioSuite({
      suite: parsed.suite,
      ids: parsed.scenarioId ? [parsed.scenarioId] : undefined,
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      persist: true,
    });
    const completed = await completeQaTestRun(ctx.organizationId, ledger.id, {
      status: report.failed > 0 ? 'failed' : 'passed',
      result: report,
      errorClass: report.failed > 0 ? 'ScenarioSuiteFailed' : null,
    });
    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_SCENARIO_RUN,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: {
        runId: completed.runId,
        suite: report.suite,
        passed: report.passed,
        failed: report.failed,
        readyForRelease: report.readyForRelease,
      },
    });
    ctx.markAuditWritten();
    return NextResponse.json({ success: report.failed === 0, report, run: completed });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, ledger.id, {
      status: 'failed',
      errorClass: 'ScenarioSuiteFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Scenario run failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.execute' });
