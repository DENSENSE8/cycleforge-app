import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

/** POST /api/testing/receiving-lines/open Record that the current operator OPENED a receiving line on Quality Control — upserts… */
export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const staffId = Number(ctx?.staffId);
    const orgId = ctx?.organizationId;
    if (!Number.isFinite(staffId) || staffId <= 0 || !orgId) {
      return NextResponse.json({ success: true, recorded: false });
    }

    const body = await request.json().catch(() => ({}));
    const lineId = Number((body as Record<string, unknown>)?.receiving_line_id);
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json(
        { success: false, error: 'receiving_line_id is required' },
        { status: 400 },
      );
    }
    const rawRecv = Number((body as Record<string, unknown>)?.receiving_id);
    const receivingId = Number.isFinite(rawRecv) && rawRecv > 0 ? rawRecv : null;

    await tenantQuery(
      orgId,
      `INSERT INTO receiving_line_testing_opens
           (organization_id, staff_id, receiving_line_id, receiving_id, opened_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (organization_id, staff_id, receiving_line_id)
         DO UPDATE SET opened_at = NOW(),
                       receiving_id = COALESCE(EXCLUDED.receiving_id, receiving_line_testing_opens.receiving_id)`,
      [orgId, staffId, lineId, receivingId],
    );

    return NextResponse.json({ success: true, recorded: true });
  },
  { permission: 'tech.qc_pass' },
);
