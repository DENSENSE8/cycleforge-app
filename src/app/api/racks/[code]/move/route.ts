import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { moveRack } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { MoveRackBodySchema, parseRackBody } from '@/lib/schemas/racks';
import pool from '@/lib/db';

/**
 * POST /api/racks/[code]/move — re-place a rack: ONE update of the rack's
 * `parent_id` to a ROOM/STAGING spot in the org. Shelves, stock and tiers
 * follow untouched; no reprint. Idempotent on `clientEventId`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'sku_stock.manage');
    if (gate.denied) return gate.denied;
    const { code } = await params;
    const parsed = parseRackBody(MoveRackBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);

    const out = await moveRack(await rackActor(gate.ctx), decodeURIComponent(code), parsed.data);
    if (out.ok && !out.body.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'racks-api',
        action: AUDIT_ACTION.RACK_MOVE,
        entityType: AUDIT_ENTITY.RACK,
        entityId: out.body.rack.id,
        locationCode: out.body.rack.code,
        before: { placementId: out.body.from.id, placementCode: out.body.from.code },
        after: { placementId: out.body.to.id, placementCode: out.body.to.code },
      });
    }
    return rackResponse(out);
  } catch (error) {
    return rackRouteError(error, 'POST /api/racks/[code]/move');
  }
}
