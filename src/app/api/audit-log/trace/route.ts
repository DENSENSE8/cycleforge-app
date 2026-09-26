import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getSerialTrace } from '@/lib/audit-log/trace-aggregator';

/** GET /api/audit-log/trace?serial=<value> */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const serial = req.nextUrl.searchParams.get('serial')?.trim() || '';
    if (!serial) {
      return NextResponse.json(
        { success: false, error: 'serial query param is required' },
        { status: 400 },
      );
    }
    try {
      const trace = await getSerialTrace(serial, ctx.organizationId);
      return NextResponse.json({ success: true, ...trace });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'audit-log/trace read failed';
      console.error('audit-log/trace GET failed:', err);
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  },
  { permission: 'admin.view_logs' },
);
