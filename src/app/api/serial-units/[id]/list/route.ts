import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { markUnitListed } from '@/lib/inventory/markUnitListed';
import { tapWorkflow } from '@/lib/workflow/tap';
import { isUnifiedEngineFulfillmentTaps } from '@/lib/feature-flags';

/** POST /api/serial-units/[id]/list — mark a serial unit live on a sales channel. */
export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const idParam = extractIdSegment(request.nextUrl.pathname);
    const unitId = Number(idParam);
    if (!Number.isFinite(unitId) || unitId <= 0) {
      return NextResponse.json({ ok: false, error: 'valid serial unit id is required' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const platform =
      typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : undefined;
    const externalRefId =
      typeof body.external_ref_id === 'string' && body.external_ref_id.trim()
        ? body.external_ref_id.trim()
        : null;
    const priceRaw = Number(body.listing_price_cents);
    const listingPriceCents = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.floor(priceRaw) : null;
    const clientEventId =
      typeof body.client_event_id === 'string' && body.client_event_id.trim()
        ? body.client_event_id.trim()
        : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const result = await markUnitListed({
      unitId,
      orgId: ctx.organizationId,
      platform,
      externalRefId,
      listingPriceCents,
      actorStaffId: ctx.staffId ?? null,
      clientEventId,
      notes,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    await recordAudit(pool, ctx, request, {
      source: 'inventory.list-unit',
      action: AUDIT_ACTION.SERIAL_LIST,
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.serialUnitId,
      method: 'manual',
      note: notes,
      extra: {
        platform: result.platform,
        external_ref_id: result.externalRefId,
        listing_id: result.listingId,
        listing_price_cents: listingPriceCents,
        idempotent: result.idempotent,
        inventory_event_id: result.eventId,
      },
    });

    // Fire-and-forget engine observe:
    if (isUnifiedEngineFulfillmentTaps()) {
      after(async () => {
        await tapWorkflow({
          serialUnitId: result.serialUnitId,
          event: 'listed',
          input: { listingId: result.externalRefId ?? String(result.listingId) },
          staffId: ctx.staffId ?? null,
          source: 'manual',
          orgId: ctx.organizationId,
          expectNodeType: 'list_ebay',
        });
      });
    }

    return NextResponse.json({
      ok: true,
      serial_unit_id: result.serialUnitId,
      listing_id: result.listingId,
      platform: result.platform,
      external_ref_id: result.externalRefId,
      idempotent: result.idempotent,
    });
  },
  { permission: 'inventory.list_unit' },
);

function extractIdSegment(pathname: string): string {
  const m = /\/api\/serial-units\/([^/]+)\/list/.exec(pathname);
  return m ? decodeURIComponent(m[1] || '').trim() : '';
}
