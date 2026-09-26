import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  getReceivingAuditPO,
  listReceivingAuditPOs,
} from '@/lib/audit-log/receiving-aggregator';

/** GET /api/audit-log/receiving ?po=<zoho_purchaseorder_id> → full timeline for one PO no `po` → most-recently-touched POs (paged)… */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    const { searchParams } = req.nextUrl;
    const po = searchParams.get('po')?.trim() || null;

    if (po) {
      const detail = await getReceivingAuditPO(po, orgId);
      if (!detail) {
        return NextResponse.json(
          { success: false, error: 'PO not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, ...detail });
    }

    const limitRaw = parseInt(searchParams.get('limit') || '25', 10);
    const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('q')?.trim() || null;

    const items = await listReceivingAuditPOs(
      {
        limit: Number.isFinite(limitRaw) ? limitRaw : 25,
        offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
        search,
      },
      orgId,
    );
    return NextResponse.json({ success: true, items });
  },
  { permission: 'admin.view_logs' },
);
