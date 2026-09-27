/** GET /api/auth/verify-email?token=… */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import {
  createSession,
  SESSION_COOKIE_NAME,
  cookieMaxAgeForSession,
} from '@/lib/auth/session';
import { hashVerificationToken } from '@/lib/auth/email-verification';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { recordStaffLoginRedirect } from '@/lib/auth/record-staff-login';

export const GET = withAuth(async (req: NextRequest) => {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  const fail = (reason: string) =>
    NextResponse.redirect(`${base || ''}/?verify_error=${reason}`);

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-verify-email',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return fail('rate_limited');

  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return fail('missing');

  const tokenHash = hashVerificationToken(token);

  // Atomically claim: succeeds only if unused + unexpired; flips used_at so it
  // can never be replayed.
  const claimed = await pool.query<{ staff_id: number }>(
    `UPDATE email_login_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING staff_id`,
    [tokenHash],
  );
  const staffId = claimed.rows[0]?.staff_id;
  if (!staffId) return fail('invalid');

  // Mark the staff's account email verified (idempotent). Best-effort: a verified
  // flag write must not break the sign-in / redirect.
  try {
    await pool.query(
      `UPDATE account_emails ae
          SET verified_at = COALESCE(ae.verified_at, now())
         FROM staff s
        WHERE s.id = $1
          AND s.account_id = ae.account_id
          AND lower(ae.email) = lower(s.email)`,
      [staffId],
    );
  } catch (err) {
    console.error('[verify-email] failed to mark account email verified', err);
  }

  // Mint a session so the verify link also signs the owner in (magic-link UX).
  const session = await createSession({
    staffId,
    deviceKind: 'personal',
    deviceLabel: 'verify-email',
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
