import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseFilters } from '@/lib/audit-log/filters';
import {
  getTechSessionDetail,
  listTechSessions,
} from '@/lib/audit-log/tech-aggregator';

/** GET /api/audit-log/tech ?session=<tracking> → full timeline for one tech session no `session` → most-recent tech sessions grouped by… */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = req.nextUrl;
    const filters = parseFilters(searchParams);
    const session = searchParams.get('session')?.trim() || null;

    if (session) {
      const detail = await getTechSessionDetail(session, filters, orgId);
      if (!detail) {
        return NextResponse.json(
          { success: false, error: 'Session not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, ...detail });
    }

    const items = await listTechSessions(
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
