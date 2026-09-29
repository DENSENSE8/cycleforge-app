import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import type { OrgId } from '@/lib/tenancy/constants';
import { labelBuyRatesBodySchema } from '@/lib/label-buys/contracts';
import { labelBuyErrorResponse, rateLabelBuy } from '@/lib/label-buys/buy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/label-buys/rates — rates for one outright label (customer ↔ warehouse). */
export const POST = withAuth(async (req, ctx) => {
  try {
    const body = await readV1Json(req, labelBuyRatesBodySchema, 'Invalid rate request.');
    if (!body.ok) return body.response;
    return v1Data(await rateLabelBuy(ctx.organizationId as OrgId, body.data));
  } catch (error) {
    return labelBuyErrorResponse(error, 'POST /api/v1/label-buys/rates');
  }
}, { permission: 'shipping.buy_label' });
