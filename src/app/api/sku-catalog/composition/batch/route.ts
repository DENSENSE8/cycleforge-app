import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  loadKitCompositionsByCatalogIds,
  compositionsToApiPayload,
  normalizeCompositionCatalogIds,
} from '@/lib/orders/order-kit-composition-load';

/** POST /api/sku-catalog/composition/batch */

type Body = { ids?: unknown };

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }
    const ids = normalizeCompositionCatalogIds(Array.isArray(body.ids) ? body.ids : []);
    const map = await loadKitCompositionsByCatalogIds(ids, ctx.organizationId);
    return NextResponse.json({
      success: true,
      byId: compositionsToApiPayload(map),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load compositions';
    console.error('Error in POST /api/sku-catalog/composition/batch:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'sku_stock.view' });
