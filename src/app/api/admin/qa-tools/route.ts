import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { hasStepUp } from '@/lib/auth/stepup';
import { rolesIncludeAdmin } from '@/lib/auth/permissions';
import { parseBody } from '@/lib/schemas/parse';
import { QaRunCreateBody } from '@/lib/schemas/qa-tools';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrganizationEnvironment } from '@/lib/tenancy/settings';
import { resolveQaToolsAccess, QA_TOOL_PERMISSIONS } from '@/lib/qa-tools/access';
import { createQaTestRun, listQaTestRuns, updateQaTestRun } from '@/lib/qa-tools/test-runs';
import { tenantPool } from '@/lib/db';
import { reseedQaFixtures } from '@/lib/qa-tools/fixtures';
import { checkQaProviderHealth } from '@/lib/qa-tools/health';
import { qaReplayRequiresDestructivePermission, replayQaZohoWebhook } from '@/lib/qa-tools/replay';

function notSandboxResponse(): NextResponse {
  return NextResponse.json({ error: 'QA_CONSOLE_UNAVAILABLE' }, { status: 404 });
}

export const GET = withAuth(async (_req, ctx) => {
  const organization = await getOrganization(ctx.organizationId);
  if (!organization) return notSandboxResponse();

  const access = resolveQaToolsAccess({
    organizationEnvironment: getOrganizationEnvironment(organization.settings),
    permissions: ctx.permissions,
  });
  if (!access.visible) return notSandboxResponse();

  const runs = await listQaTestRuns(ctx.organizationId);
  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      environment: getOrganizationEnvironment(organization.settings),
    },
    capabilities: {
      canExecute: access.canExecute,
      canResetFixtures: access.canResetFixtures,
      canDestructive: access.canDestructive,
    },
    runs,
  });
}, { permission: QA_TOOL_PERMISSIONS.view });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const organization = await getOrganization(ctx.organizationId);
  if (!organization) return notSandboxResponse();

  const access = resolveQaToolsAccess({
    organizationEnvironment: getOrganizationEnvironment(organization.settings),
    permissions: ctx.permissions,
  });
  if (!access.visible || !access.canExecute) {
    return NextResponse.json({ error: 'QA_ACTION_UNAVAILABLE' }, { status: 403 });
  }

  const parsed = parseBody(QaRunCreateBody, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;

  if (parsed.action === 'webhook_replay') {
    if (!parsed.replay) {
      return NextResponse.json({ error: 'QA_REPLAY_INPUT_REQUIRED' }, { status: 400 });
    }
    if (qaReplayRequiresDestructivePermission(parsed.replay.eventType) && !access.canDestructive) {
      return NextResponse.json({ error: 'QA_DESTRUCTIVE_ACTION_UNAVAILABLE' }, { status: 403 });
    }
    if (
      qaReplayRequiresDestructivePermission(parsed.replay.eventType)
      && !rolesIncludeAdmin(ctx.user.roles)
      && !(await hasStepUp(ctx.session.sid, QA_TOOL_PERMISSIONS.destructive))
    ) {
      return NextResponse.json({ error: 'STEPUP_REQUIRED', scope: QA_TOOL_PERMISSIONS.destructive }, { status: 403 });
    }
  }

  const run = await createQaTestRun({
    organizationId: ctx.organizationId,
    actorStaffId: ctx.staffId,
    action: parsed.action,
    scenario: parsed.scenario,
    status: parsed.action === 'fixture_reseed' || parsed.action === 'health_check' || parsed.action === 'webhook_replay' ? 'running' : 'requested',
    metadata: parsed.provider ? { provider: parsed.provider } : undefined,
  });

  if (parsed.action === 'fixture_reseed') {
    try {
      await reseedQaFixtures(tenantPool, ctx.organizationId, ctx.staffId);
      const finishedRun = await updateQaTestRun(ctx.organizationId, run.id, 'passed', {
        provider: 'cycleforge',
        requestCount: 0,
      });
      return NextResponse.json({ run: finishedRun }, { status: 200 });
    } catch {
      const failedRun = await updateQaTestRun(ctx.organizationId, run.id, 'failed');
      return NextResponse.json({ run: failedRun, error: 'QA_FIXTURE_RESEED_FAILED' }, { status: 500 });
    }
  }

  if (parsed.action === 'health_check') {
    try {
      const health = await checkQaProviderHealth(req, parsed.provider ?? 'zoho');
      const finishedRun = await updateQaTestRun(ctx.organizationId, run.id, health.ok ? 'passed' : 'failed', {
        provider: health.provider,
        ok: health.ok,
        connected: health.connected,
        httpStatus: health.httpStatus,
        durationMs: health.durationMs,
      });
      return NextResponse.json({
        run: finishedRun,
        health: {
          provider: health.provider,
          ok: health.ok,
          connected: health.connected,
          httpStatus: health.httpStatus,
          durationMs: health.durationMs,
        },
      }, { status: 200 });
    } catch {
      const failedRun = await updateQaTestRun(ctx.organizationId, run.id, 'failed', {
        provider: parsed.provider ?? 'zoho',
      });
      return NextResponse.json({ run: failedRun, error: 'QA_PROVIDER_HEALTH_FAILED' }, { status: 502 });
    }
  }

  if (parsed.action === 'webhook_replay') {
    try {
      const replay = await replayQaZohoWebhook(ctx.organizationId, parsed.replay!);
      const finishedRun = await updateQaTestRun(ctx.organizationId, run.id, 'passed', {
        provider: 'zoho',
        ok: true,
        correlationId: replay.eventId,
        requestCount: replay.deduped ? 0 : 1,
      });
      return NextResponse.json({ run: finishedRun, replay }, { status: 200 });
    } catch {
      const failedRun = await updateQaTestRun(ctx.organizationId, run.id, 'failed', {
        provider: 'zoho',
        ok: false,
      });
      return NextResponse.json({ run: failedRun, error: 'QA_WEBHOOK_REPLAY_FAILED' }, { status: 502 });
    }
  }

  return NextResponse.json({ run }, { status: 201 });
}, {
  permission: QA_TOOL_PERMISSIONS.execute,
  audit: {
    source: 'qa_tools',
    action: 'qa_run_executed',
    entityType: 'qa_test_run',
    entityId: ({ response }) => {
      const body = response as { run?: { id?: string } } | null;
      return body?.run?.id ?? null;
    },
  },
});
