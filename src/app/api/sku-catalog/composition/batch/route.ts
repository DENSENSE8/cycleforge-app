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
}, { permission: 'sku_stock.view' });
