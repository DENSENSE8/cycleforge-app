/** GET /api/auth/email-login/verify?token=… */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitAsync } from '@/lib/api-guard';
import {
  createSession,
  SESSION_COOKIE_NAME,
  cookieMaxAgeForSession,
} from '@/lib/auth/session';
import { recordStaffLoginRedirect } from '@/lib/auth/record-staff-login';

export const GET = withAuth(async (req: NextRequest) => {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  const fail = (reason: string) =>
    NextResponse.redirect(`${base || ''}/signin?login_error=${reason}`);

  // Per-IP throttle so a magic-link token can't be brute-forced by enumeration.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-email-login-verify',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return fail('rate_limited');

  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return fail('missing');

  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Atomically claim: succeeds (and returns staff_id) only if the token is
  // unused and unexpired; flips used_at so it can never be replayed.
  const claimed = await pool.query<{ staff_id: number }>(
    `UPDATE email_login_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING staff_id`,
    [tokenHash],
  );
  const staffId = claimed.rows[0]?.staff_id;
  if (!staffId) return fail('invalid');

  // "Keep me signed in":
  const session = await createSession({
    staffId,
    deviceKind: 'personal',
    deviceLabel: 'email-login',
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent'),
  });

  const landing = await recordStaffLoginRedirect(pool, staffId, { mobile: false });
  const res = NextResponse.redirect(`${base || ''}${landing}`);
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.sid,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: cookieMaxAgeForSession(session),
  });
  return res;
}, { allowAnonymous: true });
