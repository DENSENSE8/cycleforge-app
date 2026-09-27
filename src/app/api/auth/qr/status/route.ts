import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getQrLoginSessionByToken, claimQrLoginSession } from '@/lib/auth/qr-login';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';
import pool from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
  }

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-status',
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  try {
    const sessionRow = await getQrLoginSessionByToken(token);
    if (!sessionRow) {
      return NextResponse.json({ status: 'not_found' });
    }

    if (sessionRow.status === 'pending') {
      return NextResponse.json({ status: 'pending' });
    }

    if (sessionRow.status === 'expired') {
      return NextResponse.json({ status: 'expired' });
    }

    if (sessionRow.status === 'consumed') {
      return NextResponse.json({ status: 'consumed' });
    }

    if (sessionRow.status === 'authorized' && sessionRow.staff_id) {
      // Atomic claim
      const claimed = await claimQrLoginSession(token);
      if (!claimed || !claimed.staff_id) {
        return NextResponse.json({ status: 'already_consumed' });
      }

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = req.headers.get('user-agent');

      const staffRes = await pool.query<{ name: string; organization_id: string }>(
        `SELECT name, organization_id FROM staff WHERE id = $1 LIMIT 1`,
        [claimed.staff_id],
      );
      const staff = staffRes.rows[0];

      const session = await createSession({
        staffId: claimed.staff_id,
        deviceKind: 'personal',
        persistent: claimed.persistent,
        ip,
        userAgent: ua,
      });

      await audit({
        staffId: claimed.staff_id,
        sid: session.sid,
        event: 'signin.qr_code',
        result: 'ok',
        ip,
        userAgent: ua,
        detail: { via: 'qr_phone_cross_device', qrSessionId: claimed.id },
      });

      // The desk claiming the session IS the sign-in (the phone's PIN authorize
      // does not stamp), so the login is recorded here.
      const login = await recordStaffLogin(pool, claimed.staff_id);

      const res = NextResponse.json({
        status: 'completed',
        staffId: claimed.staff_id,
        staffName: staff?.name || null,
        role: login.role,
        defaultHomePath: login.defaultHomePath,
        defaultHomePathMobile: login.defaultHomePathMobile,
        redirectUrl: '/',
      });

      res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: cookieMaxAgeForSession(session),
      });

      res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });

      return res;
    }

    return NextResponse.json({ status: sessionRow.status });
  } catch (err) {
    console.error('[/api/auth/qr/status] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
