import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listRecentlyPrintedPrepackProducts } from '@/lib/prepack/recent';

/** Recently printed: distinct catalog products from printed QC labels, newest print first. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const limit = Number(request.nextUrl.searchParams.get('limit')) || undefined;
  const items = await listRecentlyPrintedPrepackProducts(ctx.organizationId, limit);
  return NextResponse.json({ success: true, items });
}, { permission: 'sku_stock.view' });
