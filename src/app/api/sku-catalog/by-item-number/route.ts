import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveCatalogByItemNumber } from '@/lib/packing/resolve-catalog-by-item-number';

/** GET /api/sku-catalog/by-item-number?itemNumber=…[&catalogId=…] */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const itemNumber = (searchParams.get('itemNumber') || '').trim();
  const rawCatalogId = searchParams.get('catalogId') || searchParams.get('skuId');
  const catalogId = rawCatalogId ? Number(rawCatalogId) : null;

  const result = await resolveCatalogByItemNumber(ctx.organizationId, {
    itemNumber: itemNumber || null,
    catalogId: Number.isFinite(catalogId) && catalogId! > 0 ? catalogId : null,
  });

  if ('error' in result && result.status === 'invalid') {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, ...result });
}, { permission: 'sku_stock.view' });
