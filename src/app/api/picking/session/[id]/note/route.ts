import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordPickNote } from '@/lib/picking/sessions';

const NOTE_MAX = 1000;

/**
 * POST /api/picking/session/[id]/note
 *
 * The directed picker's Notes verb: a free-text note on the line's units,
 * written to each unit's inventory timeline (NOTE, source `picking.note`).
 *
 * Body: { allocation_ids: number[], text: string }
 */
export const POST = withAuth(async (request, ctx) => {
  const actorStaffId: number | null = typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  if (actorStaffId == null) {
    return NextResponse.json({ ok: false, error: 'authenticated picker required' }, { status: 401 });
  }

  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const sessionId = Number(segments[segments.length - 2]); // …/session/<id>/note
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid session id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const allocationIds = Array.isArray(body?.allocation_ids) ? body.allocation_ids.map(Number) : [];
  if (!text || text.length > NOTE_MAX) {
    return NextResponse.json({ ok: false, error: `note must be 1–${NOTE_MAX} characters` }, { status: 400 });
  }

  try {
    const result = await recordPickNote({ sessionId, allocationIds, text, actorStaffId }, ctx.organizationId);
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/picking/session/[id]/note]', err);
    return NextResponse.json({ ok: false, error: 'Could not save the note' }, { status: 500 });
  }
});
