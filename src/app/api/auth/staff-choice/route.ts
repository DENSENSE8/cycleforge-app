/** GET /api/auth/staff-choice (session-gated) */

import { NextRequest, NextResponse } from 'next/server';
import { loadSession, readSessionSid } from '@/lib/auth/session';
import { loadSharedStaffChoices } from '@/lib/identity/shared-staff-choice';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(req: NextRequest) {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-staff-choice',
    limit: 40,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: NO_STORE },
    );
  }

  const sid = readSessionSid(req.cookies);
  const session = sid ? await loadSession(sid) : null;
  if (!session) {
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401, headers: NO_STORE });
  }

  const choice = await loadSharedStaffChoices(session.organizationId, session.staffId);
  if (!choice) {
    return NextResponse.json({ needsStaffChoice: false }, { headers: NO_STORE });
  }

  return NextResponse.json(
    {
      needsStaffChoice: true,
      organizationName: choice.organizationName,
      staff: choice.staff,
    },
    { headers: NO_STORE },
  );
}
