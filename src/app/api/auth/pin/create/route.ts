/**
 * POST /api/auth/pin/create
 *
 * Self-serve PIN creation for an unenrolled staff. Public endpoint that ONLY
 * succeeds when staff.pin_hash IS NULL — it cannot be used to reset or
 * overwrite an existing PIN. After setting the PIN, mints a session and sets
 * the cf_sid session cookie so the user lands authenticated.
 *
 * Body: { staffId: number, pin: string, deviceKind?: 'station' | 'phone' | 'personal',
 *         deviceLabel?: string, persistent?: boolean }
 *
 * Security trade-off (intentional, small-shop UX): anyone at the kiosk can
 * pick an unenrolled staff and set their PIN. Once set, only the owner of
 * that PIN can sign in. To rotate later, an admin must clear pin_hash first.
 *
 * Bounded, not gated (self-serve first-PIN enrolment is a live flow): per-IP
 * and per-staffId throttles, and an `pin.self_create` audit row on success and
 * on every refusal, so an attempt to claim someone's unenrolled row is visible.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import { hashPin, isObviousPin, PinError } from '@/lib/auth/pin';
import {
  createSession,
  cookieMaxAgeForSession,
  asPersistentFlag,
  SESSION_COOKIE_NAME,
  sessionHandle,
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { getStaffRole } from '@/lib/auth/permissions';
import { checkRateLimitAsync, clientIpOrNull } from '@/lib/api-guard';

export const runtime = 'nodejs';

function asDeviceKind(raw: unknown): DeviceKind {
  if (raw === 'station' || raw === 'personal' || raw === 'phone') return raw;
  return 'station';
}

export async function POST(req: NextRequest) {
  // Trusted-hop client IP (api-guard): the leftmost x-forwarded-for hop is
  // caller-chosen, which made every IP-keyed throttle and audit row forgeable.
  const ip = clientIpOrNull(req.headers);
  const ua = req.headers.get('user-agent');
  let staffIdForAudit: number | null = null;

  // Every refusal on this public surface gets an audit row — claiming a
  // colleague's unenrolled PIN must never be a silent action.
  const deny = async (reason: string, detail?: Record<string, unknown>): Promise<void> => {
    await audit({
      staffId: staffIdForAudit,
      event: 'pin.self_create',
      result: 'denied',
      ip,
      userAgent: ua,
      detail: { reason, ...detail },
    });
  };

  try {
    // Per-IP throttle: enrolment writes a credential the caller chose, so it
    // must not be walkable across the roster from one host.
    const ipRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-pin-create',
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRl.ok) {
      await deny('rate_limited_ip');
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
    const persistent = asPersistentFlag((body as { persistent?: unknown }).persistent);

    if (!Number.isFinite(staffId) || staffId <= 0) {
      await deny('invalid_staff_id');
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'staffId' }, { status: 400 });
    }
    staffIdForAudit = staffId;

    // Per-staff throttle: enrolment is a once-per-staffer action, so a burst
    // against one id is always abuse.
    const staffRl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-pin-create-staff',
      scope: String(staffId),
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!staffRl.ok) {
      await deny('rate_limited_staff');
      return NextResponse.json(
        { error: 'RATE_LIMITED', retryAfterSec: staffRl.retryAfterSec },
        { status: 429 },
      );
    }

    if (!pin) {
      await deny('missing_pin');
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'pin' }, { status: 400 });
    }
    if (isObviousPin(pin)) {
      await deny('weak_pin');
      return NextResponse.json({ error: 'WEAK_PIN' }, { status: 400 });
    }

    let pinHash: string;
    try {
      pinHash = await hashPin(pin);
    } catch (err) {
      if (err instanceof PinError) {
        return NextResponse.json({ error: err.code }, { status: 400 });
      }
      throw err;
    }

    // Tenant scope: a staffId from another org matches no row here → 404.
    // Apex / unknown slug → nil org → the UPDATE below matches nothing → 404,
    // so this public kiosk route can never enroll a dogfood tenant's staff.
    const orgId = await resolveOrgIdFromRequest(req);
    if (orgId === NIL_ORG_ID) {
      await deny('tenant_required');
      return NextResponse.json({ error: 'TENANT_REQUIRED' }, { status: 404 });
    }

    // Org policy: when requirePasskeyForNewStaff is on, new staff must enroll a
    // passkey — self-serve PIN creation is refused so a PIN-only account can't
    // slip past the stricter device policy.
    const settingsR = await pool.query<{ settings: unknown }>(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    if (parseOrgSettings(settingsR.rows[0]?.settings).requirePasskeyForNewStaff) {
      await deny('passkey_required');
      return NextResponse.json({ error: 'PASSKEY_REQUIRED' }, { status: 403 });
    }

    // Conditional update: only set if pin_hash IS NULL. If another request
    // beats us to it (or an admin enrolled them in the meantime), we get
    // zero rows back and fail closed — never overwrite an existing PIN here.
    const r = await pool.query(
      `UPDATE staff
          SET pin_hash         = $2,
              pin_set_at       = NOW(),
              pin_failed_count = 0,
              pin_locked_until = NULL,
              status           = CASE WHEN status = 'invited' THEN 'active' ELSE status END
        WHERE id = $1
          AND organization_id = $3
          AND pin_hash IS NULL
          AND COALESCE(active, true) = true
          AND COALESCE(status, 'active') IN ('active', 'invited')
        RETURNING id, name, role, status`,
      [staffId, pinHash, orgId],
    );
    const row = r.rows[0] as { id: number; name: string; role: string; status: string } | undefined;
    if (!row) {
      // Either the row doesn't exist, isn't active, or already has a PIN.
      const probe = await pool.query(
        `SELECT (pin_hash IS NOT NULL) AS has_pin, COALESCE(status, 'active') AS status
           FROM staff
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1`,
        [staffId, orgId],
      );
      const p = probe.rows[0] as { has_pin: boolean; status: string } | undefined;
      if (!p) {
        await deny('not_found');
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      if (p.has_pin) {
        await deny('pin_already_set');
        return NextResponse.json({ error: 'PIN_ALREADY_SET' }, { status: 409 });
      }
      await deny('account_not_active', { status: p.status });
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 });
    }

    const session = await createSession({
      staffId: row.id,
      deviceKind,
      deviceLabel,
      ip,
      userAgent: ua,
      persistent,
    });

    await audit({
      staffId: row.id,
      sid: session.sid,
      event: 'pin.self_create',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: { deviceKind, persistent },
    });

    const role = await getStaffRole(row.id);
    const res = NextResponse.json({
      ok: true,
      staffId: row.id,
      role,
      name: row.name,
      // Handle, not the raw bearer sid — the cookie carries the credential.
      session: { sid: sessionHandle(session.sid), deviceKind, expiresAt: session.expiresAt },
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
      await deny('pin_shape', { code: err.code });
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    console.error('[/api/auth/pin/create] error:', err);
    await audit({
      staffId: staffIdForAudit,
      event: 'pin.self_create',
      result: 'denied',
      ip,
      userAgent: ua,
      detail: { reason: 'internal' },
    });
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
