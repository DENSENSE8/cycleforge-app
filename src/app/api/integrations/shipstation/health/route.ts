import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { checkShipStationStatus, type ShipStationStatus } from '@/lib/shipping/shipstation/status';

export const dynamic = 'force-dynamic';

function describe(status: ShipStationStatus): string | undefined {
  if (status.active) return undefined;
  const parts: string[] = [];
  if (status.v2 !== 'active') parts.push(`v2 key ${status.v2}`);
  if (status.v1 !== 'active') parts.push(`v1 key/secret ${status.v1}`);
  return parts.join(' · ');
}

/**
 * GET /api/integrations/shipstation/health — probes both ShipStation keys
 * (v2 GET /carriers, v1 GET /stores). `ok` = both keys active.
 * Served from the per-org 5-min verdict cache; `?fresh=1` (the Settings
 * "Check" button) re-probes and refreshes the verdict the order-sync switch reads.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const fresh = req.nextUrl.searchParams.get('fresh') === '1';
      const status = await checkShipStationStatus(ctx.organizationId, { fresh });
      return NextResponse.json({ ok: status.active, ...status, error: describe(status) });
    } catch (err) {
      return errorResponse(err, 'GET /api/integrations/shipstation/health');
    }
  },
  { permission: 'shipping.view' },
);
