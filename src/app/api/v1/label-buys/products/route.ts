import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data } from '@/lib/api/v1-route';
import type { OrgId } from '@/lib/tenancy/constants';
import { labelBuyProductsQuerySchema } from '@/lib/label-buys/contracts';
import { labelBuyErrorResponse, searchLabelBuyProducts } from '@/lib/label-buys/buy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/label-buys/products?q= — catalog products (SKU / title / item number) with their remembered parcel. */
export const GET = withAuth(async (req, ctx) => {
  try {
    const query = readV1Query(req, labelBuyProductsQuerySchema, 'Type at least 2 characters to search products.');
    if (!query.ok) return query.response;
    return v1Data({ products: await searchLabelBuyProducts(ctx.organizationId as OrgId, query.data.q) });
  } catch (error) {
    return labelBuyErrorResponse(error, 'GET /api/v1/label-buys/products');
  }
}, { permission: 'shipping.buy_label' });
