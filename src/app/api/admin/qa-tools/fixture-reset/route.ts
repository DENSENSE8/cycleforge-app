import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { QaFixtureResetBody } from '@/lib/schemas/qa-tools';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrganizationEnvironment } from '@/lib/tenancy/settings';
import { resolveQaToolsAccess, QA_TOOL_PERMISSIONS } from '@/lib/qa-tools/access';
import { createQaTestRun, updateQaTestRun } from '@/lib/qa-tools/test-runs';
import { tenantPool } from '@/lib/db';
import { reseedQaFixtures } from '@/lib/qa-tools/fixtures';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const organization = await getOrganization(ctx.organizationId);
  if (!organization) {
    return NextResponse.json({ error: 'QA_CONSOLE_UNAVAILABLE' }, { status: 404 });
  }

  const access = resolveQaToolsAccess({
    organizationEnvironment: getOrganizationEnvironment(organization.settings),
    permissions: ctx.permissions,
  });
  if (!access.visible || !access.canResetFixtures) {
    return NextResponse.json({ error: 'QA_FIXTURE_RESET_UNAVAILABLE' }, { status: 403 });
  }

  const parsed = parseBody(QaFixtureResetBody, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;

  const run = await createQaTestRun({
    organizationId: ctx.organizationId,
    actorStaffId: ctx.staffId,
    action: 'fixture_reset',
    scenario: parsed.scenario,
    status: 'running',
  });

  try {
    await reseedQaFixtures(tenantPool, ctx.organizationId, ctx.staffId);
    const finishedRun = await updateQaTestRun(ctx.organizationId, run.id, 'passed', {
      provider: 'cycleforge',
      requestCount: 0,
    });
    return NextResponse.json({ run: finishedRun, status: 'passed' }, { status: 200 });
  } catch {
    const failedRun = await updateQaTestRun(ctx.organizationId, run.id, 'failed');
    return NextResponse.json({ run: failedRun, error: 'QA_FIXTURE_RESET_FAILED' }, { status: 500 });
  }
}, {
  permission: QA_TOOL_PERMISSIONS.fixtureReset,
  stepUp: true,
  audit: {
    source: 'qa_tools',
    action: 'qa_fixture_reset_executed',
    entityType: 'qa_test_run',
    entityId: ({ response }) => {
      const body = response as { run?: { id?: string } } | null;
      return body?.run?.id ?? null;
    },
  },
});
