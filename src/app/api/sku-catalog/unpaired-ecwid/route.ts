import { NextRequest, NextResponse } from 'next/server';
import { getUnpairedEcwidProducts } from '@/lib/neon/sku-catalog-queries';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * GET /api/sku-catalog/unpaired-ecwid
 * Returns Ecwid products not yet paired to a Zoho SKU, ordered by most ordered.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));

  const { items, total } = await getUnpairedEcwidProducts({ q, limit, offset }, ctx.organizationId);

  return NextResponse.json({ success: true, items, total });
}, { permission: 'sku_stock.view' });
