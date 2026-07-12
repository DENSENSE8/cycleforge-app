/**
 * POST /api/auth/signout
 *
 * Revokes the current session and clears the cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, loadSession, SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME, readSessionSid } from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { clockOut } from '@/lib/auth/shift-clock';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

export async function POST(req: NextRequest) {
  const sid = readSessionSid(req.cookies);
  let punchSummary: { id: number; breakMinutes: number } | null = null;
  if (sid) {
    // Sign-out == clock-out. Look up the session's staff before revoking
    // so we can close their open punch (auto-deducting lunch when the
    // punch covered the shop's default lunch window).
    const session = await loadSession(sid);
    if (session) {
      punchSummary = await clockOut(session.staffId).catch(() => null);
    }
    await revokeSession(sid);
    await audit({
      sid, event: 'signout', result: 'ok',
      ip: clientIp(req), userAgent: req.headers.get('user-agent'),
      detail: punchSummary
        ? { punchId: punchSummary.id, breakMinutes: punchSummary.breakMinutes }
        : undefined,
    });
  }
  const res = NextResponse.json({ ok: true, punch: punchSummary });
  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
  res.cookies.set(SESSION_COOKIE_NAME, '', clearOpts);
  res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', clearOpts); // drop legacy too
  return res;
}
