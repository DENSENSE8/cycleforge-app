import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaFailureInjectionBody } from '@/lib/schemas/qa-console';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import {
  clearAllFailureInjections,
  clearFailureInjection,
  createFailureInjection,
  listFailureInjections,
} from '@/lib/qa/failure-injection';
import { startQaTestRun, completeQaTestRun } from '@/lib/qa/test-run';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/developer/qa/injections — active (unexpired) failure profiles.
 */
export const GET = withAuth(async (_req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;
  const injections = await listFailureInjections(ctx.organizationId);
  return NextResponse.json({ success: true, injections });
}, { permission: 'developer.qa_tools.view' });

/**
 * POST /api/developer/qa/injections — set the next provider failure.
 * Body `{ clear: true, id? }` expires one or all instead of creating.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gate = await assertQaCapability(
    ctx.organizationId,
    ctx.permissions,
    'developer.qa_tools.execute',
  );
  if ('denied' in gate) return gate.denied;

  const raw = await req.json().catch(() => ({}));
  if (raw && typeof raw === 'object' && (raw as { clear?: boolean }).clear) {
    const id = typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : null;
    const cleared = id
      ? Number(await clearFailureInjection(ctx.organizationId, id))
      : await clearAllFailureInjections(ctx.organizationId);
    return NextResponse.json({ success: true, cleared });
  }

  const parsed = parseBody(QaFailureInjectionBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const run = await startQaTestRun({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    kind: 'failure_inject',
    connectionProvider: parsed.provider,
    connectionScope: parsed.scope ?? null,
  });

  try {
    const injection = await createFailureInjection({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      provider: parsed.provider,
      scope: parsed.scope,
      profile: parsed.profile,
      retryAfterSeconds: parsed.retryAfterSeconds,
      remainingUses: parsed.remainingUses,
      ttlSeconds: parsed.ttlSeconds,
      notes: parsed.notes,
    });
    const completed = await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'passed',
      result: {
        provider: injection.provider,
        profile: injection.profile,
        expiresAt: injection.expiresAt,
        remainingUses: injection.remainingUses,
      },
    });
    await recordAudit(pool, ctx, req, {
      source: 'qa-console',
      action: AUDIT_ACTION.QA_FAILURE_INJECT,
      entityType: AUDIT_ENTITY.QA_TEST_RUN,
      entityId: completed.runId,
      after: {
        runId: completed.runId,
        provider: injection.provider,
        profile: injection.profile,
        expiresAt: injection.expiresAt,
      },
    });
    ctx.markAuditWritten();
    return NextResponse.json({ success: true, injection, run: completed }, { status: 201 });
  } catch (err) {
    await completeQaTestRun(ctx.organizationId, run.id, {
      status: 'failed',
      errorClass: 'FailureInjectFailed',
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to set injection' },
      { status: 500 },
    );
  }
}, { permission: 'developer.qa_tools.execute' });
