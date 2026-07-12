import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { errorResponse } from '@/lib/api/errors';
import { parseBody } from '@/lib/schemas/parse';
import { StudioTemplateImportBody } from '@/lib/schemas/studio';
import { installTemplateIntoOrg } from '@/lib/studio/install-template';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/**
 * POST /api/studio/templates/[id]/import
 *
 * Clones a system-owned workflow_templates blueprint into the CALLER's org as a
 * new is_active = FALSE draft workflow_definition (+ nodes + edges) — Studio ST6
 * / Phase E4. Node ids are re-minted (global TEXT PKs); edges remapped through
 * the same map; every cloned row org-stamped (the definition explicitly, the
 * node/edge children via the org-verified workflow_definition_id fk). The owner
 * then edits + publishes it via the existing draft/publish flow.
 *
 * studio.manage (importing creates a draft — same gate as draft creation). The
 * whole clone runs inside withTenantTransaction so it writes ONLY to the
 * caller's org; the template table itself is global and never written here.
 * Returns the new definition id so the client can switch to it (?v=<newId>).
 */
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../api/studio/templates/[id]/import → id is segments[-2]
  const templateId = Number(segments[segments.length - 2]);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid template id' }, { status: 400 });
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    /* empty body = import under the template's own name */
  }
  const parsed = parseBody(StudioTemplateImportBody, raw ?? {});
  if (parsed instanceof NextResponse) return parsed;

  try {
    // Import ALWAYS lands a draft (activate: 'never') — the owner reviews +
    // publishes it via the human gate. Clone + surface-seed run in one tenant tx
    // inside the installer.
    const outcome = await installTemplateIntoOrg({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      templateId,
      name: parsed.name,
      activate: 'never',
    });

    if (outcome.status === 200 && outcome.seeded) {
      await recordAudit(pool, ctx, request, {
        source: 'studio.template.import',
        action: AUDIT_ACTION.WORKFLOW_TEMPLATE_IMPORT,
        entityType: AUDIT_ENTITY.WORKFLOW_DEFINITION,
        entityId: outcome.definitionId!,
        method: 'manual',
        extra: {
          templateId: outcome.templateId,
          templateSlug: outcome.templateSlug,
          name: outcome.name,
          version: outcome.version,
          nodes: outcome.nodes,
          edges: outcome.edges,
          surfacesSeeded: outcome.surfacesSeeded,
        },
      });
      return NextResponse.json(
        { ok: true, id: outcome.definitionId, version: outcome.version, surfacesSeeded: outcome.surfacesSeeded },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: false, error: outcome.reason ?? 'import failed' },
      { status: outcome.status },
    );
  } catch (err) {
    console.error('[POST /api/studio/templates/[id]/import] error:', err);
    return errorResponse(err, 'studio.template.import');
  }
}, { permission: 'studio.manage', feature: 'studio' });
