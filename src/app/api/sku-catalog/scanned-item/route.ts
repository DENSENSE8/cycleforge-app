import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isScannedItemKeyKind } from '@/lib/inventory/scanned-item-sku';
import { listSkusForScannedItem } from '@/lib/neon/scanned-item-sku-queries';

/** GET /api/sku-catalog/scanned-item?kind=fnsku|unit|barcode&value=… → the catalog SKUs a scanned item barcode identifies. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind') ?? '';
  const value = (searchParams.get('value') ?? '').trim();
  if (!isScannedItemKeyKind(kind) || !value) {
    return NextResponse.json(
      { success: false, error: 'kind (fnsku | unit | barcode) and value are required' },
      { status: 400 },
    );
  }

  const skus = await listSkusForScannedItem(ctx.organizationId, { kind, value });
  return NextResponse.json({ success: true, skus });
}, { permission: 'sku_stock.view' });
