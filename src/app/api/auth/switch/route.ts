/** POST /api/auth/switch */

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
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { resolveOrgIdFromRequest } from '@/lib/tenancy/resolve-org-from-request';
import { AUTH_PER_IP_LIMIT_PER_10_MIN, checkRateLimitAsync } from '@/lib/api-guard';

const WINDOW_MS = 10 * 60 * 1000;

function rateLimited(retryAfterSec: number | undefined): NextResponse {
  return NextResponse.json(
    { error: 'RATE_LIMITED' },
    { status: 429, headers: retryAfterSec ? { 'retry-after': String(retryAfterSec) } : undefined },
  );
}

export const runtime = 'nodejs';

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
    // Per-IP ceiling sized for a shared warehouse NAT (a switch is a sign-in).
    const ipRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-switch',
      limit: AUTH_PER_IP_LIMIT_PER_10_MIN,
      windowMs: WINDOW_MS,
    });
    if (!ipRl.ok) return rateLimited(ipRl.retryAfterSec);

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

    // Read the current sid (if any) so we can revoke it once the new
    // session is minted. Don't require a current session — a /signin-like
    // flow should still work if the cookie was cleared in another tab.
    const prevSid = readSessionSid(req.cookies);
    const prev = prevSid ? await loadSession(prevSid) : null;

    // Tenant scope: always resolved (session org, else the request's tenant slug),
    // so the PIN read and the login stamp below run under this org's GUC.
    const orgId = prev?.organizationId ?? (await resolveOrgIdFromRequest(req));
    // Per-target-staff throttle, independent of IP.
    const staffRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-switch-staff',
      scope: `${orgId}:${staffId}`,
      ipAgnostic: true,
      limit: 10,
      windowMs: WINDOW_MS,
    });
    if (!staffRl.ok) return rateLimited(staffRl.retryAfterSec);
    // A staff switch IS a sign-in — it stamps last_login_at.
    const row = await verifyStaffPin(staffId, pin, orgId, { recordLogin: true });
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
      session: { sid: session.sid, deviceKind: session.deviceKind, expiresAt: session.expiresAt },
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
