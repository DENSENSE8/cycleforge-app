import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaHealthCheckBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { listConnectionHealth, runConnectionHealthChecks } from '@/lib/qa/health';
import { startQaTestRun, completeQaTestRun, appendQaTestRunEvent, hashPayload } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/developer/qa/health — last health snapshots (no live provider call).
 */
export const GET = withAuth(async (_req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  try {
    const connections = await listConnectionHealth(ctx.organizationId);
    return NextResponse.json({ success: true, connections });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to list connection health' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/health — live provider probe (harmless whoami-style).
 * Label in the UI: "Check connection health", never "Test" / "Sync".
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(
    ctx.organizationId,
    ctx.permissions,
    'developer.qa_tools.connection_debug',
  );
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaHealthCheckBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'health_check',
    connectionProvider: parsed.provider ?? null,
    connectionScope: parsed.scope ?? null,
  });

  try {
    const connections = await runConnectionHealthChecks(ctx.organizationId, {
      provider: parsed.provider,
      scope: parsed.scope,
    });

    for (const c of connections) {
      await appendQaTestRunEvent(ctx.organizationId, run.id, {
        provider: c.provider,
        operation: 'connectionHealth',
        httpStatus: c.live?.httpStatus ?? c.lastHttpStatus,
        durationMs: c.live?.latencyMs ?? c.lastLatencyMs,
        requestHash: hashPayload({ provider: c.provider, scope: c.scope }),
        errorClass: c.live?.errorClass ?? c.lastErrorClass,
        redacted: {
          identity: c.identity,
          environment: c.environment,
          scopesFound: c.scopesFound,
          scopesExpected: c.scopesExpected,
          injected: c.live?.injected ?? false,
        },
      });
    }

    const failed = connections.filter((c) => c.live && !c.live.ok);
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: failed.length === 0 ? 'passed' : 'failed',
      providerRequestCount: connections.length,
      errorClass: failed[0]?.live?.errorClass ?? null,
      result: {
        checked: connections.length,
        failed: failed.length,
      },
    });

    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_HEALTH_CHECK,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: { runId: completed.runId, checked: connections.length, failed: failed.length },
    });
    ctx.markAuditWritten();

    return NextResponse.json({ success: true, run: completed, connections });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'HealthCheckFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.connection_debug' });
