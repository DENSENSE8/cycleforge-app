import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getPrintHistoryForUnit } from '@/lib/labels/print-jobs';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** GET /api/serial-units/[id]/print-history */
export const GET = withAuth(
  async (request, ctx) => {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    // .../api/serial-units/[id]/print-history → id is segments[-2]
    const serialUnitId = Number(segments[segments.length - 2]);
    if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid serial_unit id' }, { status: 400 });
    }

    const limitRaw = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;

    const jobs = await getPrintHistoryForUnit(serialUnitId, ctx.organizationId as OrgId, limit);
    return NextResponse.json({ ok: true, jobs });
  },
  { permission: 'print.label' },
);
