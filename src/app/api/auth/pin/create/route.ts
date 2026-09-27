/**
 * POST /api/auth/pin/create
 * Security trade-off (intentional, small-shop UX): anyone at the kiosk can
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
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { getStaffRole } from '@/lib/auth/permissions';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

function asDeviceKind(raw: unknown): DeviceKind {
  if (raw === 'station' || raw === 'personal' || raw === 'phone') return raw;
  return 'station';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  let staffIdForAudit: number | null = null;

  try {
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
    if (!pin) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'pin' }, { status: 400 });
    }
    if (isObviousPin(pin)) {
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
      if (!p) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      if (p.has_pin) return NextResponse.json({ error: 'PIN_ALREADY_SET' }, { status: 409 });
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 });
    }

    const { firstSigninToday } = await recordStaffLogin(pool, row.id);

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
      firstSigninToday,
      session: { sid: session.sid, deviceKind, expiresAt: session.expiresAt },
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
