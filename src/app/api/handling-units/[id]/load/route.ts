import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { HandlingUnitLoadBody } from '@/lib/schemas/handling-unit';
import { loadLocationIntoTote } from '@/lib/inventory/load-tote';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { publishStockLedgerEvent } from '@/lib/realtime/publish';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

const ROUTE_HANDLING_UNIT_LOAD = 'handling-unit.load';

/**
 * POST /api/handling-units/:id/load — move a shelf's loose stock into the
 * tote: the chosen SKUs at the chosen quantities, all or nothing, optionally
 * parking the tote at that shelf. Body: { locationCode, lines: [{ sku, qty }], park }.
 * A stock move, so `bin.adjust` gates it; parking also needs `handling_unit.manage`.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const id = extractIdSegment(req.nextUrl.pathname);
    if (id == null) {
      return NextResponse.json({ success: false, error: 'handling unit id required' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(HandlingUnitLoadBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    if (parsed.park && !ctx.can('handling_unit.manage')) {
      return NextResponse.json({ success: false, error: 'You cannot park totes' }, { status: 403 });
    }

    const idempotencyKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (!idempotencyKey) {
      return NextResponse.json({ success: false, error: 'Idempotency-Key is required' }, { status: 400 });
    }
    const orgId = ctx.organizationId;
    const staffId = ctx.staffId;

    const claimed = await withIdempotencyClaim<Record<string, unknown>>(pool, {
      orgId,
      idempotencyKey,
      route: ROUTE_HANDLING_UNIT_LOAD,
      staffId,
    }, async () => {
      const result = await loadLocationIntoTote(orgId, {
        toteId: id,
        locationCode: parsed.locationCode,
        lines: parsed.lines,
        park: parsed.park,
        staffId: staffId ?? null,
      });
      switch (result.kind) {
        case 'tote_not_found':
          return { status: 404, body: { success: false, error: 'Tote not found' } };
        case 'location_not_found':
          return { status: 404, body: { success: false, error: `Location ${parsed.locationCode} not found` } };
        case 'tote_closed':
          return { status: 409, body: { success: false, error: `${result.code} is closed` } };
        case 'tote_code_taken':
          return { status: 409, body: { success: false, error: `${result.code} is already used by another location` } };
        case 'short':
          return {
            status: 409,
            body: {
              success: false,
              error: result.short.length === 1
                ? `${result.short[0]!.sku} has only ${result.short[0]!.available} here`
                : `${result.short.length} items changed on this shelf — refresh and try again`,
              short: result.short,
            },
          };
        case 'ok':
          break;
      }

      await recordAudit(pool, ctx, req, {
        source: 'handling-units-api',
        action: AUDIT_ACTION.HANDLING_UNIT_LOAD,
        entityType: AUDIT_ENTITY.HANDLING_UNIT,
        entityId: id,
        before: { locationId: result.previousLocationId },
        after: {
          code: result.tote.code,
          from: result.location.code,
          lines: result.moved,
          units: result.units,
          parkedAt: result.parked ? result.location.id : null,
        },
        note: `load ${result.units} units from ${result.location.code} into ${result.tote.code}`,
      });

      // Committed: realtime fan-out and activity rows run after the response.
      after(async () => {
        await Promise.all(result.ledger.map((entry) => publishStockLedgerEvent({
          organizationId: orgId,
          ledgerId: entry.id,
          sku: entry.sku,
          delta: entry.delta,
          reason: entry.reason,
          dimension: 'WAREHOUSE',
          staffId: staffId ?? null,
          source: 'wms.command.tote-load',
        }).catch((error) => console.warn('[tote-load] realtime publish failed', error))));
        await Promise.all(result.moved.map((line) => recordInventoryEvent({
          event_type: 'MOVED',
          actor_staff_id: staffId,
          station: 'MOBILE',
          bin_id: result.tote.stockLocationId,
          prev_bin_id: result.location.id,
          sku: line.sku,
          payload: { action: 'tote_load', from_bin: result.location.code, tote: result.tote.code, qty: line.qty },
        }, undefined, orgId).catch((error) => console.warn('[tote-load] inventory_events insert failed', error))));
      });

      return {
        status: 200,
        body: {
          success: true,
          tote: { id: result.tote.id, code: result.tote.code },
          location: { id: result.location.id, code: result.location.code, name: result.location.name },
          moved: result.moved,
          units: result.units,
          parked: result.parked,
          receipt: { commandId: idempotencyKey },
        },
      };
    });
    return NextResponse.json(claimed.body, { status: claimed.status });
  },
  { permission: 'bin.adjust' },
);

function extractIdSegment(pathname: string): number | null {
  const m = /\/api\/handling-units\/(\d+)\/load/.exec(pathname);
  return m ? Number(m[1]) : null;
}
