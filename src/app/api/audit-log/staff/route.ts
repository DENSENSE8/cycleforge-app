import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseFilters } from '@/lib/audit-log/filters';
import { getStaffDetail } from '@/lib/audit-log/staff-aggregator';

/** GET /api/audit-log/staff ?staffId=<int> → cross-section feed for one staff member */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = req.nextUrl;
    const filters = parseFilters(searchParams);

    if (filters.staffId == null) {
      return NextResponse.json(
        { success: false, error: 'Pick a staff member with the sidebar combobox.' },
        { status: 400 },
      );
    }

    const detail = await getStaffDetail(filters.staffId, filters, orgId);
    if (!detail) {
      return NextResponse.json(
        { success: false, error: 'Staff not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, ...detail });
  },
  { permission: 'admin.view_logs' },
);
