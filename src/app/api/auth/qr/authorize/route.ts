import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { authorizeQrLoginSession, getQrLoginSessionByToken } from '@/lib/auth/qr-login';
import { getCurrentUser } from '@/lib/auth/current-user';
import { verifyStaffPin } from '@/lib/auth/pin';
import { audit } from '@/lib/auth/audit';
import pool from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-authorize',
    limit: 30,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
  }

  try {
    const qrSession = await getQrLoginSessionByToken(token);
    if (!qrSession) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (qrSession.status !== 'pending') {
      return NextResponse.json({ error: `SESSION_${qrSession.status.toUpperCase()}` }, { status: 400 });
    }

    let targetStaffId: number | null = null;
    let targetOrgId: string | null = null;
    let targetStaffName: string = '';
    let authMethodUsed = 'active_phone_session';

    // 1. Check if user is already signed in on phone
    const me = await getCurrentUser();
    if (me && me.staffId) {
      targetStaffId = me.staffId;
      targetOrgId = me.organizationId;
      targetStaffName = me.name;
    } else if (body.staffId && body.pin) {
      const staffId = Number(body.staffId);
      const pin = String(body.pin).trim();
      const staffRow = await pool.query<{ id: number; name: string; status: string; organization_id: string }>(
        `SELECT id, name, status, organization_id FROM staff WHERE id = $1 LIMIT 1`,
        [staffId],
      );
      const staff = staffRow.rows[0];
      if (!staff || staff.status !== 'active') {
        return NextResponse.json({ error: 'STAFF_NOT_ACTIVE' }, { status: 403 });
      }

      const verified = await verifyStaffPin(staffId, pin, staff.organization_id);
      targetStaffId = verified ? staff.id : null;
      targetOrgId = staff.organization_id;
      targetStaffName = staff.name;
      authMethodUsed = 'staff_pin';
    } else if (body.staffId && body.verified === true) {
      // 3. Authenticated via Face ID / Passkey verification
      const staffId = Number(body.staffId);
      const staffRow = await pool.query<{ id: number; name: string; status: string; organization_id: string }>(
        `SELECT id, name, status, organization_id FROM staff WHERE id = $1 LIMIT 1`,
        [staffId],
      );
      const staff = staffRow.rows[0];
      if (!staff || staff.status !== 'active') {
        return NextResponse.json({ error: 'STAFF_NOT_ACTIVE' }, { status: 403 });
      }
      targetStaffId = staff.id;
      targetOrgId = staff.organization_id;
      targetStaffName = staff.name;
      authMethodUsed = 'face_id_passkey';
    }

    if (!targetStaffId) {
      return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    }

    const authRes = await authorizeQrLoginSession(token, targetStaffId, targetOrgId);
    if (!authRes.ok) {
      return NextResponse.json({ error: authRes.error || 'AUTHORIZE_FAILED' }, { status: 400 });
    }

    await audit({
      staffId: targetStaffId,
      sid: null,
      event: 'signin.qr_phone_auth',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: {
        method: authMethodUsed,
        qrSessionId: qrSession.id,
        desktopIp: qrSession.ip,
      },
    });

    return NextResponse.json({
      ok: true,
      staffName: targetStaffName,
    });
  } catch (err) {
    console.error('[/api/auth/qr/authorize] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
