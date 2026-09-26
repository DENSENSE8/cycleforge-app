import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { getShipStationV1 } from '@/lib/shipping/shipstation/config';
import { isShipStationInternalStore } from '@/lib/catalog/shipstation-store-sync';

export const dynamic = 'force-dynamic';

/** GET /api/integrations/shipstation/stores — the connected ShipStation storefronts, live from v1 `/stores` (retired ones included: */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    try {
      const client = await getShipStationV1(ctx.organizationId);
      if (!client) return NextResponse.json({ success: true, connected: false, stores: [] });
      const stores = (await client.listStores()).filter((s) => !isShipStationInternalStore(s));
      return NextResponse.json({ success: true, connected: true, stores });
    } catch (err) {
      return errorResponse(err, 'GET /api/integrations/shipstation/stores');
    }
  },
  { permission: 'admin.view' },
);
