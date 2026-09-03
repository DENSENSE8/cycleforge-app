import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaDryRunBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { executeImportOperation, previewImportOperation, QaExecuteRefused } from '@/lib/qa/preview-import';
import { startQaTestRun, completeQaTestRun, appendQaTestRunEvent } from '@/lib/qa/test-run';
import { hashPayload } from '@/lib/qa/test-run-id';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * POST /api/developer/qa/dry-run — preview (default) or execute after preview.
 * Preview uses the production normalizer with no writes. Execute is buyer
 * import only, SANDBOX eBay app only, and requires confirmExecute.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.execute');
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaDryRunBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const isExecute = parsed.mode === 'execute';
  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: isExecute ? 'import_execute' : 'dry_run',
    scenarioId: parsed.operation,
    connectionProvider: 'ebay',
  });

  try {
    if (isExecute) {
      const executed = await executeImportOperation(ctx.organizationId, parsed.operation);
      await appendQaTestRunEvent(ctx.organizationId, run.id, {
        provider: 'ebay',
        operation: parsed.operation,
        httpStatus: 200,
        durationMs: null,
        requestHash: hashPayload(executed),
        errorClass: null,
        redacted: { mode: 'execute', ...executed },
      });
      const completed = await completeQaTestRun(ctx.organizationId, run.id, {
        status: executed.errors.length ? 'failed' : 'passed',
        providerRequestCount: 1,
        internalWrites: executed.ingested,
        result: executed,
        errorClass: executed.errors.length ? 'ImportExecutePartial' : null,
      });
      await recordAudit(pool, ctx, req, {
        source: 'qa-console',
        action: AUDIT_ACTION.QA_IMPORT_EXECUTE,
        entityType: AUDIT_ENTITY.QA_TEST_RUN,
        entityId: completed.runId,
        after: { runId: completed.runId, operation: parsed.operation, preview: false, confirmExecute: true },
      });
      ctx.markAuditWritten();
      return NextResponse.json({ success: true, executed, run: completed });
    }

    const preview = await previewImportOperation(ctx.organizationId, parsed.operation);
    await appendQaTestRunEvent(ctx.organizationId, run.id, {
      provider: 'ebay',
      operation: parsed.operation,
      httpStatus: 200,
      durationMs: null,
      requestHash: hashPayload(preview),
      errorClass: null,
      redacted: { mode: 'preview', ...preview },
    });
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
    const refused = err instanceof QaExecuteRefused;
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: refused ? 'QaExecuteRefused' : isExecute ? 'ImportExecuteFailed' : 'DryRunFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Dry-run failed' },
      { status: refused ? 400 : 500 },
    );
  }
}, { permission: 'developer.qa_tools.execute' });
