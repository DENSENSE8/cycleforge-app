import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveCatalogByItemNumber } from '@/lib/packing/resolve-catalog-by-item-number';

/**
 * GET /api/sku-catalog/by-item-number?itemNumber=…[&catalogId=…]
 *
 * Resolve a marketplace item number (or an explicit catalog id) to the
 * sku_catalog row that owns kit-parts / QC definitions.
 *
 * Sole consumer since 2026-09-15: the outbound order-intake triage lookup
 * (`src/components/outbound/orders/intake/useOrderTriage.ts`). The mobile
 * checklist CRUD entry (`/m/checklist`) that this was written for is DELETED
 * along with its `useResolveCatalogByItemNumber` hook — operator ruling, see
 * `src/lib/mobile/nav-registry.ts`. The route stays because intake still
 * needs it; if intake ever stops calling it, this becomes dead.
 *
 * Response shapes:
 *   { success, status: 'resolved', itemNumber, catalog }
 *   { success, status: 'ambiguous', itemNumber, candidates }
 *   { success, status: 'unresolved', itemNumber }
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve item number';
    console.error('Error in GET /api/sku-catalog/by-item-number:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'sku_stock.view' });
