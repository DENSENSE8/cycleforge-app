import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaWebhookReplayBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { listStoredWebhooks, replayStoredWebhook } from '@/lib/qa/webhook-replay';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/developer/qa/webhooks — stored Zoho webhook deliveries (redacted).
 */
export const GET = withAuth(async (_req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;
  try {
    const events = await listStoredWebhooks(ctx.organizationId);
    return NextResponse.json({
      success: true,
      authentic: false,
      label: 'Stored payloads for application replay — not provider-authentic',
      events,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to list stored webhooks' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/webhooks — application replay against the handler.
 * Requires acknowledgeApplicationReplay: true so the UI cannot pretend this
 * is a provider-authentic delivery.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(
    ctx.organizationId,
    ctx.permissions,
    'developer.qa_tools.webhook_replay',
  );
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(QaWebhookReplayBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'webhook_replay',
    connectionProvider: 'zoho',
    scenarioId: `zoho.replay.${parsed.mode}`,
  });

  try {
    const replay = await replayStoredWebhook(ctx.organizationId, {
      eventId: parsed.eventId,
      mode: parsed.mode,
      modifyNonSecretFields: parsed.modifyNonSecretFields,
    });
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'passed',
      internalWrites: replay.attempts.length,
      result: replay,
    });
    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_WEBHOOK_REPLAY,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: {
        runId: completed.runId,
        authentic: false,
        label: replay.label,
        mode: replay.mode,
        eventId: parsed.eventId,
      },
    });
    ctx.markAuditWritten();
    return NextResponse.json({ success: true, replay, run: completed });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'WebhookReplayFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Application replay failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.webhook_replay' });
