import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { adoptBay } from '@/lib/locations/racks';
import { rackActor, rackInvalid, rackResponse, rackRouteError } from '@/lib/locations/rack-route';
import { AdoptBayBodySchema, parseRackBody } from '@/lib/schemas/racks';
import pool from '@/lib/db';

/**
 * POST /api/racks/adopt — turn a legacy aisle-bay (`C-04-07`) into a movable
 * rack: one RACK row in the bay's room, the bay's rows re-parented under it as
 * shelves (level) / positions. Barcodes kept or re-coded `RK<n>-<level>`;
 * stock is keyed by location id and stays put. `dryRun` writes nothing.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseRackBody(AdoptBayBodySchema, await req.json().catch(() => ({})));
    if ('error' in parsed) return rackInvalid(parsed.error);

    const out = await adoptBay(await rackActor(ctx), parsed.data);
    if (out.ok && !out.body.dryRun && !out.body.idempotent) {
      const rack = out.body.rack;
      await recordAudit(pool, ctx, req, {
        source: 'racks-api',
        action: AUDIT_ACTION.RACK_ADOPT,
        entityType: AUDIT_ENTITY.RACK,
        entityId: rack.id,
        locationCode: rack.code,
        after: { bay: parsed.data.bayCode, keepBarcodes: parsed.data.keepBarcodes, shelves: rack.shelves.map((s) => s.code) },
      });
    }
    return rackResponse(out);
  } catch (error) {
    return rackRouteError(error, 'POST /api/racks/adopt');
  }
}, { permission: 'sku_stock.manage' });
