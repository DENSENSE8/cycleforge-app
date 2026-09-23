import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getBinContentsByBarcode,
  getLocationByBarcode,
  upsertBinContent,
  upsertBinContentIfVersion,
  markBinCounted,
  softDeleteLocation,
} from '@/lib/neon/location-queries';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import {
  assertPermission,
  type PermissionAction,
  PermissionDeniedError,
  permissionDeniedResponse,
} from '@/lib/auth/permissions';
import { LocationsPatchBody } from '@/lib/schemas/locations';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { errorResponse } from '@/lib/api';
import { executeWmsPutawayAdjust } from '@/lib/realtime/wms-putaway-adjust';

const ROUTE_LOCATION_PATCH = 'locations.barcode.patch';

/**
 * GET /api/locations/[barcode]
 * Scan a bin barcode → returns the bin location + all SKUs stored there.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const gate = await requireRoutePerm(req, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();

  if (!code) {
    return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  }

  try {
    const result = await getBinContentsByBarcode(code, orgId);

    if (!result) {
      return NextResponse.json(
        { error: 'Bin not found', barcode: code },
        { status: 404 },
      );
    }

    return NextResponse.json({
      location: {
        id: result.location.id,
        name: result.location.name,
        room: result.location.room,
        rowLabel: result.location.row_label,
        colLabel: result.location.col_label,
        barcode: result.location.barcode,
        binType: result.location.bin_type,
        capacity: result.location.capacity,
      },
      contents: result.contents.map((c: any) => ({
        id: c.id,
        sku: c.sku,
        qty: c.qty,
        minQty: c.min_qty,
        maxQty: c.max_qty,
        lastCounted: c.last_counted,
        productTitle: c.product_title,
        displayNameOverride: c.display_name_override ?? null,
        // Version token for optimistic concurrency on `set` action.
        updatedAt: c.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('[GET /api/locations/[barcode]] error:', err);
    return NextResponse.json(
      { error: 'Failed to load bin', details: err?.message },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/locations/[barcode]
 * Actions: take, put, set, count
 *
 * take:  { action: "take",  sku, qty, reason? }  — subtract from bin + sku_stock
 * put:   { action: "put",   sku, qty, reason? }  — add to bin + sku_stock
 * set:   { action: "set",   sku, qty, minQty?, maxQty? }   — set absolute bin qty
 * count: { action: "count", sku }                           — mark bin as physically counted
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const baseGate = await requireRoutePerm(request, 'sku_stock.view');
  if (baseGate.denied) return baseGate.denied;
  const ctx = baseGate.ctx;
  const orgId = ctx.organizationId;
  const idempotencyOrgId = orgId;

  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();

  if (!code) {
    return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    // ─── Schema validation (defense-in-depth) ───────────────────────────────
    const parsed = parseBody(LocationsPatchBody, body);
    if (parsed instanceof NextResponse) return parsed;

    const idempotencyKey = readIdempotencyKey(request, body?.clientEventId ?? body?.idempotencyKey);
    const {
      action,
      sku,
      qty,
      reason,
      reasonCodeId,
      notes,
      minQty,
      maxQty,
      expectedUpdatedAt,
    } = body as {
      action: 'take' | 'put' | 'set' | 'count';
      sku?: string;
      /** ISO timestamp from a prior GET — when set, `action=set` rejects stale writes. */
      expectedUpdatedAt?: string;
      qty?: number;
      /** Legacy free-text reason (still stored for back-compat). */
      reason?: string;
      /** Preferred — FK into reason_codes for categorized reporting. */
      reasonCodeId?: number;
      /** Required by some reasons (DAMAGED, FOUND, …). */
      notes?: string;
      minQty?: number;
      maxQty?: number;
    };

    if (!sku?.trim()) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
    }

    // ─── Permission gate ───────────────────────────────────────────────────
    // Map each action to the matching permission. Everyone except 'readonly'
    // gets bin.adjust / bin.set / bin.add_sku.
    const requiredPerm: PermissionAction | null =
      action === 'take' || action === 'put'
        ? 'bin.adjust'
        : action === 'set' || action === 'count'
        ? 'bin.set'
        : null;
    if (requiredPerm) {
      try {
        await assertPermission(ctx.staffId, requiredPerm);
      } catch (err) {
        if (err instanceof PermissionDeniedError) {
          return NextResponse.json(permissionDeniedResponse(err), { status: 403 });
        }
        throw err;
      }
    }

    const effectiveStaffId = ctx.staffId;
    const trimmedSku = sku.trim();

    if ((action === 'take' || action === 'put') && typeof qty === 'number' && qty > 0) {
      if (!idempotencyKey) {
        return NextResponse.json({ error: 'Idempotency-Key is required' }, { status: 400 });
      }
      try {
        const result = await executeWmsPutawayAdjust({
          commandId: idempotencyKey,
          organizationId: orgId,
          staffId: effectiveStaffId,
          barcode: code,
          sku: trimmedSku,
          direction: action,
          qty,
          reason: reason || (action === 'take' ? 'TAKEN' : 'RECEIVED'),
          reasonCodeId: reasonCodeId ?? null,
          notes: notes ?? null,
        });
        return NextResponse.json({
          ...result.data,
          cursor: result.data.ledgerId,
          receipt: { commandId: idempotencyKey, replayed: result.replayed },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Inventory adjustment failed.';
        if (/not found/i.test(message)) {
          return NextResponse.json({ error: 'NOT_FOUND', message }, { status: 404 });
        }
        if (/slot full|cannot take|already in progress/i.test(message)) {
          return NextResponse.json({ error: 'CONFLICT', message }, { status: 409 });
        }
        throw err;
      }
    }

    // Non-motion edits retain the generic route cache; physical movement uses
    // the WMS command receipt above.
    if (idempotencyKey) {
      const cached = await getApiIdempotencyResponse(pool, idempotencyOrgId, idempotencyKey, ROUTE_LOCATION_PATCH);
      if (cached) return NextResponse.json(cached.response_body, { status: cached.status_code });
    }
    const loc = await getLocationByBarcode(code, orgId);
    if (!loc) {
      return NextResponse.json({ error: 'Bin not found' }, { status: 404 });
    }
    const binCode = loc.barcode ?? code;
    const binLabel = loc.name ?? null;
    const respond = async (payload: Record<string, unknown>, status = 200) => {
      if (idempotencyKey && status < 500) {
        await saveApiIdempotencyResponse(pool, {
          orgId: idempotencyOrgId,
          idempotencyKey,
          route: ROUTE_LOCATION_PATCH,
          staffId: ctx.staffId,
          statusCode: status,
          responseBody: payload,
        });
      }
      return NextResponse.json(payload, { status });
    };

    if (action === 'set' && typeof qty === 'number') {
      // Optimistic concurrency: when the caller supplies an expectedUpdatedAt
      // timestamp from their prior GET, we only apply the write if the row
      // hasn't moved since. Two devices racing to change min/max on the same
      // row no longer silently overwrite each other.
      if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt.trim()) {
        const versioned = await upsertBinContentIfVersion({
          locationId: loc.id,
          sku: sku.trim(),
          qty,
          minQty: minQty ?? null,
          maxQty: maxQty ?? null,
          expectedUpdatedAt: expectedUpdatedAt.trim(),
        }, idempotencyOrgId);
        if (!versioned.ok) {
          return respond(
            {
              error: 'STALE',
              message:
                'Another device updated this row since you loaded it. Refresh and try again.',
              current: versioned.current as unknown as Record<string, unknown> | null,
            },
            409,
          );
        }
        return respond({
          success: true,
          binContent: versioned.row as unknown as Record<string, unknown>,
        });
      }
      const result = await upsertBinContent({
        locationId: loc.id,
        sku: trimmedSku,
        qty,
        minQty: minQty ?? null,
        maxQty: maxQty ?? null,
      }, idempotencyOrgId);
      await recordAudit(pool, ctx, request, {
        source: 'mobile-scanner',
        action: AUDIT_ACTION.SKU_STOCK_ADJUST,
        entityType: AUDIT_ENTITY.BIN,
        entityId: loc.id,
        after: { qty, min_qty: minQty ?? null, max_qty: maxQty ?? null },
        binCode,
        locationCode: binLabel,
        scanRef: code,
        method: 'scan',
        reasonCode: reason || 'SET',
        note: notes ?? null,
        actorStaffIdOverride: effectiveStaffId,
        extra: { sku: trimmedSku, mode: 'set' },
      });
      return respond({ success: true, binContent: result as unknown as Record<string, unknown> });
    }

    if (action === 'count') {
      await markBinCounted(loc.id, trimmedSku, orgId);
      await recordAudit(pool, ctx, request, {
        source: 'mobile-scanner',
        action: 'bin.count',
        entityType: AUDIT_ENTITY.BIN,
        entityId: loc.id,
        binCode,
        locationCode: binLabel,
        scanRef: code,
        method: 'scan',
        actorStaffIdOverride: effectiveStaffId,
        extra: { sku: trimmedSku },
      });
      return respond({ success: true });
    }

    return respond({ error: 'Invalid action' }, 400);
  } catch (err) {
    return errorResponse(err, 'PATCH /api/locations/[barcode]');
  }
}

/**
 * DELETE /api/locations/[barcode] — soft-delete a single bin (is_active=false).
 *
 * Uses session-derived auth (requireRoutePerm). Refuses to delete a bin that
 * still holds stock (409) so
 * inventory can't silently vanish; empty it or move it first.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const gate = await requireRoutePerm(req, 'bin.remove');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();
  if (!code) {
    return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  }

  try {
    // Org-ownership precheck: scope the lookup to this tenant so a barcode
    // belonging to another org resolves to "not found" (404), never deleted.
    const bin = await getBinContentsByBarcode(code, orgId);
    if (!bin || !bin.location.is_active) {
      return NextResponse.json({ error: 'Bin not found' }, { status: 404 });
    }

    const remaining = bin.contents.filter((c) => Number(c.qty) > 0);
    if (remaining.length > 0) {
      return NextResponse.json(
        {
          error: 'Bin is not empty — move or remove its stock before deleting',
          skus: remaining.map((c) => c.sku),
        },
        { status: 409 },
      );
    }

    const deleted = await softDeleteLocation(bin.location.id, orgId);
    if (!deleted) {
      return NextResponse.json({ error: 'Bin not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'settings.locations',
      action: AUDIT_ACTION.BIN_DELETE,
      entityType: AUDIT_ENTITY.BIN,
      entityId: bin.location.id,
      before: { ...bin.location },
      binCode: bin.location.barcode ?? code,
      locationCode: bin.location.name ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/locations/[barcode]] error:', err);
    return NextResponse.json(
      { error: 'Failed to delete bin', details: err?.message },
      { status: 500 },
    );
  }
}
