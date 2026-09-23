/**
 * GET /api/kiosk/repair/{id}/paperwork — the repair paper, printed by the tablet.
 *
 * Callers: the kiosk History face's repair detail pane (its Print action opens
 *   this in a tab; the document auto-prints on load).
 * Affected API: this route (device cookie, `withKioskAuth`).
 * Data schemas: none of its own — `renderRepairPaperHtml` owns every query
 *   (`repair_service`, `documents` signatures, `repair_actions`, letterhead).
 *
 * The device twin of `/api/repair-service/print/[id]`, byte-for-byte the same
 * sheet of paper; only the gate and the error shapes differ.
 *
 * Device-authed with no sign-in, for the same reason the repair detail read is:
 * the FACE is what asks who you are — History refuses to mount on the customer
 * posture — and the tablet already LISTS this repair and OPENS it there. The
 * paper is that same record on a page, so printing it grants nothing the
 * counter attendant could not already read off the glass. Requiring a staff
 * session here would only mean the one machine standing next to the printer is
 * the one machine that cannot use it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { renderRepairPaperHtml } from '@/lib/repair/render-repair-paper';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  // `withKioskAuth` replaces Next's route context with the device principal, so
  // the handler never receives `params`. The id comes off the path — and the
  // LAST segment here is `paperwork`, so take the one after `repair`, the same
  // parse `/api/kiosk/repair/[id]` makes.
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
