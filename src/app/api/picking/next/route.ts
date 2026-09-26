import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { nextDirectedPick } from '@/lib/picking/directed-feed';

/** POST /api/picking/next */
export const POST = withAuth(async (request, ctx) => {
  const staffId: number | null = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  if (staffId == null) {
    return NextResponse.json({ ok: false, error: 'authenticated picker required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const rawRun = typeof body?.run_started_at === 'string' ? body.run_started_at.trim() : '';
  const runStartedAt = rawRun && !Number.isNaN(Date.parse(rawRun)) ? new Date(rawRun).toISOString() : null;
  const deviceId = typeof body?.device_id === 'string' && body.device_id.trim() ? body.device_id.trim() : null;
  const skipOrderIds = Array.isArray(body?.skip_order_ids)
    ? body.skip_order_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 500)
    : [];

  try {
    const next = await nextDirectedPick({ orgId: ctx.organizationId, staffId, runStartedAt, deviceId, skipOrderIds });
    return NextResponse.json({ ok: true, ...next });
  } catch (err) {
    console.error('[POST /api/picking/next]', err);
    return NextResponse.json({ ok: false, error: 'Could not load the next pick' }, { status: 500 });
  }
});
