import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

/** POST /api/inventory/alerts/[id]/ack */
export const POST = withAuth(async (request, ctx) => {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    // .../api/inventory/alerts/[id]/ack → id is segments[-2]
    const idStr = segments[segments.length - 2];
    const alertId = Number(idStr);
    if (!Number.isFinite(alertId) || alertId <= 0) {
        return NextResponse.json({ success: false, error: 'Invalid alert id' }, { status: 400 });
    }

    let note: string | null = null;
    try {
        const body = await request.json();
        if (typeof body?.note === 'string') note = body.note.trim() || null;
    } catch {
        /* empty body is fine */
    }

    const result = await tenantQuery(
        ctx.organizationId,
        `UPDATE stock_alerts
             SET resolved_at = COALESCE(resolved_at, NOW()),
                 notes = COALESCE($2, notes)
             WHERE id = $1 AND organization_id = $3
             RETURNING id, sku, bin_id, alert_type, triggered_at, resolved_at, notes`,
        [alertId, note, ctx.organizationId],
    );

    if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, alert: result.rows[0] });
}, { permission: 'stock_alerts.ack' });
