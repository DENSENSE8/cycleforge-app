import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getProductManualById,
  setManualSkuCatalogId,
} from '@/lib/neon/product-manuals-queries';
import { resolveOrCreateLineCatalog } from '@/lib/receiving/line-catalog';
import {
  promoteProductManualToDocument,
  unlinkManualDocumentFromSku,
} from '@/lib/documents/manual-documents';

/** Pair / unpair a library manual to the SKU catalog row resolved from a receiving line. */
function lineIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  // .../api/receiving-lines/[id]/manuals → id is segments[-2]
  return Number(segments[segments.length - 2]);
}

async function manualIdFromBody(request: Request): Promise<number> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* tolerate empty */
  }
  return Number(body.manualId);
}

/** Ownership gate for unpair. */
async function manualOwnedByOrg(manualId: number, orgId: OrgId): Promise<boolean> {
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT pm.id
       FROM product_manuals pm
       JOIN sku_catalog sc ON sc.id = pm.sku_catalog_id
      WHERE pm.id = $1 AND pm.is_active = TRUE
        AND sc.organization_id = $2
      LIMIT 1`,
    [manualId, orgId],
  );
  return res.rows.length > 0;
}

export const POST = withAuth(async (request, ctx) => {
  const lineId = lineIdFromPath(request.nextUrl.pathname);
  const manualId = await manualIdFromBody(request);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid line id' }, { status: 400 });
  }
  if (!Number.isFinite(manualId) || manualId <= 0) {
    return NextResponse.json({ ok: false, error: 'manualId is required' }, { status: 400 });
  }

  try {
    const resolved = await resolveOrCreateLineCatalog(lineId, ctx.organizationId);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: 'line not found' }, { status: 404 });
    }
    if (resolved.skuCatalogId == null) {
      return NextResponse.json(
        { ok: false, error: 'could not resolve or create a catalog entry for this SKU' },
        { status: 409 },
      );
    }
    const manual = await setManualSkuCatalogId(manualId, resolved.skuCatalogId, ctx.organizationId);
    if (!manual) {
      return NextResponse.json({ ok: false, error: 'manual not found' }, { status: 404 });
    }
    let documentId: number | null = null;
    try {
      const promoted = await promoteProductManualToDocument(
        ctx.organizationId,
        manualId,
        resolved.skuCatalogId,
      );
      documentId = promoted?.documentId ?? null;
    } catch (promoteErr) {
      console.warn('[POST /api/receiving-lines/[id]/manuals] promote failed:', promoteErr);
    }
    return NextResponse.json({
      ok: true,
      skuCatalogId: resolved.skuCatalogId,
      manual,
      documentId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to pair manual';
    console.error('[POST /api/receiving-lines/[id]/manuals] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'tech',
    action: 'manual.pair',
    entityType: 'product_manual',
    entityId: ({ body }) => (body as { manualId?: number })?.manualId ?? null,
  },
});

export const DELETE = withAuth(async (request, ctx) => {
  const lineId = lineIdFromPath(request.nextUrl.pathname);
  const manualId = await manualIdFromBody(request);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid line id' }, { status: 400 });
  }
  if (!Number.isFinite(manualId) || manualId <= 0) {
    return NextResponse.json({ ok: false, error: 'manualId is required' }, { status: 400 });
  }

  try {
    if (!(await manualOwnedByOrg(manualId, ctx.organizationId))) {
      return NextResponse.json({ ok: false, error: 'manual not found' }, { status: 404 });
    }
    const before = await getProductManualById(manualId, ctx.organizationId);
    const priorCatalogId =
      before?.sku_catalog_id != null && Number(before.sku_catalog_id) > 0
        ? Number(before.sku_catalog_id)
        : null;

    if (priorCatalogId != null) {
      try {
        await unlinkManualDocumentFromSku(ctx.organizationId, manualId, priorCatalogId);
      } catch (unlinkErr) {
        console.warn('[DELETE /api/receiving-lines/[id]/manuals] unlink failed:', unlinkErr);
      }
    }

    const manual = await setManualSkuCatalogId(manualId, null, ctx.organizationId);
    if (!manual) {
      return NextResponse.json({ ok: false, error: 'manual not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, manual });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to unpair manual';
    console.error('[DELETE /api/receiving-lines/[id]/manuals] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'tech',
    action: 'manual.unpair',
    entityType: 'product_manual',
    entityId: ({ body }) => (body as { manualId?: number })?.manualId ?? null,
  },
});
