/**
 * GET /api/kiosk/visit/{id}/receipt — device-authed print of a completed visit.
 *
 * Callers: KioskCartLedger print buttons.
 * Affected API: GET /api/kiosk/visit/[id]/receipt (device cookie).
 * Data schemas: VisitReceipt HTML from buildVisitReceipt + renderVisitReceiptHtml.
 * User: "print out a receipt including everything no matter repair service sales order" and "give internal staff as an internal record"
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { loadCounterVisit } from '@/lib/counter/read-visit';
import { buildVisitReceipt } from '@/lib/counter/visit-receipt';
import { renderVisitReceiptHtml } from '@/lib/counter/visit-receipt-html';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrgLetterhead } from '@/lib/branding/letterhead';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function visitIdFromPath(pathname: string): number | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('visit');
  if (at === -1) return null;
  const id = Number(segments[at + 1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  });
});
