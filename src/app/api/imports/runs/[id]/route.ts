import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { errorResponse } from '@/lib/api';
import { getImportRunDetail } from '@/lib/imports/queries';

export const dynamic = 'force-dynamic';

/** GET /api/imports/runs/[id] — one import run of the caller's org, with its steps. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid run id' }, { status: 400 });
    }

    const run = await getImportRunDetail(gate.ctx.organizationId, id);
    if (!run) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/imports/runs/[id]');
  }
}
