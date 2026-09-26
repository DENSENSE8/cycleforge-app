import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { errorResponse } from '@/lib/api/errors';
import { parseBody } from '@/lib/schemas/parse';
import { OnboardingTemplateChooseBody } from '@/lib/schemas/studio';
import { installTemplateIntoOrg } from '@/lib/studio/install-template';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/** POST /api/onboarding/template */
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, ctx) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = parseBody(OnboardingTemplateChooseBody, raw ?? {});
  if (parsed instanceof NextResponse) return parsed;

  try {
    const outcome = await installTemplateIntoOrg({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      templateId: parsed.templateId,
      activate: 'if_system',
    });

    if (outcome.status === 200 && outcome.seeded) {
      await recordAudit(pool, ctx, request, {
        source: 'onboarding.template',
        action: AUDIT_ACTION.WORKFLOW_TEMPLATE_IMPORT,
        entityType: AUDIT_ENTITY.WORKFLOW_DEFINITION,
        entityId: outcome.definitionId!,
        method: 'manual',
        extra: {
          via: 'onboarding-chooser',
          templateId: outcome.templateId,
          templateSlug: outcome.templateSlug,
          name: outcome.name,
          version: outcome.version,
          nodes: outcome.nodes,
          edges: outcome.edges,
          surfacesSeeded: outcome.surfacesSeeded,
          activated: outcome.activated,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          definitionId: outcome.definitionId,
          surfacesSeeded: outcome.surfacesSeeded,
          activated: outcome.activated,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: false, error: outcome.reason ?? 'install failed' },
      { status: outcome.status },
    );
  } catch (err) {
    console.error('[POST /api/onboarding/template] error:', err);
    return errorResponse(err, 'onboarding.template');
  }
}, { permission: 'studio.manage', feature: 'studio' });
