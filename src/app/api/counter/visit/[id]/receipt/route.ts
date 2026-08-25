/**
 * GET /api/counter/visit/{id}/receipt — the customer-facing paper for a
 * counter visit.
 *
 * The operator's requirement this closes: a customer walks out with paper.
 * `loadCounterVisit` (read-visit.ts) reads the whole operator ledger,
 * `buildVisitReceipt` (visit-receipt.ts) projects it down to what a customer
 * should see — voided lines dropped, repairs de-duplicated against their cart
 * line — and `renderVisitReceiptHtml` (visit-receipt-html.ts) turns that into
 * a self-contained page with no external references, so the register can
 * print it even when the shop's internet is down.
 *
 * `?print=1` fires `window.print()` on load, the same convention
 * `/api/repair-service/print/[id]` uses for its physical-printer flow. A
 * plain GET renders without it — useful for a preview tab or an emailed link.
 *
 * Gated by `walk_in.view` — the same permission the desk snapshot route
 * (`/api/counter/session/[id]`) uses for reading a counter visit. There is no
 * separate "read a settled visit" permission and this is a read, not a write,
 * so it does not warrant a new one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { loadCounterVisit } from '@/lib/counter/read-visit';
import { buildVisitReceipt } from '@/lib/counter/visit-receipt';
import { renderVisitReceiptHtml } from '@/lib/counter/visit-receipt-html';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrgLetterhead } from '@/lib/branding/letterhead';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/**
 * Visit id from the request path — the segment after `visit`, by NAME rather
 * than position. `withAuth` does not forward Next's typed route params (see
 * the note atop `withAuth.ts`'s `RouteHandler`), so every dynamic route in
 * this tree reads its id from the pathname; parsing by name means the
 * trailing `/receipt` segment can never shift an index-based read.
 */
function visitIdFromPath(pathname: string): number | null {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf('visit');
  if (at === -1) return null;
  const id = Number(segments[at + 1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
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
    const html = renderVisitReceiptHtml(receipt, { autoPrint });

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
    });
  },
  { permission: 'walk_in.view' },
);
