/** POST /api/auth/signin */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';
import {
  createSession,
  cookieMaxAgeForSession,
  asPersistentFlag,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { findActiveShift, clockIn } from '@/lib/auth/shift-clock';
import { getStaffAuthMethod } from '@/lib/auth/auth-policy';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const runtime = 'nodejs';

function isPinlessEnabled(): boolean {
  const v = (process.env.AUTH_PINLESS_SIGNIN ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

function asDeviceKind(raw: unknown): DeviceKind {
  if (raw === 'personal' || raw === 'station' || raw === 'phone') return raw;
  return 'station';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  let staffIdForAudit: number | null = null;

  try {
    // Per-IP throttle: this route verifies PINs by staffId, so it must resist
    // credential-stuffing bursts. Warns (does not hard-fail) when Upstash is
    // unset — see api-guard boot warning.
    const rl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-signin',
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED' },
        { status: 429, headers: rl.retryAfterSec ? { 'retry-after': String(rl.retryAfterSec) } : undefined },
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const staffId = Number((body as { staffId?: unknown }).staffId);
    const pin = String((body as { pin?: unknown }).pin ?? '');
    const deviceKind = asDeviceKind((body as { deviceKind?: unknown }).deviceKind);
    const deviceLabel = ((body as { deviceLabel?: unknown }).deviceLabel ?? null) as string | null;
    const persistent = asPersistentFlag((body as { persistent?: unknown }).persistent);

    if (!Number.isFinite(staffId) || staffId <= 0) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'staffId' }, { status: 400 });
    }
    staffIdForAudit = staffId;

    // Tenant scope: resolve the org from the request BEFORE verifying anything.
    // Apex / unknown slug → nil org → 404, so an unscoped PIN can never sign in
    // globally (the leak). PIN + pinless paths below are both org-scoped.
    const orgId = await resolveOrgIdFromRequest(req);
    if (orgId === NIL_ORG_ID) {
      await audit({
        staffId, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'tenant_required' },
      });
      return NextResponse.json({ error: 'TENANT_REQUIRED' }, { status: 404 });
    }

    // WS6.1: staff forced onto password auth must use the account (email + password) entry point — refuse the station PIN/pinless path.
    if ((await getStaffAuthMethod(staffId)) === 'password') {
      await audit({
        staffId, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'auth_method_password' },
      });
      return NextResponse.json(
        { error: 'AUTH_METHOD_PASSWORD_REQUIRED', hint: 'Sign in with your email and password.' },
        { status: 403 },
      );
    }

    const pinless = !pin && isPinlessEnabled();

    if (!pin && !pinless) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'pin' }, { status: 400 });
    }

    let row: { name: string; role: string; status: string; default_home_path: string | null; default_home_path_mobile: string | null };
    // PIN path stamps last_login_at inside verifyStaffPin; pinless stamps it
    // below once the account is known active.
    if (pinless) {
      const lookup = await pool.query<{ name: string; role: string; status: string; default_home_path: string | null; default_home_path_mobile: string | null }>(
        `SELECT name, role, COALESCE(status, 'active') AS status, default_home_path, default_home_path_mobile
           FROM staff
          WHERE id = $1
            AND organization_id = $2
            AND COALESCE(active, true) = true
          LIMIT 1`,
        [staffId, orgId],
      );
      const found = lookup.rows[0];
      if (!found) {
        await audit({
          staffId, event: 'signin.pinless', result: 'denied', ip, userAgent: ua,
          detail: { reason: 'not_found' },
        });
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      row = found;
    } else {
      const verified = await verifyStaffPin(staffId, pin, orgId, { recordLogin: true });
      row = verified;
    }
    if (row.status !== 'active') {
      await audit({
        staffId, event: pinless ? 'signin.pinless' : 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'status', status: row.status },
      });
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE', status: row.status }, { status: 403 });
    }

    if (pinless) {
      await recordStaffLogin(pool, staffId);
    }

    // Sign-in == clock-in (soft gate).
    const activeShift = await findActiveShift(staffId);

    const session = await createSession({
      staffId,
      deviceKind,
      deviceLabel,
      ip,
      userAgent: ua,
      persistent,
      // Only bind expiry to shift end when a shift is actually present.
      // createSession ignores this for a persistent session — "keep me signed
      // in" must outlive the shift, or the checkbox is a lie again.
      ...(activeShift ? { expiresAt: activeShift.ends_at } : {}),
    });

    // Open the clock-in punch either tied to the shift or off-the-books.
    // clockIn is idempotent (DB unique index + re-fetch on conflict).
    const punch = await clockIn(staffId, activeShift?.id ?? null, 'pin');

    await audit({
      staffId, sid: session.sid, event: pinless ? 'signin.pinless' : 'signin.pin', result: 'ok',
      ip, userAgent: ua,
      detail: {
        deviceKind, deviceLabel, pinless, persistent,
        shiftId: activeShift?.id ?? null,
        punchId: punch?.id ?? null,
        unscheduled: !activeShift,
      },
    });

    const res = NextResponse.json({
      ok: true,
      staffId,
      role: row.role,
      name: row.name,
      defaultHomePath: row.default_home_path,
      defaultHomePathMobile: row.default_home_path_mobile,
      session: {
        sid: session.sid,
        deviceKind: session.deviceKind,
        expiresAt: session.expiresAt,
      },
      shift: activeShift
        ? { id: activeShift.id, startsAt: activeShift.starts_at, endsAt: activeShift.ends_at }
        : null,
      punchId: punch?.id ?? null,
    });
    res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAgeForSession(session),
    });
    res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof PinError) {
      await audit({
        staffId: staffIdForAudit, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { code: err.code },
      });
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'NO_PIN' ? 409
        : 401;
      return NextResponse.json({ error: err.code }, { status });
    }
    console.error('[/api/auth/signin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
