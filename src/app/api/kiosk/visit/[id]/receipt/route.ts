/** GET /api/kiosk/visit/{id}/receipt — device-authed print of a completed visit. */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { loadCounterVisit } from '@/lib/counter/read-visit';
import { visitIdFromPath } from '@/lib/counter/visit-route-path';
import { buildVisitReceipt } from '@/lib/counter/visit-receipt';
import { renderVisitReceiptHtml } from '@/lib/counter/visit-receipt-html';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrgLetterhead } from '@/lib/branding/letterhead';
import { parseOrgSettings } from '@/lib/tenancy/settings';
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
  const [visit, org] = await Promise.all([
    loadCounterVisit(orgId, visitId),
    getOrganization(orgId),
  ]);

  if (!visit) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const letterhead = getOrgLetterhead({
    name: org?.name ?? '',
    settings: org?.settings ?? parseOrgSettings(undefined),
  });

  const receipt = buildVisitReceipt(visit, letterhead);
  const autoPrint = req.nextUrl.searchParams.get('print') === '1';
  const copy = req.nextUrl.searchParams.get('copy') === 'staff' ? 'staff' : 'customer';
  const html = renderVisitReceiptHtml(receipt, { autoPrint, copy });

  const reprint = req.nextUrl.searchParams.get('reprint') === '1';
  await recordKioskVisitAudit(req, ctx, {
    action: AUDIT_ACTION.KIOSK_VISIT_PRINT,
    entityId: visitId,
    extra: { kind: 'receipt', copy, reprint },
  });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  });
});
