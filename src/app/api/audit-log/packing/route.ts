import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseFilters } from '@/lib/audit-log/filters';
import {
  getPackingTrackingDetail,
  listPackingTrackings,
} from '@/lib/audit-log/packing-aggregator';

/** GET /api/audit-log/packing ?tracking=<value> → full timeline for one tracking no `tracking` → most-recent packer events grouped by tracking */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = req.nextUrl;
    const filters = parseFilters(searchParams);
    const tracking = searchParams.get('tracking')?.trim() || null;

    if (tracking) {
      const detail = await getPackingTrackingDetail(tracking, filters, orgId);
      if (!detail) {
        return NextResponse.json(
          { success: false, error: 'Tracking not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, ...detail });
    }

    const items = await listPackingTrackings(
      {
        filters,
        search: filters.q,
      },
      orgId,
    );
    return NextResponse.json({ success: true, items });
  },
  { permission: 'admin.view_logs' },
);
