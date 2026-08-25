import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PlacementCreateBody, sessionAttributionFromBody } from '@/lib/schemas/inventory-spine';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  LocationScanLawError,
  SpineResolutionError,
  recordUnitPlacement,
} from '@/lib/inventory/placements';
import pool from '@/lib/db';

/**
 * POST /api/inventory/placements — record one physical put-away (00-endgame
 * D1/D10). The fact + the `serial_units.location_id` pointer land in one
 * transaction in the domain writer; idempotent on the body's `clientEventId`,
 * so the flaky-network phone can safely retry. The actor comes from the auth
 * context, never the body. The AI has no path here (no mutation_kind maps to
 * this route).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PlacementCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await recordUnitPlacement(ctx.organizationId, {
      unitScan: parsed.unitScan,
      locationScan: parsed.locationScan,
      placedBy: ctx.staffId ?? null,
      session: sessionAttributionFromBody(parsed.session),
      clientEventId: parsed.clientEventId,
    });

    if (result.alreadyRecorded) {
      return NextResponse.json({ success: true, idempotent: true, result });
    }

    await recordAudit(pool, ctx, req, {
      source: 'inventory-spine-api',
      action: AUDIT_ACTION.UNIT_PLACED,
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.serialUnitId,
      after: {
        placementId: result.placementId,
        locationId: result.locationId,
        previousLocationId: result.previousLocationId,
      },
    });

    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof LocationScanLawError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof SpineResolutionError) {
      return NextResponse.json(
        { success: false, error: error.message, kind: error.kind },
        { status: 404 },
      );
    }
    console.error('Error in POST /api/inventory/placements:', error);
    const message = error instanceof Error ? error.message : 'Failed to record placement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'placement.record' });
