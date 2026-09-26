import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import {
  moveUnitPackPlacement,
  UnitPackPlacementError,
  type UnitPackPlacement,
} from '@/lib/packing/unit-pack-placement';
import { parseBody } from '@/lib/schemas/parse';
import { UnitPackPlacementMoveBody } from '@/lib/schemas/unit-pack-placement';
import { findByUnitUid, findByNormalizedSerial } from '@/lib/neon/serial-units-queries';
import type { OrgId } from '@/lib/tenancy/constants';

const ROUTE = 'units.pack-placement.move';

/** POST /api/units/pack-placement/move — place / move a loose serialized unit between packing DESK / STAGING benches (Ready-to-Pack unit… */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const canWrite =
      ctx.permissions.has('tech.scan_serial') || ctx.permissions.has('packing.view');
    if (!canWrite) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN', permission: 'tech.scan_serial|packing.view' },
        { status: 403 },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(UnitPackPlacementMoveBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(pool, ctx.organizationId, idemKey, ROUTE);
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    let unitId = parsed.unitId ?? null;
    if (unitId == null && parsed.unitScan) {
      const orgId = ctx.organizationId as OrgId;
      const unitRow =
        (await findByUnitUid(parsed.unitScan, orgId)) ??
        (await findByNormalizedSerial(parsed.unitScan, orgId));
      if (!unitRow) {
        return NextResponse.json(
          { success: false, error: 'Unit not found for scan', code: 'UNIT_NOT_FOUND' },
          { status: 404 },
        );
      }
      unitId = Number(unitRow.id);
    }

    const placement: UnitPackPlacement = await moveUnitPackPlacement(ctx.organizationId, {
      unitId: unitId!,
      locationId: parsed.locationId,
      barcode: parsed.barcode,
      staffId: ctx.staffId,
      source: 'move',
      reason: parsed.reason ?? null,
    });

    await recordAudit(pool, ctx, req, {
      source: 'unit-pack-placement-api',
      action: AUDIT_ACTION.UNIT_PACK_MOVE,
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: placement.unitId,
      after: { ...placement },
    });

    const responseBody: { success: true; placement: UnitPackPlacement } = {
      success: true,
      placement,
    };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE,
        staffId: ctx.staffId,
        statusCode: 200,
        responseBody,
      });
    }
    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    if (error instanceof UnitPackPlacementError) {
      const status =
        error.code === 'UNIT_NOT_FOUND'
          ? 404
          : error.code === 'SAME_LOCATION'
            ? 409
            : 400;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }
    console.error('Error in POST /api/units/pack-placement/move:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Move failed' },
      { status: 500 },
    );
  }
}, { permission: 'orders.view' });
