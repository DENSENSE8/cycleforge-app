/**
 * POST /api/auth/qr/handoff/claim
 *
 * GateGuard: /m/claim + SignInQrScanDialog. Public. Mints phone session from
 * desk_to_phone handoff via token OR the 6-digit short code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import {
  claimDeskToPhoneHandoff,
  claimDeskToPhoneHandoffByShortCode,
  getQrLoginSessionByShortCode,
  getQrLoginSessionByToken,
} from '@/lib/auth/qr-login';
import { parseHandoffDisplayCode } from '@/lib/auth/qr-handoff-code';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import pool from '@/lib/db';
import type { QrLoginSessionRow } from '@/lib/auth/qr-login';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-handoff-claim',
    limit: 40,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const shortCodeRaw =
    typeof body.shortCode === 'string'
      ? body.shortCode
      : typeof body.code === 'string'
        ? body.code
        : '';
  const shortCode = parseHandoffDisplayCode(shortCodeRaw);

  if (!token && !shortCode) {
    return NextResponse.json({ error: 'TOKEN_OR_CODE_REQUIRED' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');

  try {
    let peek: QrLoginSessionRow | null = null;
    if (token) {
      peek = await getQrLoginSessionByToken(token);
    } else if (shortCode) {
      peek = await getQrLoginSessionByShortCode(shortCode);
    }

    if (!peek) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (peek.flow !== 'desk_to_phone') {
      return NextResponse.json({ error: 'WRONG_FLOW' }, { status: 400 });
    }
    if (peek.status === 'expired') {
      return NextResponse.json({ error: 'EXPIRED' }, { status: 410 });
    }
    if (peek.status === 'consumed') {
      return NextResponse.json({ error: 'ALREADY_CONSUMED' }, { status: 409 });
    }

    const claimed = token
      ? await claimDeskToPhoneHandoff(token)
      : await claimDeskToPhoneHandoffByShortCode(shortCode!);
    if (!claimed?.staff_id) {
      return NextResponse.json({ error: 'CLAIM_FAILED' }, { status: 409 });
    }

    const staffRes = await pool.query<{ name: string; status: string }>(
      `SELECT name, status FROM staff WHERE id = $1 LIMIT 1`,
      [claimed.staff_id],
    );
    const staff = staffRes.rows[0];
    if (!staff || staff.status !== 'active') {
      return NextResponse.json({ error: 'STAFF_NOT_ACTIVE' }, { status: 403 });
    }

    const session = await createSession({
      staffId: claimed.staff_id,
      deviceKind: 'phone',
      persistent: claimed.persistent,
      ip,
      userAgent: ua,
    });

    await audit({
      staffId: claimed.staff_id,
      sid: session.sid,
      event: 'signin.qr_handoff_claim',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: {
        via: 'desk_to_phone',
        qrSessionId: claimed.id,
        shortCode: claimed.short_code,
        claimedBy: token ? 'token' : 'short_code',
      },
    });

    const res = NextResponse.json({
      ok: true,
      staffName: staff.name,
      redirectUrl: '/m/home',
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
  } catch (err) {
    console.error('[/api/auth/qr/handoff/claim] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
