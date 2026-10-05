/**
 * `GET /api/support/list?view=&status=a,b&platform=1,2&account=&assignee=3,none&sort=&group=&q=`
 * — the /support record list (local tables only): rows for the view + status
 * chips + facets, the chip counts (view + facets, status ignored) and the clock
 * the statuses were computed against.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { errorResponse } from '@/lib/api';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { cutSupportList, parseSupportListFilter } from '@/lib/support/list/support-list';
import { listSupportRows } from '@/lib/support/list/support-list-db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.view');
    if (gate.denied) return gate.denied;
    const params = req.nextUrl.searchParams;
    const nowMs = Date.now();
    const all = await listSupportRows(gate.ctx.organizationId, { q: params.get('q'), nowMs });
    const { rows, statusCounts, total } = cutSupportList(all, parseSupportListFilter(params), nowMs);
    return NextResponse.json({ success: true, rows, statusCounts, total, nowMs });
  } catch (error) {
    return errorResponse(error, 'GET /api/support/list');
  }
}
