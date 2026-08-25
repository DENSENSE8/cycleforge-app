import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PartPullCreateBody, sessionAttributionFromBody } from '@/lib/schemas/inventory-spine';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  LocationScanLawError,
  SpineResolutionError,
  recordPartPull,
} from '@/lib/inventory/placements';
import pool from '@/lib/db';

/**
 * POST /api/inventory/part-pulls — record one disassembly fact (00-endgame §2):
 * a part out of a donor unit, into a scanned (parts) bin. Idempotent on the
 * body's `clientEventId`; actor from the auth context, never the body; the
 * destination bin must arrive as a scan (D10 — schema, domain, and DB CHECK
 * all refuse a typed location).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PartPullCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await recordPartPull(ctx.organizationId, {
      donorScan: parsed.donorScan,
      locationScan: parsed.locationScan,
      partLabel: parsed.partLabel,
      partSku: parsed.partSku ?? null,
      partSerialUnitId: parsed.partSerialUnitId ?? null,
      quantity: parsed.quantity,
      pulledBy: ctx.staffId ?? null,
      session: sessionAttributionFromBody(parsed.session),
      clientEventId: parsed.clientEventId,
    });

    if (result.alreadyRecorded) {
      return NextResponse.json({ success: true, idempotent: true, result });
    }

    await recordAudit(pool, ctx, req, {
      source: 'inventory-spine-api',
      action: AUDIT_ACTION.UNIT_PART_PULLED,
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.donorSerialUnitId,
      after: {
        partPullId: result.partPullId,
        partLabel: parsed.partLabel.trim(),
        partSku: parsed.partSku ?? null,
        quantity: parsed.quantity ?? 1,
        toLocationId: result.toLocationId,
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
    console.error('Error in POST /api/inventory/part-pulls:', error);
    const message = error instanceof Error ? error.message : 'Failed to record part pull';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'placement.record' });
