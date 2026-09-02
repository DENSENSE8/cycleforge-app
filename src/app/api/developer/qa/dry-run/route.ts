import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaDryRunBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { previewImportOperation } from '@/lib/qa/preview-import';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * POST /api/developer/qa/dry-run — preview an import using the production
 * normalizer. No writes. Default sequence for dangerous ops: preview → approve → execute.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.execute');
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaDryRunBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'dry_run',
    scenarioId: parsed.operation,
    connectionProvider: 'ebay',
  });

  try {
    const preview = await previewImportOperation(ctx.organizationId, parsed.operation);
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'passed',
      providerRequestCount: preview.wouldCall.length,
      result: preview,
    });
    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_DRY_RUN,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: { runId: completed.runId, operation: parsed.operation, preview: true },
    });
    ctx.markAuditWritten();
    return NextResponse.json({ success: true, preview, run: completed });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'DryRunFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Dry-run failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.execute' });
