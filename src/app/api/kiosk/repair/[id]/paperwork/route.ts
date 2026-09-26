/** GET /api/kiosk/repair/{id}/paperwork — the repair paper, printed by the tablet. */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { renderRepairPaperHtml } from '@/lib/repair/render-repair-paper';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  // `withKioskAuth` replaces Next's route context with the device principal, so the handler never receives `params`.
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('repair');
  const repairId = at === -1 ? NaN : Number(segments[at + 1]);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const html = await renderRepairPaperHtml(ctx.organizationId as OrgId, repairId);
  if (html === null) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...NO_STORE,
    },
  });
});
