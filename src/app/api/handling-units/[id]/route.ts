import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  getHandlingUnitDetail,
  getHandlingUnitByCode,
  dissolveHandlingUnit,
} from '@/lib/neon/handling-unit-queries';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { getLocationByBarcode } from '@/lib/neon/location-queries';
import { verifyLocationScanProof } from '@/lib/inventory/location-scan-proof';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';

const MOVE_ROUTE = 'handling-units.id.move';

/** Org-ownership precheck for a resolved handling_units.id. */
async function ownsHandlingUnit(orgId: string, id: number): Promise<boolean> {
  const r = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id FROM handling_units WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [id, orgId],
  );
  return r.rows.length > 0;
}

/** GET /api/handling-units/:id — box + contents + rollup status. */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const raw = extractIdSegment(request.nextUrl.pathname);
    if (!raw) {
      return NextResponse.json({ success: false, error: 'handling unit id required' }, { status: 400 });
    }

    let id: number | null = /^\d+$/.test(raw) ? Number(raw) : null;
    if (id == null) {
      // `H-12` handle or external tote code → resolve to the numeric id.
      const hMatch = /^H-(\d+)$/i.exec(raw);
      if (hMatch) id = Number(hMatch[1]);
      else {
        const byCode = await getHandlingUnitByCode(raw, pool, ctx.organizationId);
        if (byCode) id = byCode.id;
      }
    }
    if (id == null || !Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    // Org-ownership gate: a cross-tenant box id reads as "not found" rather
    // than leaking another org's contents; the detail read is tenant-scoped too.
    if (!(await ownsHandlingUnit(ctx.organizationId, id))) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    const detail = await getHandlingUnitDetail(id, ctx.organizationId);
    if (!detail) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }
    // Mirror `receiving_line_ids` at the top level too — the testing resolver
    // reads either shape.
    return NextResponse.json({
      success: true,
      handling_unit: detail,
      receiving_line_ids: detail.receiving_line_ids,
    });
  },
  { permission: 'handling_unit.view' },
);

/** PATCH /api/handling-units/:id — scan-gated placement of one physical LPN. */
export const PATCH = withAuth(
  async (request: NextRequest, ctx) => {
    const raw = extractIdSegment(request.nextUrl.pathname);
    const hMatch = /^H-(\d+)$/i.exec(raw);
    const id = /^\d+$/.test(raw) ? Number(raw) : hMatch ? Number(hMatch[1]) : null;
    if (id == null || !Number.isSafeInteger(id) || id <= 0 || !(await ownsHandlingUnit(ctx.organizationId, id))) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      locationCode?: string;
      locationVerificationToken?: string;
      placementMethod?: 'scan' | 'manual';
      clientEventId?: string;
    } | null;
    if (body?.action !== 'move') {
      return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }
    const locationCode = String(body.locationCode || '').trim();
    if (!locationCode) {
      return NextResponse.json({ success: false, error: 'Destination location is required' }, { status: 400 });
    }
    const placementMethod = body.placementMethod === 'manual' ? 'manual' : 'scan';
    if (placementMethod === 'scan') {
      try {
        verifyLocationScanProof(String(body.locationVerificationToken || ''), {
          organizationId: ctx.organizationId,
          staffId: ctx.staffId,
          locationCode,
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Scan the destination location again.',
        }, { status: 403 });
      }
    }

    const idempotencyKey = readIdempotencyKey(request, body.clientEventId);
    if (!idempotencyKey) {
      return NextResponse.json({ success: false, error: 'Idempotency-Key is required' }, { status: 400 });
    }
    const cached = await getApiIdempotencyResponse(pool, ctx.organizationId, idempotencyKey, MOVE_ROUTE);
    if (cached) return NextResponse.json(cached.response_body, { status: cached.status_code });

    const location = await getLocationByBarcode(locationCode, ctx.organizationId);
    if (!location) {
      const response = { success: false, error: 'Destination location not found' };
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey,
        route: MOVE_ROUTE,
        staffId: ctx.staffId,
        statusCode: 404,
        responseBody: response,
      });
      return NextResponse.json(response, { status: 404 });
    }

    const before = await getHandlingUnitDetail(id, ctx.organizationId);
    const moved = await tenantQuery<{ id: number; code: string; location_id: number }>(
      ctx.organizationId,
      `UPDATE handling_units
          SET location_id = $1
        WHERE id = $2 AND organization_id = $3
        RETURNING id, code, location_id`,
      [location.id, id, ctx.organizationId],
    );
    const row = moved.rows[0];
    if (!row) return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });

    const response = {
      success: true,
      handlingUnit: { id: Number(row.id), code: row.code },
      location: { id: Number(location.id), code: location.barcode ?? locationCode, name: location.name },
      unchanged: before?.location_id === Number(location.id),
      receipt: { commandId: idempotencyKey },
    };
    await recordAudit(pool, ctx, request, {
      source: 'handling-units-api',
      action: 'handling_unit.move',
      entityType: 'handling_unit',
      entityId: id,
      before: { locationId: before?.location_id ?? null, locationName: before?.location_name ?? null },
      after: { locationId: Number(location.id), locationName: location.name ?? locationCode },
      method: placementMethod,
      note: `${placementMethod} placement ${locationCode}`,
    });
    await saveApiIdempotencyResponse(pool, {
      orgId: ctx.organizationId,
      idempotencyKey,
      route: MOVE_ROUTE,
      staffId: ctx.staffId,
      statusCode: 200,
      responseBody: response,
    });
    return NextResponse.json(response);
  },
  { permission: 'handling_unit.manage' },
);

/** DELETE /api/handling-units/:id — dissolve an H-box (reverse of create). */
export const DELETE = withAuth(
  async (request: NextRequest, ctx) => {
    const raw = extractIdSegment(request.nextUrl.pathname);
    if (!raw) {
      return NextResponse.json({ success: false, error: 'handling unit id required' }, { status: 400 });
    }
    let id: number | null = /^\d+$/.test(raw) ? Number(raw) : null;
    if (id == null) {
      const hMatch = /^H-(\d+)$/i.exec(raw);
      if (hMatch) id = Number(hMatch[1]);
      else {
        const byCode = await getHandlingUnitByCode(raw, pool, ctx.organizationId);
        if (byCode) id = byCode.id;
      }
    }
    if (id == null || !Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    // Org-ownership precheck keeps a cross-tenant box id indistinguishable from
    // a missing record; the write repeats the organization predicate.
    if (!(await ownsHandlingUnit(ctx.organizationId, id))) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    const result = await dissolveHandlingUnit(id, ctx.organizationId);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Handling unit not found' }, { status: 404 });
    }

    await recordAudit(pool, ctx, request, {
      source: 'handling-units-api',
      action: 'handling_unit.dissolve',
      entityType: 'handling_unit',
      entityId: id,
      before: { ...result.dissolved },
      after: null,
      note: result.unassigned > 0 ? `unassigned ${result.unassigned} unit(s)` : null,
    });

    return NextResponse.json({ success: true, unassigned: result.unassigned });
  },
  { permission: 'handling_unit.manage' },
);

function extractIdSegment(pathname: string): string {
  const m = /\/api\/handling-units\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1] || '').trim() : '';
}
