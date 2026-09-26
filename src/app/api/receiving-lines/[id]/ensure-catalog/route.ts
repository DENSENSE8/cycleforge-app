import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrCreateLineCatalog } from '@/lib/receiving/line-catalog';

/** POST /api/receiving-lines/[id]/ensure-catalog */
function lineIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  // .../api/receiving-lines/[id]/ensure-catalog → id is segments[-2]
  return Number(segments[segments.length - 2]);
}

export const POST = withAuth(async (request, ctx) => {
  const lineId = lineIdFromPath(request.nextUrl.pathname);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid line id' }, { status: 400 });
  }

  try {
    // [id]/verb write:
    const resolved = await resolveOrCreateLineCatalog(lineId, ctx.organizationId);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: 'line not found' }, { status: 404 });
    }
    if (resolved.skuCatalogId == null) {
      return NextResponse.json(
        { ok: false, error: 'no SKU on this line to catalog' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, skuCatalogId: resolved.skuCatalogId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to ensure catalog';
    console.error('[POST /api/receiving-lines/[id]/ensure-catalog] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'tech',
    action: 'sku_catalog.ensure',
    entityType: 'sku_catalog',
    entityId: ({ response }) => (response as { skuCatalogId?: number })?.skuCatalogId ?? null,
  },
});
