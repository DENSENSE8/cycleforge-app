import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listQcQueue } from '@/lib/qc/queue';

/** GET /api/qc/queue — every unit waiting for QC, most urgent first (`/m/qc`). */
export const GET = withAuth(
  async (_request, ctx) => {
    const staffId = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
    const queue = await listQcQueue({ orgId: ctx.organizationId, staffId });
    return NextResponse.json(queue, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: 'tech.qc_pass' },
);
