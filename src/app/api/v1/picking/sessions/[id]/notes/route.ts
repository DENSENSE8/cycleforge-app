import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordPickNote } from '@/lib/picking/sessions';
import { pickNoteBodySchema, pickingV1Error, pickingV1ErrorFromStatus } from '@/lib/picking/picking-v1-contract';

export const runtime = 'nodejs';

/** POST /api/v1/picking/sessions/{id}/notes — a picker note on units of the session. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const sessionId = Number(request.nextUrl.pathname.split('/').at(-2));
  const parsed = pickNoteBodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(sessionId) || sessionId <= 0 || !parsed.success) {
    return NextResponse.json(pickingV1Error('INVALID_REQUEST', 'A session id, allocationIds and 1–1000 characters of text are required.'), { status: 400 });
  }
  const result = await recordPickNote(
    { sessionId, allocationIds: parsed.data.allocationIds, text: parsed.data.text, actorStaffId: ctx.staffId },
    ctx.organizationId,
  );
  if (!result.ok) return NextResponse.json(pickingV1ErrorFromStatus(result.status, result.error), { status: result.status });
  return NextResponse.json({ data: { recorded: result.recorded } });
}, { permission: 'orders.view' });
