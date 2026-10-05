import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { deleteRack, getRack } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { DeleteRackBodySchema, parseRackBody } from '@/lib/schemas/racks';
import pool from '@/lib/db';

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

/** DELETE /api/racks/[code] — retire an empty rack and its shelves/positions. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'bin.remove');
    if (gate.denied) return gate.denied;
    const { code } = await params;
    const parsed = parseRackBody(DeleteRackBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);
    const out = await deleteRack(await rackActor(gate.ctx), decodeURIComponent(code), parsed.data);
    if (out.ok && !out.body.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'racks-api',
        action: AUDIT_ACTION.RACK_DELETE,
        entityType: AUDIT_ENTITY.RACK,
        entityId: out.body.rackId,
        locationCode: out.body.code,
        before: { active: true, descendants: out.body.retired },
        after: { active: false },
      });
    }
    return rackResponse(out);
  } catch (error) {
    return rackRouteError(error, 'DELETE /api/racks/[code]');
  }
}
