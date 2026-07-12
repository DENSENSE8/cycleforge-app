import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { errorResponse } from '@/lib/api/errors';
import { parseBody } from '@/lib/schemas/parse';
import { StudioTemplateSubmitBody } from '@/lib/schemas/studio';
import { submitTemplateFromDefinition } from '@/lib/studio/submit-template';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/**
 * POST /api/studio/definitions/[id]/submit
 *
 * Submit one of the org's OWN workflow definitions to the curated public catalog
 * for review (Template Platform Phase 4). This is the mirror of the Phase 3
 * export: it serializes the org's live graph into a CycleForgeTemplatePackage and
 * persists it as a NON-system, review_status='submitted' workflow_templates row
 * stamped with submitted_by_org = ctx.organizationId. It does NOT clone anything
 * into the org (no installTemplateIntoOrg) — submission ≠ install.
 *
 * A curator (studio.catalog.review) later approves → public/approved or rejects.
 * Until then the row is private + invisible to every library read.
 *
 * studio.manage — the org is offering ITS OWN authored graph, the same authoring
 * gate as export/import. orgId comes from ctx, never the body; the definition
 * read is org-scoped so an org can only submit graphs it owns.
 */
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../api/studio/definitions/[id]/submit → id is segments[-2]
  const id = Number(segments[segments.length - 2]);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid definition id' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = parseBody(StudioTemplateSubmitBody, raw ?? {});
  if (parsed instanceof NextResponse) return parsed;

  try {
    const outcome = await submitTemplateFromDefinition({
      orgId: ctx.organizationId,
      definitionId: id,
      metadata: parsed,
    });

    if (outcome.status === 200 && outcome.submitted) {
      await recordAudit(pool, ctx, request, {
        source: 'studio.template.submit',
        action: AUDIT_ACTION.WORKFLOW_TEMPLATE_SUBMIT,
        entityType: AUDIT_ENTITY.WORKFLOW_TEMPLATE,
        entityId: outcome.templateId!,
        method: 'manual',
        extra: {
          definitionId: id,
          templateSlug: outcome.templateSlug,
          name: outcome.package?.metadata.name,
          nodes: outcome.package?.graph.nodes.length ?? 0,
          edges: outcome.package?.graph.edges.length ?? 0,
          requiredNodeTypes: outcome.package?.engineCompat.requiredNodeTypes,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          templateId: outcome.templateId,
          templateSlug: outcome.templateSlug,
          reviewStatus: 'submitted',
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: false, error: outcome.reason ?? 'submit failed' },
      { status: outcome.status },
    );
  } catch (err) {
    console.error('[POST /api/studio/definitions/[id]/submit] error:', err);
    return errorResponse(err, 'studio.template.submit');
  }
}, { permission: 'studio.manage', feature: 'studio' });
