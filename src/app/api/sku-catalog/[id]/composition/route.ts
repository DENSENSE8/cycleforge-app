import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getSkuCatalogById, getKitParts } from '@/lib/neon/sku-catalog-queries';
import { getChildren } from '@/lib/neon/sku-relationship-queries';
import { mergeKitComposition, kitCompositionSourceLabel } from '@/lib/orders/order-kit-composition';

/** GET /api/sku-catalog/[id]/composition */
function catalogIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 2]);
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const skuCatalogId = catalogIdFromPath(req.nextUrl.pathname);
    if (!Number.isFinite(skuCatalogId) || skuCatalogId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const catalog = await getSkuCatalogById(skuCatalogId, ctx.organizationId);
    if (!catalog) {
      return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
    }

    const [children, parts] = await Promise.all([
      getChildren(skuCatalogId, ctx.organizationId),
      getKitParts(skuCatalogId, null, ctx.organizationId),
    ]);

    const composition = mergeKitComposition({
      parent: {
        skuCatalogId,
        sku: String(catalog.sku || '').trim() || null,
        title: String(catalog.product_title || '').trim() || null,
        thumbUrl: String(catalog.image_url || '').trim() || null,
      },
      children: children.map((c) => ({
        relationship_id: c.relationship_id,
        qty: c.qty,
        sku_id: c.sku_id,
        sku: c.sku,
        product_title: c.product_title,
        image_url: c.image_url,
      })),
      kitParts: parts.map((p) => ({
        id: p.id,
        component_name: p.component_name,
        component_type: p.component_type,
        qty_required: p.qty_required,
      })),
    });

    return NextResponse.json({
      success: true,
      composition,
      source: kitCompositionSourceLabel(composition),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load composition';
    console.error('Error in GET /api/sku-catalog/[id]/composition:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'sku_stock.view' });
