import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ensureRoomZoneLetters } from '@/lib/neon/location-queries';

/** POST — idempotently repair legacy rooms before building location labels. */
export const POST = withAuth(async (_req, ctx) => {
  const result = await ensureRoomZoneLetters(ctx.organizationId);
  if (result.unassigned.length > 0) {
    return NextResponse.json(
      { error: 'Every A–Z zone letter is already in use', ...result },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true, ...result });
}, { permission: 'print.label' });
