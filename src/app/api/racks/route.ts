import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { createRack, listRacks } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { CreateRackBodySchema, parseRackBody } from '@/lib/schemas/racks';
import pool from '@/lib/db';

/**
 * GET /api/racks?placement=<code>&room=<id> — racks with derived room,
 * placement, shelf and tier counts.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const placementCode = searchParams.get('placement')?.trim() || null;
    const roomRaw = searchParams.get('room');
    const roomId = roomRaw ? Number(roomRaw) : null;
    if (roomId != null && !(Number.isSafeInteger(roomId) && roomId > 0)) {
      return rackInvalid({ error: 'room must be a location id', code: 'invalid' });
    }
    return rackResponse(await listRacks(ctx.organizationId, { placementCode, roomId }));
  } catch (error) {
    return rackRouteError(error, 'GET /api/racks');
  }
}, { permission: 'sku_stock.view' });

/**
 * POST /api/racks — create a rack + shelves (+ positions) under a placement;
 * `dryRun` returns the planned codes and writes nothing. Retries with the same
 * `clientEventId` replay the created rack (200, idempotent).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseRackBody(CreateRackBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);

    const out = await createRack(await rackActor(ctx), parsed.data);
    if (out.ok && !out.body.dryRun && !out.body.idempotent) {
      const rack = out.body.rack;
      await recordAudit(pool, ctx, req, {
        source: 'racks-api',
        action: AUDIT_ACTION.RACK_CREATE,
        entityType: AUDIT_ENTITY.RACK,
        entityId: rack.id,
        locationCode: rack.code,
        after: { code: rack.code, placementId: rack.placement.id, shelves: rack.shelves.map((s) => s.code) },
      });
    }
    return rackResponse(out);
  } catch (error) {
    return rackRouteError(error, 'POST /api/racks');
  }
}, { permission: 'sku_stock.manage' });
