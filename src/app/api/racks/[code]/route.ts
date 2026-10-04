import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getRack } from '@/lib/locations/racks';
import { rackResponse, rackRouteError } from '@/lib/locations/rack-route';

/**
 * GET /api/racks/[code] — rack + shelves + derived room/placement. `code` is
 * any rack spelling; a shelf or position code resolves to its rack.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'sku_stock.view');
    if (gate.denied) return gate.denied;
    const { code } = await params;
    return rackResponse(await getRack(gate.ctx.organizationId, decodeURIComponent(code)));
  } catch (error) {
    return rackRouteError(error, 'GET /api/racks/[code]');
  }
}
