import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveReceivingSchema } from '@/utils/receiving-schema';
import { withAuth } from '@/lib/auth/withAuth';
import { trackingRawTail8 } from '@/lib/tracking-format';

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const last8 = trackingRawTail8(query);
    const { dateColumn, hasQuantity } = await resolveReceivingSchema();
    const countExpr = hasQuantity ? "COALESCE(quantity, '1')" : "'1'";

    // Search across both the canonical shipment tracking (stn.tracking_number_raw) and the legacy receiving_tracking_number text column.
    const logs = await tenantQuery(
        ctx.organizationId,
        `SELECT r.id,
                    r.${dateColumn} AS timestamp,
                    stn.tracking_number_raw AS tracking,
                    COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier) AS status,
                    ${countExpr} AS count
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
             WHERE r.organization_id = $3
               AND (
                    RIGHT(stn.tracking_number_raw::text, 8) = $1
                 OR stn.tracking_number_raw::text ILIKE $2
               )
               AND stn.tracking_number_raw IS NOT NULL
               AND stn.tracking_number_raw <> ''
             ORDER BY r.id DESC`,
        [last8, `%${query}%`, ctx.organizationId]
    );

    const formattedLogs = logs.rows.map((log: any) => ({
        id: String(log.id),
        timestamp: log.timestamp || '',
        tracking: log.tracking || '',
        status: log.status || '',
        count: parseInt(String(log.count || '1'), 10) || 1,
    }));

    return NextResponse.json({
        results: formattedLogs,
        count: formattedLogs.length,
        query: query
    });
}, { permission: 'receiving.view' });
