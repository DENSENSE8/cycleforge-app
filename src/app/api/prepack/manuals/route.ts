import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { searchManualsWithUsage } from '@/lib/manuals/manual-usage';

/** Library manuals to pair to a product, each with where it is used; empty `q` lists the newest. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const q = String(request.nextUrl.searchParams.get('q') ?? '').slice(0, 200);
  const items = await searchManualsWithUsage(ctx.organizationId, q);
  return NextResponse.json({ success: true, items });
}, { permission: 'sku_stock.view' });
