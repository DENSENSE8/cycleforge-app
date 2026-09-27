/** GET /api/auth/enroll/[token] Returns staff info for the enrollment page to render. */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { consumeEnrollment, loadEnrollment } from '@/lib/auth/enrollment';
import { setStaffPin, PinError, hashPin } from '@/lib/auth/pin';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const enr = await loadEnrollment(token);
  if (!enr) {
    return NextResponse.json({ error: 'INVALID_ENROLLMENT' }, { status: 404 });
  }
  const r = await pool.query(`SELECT id, name, role FROM staff WHERE id = $1 LIMIT 1`, [enr.staffId]);
  const row = r.rows[0] as { id: number; name: string; role: string } | undefined;
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({
    staff: { id: row.id, name: row.name, role: row.role },
    expiresAt: enr.expiresAt,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const pinRaw = (body as { pin?: unknown }).pin;
    const pin = pinRaw != null && String(pinRaw).trim() !== '' ? String(pinRaw) : '';

    if (pin) {
      // Validate shape before consuming so a bad PIN doesn't burn the token.
      try {
        await hashPin(pin);
      } catch (err) {
        if (err instanceof PinError) {
          return NextResponse.json({ error: err.code }, { status: 400 });
        }
        throw err;
      }
    } else {
      // Passkey-only completion: Face ID must already be on this staff row.
      const peek = await loadEnrollment(token);
      if (!peek) {
        return NextResponse.json({ error: 'INVALID_ENROLLMENT' }, { status: 404 });
      }
      const pk = await pool.query(
        `SELECT 1 FROM staff_passkeys WHERE staff_id = $1 LIMIT 1`,
        [peek.staffId],
      );
      if (pk.rowCount === 0) {
        return NextResponse.json({ error: 'PASSKEY_REQUIRED' }, { status: 400 });
      }
    }

    const enr = await consumeEnrollment(token);
    if (!enr) {
      return NextResponse.json({ error: 'INVALID_ENROLLMENT' }, { status: 404 });
    }

    if (pin) {
      await setStaffPin(enr.staffId, pin);
    }
    await pool.query(`UPDATE staff SET status = 'active' WHERE id = $1 AND status = 'invited'`, [enr.staffId]);

    // Phone session: 4-hour handoff window (matches Ably token TTL).
    const session = await createSession({
      staffId: enr.staffId,
      deviceKind: 'phone',
      deviceLabel: 'Enrollment phone',
      ip,
      userAgent: ua,
    });
    // The enrollment phone session is this staff member's sign-in on the phone.
    await recordStaffLogin(pool, enr.staffId);
    await audit({
      staffId: enr.staffId,
      sid: session.sid,
      event: 'enrollment.consumed',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: { token: token.slice(0, 6) + '…', hasPin: Boolean(pin) },
    });

    const res = NextResponse.json({
      ok: true,
      staffId: enr.staffId,
      session: { sid: session.sid, deviceKind: session.deviceKind, expiresAt: session.expiresAt },
    });
    res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAgeForSession(session),
    });
    return res;
  } catch (err) {
    if (err instanceof PinError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    console.error('[/api/auth/enroll] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
