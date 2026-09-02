import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaWebhookReplayBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { listStoredWebhooks, replayStoredWebhook } from '@/lib/qa/webhook-replay';
import { deliverAuthenticZohoWebhook } from '@/lib/qa/webhook-authentic';
import { startQaTestRun, completeQaTestRun, appendQaTestRunEvent } from '@/lib/qa/test-run';
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
 * POST /api/developer/qa/webhooks — application replay OR provider-authentic
 * signed delivery. The two paths are labeled separately; application replay
 * cannot be presented as authentic.
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

  const authentic = parsed.kind !== 'application';
  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: authentic ? 'webhook_authentic' : 'webhook_replay',
    connectionProvider: 'zoho',
    scenarioId: authentic ? `zoho.authentic.${parsed.kind}` : `zoho.replay.${parsed.mode}`,
  });

  try {
    if (authentic) {
      const delivery = await deliverAuthenticZohoWebhook(ctx.organizationId, {
        eventId: parsed.eventId,
        expect: parsed.kind === 'signature_mismatch' ? 'rejected_signature' : 'accepted',
      });
      const ok = parsed.kind === 'signature_mismatch'
        ? delivery.httpStatus === 401
        : delivery.httpStatus < 500;
      await appendQaTestRunEvent(ctx.organizationId, run.id, {
        provider: 'zoho',
        operation: parsed.kind,
        httpStatus: delivery.httpStatus,
        durationMs: null,
        requestHash: delivery.requestHash,
        errorClass: ok ? null : 'WebhookAuthenticFailed',
        redacted: { ...delivery } as Record<string, unknown>,
      });
      const completed = await completeQaTestRun(ctx.organizationId, run.id, {
        status: ok ? 'passed' : 'failed',
        providerRequestCount: 1,
        internalWrites: delivery.body.deduped === true ? 0 : 1,
        result: { ...delivery } as Record<string, unknown>,
        errorClass: ok ? null : 'WebhookAuthenticFailed',
      });
      await recordAudit(pool, ctx, req, {
        source: 'qa-console',
        action: AUDIT_ACTION.QA_WEBHOOK_AUTHENTIC,
        entityType: AUDIT_ENTITY.QA_TEST_RUN,
        entityId: completed.runId,
        after: {
          runId: completed.runId,
          authentic: true,
          label: delivery.label,
          kind: parsed.kind,
          eventId: parsed.eventId,
          httpStatus: delivery.httpStatus,
        },
      });
      ctx.markAuditWritten();
      return NextResponse.json({ success: true, delivery, run: completed });
    }

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
      errorClass: authentic ? 'WebhookAuthenticFailed' : 'WebhookReplayFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Webhook action failed' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.webhook_replay' });
