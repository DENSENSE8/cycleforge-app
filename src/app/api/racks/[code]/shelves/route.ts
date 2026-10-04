import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { editRackShelves } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { EditRackShelvesBodySchema, parseRackBody } from '@/lib/schemas/racks';
import pool from '@/lib/db';

/**
 * POST /api/racks/[code]/shelves — append shelves and/or retire shelves.
 * Retiring is refused (409 `shelf_has_stock`) while a shelf or its positions
 * hold stock, open cartons, staged lines, open totes or placed units.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'sku_stock.manage');
    if (gate.denied) return gate.denied;
    const { code } = await params;
    const parsed = parseRackBody(EditRackShelvesBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);

    const out = await editRackShelves(await rackActor(gate.ctx), decodeURIComponent(code), parsed.data);
    if (out.ok) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'racks-api',
        action: AUDIT_ACTION.RACK_SHELVES_EDIT,
        entityType: AUDIT_ENTITY.RACK,
        entityId: out.body.rack.id,
        locationCode: out.body.rack.code,
        after: { added: out.body.added, removed: out.body.removed },
      });
    }
    return rackResponse(out);
  } catch (error) {
    return rackRouteError(error, 'POST /api/racks/[code]/shelves');
  }
}
