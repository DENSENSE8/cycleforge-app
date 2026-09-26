import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { HandlingUnitBulkCreateBody } from '@/lib/schemas/handling-unit';
import { createHandlingUnitsBulk } from '@/lib/neon/handling-unit-queries';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

const ROUTE_HANDLING_UNIT_BULK_POST = 'handling-unit.bulk-post';

/** POST /api/handling-units/bulk — mint N boxes in one call so the operator can print the whole run of `H-{id}` labels at once. */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(HandlingUnitBulkCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(
        pool,
        ctx.organizationId,
        idemKey,
        ROUTE_HANDLING_UNIT_BULK_POST,
      );
      if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
    }

    let boxes;
    try {
      boxes = await createHandlingUnitsBulk({
        organizationId: ctx.organizationId,
        createdBy: ctx.staffId,
        count: parsed.count,
        locationId: parsed.locationId ?? null,
        notes: parsed.notes ?? null,
      });
    } catch (error: unknown) {
      const e = error as { code?: string; message?: string };
      if (e?.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A handling unit with that code already exists' },
          { status: 409 },
        );
      }
      throw error;
    }

    // `count` is >= 1, so a zero-row batch means the INSERT silently minted
    // nothing (RLS/tenant misconfiguration) — surface it instead of handing the
    // caller a 201 with an empty label run.
    if (boxes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bulk mint returned no handling units' },
        { status: 500 },
      );
    }

    // ONE audit row for the batch (a 200-box mint is one operator action), keyed
    // to the first minted id with the code span in `after` so the run is
    // reconstructable from the log.
    await recordAudit(pool, ctx, req, {
      source: 'handling-units-api',
      action: AUDIT_ACTION.HANDLING_UNIT_CREATE,
      entityType: AUDIT_ENTITY.HANDLING_UNIT,
      entityId: boxes[0].id,
      before: null,
      after: {
        count: boxes.length,
        first_code: boxes[0].code,
        last_code: boxes[boxes.length - 1].code,
        location_id: parsed.locationId ?? null,
      },
    });

    const responseBody = { success: true, handling_units: boxes };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE_HANDLING_UNIT_BULK_POST,
        staffId: ctx.staffId,
        statusCode: 201,
        responseBody,
      });
    }
    return NextResponse.json(responseBody, { status: 201 });
  },
  { permission: 'handling_unit.manage' },
);
