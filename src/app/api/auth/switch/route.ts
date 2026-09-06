/**
 * POST /api/auth/switch
 *
 * Body: { staffId: number, pin: string, deviceKind?: 'station' | 'personal',
 *         persistent?: boolean }
 *
 * `persistent` ("Keep me signed in") is omitted by the switch sheet, which has
 * no checkbox — it then INHERITS the session being switched away from, because
 * this is a re-mint on the same physical device.
 *
 * Like /signin, but the caller is already authenticated as some OTHER staff.
 * The current session is revoked first (clean audit trail; the prior sid
 * can't be reused even if a copy escaped). A fresh session is created for
 * the new staffId, the cookie is overwritten.
 *
 * Audit event: `signin.switch` with detail.previousStaffId so the chain of
 * "who was here" is recoverable.
 *
 * Because no prior session is required, this is a PIN oracle unless it is
 * bounded: throttled per IP and per target staffId, and refused outright for a
 * staffer forced onto password auth (mirrors /api/auth/signin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import {
  createSession,
  asPersistentFlag,
  cookieMaxAgeForSession,
  loadSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  readSessionSid,
  sessionHandle,
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { resolveOrgIdFromRequest } from '@/lib/tenancy/resolve-org-from-request';
import { getStaffAuthMethod } from '@/lib/auth/auth-policy';
import { checkRateLimitAsync, clientIpOrNull } from '@/lib/api-guard';

export const runtime = 'nodejs';

function asDeviceKind(raw: unknown): DeviceKind {
  if (raw === 'personal' || raw === 'station' || raw === 'phone') return raw;
  return 'station';
}

export async function POST(req: NextRequest) {
  // Trusted-hop client IP (api-guard): the leftmost x-forwarded-for hop is
  // caller-chosen, which made every IP-keyed throttle and audit row forgeable.
  const ip = clientIpOrNull(req.headers);
  const ua = req.headers.get('user-agent');
  let staffIdForAudit: number | null = null;

  try {
    // Per-IP throttle: this route verifies PINs and needs NO prior session, so
    // it is the cheapest brute-force surface in the auth set.
    const ipRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-switch',
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfterSec: ipRl.retryAfterSec },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const staffId = Number((body as { staffId?: unknown }).staffId);
    const pin = String((body as { pin?: unknown }).pin ?? '');
    const deviceKind = asDeviceKind((body as { deviceKind?: unknown }).deviceKind);
    const deviceLabel = ((body as { deviceLabel?: unknown }).deviceLabel ?? null) as string | null;

    if (!Number.isFinite(staffId) || staffId <= 0) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'staffId' }, { status: 400 });
    }
    staffIdForAudit = staffId;
    if (!pin) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'pin' }, { status: 400 });
    }

    // Per-target-staff throttle so one staffer's 4-digit PIN can't be walked
    // faster than the per-IP budget allows across rotating sources.
    const staffRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-switch-staff',
      scope: String(staffId),
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!staffRl.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfterSec: staffRl.retryAfterSec },
        { status: 429 },
      );
    }

    // Same refusal as /api/auth/signin: a staffer forced onto password auth
    // must not be reachable through a stale PIN on the station switcher.
    if ((await getStaffAuthMethod(staffId)) === 'password') {
      await audit({
        staffId, event: 'signin.switch', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'auth_method_password' },
      });
      return NextResponse.json(
        { error: 'AUTH_METHOD_PASSWORD_REQUIRED', hint: 'Sign in with your email and password.' },
        { status: 403 },
      );
    }

    // Read the current sid (if any) so we can revoke it once the new
    // session is minted. Don't require a current session — a /signin-like
    // flow should still work if the cookie was cleared in another tab.
    const prevSid = readSessionSid(req.cookies);
    const prev = prevSid ? await loadSession(prevSid) : null;

    // Tenant scope: you may only switch to a staff member in the SAME org as
    // your current session (or, signin-like with no prior session, the org of
    // the request's tenant). A cross-org staffId reads as NOT_FOUND → 404,
    // so a station bound to org A can't pivot into org B even with a leaked PIN.
    const targetOrgId = prev?.organizationId ?? (await resolveOrgIdFromRequest(req));
    const row = await verifyStaffPin(staffId, pin, targetOrgId);
    if (row.status !== 'active') {
      await audit({
        staffId, event: 'signin.switch', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'status', status: row.status, previousStaffId: prev?.staffId ?? null },
      });
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE', status: row.status }, { status: 403 });
    }

    const persistent = (body as { persistent?: unknown }).persistent === undefined
      ? (prev?.persistent ?? false)
      : asPersistentFlag((body as { persistent?: unknown }).persistent);

    const session = await createSession({
      staffId,
      deviceKind,
      deviceLabel,
      ip,
      userAgent: ua,
      persistent,
    });

    // Revoke the previous session AFTER the new one is created so a crash
    // between the two doesn't leave the user stranded.
    if (prev && prev.staffId !== staffId) {
      await revokeSession(prev.sid);
    }

    await audit({
      staffId, sid: session.sid,
      event: 'signin.switch', result: 'ok',
      ip, userAgent: ua,
      detail: {
        deviceKind,
        persistent,
        previousStaffId: prev?.staffId ?? null,
        previousSid: prev?.sid ?? null,
      },
    });

    const res = NextResponse.json({
      ok: true,
      staffId,
      role: row.role,
      name: row.name,
      // Handle, not the raw bearer sid — the cookie carries the credential.
      session: { sid: sessionHandle(session.sid), deviceKind: session.deviceKind, expiresAt: session.expiresAt },
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
        staffId: staffIdForAudit, event: 'signin.switch', result: 'denied', ip, userAgent: ua,
        detail: { code: err.code },
      });
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'NO_PIN' ? 409
        : err.code === 'LOCKED' ? 423
        : 401;
      return NextResponse.json({ error: err.code }, { status });
    }
    console.error('[/api/auth/switch] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
