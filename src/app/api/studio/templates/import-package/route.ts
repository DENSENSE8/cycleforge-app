import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { errorResponse } from '@/lib/api/errors';
import { hasNode } from '@/lib/workflow';
import { isSurfaceKey } from '@/lib/stations/surface-keys';
import { validateTemplatePackage } from '@/lib/studio/template-package';
import { importTemplatePackage } from '@/lib/studio/import-package';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/**
 * POST /api/studio/templates/import-package
 *
 * Import a CycleForgeTemplatePackage v1 (Template Platform Phase 3). The body IS
 * the package; validateTemplatePackage checks shape + that every referenced
 * node/surface type is REGISTERED (new capabilities need a platform PR, never a
 * package). A valid package is persisted as a non-system template row and cloned
 * into the org via installTemplateIntoOrg — ALWAYS as a draft (custom / import /
 * AI packages never auto-activate); the owner publishes via the human gate.
 *
 * studio.manage — same authoring gate as the other template-import routes.
 * orgId + staffId come from ctx, never the body.
 */
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, ctx) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const validated = validateTemplatePackage(raw, { hasNode, isSurfaceKey });
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: 'invalid template package', details: validated.errors },
      { status: 400 },
    );
  }

  try {
    const outcome = await importTemplatePackage({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      package: validated.package,
    });

    if (outcome.status === 200 && outcome.seeded) {
      await recordAudit(pool, ctx, request, {
        source: 'studio.template.import-package',
        action: AUDIT_ACTION.WORKFLOW_TEMPLATE_IMPORT,
        entityType: AUDIT_ENTITY.WORKFLOW_DEFINITION,
        entityId: outcome.definitionId!,
        method: 'manual',
        extra: {
          via: 'package',
          schemaVersion: validated.package.schemaVersion,
          templateSlug: outcome.templateSlug,
          name: validated.package.metadata.name,
          version: outcome.version,
          nodes: validated.package.graph.nodes.length,
          edges: validated.package.graph.edges.length,
          surfacesSeeded: outcome.surfacesSeeded,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          id: outcome.definitionId,
          version: outcome.version,
          templateSlug: outcome.templateSlug,
          surfacesSeeded: outcome.surfacesSeeded,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: false, error: outcome.reason ?? 'import failed' },
      { status: outcome.status },
    );
  } catch (err) {
    console.error('[POST /api/studio/templates/import-package] error:', err);
    return errorResponse(err, 'studio.template.import-package');
  }
}, { permission: 'studio.manage', feature: 'studio' });
