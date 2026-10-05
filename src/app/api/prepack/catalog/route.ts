import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listRecentPrepackProducts, searchPrepackCatalog } from '@/lib/prepack/server';

/** Title / SKU / UPC / MPN lookup. No query: the products prepacked or received most recently. Catalog identity only. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const sku = request.nextUrl.searchParams.get('sku')?.trim() ?? '';
  const items = query || sku
    ? await searchPrepackCatalog(ctx.organizationId, { query, sku })
    : await listRecentPrepackProducts(ctx.organizationId);
  return NextResponse.json({ success: true, items });
}, { permission: 'sku_stock.view' });
