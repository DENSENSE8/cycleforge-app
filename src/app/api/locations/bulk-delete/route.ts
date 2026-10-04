import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import {
  bulkSoftDeleteLocations,
  previewLocationDeletion,
} from '@/lib/neon/location-queries';
import type { LocationDeleteScope } from '@/lib/inventory/location-deletion';

function optionalInt(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function previewEnvelope(targets: Awaited<ReturnType<typeof previewLocationDeletion>>) {
  const deletable = targets.filter((target) => target.deletable);
  const blocked = targets.filter((target) => !target.deletable);
  return {
    success: true,
    targets,
    counts: { total: targets.length, deletable: deletable.length, blocked: blocked.length },
  };
}

/** GET resolves a hierarchy/selection into the exact positions before any destructive action. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const params = request.nextUrl.searchParams;
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const scope: LocationDeleteScope = {
    locationIds: ids.length ? ids : undefined,
    room: params.get('room'),
    zone: params.get('zone'),
    aisle: optionalInt(params.get('aisle')),
    bay: optionalInt(params.get('bay')),
    level: optionalInt(params.get('level')),
    position: optionalInt(params.get('position')),
  };
  try {
    const targets = await previewLocationDeletion(scope, ctx.organizationId);
    return NextResponse.json(previewEnvelope(targets));
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not preview locations.' },
      { status: 400 },
    );
  }
}, { permission: 'sku_stock.view' });

/** DELETE accepts explicit IDs only; hierarchy expansion must be previewed first. */
export const DELETE = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => null) as { locationIds?: unknown } | null;
  const locationIds = Array.isArray(body?.locationIds)
    ? body.locationIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0)
    : [];
  if (locationIds.length === 0 || locationIds.length > 2_000) {
    return NextResponse.json({ success: false, error: 'Choose between 1 and 2,000 explicit locations.' }, { status: 400 });
  }
  try {
    const result = await bulkSoftDeleteLocations(locationIds, ctx.organizationId);
    await recordAudit(pool, ctx, request, {
      source: 'locations.bulk-delete',
      action: AUDIT_ACTION.BIN_DELETE,
      entityType: AUDIT_ENTITY.BIN,
      entityId: `bulk:${result.deactivated}`,
      before: {
        locations: result.targets.map((target) => ({
          id: target.id,
          barcode: target.barcode,
          room: target.room,
          face: target.face,
        })),
      },
      reasonCode: 'LOCATION_BULK_DELETE',
      extra: { locationIds: result.targets.map((target) => target.id) },
    });
    ctx.markAuditWritten();
    return NextResponse.json({ success: true, deactivated: result.deactivated, targets: result.targets });
  } catch (error) {
    const typed = error as Error & { code?: string; targets?: Awaited<ReturnType<typeof previewLocationDeletion>> };
    if (typed.code === 'LOCATION_DELETE_BLOCKED') {
      return NextResponse.json(
        { ...previewEnvelope(typed.targets ?? []), success: false, error: typed.message },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: typed.message || 'Could not delete locations.' },
      { status: 409 },
    );
  }
}, { permission: 'bin.remove' });
