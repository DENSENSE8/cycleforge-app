/** POST /api/auth/passkey/authenticate/begin */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthenticationOptions, PASSKEY_CHALLENGE_COOKIE } from '@/lib/auth/webauthn';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimitAsync({
      headers: req.headers, routeKey: 'auth-passkey-authenticate-begin', limit: 30, windowMs: 10 * 60 * 1000,
    });
    if (!rl.ok) return NextResponse.json({ error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec }, { status: 429 });
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const staffIdRaw = (body as { staffId?: unknown }).staffId;
    const staffId = staffIdRaw !== undefined ? Number(staffIdRaw) : null;
    const options = await buildAuthenticationOptions({
      req,
      staffId: Number.isFinite(staffId!) && staffId! > 0 ? staffId : null,
    });
    const payload = Buffer.from(JSON.stringify({
      challenge: options.challenge,
      staffId: Number.isFinite(staffId!) && staffId! > 0 ? staffId : null,
    })).toString('base64url');
    const res = NextResponse.json({ options });
    res.cookies.set(PASSKEY_CHALLENGE_COOKIE, payload, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 5 * 60,
    });
    return res;
  } catch (err) {
    console.error('[passkey/authenticate/begin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
