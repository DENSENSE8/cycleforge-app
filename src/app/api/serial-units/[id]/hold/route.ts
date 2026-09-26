import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { holdUnit } from '@/lib/inventory/hold';

/** POST /api/serial-units/[id]/hold */
export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const idStr = segments[segments.length - 2];
  const serialUnitId = Number(idStr);
  if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

  const orgId = ctx.organizationId;

  try {
    // Org-ownership 404 gate (never 403).
    const owns = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [serialUnitId, orgId],
    );
    if (owns.rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'serial_units row not found' }, { status: 404 });
    }

    const result = await holdUnit({
      serialUnitId,
      reason: String(body?.reason || '').trim(),
      clientEventId: String(body?.client_event_id || '').trim() || null,
      actorStaffId,
      organizationId: orgId,
    });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hold failed';
    console.error('[POST /api/serial-units/[id]/hold] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'sku_stock.adjust' });
