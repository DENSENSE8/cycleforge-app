import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { qcProcedurePublishBodySchema, qcProceduresQuerySchema, type QcProcedureScope } from '@/lib/qc/contracts';
import { listProcedureVersions, publishProcedure } from '@/lib/qc/procedures';

/** GET /api/qc/procedures?skuCatalogId=|category= — a scope's procedure versions (newest first), whether live steps drifted, draft count. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const query = parseBody(qcProceduresQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    if (query instanceof NextResponse) return query;
    const scope: QcProcedureScope =
      query.skuCatalogId != null ? { skuCatalogId: query.skuCatalogId } : { category: query.category! };
    return NextResponse.json({ data: await listProcedureVersions(ctx.organizationId, scope) });
  },
  { permission: 'tech.view' },
);

/** POST /api/qc/procedures — publish a scope: its draft steps go live and a new version is cut (none when nothing changed). */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const body = parseBody(qcProcedurePublishBodySchema, await req.json().catch(() => ({})));
    if (body instanceof NextResponse) return body;
    const scope: QcProcedureScope =
      body.skuCatalogId != null ? { skuCatalogId: body.skuCatalogId } : { category: body.category! };

    const result = await publishProcedure(ctx.organizationId, ctx.staffId, scope, body.notes ?? null);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { ok: _ok, ...data } = result;

    if (result.changed || result.publishedDrafts > 0) {
      await recordAudit(pool, ctx, req, {
        source: 'qc-procedures-api',
        action: AUDIT_ACTION.QC_PROCEDURE_PUBLISH,
        entityType: AUDIT_ENTITY.QC_PROCEDURE_VERSION,
        entityId: result.version.id,
        method: 'manual',
        after: {
          sku_catalog_id: result.version.skuCatalogId,
          category: result.version.category,
          version: result.version.version,
          supersedes_id: result.version.supersedesId,
          step_count: result.version.steps.length,
          published_drafts: result.publishedDrafts,
        },
      });
    }
    return NextResponse.json({ data }, { status: result.changed ? 201 : 200 });
  },
  { permission: 'sku_stock.manage' },
);
