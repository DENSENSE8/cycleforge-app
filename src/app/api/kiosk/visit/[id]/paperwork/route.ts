/** GET /api/kiosk/visit/{id}/paperwork — device-authed print of every repair sheet on a completed visit. */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { loadCounterVisit } from '@/lib/counter/read-visit';
import { visitIdFromPath } from '@/lib/counter/visit-route-path';
import { renderRepairPapersHtml } from '@/lib/repair/render-repair-paper';
import { recordKioskVisitAudit } from '@/lib/counter/kiosk-visit-audit';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const visitId = visitIdFromPath(req.nextUrl.pathname);
  if (visitId === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const orgId = ctx.organizationId as OrgId;
  const visit = await loadCounterVisit(orgId, visitId);
  if (!visit) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const html = await renderRepairPapersHtml(
    orgId,
    visit.devices.map((device) => device.id),
    { autoPrint: req.nextUrl.searchParams.get('print') === '1' },
  );
  if (html === null) {
    return NextResponse.json({ error: 'NO_REPAIRS' }, { status: 404, headers: NO_STORE });
  }

  await recordKioskVisitAudit(req, ctx, {
    action: AUDIT_ACTION.KIOSK_VISIT_PRINT,
    entityId: visitId,
    extra: { kind: 'paperwork', reprint: req.nextUrl.searchParams.get('reprint') === '1' },
  });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  });
});
